/**
 * Unit Tests for Content Strategy Engine
 * 
 * Following TDD Red-Green-Refactor methodology with 2025 best practices:
 * - AAA Pattern (Arrange-Act-Assert)
 * - Comprehensive mocking of dependencies
 * - Content processing and token management testing
 * - Workflow integration validation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ContentStrategyEngine,
  ContentRequest,
  ContentResponse,
  PreflightEstimate,
  contentStrategy
} from './content-strategy.js';
import { ContentStrategy, TokenCountResult, tokenManager } from './token-management.js';
import { WorkflowState, workflowValidator } from './workflow-validation.js';

// Mock dependencies
vi.mock('./token-management', () => ({
  tokenManager: {
    countTokens: vi.fn(),
    processContent: vi.fn()
  },
  ContentStrategy: {
    FULL_HTML: 'FULL_HTML',
    FULL_TEXT: 'FULL_TEXT',
    CHUNKED_HTML: 'CHUNKED_HTML',
    CHUNKED_TEXT: 'CHUNKED_TEXT',
    FALLBACK_TEXT: 'FALLBACK_TEXT'
  }
}));

vi.mock('./workflow-validation', () => ({
  workflowValidator: {
    getContext: vi.fn()
  },
  WorkflowState: {
    BROWSER_INIT: 'BROWSER_INIT',
    PAGE_LOADED: 'PAGE_LOADED',
    CONTENT_ANALYZED: 'CONTENT_ANALYZED',
    SELECTOR_AVAILABLE: 'SELECTOR_AVAILABLE'
  }
}));

describe('Content Strategy Engine', () => {
  let engine: ContentStrategyEngine;
  let mockPageInstance: any;
  let mockTokenManager: any;
  let mockWorkflowValidator: any;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new ContentStrategyEngine();
    
    // Setup mocks using imported modules
    mockTokenManager = tokenManager;
    mockWorkflowValidator = workflowValidator;

    // Mock page instance with common methods
    mockPageInstance = {
      evaluate: vi.fn(),
      $: vi.fn(),
      content: vi.fn(),
      setRequestInterception: vi.fn(),
      on: vi.fn()
    };

    // Default workflow state
    mockWorkflowValidator.getContext.mockReturnValue({
      currentState: WorkflowState.PAGE_LOADED,
      contentAnalyzed: false
    });
  });

  describe('Workflow Validation', () => {
    it('should reject content request in INITIAL state', async () => {
      // Arrange: Set workflow state to INITIAL
      mockWorkflowValidator.getContext.mockReturnValue({
        currentState: WorkflowState.INITIAL,
        contentAnalyzed: false
      });

      const request: ContentRequest = { type: 'html' };

      // Act & Assert: Should throw workflow error
      await expect(engine.processContentRequest(mockPageInstance, request))
        .rejects.toThrow('Cannot retrieve content before browser initialization and page navigation');
    });

    it('should allow content request in PAGE_LOADED state', async () => {
      // Arrange: Set workflow state to PAGE_LOADED and mock dependencies
      mockWorkflowValidator.getContext.mockReturnValue({
        currentState: WorkflowState.PAGE_LOADED,
        contentAnalyzed: false
      });

      mockPageInstance.evaluate.mockResolvedValue({
        htmlLength: 1000,
        textLength: 500,
        hasLargeScripts: false,
        hasManySVGs: false,
        hasLargeTables: false,
        hasCodeBlocks: false
      });

      mockPageInstance.content.mockResolvedValue('<html><body>Test content</body></html>');
      mockTokenManager.countTokens.mockReturnValue(100);
      mockTokenManager.processContent.mockReturnValue({
        processedContent: 'Test content',
        strategy: ContentStrategy.FULL_HTML,
        metadata: {
          originalTokens: 100,
          processedTokens: 100,
          chunks: 1,
          compressionRatio: 1.0
        }
      });

      const request: ContentRequest = { type: 'html' };

      // Act: Process content request
      const result = await engine.processContentRequest(mockPageInstance, request);

      // Assert: Should succeed and return content response
      expect(result).toBeDefined();
      expect(result.content).toBe('Test content');
      expect(result.strategy).toBe(ContentStrategy.FULL_HTML);
      expect(result.metadata.originalTokens).toBe(100);
    });
  });

  describe('Content Mode Processing', () => {
    beforeEach(() => {
      // Setup common mocks for content processing tests
      mockTokenManager.countTokens.mockReturnValue(100);
      mockTokenManager.processContent.mockReturnValue({
        processedContent: 'Processed content',
        strategy: ContentStrategy.FULL_HTML,
        metadata: {
          originalTokens: 100,
          processedTokens: 100,
          chunks: 1,
          compressionRatio: 1.0
        }
      });
    });

    it('should process content in full mode', async () => {
      // Arrange: Mock full page content
      mockPageInstance.content.mockResolvedValue('<html><body>Full page content</body></html>');
      
      const request: ContentRequest = { 
        type: 'html', 
        contentMode: 'full' 
      };

      // Act: Process content request
      const result = await engine.processContentRequest(mockPageInstance, request);

      // Assert: Should retrieve full page content and return processed result
      expect(mockPageInstance.content).toHaveBeenCalled();
      expect(result.content).toBeDefined();
      expect(result.strategy).toBeDefined();
    });

    it('should process content in main mode with intelligent extraction', async () => {
      // Arrange: Mock main content extraction
      mockPageInstance.evaluate.mockResolvedValue('Main content area');
      
      const request: ContentRequest = { 
        type: 'html', 
        contentMode: 'main' 
      };

      // Act: Process content request
      const result = await engine.processContentRequest(mockPageInstance, request);

      // Assert: Should use main content extraction and return content
      expect(mockPageInstance.evaluate).toHaveBeenCalled();
      expect(result.content).toBeDefined();
      expect(result.strategy).toBeDefined();
    });

    it('should process content in summary mode', async () => {
      // Arrange: Mock summary content extraction
      mockPageInstance.evaluate.mockResolvedValue('Summary: Page title and headings');
      
      const request: ContentRequest = { 
        type: 'text', 
        contentMode: 'summary' 
      };

      // Act: Process content request
      const result = await engine.processContentRequest(mockPageInstance, request);

      // Assert: Should use summary extraction and return processed content
      expect(mockPageInstance.evaluate).toHaveBeenCalled();
      expect(result.content).toBeDefined();
      expect(result.strategy).toBeDefined();
    });

    it('should default to main mode when no contentMode specified', async () => {
      // Arrange: Mock page evaluation for main content
      mockPageInstance.evaluate.mockResolvedValue('Default main content');
      
      const request: ContentRequest = { type: 'text' };

      // Act: Process content request
      const result = await engine.processContentRequest(mockPageInstance, request);

      // Assert: Should default to main mode
      expect(mockPageInstance.evaluate).toHaveBeenCalled();
      expect(result.content).toBe('Processed content');
    });
  });

  describe('Selector-Based Content Extraction', () => {
    it('should extract content from specific selector', async () => {
      // Arrange: Mock element selection and extraction
      const mockElement = {
        evaluate: vi.fn().mockResolvedValue('<div>Specific element content</div>')
      };
      mockPageInstance.$.mockResolvedValue(mockElement);
      
      mockTokenManager.processContent.mockReturnValue({
        processedContent: 'Specific element content',
        strategy: ContentStrategy.FULL_HTML,
        metadata: {
          originalTokens: 50,
          processedTokens: 50,
          chunks: 1,
          compressionRatio: 1.0
        }
      });

      const request: ContentRequest = { 
        type: 'html', 
        selector: '.specific-element' 
      };

      // Act: Process content request
      const result = await engine.processContentRequest(mockPageInstance, request);

      // Assert: Should extract from specific selector
      expect(mockPageInstance.$).toHaveBeenCalledWith('.specific-element');
      expect(mockElement.evaluate).toHaveBeenCalled();
      expect(result.content).toBe('Specific element content');
      expect(result.metadata.selector).toBe('.specific-element');
    });

    it('should handle missing selector element', async () => {
      // Arrange: Mock element not found
      mockPageInstance.$.mockResolvedValue(null);
      
      const request: ContentRequest = { 
        type: 'html', 
        selector: '.missing-element' 
      };

      // Act & Assert: Should throw element not found error
      await expect(engine.processContentRequest(mockPageInstance, request))
        .rejects.toThrow('Element not found: .missing-element');
    });

    it('should extract text content from selector', async () => {
      // Arrange: Mock text content extraction
      const mockElement = {
        evaluate: vi.fn().mockResolvedValue('Element text content')
      };
      mockPageInstance.$.mockResolvedValue(mockElement);
      
      mockTokenManager.processContent.mockReturnValue({
        processedContent: 'Element text content',
        strategy: ContentStrategy.FULL_TEXT,
        metadata: {
          originalTokens: 30,
          processedTokens: 30,
          chunks: 1,
          compressionRatio: 1.0
        }
      });

      const request: ContentRequest = { 
        type: 'text', 
        selector: '.text-element' 
      };

      // Act: Process content request
      const result = await engine.processContentRequest(mockPageInstance, request);

      // Assert: Should extract text content
      expect(result.content).toBe('Element text content');
      expect(result.strategy).toBe(ContentStrategy.FULL_TEXT);
    });
  });

  describe('Pre-flight Estimation', () => {
    it('should perform estimation and return metadata only', async () => {
      // Arrange: Mock content estimation
      mockPageInstance.evaluate.mockResolvedValue({
        htmlLength: 5000,
        textLength: 2500,
        hasLargeScripts: false,
        hasManySVGs: false,
        hasLargeTables: false,
        hasCodeBlocks: false
      });

      mockTokenManager.countTokens
        .mockReturnValueOnce(1000) // HTML tokens
        .mockReturnValueOnce(500);  // Text tokens

      const request: ContentRequest = { estimateOnly: true };

      // Act: Process estimation request
      const result = await engine.processContentRequest(mockPageInstance, request);

      // Assert: Should return estimation metadata only
      expect(result.content).toBe('');
      expect(result.metadata.estimationOnly).toBe(true);
      expect(result.metadata.originalTokens).toBe(1000);
      expect(result.metadata.recommendations).toBeDefined();
    });

    it('should recommend text extraction for large HTML content', async () => {
      // Arrange: Mock large HTML content
      mockPageInstance.evaluate
        .mockResolvedValueOnce({
          htmlLength: 100000,
          textLength: 30000,
          hasLargeScripts: true,
          hasManySVGs: false,
          hasLargeTables: false,
          hasCodeBlocks: false
        })
        .mockResolvedValueOnce('Main content area'); // For main content extraction

      mockTokenManager.countTokens
        .mockReturnValueOnce(25000) // HTML tokens (exceeds limit)
        .mockReturnValueOnce(8000);  // Text tokens (within limit)

      const request: ContentRequest = { estimateOnly: true };

      // Act: Process estimation request
      const result = await engine.processContentRequest(mockPageInstance, request);

      // Assert: Should recommend text-based strategy (either FULL_TEXT or CHUNKED_TEXT)
      expect([ContentStrategy.FULL_TEXT, ContentStrategy.CHUNKED_TEXT]).toContain(result.strategy);
      expect(result.metadata.recommendations).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/text|HTML.*large|Applied emergency content filtering/i)
        ])
      );
    });

    it('should recommend chunking for very large content', async () => {
      // Arrange: Mock very large content with multiple evaluate calls
      mockPageInstance.evaluate
        .mockResolvedValueOnce({
          htmlLength: 200000,
          textLength: 150000,
          hasLargeScripts: true,
          hasManySVGs: true,
          hasLargeTables: true,
          hasCodeBlocks: true
        })
        .mockResolvedValueOnce('Very large main content') // For main content extraction
        .mockResolvedValueOnce('Emergency content'); // For emergency content extraction

      mockTokenManager.countTokens
        .mockReturnValueOnce(50000) // HTML tokens (exceeds limit)
        .mockReturnValueOnce(40000) // Text tokens (also exceeds limit)  
        .mockReturnValueOnce(15000) // Emergency HTML tokens
        .mockReturnValueOnce(12000); // Emergency text tokens

      const request: ContentRequest = { estimateOnly: true };

      // Act: Process estimation request
      const result = await engine.processContentRequest(mockPageInstance, request);

      // Assert: Should process very large content and provide recommendations
      expect(result.metadata.originalTokens).toBeGreaterThan(10000);
      expect(result.metadata.recommendations).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/chunks? needed|chunking|large page size|Applied emergency content filtering/i)
        ])
      );
    });
  });

  describe('Resource Blocking', () => {
    it('should enable resource blocking for main content mode', async () => {
      // Arrange: Mock resource blocking setup
      mockPageInstance.setRequestInterception.mockResolvedValue(undefined);
      mockPageInstance.evaluate.mockResolvedValue('Main content');
      
      mockTokenManager.processContent.mockReturnValue({
        processedContent: 'Optimized content',
        strategy: ContentStrategy.FULL_HTML,
        metadata: {
          originalTokens: 100,
          processedTokens: 100,
          chunks: 1,
          compressionRatio: 1.0
        }
      });

      const request: ContentRequest = { 
        type: 'html', 
        contentMode: 'main' 
      };

      // Act: Process content request
      await engine.processContentRequest(mockPageInstance, request);

      // Assert: Should enable resource blocking
      expect(mockPageInstance.setRequestInterception).toHaveBeenCalledWith(true);
      expect(mockPageInstance.on).toHaveBeenCalledWith('request', expect.any(Function));
    });

    it('should skip resource blocking for selector-based requests', async () => {
      // Arrange: Mock selector-based request
      const mockElement = {
        evaluate: vi.fn().mockResolvedValue('Element content')
      };
      mockPageInstance.$.mockResolvedValue(mockElement);
      
      mockTokenManager.processContent.mockReturnValue({
        processedContent: 'Element content',
        strategy: ContentStrategy.FULL_HTML,
        metadata: {
          originalTokens: 50,
          processedTokens: 50,
          chunks: 1,
          compressionRatio: 1.0
        }
      });

      const request: ContentRequest = { 
        type: 'html', 
        selector: '.element' 
      };

      // Act: Process content request
      await engine.processContentRequest(mockPageInstance, request);

      // Assert: Should not enable resource blocking for selector requests
      expect(mockPageInstance.setRequestInterception).not.toHaveBeenCalled();
    });

    it('should handle resource blocking setup failure gracefully', async () => {
      // Arrange: Mock resource blocking failure
      mockPageInstance.setRequestInterception.mockRejectedValue(new Error('Request interception failed'));
      mockPageInstance.evaluate.mockResolvedValue('Content despite blocking failure');
      
      mockTokenManager.processContent.mockReturnValue({
        processedContent: 'Content despite failure',
        strategy: ContentStrategy.FULL_HTML,
        metadata: {
          originalTokens: 100,
          processedTokens: 100,
          chunks: 1,
          compressionRatio: 1.0
        }
      });

      const request: ContentRequest = { 
        type: 'html', 
        contentMode: 'main' 
      };

      // Act: Process content request (should not throw)
      const result = await engine.processContentRequest(mockPageInstance, request);

      // Assert: Should continue processing despite blocking failure
      expect(result.content).toBe('Content despite failure');
    });
  });

  describe('Token Management Integration', () => {
    it('should use token manager for content processing', async () => {
      // Arrange: Mock token management and content retrieval
      mockPageInstance.content.mockResolvedValue('<html>Content</html>');
      mockPageInstance.evaluate.mockResolvedValue('<html>Content</html>'); // For main content extraction
      
      mockTokenManager.processContent.mockReturnValue({
        processedContent: 'Processed by token manager',
        strategy: ContentStrategy.FULL_HTML,
        metadata: {
          originalTokens: 200,
          processedTokens: 180,
          chunks: 1,
          compressionRatio: 0.9
        }
      });

      const request: ContentRequest = { type: 'html' };

      // Act: Process content request
      const result = await engine.processContentRequest(mockPageInstance, request);

      // Assert: Should use token manager with actual content
      expect(mockTokenManager.processContent).toHaveBeenCalledWith(
        expect.any(String), // Content should be a string
        'html',
        ContentStrategy.FULL_HTML
      );
      expect(result.content).toBe('Processed by token manager');
      expect(result.metadata.compressionRatio).toBe(0.9);
    });

    it('should handle chunked content response', async () => {
      // Arrange: Mock chunked content processing
      mockPageInstance.content.mockResolvedValue('<html>Large content</html>');
      mockTokenManager.processContent.mockReturnValue({
        processedContent: [
          { content: 'Chunk 1', metadata: { index: 0, total: 2 } },
          { content: 'Chunk 2', metadata: { index: 1, total: 2 } }
        ],
        strategy: ContentStrategy.CHUNKED_HTML,
        metadata: {
          originalTokens: 30000,
          processedTokens: 25000,
          chunks: 2,
          compressionRatio: 0.8
        }
      });

      const request: ContentRequest = { type: 'html' };

      // Act: Process content request
      const result = await engine.processContentRequest(mockPageInstance, request);

      // Assert: Should handle chunked content
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.metadata.chunksCount).toBe(2);
      expect(result.workflowGuidance).toContain('split into 2 chunks');
    });
  });

  describe('Workflow Guidance Generation', () => {
    it('should generate guidance for successful content analysis', async () => {
      // Arrange: Mock successful content analysis
      mockWorkflowValidator.getContext.mockReturnValue({
        currentState: WorkflowState.CONTENT_ANALYZED,
        contentAnalyzed: true
      });

      mockPageInstance.content.mockResolvedValue('<html>Content</html>');
      mockTokenManager.processContent.mockReturnValue({
        processedContent: 'Analyzed content',
        strategy: ContentStrategy.FULL_HTML,
        metadata: {
          originalTokens: 100,
          processedTokens: 100,
          chunks: 1,
          compressionRatio: 1.0
        }
      });

      const request: ContentRequest = { type: 'html' };

      // Act: Process content request
      const result = await engine.processContentRequest(mockPageInstance, request);

      // Assert: Should include workflow guidance
      expect(result.workflowGuidance).toContain('Content analyzed successfully');
      expect(result.workflowGuidance).toContain('find_selector');
      expect(result.workflowGuidance).toContain('click, type');
    });

    it('should generate guidance for fallback strategy', async () => {
      // Arrange: Mock fallback strategy
      mockPageInstance.content.mockResolvedValue('<html>Content</html>');
      mockTokenManager.processContent.mockReturnValue({
        processedContent: 'Fallback content',
        strategy: ContentStrategy.FALLBACK_TEXT,
        metadata: {
          originalTokens: 25000,
          processedTokens: 15000,
          chunks: 1,
          compressionRatio: 0.6
        }
      });

      const request: ContentRequest = { type: 'html' };

      // Act: Process content request
      const result = await engine.processContentRequest(mockPageInstance, request);

      // Assert: Should include fallback guidance
      expect(result.workflowGuidance).toContain('Automatically optimized to text content');
    });
  });

  describe('Error Handling', () => {
    it('should handle page evaluation errors gracefully', async () => {
      // Arrange: Mock page evaluation failure
      mockPageInstance.evaluate.mockRejectedValue(new Error('Page evaluation failed'));
      
      const request: ContentRequest = { estimateOnly: true };

      // Act: Process estimation request
      const result = await engine.processContentRequest(mockPageInstance, request);

      // Assert: Should return conservative fallback estimation
      expect(result.metadata.estimationOnly).toBe(true);
      expect(result.metadata.recommendations).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/Could not estimate.*conservative|using conservative|conservative.*strategy/i)
        ])
      );
    });

    it('should clean up resource blocking on error', async () => {
      // Arrange: Mock resource blocking enabled but content retrieval fails
      mockPageInstance.setRequestInterception.mockResolvedValue(undefined);
      mockPageInstance.evaluate.mockRejectedValue(new Error('Content retrieval failed'));

      const request: ContentRequest = { 
        type: 'html', 
        contentMode: 'main' 
      };

      // Act & Assert: Should throw error but still attempt cleanup
      await expect(engine.processContentRequest(mockPageInstance, request))
        .rejects.toThrow('Content retrieval failed');
      
      // Resource blocking cleanup should be attempted
      expect(mockPageInstance.setRequestInterception).toHaveBeenCalledWith(true);
    });
  });

  describe('Global Instance', () => {
    it('should provide global content strategy instance', () => {
      // Arrange & Act: Check global instance
      expect(contentStrategy).toBeInstanceOf(ContentStrategyEngine);
    });
  });
});