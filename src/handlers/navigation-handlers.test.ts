/**
 * Unit Tests for Navigation Handlers
 * 
 * Following TDD Red-Green-Refactor methodology with 2025 best practices:
 * - AAA Pattern (Arrange-Act-Assert)
 * - Comprehensive mocking of dependencies
 * - Navigation retry logic and timeout testing
 * - Wait operations and workflow validation testing
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleNavigate, handleWait } from './navigation-handlers.js';
import { NavigateArgs, WaitArgs } from '../tool-definitions.js';

// Mock all external dependencies
vi.mock('../browser-manager', () => ({
  getBrowserInstance: vi.fn(),
  getPageInstance: vi.fn()
}));

vi.mock('../system-utils', () => ({
  withErrorHandling: vi.fn((operation: () => Promise<any>, errorMessage: string) => operation()),
  withTimeout: vi.fn((operation: () => Promise<any>, timeout: number, context: string) => operation())
}));

vi.mock('../workflow-validation', () => ({
  validateWorkflow: vi.fn(),
  recordExecution: vi.fn(),
  workflowValidator: {
    getValidationSummary: vi.fn()
  }
}));

// Mock setTimeout globally - track delays without immediate execution for exponential backoff testing
const setTimeoutMock = vi.fn((callback: (...args: any[]) => void, delay: number) => {
  // Store the delay for assertion while allowing async execution
  setTimeout(() => {
    if (typeof callback === 'function') {
      callback();
    }
  }, 0); // Execute asynchronously but immediately for test speed
  return 1 as any;
});
vi.stubGlobal('setTimeout', setTimeoutMock);

// Import mocked modules
import * as browserManager from '../browser-manager.js';
import * as systemUtils from '../system-utils.js';
import * as workflowValidation from '../workflow-validation.js';

describe('Navigation Handlers', () => {
  let mockBrowserManager: any;
  let mockSystemUtils: any;
  let mockWorkflowValidation: any;
  let mockPageInstance: any;

  beforeEach(() => {
    vi.clearAllMocks();
    setTimeoutMock.mockClear(); // Clear setTimeout mock calls between tests
    
    // Setup mocks
    mockBrowserManager = browserManager;
    mockSystemUtils = systemUtils;
    mockWorkflowValidation = workflowValidation;

    // Mock page instance with navigation methods
    mockPageInstance = {
      goto: vi.fn(),
      waitForSelector: vi.fn(),
      waitForNavigation: vi.fn()
    };

    // Default mock implementations
    mockWorkflowValidation.validateWorkflow.mockReturnValue({
      isValid: true,
      errorMessage: null,
      suggestedAction: null
    });

    mockBrowserManager.getPageInstance.mockReturnValue(mockPageInstance);
  });

  describe('Navigate Handler', () => {
    describe('Successful Navigation', () => {
      it('should navigate to URL successfully', async () => {
        // Arrange: Basic navigation args
        const args: NavigateArgs = { url: 'https://example.com' };

        mockPageInstance.goto.mockResolvedValue(undefined);

        // Act: Navigate to URL
        const result = await handleNavigate(args);

        // Assert: Should navigate successfully
        expect(mockPageInstance.goto).toHaveBeenCalledWith(
          'https://example.com',
          { waitUntil: 'networkidle2', timeout: 60000 }
        );
        expect(mockWorkflowValidation.validateWorkflow).toHaveBeenCalledWith('navigate', args);
        expect(mockWorkflowValidation.recordExecution).toHaveBeenCalledWith('navigate', args, true);
        
        expect(result).toHaveProperty('content');
        expect(result.content[0].type).toBe('text');
        expect(result.content[0].text).toContain('Successfully navigated to https://example.com');
        expect(result.content[0].text).toContain('Workflow Status: Page loaded');
        expect(result.content[0].text).toContain('Next step: Use get_content');
      });

      it('should navigate with custom waitUntil option', async () => {
        // Arrange: Navigation with custom wait condition
        const args: NavigateArgs = { url: 'https://example.com', waitUntil: 'load' };

        mockPageInstance.goto.mockResolvedValue(undefined);

        // Act: Navigate with custom wait condition
        const result = await handleNavigate(args);

        // Assert: Should use custom waitUntil
        expect(mockPageInstance.goto).toHaveBeenCalledWith(
          'https://example.com',
          { waitUntil: 'load', timeout: 60000 }
        );
        expect(result.content[0].text).toContain('Successfully navigated to https://example.com');
      });

      it('should include comprehensive workflow guidance', async () => {
        // Arrange: Successful navigation
        const args: NavigateArgs = { url: 'https://test.com' };

        mockPageInstance.goto.mockResolvedValue(undefined);

        // Act: Navigate
        const result = await handleNavigate(args);

        // Assert: Should include workflow guidance
        expect(result.content[0].text).toContain('Next step: Use get_content to analyze page content');
        expect(result.content[0].text).toContain('Then: Use find_selector to locate elements');
        expect(result.content[0].text).toContain('Finally: Use interaction tools (click, type)');
        expect(result.content[0].text).toContain('Ready for content analysis and interactions');
      });
    });

    describe('Navigation Retry Logic', () => {
      it('should retry navigation on failure and succeed', async () => {
        // Arrange: Navigation fails first time, succeeds second time
        const args: NavigateArgs = { url: 'https://retry.com' };

        mockPageInstance.goto
          .mockRejectedValueOnce(new Error('Network error'))
          .mockResolvedValueOnce(undefined);

        // Act: Navigate with retry
        const result = await handleNavigate(args);

        // Assert: Should retry and succeed
        expect(mockPageInstance.goto).toHaveBeenCalledTimes(2);
        expect(result.content[0].text).toContain('Successfully navigated to https://retry.com');
      });

      it('should retry navigation multiple times before giving up', async () => {
        // Arrange: Navigation fails all attempts
        const args: NavigateArgs = { url: 'https://fail.com' };
        const networkError = new Error('Persistent network error');

        mockPageInstance.goto.mockRejectedValue(networkError);

        // Act & Assert: Should retry 3 times then fail
        await expect(handleNavigate(args)).rejects.toThrow('Persistent network error');
        
        expect(mockPageInstance.goto).toHaveBeenCalledTimes(3);
        expect(mockWorkflowValidation.recordExecution).toHaveBeenCalledWith(
          'navigate',
          args,
          false,
          'Persistent network error'
        );
      });

      it('should use exponential backoff between retries', async () => {
        // Arrange: Navigation fails with retries
        const args: NavigateArgs = { url: 'https://backoff.com' };

        mockPageInstance.goto.mockRejectedValue(new Error('Timeout'));

        // Act: Attempt navigation (will fail after retries)
        try {
          await handleNavigate(args);
        } catch (error) {
          // Expected to fail
        }

        // Assert: Should use exponential backoff delays
        expect(setTimeoutMock).toHaveBeenCalledWith(expect.any(Function), 1000); // First retry: 1s
        expect(setTimeoutMock).toHaveBeenCalledWith(expect.any(Function), 2000); // Second retry: 2s
      });
    });

    describe('Navigation Error Handling', () => {
      it('should throw error when browser not initialized', async () => {
        // Arrange: No page instance
        const args: NavigateArgs = { url: 'https://example.com' };

        mockBrowserManager.getPageInstance.mockReturnValue(null);

        // Act & Assert: Should throw browser not initialized error
        await expect(handleNavigate(args)).rejects.toThrow(
          'Browser not initialized. Call browser_init first.'
        );
      });

      it('should handle workflow validation failure', async () => {
        // Arrange: Invalid workflow state
        const args: NavigateArgs = { url: 'https://example.com' };

        mockWorkflowValidation.validateWorkflow.mockReturnValue({
          isValid: false,
          errorMessage: 'Cannot navigate in current state',
          suggestedAction: 'Initialize browser first'
        });

        // Act & Assert: Should throw workflow validation error
        await expect(handleNavigate(args)).rejects.toThrow(
          /Cannot navigate in current state.*Next Steps: Initialize browser first/s
        );
      });

      it('should handle timeout errors from withTimeout wrapper', async () => {
        // Arrange: Navigation that times out
        const args: NavigateArgs = { url: 'https://timeout.com' };

        mockSystemUtils.withTimeout.mockImplementation(async (operation: () => Promise<any>, timeout: number, context: string) => {
          throw new Error(`Operation timed out after ${timeout}ms in context: ${context}`);
        });

        // Act & Assert: Should handle timeout
        await expect(handleNavigate(args)).rejects.toThrow('Operation timed out after 60000ms in context: page-navigation');
      });
    });
  });

  describe('Wait Handler', () => {
    describe('Selector Waiting', () => {
      it('should wait for selector successfully', async () => {
        // Arrange: Wait for selector args
        const args: WaitArgs = { type: 'selector', value: '.loading-complete' };

        mockPageInstance.waitForSelector.mockResolvedValue({});

        // Act: Wait for selector
        const result = await handleWait(args);

        // Assert: Should wait for selector
        expect(mockPageInstance.waitForSelector).toHaveBeenCalledWith(
          '.loading-complete',
          { timeout: 30000, visible: true }
        );
        expect(mockWorkflowValidation.validateWorkflow).toHaveBeenCalledWith('wait', args);
        expect(mockWorkflowValidation.recordExecution).toHaveBeenCalledWith('wait', args, true);
        
        expect(result.content[0].text).toContain('Wait completed successfully for selector: .loading-complete');
        expect(result.content[0].text).toMatch(/\(\d+ms\)$/); // Should include duration
      });

      it('should wait for selector with custom timeout', async () => {
        // Arrange: Wait with custom timeout
        const args: WaitArgs = { type: 'selector', value: '#element', timeout: 10000 };

        mockPageInstance.waitForSelector.mockResolvedValue({});

        // Act: Wait with custom timeout
        const result = await handleWait(args);

        // Assert: Should use custom timeout
        expect(mockPageInstance.waitForSelector).toHaveBeenCalledWith(
          '#element',
          { timeout: 10000, visible: true }
        );
        expect(result.content[0].text).toContain('Wait completed successfully for selector: #element');
      });
    });

    describe('Navigation Waiting', () => {
      it('should wait for navigation successfully', async () => {
        // Arrange: Wait for navigation
        const args: WaitArgs = { type: 'navigation', value: '' };

        mockPageInstance.waitForNavigation.mockResolvedValue(undefined);

        // Act: Wait for navigation
        const result = await handleWait(args);

        // Assert: Should wait for navigation
        expect(mockPageInstance.waitForNavigation).toHaveBeenCalledWith({
          timeout: 30000,
          waitUntil: 'networkidle2'
        });
        expect(result.content[0].text).toContain('Wait completed successfully for navigation:');
      });

      it('should wait for navigation with custom timeout', async () => {
        // Arrange: Navigation wait with custom timeout
        const args: WaitArgs = { type: 'navigation', value: '', timeout: 45000 };

        mockPageInstance.waitForNavigation.mockResolvedValue(undefined);

        // Act: Wait for navigation
        await handleWait(args);

        // Assert: Should use custom timeout
        expect(mockPageInstance.waitForNavigation).toHaveBeenCalledWith({
          timeout: 45000,
          waitUntil: 'networkidle2'
        });
      });
    });

    describe('Timeout Waiting', () => {
      it('should wait for specified timeout successfully', async () => {
        // Arrange: Timeout wait
        const args: WaitArgs = { type: 'timeout', value: '2000' };

        // Act: Wait for timeout
        const result = await handleWait(args);

        // Assert: Should wait for specified time
        expect(setTimeoutMock).toHaveBeenCalledWith(expect.any(Function), 2000);
        expect(result.content[0].text).toContain('Wait completed successfully for timeout: 2000');
      });

      it('should limit timeout to maximum allowed', async () => {
        // Arrange: Very long timeout (should be limited)
        const args: WaitArgs = { type: 'timeout', value: '60000', timeout: 10000 };

        // Act: Wait with limited timeout
        const result = await handleWait(args);

        // Assert: Should limit to maximum timeout
        expect(setTimeoutMock).toHaveBeenCalledWith(expect.any(Function), 10000); // Limited to timeout
        expect(result.content[0].text).toContain('Wait completed successfully for timeout: 60000');
      });

      it('should throw error for invalid timeout value', async () => {
        // Arrange: Invalid timeout value
        const args: WaitArgs = { type: 'timeout', value: 'invalid' };

        // Act & Assert: Should throw error for invalid value
        await expect(handleWait(args)).rejects.toThrow('Timeout value must be a number');
        
        expect(mockWorkflowValidation.recordExecution).toHaveBeenCalledWith(
          'wait',
          args,
          false,
          'Timeout value must be a number'
        );
      });
    });

    describe('Wait Error Handling', () => {
      it('should throw error for unsupported wait type', async () => {
        // Arrange: Unsupported wait type
        const args: WaitArgs = { type: 'unsupported' as any, value: 'test' };

        // Act & Assert: Should throw unsupported type error
        await expect(handleWait(args)).rejects.toThrow('Unsupported wait type: unsupported');
      });

      it('should throw error when browser not initialized', async () => {
        // Arrange: No page instance
        const args: WaitArgs = { type: 'selector', value: '.element' };

        mockBrowserManager.getPageInstance.mockReturnValue(null);

        // Act & Assert: Should throw browser not initialized error
        await expect(handleWait(args)).rejects.toThrow(
          'Browser not initialized. Call browser_init first.'
        );
      });

      it('should handle selector wait timeout', async () => {
        // Arrange: Selector wait that times out
        const args: WaitArgs = { type: 'selector', value: '.missing-element' };

        mockPageInstance.waitForSelector.mockRejectedValue(new Error('Timeout waiting for selector'));

        // Act & Assert: Should handle timeout error
        await expect(handleWait(args)).rejects.toThrow('Timeout waiting for selector');
        
        expect(mockWorkflowValidation.recordExecution).toHaveBeenCalledWith(
          'wait',
          args,
          false,
          'Timeout waiting for selector'
        );
      });

      it('should handle navigation wait timeout', async () => {
        // Arrange: Navigation wait that times out
        const args: WaitArgs = { type: 'navigation', value: '' };

        mockPageInstance.waitForNavigation.mockRejectedValue(new Error('Navigation timeout'));

        // Act & Assert: Should handle navigation timeout
        await expect(handleWait(args)).rejects.toThrow('Navigation timeout');
      });
    });

    describe('Wait Timing and Duration', () => {
      it('should track and report wait duration', async () => {
        // Arrange: Test that duration is included in response
        const args: WaitArgs = { type: 'selector', value: '.element' };
        mockPageInstance.waitForSelector.mockResolvedValue({});

        // Act: Wait for selector
        const result = await handleWait(args);

        // Assert: Should report duration in result (any valid duration format)
        expect(result.content[0].text).toMatch(/\(\d+ms\)$/);
        expect(result.content[0].text).toContain('Wait completed successfully for selector: .element');
      });

      it('should handle wait operations with consistent duration reporting', async () => {
        // Arrange: Test timeout wait which is more predictable
        const args: WaitArgs = { type: 'timeout', value: '100' };

        // Act: Wait for timeout
        const result = await handleWait(args);

        // Assert: Should report completion with duration
        expect(result.content[0].text).toMatch(/\(\d+ms\)$/);
        expect(result.content[0].text).toContain('Wait completed successfully for timeout: 100');
      });
    });
  });

  describe('Workflow Validation Integration', () => {
    it('should validate workflow before navigation operations', async () => {
      // Arrange: Valid navigation request
      const args: NavigateArgs = { url: 'https://example.com' };
      mockPageInstance.goto.mockResolvedValue(undefined);

      // Act: Execute navigation
      await handleNavigate(args);

      // Assert: Should validate workflow first
      expect(mockWorkflowValidation.validateWorkflow).toHaveBeenCalled();
    });

    it('should validate workflow before wait operations', async () => {
      // Arrange: Valid wait request
      const args: WaitArgs = { type: 'selector', value: '.element' };
      mockPageInstance.waitForSelector.mockResolvedValue({});

      // Act: Execute wait
      await handleWait(args);

      // Assert: Should validate workflow first
      expect(mockWorkflowValidation.validateWorkflow).toHaveBeenCalled();
    });

    it('should record successful executions', async () => {
      // Arrange: Successful operation
      const args: NavigateArgs = { url: 'https://success.com' };
      mockPageInstance.goto.mockResolvedValue(undefined);

      // Act: Execute successful operation
      await handleNavigate(args);

      // Assert: Should record success
      expect(mockWorkflowValidation.recordExecution).toHaveBeenCalledWith('navigate', args, true);
    });

    it('should record failed executions with error details', async () => {
      // Arrange: Operation that will fail
      const args: WaitArgs = { type: 'timeout', value: 'invalid' };

      // Act: Execute failing operation
      try {
        await handleWait(args);
      } catch (error) {
        // Expected to fail
      }

      // Assert: Should record failure with details
      expect(mockWorkflowValidation.recordExecution).toHaveBeenCalledWith(
        'wait',
        args,
        false,
        'Timeout value must be a number'
      );
    });
  });

  describe('System Integration', () => {
    it('should use error handling wrapper for navigation', async () => {
      // Arrange: Navigation operation
      const args: NavigateArgs = { url: 'https://example.com' };
      mockPageInstance.goto.mockResolvedValue(undefined);

      // Act: Execute navigation
      await handleNavigate(args);

      // Assert: Should use error handling
      expect(mockSystemUtils.withErrorHandling).toHaveBeenCalledWith(
        expect.any(Function),
        'Failed to navigate'
      );
    });

    it('should use error handling wrapper for wait operations', async () => {
      // Arrange: Wait operation
      const args: WaitArgs = { type: 'selector', value: '.element' };
      mockPageInstance.waitForSelector.mockResolvedValue({});

      // Act: Execute wait
      await handleWait(args);

      // Assert: Should use error handling
      expect(mockSystemUtils.withErrorHandling).toHaveBeenCalledWith(
        expect.any(Function),
        'Wait operation failed'
      );
    });

    it('should use timeout wrapper for navigation', async () => {
      // Arrange: Navigation operation
      const args: NavigateArgs = { url: 'https://example.com' };
      mockPageInstance.goto.mockResolvedValue(undefined);

      // Act: Execute navigation
      await handleNavigate(args);

      // Assert: Should use timeout wrapper
      expect(mockSystemUtils.withTimeout).toHaveBeenCalledWith(
        expect.any(Function),
        60000,
        'page-navigation'
      );
    });
  });
});