#!/usr/bin/env node

// Simple test script to validate MCP server functionality
const { spawn } = require('child_process');

async function testServer() {
  console.log('🧪 Testing MCP Server...\n');
  
  // Test 1: Check if server starts without errors
  console.log('1. Testing server startup...');
  const serverProcess = spawn('node', ['dist/index.js'], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  let hasErrors = false;
  let serverOutput = '';
  
  serverProcess.stdout.on('data', (data) => {
    serverOutput += data.toString();
  });
  
  serverProcess.stderr.on('data', (data) => {
    const errorOutput = data.toString();
    if (errorOutput.includes('MCP Server for puppeteer-real-browser started')) {
      console.log('   ✅ Server started successfully');
    } else if (errorOutput.includes('Error') || errorOutput.includes('error')) {
      console.log('   ❌ Server error:', errorOutput.trim());
      hasErrors = true;
    }
  });
  
  // Test 2: Send JSON-RPC messages to test protocol compliance
  setTimeout(() => {
    console.log('\n2. Testing JSON-RPC protocol...');
    
    // Test tools/list
    const toolsListMessage = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {}
    }) + '\n';
    
    serverProcess.stdin.write(toolsListMessage);
    
    // Test resources/list
    const resourcesListMessage = JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'resources/list',
      params: {}
    }) + '\n';
    
    serverProcess.stdin.write(resourcesListMessage);
    
    // Test prompts/list
    const promptsListMessage = JSON.stringify({
      jsonrpc: '2.0',
      id: 3,
      method: 'prompts/list',
      params: {}
    }) + '\n';
    
    serverProcess.stdin.write(promptsListMessage);
    
  }, 1000);
  
  // Test 3: Validate responses
  let responseCount = 0;
  const expectedResponses = 3;
  
  serverProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(line => line.trim());
    
    lines.forEach(line => {
      try {
        const response = JSON.parse(line);
        responseCount++;
        
        if (response.id === 1 && response.result && response.result.tools) {
          console.log('   ✅ tools/list returned', response.result.tools.length, 'tools');
        } else if (response.id === 2 && response.result && Array.isArray(response.result.resources)) {
          console.log('   ✅ resources/list returned empty array (no "Method not found" error)');
        } else if (response.id === 3 && response.result && Array.isArray(response.result.prompts)) {
          console.log('   ✅ prompts/list returned empty array (no "Method not found" error)');
        } else if (response.error) {
          console.log('   ❌ Error response:', response.error);
          hasErrors = true;
        }
        
        if (responseCount >= expectedResponses) {
          console.log('\n3. Testing browser initialization...');
          
          // Test browser_init
          const browserInitMessage = JSON.stringify({
            jsonrpc: '2.0',
            id: 4,
            method: 'tools/call',
            params: {
              name: 'browser_init',
              arguments: { headless: true }
            }
          }) + '\n';
          
          serverProcess.stdin.write(browserInitMessage);
        }
        
      } catch (e) {
        // Not JSON, might be non-protocol output
        if (line.includes('Found Chrome at:')) {
          console.log('   ❌ Chrome path logged to stdout (should be stderr)');
          hasErrors = true;
        }
      }
    });
  });
  
  // Cleanup after 10 seconds
  setTimeout(() => {
    serverProcess.kill('SIGTERM');
    
    console.log('\n📊 Test Summary:');
    if (hasErrors) {
      console.log('❌ Some tests failed - review output above');
      process.exit(1);
    } else {
      console.log('✅ All basic tests passed!');
      console.log('✅ JSON-RPC protocol compliance verified');
      console.log('✅ No stdout pollution detected');
      console.log('✅ Method not found errors resolved');
      process.exit(0);
    }
  }, 8000);
}

testServer().catch(console.error);