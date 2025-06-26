// Test setup for MCP server tests
import { jest } from '@jest/globals';

// Set longer timeout for browser operations
jest.setTimeout(30000);

// Mock environment variables for testing
process.env.NODE_ENV = 'test';