#!/usr/bin/env node

/**
 * Unified Test Runner with Dashboard
 * 
 * Provides a single interface to run all test categories with unified reporting
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class TestRunner {
  constructor() {
    this.results = {
      quick: null,
      full: null,
      performance: null,
      debug: null
    };
    this.startTime = Date.now();
  }

  async runAll(selectedTests = ['quick', 'full', 'performance']) {
    console.log('🧪 MCP Server Test Suite');
    console.log('=' .repeat(50));
    console.log(`Running: ${selectedTests.join(', ')} tests\n`);

    for (const testType of selectedTests) {
      await this.runTestType(testType);
    }

    this.generateDashboard();
  }

  async runTestType(testType) {
    const configs = {
      quick: {
        name: 'Quick Tests (Jest)',
        command: 'npm',
        args: ['run', 'test:quick'],
        timeout: 60000
      },
      full: {
        name: 'Full Functional Tests',
        command: 'npm',
        args: ['run', 'test:full'],
        timeout: 600000
      },
      performance: {
        name: 'Performance Tests',
        command: 'npm',
        args: ['run', 'test:performance'],
        timeout: 300000
      },
      debug: {
        name: 'Debug Diagnostics',
        command: 'npm',
        args: ['run', 'test:debug'],
        timeout: 30000
      }
    };

    const config = configs[testType];
    if (!config) {
      console.log(`❌ Unknown test type: ${testType}`);
      return;
    }

    console.log(`🔄 Running ${config.name}...`);
    const startTime = Date.now();

    try {
      const result = await this.executeTest(config);
      const duration = Date.now() - startTime;

      this.results[testType] = {
        name: config.name,
        status: result.code === 0 ? 'passed' : 'failed',
        duration,
        output: result.output,
        error: result.error
      };

      const statusIcon = result.code === 0 ? '✅' : '❌';
      console.log(`${statusIcon} ${config.name} - ${duration}ms\n`);

    } catch (error) {
      const duration = Date.now() - startTime;
      this.results[testType] = {
        name: config.name,
        status: 'error',
        duration,
        error: error.message
      };

      console.log(`💥 ${config.name} - Error: ${error.message}\n`);
    }
  }

  executeTest(config) {
    return new Promise((resolve, reject) => {
      const process = spawn(config.command, config.args, {
        stdio: ['inherit', 'pipe', 'pipe'],
        shell: true
      });

      let output = '';
      let error = '';

      process.stdout?.on('data', (data) => {
        output += data.toString();
      });

      process.stderr?.on('data', (data) => {
        error += data.toString();
      });

      process.on('close', (code) => {
        resolve({ code, output, error });
      });

      process.on('error', (err) => {
        reject(err);
      });

      // Timeout handling
      setTimeout(() => {
        process.kill('SIGTERM');
        reject(new Error(`Test timeout after ${config.timeout}ms`));
      }, config.timeout);
    });
  }

  generateDashboard() {
    const totalDuration = Date.now() - this.startTime;
    
    console.log('\n📊 Test Results Dashboard');
    console.log('=' .repeat(50));

    // Summary table
    console.log('\n📋 Summary:');
    console.log('-'.repeat(50));

    Object.entries(this.results).forEach(([type, result]) => {
      if (!result) return;

      const statusIcon = {
        'passed': '✅',
        'failed': '❌', 
        'error': '💥'
      }[result.status] || '❓';

      const durationStr = `${result.duration}ms`.padEnd(8);
      const nameStr = result.name.padEnd(25);
      
      console.log(`${statusIcon} ${nameStr} ${durationStr} ${result.status.toUpperCase()}`);
    });

    // Overall status
    const runTests = Object.values(this.results).filter(r => r !== null);
    const passedTests = runTests.filter(r => r.status === 'passed');
    const failedTests = runTests.filter(r => r.status === 'failed');
    const errorTests = runTests.filter(r => r.status === 'error');

    console.log('\n🎯 Overall Results:');
    console.log('-'.repeat(50));
    console.log(`Total Tests Run: ${runTests.length}`);
    console.log(`✅ Passed: ${passedTests.length}`);
    console.log(`❌ Failed: ${failedTests.length}`);
    console.log(`💥 Errors: ${errorTests.length}`);
    console.log(`⏱️  Total Duration: ${totalDuration}ms`);

    const overallStatus = failedTests.length === 0 && errorTests.length === 0 ? 'PASSED' : 'FAILED';
    const overallIcon = overallStatus === 'PASSED' ? '🎉' : '⚠️';
    
    console.log(`\n${overallIcon} Overall Status: ${overallStatus}`);

    // Recommendations
    if (failedTests.length > 0 || errorTests.length > 0) {
      console.log('\n💡 Recommendations:');
      console.log('-'.repeat(50));
      
      if (errorTests.some(t => t.name.includes('Debug'))) {
        console.log('• Run debug diagnostics: npm run test:debug');
      }
      
      if (failedTests.some(t => t.name.includes('Quick'))) {
        console.log('• Check protocol compliance issues');
      }
      
      if (failedTests.some(t => t.name.includes('Full'))) {
        console.log('• Check browser operations and error recovery');
      }
      
      if (failedTests.some(t => t.name.includes('Performance'))) {
        console.log('• Check system resources and network connectivity');
      }
    }

    // Save results to file
    this.saveResults();
  }

  saveResults() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `test-results-${timestamp}.json`;
    
    const report = {
      timestamp: new Date().toISOString(),
      totalDuration: Date.now() - this.startTime,
      results: this.results,
      summary: {
        total: Object.values(this.results).filter(r => r !== null).length,
        passed: Object.values(this.results).filter(r => r?.status === 'passed').length,
        failed: Object.values(this.results).filter(r => r?.status === 'failed').length,
        errors: Object.values(this.results).filter(r => r?.status === 'error').length
      }
    };

    try {
      if (!fs.existsSync('test-results')) {
        fs.mkdirSync('test-results');
      }
      
      fs.writeFileSync(path.join('test-results', filename), JSON.stringify(report, null, 2));
      console.log(`\n💾 Results saved to: test-results/${filename}`);
    } catch (error) {
      console.log(`\n⚠️  Could not save results: ${error.message}`);
    }
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const runner = new TestRunner();

  if (args.length === 0) {
    // Default: run all but debug
    runner.runAll(['quick', 'full', 'performance']).catch(console.error);
  } else if (args[0] === 'all') {
    runner.runAll(['quick', 'full', 'performance', 'debug']).catch(console.error);
  } else if (args[0] === 'quick') {
    runner.runAll(['quick']).catch(console.error);
  } else if (args[0] === 'ci') {
    runner.runAll(['quick']).catch(console.error);
  } else {
    runner.runAll(args).catch(console.error);
  }
}

module.exports = TestRunner;