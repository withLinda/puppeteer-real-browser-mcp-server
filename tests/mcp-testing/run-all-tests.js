#!/usr/bin/env node

const TestLogger = require('./test-logger');
const Phase1ProtocolTests = require('./phase1-protocol-tests');
const Phase2BrowserTests = require('./phase2-browser-tests');
const Phase3ErrorRecoveryTests = require('./phase3-error-recovery-tests');
const Phase4AdvancedFeaturesTests = require('./phase4-advanced-features-tests');

async function runAllTests() {
  const logger = new TestLogger('./test-logs');
  
  console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║     MCP Server Comprehensive Test Suite                           ║
║     puppeteer-real-browser-mcp-server                            ║
╚═══════════════════════════════════════════════════════════════════╝
  `);
  
  logger.log('Starting comprehensive MCP server testing', 'INFO');
  logger.log(`Test run ID: ${logger.currentTestRun}`, 'INFO');
  
  const phases = [
    { name: 'Phase 1', class: Phase1ProtocolTests },
    { name: 'Phase 2', class: Phase2BrowserTests },
    { name: 'Phase 3', class: Phase3ErrorRecoveryTests },
    { name: 'Phase 4', class: Phase4AdvancedFeaturesTests }
  ];
  
  // Run each phase
  for (const phase of phases) {
    try {
      logger.log(`\\nPreparing to run ${phase.name}...`, 'INFO');
      const testPhase = new phase.class(logger);
      await testPhase.run();
      
      // Small delay between phases
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      logger.log(`Failed to run ${phase.name}: ${error.message}`, 'ERROR');
    }
  }
  
  // Save results
  logger.saveResults();
  
  // Print summary
  console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║                        TEST SUMMARY                               ║
╚═══════════════════════════════════════════════════════════════════╝
  `);
  
  console.log(`Total Tests: ${logger.results.summary.totalTests}`);
  console.log(`✅ Passed: ${logger.results.summary.passed}`);
  console.log(`❌ Failed: ${logger.results.summary.failed}`);
  console.log(`⏭️  Skipped: ${logger.results.summary.skipped}`);
  
  if (logger.results.summary.errors.length > 0) {
    console.log(`\\n⚠️  Errors encountered: ${logger.results.summary.errors.length}`);
  }
  
  console.log(`\\nLogs saved to: ./test-logs/`);
  console.log(`- Full log: test-run-${logger.currentTestRun}.log`);
  console.log(`- Error log: errors-${logger.currentTestRun}.log`);
  console.log(`- JSON results: results-${logger.currentTestRun}.json`);
  console.log(`- Summary report: summary-${logger.currentTestRun}.md`);
  
  // Exit with appropriate code
  const exitCode = logger.results.summary.failed > 0 ? 1 : 0;
  process.exit(exitCode);
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run tests
runAllTests().catch(error => {
  console.error('Fatal error running tests:', error);
  process.exit(1);
});