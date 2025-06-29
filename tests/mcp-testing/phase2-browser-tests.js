const MCPTestClient = require('./mcp-test-client');

class Phase2BrowserTests {
  constructor(logger) {
    this.logger = logger;
    this.client = new MCPTestClient(logger);
  }

  async run() {
    this.logger.startPhase('Phase 2', 'Basic Browser Operations');
    
    try {
      await this.client.start();
      await this.client.initialize();
      
      // Test 2.1: Browser Initialization
      await this.testBrowserInitialization();
      
      // Test 2.2: Simple Navigation
      await this.testSimpleNavigation();
      
      // Test 2.3: Multiple Browser Modes
      await this.testBrowserModes();
      
    } catch (error) {
      this.logger.log(`Phase 2 critical error: ${error.message}`, 'ERROR');
    } finally {
      await this.client.stop();
      this.logger.endPhase('Phase 2');
    }
  }

  async testBrowserInitialization() {
    try {
      const startTime = Date.now();
      const result = await this.client.callTool('browser_init', {
        headless: true
      });
      const duration = Date.now() - startTime;
      
      if (result && result.content && result.content.length > 0) {
        this.logger.logTest('Phase 2', 'Browser Initialization (Headless)', 'passed', {
          duration: `${duration}ms`,
          message: result.content[0].text
        });
      } else {
        this.logger.logTest('Phase 2', 'Browser Initialization (Headless)', 'failed', {
          error: result?.error || 'Unknown error'
        });
      }
      
      // Clean up
      await this.client.callTool('browser_close');
      
    } catch (error) {
      this.logger.logTest('Phase 2', 'Browser Initialization (Headless)', 'failed', {
        error: error.message
      });
    }
  }

  async testSimpleNavigation() {
    let browserInitialized = false;
    
    try {
      // Initialize browser
      const initResult = await this.client.callTool('browser_init', {
        headless: true
      });
      
      if (!initResult?.content || initResult.content.length === 0) {
        throw new Error('Failed to initialize browser');
      }
      browserInitialized = true;
      
      // Navigate to example.com
      const navStartTime = Date.now();
      const navResult = await this.client.callTool('navigate', {
        url: 'https://example.com',
        waitUntil: 'networkidle2'
      });
      const navDuration = Date.now() - navStartTime;
      
      if (navResult?.content && navResult.content.length > 0) {
        this.logger.logTest('Phase 2', 'Navigation to example.com', 'passed', {
          duration: `${navDuration}ms`,
          retries: navResult.retries || 0
        });
      } else {
        this.logger.logTest('Phase 2', 'Navigation to example.com', 'failed', {
          error: navResult?.error || 'Navigation failed'
        });
        return;
      }
      
      // Take screenshot
      const screenshotStartTime = Date.now();
      const screenshotResult = await this.client.callTool('screenshot', {
        fullPage: false
      });
      const screenshotDuration = Date.now() - screenshotStartTime;
      
      if (screenshotResult?.content && screenshotResult.content.length > 0) {
        this.logger.logTest('Phase 2', 'Screenshot Capture', 'passed', {
          duration: `${screenshotDuration}ms`,
          imageSize: screenshotResult.content[0]?.data?.length || 'unknown'
        });
      } else {
        this.logger.logTest('Phase 2', 'Screenshot Capture', 'failed', {
          error: screenshotResult?.error || 'Screenshot failed'
        });
      }
      
      // Get page content
      const contentResult = await this.client.callTool('get_content', {
        type: 'text'
      });
      
      if (contentResult?.content && contentResult.content.length > 0) {
        const textContent = contentResult.content[0]?.text || '';
        this.logger.logTest('Phase 2', 'Get Page Content', 'passed', {
          contentLength: textContent.length,
          hasExampleText: textContent.includes('Example Domain')
        });
      } else {
        this.logger.logTest('Phase 2', 'Get Page Content', 'failed', {
          error: contentResult?.error || 'Content retrieval failed'
        });
      }
      
    } catch (error) {
      this.logger.logTest('Phase 2', 'Simple Navigation Test', 'failed', {
        error: error.message
      });
    } finally {
      if (browserInitialized) {
        try {
          const closeResult = await this.client.callTool('browser_close');
          this.logger.logTest('Phase 2', 'Browser Cleanup', 
                             (closeResult?.content && closeResult.content.length > 0) ? 'passed' : 'failed', {});
        } catch (error) {
          this.logger.log(`Failed to close browser: ${error.message}`, 'ERROR');
        }
      }
    }
  }

  async testBrowserModes() {
    // Test non-headless mode
    let browserInitialized = false;
    
    try {
      const startTime = Date.now();
      const result = await this.client.callTool('browser_init', {
        headless: false
      });
      const duration = Date.now() - startTime;
      
      if (result && result.content && result.content.length > 0) {
        browserInitialized = true;
        this.logger.logTest('Phase 2', 'Browser Initialization (Non-Headless)', 'passed', {
          duration: `${duration}ms`,
          antiDetectionEnabled: result.message?.includes('anti-detection')
        });
        
        // Quick navigation test in non-headless mode
        const navResult = await this.client.callTool('navigate', {
          url: 'https://httpbin.org/user-agent'
        });
        
        if (navResult?.content && navResult.content.length > 0) {
          this.logger.logTest('Phase 2', 'Non-Headless Navigation', 'passed', {});
        } else {
          this.logger.logTest('Phase 2', 'Non-Headless Navigation', 'failed', {
            error: navResult?.error
          });
        }
        
      } else {
        this.logger.logTest('Phase 2', 'Browser Initialization (Non-Headless)', 'failed', {
          error: result?.error || 'Unknown error'
        });
      }
      
    } catch (error) {
      this.logger.logTest('Phase 2', 'Browser Modes Test', 'failed', {
        error: error.message
      });
    } finally {
      if (browserInitialized) {
        await this.client.callTool('browser_close');
      }
    }
  }
}

module.exports = Phase2BrowserTests;