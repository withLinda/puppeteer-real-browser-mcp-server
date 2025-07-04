#!/usr/bin/env node

const TestLogger = require('./test-logger');
const MCPTestClient = require('./mcp-test-client');

async function runSmokeTest() {
  const logger = new TestLogger('./test-logs');
  
  console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║     MCP Server Smoke Test                                         ║
║     puppeteer-real-browser-mcp-server                            ║
╚═══════════════════════════════════════════════════════════════════╝
  `);
  
  logger.log('Starting smoke test', 'INFO');
  
  const client = new MCPTestClient(logger);
  let browserInitialized = false;
  
  try {
    // Start server
    logger.log('Starting MCP server...', 'INFO');
    await client.start();
    
    // Initialize connection
    logger.log('Initializing MCP connection...', 'INFO');
    const initResult = await client.initialize();
    
    if (!initResult?.protocolVersion) {
      throw new Error('Failed to initialize MCP connection');
    }
    
    logger.log(`✅ MCP server connected (protocol: ${initResult.protocolVersion})`, 'SUCCESS');
    
    // Check tools
    const toolsResult = await client.listTools();
    logger.log(`✅ Found ${toolsResult.tools?.length || 0} tools`, 'SUCCESS');
    
    // Initialize browser
    logger.log('Initializing browser (headless)...', 'INFO');
    const browserResult = await client.callTool('browser_init', { headless: true });
    
    if (!browserResult?.content || browserResult.content.length === 0) {
      throw new Error('Failed to initialize browser');
    }
    browserInitialized = true;
    logger.log('✅ Browser initialized', 'SUCCESS');
    
    // Navigate
    logger.log('Navigating to example.com...', 'INFO');
    const navResult = await client.callTool('navigate', { 
      url: 'https://example.com',
      waitUntil: 'networkidle2'
    });
    
    if (!navResult?.content || navResult.content.length === 0) {
      throw new Error('Failed to navigate');
    }
    logger.log('✅ Navigation successful', 'SUCCESS');
    
    // Get content instead of screenshot
    logger.log('Getting page content...', 'INFO');
    const contentResult = await client.callTool('get_content', { type: 'text' });
    
    if (!contentResult?.content || contentResult.content.length === 0) {
      throw new Error('Failed to get page content');
    }
    logger.log('✅ Content retrieved', 'SUCCESS');
    
    // Close browser
    logger.log('Closing browser...', 'INFO');
    const closeResult = await client.callTool('browser_close');
    
    if (!closeResult?.content || closeResult.content.length === 0) {
      throw new Error('Failed to close browser');
    }
    browserInitialized = false;
    logger.log('✅ Browser closed', 'SUCCESS');
    
    logger.log('\\n✅ SMOKE TEST PASSED - All basic operations successful!', 'SUCCESS');
    
  } catch (error) {
    logger.log(`\\n❌ SMOKE TEST FAILED: ${error.message}`, 'ERROR');
    
    if (browserInitialized) {
      try {
        await client.callTool('browser_close');
      } catch (e) {
        logger.log('Failed to close browser during cleanup', 'ERROR');
      }
    }
    
    process.exit(1);
  } finally {
    await client.stop();
    logger.saveResults();
  }
  
  process.exit(0);
}

// Run smoke test
runSmokeTest().catch(error => {
  console.error('Fatal error during smoke test:', error);
  process.exit(1);
});