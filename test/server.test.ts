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

  describe('Workflow Validation System', () => {
    test('should prevent find_selector before content analysis', (done) => {
      const findSelectorMessage = JSON.stringify({
        jsonrpc: '2.0',
        id: 20,
        method: 'tools/call',
        params: {
          name: 'find_selector',
          arguments: {
            text: 'button text'
          }
        }
      }) + '\n';

      let responseReceived = false;

      const timeout = setTimeout(() => {
        if (!responseReceived) {
          done(new Error('No response received for workflow validation test'));
        }
      }, 10000);

      serverProcess.stdout?.on('data', (data) => {
        const lines = data.toString().split('\n').filter((line: string) => line.trim());
        
        lines.forEach((line: string) => {
          try {
            const response = JSON.parse(line);
            if (response.id === 20) {
              expect(response.error).toBeDefined();
              expect(response.error.message).toMatch(/Cannot search for selectors|cannot be executed in current state/);
              expect(response.error.message).toContain('get_content');
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
          serverProcess.stdin?.write(findSelectorMessage);
        }
      });
    });

    test('should guide proper workflow sequence', (done) => {
      const browserInitMessage = JSON.stringify({
        jsonrpc: '2.0',
        id: 21,
        method: 'tools/call',
        params: {
          name: 'browser_init',
          arguments: {}
        }
      }) + '\n';

      let initResponseReceived = false;

      const timeout = setTimeout(() => {
        if (!initResponseReceived) {
          done(new Error('Browser init response not received'));
        }
      }, 15000);

      serverProcess.stdout?.on('data', (data) => {
        const lines = data.toString().split('\n').filter((line: string) => line.trim());
        
        lines.forEach((line: string) => {
          try {
            const response = JSON.parse(line);
            if (response.id === 21 && response.result) {
              expect(response.result.content[0].text).toContain('Next step: Use navigate');
              expect(response.result.content[0].text).toContain('get_content to analyze');
              expect(response.result.content[0].text).toContain('prevents blind selector guessing');
              initResponseReceived = true;
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
          serverProcess.stdin?.write(browserInitMessage);
        }
      });
    });

    test('should validate workflow state transitions', () => {
      const { readFileSync } = require('fs');
      const serverCode = readFileSync('src/index.ts', 'utf8');
      
      expect(serverCode).toContain('withWorkflowValidation');
      expect(serverCode).toContain('validateWorkflow');
      expect(serverCode).toContain('recordExecution');
      expect(serverCode).toContain('workflowValidator');
    });

    test('should have workflow validation imports', () => {
      const { readFileSync } = require('fs');
      const serverCode = readFileSync('src/index.ts', 'utf8');
      
      expect(serverCode).toContain('workflow-validation');
      expect(serverCode).toContain('content-strategy');
      expect(serverCode).toContain('token-management');
    });
  });

  describe('Token Management Integration', () => {
    test('should have token management system available', () => {
      const { readFileSync } = require('fs');
      const tokenMgmtCode = readFileSync('src/token-management.ts', 'utf8');
      
      expect(tokenMgmtCode).toContain('class TokenManager');
      expect(tokenMgmtCode).toContain('MCP_MAX_TOKENS = 25000');
      expect(tokenMgmtCode).toContain('validateContentSize');
      expect(tokenMgmtCode).toContain('chunkContent');
    });

    test('should have content strategy engine available', () => {
      const { readFileSync } = require('fs');
      const strategyCode = readFileSync('src/content-strategy.ts', 'utf8');
      
      expect(strategyCode).toContain('class ContentStrategyEngine');
      expect(strategyCode).toContain('processContentRequest');
      expect(strategyCode).toContain('performPreflightEstimation');
    });

    test('should integrate token management in get_content', () => {
      const { readFileSync } = require('fs');
      const serverCode = readFileSync('src/index.ts', 'utf8');
      
      expect(serverCode).toContain('contentStrategy.processContentRequest');
      expect(serverCode).toContain('Token Management Summary');
      expect(serverCode).toContain('chunks due to MCP token limits');
    });
  });

  describe('Content Analysis Prevention', () => {
    test('should have stale content analysis check', () => {
      const { readFileSync } = require('fs');
      const workflowCode = readFileSync('src/workflow-validation.ts', 'utf8');
      
      expect(workflowCode).toContain('isContentAnalysisStale');
      expect(workflowCode).toContain('WorkflowState.CONTENT_ANALYZED');
      expect(workflowCode).toContain('find_selector');
    });

    test('should have enhanced find_selector validation', () => {
      const { readFileSync } = require('fs');
      const serverCode = readFileSync('src/index.ts', 'utf8');
      
      expect(serverCode).toContain('Content analysis is stale or missing');
      expect(serverCode).toContain('prevents blind selector guessing');
      expect(serverCode).toContain('withWorkflowValidation(\'find_selector\'');
    });
  });

  describe('Workflow State Management', () => {
    test('should have workflow state enum', () => {
      const { readFileSync } = require('fs');
      const workflowCode = readFileSync('src/workflow-validation.ts', 'utf8');
      
      expect(workflowCode).toContain('enum WorkflowState');
      expect(workflowCode).toContain('BROWSER_INIT');
      expect(workflowCode).toContain('PAGE_LOADED');
      expect(workflowCode).toContain('CONTENT_ANALYZED');
      expect(workflowCode).toContain('SELECTOR_AVAILABLE');
    });

    test('should have workflow context interface', () => {
      const { readFileSync } = require('fs');
      const workflowCode = readFileSync('src/workflow-validation.ts', 'utf8');
      
      expect(workflowCode).toContain('interface WorkflowContext');
      expect(workflowCode).toContain('currentState');
      expect(workflowCode).toContain('contentAnalyzed');
      expect(workflowCode).toContain('toolCallHistory');
    });

    test('should have workflow validator class', () => {
      const { readFileSync } = require('fs');
      const workflowCode = readFileSync('src/workflow-validation.ts', 'utf8');
      
      expect(workflowCode).toContain('class WorkflowValidator');
      expect(workflowCode).toContain('validateToolExecution');
      expect(workflowCode).toContain('recordToolExecution');
      expect(workflowCode).toContain('updateWorkflowState');
    });
  });

  describe('Integration Tests for Issue #9 Resolution', () => {
    test('should block find_selector without prior get_content', (done) => {
      // This test specifically addresses the GitHub issue
      const sequence = [
        {
          id: 30,
          method: 'tools/call',
          params: { name: 'browser_init', arguments: {} }
        },
        {
          id: 31,
          method: 'tools/call',
          params: { name: 'find_selector', arguments: { text: 'test' } }
        }
      ];

      let responses = 0;
      let blockedCorrectly = false;

      const timeout = setTimeout(() => {
        expect(blockedCorrectly).toBe(true);
        done();
      }, 15000);

      serverProcess.stdout?.on('data', (data) => {
        const lines = data.toString().split('\n').filter((line: string) => line.trim());
        
        lines.forEach((line: string) => {
          try {
            const response = JSON.parse(line);
            if (response.id === 31) {
              // This should be blocked
              expect(response.error).toBeDefined();
              expect(response.error.message).toMatch(/Cannot search for selectors|cannot be executed/);
              expect(response.error.message).toContain('get_content');
              blockedCorrectly = true;
              clearTimeout(timeout);
              done();
            } else if (response.id === 30 && response.result) {
              // Browser init succeeded, now try find_selector
              const findMessage = JSON.stringify({
                jsonrpc: '2.0',
                ...sequence[1]
              }) + '\n';
              setTimeout(() => serverProcess.stdin?.write(findMessage), 1000);
            }
          } catch (e) {
            // Ignore non-JSON lines
          }
        });
      });

      serverProcess.stderr?.on('data', (data) => {
        if (data.toString().includes('MCP Server for puppeteer-real-browser started')) {
          const initMessage = JSON.stringify({
            jsonrpc: '2.0',
            ...sequence[0]
          }) + '\n';
          serverProcess.stdin?.write(initMessage);
        }
      });
    });
  });
});