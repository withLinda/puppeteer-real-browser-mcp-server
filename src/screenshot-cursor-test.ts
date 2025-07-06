import { connect } from 'puppeteer-real-browser';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { 
  safeScreenshot, 
  preparePageForScreenshot, 
  screenshotControls,
  isBrowserHealthy 
} from './screenshot-handler.js';

async function testCursorScreenshot() {
  let browser: any;
  let page: any;
  const outputDir = join(process.cwd(), 'test-screenshots');

  // Create output directory
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  try {
    console.log('🚀 Launching browser for Cursor.com test...');
    
    // Reset circuit breaker
    screenshotControls.resetCircuitBreaker();

    // Launch fresh browser instance with puppeteer-real-browser
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
        defaultViewport: { width: 1920, height: 1080 },
      },
    });

    browser = connection.browser;
    page = connection.page;

    console.log('✅ Browser launched successfully');

    // Navigate to Cursor.com
    console.log('🌐 Navigating to cursor.com...');
    await page.goto('https://cursor.com', { 
      waitUntil: 'networkidle2',
      timeout: 60000 
    });

    console.log('⏳ Waiting for page to fully load...');
    await new Promise(resolve => setTimeout(resolve, 3000)); // Extra wait for animations/async content

    // Check browser health
    console.log('🔍 Checking browser health...');
    const isHealthy = await isBrowserHealthy(page);
    console.log(`Browser health: ${isHealthy ? '✅ Healthy' : '❌ Unhealthy'}`);

    console.log('⚙️ Preparing page for screenshot...');
    await preparePageForScreenshot(page);

    console.log('📸 Taking screenshot with CDP (safe mode)...');
    const resultCDP = await safeScreenshot(page, { 
      timeout: 15000,
      maxRetries: 2,
      quality: 90
    });

    if (resultCDP.success && resultCDP.screenshot) {
      const screenshotBuffer = Buffer.from(resultCDP.screenshot, 'base64');
      const filename = join(outputDir, 'cursor-homepage-cdp.png');
      writeFileSync(filename, screenshotBuffer);
      
      console.log(`✅ CDP Screenshot saved to: ${filename}`);
      console.log(`📊 File size: ${screenshotBuffer.length} bytes`);
      console.log(`🔧 Method used: ${resultCDP.method}`);
    } else {
      console.log(`❌ CDP Screenshot failed: ${resultCDP.error}`);
    }

    console.log('📸 Taking screenshot with standard method...');
    const resultStandard = await safeScreenshot(page, { 
      timeout: 15000,
      maxRetries: 2,
      quality: 90
    });

    if (resultStandard.success && resultStandard.screenshot) {
      const screenshotBuffer = Buffer.from(resultStandard.screenshot, 'base64');
      const filename = join(outputDir, 'cursor-homepage-standard.png');
      writeFileSync(filename, screenshotBuffer);
      
      console.log(`✅ Standard Screenshot saved to: ${filename}`);
      console.log(`📊 File size: ${screenshotBuffer.length} bytes`);
      console.log(`🔧 Method used: ${resultStandard.method}`);
    } else {
      console.log(`❌ Standard Screenshot failed: ${resultStandard.error}`);
    }

    // Test full page screenshot
    console.log('📸 Taking full page screenshot...');
    const resultFullPage = await safeScreenshot(page, { 
      fullPage: true,
      timeout: 20000,
      maxRetries: 1,
      quality: 85
    });

    if (resultFullPage.success && resultFullPage.screenshot) {
      const screenshotBuffer = Buffer.from(resultFullPage.screenshot, 'base64');
      const filename = join(outputDir, 'cursor-homepage-fullpage.png');
      writeFileSync(filename, screenshotBuffer);
      
      console.log(`✅ Full Page Screenshot saved to: ${filename}`);
      console.log(`📊 File size: ${screenshotBuffer.length} bytes`);
      console.log(`🔧 Method used: ${resultFullPage.method}`);
    } else {
      console.log(`❌ Full Page Screenshot failed: ${resultFullPage.error}`);
    }

    // Test element screenshot (try to capture the hero section)
    console.log('📸 Attempting element screenshot of main content...');
    const resultElement = await safeScreenshot(page, { 
      selector: 'main, .hero, [data-testid="hero"], .main-content, body > div:first-child',
      timeout: 10000,
      maxRetries: 1
    });

    if (resultElement.success && resultElement.screenshot) {
      const screenshotBuffer = Buffer.from(resultElement.screenshot, 'base64');
      const filename = join(outputDir, 'cursor-homepage-element.png');
      writeFileSync(filename, screenshotBuffer);
      
      console.log(`✅ Element Screenshot saved to: ${filename}`);
      console.log(`📊 File size: ${screenshotBuffer.length} bytes`);
      console.log(`🔧 Method used: ${resultElement.method}`);
    } else {
      console.log(`❌ Element Screenshot failed: ${resultElement.error}`);
    }

    console.log('\n🎉 Cursor.com screenshot test completed!');
    console.log('📁 Check the test-screenshots folder for all generated images.');

  } catch (error) {
    console.error('❌ Test failed with error:', error);
    throw error;
  } finally {
    // Always close browser
    if (browser) {
      console.log('🧹 Closing browser...');
      await browser.close();
      console.log('✅ Browser closed');
    }
  }
}

// Run the test
testCursorScreenshot()
  .then(() => {
    console.log('✅ All tests completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test suite failed:', error);
    process.exit(1);
  });

export { testCursorScreenshot };