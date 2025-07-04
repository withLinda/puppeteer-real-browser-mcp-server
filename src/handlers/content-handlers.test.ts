/**
 * Unit Tests for Content Handlers
 * 
 * Following TDD Red-Green-Refactor methodology with 2025 best practices:
 * - AAA Pattern (Arrange-Act-Assert)
 * - Comprehensive mocking of dependencies
 * - Content retrieval and element finding testing
 * - Token management and workflow validation testing
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleGetContent, handleFindSelector } from './content-handlers.js';
import { GetContentArgs, FindSelectorArgs } from '../tool-definitions.js';

// Mock all external dependencies
vi.mock('../browser-manager', () => ({
  getBrowserInstance: vi.fn(),
  getPageInstance: vi.fn(),
  getContentPriorityConfig: vi.fn()
}));

vi.mock('../system-utils', () => ({
  withErrorHandling: vi.fn((operation, errorMessage) => operation()),
  withTimeout: vi.fn((operation, timeout, context) => operation())
}));

vi.mock('../workflow-validation', () => ({
  validateWorkflow: vi.fn(),
  recordExecution: vi.fn(),
  workflowValidator: {
    getValidationSummary: vi.fn()
  }
}));

vi.mock('../content-strategy', () => ({
  contentStrategy: {
    processContentRequest: vi.fn()
  }
}));

vi.mock('../token-management', () => ({
  tokenManager: {
    countTokens: vi.fn(),
    processContent: vi.fn()
  }
}));

// Import mocked modules
import * as browserManager from '../browser-manager.js';
import * as systemUtils from '../system-utils.js';
import * as workflowValidation from '../workflow-validation.js';
import * as contentStrategy from '../content-strategy.js';
import * as tokenManagement from '../token-management.js';

describe('Content Handlers', () => {
  let mockBrowserManager: any;
  let mockSystemUtils: any;
  let mockWorkflowValidation: any;
  let mockContentStrategy: any;
  let mockTokenManager: any;
  let mockPageInstance: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup mocks
    mockBrowserManager = browserManager;
    mockSystemUtils = systemUtils;
    mockWorkflowValidation = workflowValidation;
    mockContentStrategy = contentStrategy;
    mockTokenManager = tokenManagement;

    // Mock page instance with common methods
    mockPageInstance = {
      $: vi.fn(),
      $eval: vi.fn(),
      evaluate: vi.fn(),
      content: vi.fn()
    };

    // Default mock implementations
    mockWorkflowValidation.validateWorkflow.mockReturnValue({
      isValid: true,
      errorMessage: null,
      suggestedAction: null
    });

    mockBrowserManager.getPageInstance.mockReturnValue(mockPageInstance);
    mockTokenManager.tokenManager.countTokens.mockReturnValue(500); // Small token count by default
  });

  describe('Get Content Handler', () => {
    describe('HTML Content Retrieval', () => {
      it('should get full page HTML content successfully', async () => {
        // Arrange: Full page HTML request
        const args: GetContentArgs = { type: 'html' };
        const htmlContent = '<html><body><h1>Test Page</h1><p>Content here</p></body></html>';
        
        mockPageInstance.content.mockResolvedValue(htmlContent);

        // Act: Get content
        const result = await handleGetContent(args);

        // Assert: Should return HTML content with workflow guidance
        expect(mockPageInstance.content).toHaveBeenCalled();
        expect(mockWorkflowValidation.validateWorkflow).toHaveBeenCalledWith('get_content', args);
        expect(mockWorkflowValidation.recordExecution).toHaveBeenCalledWith('get_content', args, true);
        
        expect(result).toHaveProperty('content');
        expect(result.content[0].type).toBe('text');
        expect(result.content[0].text).toContain(htmlContent);
        expect(result.content[0].text).toContain('Workflow Status: Content analyzed');
        expect(result.content[0].text).toContain('Next step: Use find_selector');
      });

      it('should get full page text content successfully', async () => {
        // Arrange: Full page text request
        const args: GetContentArgs = { type: 'text' };
        const textContent = 'Test Page\nContent here';
        
        mockPageInstance.evaluate.mockResolvedValue(textContent);

        // Act: Get content
        const result = await handleGetContent(args);

        // Assert: Should return text content
        expect(mockPageInstance.evaluate).toHaveBeenCalled();
        expect(result.content[0].text).toContain(textContent);
        expect(result.content[0].text).toContain('Content available for element discovery');
      });
    });

    describe('Selector-Based Content Retrieval', () => {
      it('should get HTML content from specific selector', async () => {
        // Arrange: Selector-based HTML request
        const args: GetContentArgs = { type: 'html', selector: '.content' };
        const elementContent = '<div class="content">Specific content</div>';
        
        mockPageInstance.$.mockResolvedValue({}); // Element found
        mockPageInstance.$eval.mockResolvedValue(elementContent);

        // Act: Get content from selector
        const result = await handleGetContent(args);

        // Assert: Should get content from specific element
        expect(mockPageInstance.$).toHaveBeenCalledWith('.content');
        expect(mockPageInstance.$eval).toHaveBeenCalledWith('.content', expect.any(Function));
        expect(result.content[0].text).toContain(elementContent);
      });

      it('should get text content from specific selector', async () => {
        // Arrange: Selector-based text request
        const args: GetContentArgs = { type: 'text', selector: '#title' };
        const elementText = 'Page Title';
        
        mockPageInstance.$.mockResolvedValue({}); // Element found
        mockPageInstance.$eval.mockResolvedValue(elementText);

        // Act: Get text from selector
        const result = await handleGetContent(args);

        // Assert: Should get text from specific element
        expect(mockPageInstance.$).toHaveBeenCalledWith('#title');
        expect(mockPageInstance.$eval).toHaveBeenCalledWith('#title', expect.any(Function));
        expect(result.content[0].text).toContain(elementText);
      });

      it('should throw error when selector element not found', async () => {
        // Arrange: Selector that doesn't exist
        const args: GetContentArgs = { type: 'html', selector: '.nonexistent' };
        
        mockPageInstance.$.mockResolvedValue(null); // Element not found

        // Act & Assert: Should throw element not found error
        await expect(handleGetContent(args)).rejects.toThrow(
          'Element not found: .nonexistent. Use find_selector to locate elements first.'
        );
        
        expect(mockPageInstance.$).toHaveBeenCalledWith('.nonexistent');
        expect(mockWorkflowValidation.recordExecution).toHaveBeenCalledWith(
          'get_content',
          args,
          false,
          expect.stringContaining('Element not found: .nonexistent')
        );
      });
    });

    describe('Large Content Handling', () => {
      it('should handle large content by chunking', async () => {
        // Arrange: Large content that exceeds token limits
        const args: GetContentArgs = { type: 'html' };
        const largeContent = '<html>' + 'x'.repeat(100000) + '</html>';
        
        mockPageInstance.content.mockResolvedValue(largeContent);
        mockTokenManager.tokenManager.countTokens.mockReturnValue(25000); // Exceeds limit

        // Act: Get large content
        const result = await handleGetContent(args);

        // Assert: Should chunk the content
        expect(result.content[0].text).toContain('showing first chunk of');
        expect(result.content[0].text).toContain('Content Stats: 25000 tokens total');
        expect(result.content[0].text).not.toBe(largeContent); // Should be truncated
      });

      it('should handle normal-sized content without chunking', async () => {
        // Arrange: Normal-sized content
        const args: GetContentArgs = { type: 'html' };
        const normalContent = '<html><body>Normal content</body></html>';
        
        mockPageInstance.content.mockResolvedValue(normalContent);
        mockTokenManager.tokenManager.countTokens.mockReturnValue(100); // Within limits

        // Act: Get normal content
        const result = await handleGetContent(args);

        // Assert: Should return content without chunking
        expect(result.content[0].text).toContain(normalContent);
        expect(result.content[0].text).not.toContain('showing first chunk');
        expect(result.content[0].text).toContain('Workflow Status: Content analyzed');
      });
    });

    describe('Error Handling', () => {
      it('should throw error when browser not initialized', async () => {
        // Arrange: No page instance available
        const args: GetContentArgs = { type: 'html' };
        
        mockBrowserManager.getPageInstance.mockReturnValue(null);

        // Act & Assert: Should throw browser not initialized error
        await expect(handleGetContent(args)).rejects.toThrow(
          'Browser not initialized. Call browser_init first.'
        );
      });

      it('should handle workflow validation failure', async () => {
        // Arrange: Invalid workflow state
        const args: GetContentArgs = { type: 'html' };
        
        mockWorkflowValidation.validateWorkflow.mockReturnValue({
          isValid: false,
          errorMessage: 'Content cannot be retrieved in current state',
          suggestedAction: 'Navigate to a page first'
        });

        // Act & Assert: Should throw workflow validation error
        await expect(handleGetContent(args)).rejects.toThrow(
          /Content cannot be retrieved in current state.*Next Steps: Navigate to a page first/s
        );
      });

      it('should handle page evaluation errors', async () => {
        // Arrange: Page evaluation that fails
        const args: GetContentArgs = { type: 'text' };
        
        mockPageInstance.evaluate.mockRejectedValue(new Error('Page evaluation failed'));
        mockSystemUtils.withErrorHandling.mockImplementation(async (operation: () => Promise<any>) => {
          return await operation();
        });

        // Act: Attempt to get content
        try {
          await handleGetContent(args);
        } catch (error) {
          // Expected to fail
        }

        // Assert: Should record failed execution
        expect(mockWorkflowValidation.recordExecution).toHaveBeenCalledWith(
          'get_content',
          args,
          false,
          'Page evaluation failed'
        );
      });
    });
  });

  describe('Find Selector Handler', () => {
    describe('Element Finding', () => {
      it('should find element by text content successfully', async () => {
        // Arrange: Find selector request
        const args: FindSelectorArgs = { text: 'Click me', elementType: 'button' };
        const mockResults = [
          {
            selector: 'button.submit',
            text: 'Click me',
            tagName: 'button',
            confidence: 100,
            rect: { x: 10, y: 20, width: 100, height: 40 }
          }
        ];
        
        mockPageInstance.evaluate.mockResolvedValue(mockResults);

        // Act: Find selector
        const result = await handleFindSelector(args);

        // Assert: Should find and return element selector
        expect(mockPageInstance.evaluate).toHaveBeenCalled();
        expect(mockWorkflowValidation.validateWorkflow).toHaveBeenCalledWith('find_selector', args);
        expect(mockWorkflowValidation.recordExecution).toHaveBeenCalledWith('find_selector', args, true);
        
        expect(result.content[0].text).toContain('Found element: button.submit');
        expect(result.content[0].text).toContain('Text: "Click me"');
        expect(result.content[0].text).toContain('Confidence: 100');
        expect(result.content[0].text).toContain('Element located');
        expect(result.content[0].text).toContain('ready for interactions');
      });

      it('should find elements with exact text matching', async () => {
        // Arrange: Exact text matching request
        const args: FindSelectorArgs = { text: 'Submit', exact: true };
        const mockResults = [
          {
            selector: 'input[type="submit"]',
            text: 'Submit',
            tagName: 'input',
            confidence: 100,
            rect: { x: 0, y: 0, width: 80, height: 30 }
          }
        ];
        
        mockPageInstance.evaluate.mockResolvedValue(mockResults);

        // Act: Find with exact matching
        const result = await handleFindSelector(args);

        // Assert: Should pass exact flag to page evaluation
        const evaluateCall = mockPageInstance.evaluate.mock.calls[0];
        expect(evaluateCall[1]).toBe('Submit'); // text
        expect(evaluateCall[3]).toBe(true); // exact flag
        
        expect(result.content[0].text).toContain('Found element: input[type="submit"]');
      });

      it('should handle semantic element types', async () => {
        // Arrange: Semantic element type request
        const args: FindSelectorArgs = { text: 'Home', elementType: 'link' };
        const mockResults = [
          {
            selector: 'a.nav-link',
            text: 'Home',
            tagName: 'a',
            confidence: 95,
            rect: { x: 5, y: 10, width: 50, height: 20 }
          }
        ];
        
        mockPageInstance.evaluate.mockResolvedValue(mockResults);

        // Act: Find link element
        const result = await handleFindSelector(args);

        // Assert: Should search with semantic selectors
        const evaluateCall = mockPageInstance.evaluate.mock.calls[0];
        expect(evaluateCall[2]).toEqual(['a', '[role="link"]']); // semantic selectors for link
        
        expect(result.content[0].text).toContain('Found element: a.nav-link');
      });

      it('should show alternative matches when available', async () => {
        // Arrange: Multiple matching elements
        const args: FindSelectorArgs = { text: 'Login' };
        const mockResults = [
          {
            selector: '#login-btn',
            text: 'Login',
            tagName: 'button',
            confidence: 100,
            rect: { x: 10, y: 20, width: 80, height: 30 }
          },
          {
            selector: '.login-link',
            text: 'Login here',
            tagName: 'a',
            confidence: 80,
            rect: { x: 100, y: 20, width: 60, height: 20 }
          },
          {
            selector: 'input.login',
            text: 'Login form',
            tagName: 'input',
            confidence: 60,
            rect: { x: 200, y: 50, width: 120, height: 25 }
          }
        ];
        
        mockPageInstance.evaluate.mockResolvedValue(mockResults);

        // Act: Find with multiple matches
        const result = await handleFindSelector(args);

        // Assert: Should show best match and alternatives
        expect(result.content[0].text).toContain('Found element: #login-btn');
        expect(result.content[0].text).toContain('Alternative matches:');
        expect(result.content[0].text).toContain('.login-link (confidence: 80)');
        expect(result.content[0].text).toContain('input.login (confidence: 60)');
      });
    });

    describe('Error Handling', () => {
      it('should throw error when no elements found', async () => {
        // Arrange: No matching elements
        const args: FindSelectorArgs = { text: 'Nonexistent text' };
        
        mockPageInstance.evaluate.mockResolvedValue([]); // No results

        // Act & Assert: Should throw no elements found error
        await expect(handleFindSelector(args)).rejects.toThrow(
          /No elements found containing text: "Nonexistent text".*Troubleshooting suggestions/s
        );
        
        expect(mockWorkflowValidation.recordExecution).toHaveBeenCalledWith(
          'find_selector',
          args,
          false,
          expect.stringContaining('No elements found')
        );
      });

      it('should provide helpful troubleshooting suggestions', async () => {
        // Arrange: No matching elements
        const args: FindSelectorArgs = { text: 'Missing button' };
        
        mockPageInstance.evaluate.mockResolvedValue([]);

        // Act & Assert: Should include troubleshooting tips
        try {
          await handleFindSelector(args);
        } catch (error) {
          expect((error as Error).message).toContain('Check if the text appears exactly as shown');
          expect((error as Error).message).toContain('Try partial text search with exact=false');
          expect((error as Error).message).toContain('Use get_content to see all available text first');
          expect((error as Error).message).toContain('Verify the page has fully loaded');
        }
      });

      it('should throw error when browser not initialized', async () => {
        // Arrange: No page instance
        const args: FindSelectorArgs = { text: 'Find me' };
        
        mockBrowserManager.getPageInstance.mockReturnValue(null);

        // Act & Assert: Should throw browser not initialized error
        await expect(handleFindSelector(args)).rejects.toThrow(
          'Browser not initialized. Call browser_init first.'
        );
      });

      it('should handle workflow validation failure', async () => {
        // Arrange: Invalid workflow state
        const args: FindSelectorArgs = { text: 'Button' };
        
        mockWorkflowValidation.validateWorkflow.mockReturnValue({
          isValid: false,
          errorMessage: 'Cannot find selectors before analyzing content',
          suggestedAction: 'Use get_content first'
        });

        // Act & Assert: Should throw workflow validation error
        await expect(handleFindSelector(args)).rejects.toThrow(
          /Cannot find selectors before analyzing content.*Next Steps: Use get_content first/s
        );
      });
    });

    describe('Advanced Element Finding Features', () => {
      it('should handle authentication element detection', async () => {
        // Arrange: Authentication-related search
        const args: FindSelectorArgs = { text: 'sign in' };
        const mockResults = [
          {
            selector: '.oauth-google',
            text: 'Continue with Google',
            tagName: 'button',
            confidence: 90,
            rect: { x: 10, y: 20, width: 150, height: 40 }
          }
        ];
        
        mockPageInstance.evaluate.mockResolvedValue(mockResults);

        // Act: Find authentication element
        const result = await handleFindSelector(args);

        // Assert: Should handle auth patterns in evaluation
        expect(result.content[0].text).toContain('Found element: .oauth-google');
        expect(result.content[0].text).toContain('Continue with Google');
      });

      it('should use default element type when not specified', async () => {
        // Arrange: Find selector without element type
        const args: FindSelectorArgs = { text: 'Any element' };
        const mockResults = [
          {
            selector: 'div.content',
            text: 'Any element',
            tagName: 'div',
            confidence: 50,
            rect: { x: 0, y: 0, width: 200, height: 100 }
          }
        ];
        
        mockPageInstance.evaluate.mockResolvedValue(mockResults);

        // Act: Find without specifying element type
        const result = await handleFindSelector(args);

        // Assert: Should use wildcard selector
        const evaluateCall = mockPageInstance.evaluate.mock.calls[0];
        expect(evaluateCall[2]).toEqual(['*']); // Default wildcard selector
      });
    });
  });

  describe('Workflow Validation Integration', () => {
    it('should validate workflow state before operations', async () => {
      // Arrange: Valid get content request
      const args: GetContentArgs = { type: 'html' };
      mockPageInstance.content.mockResolvedValue('<html></html>');

      // Act: Execute operation
      await handleGetContent(args);

      // Assert: Should validate workflow first
      expect(mockWorkflowValidation.validateWorkflow).toHaveBeenCalled();
      expect(mockPageInstance.content).toHaveBeenCalled();
    });

    it('should record successful executions', async () => {
      // Arrange: Successful operation
      const args: GetContentArgs = { type: 'text' };
      mockPageInstance.evaluate.mockResolvedValue('Content');

      // Act: Execute successful operation
      await handleGetContent(args);

      // Assert: Should record success
      expect(mockWorkflowValidation.recordExecution).toHaveBeenCalledWith(
        'get_content',
        args,
        true
      );
    });

    it('should record failed executions with error details', async () => {
      // Arrange: Operation that will fail
      const args: FindSelectorArgs = { text: 'Missing' };
      mockPageInstance.evaluate.mockResolvedValue([]);

      // Act: Execute failing operation
      try {
        await handleFindSelector(args);
      } catch (error) {
        // Expected to fail
      }

      // Assert: Should record failure with details
      expect(mockWorkflowValidation.recordExecution).toHaveBeenCalledWith(
        'find_selector',
        args,
        false,
        expect.stringContaining('No elements found')
      );
    });
  });

  describe('System Integration', () => {
    it('should use error handling wrapper', async () => {
      // Arrange: Content request
      const args: GetContentArgs = { type: 'html' };
      mockPageInstance.content.mockResolvedValue('<html></html>');

      // Act: Execute operation
      await handleGetContent(args);

      // Assert: Should use error handling
      expect(mockSystemUtils.withErrorHandling).toHaveBeenCalledWith(
        expect.any(Function),
        'Failed to get page content'
      );
    });

    it('should provide appropriate error context for different operations', async () => {
      // Arrange: Find selector operation
      const args: FindSelectorArgs = { text: 'Button' };
      mockPageInstance.evaluate.mockResolvedValue([
        { selector: 'button', text: 'Button', tagName: 'button', confidence: 100, rect: {} }
      ]);

      // Act: Execute find selector
      await handleFindSelector(args);

      // Assert: Should use specific error context
      expect(mockSystemUtils.withErrorHandling).toHaveBeenCalledWith(
        expect.any(Function),
        'Failed to find selector'
      );
    });
  });
});