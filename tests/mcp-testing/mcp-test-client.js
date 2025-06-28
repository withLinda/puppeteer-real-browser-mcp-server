const { spawn } = require('child_process');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class MCPTestClient {
  constructor(logger) {
    this.logger = logger;
    this.process = null;
    this.requestId = 1;
    this.pendingRequests = new Map();
    this.buffer = '';
  }

  async start() {
    return new Promise((resolve, reject) => {
      const serverPath = path.join(__dirname, '../../dist/index.js');
      
      this.logger.log(`Starting MCP server at: ${serverPath}`, 'INFO');
      
      this.process = spawn('node', [serverPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, NODE_ENV: 'test' }
      });

      this.process.stdout.on('data', (data) => {
        this.handleStdout(data);
      });
      
      this.process.stdout.on('error', (error) => {
        this.logger.log(`Stdout error: ${error.message}`, 'ERROR');
      });

      this.process.stderr.on('data', (data) => {
        this.logger.log(`Server stderr: ${data.toString()}`, 'DEBUG');
      });

      this.process.on('error', (error) => {
        this.logger.log(`Server process error: ${error.message}`, 'ERROR');
        reject(error);
      });

      this.process.on('close', (code) => {
        this.logger.log(`Server process closed with code: ${code}`, 'INFO');
      });
      
      this.process.on('exit', (code) => {
        this.logger.log(`Server process exited with code: ${code}`, 'INFO');
      });

      // Wait a bit for server to start
      setTimeout(() => {
        this.logger.log('MCP server started', 'SUCCESS');
        resolve();
      }, 2000);
    });
  }

  handleStdout(data) {
    const chunk = data.toString();
    this.logger.log(`Server stdout chunk: ${chunk}`, 'DEBUG');
    this.buffer += chunk;
    
    // Process complete JSON-RPC messages
    const lines = this.buffer.split('\\n');
    this.buffer = lines.pop() || '';
    
    for (const line of lines) {
      if (line.trim()) {
        try {
          const message = JSON.parse(line);
          this.logger.log(`Parsed message: ${JSON.stringify(message)}`, 'DEBUG');
          this.handleMessage(message);
        } catch (e) {
          this.logger.log(`Failed to parse JSON-RPC message: ${line}`, 'ERROR');
        }
      }
    }
  }

  handleMessage(message) {
    this.logger.log(`Handling message with id: ${message.id}`, 'DEBUG');
    if (message.id && this.pendingRequests.has(message.id)) {
      const { resolve, reject } = this.pendingRequests.get(message.id);
      this.pendingRequests.delete(message.id);
      
      if (message.error) {
        reject(new Error(message.error.message || 'Unknown error'));
      } else {
        resolve(message.result);
      }
    } else {
      this.logger.log(`No pending request for message id: ${message.id}`, 'DEBUG');
    }
  }

  async sendRequest(method, params = {}) {
    const id = this.requestId++;
    const request = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      let timeout;
      
      const wrappedResolve = (result) => {
        if (timeout) clearTimeout(timeout);
        resolve(result);
      };
      
      const wrappedReject = (error) => {
        if (timeout) clearTimeout(timeout);
        reject(error);
      };
      
      this.pendingRequests.set(id, { resolve: wrappedResolve, reject: wrappedReject });
      
      timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        this.logger.log(`Request timeout for ${method}, buffer: ${this.buffer}`, 'DEBUG');
        reject(new Error(`Request timeout for method: ${method}`));
      }, 30000);

      try {
        this.process.stdin.write(JSON.stringify(request) + '\\n');
        this.logger.log(`Sent request: ${method} with id ${id}`, 'DEBUG');
      } catch (error) {
        clearTimeout(timeout);
        this.pendingRequests.delete(id);
        reject(error);
      }
    });
  }

  async callTool(toolName, args = {}) {
    return this.sendRequest('tools/call', {
      name: toolName,
      arguments: args
    });
  }

  async listTools() {
    return this.sendRequest('tools/list');
  }

  async listResources() {
    return this.sendRequest('resources/list');
  }

  async listPrompts() {
    return this.sendRequest('prompts/list');
  }

  async initialize() {
    return this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        experimental: {},
        sampling: {},
        tools: {}
      },
      clientInfo: {
        name: 'mcp-test-client',
        version: '1.0.0'
      }
    });
  }

  async stop() {
    if (this.process) {
      this.process.kill();
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

module.exports = MCPTestClient;