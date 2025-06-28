const { spawn } = require('child_process');
const path = require('path');

async function testDirect() {
  console.log('Testing MCP server directly...\n');
  
  const serverPath = path.join(__dirname, '../../dist/index.js');
  console.log('Server path:', serverPath);
  
  const server = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  let output = '';
  let errors = '';
  
  server.stdout.on('data', (data) => {
    output += data.toString();
    console.log('STDOUT:', data.toString());
  });
  
  server.stderr.on('data', (data) => {
    errors += data.toString();
    console.log('STDERR:', data.toString());
  });
  
  server.on('error', (error) => {
    console.error('Server error:', error);
  });
  
  // Send initialize request
  const initRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'test-client',
        version: '1.0.0'
      }
    }
  };
  
  setTimeout(() => {
    console.log('\nSending initialize request...');
    server.stdin.write(JSON.stringify(initRequest) + '\n');
  }, 1000);
  
  // Wait for response
  setTimeout(() => {
    console.log('\nFinal output:', output);
    console.log('Final errors:', errors);
    server.kill();
    process.exit(0);
  }, 5000);
}

testDirect();