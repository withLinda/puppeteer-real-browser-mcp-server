import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Enable global test APIs (describe, it, expect, etc.)
    globals: true,
    
    // Set test environment to Node.js for MCP server testing
    environment: 'node',
    
    // Test file patterns (co-located tests + test directory)
    include: [
      'src/**/*.{test,spec}.ts',
      'test/**/*.{test,spec}.ts',
      'scripts/**/*.{test,spec}.ts',
    ],
    
    // Exclude patterns
    exclude: ['node_modules', 'dist', 'tests/mcp-testing', 'test/e2e/**'],
    
    // Setup files
    setupFiles: ['./test/setup.ts'],
    
    // Test timeout (important for browser operations) - configurable via environment
    testTimeout: parseInt(process.env.VITEST_TEST_TIMEOUT || '60000'), // Default 60s, configurable
    
    // Hook timeout for setup/teardown (browser init/cleanup) - configurable via environment
    hookTimeout: parseInt(process.env.VITEST_HOOK_TIMEOUT || '45000'), // Default 45s, configurable
    
    // Server dependency configuration  
    server: {
      deps: {
        external: [],
      },
    },
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'node_modules/',
        'dist/',
        'test/',
        'tests/',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/*.d.ts',
        'vitest.config.ts'
      ],
      thresholds: {
        branches: 70,
        functions: 60,
        lines: 45,
        statements: 45,
      }
    },
    
    // Improved error reporting
    reporter: 'verbose',
    
    // Allow only for CI environments
    allowOnly: !process.env.CI,
    
    // Concurrent execution settings
    sequence: {
      concurrent: false
    },
    
    // Pool settings - use main thread for integration tests to allow process.chdir()
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: false,
        maxForks: 4,
        minForks: 1
      }
    }
  }
});
