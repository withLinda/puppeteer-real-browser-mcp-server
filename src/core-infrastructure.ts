import { validateWorkflow, recordExecution, workflowValidator } from './workflow-validation.js';
import { categorizeError, BrowserErrorType, updateCircuitBreakerOnFailure, updateCircuitBreakerOnSuccess, isCircuitBreakerOpen, closeBrowser } from './browser-manager.js';
import { setTimeout as sleep } from 'node:timers/promises';

// Browser-specific retry logic with circuit breaker and error recovery
let currentRetryDepth = 0;
const MAX_RETRY_DEPTH = 3;

export async function withBrowserRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000,
  context: string = 'unknown'
): Promise<T> {
  // Check recursion depth to prevent infinite loops
  if (currentRetryDepth >= MAX_RETRY_DEPTH) {
    throw new Error(`Maximum recursion depth (${MAX_RETRY_DEPTH}) exceeded in withBrowserRetry for context: ${context}. This prevents infinite loops.`);
  }

  // Check circuit breaker
  if (isCircuitBreakerOpen()) {
    throw new Error(`Circuit breaker is open. Browser operations are temporarily disabled to prevent cascade failures. Wait 30000ms before retrying.`);
  }

  currentRetryDepth++;
  let lastError: Error | undefined;

  try {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await operation();
        updateCircuitBreakerOnSuccess();
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const errorType = categorizeError(lastError);

        console.error(`Attempt ${attempt}/${maxRetries} failed (${errorType}) in context ${context}:`, lastError.message);

        // Check if this is a recoverable error that might need browser cleanup
        const recoverableErrors = [
          BrowserErrorType.FRAME_DETACHED,
          BrowserErrorType.SESSION_CLOSED,
          BrowserErrorType.TARGET_CLOSED,
          BrowserErrorType.PROTOCOL_ERROR,
          BrowserErrorType.NAVIGATION_TIMEOUT
        ];

        const isRecoverable = recoverableErrors.includes(errorType);

        // For session-related errors, clean up browser state
        if (errorType === BrowserErrorType.SESSION_CLOSED || 
            errorType === BrowserErrorType.TARGET_CLOSED ||
            errorType === BrowserErrorType.FRAME_DETACHED) {
          console.warn(`Browser session error detected (${errorType}), cleaning up browser state...`);
          try {
            await closeBrowser();
          } catch (cleanupError) {
            console.error('Error during browser cleanup:', cleanupError);
          }
        }

        if (!isRecoverable || attempt === maxRetries) {
          // For element not found errors, provide helpful message
          if (errorType === BrowserErrorType.ELEMENT_NOT_FOUND) {
            throw new Error(`Element not found after ${maxRetries} attempts. Please verify the selector is correct and the element exists on the page.`);
          }
          break;
        }

        // Wait before retry with exponential backoff
        const waitTime = delay * Math.pow(2, attempt - 1);
        await sleep(waitTime);
      }
    }

    updateCircuitBreakerOnFailure();
    throw lastError || new Error('Unknown error in withBrowserRetry');
  } finally {
    currentRetryDepth--;
  }
}

// Workflow validation wrapper for coordinating execution with validation
export async function withWorkflowValidation<T>(
  toolName: string,
  args: any,
  operation: () => Promise<T>
): Promise<T> {
  // Validate workflow state before execution
  const validation = validateWorkflow(toolName, args);
  
  if (!validation.isValid) {
    let errorMessage = validation.errorMessage || `Tool '${toolName}' is not allowed in current workflow state.`;
    
    if (validation.suggestedAction) {
      errorMessage += `\n\n💡 Next Steps: ${validation.suggestedAction}`;
    }
    
    // Add workflow context for debugging
    const workflowSummary = workflowValidator.getValidationSummary();
    errorMessage += `\n\n🔍 ${workflowSummary}`;
    
    // Record failed execution
    recordExecution(toolName, args, false, errorMessage);
    
    throw new Error(errorMessage);
  }

  // Execute the operation
  let result: T;
  let success = false;
  let executionError: string | undefined;

  try {
    result = await operation();
    success = true;
    return result;
  } catch (error) {
    executionError = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    // Record execution result in workflow
    recordExecution(toolName, args, success, executionError);
  }
}

// Response formatting utilities
export function formatSuccess(message: string, data?: any): any {
  return {
    content: [
      {
        type: 'text',
        text: message,
      },
      ...(data ? [data] : []),
    ],
  };
}

export function formatError(message: string, context?: string): any {
  const fullMessage = context ? `${message}\n\nContext: ${context}` : message;
  return {
    content: [
      {
        type: 'text',
        text: `❌ Error: ${fullMessage}`,
      },
    ],
    isError: true,
  };
}

// Tool execution wrapper that combines error handling, workflow validation, and retry logic
export async function executeToolSafely<T>(
  toolName: string,
  args: any,
  operation: () => Promise<T>,
  options: {
    useRetry?: boolean;
    maxRetries?: number;
    context?: string;
  } = {}
): Promise<T> {
  const { useRetry = false, maxRetries = 3, context = toolName } = options;

  const wrappedOperation = async () => {
    return await withWorkflowValidation(toolName, args, operation);
  };

  if (useRetry) {
    return await withBrowserRetry(wrappedOperation, maxRetries, 1000, context);
  } else {
    return await wrappedOperation();
  }
}

// Utility for handling tool responses consistently
export function handleToolResponse<T>(
  result: T,
  successMessage?: string
): any {
  if (typeof result === 'object' && result !== null && 'content' in result) {
    // Already formatted response
    return result;
  }

  return formatSuccess(
    successMessage || 'Operation completed successfully',
    typeof result === 'string' && result.length > 0 ? { type: 'text', text: result } : undefined
  );
}

// MCP server configuration constants
export const MCP_SERVER_CONFIG = {
  name: 'puppeteer-real-browser-mcp-server',
  version: '1.4.0',
  capabilities: {
    tools: {},
    resources: {},
    prompts: {},
  },
} as const;

// Process cleanup utilities
export function setupProcessCleanup(cleanupCallback: () => Promise<void>): void {
  // Handle process termination gracefully
  const cleanup = async () => {
    console.error('🧹 Cleaning up before exit...');
    try {
      await cleanupCallback();
      console.error('✅ Cleanup completed');
    } catch (error) {
      console.error('❌ Error during cleanup:', error);
    }
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('uncaughtException', async (error) => {
    console.error('❌ Uncaught exception:', error);
    await cleanup();
  });
  process.on('unhandledRejection', async (reason) => {
    console.error('❌ Unhandled rejection:', reason);
    await cleanup();
  });
}

// Type definitions for tool execution
export interface ToolExecutionContext {
  toolName: string;
  args: any;
  startTime: number;
  retryCount?: number;
}

export interface ToolExecutionResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  duration: number;
  context: ToolExecutionContext;
}

// Enhanced tool execution tracking
export async function executeWithTracking<T>(
  context: ToolExecutionContext,
  operation: () => Promise<T>
): Promise<ToolExecutionResult<T>> {
  const startTime = Date.now();
  
  try {
    const result = await operation();
    const duration = Date.now() - startTime;
    
    return {
      success: true,
      result,
      duration,
      context
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    
    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
      duration,
      context
    };
  }
}