import { spawn } from 'child_process';

async function testServer() {
  console.log('Starting MCP server test...');
  
  // Start the server
  const server = spawn('npm', ['run', 'dev'], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // Send test commands
  const testCommands = [
    {
      jsonrpc: '2.0',
      method: 'tools/list',
      id: 1,
    },
    {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: 'browser_init',
        arguments: { headless: false },
      },
      id: 2,
    },
  ];

  for (const cmd of testCommands) {
    server.stdin.write(JSON.stringify(cmd) + '\n');
  }

  // Handle responses
  server.stdout.on('data', (data) => {
    console.log('Response:', data.toString());
  });

  server.stderr.on('data', (data) => {
    console.error('Error:', data.toString());
  });
}

testServer();