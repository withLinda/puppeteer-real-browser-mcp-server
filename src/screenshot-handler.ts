import { setTimeout as sleep } from 'node:timers/promises';

// Match project typing pattern - puppeteer-real-browser returns instances typed as 'any'
// This avoids puppeteer-core dependency while maintaining full CDP functionality

// Types for screenshot operations (CDP-only approach)
export interface ScreenshotOptions {
  selector?: string;
  fullPage?: boolean;
  quality?: number;
  format?: 'png' | 'jpeg';
  maxRetries?: number;
  timeout?: number;
}

export interface ScreenshotResult {
  success: boolean;
  screenshot?: string; // base64 encoded image
  error?: string;
  method?: 'cdp' | 'cdp-element' | 'cdp-fullpage';
  metadata?: {
    width: number;
    height: number;
    fileSize: number;
    duration: number;
  };
}

// Circuit breaker for screenshot operations
export class ScreenshotCircuitBreaker {
  private failureCount = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private readonly threshold = 3; // Lower threshold for screenshots
  private readonly timeout = 15000; // 15 seconds recovery time

  async execute<T>(operation: () => Promise<T>, context: string): Promise<T> {
    if (this.state === 'open') {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;
      if (timeSinceLastFailure > this.timeout) {
        this.state = 'half-open';
        console.log(`Circuit breaker half-open for ${context}, attempting recovery`);
      } else {
        throw new Error(`Circuit breaker is open for ${context}. Wait ${this.timeout - timeSinceLastFailure}ms before retrying.`);
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    if (this.state !== 'closed') {
      console.log('Circuit breaker recovered, closing circuit');
    }
    this.failureCount = 0;
    this.state = 'closed';
  }

  private onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.threshold) {
      this.state = 'open';
      console.error(`Circuit breaker opened after ${this.failureCount} failures`);
    }
  }

  isOpen(): boolean {
    return this.state === 'open';
  }

  reset(): void {
    this.failureCount = 0;
    this.state = 'closed';
    this.lastFailureTime = 0;
  }
}

// Global circuit breaker instance
const screenshotCircuitBreaker = new ScreenshotCircuitBreaker();

// Helper to add timeout to promises
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string
): Promise<T> {
  let timeoutId: NodeJS.Timeout;
  
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${operation} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

// CDP-only screenshot implementations
async function captureViewportWithCDP(
  page: any, 
  options: { quality: number; format: string }
): Promise<ScreenshotResult> {
  let client: any = null;
  
  try {
    console.log('Creating fresh CDP session for viewport screenshot...');
    client = await page.target().createCDPSession();
    
    // Get layout metrics for proper sizing
    const { layoutViewport } = await client.send('Page.getLayoutMetrics');
    
    const clipArea = {
      x: 0,
      y: 0,
      width: Math.min(layoutViewport.clientWidth, 1920),
      height: Math.min(layoutViewport.clientHeight, 1080),
      scale: 1
    };
    
    // Capture screenshot with CDP - never conflicts with stealth plugins
    const screenshot = await client.send('Page.captureScreenshot', {
      format: options.format,
      quality: options.quality,
      clip: clipArea,
      captureBeyondViewport: false,
    });

    return {
      success: true,
      screenshot: screenshot.data,
      method: 'cdp' as const,
      metadata: {
        width: clipArea.width,
        height: clipArea.height,
        fileSize: screenshot.data.length,
        duration: Date.now()
      }
    };
  } finally {
    // Always close CDP session (browser instance remains open)
    if (client) {
      await client.detach();
      console.log('CDP session closed, browser instance preserved');
    }
  }
}

// CDP-based full page screenshot
async function captureFullPageWithCDP(
  page: any,
  options: { quality: number; format: string }
): Promise<ScreenshotResult> {
  let client: any = null;
  
  try {
    console.log('Creating fresh CDP session for full page screenshot...');
    client = await page.target().createCDPSession();
    
    // Get full content size
    const { contentSize } = await client.send('Page.getLayoutMetrics');
    
    const screenshot = await client.send('Page.captureScreenshot', {
      format: options.format,
      quality: options.quality,
      clip: {
        x: 0,
        y: 0,
        width: contentSize.width,
        height: contentSize.height,
        scale: 1
      },
      captureBeyondViewport: true, // Enable for full page
    });

    return {
      success: true,
      screenshot: screenshot.data,
      method: 'cdp-fullpage' as const,
      metadata: {
        width: contentSize.width,
        height: contentSize.height,
        fileSize: screenshot.data.length,
        duration: Date.now()
      }
    };
  } finally {
    if (client) await client.detach();
  }
}

// CDP-based element screenshot
async function captureElementWithCDP(
  page: any,
  selector: string,
  options: { quality: number; format: string }
): Promise<ScreenshotResult> {
  let client: any = null;
  
  try {
    console.log(`Creating fresh CDP session for element screenshot: ${selector}`);
    
    // First check if element exists
    const element = await page.$(selector);
    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }
    
    // Get element bounding box
    const boundingBox = await element.boundingBox();
    if (!boundingBox) {
      throw new Error(`Element ${selector} is not visible or has no dimensions`);
    }
    
    client = await page.target().createCDPSession();
    
    const screenshot = await client.send('Page.captureScreenshot', {
      format: options.format,
      quality: options.quality,
      clip: {
        x: boundingBox.x,
        y: boundingBox.y,
        width: boundingBox.width,
        height: boundingBox.height,
        scale: 1
      },
      captureBeyondViewport: false,
    });

    return {
      success: true,
      screenshot: screenshot.data,
      method: 'cdp-element' as const,
      metadata: {
        width: boundingBox.width,
        height: boundingBox.height,
        fileSize: screenshot.data.length,
        duration: Date.now()
      }
    };
  } finally {
    if (client) await client.detach();
  }
}

// Loop-based retry implementation (no recursion)
async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number,
  context: string
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Screenshot attempt ${attempt}/${maxRetries} for ${context}`);
      const result = await operation();
      console.log(`Screenshot succeeded on attempt ${attempt}`);
      return result;
    } catch (error) {
      lastError = error as Error;
      console.error(`Screenshot attempt ${attempt} failed:`, error);
      
      // Check for stack overflow specifically
      if (lastError.message.includes('Maximum call stack size exceeded')) {
        console.error('Stack overflow detected, aborting retries');
        break;
      }
      
      // Don't retry on the last attempt
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * attempt, 5000); // Exponential backoff up to 5s
        console.log(`Waiting ${delay}ms before retry`);
        await sleep(delay);
      }
    }
  }
  
  throw lastError || new Error('Screenshot operation failed');
}

// Main safe screenshot handler (CDP-only for stealth compatibility)
export async function safeScreenshot(
  page: any,
  options: ScreenshotOptions = {}
): Promise<ScreenshotResult> {
  const {
    selector,
    fullPage = false,
    quality = 90,
    format = 'png',
    maxRetries = 2,
    timeout = 15000, // 15 second timeout
  } = options;

  try {
    // Check circuit breaker first
    return await screenshotCircuitBreaker.execute(async () => {
      return await withTimeout(
        retryOperation(
          async () => {
            // ALWAYS use CDP method to prevent stealth conflicts
            if (selector) {
              // CDP-based element screenshot
              return await captureElementWithCDP(page, selector, { 
                quality, 
                format 
              });
            } else if (fullPage) {
              // CDP-based full page screenshot
              return await captureFullPageWithCDP(page, { 
                quality, 
                format 
              });
            } else {
              // CDP-based viewport screenshot
              return await captureViewportWithCDP(page, { 
                quality, 
                format 
              });
            }
          },
          maxRetries,
          selector || (fullPage ? 'fullpage' : 'viewport')
        ),
        timeout,
        'CDP Screenshot capture'
      );
    }, 'screenshot');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('CDP Screenshot failed:', errorMessage);
    
    return {
      success: false,
      error: errorMessage,
      method: 'cdp' as const
    };
  }
}

// Helper to ensure clean browser state for screenshots
export async function preparePageForScreenshot(page: any): Promise<void> {
  try {
    // Wait for page to be stable
    await page.evaluate(() => {
      return new Promise<void>((resolve) => {
        if (document.readyState === 'complete') {
          resolve();
        } else {
          window.addEventListener('load', () => resolve());
        }
      });
    });
    
    // Wait a bit for any animations to complete
    await sleep(500);
    
    // Scroll to top to ensure consistent screenshots
    await page.evaluate(() => window.scrollTo(0, 0));
    
    // Wait for any lazy-loaded content
    await sleep(200);
  } catch (error) {
    console.warn('Error preparing page for screenshot:', error);
    // Continue anyway - page might still be screenshottable
  }
}

// Utility to check if browser is healthy before screenshot
export async function isBrowserHealthy(page: any): Promise<boolean> {
  try {
    // Simple health check
    const result = await page.evaluate(() => {
      return {
        url: window.location.href,
        readyState: document.readyState,
        timestamp: Date.now(),
      };
    });
    
    return result.readyState === 'complete';
  } catch (error) {
    console.error('Browser health check failed:', error);
    return false;
  }
}

// Export circuit breaker controls for testing/management
export const screenshotControls = {
  resetCircuitBreaker: () => screenshotCircuitBreaker.reset(),
  isCircuitBreakerOpen: () => screenshotCircuitBreaker.isOpen(),
};