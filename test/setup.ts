// Test setup for Vitest MCP server tests
// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.CHROME_TEST_MODE = 'true';

// Configure test timeouts based on research findings
// Research shows default 5s Vitest timeout is too low for:
// - Browser initialization (can take 15-30s)
// - Server startup (can take 30-45s in some environments)
// - Integration test cleanup (needs proper process termination)
if (!process.env.VITEST_TEST_TIMEOUT) {
  process.env.VITEST_TEST_TIMEOUT = '60000'; // 60 seconds for integration tests
}
if (!process.env.VITEST_HOOK_TIMEOUT) {
  process.env.VITEST_HOOK_TIMEOUT = '45000'; // 45 seconds for setup/teardown
}
