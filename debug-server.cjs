#!/usr/bin/env node

/**
 * Debug Server - Quick diagnostic tool for troubleshooting MCP server issues
 * 
 * This script provides focused debugging information not covered by other tests:
 * - Environment validation
 * - Platform-specific Chrome detection with detailed paths
 * - Quick server health check
 * - Network connectivity validation
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

class ServerDebugger {
  constructor() {
    this.results = {
      environment: {},
      chrome: {},
      server: {},
      network: {}
    };
  }

  async runAll() {
    console.log('🔍 MCP Server Debug Diagnostics\n');
    console.log('=' .repeat(50));
    
    await this.checkEnvironment();
    await this.checkChromeInstallation();
    await this.quickServerCheck();
    await this.checkNetworkConnectivity();
    
    this.printSummary();
  }

  async checkEnvironment() {
    console.log('\n📋 Environment Check');
    console.log('-'.repeat(30));
    
    const nodeVersion = process.version;
    const platform = process.platform;
    const arch = process.arch;
    const memory = Math.round(os.totalmem() / 1024 / 1024 / 1024);
    
    this.results.environment = { nodeVersion, platform, arch, memory };
    
    console.log(`✓ Node.js: ${nodeVersion}`);
    console.log(`✓ Platform: ${platform} (${arch})`);
    console.log(`✓ Memory: ${memory}GB`);
    
    // Check if dist exists
    const distExists = fs.existsSync('dist/index.js');
    console.log(`${distExists ? '✓' : '❌'} Build: dist/index.js ${distExists ? 'exists' : 'missing'}`);
    this.results.environment.built = distExists;
  }

  async checkChromeInstallation() {
    console.log('\n🌐 Chrome Installation Check');
    console.log('-'.repeat(30));
    
    const platform = process.platform;
    let possiblePaths = [];
    
    switch (platform) {
      case 'win32':
        possiblePaths = [
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
          path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe')
        ];
        break;
      case 'darwin':
        possiblePaths = [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Chromium.app/Contents/MacOS/Chromium'
        ];
        break;
      case 'linux':
        possiblePaths = [
          '/usr/bin/google-chrome',
          '/usr/bin/google-chrome-stable',
          '/usr/bin/chromium-browser',
          '/snap/bin/chromium'
        ];
        break;
    }
    
    const foundPaths = possiblePaths.filter(p => fs.existsSync(p));
    
    if (foundPaths.length > 0) {
      console.log(`✓ Chrome found at: ${foundPaths[0]}`);
      if (foundPaths.length > 1) {
        console.log(`  Additional installs: ${foundPaths.slice(1).join(', ')}`);
      }
      this.results.chrome.available = true;
      this.results.chrome.paths = foundPaths;
    } else {
      console.log('❌ No Chrome installation found');
      console.log('  Searched paths:', possiblePaths.join('\n    '));
      this.results.chrome.available = false;
    }
  }

  async quickServerCheck() {
    console.log('\n⚡ Quick Server Health Check');
    console.log('-'.repeat(30));
    
    if (!this.results.environment.built) {
      console.log('❌ Cannot test server - dist/index.js not found');
      console.log('   Run: npx tsc');
      return;
    }
    
    const startTime = Date.now();
    const serverProcess = spawn('node', ['dist/index.js'], {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let hasStarted = false;
    let hasErrors = false;
    
    const timeout = setTimeout(() => {
      if (!hasStarted) {
        console.log('❌ Server startup timeout (5s)');
        serverProcess.kill();
      }
    }, 5000);
    
    return new Promise((resolve) => {
      serverProcess.stderr.on('data', (data) => {
        const output = data.toString();
        if (output.includes('Puppeteer Real Browser MCP Server started successfully')) {
          const startupTime = Date.now() - startTime;
          console.log(`✓ Server started successfully (${startupTime}ms)`);
          hasStarted = true;
          clearTimeout(timeout);
          serverProcess.kill();
          this.results.server.startup = true;
          this.results.server.startupTime = startupTime;
          resolve();
        }
      });
      
      serverProcess.on('error', (error) => {
        console.log(`❌ Server error: ${error.message}`);
        hasErrors = true;
        this.results.server.startup = false;
        this.results.server.error = error.message;
        clearTimeout(timeout);
        resolve();
      });
      
      serverProcess.on('exit', (code) => {
        if (!hasStarted && !hasErrors) {
          console.log(`❌ Server exited with code ${code}`);
          this.results.server.startup = false;
        }
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  async checkNetworkConnectivity() {
    console.log('\n🌍 Network Connectivity Check');
    console.log('-'.repeat(30));
    
    const testUrls = ['https://example.com', 'https://google.com'];
    
    for (const url of testUrls) {
      try {
        const { spawn } = require('child_process');
        const curlProcess = spawn('curl', ['-s', '-o', '/dev/null', '-w', '%{http_code}', url], {
          stdio: ['pipe', 'pipe', 'pipe']
        });
        
        const result = await new Promise((resolve) => {
          let output = '';
          curlProcess.stdout.on('data', (data) => {
            output += data.toString();
          });
          
          curlProcess.on('close', (code) => {
            resolve({ code, output: output.trim() });
          });
          
          setTimeout(() => {
            curlProcess.kill();
            resolve({ code: -1, output: 'timeout' });
          }, 3000);
        });
        
        if (result.output === '200') {
          console.log(`✓ ${url} - reachable`);
        } else {
          console.log(`❌ ${url} - HTTP ${result.output}`);
        }
      } catch (error) {
        console.log(`❌ ${url} - ${error.message}`);
      }
    }
  }

  printSummary() {
    console.log('\n📊 Debug Summary');
    console.log('=' .repeat(50));
    
    const issues = [];
    
    if (!this.results.environment.built) {
      issues.push('Project not built - run: npx tsc');
    }
    
    if (!this.results.chrome.available) {
      issues.push('Chrome not found - install Google Chrome');
    }
    
    if (this.results.server.startup === false) {
      issues.push(`Server startup failed${this.results.server.error ? ': ' + this.results.server.error : ''}`);
    }
    
    if (issues.length === 0) {
      console.log('🎉 All checks passed! Server should work correctly.');
    } else {
      console.log('⚠️  Issues found:');
      issues.forEach(issue => console.log(`   • ${issue}`));
    }
    
    if (this.results.server.startupTime) {
      console.log(`\n⏱️  Server startup time: ${this.results.server.startupTime}ms`);
    }
  }
}

// Run if called directly
if (require.main === module) {
  const debugTool = new ServerDebugger();
  debugTool.runAll().catch(console.error);
}

module.exports = ServerDebugger;