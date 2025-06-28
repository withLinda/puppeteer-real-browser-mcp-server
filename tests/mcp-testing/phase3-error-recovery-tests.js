const MCPTestClient = require('./mcp-test-client');

class Phase3ErrorRecoveryTests {
  constructor(logger) {
    this.logger = logger;
    this.client = new MCPTestClient(logger);
  }

  async run() {
    this.logger.startPhase('Phase 3', 'Error Recovery Testing');
    
    try {
      await this.client.start();
      await this.client.initialize();
      
      // Test 3.1: Original Failing Scenario (cursor.com/dashboard)
      await this.testOriginalFailingScenario();
      
      // Test 3.2: Complex Navigation with Retries
      await this.testComplexNavigation();
      
      // Test 3.3: Error Categories and Handling
      await this.testErrorCategories();
      
      // Test 3.4: Session Recovery
      await this.testSessionRecovery();
      
    } catch (error) {
      this.logger.log(`Phase 3 critical error: ${error.message}`, 'ERROR');
    } finally {
      await this.client.stop();
      this.logger.endPhase('Phase 3');
    }
  }

  async testOriginalFailingScenario() {
    let browserInitialized = false;
    
    try {
      // Initialize browser in non-headless mode as per original scenario
      const initResult = await this.client.callTool('browser_init', {
        headless: false
      });
      
      if (!initResult?.success) {
        throw new Error('Failed to initialize browser');
      }
      browserInitialized = true;
      
      // Navigate to cursor.com/dashboard - this previously caused frame detachment errors
      this.logger.log('Testing navigation to cursor.com/dashboard (previously failing scenario)', 'INFO');
      
      const navResult = await this.client.callTool('navigate', {
        url: 'https://www.cursor.com/dashboard',
        waitUntil: 'networkidle2'
      });
      
      if (navResult?.success) {
        this.logger.logTest('Phase 3', 'Navigate to cursor.com/dashboard', 'passed', {
          retries: navResult.retries || 0,
          retriesEngaged: (navResult.retries || 0) > 0,
          message: navResult.message
        });
      } else {
        this.logger.logTest('Phase 3', 'Navigate to cursor.com/dashboard', 'failed', {
          error: navResult?.error || 'Navigation failed',
          retries: navResult?.retries || 0
        });
      }
      
      // Attempt screenshot - this previously caused session errors
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for page to stabilize
      
      const screenshotResult = await this.client.callTool('screenshot', {
        fullPage: false
      });
      
      if (screenshotResult?.success) {
        this.logger.logTest('Phase 3', 'Screenshot after cursor.com navigation', 'passed', {
          sessionRecovered: screenshotResult.sessionRecovered || false,
          retries: screenshotResult.retries || 0
        });
      } else {
        this.logger.logTest('Phase 3', 'Screenshot after cursor.com navigation', 'failed', {
          error: screenshotResult?.error || 'Screenshot failed'
        });
      }
      
    } catch (error) {
      this.logger.logTest('Phase 3', 'Original Failing Scenario Test', 'failed', {
        error: error.message
      });
    } finally {
      if (browserInitialized) {
        await this.client.callTool('browser_close');
      }
    }
  }

  async testComplexNavigation() {
    let browserInitialized = false;
    
    try {
      const initResult = await this.client.callTool('browser_init', {
        headless: true
      });
      
      if (!initResult?.success) {
        throw new Error('Failed to initialize browser');
      }
      browserInitialized = true;
      
      // Test slow-loading page
      const slowPageResult = await this.client.callTool('navigate', {
        url: 'https://httpbin.org/delay/2',
        waitUntil: 'networkidle2'
      });
      
      if (slowPageResult?.success) {
        this.logger.logTest('Phase 3', 'Navigate to slow-loading page', 'passed', {
          retries: slowPageResult.retries || 0,
          handledTimeout: slowPageResult.message?.includes('retry') || false
        });
      } else {
        this.logger.logTest('Phase 3', 'Navigate to slow-loading page', 'failed', {
          error: slowPageResult?.error
        });
      }
      
      // Take full page screenshot
      const fullPageResult = await this.client.callTool('screenshot', {
        fullPage: true
      });
      
      this.logger.logTest('Phase 3', 'Full page screenshot after slow load', 
                         fullPageResult?.success ? 'passed' : 'failed', {
        error: fullPageResult?.error
      });
      
      // Navigate to another page
      const secondNavResult = await this.client.callTool('navigate', {
        url: 'https://httpbin.org/status/200',
        waitUntil: 'load'
      });
      
      this.logger.logTest('Phase 3', 'Second navigation after slow page', 
                         secondNavResult?.success ? 'passed' : 'failed', {
        sessionMaintained: secondNavResult?.success && !secondNavResult?.sessionRecovered,
        error: secondNavResult?.error
      });
      
      // Another screenshot to verify session integrity
      const finalScreenshot = await this.client.callTool('screenshot', {});
      
      this.logger.logTest('Phase 3', 'Screenshot after multiple navigations', 
                         finalScreenshot?.success ? 'passed' : 'failed', {
        error: finalScreenshot?.error
      });
      
    } catch (error) {
      this.logger.logTest('Phase 3', 'Complex Navigation Test', 'failed', {
        error: error.message
      });
    } finally {
      if (browserInitialized) {
        await this.client.callTool('browser_close');
      }
    }
  }

  async testErrorCategories() {
    let browserInitialized = false;
    
    try {
      const initResult = await this.client.callTool('browser_init', {
        headless: true
      });
      
      if (!initResult?.success) {
        throw new Error('Failed to initialize browser');
      }
      browserInitialized = true;
      
      // Navigate to a page first
      await this.client.callTool('navigate', { url: 'https://example.com' });
      
      // Test 1: Click non-existent element
      const clickResult = await this.client.callTool('click', {
        selector: '#non-existent-element-12345'
      });
      
      this.logger.logTest('Phase 3', 'Error Handling: Non-existent element', 
                         !clickResult?.success ? 'passed' : 'failed', {
        errorCategory: clickResult?.errorCategory || 'unknown',
        errorMessage: clickResult?.error,
        correctError: clickResult?.error?.includes('not found') || 
                     clickResult?.error?.includes('No element')
      });
      
      // Test 2: Navigate to invalid URL
      const invalidNavResult = await this.client.callTool('navigate', {
        url: 'https://this-is-not-a-valid-domain-12345.com'
      });
      
      this.logger.logTest('Phase 3', 'Error Handling: Invalid URL', 
                         !invalidNavResult?.success ? 'passed' : 'failed', {
        errorCategory: invalidNavResult?.errorCategory || 'unknown',
        errorMessage: invalidNavResult?.error,
        retriesAttempted: invalidNavResult?.retries || 0
      });
      
      // Test 3: Type in non-existent field
      const typeResult = await this.client.callTool('type', {
        selector: '#non-existent-input',
        text: 'test text'
      });
      
      this.logger.logTest('Phase 3', 'Error Handling: Type in non-existent field', 
                         !typeResult?.success ? 'passed' : 'failed', {
        errorCategory: typeResult?.errorCategory || 'unknown',
        errorMessage: typeResult?.error
      });
      
    } catch (error) {
      this.logger.logTest('Phase 3', 'Error Categories Test', 'failed', {
        error: error.message
      });
    } finally {
      if (browserInitialized) {
        await this.client.callTool('browser_close');
      }
    }
  }

  async testSessionRecovery() {
    let browserInitialized = false;
    
    try {
      const initResult = await this.client.callTool('browser_init', {
        headless: true
      });
      
      if (!initResult?.success) {
        throw new Error('Failed to initialize browser');
      }
      browserInitialized = true;
      
      // Navigate to a page
      await this.client.callTool('navigate', { url: 'https://example.com' });
      
      // Take initial screenshot
      const screenshot1 = await this.client.callTool('screenshot', {});
      
      this.logger.logTest('Phase 3', 'Initial screenshot before session test', 
                         screenshot1?.success ? 'passed' : 'failed', {});
      
      // Simulate multiple operations that might stress the session
      for (let i = 0; i < 5; i++) {
        const navUrl = i % 2 === 0 ? 'https://httpbin.org/get' : 'https://example.com';
        const navResult = await this.client.callTool('navigate', { url: navUrl });
        
        if (!navResult?.success) {
          this.logger.log(`Navigation ${i + 1} failed: ${navResult?.error}`, 'WARNING');
        }
        
        // Short delay between operations
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // Final operations to test session integrity
      const finalScreenshot = await this.client.callTool('screenshot', {});
      const finalContent = await this.client.callTool('get_content', { type: 'text' });
      
      const sessionMaintained = finalScreenshot?.success && finalContent?.success;
      
      this.logger.logTest('Phase 3', 'Session Recovery: Multiple operations', 
                         sessionMaintained ? 'passed' : 'failed', {
        screenshotSuccess: finalScreenshot?.success,
        contentSuccess: finalContent?.success,
        sessionRecovered: finalScreenshot?.sessionRecovered || finalContent?.sessionRecovered
      });
      
    } catch (error) {
      this.logger.logTest('Phase 3', 'Session Recovery Test', 'failed', {
        error: error.message
      });
    } finally {
      if (browserInitialized) {
        await this.client.callTool('browser_close');
      }
    }
  }
}

module.exports = Phase3ErrorRecoveryTests;