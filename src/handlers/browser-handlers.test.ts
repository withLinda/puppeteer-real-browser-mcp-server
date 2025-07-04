/**
 * Unit Tests for Browser Handlers
 * 
 * Following TDD Red-Green-Refactor methodology with 2025 best practices:
 * - AAA Pattern (Arrange-Act-Assert)
 * - Comprehensive mocking of dependencies
 * - Workflow validation and error handling testing
 * - Browser initialization and cleanup testing
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleBrowserInit, handleBrowserClose } from './browser-handlers.js';
import { BrowserInitArgs } from '../tool-definitions.js';

// Mock all external dependencies
vi.mock('../browser-manager', () => ({
  initializeBrowser: vi.fn(),
  closeBrowser: vi.fn(),
  getBrowserInstance: vi.fn(),
  getPageInstance: vi.fn(),
  getContentPriorityConfig: vi.fn(),
  updateContentPriorityConfig: vi.fn()
}));

vi.mock('../system-utils', () => ({
  withErrorHandling: vi.fn(async (operation, errorMessage) => await operation())
}));

vi.mock('../workflow-validation', () => ({
  validateWorkflow: vi.fn(),
  recordExecution: vi.fn(),
  workflowValidator: {
    reset: vi.fn(),
    getValidationSummary: vi.fn()
  }
}));

// Import mocked modules
import * as browserManager from '../browser-manager.js';
import * as systemUtils from '../system-utils.js';
import * as workflowValidation from '../workflow-validation.js';

describe('Browser Handlers', () => {
  let mockBrowserManager: any;
  let mockSystemUtils: any;
  let mockWorkflowValidation: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup mocks
    mockBrowserManager = browserManager;
    mockSystemUtils = systemUtils;
    mockWorkflowValidation = workflowValidation;

    // Default mock implementations
    mockWorkflowValidation.validateWorkflow.mockReturnValue({
      isValid: true,
      errorMessage: null,
      suggestedAction: null
    });

    mockBrowserManager.getContentPriorityConfig.mockReturnValue({
      prioritizeContent: true,
      autoSuggestGetContent: true
    });
    
    // Ensure updateContentPriorityConfig is properly mocked
    mockBrowserManager.updateContentPriorityConfig.mockReturnValue(undefined);
    mockBrowserManager.initializeBrowser.mockResolvedValue(undefined);
    mockBrowserManager.closeBrowser.mockResolvedValue(undefined);
    
    // Ensure workflow validation functions are properly mocked
    mockWorkflowValidation.recordExecution.mockReturnValue(undefined);
    mockWorkflowValidation.workflowValidator.reset.mockReturnValue(undefined);
    mockWorkflowValidation.workflowValidator.getValidationSummary.mockReturnValue('Mock summary');
  });

  describe('Browser Initialization', () => {
    it('should initialize browser successfully with default settings', async () => {
      // Arrange: Basic browser init args
      const args: BrowserInitArgs = {
        headless: false,
        disableXvfb: false
      };

      mockBrowserManager.initializeBrowser.mockResolvedValue(undefined);

      // Act: Initialize browser
      const result = await handleBrowserInit(args);

      // Assert: Should initialize browser and return success message
      expect(mockBrowserManager.initializeBrowser).toHaveBeenCalledWith(
        expect.objectContaining({ 
          headless: false 
        })
      );
      expect(mockWorkflowValidation.validateWorkflow).toHaveBeenCalledWith('browser_init', 
        expect.objectContaining({ 
          headless: false 
        })
      );
      expect(mockWorkflowValidation.recordExecution).toHaveBeenCalledWith('browser_init', 
        expect.objectContaining({ 
          headless: false 
        }), true);
      
      expect(result).toHaveProperty('content');
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Browser initialized successfully');
      expect(result.content[0].text).toContain('Content Priority Mode'); // Should show because prioritizeContent is true
      expect(result.content[0].text).toContain('Workflow Status: Browser initialized');
    });

    it('should update content priority configuration when provided', async () => {
      // Arrange: Browser init args with content priority config
      const args: BrowserInitArgs = {
        headless: true,
        contentPriority: {
          prioritizeContent: false,
          autoSuggestGetContent: false
        }
      };

      // Mock the complete flow
      mockBrowserManager.initializeBrowser.mockResolvedValue(undefined);
      mockBrowserManager.getContentPriorityConfig.mockReturnValue({
        prioritizeContent: false,
        autoSuggestGetContent: false
      });

      // Act: Initialize browser with custom config
      const result = await handleBrowserInit(args);

      // Assert: Should update content priority config with the exact args passed
      expect(mockBrowserManager.updateContentPriorityConfig).toHaveBeenCalledWith(
        expect.objectContaining({
          prioritizeContent: false,
          autoSuggestGetContent: false
        })
      );
      expect(mockBrowserManager.getContentPriorityConfig).toHaveBeenCalled();
      expect(result.content[0].text).not.toContain('Content Priority Mode');
    });

    it('should handle browser initialization failure', async () => {
      // Arrange: Browser init args that will cause failure
      const args: BrowserInitArgs = { headless: false };
      const initError = new Error('Failed to start browser');

      mockBrowserManager.initializeBrowser.mockRejectedValue(initError);
      mockSystemUtils.withErrorHandling.mockImplementation(async (operation: () => Promise<any>, errorMessage: string) => {
        try {
          return await operation();
        } catch (error) {
          throw new Error(errorMessage);
        }
      });

      // Act & Assert: Should throw error
      await expect(handleBrowserInit(args)).rejects.toThrow('Failed to initialize browser');
      
      expect(mockBrowserManager.initializeBrowser).toHaveBeenCalledWith(args);
      expect(mockWorkflowValidation.recordExecution).toHaveBeenCalledWith(
        'browser_init', 
        args, 
        false, 
        'Failed to initialize browser'
      );
    });

    it('should handle workflow validation failure', async () => {
      // Arrange: Clear mocks for isolated test and set invalid workflow state
      vi.clearAllMocks();
      
      // Set up minimal required mocks for this test
      mockWorkflowValidation.validateWorkflow.mockReturnValue({
        isValid: false,
        errorMessage: 'Browser already initialized',
        suggestedAction: 'Close browser first'
      });

      mockWorkflowValidation.workflowValidator.getValidationSummary.mockReturnValue(
        'Current state: BROWSER_ACTIVE | Last action: browser_init'
      );
      
      mockWorkflowValidation.recordExecution.mockReturnValue(undefined);
      
      // Ensure initializeBrowser is not called by clearing its mock
      mockBrowserManager.initializeBrowser.mockClear();

      const args: BrowserInitArgs = { headless: false };

      // Act & Assert: Should throw workflow validation error
      await expect(handleBrowserInit(args)).rejects.toThrow(/Browser already initialized.*Next Steps: Close browser first/s);
      
      // Verify that browser initialization was NOT called due to validation failure
      expect(mockBrowserManager.initializeBrowser).not.toHaveBeenCalled();
      expect(mockWorkflowValidation.recordExecution).toHaveBeenCalledWith(
        'browser_init',
        expect.objectContaining({ headless: false }),
        false,
        expect.stringContaining('Browser already initialized')
      );
    });

    it('should include workflow guidance in success message', async () => {
      // Arrange: Set up for successful initialization (keep existing mock setup)
      mockWorkflowValidation.validateWorkflow.mockReturnValue({
        isValid: true,
        errorMessage: null,
        suggestedAction: null
      });
      mockBrowserManager.getContentPriorityConfig.mockReturnValue({
        prioritizeContent: true,
        autoSuggestGetContent: true
      });
      
      const args: BrowserInitArgs = { headless: false };
      mockBrowserManager.initializeBrowser.mockResolvedValue(undefined);

      // Act: Initialize browser
      const result = await handleBrowserInit(args);

      // Assert: Should include comprehensive workflow guidance
      expect(result.content[0].text).toContain('Next step: Use navigate to load a web page');
      expect(result.content[0].text).toContain('Then: Use get_content to analyze page content');
      expect(result.content[0].text).toContain('Finally: Use find_selector and interaction tools');
      expect(result.content[0].text).toContain('Workflow validation is now active');
      expect(result.content[0].text).toContain('prevents blind selector guessing');
    });
  });

  describe('Browser Close', () => {
    it('should close browser successfully', async () => {
      // Arrange: Setup for browser close
      mockBrowserManager.closeBrowser.mockResolvedValue(undefined);

      // Act: Close browser
      const result = await handleBrowserClose();

      // Assert: Should close browser and reset workflow
      expect(mockBrowserManager.closeBrowser).toHaveBeenCalled();
      expect(mockWorkflowValidation.workflowValidator.reset).toHaveBeenCalled();
      expect(mockWorkflowValidation.validateWorkflow).toHaveBeenCalledWith('browser_close', {});
      expect(mockWorkflowValidation.recordExecution).toHaveBeenCalledWith('browser_close', {}, true);
      
      expect(result).toHaveProperty('content');
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Browser closed successfully');
      expect(result.content[0].text).toContain('Workflow state reset');
    });

    it('should handle browser close failure', async () => {
      // Arrange: Browser close that will fail
      const closeError = new Error('Failed to close browser');
      
      mockBrowserManager.closeBrowser.mockRejectedValue(closeError);
      mockSystemUtils.withErrorHandling.mockImplementation(async (operation: () => Promise<any>, errorMessage: string) => {
        try {
          return await operation();
        } catch (error) {
          throw new Error(errorMessage);
        }
      });

      // Act & Assert: Should throw error
      await expect(handleBrowserClose()).rejects.toThrow('Failed to close browser');
      
      expect(mockBrowserManager.closeBrowser).toHaveBeenCalled();
      expect(mockWorkflowValidation.recordExecution).toHaveBeenCalledWith(
        'browser_close',
        {},
        false,
        'Failed to close browser'
      );
    });

    it('should handle workflow validation failure for close', async () => {
      // Arrange: Invalid workflow state for close
      mockWorkflowValidation.validateWorkflow.mockReturnValue({
        isValid: false,
        errorMessage: 'No browser to close',
        suggestedAction: 'Initialize browser first'
      });

      mockWorkflowValidation.workflowValidator.getValidationSummary.mockReturnValue(
        'Current state: BROWSER_INIT | No browser instance'
      );

      // Act & Assert: Should throw workflow validation error
      await expect(handleBrowserClose()).rejects.toThrow(/No browser to close.*Next Steps: Initialize browser first/s);
      
      expect(mockBrowserManager.closeBrowser).not.toHaveBeenCalled();
      expect(mockWorkflowValidation.recordExecution).toHaveBeenCalledWith(
        'browser_close',
        {},
        false,
        expect.stringContaining('No browser to close')
      );
    });

    it('should always reset workflow state even if close fails', async () => {
      // Arrange: Browser close failure but reset should still happen
      mockBrowserManager.closeBrowser.mockRejectedValue(new Error('Close failed'));
      mockSystemUtils.withErrorHandling.mockImplementation(async (operation: () => Promise<any>) => {
        try {
          await operation();
          // Reset happens in the operation, so we need to call it
          mockWorkflowValidation.workflowValidator.reset();
        } catch (error) {
          // Reset should happen even on error
          mockWorkflowValidation.workflowValidator.reset();
          throw error;
        }
      });

      // Act: Attempt to close browser (will fail)
      try {
        await handleBrowserClose();
      } catch (error) {
        // Expected to fail
      }

      // Assert: Workflow should still be reset
      expect(mockWorkflowValidation.workflowValidator.reset).toHaveBeenCalled();
    });
  });

  describe('Workflow Validation Wrapper', () => {
    it('should validate workflow before executing operation', async () => {
      // Arrange: Valid workflow state
      const args: BrowserInitArgs = { headless: false };
      mockBrowserManager.initializeBrowser.mockResolvedValue(undefined);

      // Act: Execute browser init (uses workflow validation)
      await handleBrowserInit(args);

      // Assert: Should validate workflow first
      expect(mockWorkflowValidation.validateWorkflow).toHaveBeenCalled();
      expect(mockBrowserManager.initializeBrowser).toHaveBeenCalled();
    });

    it('should record execution results for successful operations', async () => {
      // Arrange: Successful operation
      const args: BrowserInitArgs = { headless: false };
      mockBrowserManager.initializeBrowser.mockResolvedValue(undefined);

      // Act: Execute successful operation
      await handleBrowserInit(args);

      // Assert: Should record successful execution
      expect(mockWorkflowValidation.recordExecution).toHaveBeenCalledWith(
        'browser_init',
        args,
        true
      );
    });

    it('should record execution results for failed operations', async () => {
      // Arrange: Operation that will fail
      const args: BrowserInitArgs = { headless: false };
      const error = new Error('Operation failed');
      
      mockBrowserManager.initializeBrowser.mockRejectedValue(error);
      mockSystemUtils.withErrorHandling.mockImplementation(async (operation: () => Promise<any>) => {
        return await operation();
      });

      // Act: Execute failing operation
      try {
        await handleBrowserInit(args);
      } catch (err) {
        // Expected to fail
      }

      // Assert: Should record failed execution
      expect(mockWorkflowValidation.recordExecution).toHaveBeenCalledWith(
        'browser_init',
        args,
        false,
        'Operation failed'
      );
    });

    it('should include workflow summary in validation errors', async () => {
      // Arrange: Invalid workflow with detailed summary
      const args: BrowserInitArgs = { headless: false };
      
      mockWorkflowValidation.validateWorkflow.mockReturnValue({
        isValid: false,
        errorMessage: 'Invalid workflow state',
        suggestedAction: 'Reset workflow'
      });

      mockWorkflowValidation.workflowValidator.getValidationSummary.mockReturnValue(
        'Current state: INVALID | Last action: unknown | Context: missing'
      );

      // Act & Assert: Should include detailed workflow information
      await expect(handleBrowserInit(args)).rejects.toThrow(
        /Invalid workflow state.*Next Steps: Reset workflow.*Current state: INVALID/s
      );
    });
  });

  describe('Error Handling Integration', () => {
    it('should use system error handling wrapper', async () => {
      // Arrange: Browser init with error handling
      const args: BrowserInitArgs = { headless: false };
      mockBrowserManager.initializeBrowser.mockResolvedValue(undefined);

      // Act: Execute browser init
      await handleBrowserInit(args);

      // Assert: Should use error handling wrapper
      expect(mockSystemUtils.withErrorHandling).toHaveBeenCalledWith(
        expect.any(Function),
        'Failed to initialize browser'
      );
    });

    it('should provide appropriate error context for different operations', async () => {
      // Arrange: Browser close operation
      mockBrowserManager.closeBrowser.mockResolvedValue(undefined);

      // Act: Execute browser close
      await handleBrowserClose();

      // Assert: Should use specific error message for close operation
      expect(mockSystemUtils.withErrorHandling).toHaveBeenCalledWith(
        expect.any(Function),
        'Failed to close browser'
      );
    });
  });
});