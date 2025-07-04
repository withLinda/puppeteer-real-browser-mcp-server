/**
 * Workflow Validation System for MCP Server
 * 
 * Prevents blind selector guessing by enforcing proper tool execution sequence:
 * INITIAL → BROWSER_READY → PAGE_LOADED → CONTENT_ANALYZED → SELECTOR_AVAILABLE
 * 
 * State transitions:
 * - browser_init: INITIAL → BROWSER_READY
 * - navigate: BROWSER_READY → PAGE_LOADED  
 * - get_content: PAGE_LOADED → CONTENT_ANALYZED
 * - find_selector: CONTENT_ANALYZED → SELECTOR_AVAILABLE
 * - browser_close: any state → INITIAL
 * 
 * Based on 2025 MCP validation best practices and security guidelines.
 */

export enum WorkflowState {
  INITIAL = 'INITIAL',           // Before browser initialization
  BROWSER_READY = 'BROWSER_READY', // After successful browser_init, ready for navigation
  PAGE_LOADED = 'PAGE_LOADED',   // After successful navigation
  CONTENT_ANALYZED = 'CONTENT_ANALYZED', // After successful get_content
  SELECTOR_AVAILABLE = 'SELECTOR_AVAILABLE' // After successful find_selector
}

export interface WorkflowContext {
  currentState: WorkflowState;
  pageUrl?: string;
  contentAnalyzed: boolean;
  contentAnalysisAttempted: boolean; // Track if analysis was attempted regardless of success
  lastContentSize?: number;
  lastContentType?: 'html' | 'text';
  contentHash?: string;
  lastContentError?: string; // Store last content analysis error
  toolCallHistory: ToolCall[];
  stateTransitionHistory: StateTransition[];
}

export interface ToolCall {
  toolName: string;
  timestamp: number;
  arguments: any;
  success: boolean;
  errorMessage?: string;
}

export interface StateTransition {
  fromState: WorkflowState;
  toState: WorkflowState;
  timestamp: number;
  trigger: string;
}

export interface WorkflowValidationResult {
  isValid: boolean;
  errorMessage?: string;
  suggestedAction?: string;
  requiredState?: WorkflowState;
}

export class WorkflowValidator {
  private context: WorkflowContext;

  constructor() {
    this.context = {
      currentState: WorkflowState.INITIAL,
      contentAnalyzed: false,
      contentAnalysisAttempted: false,
      toolCallHistory: [],
      stateTransitionHistory: []
    };
  }

  /**
   * Get current workflow context
   */
  getContext(): WorkflowContext {
    return { ...this.context };
  }

  /**
   * Reset workflow to initial state
   */
  reset(): void {
    this.context = {
      currentState: WorkflowState.INITIAL,
      contentAnalyzed: false,
      contentAnalysisAttempted: false,
      toolCallHistory: [],
      stateTransitionHistory: []
    };
  }

  /**
   * Validate if a tool can be executed in current state
   */
  validateToolExecution(toolName: string, args?: any): WorkflowValidationResult {
    const timestamp = Date.now();

    // Define tool prerequisites - STRICT: find_selector requires successful content analysis
    const toolPrerequisites: Record<string, WorkflowState[]> = {
      'browser_init': [WorkflowState.INITIAL, WorkflowState.BROWSER_READY, WorkflowState.PAGE_LOADED, WorkflowState.CONTENT_ANALYZED, WorkflowState.SELECTOR_AVAILABLE],
      'browser_close': [WorkflowState.BROWSER_READY, WorkflowState.PAGE_LOADED, WorkflowState.CONTENT_ANALYZED, WorkflowState.SELECTOR_AVAILABLE],
      'navigate': [WorkflowState.BROWSER_READY, WorkflowState.PAGE_LOADED, WorkflowState.CONTENT_ANALYZED, WorkflowState.SELECTOR_AVAILABLE],
      'get_content': [WorkflowState.PAGE_LOADED, WorkflowState.CONTENT_ANALYZED, WorkflowState.SELECTOR_AVAILABLE],
      'find_selector': [WorkflowState.CONTENT_ANALYZED, WorkflowState.SELECTOR_AVAILABLE], // STRICT: Only after successful analysis
      'click': [WorkflowState.CONTENT_ANALYZED, WorkflowState.SELECTOR_AVAILABLE],
      'type': [WorkflowState.CONTENT_ANALYZED, WorkflowState.SELECTOR_AVAILABLE],
      'wait': [WorkflowState.PAGE_LOADED, WorkflowState.CONTENT_ANALYZED, WorkflowState.SELECTOR_AVAILABLE],
      'solve_captcha': [WorkflowState.PAGE_LOADED, WorkflowState.CONTENT_ANALYZED, WorkflowState.SELECTOR_AVAILABLE],
      'random_scroll': [WorkflowState.PAGE_LOADED, WorkflowState.CONTENT_ANALYZED, WorkflowState.SELECTOR_AVAILABLE]
    };

    const allowedStates = toolPrerequisites[toolName];
    
    if (!allowedStates) {
      return {
        isValid: false,
        errorMessage: `Unknown tool: ${toolName}`
      };
    }

    if (!allowedStates.includes(this.context.currentState)) {
      // Generate helpful error messages based on current state and tool
      let errorMessage = `Tool '${toolName}' cannot be executed in current state '${this.context.currentState}'.`;
      let suggestedAction = '';

      switch (toolName) {
        case 'find_selector':
          if (this.context.currentState === WorkflowState.INITIAL) {
            errorMessage = `Cannot search for selectors before browser initialization and page navigation.`;
            suggestedAction = `First: 1) Use 'browser_init' to start browser, 2) Use 'navigate' to load a page, 3) Use 'get_content' to analyze page content, then 'find_selector' will be available.`;
          } else if (this.context.currentState === WorkflowState.BROWSER_READY) {
            errorMessage = `Cannot search for selectors before page navigation and content analysis.`;
            suggestedAction = `First: 1) Use 'navigate' to load a page, 2) Use 'get_content' to analyze page content, then 'find_selector' will be available.`;
          } else if (this.context.currentState === WorkflowState.PAGE_LOADED) {
            errorMessage = `Cannot search for selectors before analyzing page content. This prevents blind selector guessing.`;
            suggestedAction = `Use 'get_content' to analyze the page content first. If the page is too large, try 'get_content' with contentMode='summary' or contentMode='main' for reduced token usage.`;
          }
          break;

        case 'click':
        case 'type':
          if (this.context.currentState === WorkflowState.INITIAL) {
            suggestedAction = `Initialize browser and navigate to a page first: 1) browser_init, 2) navigate, 3) get_content to analyze elements.`;
          } else if (this.context.currentState === WorkflowState.BROWSER_READY) {
            suggestedAction = `Navigate to a page and analyze content first: 1) navigate, 2) get_content to analyze elements.`;
          } else if (this.context.currentState === WorkflowState.PAGE_LOADED) {
            suggestedAction = `Use 'get_content' to analyze page elements before interacting with them.`;
          }
          break;

        case 'get_content':
          if (this.context.currentState === WorkflowState.INITIAL) {
            suggestedAction = `Initialize browser and navigate to a page first: 1) Use 'browser_init' to start browser, 2) Use 'navigate' to load a page.`;
          } else if (this.context.currentState === WorkflowState.BROWSER_READY) {
            suggestedAction = `Navigate to a page first using 'navigate' tool.`;
          }
          break;

        case 'navigate':
          if (this.context.currentState === WorkflowState.INITIAL) {
            suggestedAction = `Initialize browser first using 'browser_init' tool.`;
          }
          break;
      }

      return {
        isValid: false,
        errorMessage,
        suggestedAction,
        requiredState: allowedStates[0]
      };
    }

    return { isValid: true };
  }

  /**
   * Record successful tool execution and update state
   */
  recordToolExecution(toolName: string, args: any, success: boolean, errorMessage?: string): void {
    const timestamp = Date.now();
    
    // Record tool call
    this.context.toolCallHistory.push({
      toolName,
      timestamp,
      arguments: args,
      success,
      errorMessage
    });

    // Update state based on successful tool execution only
    if (success) {
      this.updateWorkflowState(toolName, args);
    }

    // Cleanup old history (keep last 50 entries)
    if (this.context.toolCallHistory.length > 50) {
      this.context.toolCallHistory = this.context.toolCallHistory.slice(-50);
    }
    if (this.context.stateTransitionHistory.length > 20) {
      this.context.stateTransitionHistory = this.context.stateTransitionHistory.slice(-20);
    }
  }

  /**
   * Update workflow state based on tool execution
   */
  private updateWorkflowState(toolName: string, args: any): void {
    const oldState = this.context.currentState;
    let newState = oldState;

    switch (toolName) {
      case 'browser_init':
        newState = WorkflowState.BROWSER_READY; // Transition to BROWSER_READY after successful init
        // Reset content analysis when browser is reinitialized
        this.context.contentAnalyzed = false;
        this.context.contentAnalysisAttempted = false;
        this.context.pageUrl = undefined;
        this.context.contentHash = undefined;
        this.context.lastContentError = undefined;
        break;

      case 'navigate':
        newState = WorkflowState.PAGE_LOADED;
        this.context.pageUrl = args.url;
        // Reset content analysis when navigating to new page
        this.context.contentAnalyzed = false;
        this.context.contentAnalysisAttempted = false;
        this.context.contentHash = undefined;
        this.context.lastContentError = undefined;
        break;

      case 'get_content':
        // Always mark as attempted
        this.context.contentAnalysisAttempted = true;
        
        // Mark as analyzed since we only get here on success
        newState = WorkflowState.CONTENT_ANALYZED;
        this.context.contentAnalyzed = true;
        this.context.lastContentType = args.type || 'html';
        // Generate simple content hash for change detection
        this.context.contentHash = this.generateContentHash(args);
        break;

      case 'find_selector':
        newState = WorkflowState.SELECTOR_AVAILABLE;
        break;

      case 'browser_close':
        // Reset to initial state when browser is closed
        newState = WorkflowState.INITIAL;
        this.context.contentAnalyzed = false;
        this.context.contentAnalysisAttempted = false;
        this.context.pageUrl = undefined;
        this.context.contentHash = undefined;
        this.context.lastContentError = undefined;
        break;
    }

    // Record state transition if state changed
    if (newState !== oldState) {
      this.context.stateTransitionHistory.push({
        fromState: oldState,
        toState: newState,
        timestamp: Date.now(),
        trigger: toolName
      });
      this.context.currentState = newState;
    }
  }


  /**
   * Generate simple hash for content change detection
   */
  private generateContentHash(args: any): string {
    const hashInput = `${args.type || 'html'}-${args.selector || 'full-page'}-${Date.now()}`;
    // Simple hash function (for change detection, not security)
    let hash = 0;
    for (let i = 0; i < hashInput.length; i++) {
      const char = hashInput.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Check if content analysis is stale (page may have changed)
   */
  isContentAnalysisStale(): boolean {
    if (!this.context.contentAnalyzed) {
      return true;
    }

    // Check if analysis is older than 5 minutes
    const lastContentCall = this.context.toolCallHistory
      .filter(call => call.toolName === 'get_content' && call.success)
      .pop();

    if (!lastContentCall) {
      return true;
    }

    const ageMinutes = (Date.now() - lastContentCall.timestamp) / (1000 * 60);
    return ageMinutes > 5;
  }

  /**
   * Get workflow validation summary for debugging
   */
  getValidationSummary(): string {
    const context = this.getContext();
    const recentCalls = context.toolCallHistory.slice(-5);
    
    return `
Workflow Validation Summary:
- Current State: ${context.currentState}
- Page URL: ${context.pageUrl || 'None'}
- Content Analyzed: ${context.contentAnalyzed}
- Content Analysis Attempted: ${context.contentAnalysisAttempted}
- Content Analysis Stale: ${this.isContentAnalysisStale()}
- Last Content Error: ${context.lastContentError ? context.lastContentError.substring(0, 50) + '...' : 'None'}
- Recent Tool Calls: ${recentCalls.map(call => `${call.toolName}(${call.success ? 'OK' : 'FAIL'})`).join(', ') || 'None'}
- State Transitions: ${context.stateTransitionHistory.slice(-3).map(t => `${t.fromState}→${t.toState}`).join(', ') || 'None'}
    `.trim();
  }
}

// Global workflow validator instance
export const workflowValidator = new WorkflowValidator();

/**
 * Middleware function to validate tool execution
 */
export function validateWorkflow(toolName: string, args?: any): WorkflowValidationResult {
  return workflowValidator.validateToolExecution(toolName, args);
}

/**
 * Middleware function to record tool execution
 */
export function recordExecution(toolName: string, args: any, success: boolean, errorMessage?: string): void {
  workflowValidator.recordToolExecution(toolName, args, success, errorMessage);
}