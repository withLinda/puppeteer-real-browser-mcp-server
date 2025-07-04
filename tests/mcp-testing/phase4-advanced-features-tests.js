const MCPTestClient = require('./mcp-test-client');

class Phase4AdvancedFeaturesTests {
  constructor(logger) {
    this.logger = logger;
    this.client = new MCPTestClient(logger);
  }

  // Helper function for defensive content access
  getContentText(result) {
    // Handle new MCP format
    if (result?.content?.[0]?.text !== undefined) {
      return result.content[0].text;
    }
    
    // Handle legacy string format for backward compatibility
    if (typeof result?.content === 'string') {
      return result.content;
    }
    
    return '';
  }

  async run() {
    this.logger.startPhase('Phase 4', 'Advanced Features Testing');

    try {
      await this.client.start();
      await this.client.initialize();

      // Test 4.1: User Interactions
      await this.testUserInteractions();

      // Test 4.2: Wait Conditions
      await this.testWaitConditions();

      // Test 4.3: Element Interactions
      await this.testElementInteractions();

    } catch (error) {
      this.logger.log(`Phase 4 critical error: ${error.message}`, 'ERROR');
    } finally {
      await this.client.stop();
      this.logger.endPhase('Phase 4');
    }
  }

  async testUserInteractions() {
    let browserInitialized = false;

    try {
      const initResult = await this.client.callTool('browser_init', {
        headless: false // Non-headless to observe user interactions
      });

      if (!initResult?.success) {
        throw new Error('Failed to initialize browser');
      }
      browserInitialized = true;

      // Navigate to a form page
      const navResult = await this.client.callTool('navigate', {
        url: 'https://httpbin.org/forms/post'
      });

      if (!navResult?.success) {
        this.logger.logTest('Phase 4', 'Navigate to form page', 'failed', {
          error: navResult?.error
        });
        return;
      }

      // Test typing (using standard type tool)
      const typeStartTime = Date.now();
      const typeResult = await this.client.callTool('type', {
        selector: 'input[name="custname"]',
        text: 'Test User Name',
        delay: 150 // Use a higher delay for more realistic typing
      });
      const typeDuration = Date.now() - typeStartTime;

      if (typeResult?.success) {
        this.logger.logTest('Phase 4', 'Typing', 'passed', {
          duration: `${typeDuration}ms`,
          hasVariableDelay: typeDuration > 1000 // Typing should take time
        });
      } else {
        this.logger.logTest('Phase 4', 'Typing', 'failed', {
          error: typeResult?.error
        });
      }

      // Test clicking (using dynamic selector discovery)
      // First, find the exact selector for the submit button
      const selectorResult = await this.client.callTool('find_selector', {
        text: 'Submit order',
        elementType: 'button'
      });

      if (!selectorResult?.success) {
        this.logger.logTest('Phase 4', 'Find Submit Button Selector', 'failed', {
          error: selectorResult?.error
        });
        return;
      }

      const submitButtonSelector = selectorResult.content[0]?.text;
      this.logger.logTest('Phase 4', 'Find Submit Button Selector', 'passed', {
        selector: submitButtonSelector
      });

      // Now click using the discovered selector
      const clickStartTime = Date.now();
      const clickResult = await this.client.callTool('click', {
        selector: submitButtonSelector,
        waitForNavigation: true
      });
      const clickDuration = Date.now() - clickStartTime;

      if (clickResult?.success) {
        this.logger.logTest('Phase 4', 'Clicking', 'passed', {
          duration: `${clickDuration}ms`,
          hasNavigation: clickDuration > 100, // Should include navigation time
          selector: submitButtonSelector
        });
      } else {
        this.logger.logTest('Phase 4', 'Clicking', 'failed', {
          error: clickResult?.error,
          selector: submitButtonSelector
        });
      }

      // Test random scrolling
      const scrollResult = await this.client.callTool('random_scroll', {});

      this.logger.logTest('Phase 4', 'Random Scroll', 
                         scrollResult?.success ? 'passed' : 'failed', {
        error: scrollResult?.error,
        message: scrollResult?.message
      });

      // Test CAPTCHA solver (informational only - won't actually solve)
      const captchaResult = await this.client.callTool('solve_captcha', {
        type: 'recaptcha'
      });

      // This is expected to not find a captcha, which is fine
      this.logger.logTest('Phase 4', 'CAPTCHA Solver Available', 
                         captchaResult !== undefined ? 'passed' : 'failed', {
        message: captchaResult?.message || captchaResult?.error
      });

    } catch (error) {
      this.logger.logTest('Phase 4', 'User Interactions Test', 'failed', {
        error: error.message
      });
    } finally {
      if (browserInitialized) {
        await this.client.callTool('browser_close');
      }
    }
  }

  async testWaitConditions() {
    let browserInitialized = false;

    try {
      const initResult = await this.client.callTool('browser_init', {
        headless: true
      });

      if (!initResult?.success) {
        throw new Error('Failed to initialize browser');
      }
      browserInitialized = true;

      // Navigate to a dynamic page
      await this.client.callTool('navigate', {
        url: 'https://httpbin.org/delay/1'
      });

      // Test wait for selector
      const waitSelectorResult = await this.client.callTool('wait', {
        type: 'selector',
        value: 'pre',
        timeout: 5000
      });

      this.logger.logTest('Phase 4', 'Wait for Selector', 
                         waitSelectorResult?.success ? 'passed' : 'failed', {
        error: waitSelectorResult?.error
      });

      // Test wait for navigation
      const navPromise = this.client.callTool('wait', {
        type: 'navigation',
        value: '',
        timeout: 10000
      });

      // Trigger navigation
      await this.client.callTool('navigate', {
        url: 'https://example.com'
      });

      const waitNavResult = await navPromise;

      this.logger.logTest('Phase 4', 'Wait for Navigation', 
                         waitNavResult?.success ? 'passed' : 'failed', {
        error: waitNavResult?.error
      });

      // Test timeout wait
      const timeoutStartTime = Date.now();
      const waitTimeoutResult = await this.client.callTool('wait', {
        type: 'timeout',
        value: '1000'
      });
      const actualTimeout = Date.now() - timeoutStartTime;

      this.logger.logTest('Phase 4', 'Wait Timeout', 
                         waitTimeoutResult?.success && actualTimeout >= 1000 ? 'passed' : 'failed', {
        requestedTimeout: 1000,
        actualTimeout,
        error: waitTimeoutResult?.error
      });

    } catch (error) {
      this.logger.logTest('Phase 4', 'Wait Conditions Test', 'failed', {
        error: error.message
      });
    } finally {
      if (browserInitialized) {
        await this.client.callTool('browser_close');
      }
    }
  }

  async testElementInteractions() {
    let browserInitialized = false;

    try {
      const initResult = await this.client.callTool('browser_init', {
        headless: true
      });

      if (!initResult?.success) {
        throw new Error('Failed to initialize browser');
      }
      browserInitialized = true;

      // Navigate to example.com for basic interactions
      await this.client.callTool('navigate', {
        url: 'https://example.com'
      });

      // Test getting HTML content
      const htmlResult = await this.client.callTool('get_content', {
        type: 'html'
      });

      this.logger.logTest('Phase 4', 'Get HTML Content', 
                         htmlResult?.success && this.getContentText(htmlResult).toLowerCase().includes('<!doctype html>') ? 'passed' : 'failed', {
        contentLength: this.getContentText(htmlResult).length,
        error: htmlResult?.error
      });

      // Test getting text content
      const textResult = await this.client.callTool('get_content', {
        type: 'text'
      });

      this.logger.logTest('Phase 4', 'Get Text Content', 
                         textResult?.success && this.getContentText(textResult).includes('Example Domain') ? 'passed' : 'failed', {
        contentLength: this.getContentText(textResult).length,
        error: textResult?.error
      });

      // Test getting content from specific selector
      const selectorContentResult = await this.client.callTool('get_content', {
        type: 'text',
        selector: 'h1'
      });

      this.logger.logTest('Phase 4', 'Get Content from Selector', 
                         selectorContentResult?.success && this.getContentText(selectorContentResult) === 'Example Domain' ? 'passed' : 'failed', {
        content: this.getContentText(selectorContentResult),
        error: selectorContentResult?.error
      });

    } catch (error) {
      this.logger.logTest('Phase 4', 'Element Interactions Test', 'failed', {
        error: error.message
      });
    } finally {
      if (browserInitialized) {
        await this.client.callTool('browser_close');
      }
    }
  }
}

module.exports = Phase4AdvancedFeaturesTests;
