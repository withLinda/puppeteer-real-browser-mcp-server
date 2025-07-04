/**
 * Unit Tests for Workflow Validation System
 * 
 * Following TDD Red-Green-Refactor methodology with 2025 best practices:
 * - AAA Pattern (Arrange-Act-Assert)
 * - Behavior-focused testing over implementation testing
 * - Deterministic testing patterns
 * - Vitest's modern testing capabilities
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { 
  WorkflowValidator, 
  WorkflowState, 
  WorkflowValidationResult,
  validateWorkflow,
  recordExecution,
  workflowValidator
} from './workflow-validation.js';

describe('WorkflowValidator', () => {
  let validator: WorkflowValidator;

  beforeEach(() => {
    // Arrange: Create fresh validator instance for each test
    validator = new WorkflowValidator();
  });

  // Helper function to execute a complete workflow sequence
  const executeWorkflowSequence = (validator: WorkflowValidator, includeContentAnalysis = true, includeFindSelector = false) => {
    validator.recordToolExecution('browser_init', {}, true);
    validator.recordToolExecution('navigate', { url: 'https://example.com' }, true);
    if (includeContentAnalysis) {
      validator.recordToolExecution('get_content', { type: 'html' }, true);
    }
    if (includeFindSelector) {
      validator.recordToolExecution('find_selector', { text: 'button' }, true);
    }
  };

  describe('Initial State', () => {
    it('should start in INITIAL state', () => {
      // Arrange & Act: Get context from fresh validator
      const context = validator.getContext();
      
      // Assert: Initial state should be INITIAL
      expect(context.currentState).toBe(WorkflowState.INITIAL);
      expect(context.contentAnalyzed).toBe(false);
      expect(context.contentAnalysisAttempted).toBe(false);
      expect(context.toolCallHistory).toHaveLength(0);
      expect(context.stateTransitionHistory).toHaveLength(0);
    });
  });

  describe('Tool Validation - find_selector Prevention', () => {
    it('should block find_selector in INITIAL state', () => {
      // Arrange: Validator starts in INITIAL state
      // Act: Attempt to execute find_selector
      const result = validator.validateToolExecution('find_selector', { text: 'button' });
      
      // Assert: Should be blocked with helpful error message
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toContain('Cannot search for selectors before browser initialization');
      expect(result.suggestedAction).toContain("Use 'browser_init' to start browser");
      expect(result.suggestedAction).toContain("Use 'navigate' to load a page");
      expect(result.suggestedAction).toContain("Use 'get_content' to analyze page content");
    });

    it('should block find_selector in PAGE_LOADED state without content analysis', () => {
      // Arrange: Transition to PAGE_LOADED state without content analysis
      executeWorkflowSequence(validator, false, false);
      
      // Act: Attempt to execute find_selector without content analysis
      const result = validator.validateToolExecution('find_selector', { text: 'button' });
      
      // Assert: Should be blocked with content analysis guidance
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toContain('Cannot search for selectors before analyzing page content');
      expect(result.errorMessage).toContain('prevents blind selector guessing');
      expect(result.suggestedAction).toContain("Use 'get_content' to analyze the page content first");
    });

    it('should allow find_selector after successful content analysis', () => {
      // Arrange: Complete proper workflow sequence with content analysis
      executeWorkflowSequence(validator, true, false);
      
      // Act: Attempt to execute find_selector after content analysis
      const result = validator.validateToolExecution('find_selector', { text: 'button' });
      
      // Assert: Should be allowed
      expect(result.isValid).toBe(true);
      expect(result.errorMessage).toBeUndefined();
      expect(result.suggestedAction).toBeUndefined();
    });
  });

  describe('State Transitions', () => {
    it('should reset content flags on browser_init', () => {
      // Arrange: Set up validator with some state
      validator.recordToolExecution('navigate', { url: 'https://example.com' }, true);
      validator.recordToolExecution('get_content', { type: 'html' }, true);
      let context = validator.getContext();
      expect(context.contentAnalyzed).toBe(true);
      
      // Act: Execute browser_init to reset state
      validator.recordToolExecution('browser_init', {}, true);
      
      // Assert: Should reset content flags but maintain current state behavior
      context = validator.getContext();
      expect(context.contentAnalyzed).toBe(false);
      expect(context.contentAnalysisAttempted).toBe(false);
      expect(context.pageUrl).toBeUndefined();
    });

    it('should transition to PAGE_LOADED on successful navigate', () => {
      // Arrange: Start with browser_init
      validator.recordToolExecution('browser_init', {}, true);
      
      // Act: Execute navigate
      const testUrl = 'https://example.com';
      validator.recordToolExecution('navigate', { url: testUrl }, true);
      
      // Assert: Should transition to PAGE_LOADED and store URL
      const context = validator.getContext();
      expect(context.currentState).toBe(WorkflowState.PAGE_LOADED);
      expect(context.pageUrl).toBe(testUrl);
      expect(context.contentAnalyzed).toBe(false);
      expect(context.contentAnalysisAttempted).toBe(false);
    });

    it('should transition to CONTENT_ANALYZED on successful get_content', () => {
      // Arrange: Complete navigation sequence
      validator.recordToolExecution('browser_init', {}, true);
      validator.recordToolExecution('navigate', { url: 'https://example.com' }, true);
      
      // Act: Execute get_content
      validator.recordToolExecution('get_content', { type: 'html' }, true);
      
      // Assert: Should transition to CONTENT_ANALYZED
      const context = validator.getContext();
      expect(context.currentState).toBe(WorkflowState.CONTENT_ANALYZED);
      expect(context.contentAnalyzed).toBe(true);
      expect(context.contentAnalysisAttempted).toBe(true);
      expect(context.lastContentType).toBe('html');
      expect(context.contentHash).toBeDefined();
    });

    it('should transition to SELECTOR_AVAILABLE on successful find_selector', () => {
      // Arrange: Complete content analysis sequence  
      validator.recordToolExecution('browser_init', {}, true);
      validator.recordToolExecution('navigate', { url: 'https://example.com' }, true);
      validator.recordToolExecution('get_content', { type: 'html' }, true);
      
      // Act: Execute find_selector
      validator.recordToolExecution('find_selector', { text: 'button' }, true);
      
      // Assert: Should transition to SELECTOR_AVAILABLE
      const context = validator.getContext();
      expect(context.currentState).toBe(WorkflowState.SELECTOR_AVAILABLE);
    });
  });

  describe('Tool Call History', () => {
    it('should record successful tool executions', () => {
      // Arrange: Fresh validator
      // Act: Record a successful tool execution
      validator.recordToolExecution('browser_init', { headless: false }, true);
      
      // Assert: Should be recorded in history
      const context = validator.getContext();
      expect(context.toolCallHistory).toHaveLength(1);
      expect(context.toolCallHistory[0]).toMatchObject({
        toolName: 'browser_init',
        arguments: { headless: false },
        success: true,
        errorMessage: undefined
      });
      expect(context.toolCallHistory[0].timestamp).toBeTypeOf('number');
    });

    it('should record failed tool executions with error message', () => {
      // Arrange: Fresh validator
      // Act: Record a failed tool execution
      const errorMsg = 'Browser initialization failed';
      validator.recordToolExecution('browser_init', {}, false, errorMsg);
      
      // Assert: Should be recorded with error details
      const context = validator.getContext();
      expect(context.toolCallHistory).toHaveLength(1);
      expect(context.toolCallHistory[0]).toMatchObject({
        toolName: 'browser_init',
        arguments: {},
        success: false,
        errorMessage: errorMsg
      });
    });

    it('should limit tool call history to 50 entries', () => {
      // Arrange: Fresh validator
      // Act: Record 55 tool executions
      for (let i = 0; i < 55; i++) {
        validator.recordToolExecution('browser_init', { attempt: i }, true);
      }
      
      // Assert: Should only keep last 50 entries
      const context = validator.getContext();
      expect(context.toolCallHistory).toHaveLength(50);
      expect(context.toolCallHistory[0].arguments.attempt).toBe(5); // 55-50=5
      expect(context.toolCallHistory[49].arguments.attempt).toBe(54);
    });
  });

  describe('Content Analysis Staleness', () => {
    it('should consider content analysis stale when never performed', () => {
      // Arrange: Fresh validator with no content analysis
      // Act: Check if content analysis is stale
      const isStale = validator.isContentAnalysisStale();
      
      // Assert: Should be considered stale
      expect(isStale).toBe(true);
    });

    it('should consider content analysis fresh when recently performed', () => {
      // Arrange: Perform recent content analysis workflow
      validator.recordToolExecution('browser_init', {}, true);
      validator.recordToolExecution('navigate', { url: 'https://example.com' }, true);
      validator.recordToolExecution('get_content', { type: 'html' }, true);
      
      // Act: Check if content analysis is stale
      const isStale = validator.isContentAnalysisStale();
      
      // Assert: Should be considered fresh
      expect(isStale).toBe(false);
    });
  });

  describe('Reset Functionality', () => {
    it('should reset validator to initial state', () => {
      // Arrange: Modify validator state
      validator.recordToolExecution('browser_init', {}, true);
      validator.recordToolExecution('navigate', { url: 'https://example.com' }, true);
      validator.recordToolExecution('get_content', { type: 'html' }, true);
      
      // Act: Reset validator
      validator.reset();
      
      // Assert: Should return to initial state
      const context = validator.getContext();
      expect(context.currentState).toBe(WorkflowState.INITIAL);
      expect(context.contentAnalyzed).toBe(false);
      expect(context.contentAnalysisAttempted).toBe(false);
      expect(context.toolCallHistory).toHaveLength(0);
      expect(context.stateTransitionHistory).toHaveLength(0);
      expect(context.pageUrl).toBeUndefined();
      expect(context.contentHash).toBeUndefined();
    });
  });
});

describe('Global Functions', () => {
  beforeEach(() => {
    // Reset global validator for isolated tests
    workflowValidator.reset();
  });

  describe('validateWorkflow function', () => {
    it('should validate tool execution using global validator', () => {
      // Arrange & Act: Use global validateWorkflow function
      const result = validateWorkflow('find_selector', { text: 'button' });
      
      // Assert: Should return validation result
      expect(result.isValid).toBe(false);
      expect(result.errorMessage).toContain('Cannot search for selectors');
    });
  });

  describe('recordExecution function', () => {
    it('should record execution using global validator', () => {
      // Arrange & Act: Use global recordExecution function
      recordExecution('browser_init', {}, true);
      
      // Assert: Should be recorded in global validator
      const context = workflowValidator.getContext();
      expect(context.toolCallHistory).toHaveLength(1);
      expect(context.toolCallHistory[0].toolName).toBe('browser_init');
    });
  });
});