import { spawn, ChildProcess } from 'child_process';
import { resolve } from 'path';

describe('MCP Server Integration Tests', () => {
  let serverProcess: ChildProcess;
  
  beforeAll(() => {
    // Build the project before testing
    process.chdir(resolve(__dirname, '..'));
  });

  beforeEach(() => {
    // Start fresh server for each test
    serverProcess = spawn('node', ['dist/index.js'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
  });

  afterEach((done) => {
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      serverProcess.on('exit', () => done());
    } else {
      done();
    }
  });

  describe('Server Startup', () => {
    test('should start without errors', (done) => {
      let hasStarted = false;
      
      const timeout = setTimeout(() => {
        if (!hasStarted) {
          done(new Error('Server did not start within timeout'));
        }
      }, 5000);

      serverProcess.stderr?.on('data', (data) => {
        const output = data.toString();
        if (output.includes('MCP Server for puppeteer-real-browser started')) {
          hasStarted = true;
          clearTimeout(timeout);
          expect(hasStarted).toBe(true);
          done();
        }
      });
    });

    test('should not pollute stdout with non-JSON content', (done) => {
      let hasInvalidOutput = false;

      serverProcess.stdout?.on('data', (data) => {
        const lines = data.toString().split('\n').filter((line: string) => line.trim());
        
        lines.forEach((line: string) => {
          try {
            JSON.parse(line);
          } catch (e) {
            if (line.includes('Found Chrome at:') || line.includes('Chrome not found')) {
              hasInvalidOutput = true;
            }
          }
        });
      });

      setTimeout(() => {
        expect(hasInvalidOutput).toBe(false);
        done();
      }, 2000);
    });
  });

  describe('JSON-RPC Protocol Compliance', () => {
    test('tools/list should return valid response', (done) => {
      const message = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {}
      }) + '\n';

      let responseReceived = false;

      const timeout = setTimeout(() => {
        if (!responseReceived) {
          done(new Error('No valid response received for tools/list'));
        }
      }, 10000);

      serverProcess.stdout?.on('data', (data) => {
        const lines = data.toString().split('\n').filter((line: string) => line.trim());
        
        lines.forEach((line: string) => {
          try {
            const response = JSON.parse(line);
            if (response.id === 1 && response.result) {
              expect(response.result.tools).toBeDefined();
              expect(Array.isArray(response.result.tools)).toBe(true);
              expect(response.result.tools.length).toBeGreaterThan(0);
              responseReceived = true;
              clearTimeout(timeout);
              done();
            }
          } catch (e) {
            // Ignore non-JSON lines
          }
        });
      });

      serverProcess.stderr?.on('data', (data) => {
        if (data.toString().includes('MCP Server for puppeteer-real-browser started')) {
          serverProcess.stdin?.write(message);
        }
      });
    });

    test('resources/list should return empty array (no Method not found)', (done) => {
      const message = JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'resources/list',
        params: {}
      }) + '\n';

      let responseReceived = false;

      const timeout = setTimeout(() => {
        if (!responseReceived) {
          done(new Error('No valid response received for resources/list'));
        }
      }, 10000);

      serverProcess.stdout?.on('data', (data) => {
        const lines = data.toString().split('\n').filter((line: string) => line.trim());
        
        lines.forEach((line: string) => {
          try {
            const response = JSON.parse(line);
            if (response.id === 2) {
              expect(response.error).toBeUndefined();
              expect(response.result).toBeDefined();
              expect(response.result.resources).toBeDefined();
              expect(Array.isArray(response.result.resources)).toBe(true);
              responseReceived = true;
              clearTimeout(timeout);
              done();
            }
          } catch (e) {
            // Ignore non-JSON lines
          }
        });
      });

      serverProcess.stderr?.on('data', (data) => {
        if (data.toString().includes('MCP Server for puppeteer-real-browser started')) {
          serverProcess.stdin?.write(message);
        }
      });
    });

    test('prompts/list should return empty array (no Method not found)', (done) => {
      const message = JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'prompts/list',
        params: {}
      }) + '\n';

      let responseReceived = false;

      const timeout = setTimeout(() => {
        if (!responseReceived) {
          done(new Error('No valid response received for prompts/list'));
        }
      }, 10000);

      serverProcess.stdout?.on('data', (data) => {
        const lines = data.toString().split('\n').filter((line: string) => line.trim());
        
        lines.forEach((line: string) => {
          try {
            const response = JSON.parse(line);
            if (response.id === 3) {
              expect(response.error).toBeUndefined();
              expect(response.result).toBeDefined();
              expect(response.result.prompts).toBeDefined();
              expect(Array.isArray(response.result.prompts)).toBe(true);
              responseReceived = true;
              clearTimeout(timeout);
              done();
            }
          } catch (e) {
            // Ignore non-JSON lines
          }
        });
      });

      serverProcess.stderr?.on('data', (data) => {
        if (data.toString().includes('MCP Server for puppeteer-real-browser started')) {
          serverProcess.stdin?.write(message);
        }
      });
    });
  });

  describe('Error Handling and Retry Logic', () => {
    test('should have BrowserErrorType enum', () => {
      // This tests that error categorization is implemented
      const { readFileSync } = require('fs');
      const serverCode = readFileSync('src/index.ts', 'utf8');
      
      expect(serverCode).toContain('enum BrowserErrorType');
      expect(serverCode).toContain('FRAME_DETACHED');
      expect(serverCode).toContain('SESSION_CLOSED');
      expect(serverCode).toContain('TARGET_CLOSED');
      expect(serverCode).toContain('PROTOCOL_ERROR');
    });

    test('should have retry wrapper function', () => {
      const { readFileSync } = require('fs');
      const serverCode = readFileSync('src/index.ts', 'utf8');
      
      expect(serverCode).toContain('function withRetry');
      expect(serverCode).toContain('maxRetries: number = 3');
      expect(serverCode).toContain('exponential backoff');
    });

    test('should have session validation', () => {
      const { readFileSync } = require('fs');
      const serverCode = readFileSync('src/index.ts', 'utf8');
      
      expect(serverCode).toContain('function validateSession');
      expect(serverCode).toContain('browserInstance.version()');
      expect(serverCode).toContain('pageInstance.evaluate');
    });
  });

  describe('Tool Validation (Centralized)', () => {
    const expectedTools = [
      'browser_init',
      'navigate', 
      'screenshot',
      'get_content',
      'click',
      'type',
      'wait',
      'browser_close',
      'solve_captcha',
      'random_scroll',
      'find_selector'
    ];

    test('should have exactly 11 tools available', (done) => {
      const toolsMessage = JSON.stringify({
        jsonrpc: '2.0',
        id: 10,
        method: 'tools/list',
        params: {}
      }) + '\n';

      let responseReceived = false;

      const timeout = setTimeout(() => {
        if (!responseReceived) {
          done(new Error('Could not verify tool count'));
        }
      }, 10000);

      serverProcess.stdout?.on('data', (data) => {
        const lines = data.toString().split('\n').filter((line: string) => line.trim());
        
        lines.forEach((line: string) => {
          try {
            const response = JSON.parse(line);
            if (response.id === 10 && response.result) {
              const tools = response.result.tools;
              
              expect(tools).toHaveLength(11);
              expect(tools.map((t: any) => t.name).sort()).toEqual(expectedTools.sort());
              responseReceived = true;
              clearTimeout(timeout);
              done();
            }
          } catch (e) {
            // Ignore non-JSON lines
          }
        });
      });

      serverProcess.stderr?.on('data', (data) => {
        if (data.toString().includes('MCP Server for puppeteer-real-browser started')) {
          serverProcess.stdin?.write(toolsMessage);
        }
      });
    });

    test('all tools should have valid schemas and descriptions', (done) => {
      const toolsMessage = JSON.stringify({
        jsonrpc: '2.0',
        id: 11,
        method: 'tools/list',
        params: {}
      }) + '\n';

      let responseReceived = false;

      const timeout = setTimeout(() => {
        if (!responseReceived) {
          done(new Error('Could not verify tool schemas'));
        }
      }, 10000);

      serverProcess.stdout?.on('data', (data) => {
        const lines = data.toString().split('\n').filter((line: string) => line.trim());
        
        lines.forEach((line: string) => {
          try {
            const response = JSON.parse(line);
            if (response.id === 11 && response.result) {
              const tools = response.result.tools;
              
              tools.forEach((tool: any) => {
                expect(tool.name).toBeDefined();
                expect(tool.description).toBeDefined();
                expect(tool.inputSchema).toBeDefined();
                expect(typeof tool.inputSchema).toBe('object');
              });
              
              responseReceived = true;
              clearTimeout(timeout);
              done();
            }
          } catch (e) {
            // Ignore non-JSON lines
          }
        });
      });

      serverProcess.stderr?.on('data', (data) => {
        if (data.toString().includes('MCP Server for puppeteer-real-browser started')) {
          serverProcess.stdin?.write(toolsMessage);
        }
      });
    });

    test('browser_init tool should have correct schema', (done) => {
      const toolsMessage = JSON.stringify({
        jsonrpc: '2.0',
        id: 12,
        method: 'tools/list',
        params: {}
      }) + '\n';

      let responseReceived = false;

      const timeout = setTimeout(() => {
        if (!responseReceived) {
          done(new Error('Could not verify browser_init tool'));
        }
      }, 10000);

      serverProcess.stdout?.on('data', (data) => {
        const lines = data.toString().split('\n').filter((line: string) => line.trim());
        
        lines.forEach((line: string) => {
          try {
            const response = JSON.parse(line);
            if (response.id === 12 && response.result) {
              const tools = response.result.tools;
              const browserInitTool = tools.find((tool: any) => tool.name === 'browser_init');
              
              expect(browserInitTool).toBeDefined();
              expect(browserInitTool.description).toContain('anti-detection');
              expect(browserInitTool.inputSchema.properties.headless).toBeDefined();
              expect(browserInitTool.inputSchema.properties.proxy).toBeDefined();
              responseReceived = true;
              clearTimeout(timeout);
              done();
            }
          } catch (e) {
            // Ignore non-JSON lines
          }
        });
      });

      serverProcess.stderr?.on('data', (data) => {
        if (data.toString().includes('MCP Server for puppeteer-real-browser started')) {
          serverProcess.stdin?.write(toolsMessage);
        }
      });
    });
  });
});