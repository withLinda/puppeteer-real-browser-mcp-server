import { describe, it, expect } from 'vitest';
import { connect } from 'puppeteer-real-browser';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { 
  safeScreenshot, 
  preparePageForScreenshot, 
  screenshotControls 
} from './screenshot-handler.js';

describe('Screenshot Demo - Real Screenshots', () => {
  const outputDir = join(process.cwd(), 'test-screenshots');

  // Create output directory
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  it('should take a real screenshot and save it to file', async () => {
    let browser: any;
    let page: any;

    try {
      console.log('🚀 Launching browser...');
      
      // Reset circuit breaker
      screenshotControls.resetCircuitBreaker();

      // Launch fresh browser instance
      const connection = await connect({
        headless: false,
        customConfig: {
          ignoreDefaultFlags: false, // CRITICAL: Must be false
          chromeFlags: [
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-default-apps',
            '--disable-blink-features=AutomationControlled'
          ]
        },
        disableXvfb: true,
        connectOption: {
          defaultViewport: null,
        },
      });

      browser = connection.browser;
      page = connection.page;

      console.log('✅ Browser launched successfully');

      // Navigate to a simple website
      console.log('🌐 Navigating to example.com...');
      await page.goto('https://example.com', { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });

      console.log('⚙️ Preparing page for screenshot...');
      await preparePageForScreenshot(page);

      console.log('📸 Taking screenshot...');
      const result = await safeScreenshot(page, { 
        timeout: 10000,
        maxRetries: 1 
      });

      // Verify result
      expect(result.success).toBe(true);
      expect(result.screenshot).toBeTruthy();
      expect(typeof result.screenshot).toBe('string');
      
      console.log(`✅ Screenshot captured successfully!`);
      console.log(`Method used: ${result.method}`);
      console.log(`Screenshot length: ${result.screenshot!.length} characters`);

      // Save screenshot to file
      const screenshotBuffer = Buffer.from(result.screenshot!, 'base64');
      const filename = join(outputDir, 'demo-example-com.png');
      writeFileSync(filename, screenshotBuffer);
      
      console.log(`💾 Screenshot saved to: ${filename}`);
      console.log(`📊 File size: ${screenshotBuffer.length} bytes`);
      
      // Verify file was created and has reasonable size
      expect(existsSync(filename)).toBe(true);
      expect(screenshotBuffer.length).toBeGreaterThan(1000); // At least 1KB

      console.log('🎉 SUCCESS! Check the test-screenshots folder for your screenshot!');

    } catch (error) {
      console.error('❌ Test failed:', error);
      throw error;
    } finally {
      // Always close browser
      if (browser) {
        console.log('🧹 Closing browser...');
        await browser.close();
        console.log('✅ Browser closed');
      }
    }
  }, 120000); // 2 minute timeout

  it('should take a screenshot with standard method', async () => {
    let browser: any;
    let page: any;

    try {
      console.log('🚀 Launching browser for standard screenshot...');
      
      screenshotControls.resetCircuitBreaker();

      const connection = await connect({
        headless: false,
        customConfig: {
          ignoreDefaultFlags: false,
          chromeFlags: [
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-default-apps'
          ]
        },
        disableXvfb: true,
        connectOption: {
          defaultViewport: { width: 1280, height: 720 },
        },
      });

      browser = connection.browser;
      page = connection.page;

      // Navigate to a data URL for consistent results
      console.log('🌐 Creating simple test page...');
      await page.goto('data:text/html,<h1 style="color:blue;font-size:48px;">Screenshot Test!</h1><p style="font-size:24px;">This is a test screenshot from puppeteer-real-browser</p>', {
        waitUntil: 'domcontentloaded'
      });

      console.log('📸 Taking screenshot with standard method...');
      const result = await safeScreenshot(page, { 
        timeout: 10000,
        maxRetries: 1 
      });

      expect(result.success).toBe(true);
      expect(result.method).toBe('standard');
      
      // Save screenshot
      const screenshotBuffer = Buffer.from(result.screenshot!, 'base64');
      const filename = join(outputDir, 'demo-standard-method.png');
      writeFileSync(filename, screenshotBuffer);
      
      console.log(`💾 Standard screenshot saved to: ${filename}`);
      console.log(`📊 File size: ${screenshotBuffer.length} bytes`);
      
      expect(existsSync(filename)).toBe(true);
      console.log('🎉 Standard method screenshot SUCCESS!');

    } catch (error) {
      console.error('❌ Standard method test failed:', error);
      throw error;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }, 120000);

  it('should demonstrate element screenshot', async () => {
    let browser: any;
    let page: any;

    try {
      console.log('🚀 Launching browser for element screenshot...');
      
      screenshotControls.resetCircuitBreaker();

      const connection = await connect({
        headless: false,
        customConfig: {
          ignoreDefaultFlags: false,
        },
        disableXvfb: true,
        connectOption: {
          defaultViewport: { width: 1280, height: 720 },
        },
      });

      browser = connection.browser;
      page = connection.page;

      // Create a page with identifiable elements
      await page.goto('data:text/html,<div style="padding:20px;border:2px solid red;background:yellow;"><h1 id="test-header">ELEMENT SCREENSHOT</h1><p>This is just the header element!</p></div>', {
        waitUntil: 'domcontentloaded'
      });

      console.log('📸 Taking element screenshot of h1...');
      const result = await safeScreenshot(page, { 
        selector: '#test-header',
        timeout: 10000 
      });

      expect(result.success).toBe(true);
      expect(result.method).toBe('element');
      
      // Save element screenshot
      const screenshotBuffer = Buffer.from(result.screenshot!, 'base64');
      const filename = join(outputDir, 'demo-element-h1.png');
      writeFileSync(filename, screenshotBuffer);
      
      console.log(`💾 Element screenshot saved to: ${filename}`);
      console.log(`📊 File size: ${screenshotBuffer.length} bytes`);
      
      expect(existsSync(filename)).toBe(true);
      console.log('🎉 Element screenshot SUCCESS!');

    } catch (error) {
      console.error('❌ Element screenshot test failed:', error);
      throw error;
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }, 120000);
});