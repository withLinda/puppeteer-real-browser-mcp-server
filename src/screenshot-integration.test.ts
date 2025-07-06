import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { connect } from 'puppeteer-real-browser';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { 
  safeScreenshot, 
  preparePageForScreenshot, 
  screenshotControls,
  isBrowserHealthy 
} from './screenshot-handler.js';

describe('Screenshot Integration Tests - Real Browser', () => {
  let browser: any;
  let page: any;
  const outputDir = join(process.cwd(), 'test-screenshots');

  beforeAll(async () => {
    // Create output directory for screenshots
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    // Reset circuit breaker
    screenshotControls.resetCircuitBreaker();

    console.log('🚀 Launching real browser with puppeteer-real-browser...');
    
    // Connect to real browser with puppeteer-real-browser
    const connection = await connect({
      headless: false, // Use headful for better debugging
      customConfig: {
        ignoreDefaultFlags: false, // CRITICAL: Must be false to prevent double browser
        chromeFlags: [
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-default-apps',
          '--start-maximized',
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
  }, 60000); // 60 second timeout for browser launch

  afterAll(async () => {
    if (browser) {
      console.log('🧹 Closing browser...');
      await browser.close();
      console.log('✅ Browser closed');
    }
  }, 30000);

  it('should take a real screenshot of a simple website', async () => {
    console.log('📸 Testing basic screenshot functionality...');
    
    // Navigate to a simple, reliable website
    await page.goto('https://example.com', { waitUntil: 'networkidle2' });
    
    // Prepare page for screenshot
    await preparePageForScreenshot(page);
    
    // Check browser health
    const isHealthy = await isBrowserHealthy(page);
    expect(isHealthy).toBe(true);
    
    // Take screenshot using our safe handler
    const result = await safeScreenshot(page, { 
      timeout: 15000,
      maxRetries: 2 
    });

    // Verify result
    expect(result.success).toBe(true);
    expect(result.screenshot).toBeTruthy();
    expect(result.method).toBe('cdp');
    expect(typeof result.screenshot).toBe('string');
    
    // Verify it's valid base64 image data
    expect(result.screenshot).toMatch(/^[A-Za-z0-9+/=]+$/);
    
    // Save screenshot to file
    const screenshotBuffer = Buffer.from(result.screenshot!, 'base64');
    const filename = join(outputDir, 'example-com-basic.png');
    writeFileSync(filename, screenshotBuffer);
    
    console.log(`✅ Screenshot saved to: ${filename}`);
    console.log(`📊 Screenshot size: ${screenshotBuffer.length} bytes`);
    
    // Verify file was created and has reasonable size
    expect(existsSync(filename)).toBe(true);
    expect(screenshotBuffer.length).toBeGreaterThan(1000); // At least 1KB
  }, 30000);

  it('should take a full page screenshot', async () => {
    console.log('📸 Testing full page screenshot...');
    
    await page.goto('https://httpbin.org/html', { waitUntil: 'networkidle2' });
    await preparePageForScreenshot(page);
    
    const result = await safeScreenshot(page, { 
      fullPage: true,
      timeout: 20000 
    });

    expect(result.success).toBe(true);
    expect(result.screenshot).toBeTruthy();
    expect(result.method).toBe('standard');
    
    // Save full page screenshot
    const screenshotBuffer = Buffer.from(result.screenshot!, 'base64');
    const filename = join(outputDir, 'httpbin-fullpage.png');
    writeFileSync(filename, screenshotBuffer);
    
    console.log(`✅ Full page screenshot saved to: ${filename}`);
    expect(screenshotBuffer.length).toBeGreaterThan(5000); // Should be larger
  }, 45000);

  it('should take an element screenshot', async () => {
    console.log('📸 Testing element screenshot...');
    
    await page.goto('https://example.com', { waitUntil: 'networkidle2' });
    await preparePageForScreenshot(page);
    
    const result = await safeScreenshot(page, { 
      selector: 'h1',
      timeout: 10000 
    });

    expect(result.success).toBe(true);
    expect(result.screenshot).toBeTruthy();
    expect(result.method).toBe('element');
    
    // Save element screenshot
    const screenshotBuffer = Buffer.from(result.screenshot!, 'base64');
    const filename = join(outputDir, 'example-h1-element.png');
    writeFileSync(filename, screenshotBuffer);
    
    console.log(`✅ Element screenshot saved to: ${filename}`);
    expect(screenshotBuffer.length).toBeGreaterThan(500); // Smaller than full page
  }, 25000);

  it('should handle error scenarios gracefully', async () => {
    console.log('🚨 Testing error handling...');
    
    // Test with non-existent selector
    const result = await safeScreenshot(page, { 
      selector: '.non-existent-element',
      timeout: 5000 
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Element not found');
    console.log(`✅ Error handling works: ${result.error}`);
  }, 15000);

  it('should test CDP fallback mechanism', async () => {
    console.log('🔄 Testing CDP fallback...');
    
    await page.goto('https://httpbin.org/json', { waitUntil: 'networkidle2' });
    await preparePageForScreenshot(page);
    
    // Force CDP method by using safe mode
    const result = await safeScreenshot(page, { 
      timeout: 15000 
    });

    expect(result.success).toBe(true);
    expect(result.method).toBe('cdp');
    
    // Save CDP screenshot
    const screenshotBuffer = Buffer.from(result.screenshot!, 'base64');
    const filename = join(outputDir, 'httpbin-json-cdp.png');
    writeFileSync(filename, screenshotBuffer);
    
    console.log(`✅ CDP screenshot saved to: ${filename}`);
  }, 25000);

  it('should handle timeout scenarios', async () => {
    console.log('⏱️ Testing timeout handling...');
    
    // Use a very short timeout to test timeout handling
    const result = await safeScreenshot(page, { 
      timeout: 1, // 1ms - should definitely timeout
      format: 'png' 
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('timed out');
    console.log(`✅ Timeout handling works: ${result.error}`);
  }, 10000);

  it('should test circuit breaker with real operations', async () => {
    console.log('🔌 Testing circuit breaker...');
    
    // Reset circuit breaker
    screenshotControls.resetCircuitBreaker();
    expect(screenshotControls.isCircuitBreakerOpen()).toBe(false);
    
    // Force failures by using impossible short timeouts
    for (let i = 0; i < 3; i++) {
      const result = await safeScreenshot(page, { 
        timeout: 1, // Will always timeout
        format: 'png' 
      });
      expect(result.success).toBe(false);
      console.log(`Failure ${i + 1}/3: ${result.error}`);
    }
    
    // Circuit breaker should be open now
    expect(screenshotControls.isCircuitBreakerOpen()).toBe(true);
    
    // Next operation should fail immediately
    const result = await safeScreenshot(page, { 
      timeout: 10000, // Even with good timeout, should fail due to circuit breaker
      format: 'png' 
    });
    
    expect(result.success).toBe(false);
    expect(result.error).toContain('Circuit breaker is open');
    console.log(`✅ Circuit breaker works: ${result.error}`);
    
    // Reset for future tests
    screenshotControls.resetCircuitBreaker();
  }, 20000);

  it('should create a comprehensive test screenshot collection', async () => {
    console.log('📸 Creating comprehensive test collection...');
    
    const testSites = [
      { url: 'https://example.com', name: 'example-final' },
      { url: 'data:text/html,<h1>Test HTML</h1><p>Simple test page</p>', name: 'simple-html' }
    ];
    
    for (const site of testSites) {
      console.log(`Taking screenshot of: ${site.url}`);
      
      await page.goto(site.url, { waitUntil: 'domcontentloaded' });
      await preparePageForScreenshot(page);
      
      const result = await safeScreenshot(page, { 
          timeout: 10000 
      });
      
      if (result.success) {
        const screenshotBuffer = Buffer.from(result.screenshot!, 'base64');
        const filename = join(outputDir, `${site.name}.png`);
        writeFileSync(filename, screenshotBuffer);
        console.log(`✅ ${site.name} screenshot saved: ${screenshotBuffer.length} bytes`);
      } else {
        console.log(`❌ ${site.name} failed: ${result.error}`);
      }
      
      expect(result.success).toBe(true);
    }
  }, 60000);
});