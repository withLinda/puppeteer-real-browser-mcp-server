/**
 * Navigation Handler Module for Puppeteer Real Browser MCP Server
 * Contains navigate and wait tool handlers with supporting utilities
 */

import { setTimeout as sleep } from 'node:timers/promises';
import { validateWorkflow, recordExecution, workflowValidator } from '../src/workflow-validation';

// Circuit breaker types and state
interface CircuitBreakerState {
  failureCount: number;
  lastFailureTime: number;
  state: 'closed' | 'open' | 'half-open';
}

// Constants for retry logic and circuit breaker
const MAX_RETRY_DEPTH = 3;
const MAX_BROWSER_INIT_DEPTH = 2;
const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_TIMEOUT = 30000; // 30 seconds

// Global state variables
let browserCircuitBreaker: CircuitBreakerState = {
  failureCount: 0,
  lastFailureTime: 0,
  state: 'closed'
};

let currentRetryDepth = 0;
let browserInitDepth = 0;

// External dependencies that need to be injected
let browserInstance: any = null;
let pageInstance: any = null;
let initializeBrowserFunction: any = null;
let validateSessionFunction: any = null;
let closeBrowserFunction: any = null;

// Configuration for these handlers
export function configureDependencies(dependencies: {
  browserInstance: any;
  pageInstance: any;
  initializeBrowser: any;
  validateSession: any;
  closeBrowser: any;
}) {
  browserInstance = dependencies.browserInstance;
  pageInstance = dependencies.pageInstance;
  initializeBrowserFunction = dependencies.initializeBrowser;
  validateSessionFunction = dependencies.validateSession;
  closeBrowserFunction = dependencies.closeBrowser;
}

// Circuit breaker utility functions
function recordFailure(): void {
  browserCircuitBreaker.failureCount++;
  browserCircuitBreaker.lastFailureTime = Date.now();
  
  if (browserCircuitBreaker.failureCount >= CIRCUIT_BREAKER_THRESHOLD) {
    browserCircuitBreaker.state = 'open';
    console.error(`Circuit breaker opened after ${browserCircuitBreaker.failureCount} failures`);
  }
}

function recordSuccess(): void {
  browserCircuitBreaker.failureCount = 0;
  browserCircuitBreaker.state = 'closed';
}

function isCircuitBreakerOpen(): boolean {
  if (browserCircuitBreaker.state === 'closed') {
    return false;
  }

  if (browserCircuitBreaker.state === 'open') {
    const timeSinceLastFailure = Date.now() - browserCircuitBreaker.lastFailureTime;
    if (timeSinceLastFailure > CIRCUIT_BREAKER_TIMEOUT) {
      browserCircuitBreaker.state = 'half-open';
      console.log('Circuit breaker moved to half-open state');
    }
  }

  return browserCircuitBreaker.state !== 'closed';
}

// Error handling wrapper
async function withErrorHandling<T>(
  operation: () => Promise<T>,
  errorMessage: string
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    console.error(`${errorMessage}:`, error);
    throw new Error(`${errorMessage}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Workflow validation wrapper
async function withWorkflowValidation<T>(
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

  try {
    const result = await operation();
    
    // Record successful execution
    recordExecution(toolName, args, true);
    return result;
  } catch (error) {
    // Record failed execution
    const errorMsg = error instanceof Error ? error.message : String(error);
    recordExecution(toolName, args, false, errorMsg);
    throw error;
  }
}

// Retry wrapper with circuit breaker and recursion protection
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000,
  context: string = 'unknown'
): Promise<T> {
  // Check recursion depth to prevent infinite loops
  if (currentRetryDepth >= MAX_RETRY_DEPTH) {
    throw new Error(`Maximum recursion depth (${MAX_RETRY_DEPTH}) exceeded in withRetry for context: ${context}. This prevents infinite loops.`);
  }

  // Check circuit breaker
  if (isCircuitBreakerOpen()) {
    throw new Error(`Circuit breaker is open. Browser operations are temporarily disabled to prevent cascade failures. Wait ${CIRCUIT_BREAKER_TIMEOUT}ms before retrying.`);
  }

  currentRetryDepth++;
  
  try {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await operation();
        recordSuccess();
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`Attempt ${attempt}/${maxRetries} failed for ${context}:`, lastError.message);
        
        recordFailure();
        
        if (attempt < maxRetries) {
          const backoffDelay = delay * Math.pow(1.5, attempt - 1);
          console.log(`Retrying in ${backoffDelay}ms...`);
          await sleep(backoffDelay);
        }
      }
    }
    
    throw lastError || new Error(`All ${maxRetries} retry attempts failed for ${context}`);
  } finally {
    currentRetryDepth--;
  }
}

// Initialize browser with proper error handling and recursion protection
async function initializeBrowser(options?: any) {
  // Check recursion depth for browser initialization
  if (browserInitDepth >= MAX_BROWSER_INIT_DEPTH) {
    throw new Error(`Maximum browser initialization depth (${MAX_BROWSER_INIT_DEPTH}) exceeded. This prevents infinite initialization loops.`);
  }

  // Check circuit breaker for browser operations
  if (isCircuitBreakerOpen()) {
    throw new Error(`Circuit breaker is open. Browser initialization is temporarily disabled. Wait ${CIRCUIT_BREAKER_TIMEOUT}ms before retrying.`);
  }

  browserInitDepth++;
  
  try {
    // Check if existing instances are still valid
    if (browserInstance && pageInstance) {
      const isValid = await validateSessionFunction();
      if (isValid) {
        return { browser: browserInstance, page: pageInstance };
      } else {
        console.error('Existing session is invalid, reinitializing browser...');
        await closeBrowserFunction();
      }
    }

    // Initialize new browser if needed
    return await initializeBrowserFunction(options);
  } finally {
    browserInitDepth--;
  }
}

// Navigate handler
export async function handleNavigate(args: any) {
  return await withWorkflowValidation('navigate', args, async () => {
    return await withErrorHandling(async () => {
      return await withRetry(async () => {
        const { page } = await initializeBrowser();
        await page.goto((args as any).url, {
          waitUntil: (args as any).waitUntil || 'networkidle2',
          timeout: 60000,
        });

        const workflowMessage = '\n\n🔄 Workflow Status: Page loaded\n' +
          '  • Next step: Use get_content to analyze page content\n' +
          '  • This enables find_selector and interaction tools\n' +
          '  • Content analysis prevents blind selector guessing';

        return {
          content: [
            {
              type: 'text',
              text: `Navigated to ${(args as any).url}${workflowMessage}`,
            },
          ],
        };
      }, 3, 1000, 'navigate');
    }, 'Failed to navigate');
  });
}

// Wait handler
export async function handleWait(args: any) {
  return await withErrorHandling(async () => {
    const { page } = await initializeBrowser();
    const { type, value, timeout = 30000, options = {} } = args as any;

    let waitResult = '';
    const startTime = Date.now();

    switch (type) {
      case 'selector':
        const selectorOptions = {
          timeout,
          visible: options.visible !== false, // Default to waiting for visible elements
          hidden: options.hidden === true,
          ...options
        };
        await page.waitForSelector(value, selectorOptions);
        waitResult = `Element found: ${value}`;
        break;

      case 'navigation':
        const navOptions = {
          waitUntil: options.waitUntil || 'networkidle2',
          timeout,
          ...options
        };
        await page.waitForNavigation(navOptions);
        waitResult = `Navigation completed (${navOptions.waitUntil})`;
        break;

      case 'timeout':
        await sleep(parseInt(value));
        waitResult = `Waited ${value}ms`;
        break;

      case 'function':
        // Wait for custom JavaScript function to return true
        const functionResult = await page.waitForFunction(value, { timeout, polling: options.polling || 'raf' });
        const result = await functionResult.jsonValue();
        waitResult = `Function condition met: ${result}`;
        break;

      case 'response':
        // Wait for specific HTTP response
        let responseReceived = false;
        const responsePromise = new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            if (!responseReceived) {
              reject(new Error(`Timeout waiting for response matching: ${value}`));
            }
          }, timeout);

          page.on('response', (response: any) => {
            if (response.url().includes(value) || response.url().match(new RegExp(value))) {
              responseReceived = true;
              clearTimeout(timeoutId);
              resolve(response);
            }
          });
        });

        const response = await responsePromise;
        waitResult = `Response received for: ${value}`;
        break;

      case 'request':
        // Wait for specific HTTP request
        let requestSent = false;
        const requestPromise = new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            if (!requestSent) {
              reject(new Error(`Timeout waiting for request matching: ${value}`));
            }
          }, timeout);

          page.on('request', (request: any) => {
            if (request.url().includes(value) || request.url().match(new RegExp(value))) {
              requestSent = true;
              clearTimeout(timeoutId);
              resolve(request);
            }
          });
        });

        const request = await requestPromise;
        waitResult = `Request sent for: ${value}`;
        break;

      case 'element_stable':
        // Wait for element to stop moving/changing position
        await page.waitForFunction((selector: string, stabilityTime: number) => {
          const element = document.querySelector(selector);
          if (!element) return false;

          // Store position data on the element
          if (!(element as any)._stabilityCheck) {
            (element as any)._stabilityCheck = {
              lastRect: element.getBoundingClientRect(),
              stableCount: 0,
              startTime: Date.now()
            };
            return false;
          }

          const check = (element as any)._stabilityCheck;
          const currentRect = element.getBoundingClientRect();
          
          if (currentRect.x === check.lastRect.x && 
              currentRect.y === check.lastRect.y && 
              currentRect.width === check.lastRect.width && 
              currentRect.height === check.lastRect.height) {
            check.stableCount++;
          } else {
            check.stableCount = 0;
            check.startTime = Date.now();
          }

          check.lastRect = currentRect;
          
          // Element is stable if it hasn't moved for the required time
          return (Date.now() - check.startTime) >= stabilityTime;
        }, { timeout, polling: 100 }, value, options.stabilityTime || 1000);
        waitResult = `Element stable: ${value}`;
        break;

      case 'content_loaded':
        // Wait for dynamic content to finish loading
        await page.waitForFunction(() => {
          // Check for common loading indicators
          const loadingElements = document.querySelectorAll(
            '.loading, .spinner, .loader, [data-loading="true"], [aria-busy="true"]'
          );
          
          // Check for skeleton screens
          const skeletonElements = document.querySelectorAll(
            '.skeleton, .shimmer, .placeholder-glow, [data-placeholder="true"]'
          );

          return loadingElements.length === 0 && skeletonElements.length === 0;
        }, { timeout, polling: options.polling || 500 });
        waitResult = 'Dynamic content loaded';
        break;

      case 'network_idle':
        // Wait for network activity to stop - use browser's built-in networkidle
        await page.waitForLoadState ? 
          page.waitForLoadState('networkidle', { timeout }) :
          page.waitForNavigation({ waitUntil: 'networkidle0', timeout });
        waitResult = `Network idle achieved`;
        break;

      default:
        throw new Error(`Unsupported wait type: ${type}`);
    }

    const duration = Date.now() - startTime;

    return {
      content: [
        {
          type: 'text',
          text: `✅ Wait completed: ${waitResult}\n⏱️  Duration: ${duration}ms\n🎯 Condition: ${type} - ${value}`,
        },
      ],
    };
  }, 'Failed to wait');
}

// Export utility functions for external use
export {
  withErrorHandling,
  withWorkflowValidation,
  withRetry,
  initializeBrowser,
  isCircuitBreakerOpen,
  recordFailure,
  recordSuccess
};