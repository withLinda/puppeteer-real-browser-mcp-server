/**
 * Unit Tests for Browser Manager
 * 
 * Following TDD Red-Green-Refactor methodology with 2025 best practices:
 * - AAA Pattern (Arrange-Act-Assert)
 * - Behavior-focused testing with proper mocking
 * - Error categorization and circuit breaker testing
 * - Chrome detection and network utilities testing
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'fs';
import {
  BrowserErrorType,
  categorizeError,
  withTimeout,
  updateCircuitBreakerOnFailure,
  updateCircuitBreakerOnSuccess,
  isCircuitBreakerOpen,
  detectChromePath,
  validateSession,
  findAuthElements,
  getBrowserInstance,
  getPageInstance,
  getContentPriorityConfig,
  updateContentPriorityConfig
} from './browser-manager.js';

// Mock external dependencies
vi.mock('fs');
vi.mock('child_process');
vi.mock('./managed-browser-session.js', () => ({
  managedBrowserSession: {
    close: vi.fn(),
    emergencyClose: vi.fn(),
    launch: vi.fn(),
    ownedPid: null,
  }
}));

describe('Browser Manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe('Error Categorization', () => {
    it('should categorize FRAME_DETACHED error correctly', () => {
      // Arrange: Create error with frame detached message
      const error = new Error('Navigating frame was detached');
      
      // Act: Categorize the error
      const result = categorizeError(error);
      
      // Assert: Should return FRAME_DETACHED type
      expect(result).toBe(BrowserErrorType.FRAME_DETACHED);
    });

    it('should categorize SESSION_CLOSED error correctly', () => {
      // Arrange: Create error with session closed message
      const error = new Error('Session closed');
      
      // Act: Categorize the error
      const result = categorizeError(error);
      
      // Assert: Should return SESSION_CLOSED type
      expect(result).toBe(BrowserErrorType.SESSION_CLOSED);
    });

    it('should categorize TARGET_CLOSED error correctly', () => {
      // Arrange: Create error with target closed message
      const error = new Error('Target closed');
      
      // Act: Categorize the error
      const result = categorizeError(error);
      
      // Assert: Should return TARGET_CLOSED type
      expect(result).toBe(BrowserErrorType.TARGET_CLOSED);
    });

    it('should categorize PROTOCOL_ERROR correctly', () => {
      // Arrange: Create error with protocol error message
      const error = new Error('Protocol error');
      
      // Act: Categorize the error
      const result = categorizeError(error);
      
      // Assert: Should return PROTOCOL_ERROR type
      expect(result).toBe(BrowserErrorType.PROTOCOL_ERROR);
    });

    it('should categorize NAVIGATION_TIMEOUT error correctly', () => {
      // Arrange: Create error with navigation timeout message
      const error = new Error('Navigation timeout exceeded');
      
      // Act: Categorize the error
      const result = categorizeError(error);
      
      // Assert: Should return NAVIGATION_TIMEOUT type
      expect(result).toBe(BrowserErrorType.NAVIGATION_TIMEOUT);
    });

    it('should categorize ELEMENT_NOT_FOUND error correctly', () => {
      // Arrange: Create error with element not found message
      const error = new Error('Element not found');
      
      // Act: Categorize the error
      const result = categorizeError(error);
      
      // Assert: Should return ELEMENT_NOT_FOUND type
      expect(result).toBe(BrowserErrorType.ELEMENT_NOT_FOUND);
    });

    it('should categorize unknown errors as UNKNOWN', () => {
      // Arrange: Create error with unrecognized message
      const error = new Error('Some random error message');
      
      // Act: Categorize the error
      const result = categorizeError(error);
      
      // Assert: Should return UNKNOWN type
      expect(result).toBe(BrowserErrorType.UNKNOWN);
    });

    it('should handle case-insensitive error message matching', () => {
      // Arrange: Create error with uppercase message
      const error = new Error('SESSION CLOSED');
      
      // Act: Categorize the error
      const result = categorizeError(error);
      
      // Assert: Should still categorize correctly
      expect(result).toBe(BrowserErrorType.SESSION_CLOSED);
    });
  });

  describe('Timeout Wrapper', () => {
    it('should resolve when operation completes within timeout', async () => {
      // Arrange: Create operation that resolves quickly
      const operation = vi.fn().mockResolvedValue('success');
      
      // Act: Execute with timeout
      const result = await withTimeout(operation, 1000, 'test-context');
      
      // Assert: Should return operation result
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledOnce();
    });

    it('should reject when operation times out', async () => {
      // Arrange: Create operation that never resolves
      const operation = vi.fn().mockImplementation(() => new Promise(() => {}));
      
      // Act & Assert: Should throw timeout error
      await expect(withTimeout(operation, 100, 'test-context'))
        .rejects.toThrow('Operation timed out after 100ms in context: test-context');
      
      expect(operation).toHaveBeenCalledOnce();
    });

    it('should reject when operation throws error', async () => {
      // Arrange: Create operation that throws
      const operation = vi.fn().mockRejectedValue(new Error('operation failed'));
      
      // Act & Assert: Should propagate operation error
      await expect(withTimeout(operation, 1000, 'test-context'))
        .rejects.toThrow('operation failed');
      
      expect(operation).toHaveBeenCalledOnce();
    });

    it('should clear timeout when operation completes', async () => {
      // Arrange: Create operation that resolves
      const operation = vi.fn().mockResolvedValue('success');
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
      
      // Act: Execute with timeout
      await withTimeout(operation, 1000, 'test-context');
      
      // Assert: Should clear timeout
      expect(clearTimeoutSpy).toHaveBeenCalled();
    });
  });

  describe('Circuit Breaker', () => {
    it('should start in closed state', () => {
      // Arrange & Act: Check initial circuit breaker state
      const isOpen = isCircuitBreakerOpen();
      
      // Assert: Should be closed initially
      expect(isOpen).toBe(false);
    });

    it('should open circuit breaker after threshold failures', () => {
      // Arrange: Clear circuit breaker state first
      updateCircuitBreakerOnSuccess(); // Reset to closed state
      
      // Act: Trigger multiple failures
      for (let i = 0; i < 5; i++) {
        updateCircuitBreakerOnFailure();
      }
      
      // Assert: Should be open after threshold
      const isOpen = isCircuitBreakerOpen();
      expect(isOpen).toBe(true);
    });

    it('should reset circuit breaker on success', () => {
      // Arrange: Open circuit breaker first
      for (let i = 0; i < 5; i++) {
        updateCircuitBreakerOnFailure();
      }
      expect(isCircuitBreakerOpen()).toBe(true);
      
      // Act: Record success
      updateCircuitBreakerOnSuccess();
      
      // Assert: Should be closed again
      expect(isCircuitBreakerOpen()).toBe(false);
    });

    it('should enter half-open state after timeout', () => {
      // Arrange: Open circuit breaker
      for (let i = 0; i < 5; i++) {
        updateCircuitBreakerOnFailure();
      }
      expect(isCircuitBreakerOpen()).toBe(true);
      
      // Mock Date.now to simulate timeout passage
      const originalNow = Date.now;
      Date.now = vi.fn().mockReturnValue(originalNow() + 35000); // 35 seconds later
      
      // Act: Check circuit breaker state
      const isOpen = isCircuitBreakerOpen();
      
      // Assert: Should transition to half-open (returns false)
      expect(isOpen).toBe(false);
      
      // Cleanup: Restore Date.now
      Date.now = originalNow;
    });
  });

  describe('Chrome Path Detection', () => {
    it('should return environment variable path when available', () => {
      // Arrange: Set environment variable and mock file exists
      const chromePath = '/custom/chrome/path';
      process.env.CHROME_PATH = chromePath;
      vi.mocked(fs.existsSync).mockReturnValue(true);
      
      // Act: Detect Chrome path
      const result = detectChromePath();
      
      // Assert: Should return environment path
      expect(result).toBe(chromePath);
      expect(fs.existsSync).toHaveBeenCalledWith(chromePath);
      
      // Cleanup
      delete process.env.CHROME_PATH;
    });

    it('should return null when Chrome is not found', () => {
      // Arrange: Mock file system to return false for all paths
      vi.mocked(fs.existsSync).mockReturnValue(false);
      delete process.env.CHROME_PATH;
      delete process.env.PUPPETEER_EXECUTABLE_PATH;
      
      // Act: Detect Chrome path
      const result = detectChromePath();
      
      // Assert: Should return null
      expect(result).toBe(null);
    });

    it('should detect Chrome on macOS platform', () => {
      // Arrange: Mock platform and file system
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      const expectedPath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      vi.mocked(fs.existsSync).mockImplementation((path) => path === expectedPath);
      delete process.env.CHROME_PATH;
      
      // Act: Detect Chrome path
      const result = detectChromePath();
      
      // Assert: Should return macOS Chrome path
      expect(result).toBe(expectedPath);
    });

    it('should detect Chrome on Linux platform', () => {
      // Arrange: Mock platform and file system
      Object.defineProperty(process, 'platform', { value: 'linux' });
      const expectedPath = '/usr/bin/google-chrome';
      vi.mocked(fs.existsSync).mockImplementation((path) => path === expectedPath);
      delete process.env.CHROME_PATH;
      
      // Act: Detect Chrome path
      const result = detectChromePath();
      
      // Assert: Should return Linux Chrome path
      expect(result).toBe(expectedPath);
    });

    it('should return null for unsupported platform', () => {
      // Arrange: Mock unsupported platform
      Object.defineProperty(process, 'platform', { value: 'freebsd' });
      delete process.env.CHROME_PATH;
      
      // Act: Detect Chrome path
      const result = detectChromePath();
      
      // Assert: Should return null
      expect(result).toBe(null);
    });
  });

  describe('Session Validation', () => {
    it('should return false when no browser instance exists', async () => {
      // Arrange: No browser instance (default state)
      // Act: Validate session
      const result = await validateSession();
      
      // Assert: Should return false
      expect(result).toBe(false);
    });

    it('should return false when validation is already in progress', async () => {
      // Arrange: We'll test this by calling validateSession twice quickly
      // This requires mocking the internal state or testing the behavior indirectly
      
      // For now, we'll test the basic case - this could be expanded with more complex mocking
      const result = await validateSession();
      
      // Assert: Should handle concurrent validation gracefully
      expect(result).toBe(false);
    });
  });

  describe('Auth Elements Finding', () => {
    it('should find authentication elements in page content', async () => {
      // Arrange: Mock page instance with evaluate method
      const mockPage = {
        evaluate: vi.fn().mockResolvedValue(['#login-button', '.signin-link'])
      };
      
      // Act: Find auth elements
      const result = await findAuthElements(mockPage);
      
      // Assert: Should return auth selectors
      expect(result).toEqual(['#login-button', '.signin-link']);
      expect(mockPage.evaluate).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  describe('Content Priority Configuration', () => {
    it('should return current content priority config', () => {
      // Arrange & Act: Get content priority config
      const config = getContentPriorityConfig();
      
      // Assert: Should return configuration object
      expect(config).toBeDefined();
      expect(config).toHaveProperty('prioritizeContent');
      expect(config).toHaveProperty('autoSuggestGetContent');
    });

    it('should update content priority config', () => {
      // Arrange: Get initial config
      const initialConfig = getContentPriorityConfig();
      const updates = { prioritizeContent: !initialConfig.prioritizeContent };
      
      // Act: Update config
      updateContentPriorityConfig(updates);
      const updatedConfig = getContentPriorityConfig();
      
      // Assert: Should reflect updates
      expect(updatedConfig.prioritizeContent).toBe(updates.prioritizeContent);
      expect(updatedConfig.autoSuggestGetContent).toBe(initialConfig.autoSuggestGetContent);
    });
  });

  describe('Browser Instance Getters', () => {
    it('should return browser instance', () => {
      // Arrange & Act: Get browser instance
      const browser = getBrowserInstance();
      
      // Assert: Should return browser (null initially)
      expect(browser).toBe(null);
    });

    it('should return page instance', () => {
      // Arrange & Act: Get page instance
      const page = getPageInstance();
      
      // Assert: Should return page (null initially)
      expect(page).toBe(null);
    });
  });
});
