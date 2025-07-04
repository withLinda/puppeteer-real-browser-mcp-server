/**
 * Unit Tests for Interaction Handlers
 * 
 * Following TDD Red-Green-Refactor methodology with 2025 best practices:
 * - AAA Pattern (Arrange-Act-Assert)
 * - Comprehensive mocking of dependencies
 * - Element interaction and self-healing locator testing
 * - Workflow validation and error handling testing
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleClick, handleType, handleSolveCaptcha, handleRandomScroll } from './interaction-handlers.js';
import { ClickArgs, TypeArgs, SolveCaptchaArgs } from '../tool-definitions.js';

// Mock all external dependencies
vi.mock('../browser-manager', () => ({
  getBrowserInstance: vi.fn(),
  getPageInstance: vi.fn()
}));

vi.mock('../system-utils', () => ({
  withErrorHandling: vi.fn((operation: () => Promise<any>, errorMessage: string) => operation())
}));

vi.mock('../workflow-validation', () => ({
  validateWorkflow: vi.fn(),
  recordExecution: vi.fn(),
  workflowValidator: {
    getValidationSummary: vi.fn()
  }
}));

vi.mock('../self-healing-locators', () => ({
  selfHealingLocators: {
    findElementWithFallbacks: vi.fn(),
    getFallbackSummary: vi.fn()
  }
}));

vi.mock('../stealth-actions', () => ({
  randomScroll: vi.fn()
}));

vi.mock('node:timers/promises', () => ({
  setTimeout: vi.fn()
}));

// Import mocked modules
import * as browserManager from '../browser-manager.js';
import * as systemUtils from '../system-utils.js';
import * as workflowValidation from '../workflow-validation.js';
import * as selfHealingLocators from '../self-healing-locators.js';
import * as stealthActions from '../stealth-actions.js';

describe('Interaction Handlers', () => {
  let mockBrowserManager: any;
  let mockSystemUtils: any;
  let mockWorkflowValidation: any;
  let mockSelfHealingLocators: any;
  let mockStealthActions: any;
  let mockPageInstance: any;
  let mockElement: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup mocks
    mockBrowserManager = browserManager;
    mockSystemUtils = systemUtils;
    mockWorkflowValidation = workflowValidation;
    mockSelfHealingLocators = selfHealingLocators;
    mockStealthActions = stealthActions;

    // Mock element with common methods
    mockElement = {
      click: vi.fn(),
      focus: vi.fn(),
      type: vi.fn(),
      boundingBox: vi.fn().mockResolvedValue({ x: 10, y: 20, width: 100, height: 40 })
    };

    // Mock page instance with common methods
    mockPageInstance = {
      click: vi.fn(),
      type: vi.fn(),
      $: vi.fn(),
      $eval: vi.fn(),
      evaluate: vi.fn(),
      waitForSelector: vi.fn().mockResolvedValue(mockElement),
      waitForNavigation: vi.fn()
    };

    // Default mock implementations
    mockWorkflowValidation.validateWorkflow.mockReturnValue({
      isValid: true,
      errorMessage: null,
      suggestedAction: null
    });

    mockBrowserManager.getPageInstance.mockReturnValue(mockPageInstance);

    mockSelfHealingLocators.selfHealingLocators.findElementWithFallbacks.mockResolvedValue({
      element: mockElement,
      usedSelector: 'button.submit',
      strategy: 'primary'
    });
  });

  describe('Click Handler', () => {
    describe('Successful Click Operations', () => {
      it('should click element successfully with primary selector', async () => {
        // Arrange: Basic click args
        const args: ClickArgs = { selector: 'button.submit' };

        mockPageInstance.click.mockResolvedValue(undefined);

        // Act: Click element
        const result = await handleClick(args);

        // Assert: Should click element and return success message
        expect(mockSelfHealingLocators.selfHealingLocators.findElementWithFallbacks)
          .toHaveBeenCalledWith(mockPageInstance, 'button.submit');
        expect(mockPageInstance.waitForSelector).toHaveBeenCalledWith('button.submit', { timeout: 5000 });
        expect(mockPageInstance.click).toHaveBeenCalledWith('button.submit');
        expect(mockWorkflowValidation.validateWorkflow).toHaveBeenCalledWith('click', args);
        expect(mockWorkflowValidation.recordExecution).toHaveBeenCalledWith('click', args, true);
        
        expect(result).toHaveProperty('content');
        expect(result.content[0].type).toBe('text');
        expect(result.content[0].text).toContain('Clicked element: button.submit');
        expect(result.content[0].text).toContain('Interaction completed successfully');
        expect(result.content[0].text).not.toContain('Self-healing');
      });

      it('should click element with navigation waiting', async () => {
        // Arrange: Click with navigation
        const args: ClickArgs = { selector: '#nav-link', waitForNavigation: true };

        mockPageInstance.waitForNavigation.mockResolvedValue(undefined);
        mockPageInstance.click.mockResolvedValue(undefined);

        // Act: Click with navigation
        const result = await handleClick(args);

        // Assert: Should wait for navigation
        expect(mockPageInstance.waitForNavigation).toHaveBeenCalledWith({ waitUntil: 'networkidle2' });
        expect(mockPageInstance.click).toHaveBeenCalledWith('button.submit');
        expect(result.content[0].text).toContain('Clicked element: button.submit');
      });

      it('should use self-healing fallback selector', async () => {
        // Arrange: Self-healing locators find element with fallback
        const args: ClickArgs = { selector: '.original-selector' };

        mockSelfHealingLocators.selfHealingLocators.findElementWithFallbacks.mockResolvedValue({
          element: mockElement,
          usedSelector: '.fallback-selector',
          strategy: 'semantic'
        });

        mockPageInstance.click.mockResolvedValue(undefined);

        // Act: Click element
        const result = await handleClick(args);

        // Assert: Should use fallback selector and show self-healing message
        expect(mockPageInstance.click).toHaveBeenCalledWith('.fallback-selector');
        expect(result.content[0].text).toContain('Clicked element: .fallback-selector');
        expect(result.content[0].text).toContain('Self-healing: Used semantic fallback selector');
      });

      it('should use JavaScript click fallback when regular click fails', async () => {
        // Arrange: Regular click fails, JavaScript click succeeds
        const args: ClickArgs = { selector: 'button' };

        mockPageInstance.click.mockRejectedValue(new Error('Click intercepted'));
        mockPageInstance.$eval.mockResolvedValue(undefined);

        // Act: Click element
        const result = await handleClick(args);

        // Assert: Should fall back to JavaScript click
        expect(mockPageInstance.click).toHaveBeenCalledWith('button.submit');
        expect(mockPageInstance.$eval).toHaveBeenCalledWith('button.submit', expect.any(Function));
        expect(result.content[0].text).toContain('Clicked element using JavaScript fallback');
      });

      it('should use JavaScript click when element has no bounding box', async () => {
        // Arrange: Element with no bounding box
        const args: ClickArgs = { selector: 'button' };

        mockElement.boundingBox.mockResolvedValue(null);
        mockPageInstance.$eval.mockResolvedValue(undefined);

        // Act: Click element
        const result = await handleClick(args);

        // Assert: Should use JavaScript click directly
        expect(mockPageInstance.$eval).toHaveBeenCalledWith('button.submit', expect.any(Function));
        expect(result.content[0].text).toContain('Clicked element: button.submit');
      });
    });

    describe('Click Error Handling', () => {
      it('should throw error when element not found by self-healing locators', async () => {
        // Arrange: Self-healing locators cannot find element
        const args: ClickArgs = { selector: '.nonexistent' };

        mockSelfHealingLocators.selfHealingLocators.findElementWithFallbacks.mockResolvedValue(null);
        mockSelfHealingLocators.selfHealingLocators.getFallbackSummary.mockResolvedValue(
          'Tried: primary, semantic, structural fallbacks'
        );

        // Act & Assert: Should throw element not found error
        await expect(handleClick(args)).rejects.toThrow(
          /Element not found: \.nonexistent.*Self-healing locators tried multiple fallback strategies/s
        );
        
        expect(mockWorkflowValidation.recordExecution).toHaveBeenCalledWith(
          'click',
          args,
          false,
          expect.stringContaining('Element not found: .nonexistent')
        );
      });

      it('should throw error when both click and JavaScript fallback fail', async () => {
        // Arrange: Both click methods fail
        const args: ClickArgs = { selector: 'button' };

        mockPageInstance.click.mockRejectedValue(new Error('Click failed'));
        mockPageInstance.$eval.mockRejectedValue(new Error('JavaScript click failed'));

        // Act & Assert: Should throw combined error
        await expect(handleClick(args)).rejects.toThrow(
          /Click failed on element found by self-healing locators.*Original error: Click failed.*JavaScript fallback error: JavaScript click failed/s
        );
      });

      it('should throw error when browser not initialized', async () => {
        // Arrange: No page instance
        const args: ClickArgs = { selector: 'button' };

        mockBrowserManager.getPageInstance.mockReturnValue(null);

        // Act & Assert: Should throw browser not initialized error
        await expect(handleClick(args)).rejects.toThrow(
          'Browser not initialized. Call browser_init first.'
        );
      });

      it('should handle workflow validation failure', async () => {
        // Arrange: Invalid workflow state
        const args: ClickArgs = { selector: 'button' };

        mockWorkflowValidation.validateWorkflow.mockReturnValue({
          isValid: false,
          errorMessage: 'Cannot click before analyzing content',
          suggestedAction: 'Use get_content first'
        });

        // Act & Assert: Should throw workflow validation error
        await expect(handleClick(args)).rejects.toThrow(
          /Cannot click before analyzing content.*Next Steps: Use get_content first/s
        );
      });
    });
  });

  describe('Type Handler', () => {
    describe('Successful Type Operations', () => {
      it('should type text into input element successfully', async () => {
        // Arrange: Basic type args
        const args: TypeArgs = { selector: 'input[name="username"]', text: 'testuser' };

        mockPageInstance.type.mockResolvedValue(undefined);
        mockPageInstance.evaluate.mockResolvedValue(undefined);

        // Act: Type text
        const result = await handleType(args);

        // Assert: Should type text successfully
        expect(mockSelfHealingLocators.selfHealingLocators.findElementWithFallbacks)
          .toHaveBeenCalledWith(mockPageInstance, 'input[name="username"]');
        expect(mockElement.focus).toHaveBeenCalled();
        expect(mockPageInstance.evaluate).toHaveBeenCalled(); // Clear existing content
        expect(mockPageInstance.type).toHaveBeenCalledWith('button.submit', 'testuser', { delay: 100 });
        expect(mockWorkflowValidation.validateWorkflow).toHaveBeenCalledWith('type', args);
        expect(mockWorkflowValidation.recordExecution).toHaveBeenCalledWith('type', args, true);
        
        expect(result.content[0].text).toContain('Typed text into: button.submit');
        expect(result.content[0].text).toContain('Text input completed successfully');
      });

      it('should type text with custom delay', async () => {
        // Arrange: Type with custom delay
        const args: TypeArgs = { selector: 'textarea', text: 'Hello World', delay: 50 };

        mockPageInstance.type.mockResolvedValue(undefined);
        mockPageInstance.evaluate.mockResolvedValue(undefined);

        // Act: Type with custom delay
        const result = await handleType(args);

        // Assert: Should use custom delay
        expect(mockPageInstance.type).toHaveBeenCalledWith('button.submit', 'Hello World', { delay: 50 });
        expect(result.content[0].text).toContain('Typed text into: button.submit');
      });

      it('should use self-healing fallback for input elements', async () => {
        // Arrange: Self-healing finds input with fallback
        const args: TypeArgs = { selector: '#username', text: 'user123' };

        mockSelfHealingLocators.selfHealingLocators.findElementWithFallbacks.mockResolvedValue({
          element: mockElement,
          usedSelector: 'input[data-testid="username"]',
          strategy: 'structural'
        });

        mockPageInstance.type.mockResolvedValue(undefined);
        mockPageInstance.evaluate.mockResolvedValue(undefined);

        // Act: Type text
        const result = await handleType(args);

        // Assert: Should use fallback selector
        expect(mockPageInstance.type).toHaveBeenCalledWith('input[data-testid="username"]', 'user123', { delay: 100 });
        expect(result.content[0].text).toContain('Self-healing: Used structural fallback selector');
      });

      it('should use JavaScript fallback when typing fails', async () => {
        // Arrange: Regular typing fails, JavaScript succeeds
        const args: TypeArgs = { selector: 'input', text: 'fallback text' };

        mockPageInstance.type.mockRejectedValue(new Error('Type failed'));
        mockPageInstance.evaluate
          .mockResolvedValueOnce(undefined) // Clear content
          .mockResolvedValueOnce(undefined); // JavaScript typing

        // Act: Type text
        const result = await handleType(args);

        // Assert: Should use JavaScript fallback
        expect(mockPageInstance.type).toHaveBeenCalled();
        expect(mockPageInstance.evaluate).toHaveBeenCalledTimes(2); // Clear + JavaScript type
        expect(result.content[0].text).toContain('Typed text using JavaScript fallback');
      });
    });

    describe('Type Error Handling', () => {
      it('should throw error when input element not found', async () => {
        // Arrange: Self-healing cannot find input element
        const args: TypeArgs = { selector: '.missing-input', text: 'test' };

        mockSelfHealingLocators.selfHealingLocators.findElementWithFallbacks.mockResolvedValue(null);
        mockSelfHealingLocators.selfHealingLocators.getFallbackSummary.mockResolvedValue(
          'Searched for input elements with various strategies'
        );

        // Act & Assert: Should throw input not found error
        await expect(handleType(args)).rejects.toThrow(
          /Input element not found: \.missing-input.*Self-healing locators tried multiple fallback strategies/s
        );
      });

      it('should throw error when both type methods fail', async () => {
        // Arrange: Both typing methods fail
        const args: TypeArgs = { selector: 'input', text: 'test' };

        mockPageInstance.type.mockRejectedValue(new Error('Type operation failed'));
        mockPageInstance.evaluate
          .mockResolvedValueOnce(undefined) // Clear content succeeds
          .mockRejectedValueOnce(new Error('JavaScript type failed')); // JavaScript type fails

        // Act & Assert: Should throw combined error
        await expect(handleType(args)).rejects.toThrow(
          /Type operation failed on element found by self-healing locators.*Original error: Type operation failed.*JavaScript fallback error: JavaScript type failed/s
        );
      });

      it('should throw error when browser not initialized', async () => {
        // Arrange: No page instance
        const args: TypeArgs = { selector: 'input', text: 'test' };

        mockBrowserManager.getPageInstance.mockReturnValue(null);

        // Act & Assert: Should throw browser not initialized error
        await expect(handleType(args)).rejects.toThrow(
          'Browser not initialized. Call browser_init first.'
        );
      });
    });
  });

  describe('Solve Captcha Handler', () => {
    it('should attempt to solve captcha', async () => {
      // Arrange: Captcha solving request
      const args: SolveCaptchaArgs = { type: 'recaptcha' };

      // Act: Solve captcha
      const result = await handleSolveCaptcha(args);

      // Assert: Should return captcha attempt message
      expect(result).toHaveProperty('content');
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Attempted to solve recaptcha captcha');
      expect(result.content[0].text).toContain('Check page to verify success');
    });

    it('should handle different captcha types', async () => {
      // Arrange: Different captcha type
      const args: SolveCaptchaArgs = { type: 'hCaptcha' };

      // Act: Solve different captcha type
      const result = await handleSolveCaptcha(args);

      // Assert: Should handle different types
      expect(result.content[0].text).toContain('Attempted to solve hCaptcha captcha');
    });

    it('should throw error when browser not initialized', async () => {
      // Arrange: No page instance
      const args: SolveCaptchaArgs = { type: 'recaptcha' };

      mockBrowserManager.getPageInstance.mockReturnValue(null);

      // Act & Assert: Should throw browser not initialized error
      await expect(handleSolveCaptcha(args)).rejects.toThrow(
        'Browser not initialized. Call browser_init first.'
      );
    });
  });

  describe('Random Scroll Handler', () => {
    it('should perform random scrolling successfully', async () => {
      // Arrange: Random scroll setup
      mockStealthActions.randomScroll.mockResolvedValue(undefined);

      // Act: Perform random scroll
      const result = await handleRandomScroll();

      // Assert: Should execute random scroll
      expect(mockStealthActions.randomScroll).toHaveBeenCalledWith(mockPageInstance);
      expect(result).toHaveProperty('content');
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('Performed random scrolling with natural timing');
    });

    it('should throw error when browser not initialized', async () => {
      // Arrange: No page instance
      mockBrowserManager.getPageInstance.mockReturnValue(null);

      // Act & Assert: Should throw browser not initialized error
      await expect(handleRandomScroll()).rejects.toThrow(
        'Browser not initialized. Call browser_init first.'
      );
    });

    it('should handle scrolling errors', async () => {
      // Arrange: Scrolling that fails
      mockStealthActions.randomScroll.mockRejectedValue(new Error('Scroll failed'));
      mockSystemUtils.withErrorHandling.mockImplementation(async (operation: () => Promise<any>) => {
        return await operation();
      });

      // Act & Assert: Should propagate scroll error
      await expect(handleRandomScroll()).rejects.toThrow('Scroll failed');
    });
  });

  describe('Workflow Validation Integration', () => {
    it('should validate workflow before click operations', async () => {
      // Arrange: Valid click request
      const args: ClickArgs = { selector: 'button' };
      mockPageInstance.click.mockResolvedValue(undefined);

      // Act: Execute click
      await handleClick(args);

      // Assert: Should validate workflow first
      expect(mockWorkflowValidation.validateWorkflow).toHaveBeenCalled();
    });

    it('should validate workflow before type operations', async () => {
      // Arrange: Valid type request
      const args: TypeArgs = { selector: 'input', text: 'test' };
      mockPageInstance.type.mockResolvedValue(undefined);
      mockPageInstance.evaluate.mockResolvedValue(undefined);

      // Act: Execute type
      await handleType(args);

      // Assert: Should validate workflow first
      expect(mockWorkflowValidation.validateWorkflow).toHaveBeenCalled();
    });

    it('should record successful executions', async () => {
      // Arrange: Successful operation
      const args: ClickArgs = { selector: 'button' };
      mockPageInstance.click.mockResolvedValue(undefined);

      // Act: Execute successful operation
      await handleClick(args);

      // Assert: Should record success
      expect(mockWorkflowValidation.recordExecution).toHaveBeenCalledWith('click', args, true);
    });

    it('should record failed executions with error details', async () => {
      // Arrange: Operation that will fail
      const args: TypeArgs = { selector: 'input', text: 'test' };
      mockSelfHealingLocators.selfHealingLocators.findElementWithFallbacks.mockResolvedValue(null);

      // Act: Execute failing operation
      try {
        await handleType(args);
      } catch (error) {
        // Expected to fail
      }

      // Assert: Should record failure with details
      expect(mockWorkflowValidation.recordExecution).toHaveBeenCalledWith(
        'type',
        args,
        false,
        expect.stringContaining('Input element not found')
      );
    });
  });

  describe('Self-Healing Locators Integration', () => {
    it('should use self-healing locators for element finding', async () => {
      // Arrange: Click operation
      const args: ClickArgs = { selector: '.my-button' };
      mockPageInstance.click.mockResolvedValue(undefined);

      // Act: Execute click
      await handleClick(args);

      // Assert: Should use self-healing locators
      expect(mockSelfHealingLocators.selfHealingLocators.findElementWithFallbacks)
        .toHaveBeenCalledWith(mockPageInstance, '.my-button');
    });

    it('should provide fallback summary when element not found', async () => {
      // Arrange: Element not found
      const args: ClickArgs = { selector: '.missing' };
      mockSelfHealingLocators.selfHealingLocators.findElementWithFallbacks.mockResolvedValue(null);

      // Act: Attempt to click
      try {
        await handleClick(args);
      } catch (error) {
        // Expected to fail
      }

      // Assert: Should request fallback summary
      expect(mockSelfHealingLocators.selfHealingLocators.getFallbackSummary)
        .toHaveBeenCalledWith(mockPageInstance, '.missing');
    });
  });

  describe('System Integration', () => {
    it('should use error handling wrapper for all operations', async () => {
      // Arrange: Click operation
      const args: ClickArgs = { selector: 'button' };
      mockPageInstance.click.mockResolvedValue(undefined);

      // Act: Execute operation
      await handleClick(args);

      // Assert: Should use error handling
      expect(mockSystemUtils.withErrorHandling).toHaveBeenCalledWith(
        expect.any(Function),
        'Failed to click element'
      );
    });

    it('should provide appropriate error context for different operations', async () => {
      // Arrange: Type operation
      const args: TypeArgs = { selector: 'input', text: 'test' };
      mockPageInstance.type.mockResolvedValue(undefined);
      mockPageInstance.evaluate.mockResolvedValue(undefined);

      // Act: Execute type
      await handleType(args);

      // Assert: Should use specific error context
      expect(mockSystemUtils.withErrorHandling).toHaveBeenCalledWith(
        expect.any(Function),
        'Failed to type text'
      );
    });
  });
});