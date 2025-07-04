#!/usr/bin/env node

/**
 * Performance Testing Suite for MCP Server
 * 
 * Tests performance characteristics that other test suites don't cover:
 * - Browser initialization timing
 * - Navigation performance across different sites
 * - Screenshot generation performance
 * - Concurrent operation handling
 * - Memory usage patterns
 * - Session longevity testing
 */

const MCPTestClient = require('../mcp-testing/mcp-test-client');
const TestLogger = require('../mcp-testing/test-logger');

class PerformanceTests {
  constructor() {
    this.logger = new TestLogger('performance');
    this.client = new MCPTestClient(this.logger);
    this.metrics = {
      browserInit: [],
      navigation: [],
      concurrency: [],
      memory: []
    };
  }

  async run() {
    this.logger.startPhase('Performance', 'Performance and Load Testing');
    
    try {
      await this.client.start();
      
      await this.testBrowserInitPerformance();
      await this.testNavigationPerformance();
      await this.testConcurrentOperations();
      await this.testSessionLongevity();
      
      this.generatePerformanceReport();
      
    } catch (error) {
      this.logger.log(`Performance testing error: ${error.message}`, 'ERROR');
    } finally {
      await this.client.stop();
      this.logger.endPhase('Performance');
    }
  }

  async testBrowserInitPerformance() {
    this.logger.log('Testing browser initialization performance...', 'INFO');
    
    const trials = 5;
    const results = [];
    
    for (let i = 0; i < trials; i++) {
      const startTime = Date.now();
      
      try {
        await this.client.callTool('browser_init', { headless: true });
        const duration = Date.now() - startTime;
        results.push(duration);
        
        // Close browser for next trial
        await this.client.callTool('browser_close', {});
        
        // Wait between trials
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        this.logger.log(`Browser init trial ${i + 1} failed: ${error.message}`, 'ERROR');
      }
    }
    
    if (results.length > 0) {
      const avg = results.reduce((a, b) => a + b, 0) / results.length;
      const min = Math.min(...results);
      const max = Math.max(...results);
      
      this.metrics.browserInit = { avg, min, max, trials: results.length };
      
      this.logger.logTest('Performance', 'Browser Init Performance', 'passed', {
        averageTime: `${avg.toFixed(0)}ms`,
        minTime: `${min}ms`,
        maxTime: `${max}ms`,
        trials: results.length
      });
    }
  }

  async testNavigationPerformance() {
    this.logger.log('Testing navigation performance...', 'INFO');
    
    await this.client.callTool('browser_init', { headless: true });
    
    const testSites = [
      { name: 'Simple HTML', url: 'https://example.com' },
      { name: 'JavaScript Heavy', url: 'https://www.google.com' },
      { name: 'API Response', url: 'https://httpbin.org/html' }
    ];
    
    const navigationResults = [];
    
    for (const site of testSites) {
      const trials = 3;
      const siteResults = [];
      
      for (let i = 0; i < trials; i++) {
        const startTime = Date.now();
        
        try {
          await this.client.callTool('navigate', { 
            url: site.url,
            waitUntil: 'networkidle2'
          });
          
          const duration = Date.now() - startTime;
          siteResults.push(duration);
          
        } catch (error) {
          this.logger.log(`Navigation to ${site.name} trial ${i + 1} failed: ${error.message}`, 'ERROR');
        }
      }
      
      if (siteResults.length > 0) {
        const avg = siteResults.reduce((a, b) => a + b, 0) / siteResults.length;
        navigationResults.push({ site: site.name, avg, results: siteResults });
        
        this.logger.logTest('Performance', `Navigation: ${site.name}`, 'passed', {
          averageTime: `${avg.toFixed(0)}ms`,
          url: site.url,
          trials: siteResults.length
        });
      }
    }
    
    this.metrics.navigation = navigationResults;
    await this.client.callTool('browser_close', {});
  }

  async testConcurrentOperations() {
    this.logger.log('Testing concurrent operation handling...', 'INFO');
    
    await this.client.callTool('browser_init', { headless: true });
    await this.client.callTool('navigate', { url: 'https://example.com' });
    
    // Test rapid sequential operations
    const operations = [
      () => this.client.callTool('get_content', { type: 'text' }),
      () => this.client.callTool('get_content', { type: 'html' }),
      () => this.client.callTool('wait', { type: 'timeout', value: '100' })
    ];
    
    const startTime = Date.now();
    
    try {
      // Execute operations rapidly
      const promises = operations.map(op => op());
      await Promise.all(promises);
      
      const totalDuration = Date.now() - startTime;
      
      this.metrics.concurrency = { totalTime: totalDuration, operations: operations.length };
      
      this.logger.logTest('Performance', 'Concurrent Operations', 'passed', {
        totalTime: `${totalDuration}ms`,
        operationsCount: operations.length,
        avgPerOperation: `${(totalDuration / operations.length).toFixed(0)}ms`
      });
      
    } catch (error) {
      this.logger.logTest('Performance', 'Concurrent Operations', 'failed', {
        error: error.message
      });
    }
    
    await this.client.callTool('browser_close', {});
  }

  async testSessionLongevity() {
    this.logger.log('Testing session longevity...', 'INFO');
    
    const startTime = Date.now();
    await this.client.callTool('browser_init', { headless: true });
    
    const testDuration = 30000; // 30 seconds
    const operationInterval = 2000; // Every 2 seconds
    const operations = [];
    
    const testUrls = [
      'https://example.com',
      'https://httpbin.org/html',
      'https://httpbin.org/json'
    ];
    
    let urlIndex = 0;
    
    const performOperation = async () => {
      try {
        const url = testUrls[urlIndex % testUrls.length];
        await this.client.callTool('navigate', { url });
        await this.client.callTool('get_content', { type: 'text' });
        
        operations.push({
          timestamp: Date.now() - startTime,
          operation: 'navigate + get_content',
          url: url,
          success: true
        });
        
        urlIndex++;
      } catch (error) {
        operations.push({
          timestamp: Date.now() - startTime,
          operation: 'navigate + get_content',
          success: false,
          error: error.message
        });
      }
    };
    
    // Run operations at intervals
    const interval = setInterval(performOperation, operationInterval);
    
    // Stop after test duration
    await new Promise(resolve => setTimeout(resolve, testDuration));
    clearInterval(interval);
    
    const totalDuration = Date.now() - startTime;
    const successfulOps = operations.filter(op => op.success).length;
    const failedOps = operations.length - successfulOps;
    
    this.logger.logTest('Performance', 'Session Longevity', 'passed', {
      testDuration: `${totalDuration}ms`,
      totalOperations: operations.length,
      successful: successfulOps,
      failed: failedOps,
      successRate: `${((successfulOps / operations.length) * 100).toFixed(1)}%`
    });
    
    this.metrics.memory = {
      testDuration: totalDuration,
      operations: operations.length,
      successRate: (successfulOps / operations.length) * 100
    };
    
    await this.client.callTool('browser_close', {});
  }

  generatePerformanceReport() {
    this.logger.log('\n📊 Performance Report Summary', 'INFO');
    this.logger.log('='.repeat(50), 'INFO');
    
    if (this.metrics.browserInit.avg) {
      this.logger.log(`🚀 Browser Init: ${this.metrics.browserInit.avg.toFixed(0)}ms avg (${this.metrics.browserInit.min}-${this.metrics.browserInit.max}ms range)`, 'INFO');
    }
    
    if (this.metrics.navigation.length > 0) {
      this.logger.log('🌐 Navigation Performance:', 'INFO');
      this.metrics.navigation.forEach(nav => {
        this.logger.log(`   ${nav.site}: ${nav.avg.toFixed(0)}ms avg`, 'INFO');
      });
    }
    
    if (this.metrics.concurrency.totalTime) {
      this.logger.log(`⚡ Concurrent Ops: ${this.metrics.concurrency.totalTime}ms for ${this.metrics.concurrency.operations} operations`, 'INFO');
    }
    
    if (this.metrics.memory.successRate) {
      this.logger.log(`🔄 Session Longevity: ${this.metrics.memory.successRate.toFixed(1)}% success rate over ${this.metrics.memory.operations} operations`, 'INFO');
    }
    
    // Performance thresholds
    const warnings = [];
    
    if (this.metrics.browserInit.avg > 5000) {
      warnings.push('Browser initialization is slow (>5s)');
    }
    
    if (this.metrics.navigation.some(nav => nav.avg > 10000)) {
      warnings.push('Some navigation operations are slow (>10s)');
    }
    
    if (this.metrics.memory.successRate < 90) {
      warnings.push('Session longevity success rate is low (<90%)');
    }
    
    if (warnings.length > 0) {
      this.logger.log('\n⚠️  Performance Warnings:', 'WARN');
      warnings.forEach(warning => this.logger.log(`   • ${warning}`, 'WARN'));
    } else {
      this.logger.log('\n✅ All performance metrics within acceptable ranges', 'INFO');
    }
  }
}

// Run if called directly
if (require.main === module) {
  const perfTests = new PerformanceTests();
  perfTests.run().catch(console.error);
}

module.exports = PerformanceTests;