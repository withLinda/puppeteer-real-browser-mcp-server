#!/usr/bin/env node

/**
 * Claude Code MCP Server Test Runner
 * 
 * This script tests the puppeteer-real-browser MCP server through Claude Code CLI
 * instead of running the server directly.
 */

const { exec, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const execAsync = promisify(exec);

class ClaudeCodeTestRunner {
  constructor() {
    this.projectRoot = path.join(__dirname, '../..');
    this.serverName = 'puppeteer-test-server';
    this.testResults = [];
    this.logFile = `claude-code-test-${new Date().toISOString().replace(/:/g, '-')}.log`;
  }

  log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level}] ${message}`;
    console.log(logEntry);
    fs.appendFileSync(path.join(__dirname, 'test-logs', this.logFile), logEntry + '\n');
  }

  async runCommand(command) {
    this.log(`Executing: ${command}`, 'DEBUG');
    try {
      const { stdout, stderr } = await execAsync(command);
      if (stderr) {
        this.log(`Command stderr: ${stderr}`, 'DEBUG');
      }
      return { success: true, stdout, stderr };
    } catch (error) {
      this.log(`Command failed: ${error.message}`, 'ERROR');
      return { success: false, error: error.message };
    }
  }

  async setup() {
    this.log('Setting up Claude Code MCP server test environment');
    
    // Ensure the server is built
    this.log('Building MCP server...');
    const buildResult = await this.runCommand(`cd ${this.projectRoot} && npx tsc`);
    if (!buildResult.success) {
      throw new Error('Failed to build server');
    }
    
    // Remove any existing test server
    this.log('Removing any existing test server configuration...');
    await this.runCommand(`claude mcp remove ${this.serverName} 2>/dev/null || true`);
    
    // Add the MCP server
    this.log('Adding MCP server to Claude Code...');
    const serverPath = path.join(this.projectRoot, 'dist', 'index.js');
    const addResult = await this.runCommand(
      `claude mcp add ${this.serverName} -- node ${serverPath}`
    );
    
    if (!addResult.success) {
      throw new Error('Failed to add MCP server');
    }
    
    this.log('MCP server added successfully', 'SUCCESS');
  }

  async testServerStatus() {
    this.log('\\n=== Testing Server Status ===');
    
    // Check if server is listed
    const listResult = await this.runCommand('claude mcp list');
    if (listResult.success && listResult.stdout.includes(this.serverName)) {
      this.testResults.push({ test: 'Server Listed', status: 'PASSED' });
      this.log('✅ Server is listed in Claude Code', 'SUCCESS');
    } else {
      this.testResults.push({ test: 'Server Listed', status: 'FAILED' });
      this.log('❌ Server not found in list', 'ERROR');
    }
    
    // Get server details
    const getResult = await this.runCommand(`claude mcp get ${this.serverName}`);
    if (getResult.success) {
      this.testResults.push({ test: 'Server Details', status: 'PASSED' });
      this.log('✅ Server details retrieved', 'SUCCESS');
      this.log(`Server info: ${getResult.stdout}`, 'DEBUG');
    } else {
      this.testResults.push({ test: 'Server Details', status: 'FAILED' });
      this.log('❌ Failed to get server details', 'ERROR');
    }
  }

  async testWithClaudeCodePrompts() {
    this.log('\\n=== Testing Through Claude Code Prompts ===');
    
    // Create test prompt files
    const testPrompts = [
      {
        name: 'test-mcp-status.txt',
        content: '/mcp'
      },
      {
        name: 'test-browser-init.txt',
        content: `Use the ${this.serverName} MCP server to initialize a browser in headless mode and tell me if it succeeds.`
      },
      {
        name: 'test-navigation.txt',
        content: `Use the ${this.serverName} MCP server to:
1. Initialize a browser (headless)
2. Navigate to https://example.com
3. Take a screenshot
4. Close the browser
Report each step's success or failure.`
      }
    ];
    
    const promptsDir = path.join(__dirname, 'claude-prompts');
    if (!fs.existsSync(promptsDir)) {
      fs.mkdirSync(promptsDir);
    }
    
    for (const prompt of testPrompts) {
      const promptPath = path.join(promptsDir, prompt.name);
      fs.writeFileSync(promptPath, prompt.content);
      this.log(`Created test prompt: ${prompt.name}`, 'INFO');
    }
    
    this.log('\\nTest prompts created. To run tests:', 'INFO');
    this.log('1. Run: claude', 'INFO');
    this.log(`2. Type: @${promptsDir}/test-mcp-status.txt`, 'INFO');
    this.log('3. Check if the MCP server shows as connected', 'INFO');
    this.log('\\nThen test browser operations:', 'INFO');
    this.log(`4. Type: @${promptsDir}/test-browser-init.txt`, 'INFO');
    this.log(`5. Type: @${promptsDir}/test-navigation.txt`, 'INFO');
  }

  async createAutomatedTest() {
    this.log('\\n=== Creating Automated Test Script ===');
    
    const automatedTestScript = `#!/usr/bin/env node

/**
 * Automated MCP Server Test via Claude Code API
 * This script tests the MCP server by sending commands through Claude Code
 */

const { spawn } = require('child_process');
const fs = require('fs');

async function runAutomatedTest() {
  console.log('Starting automated MCP server test...');
  
  // Test commands to send to Claude Code
  const testCommands = [
    '/mcp',
    'List all available tools from the ${this.serverName} MCP server',
    'Use the ${this.serverName} MCP server to initialize a headless browser',
    'Use the ${this.serverName} MCP server to navigate to https://example.com and take a screenshot',
    'Use the ${this.serverName} MCP server to close the browser'
  ];
  
  // Create a test session with Claude Code
  const claude = spawn('claude', [], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  let output = '';
  let errors = '';
  
  claude.stdout.on('data', (data) => {
    output += data.toString();
    console.log('Claude:', data.toString());
  });
  
  claude.stderr.on('data', (data) => {
    errors += data.toString();
    console.error('Error:', data.toString());
  });
  
  // Send test commands
  for (const command of testCommands) {
    console.log('\\nSending:', command);
    claude.stdin.write(command + '\\n');
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for response
  }
  
  // Exit Claude
  claude.stdin.write('exit\\n');
  
  // Wait for Claude to close
  await new Promise((resolve) => {
    claude.on('close', resolve);
  });
  
  // Save results
  fs.writeFileSync('automated-test-results.txt', output);
  console.log('\\nTest complete. Results saved to automated-test-results.txt');
}

runAutomatedTest().catch(console.error);
`;
    
    const scriptPath = path.join(__dirname, 'automated-mcp-test.js');
    fs.writeFileSync(scriptPath, automatedTestScript);
    fs.chmodSync(scriptPath, '755');
    
    this.log(`Created automated test script: ${scriptPath}`, 'SUCCESS');
  }

  async generateReport() {
    this.log('\\n=== Test Summary ===');
    
    const passed = this.testResults.filter(r => r.status === 'PASSED').length;
    const failed = this.testResults.filter(r => r.status === 'FAILED').length;
    
    this.log(`Total Tests: ${this.testResults.length}`);
    this.log(`✅ Passed: ${passed}`);
    this.log(`❌ Failed: ${failed}`);
    
    const report = {
      timestamp: new Date().toISOString(),
      serverName: this.serverName,
      results: this.testResults,
      summary: { total: this.testResults.length, passed, failed }
    };
    
    const reportPath = path.join(__dirname, 'test-logs', `claude-code-test-report-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    this.log(`\\nDetailed report saved to: ${reportPath}`, 'INFO');
  }

  async cleanup() {
    this.log('\\n=== Cleanup ===');
    
    // Optionally remove the test server
    this.log('To remove the test server, run:');
    this.log(`claude mcp remove ${this.serverName}`);
  }

  async run() {
    try {
      // Ensure log directory exists
      const logDir = path.join(__dirname, 'test-logs');
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir);
      }
      
      await this.setup();
      await this.testServerStatus();
      await this.testWithClaudeCodePrompts();
      await this.createAutomatedTest();
      await this.generateReport();
      
      this.log('\\n✅ Claude Code test setup complete!', 'SUCCESS');
      this.log('\\nNext steps:', 'INFO');
      this.log('1. Run the automated test: node automated-mcp-test.js', 'INFO');
      this.log('2. Or manually test with: claude', 'INFO');
      this.log('   Then use the prompts in claude-prompts/ directory', 'INFO');
      
    } catch (error) {
      this.log(`Test runner failed: ${error.message}`, 'ERROR');
      process.exit(1);
    }
  }
}

// Run the test
const runner = new ClaudeCodeTestRunner();
runner.run();