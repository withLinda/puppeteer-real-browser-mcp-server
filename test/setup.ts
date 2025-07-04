// Test setup for Vitest MCP server tests
import { beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { spawn } from 'child_process';
import { platform } from 'os';

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

/**
 * Chrome Process Management for TDD Testing
 * Following TDD-specific-workflow-tutorial.md guidelines
 */

// Chrome process cleanup utility
async function killChromeProcesses(): Promise<void> {
  const isWindows = platform() === 'win32';
  
  try {
    if (isWindows) {
      // Windows: Kill Chrome processes
      await new Promise<void>((resolve) => {
        const killProcess = spawn('taskkill', ['/F', '/IM', 'chrome.exe'], { stdio: 'ignore' });
        killProcess.on('close', () => resolve());
        killProcess.on('error', () => resolve()); // Ignore errors
      });
    } else {
      // macOS/Linux: Kill Chrome processes
      await new Promise<void>((resolve) => {
        const killProcess = spawn('pkill', ['-f', 'Google Chrome'], { stdio: 'ignore' });
        killProcess.on('close', () => resolve());
        killProcess.on('error', () => resolve()); // Ignore errors
      });
    }
    
    // Additional cleanup for zombie processes
    await new Promise<void>((resolve) => {
      const killChrome = spawn('pkill', ['-f', 'chrome'], { stdio: 'ignore' });
      killChrome.on('close', () => resolve());
      killChrome.on('error', () => resolve()); // Ignore errors
    });
  } catch (error) {
    // Ignore cleanup errors in tests
    console.warn('Chrome cleanup warning (non-fatal):', error.message);
  }
}

// Check Chrome process count
async function getChromeProcessCount(): Promise<number> {
  return new Promise((resolve) => {
    const psProcess = spawn('ps', ['aux'], { stdio: ['ignore', 'pipe', 'ignore'] });
    let output = '';
    
    psProcess.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    psProcess.on('close', () => {
      const chromeLines = output.split('\n').filter(line => 
        line.includes('chrome') || line.includes('Google Chrome')
      );
      resolve(chromeLines.length);
    });
    
    psProcess.on('error', () => resolve(0)); // Default to 0 on error
  });
}

// Global test setup
beforeAll(async () => {
  console.log('🧪 Starting TDD test session - cleaning up Chrome processes...');
  
  // Clean up any existing Chrome processes before starting tests
  await killChromeProcesses();
  
  // Wait for processes to be cleaned up
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const processCount = await getChromeProcessCount();
  console.log(`📊 Chrome processes after cleanup: ${processCount}`);
});

// Clean up after each test to prevent Chrome zombie processes
afterEach(async () => {
  // Kill any Chrome processes that might have been left behind
  await killChromeProcesses();
  
  // Small delay to ensure cleanup
  await new Promise(resolve => setTimeout(resolve, 500));
});

// Final cleanup after all tests
afterAll(async () => {
  console.log('🧹 TDD test session complete - final Chrome cleanup...');
  
  // Final cleanup
  await killChromeProcesses();
  
  // Verify cleanup
  const finalProcessCount = await getChromeProcessCount();
  console.log(`✅ Final Chrome processes: ${finalProcessCount}`);
  
  if (finalProcessCount > 0) {
    console.warn('⚠️  Warning: Some Chrome processes may still be running');
  }
});

// Export utilities for use in tests
export { killChromeProcesses, getChromeProcessCount };