import { ChildProcess } from 'child_process';

/**
 * Test utilities for MCP server integration tests
 * Converts callback-based tests to Promise-based for Vitest
 */

export interface MCPResponse {
  jsonrpc: string;
  id: number;
  result?: any;
  error?: any;
}

export interface MCPRequest {
  jsonrpc: string;
  id: number;
  method: string;
  params: any;
}

/**
 * Wait for server to start up by monitoring stderr output
 */
export function waitForServerStartup(serverProcess: ChildProcess, timeoutMs: number = 10000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Server did not start within ${timeoutMs}ms`));
    }, timeoutMs);

    serverProcess.stderr?.on('data', (data) => {
      const output = data.toString();
      if (output.includes('Puppeteer Real Browser MCP Server started successfully')) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });
}

/**
 * Send an MCP request and wait for a response
 */
export function sendMCPRequest(
  serverProcess: ChildProcess, 
  request: MCPRequest, 
  timeoutMs: number = 10000
): Promise<MCPResponse> {
  return new Promise((resolve, reject) => {
    const message = JSON.stringify(request) + '\n';
    let responseReceived = false;

    const timeout = setTimeout(() => {
      if (!responseReceived) {
        reject(new Error(`No response received for request ${request.id} within ${timeoutMs}ms`));
      }
    }, timeoutMs);

    const dataHandler = (data: Buffer) => {
      const lines = data.toString().split('\n').filter((line: string) => line.trim());
      
      lines.forEach((line: string) => {
        try {
          const response = JSON.parse(line);
          if (response.id === request.id) {
            responseReceived = true;
            clearTimeout(timeout);
            serverProcess.stdout?.removeListener('data', dataHandler);
            resolve(response);
          }
        } catch (e) {
          // Ignore non-JSON lines
        }
      });
    };

    serverProcess.stdout?.on('data', dataHandler);

    // Wait for server to be ready, then send the request
    waitForServerStartup(serverProcess).then(() => {
      serverProcess.stdin?.write(message);
    }).catch(reject);
  });
}

/**
 * Monitor stdout for invalid (non-JSON) output
 */
export function monitorStdoutOutput(
  serverProcess: ChildProcess, 
  durationMs: number = 2000
): Promise<boolean> {
  return new Promise((resolve) => {
    let hasInvalidOutput = false;

    const dataHandler = (data: Buffer) => {
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
    };

    serverProcess.stdout?.on('data', dataHandler);

    setTimeout(() => {
      serverProcess.stdout?.removeListener('data', dataHandler);
      resolve(hasInvalidOutput);
    }, durationMs);
  });
}

/**
 * Test sequence for workflow validation
 */
export async function testWorkflowSequence(
  serverProcess: ChildProcess,
  sequence: MCPRequest[]
): Promise<MCPResponse[]> {
  await waitForServerStartup(serverProcess);
  
  const responses: MCPResponse[] = [];
  
  for (const request of sequence) {
    const response = await sendMCPRequest(serverProcess, request);
    responses.push(response);
  }
  
  return responses;
}

/**
 * Create an MCP request builder for easier test construction
 */
export class MCPRequestBuilder {
  private request: Partial<MCPRequest> = {
    jsonrpc: '2.0'
  };

  id(id: number): MCPRequestBuilder {
    this.request.id = id;
    return this;
  }

  method(method: string): MCPRequestBuilder {
    this.request.method = method;
    return this;
  }

  params(params: any): MCPRequestBuilder {
    this.request.params = params;
    return this;
  }

  build(): MCPRequest {
    if (!this.request.id || !this.request.method) {
      throw new Error('Request must have id and method');
    }
    return this.request as MCPRequest;
  }
}

/**
 * Helper to create common MCP requests
 */
export const createMCPRequest = {
  toolsList: (id: number): MCPRequest => 
    new MCPRequestBuilder().id(id).method('tools/list').params({}).build(),
    
  resourcesList: (id: number): MCPRequest => 
    new MCPRequestBuilder().id(id).method('resources/list').params({}).build(),
    
  promptsList: (id: number): MCPRequest => 
    new MCPRequestBuilder().id(id).method('prompts/list').params({}).build(),
    
  toolCall: (id: number, name: string, args: any): MCPRequest => 
    new MCPRequestBuilder().id(id).method('tools/call').params({ name, arguments: args }).build(),
};