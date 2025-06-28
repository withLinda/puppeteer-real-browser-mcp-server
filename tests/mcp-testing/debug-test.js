const { spawn } = require('child_process');
const path = require('path');

async function debugTest() {
  console.log('Debug test starting...\n');
  
  const serverPath = path.join(__dirname, '../../dist/index.js');
  const server = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  let buffer = '';
  
  server.stdout.on('data', (data) => {
    console.log('STDOUT:', data.toString());
    buffer += data.toString();
  });
  
  server.stderr.on('data', (data) => {
    console.log('STDERR:', data.toString());
  });
  
  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Send initialize
  const request = JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'debug', version: '1.0' }
    }
  }) + '\n';
  
  console.log('\nSending:', request);
  server.stdin.write(request);
  
  // Wait for response
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  console.log('\nBuffer contents:', buffer);
  console.log('\nBuffer lines:', buffer.split('\n'));
  
  // Send tools/list
  const toolsRequest = JSON.stringify({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {}
  }) + '\n';
  
  console.log('\nSending tools/list:', toolsRequest);
  server.stdin.write(toolsRequest);
  
  // Wait for response
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  console.log('\nFinal buffer:', buffer);
  
  server.kill();
}

debugTest().catch(console.error);