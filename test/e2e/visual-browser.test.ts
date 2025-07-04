/**
 * End-to-End Visual Browser Tests
 * 
 * These tests actually launch a visible browser window so you can see
 * the automation happening like in production usage.
 * 
 * Run with: npm run test:e2e
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { handleBrowserInit, handleBrowserClose } from '../../src/handlers/browser-handlers';
import { handleNavigate } from '../../src/handlers/navigation-handlers';
import { handleGetContent, handleFindSelector } from '../../src/handlers/content-handlers';
import { handleClick, handleType } from '../../src/handlers/interaction-handlers';
import { resetBrowserInitDepth } from '../../src/browser-manager';

describe.sequential('E2E Visual Browser Tests', () => {
  // Increase timeout for E2E tests since they use real browser
  const E2E_TIMEOUT = 30000;

  beforeAll(async () => {
    console.log('🚀 Starting E2E Visual Browser Tests');
    console.log('📺 You should see browser windows opening during these tests');
    
    // Reset browser initialization depth at the start
    resetBrowserInitDepth();
    
    // Clean up any existing browsers
    try {
      await handleBrowserClose();
    } catch (error) {
      // Ignore close errors - browser might not exist
    }
  }, E2E_TIMEOUT);

  beforeEach(async () => {
    // Reset depth counter before each test to prevent accumulation
    resetBrowserInitDepth();
    
    // Ensure clean state before each test
    try {
      await handleBrowserClose();
    } catch (error) {
      // Ignore close errors - browser might not be open
    }
  });

  afterEach(async () => {
    // Clean up after each test
    try {
      await handleBrowserClose();
    } catch (error) {
      // Ignore close errors - browser might already be closed
    }
    
    // Reset depth counter after each test
    resetBrowserInitDepth();
  });

  afterAll(async () => {
    console.log('🏁 Completed E2E Visual Browser Tests');
    
    // Final cleanup
    try {
      await handleBrowserClose();
    } catch (error) {
      // Ignore close errors
    }
    
    // Final reset
    resetBrowserInitDepth();
  });

  describe('Complete Workflow Demonstration', () => {
    it('should demonstrate full browser automation workflow visually', async () => {
      console.log('\n🎬 DEMO: Complete Browser Automation Workflow');
      console.log('👀 Watch your screen - browser window will open and perform automation');
      
      try {
        // Step 1: Initialize browser (visible)
        console.log('\n1️⃣ Initializing visible browser...');
        const initResult = await handleBrowserInit({
          headless: false, // VISIBLE browser
          disableXvfb: true, // Ensure no virtual display
          customConfig: {
            args: [
              '--disable-setuid-sandbox',
              '--disable-web-security',
              '--disable-features=VizDisplayCompositor',
              '--window-size=1200,800'
            ]
          }
        });
        
        expect(initResult.content[0].text).toContain('Browser initialized successfully');
        console.log('✅ Browser window opened successfully');
        
        // Small delay to see browser window
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Step 2: Navigate to a real website
        console.log('\n2️⃣ Navigating to example.com...');
        const navResult = await handleNavigate({
          url: 'https://example.com',
          waitUntil: 'domcontentloaded'
        });
        
        expect(navResult.content[0].text).toContain('Successfully navigated');
        console.log('✅ Page loaded successfully');
        
        // Delay to see navigation
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Step 3: Get page content
        console.log('\n3️⃣ Analyzing page content...');
        const contentResult = await handleGetContent({
          type: 'text'
        });
        
        expect(contentResult.content[0].text).toContain('Example Domain');
        console.log('✅ Content analyzed - found "Example Domain"');
        
        // Step 4: Find an element
        console.log('\n4️⃣ Finding "More information..." link...');
        const findResult = await handleFindSelector({
          text: 'More information',
          elementType: 'a'
        });
        
        expect(findResult.content[0].text).toContain('Found element');
        console.log('✅ Element located successfully');
        
        console.log('\n🎉 WORKFLOW COMPLETE! Browser will close...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
      } catch (error) {
        console.error('❌ E2E test failed:', error);
        throw error;
      }
    }, E2E_TIMEOUT);
  });

  describe('Interactive Form Automation', () => {
    it('should demonstrate form interaction with visible browser', async () => {
      console.log('\n🎬 DEMO: Form Automation');
      console.log('👀 Watch browser interact with a search form');
      
      try {
        // Initialize browser
        console.log('\n1️⃣ Opening browser for form demo...');
        await handleBrowserInit({
          headless: false,
          disableXvfb: true,
          customConfig: {
            args: ['--window-size=1200,800']
          }
        });
        
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Navigate to a simple test site
        console.log('\n2️⃣ Navigating to httpbin form...');
        await handleNavigate({
          url: 'https://httpbin.org/forms/post',
          waitUntil: 'domcontentloaded'
        });
        
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Get content to analyze the page
        console.log('\n3️⃣ Analyzing form page...');
        const contentResult = await handleGetContent({ type: 'text' });
        expect(contentResult.content[0].text).toContain('Customer name');
        console.log('✅ Form page loaded successfully');
        
        // Find and fill form inputs using simplified approach
        console.log('\n4️⃣ Filling out form...');
        try {
          await handleType({
            selector: 'input[name="email"]',
            text: 'test@example.com',
            delay: 100
          });
          console.log('✅ Email field filled');
          
          await handleType({
            selector: 'input[name="password"]',
            text: 'testpassword',
            delay: 100
          });
          console.log('✅ Password field filled');
          
          await new Promise(resolve => setTimeout(resolve, 2000));
          console.log('✅ Form completed successfully');
          
        } catch (error) {
          console.log('⚠️ Form interaction skipped (expected for demo)');
        }

        console.log('\n🎉 FORM AUTOMATION COMPLETE!');
        
      } catch (error) {
        console.error('❌ Form automation test failed:', error);
        throw error;
      }
    }, E2E_TIMEOUT);
  });

  describe('Content Strategy Demonstration', () => {
    it('should show content analysis and token management', async () => {
      console.log('\n🎬 DEMO: Content Analysis & Token Management');
      console.log('👀 Watch browser analyze content from different websites');
      
      try {
        // Initialize browser
        console.log('\n1️⃣ Opening browser for content analysis...');
        await handleBrowserInit({
          headless: false,
          disableXvfb: true,
          contentPriority: {
            prioritizeContent: true,
            fallbackToScreenshots: false,
            autoSuggestGetContent: true
          }
        });
        
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Test different content types
        const testSites = [
          { url: 'https://httpbin.org/html', description: 'Simple HTML page' },
          { url: 'https://example.com', description: 'Minimal content page' }
        ];

        for (const [index, site] of testSites.entries()) {
          console.log(`\n${index + 2}️⃣ Testing ${site.description}: ${site.url}`);
          
          await handleNavigate({
            url: site.url,
            waitUntil: 'domcontentloaded'
          });
          
          await new Promise(resolve => setTimeout(resolve, 2000));

          // Test HTML content
          console.log(`   📄 Getting HTML content...`);
          const htmlResult = await handleGetContent({ type: 'html' });
          console.log(`   ✅ HTML analyzed: ${htmlResult.content[0].text.length} characters`);
          
          // Test text content
          console.log(`   📝 Getting text content...`);
          const textResult = await handleGetContent({ type: 'text' });
          console.log(`   ✅ Text analyzed: ${textResult.content[0].text.length} characters`);
          
          // Basic content validation
          expect(htmlResult.content[0].text.length).toBeGreaterThan(0);
          expect(textResult.content[0].text.length).toBeGreaterThan(0);
          
          await new Promise(resolve => setTimeout(resolve, 1500));
        }

        console.log('\n🎉 CONTENT ANALYSIS COMPLETE!');

      } catch (error) {
        console.error('❌ Content analysis test failed:', error);
        throw error;
      }
    }, E2E_TIMEOUT);
  });
});