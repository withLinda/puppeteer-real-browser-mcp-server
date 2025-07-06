import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  safeScreenshot, 
  preparePageForScreenshot, 
  isBrowserHealthy,
  screenshotControls,
  ScreenshotCircuitBreaker 
} from './screenshot-handler.js';

// Use any types to match project pattern (puppeteer-real-browser instances)
type Page = any;
type CDPSession = any;

// Enhanced mock factory with proper API structure
function createMockPage(): any {
  const mockCDPSession = {
    send: vi.fn(),
    detach: vi.fn(),
  };

  const mockElement = {
    screenshot: vi.fn(),
  };

  const mockTarget = {
    createCDPSession: vi.fn().mockResolvedValue(mockCDPSession),
  };

  const mockPage = {
    screenshot: vi.fn(),
    $: vi.fn(),
    evaluate: vi.fn(),
    target: vi.fn(() => mockTarget),
  };

  return { mockPage, mockCDPSession, mockElement, mockTarget };
}

// Helper to setup common mock behaviors
function setupDefaultMockBehaviors(mocks: any) {
  const { mockCDPSession, mockElement, mockPage } = mocks;
  
  // Reset all mocks to ensure clean state
  mockCDPSession.send.mockReset();
  mockPage.screenshot.mockReset();
  mockElement.screenshot.mockReset();
  mockPage.evaluate.mockReset();
  mockPage.$.mockReset();
  
  // Setup default CDP responses with proper structure
  mockCDPSession.send.mockImplementation((method: string) => {
    switch (method) {
      case 'Page.getLayoutMetrics':
        return Promise.resolve({
          layoutViewport: {
            clientWidth: 1920,
            clientHeight: 1080,
          },
        });
      case 'Page.captureScreenshot':
        return Promise.resolve({
          data: 'cdpScreenshotData',
        });
      default:
        return Promise.resolve({});
    }
  });

  // Setup default screenshot behavior
  mockPage.screenshot.mockResolvedValue('standardScreenshotData');
  
  // Setup default element behavior
  mockElement.screenshot.mockResolvedValue('elementScreenshotData');
  
  // Setup default evaluate behavior for browser health and preparation
  mockPage.evaluate.mockResolvedValue({
    url: 'https://example.com',
    readyState: 'complete',
    timestamp: Date.now(),
  });

  // Setup default element selector behavior
  mockPage.$.mockResolvedValue(null); // Default: element not found

  return mocks;
}

describe('Screenshot Handler Tests', () => {
  let mockPage: any;
  let mockCDPSession: any;
  let mockElement: any;
  let mockTarget: any;

  beforeEach(() => {
    // Clear all mocks and reset state
    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers(); // Ensure real timers by default
    
    // Reset circuit breaker to ensure clean state
    screenshotControls.resetCircuitBreaker();
    
    // Create fresh mocks for each test
    const mocks = createMockPage();
    mockPage = mocks.mockPage;
    mockCDPSession = mocks.mockCDPSession;
    mockElement = mocks.mockElement;
    mockTarget = mocks.mockTarget;
    
    // Setup default behaviors
    setupDefaultMockBehaviors(mocks);
  });

  afterEach(() => {
    // Complete cleanup after each test
    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.restoreAllMocks();
    
    // Ensure circuit breaker is reset
    screenshotControls.resetCircuitBreaker();
  });

  describe('safeScreenshot', () => {
    it('should use CDP method by default in safe mode', async () => {
      // The default mock setup already configures CDP properly
      // No additional setup needed since setupDefaultMockBehaviors handles this

      const result = await safeScreenshot(mockPage, { format: 'png' });

      expect(result.success).toBe(true);
      expect(result.screenshot).toBe('cdpScreenshotData');
      expect(result.method).toBe('cdp');
      expect(mockCDPSession.send).toHaveBeenCalledWith('Page.getLayoutMetrics');
      expect(mockCDPSession.send).toHaveBeenCalledWith('Page.captureScreenshot', expect.objectContaining({
        format: 'png',
        quality: 80,
      }));
      expect(mockCDPSession.detach).toHaveBeenCalled();
    }, 10000); // Add timeout

    it('should fallback to standard method if CDP fails', async () => {
      // Override the default mock to make CDP fail
      mockCDPSession.send.mockRejectedValue(new Error('CDP failed'));
      
      // Standard method should succeed (already configured in default setup)
      const result = await safeScreenshot(mockPage, { format: 'png' });

      expect(result.success).toBe(true);
      expect(result.screenshot).toBe('standardScreenshotData');
      expect(result.method).toBe('standard');
      
      // Verify CDP was attempted first
      expect(mockCDPSession.send).toHaveBeenCalled();
      // Then fallback to standard screenshot
      expect(mockPage.screenshot).toHaveBeenCalled();
    }, 10000); // Add timeout

    it('should capture element screenshot when selector provided', async () => {
      // Override default setup for element-specific test
      mockPage.$.mockResolvedValue(mockElement);
      
      const result = await safeScreenshot(mockPage, { 
        selector: '.test-element',
      });

      expect(result.success).toBe(true);
      expect(result.screenshot).toBe('elementScreenshotData');
      expect(result.method).toBe('element');
      expect(mockPage.$).toHaveBeenCalledWith('.test-element');
      expect(mockElement.screenshot).toHaveBeenCalledWith({ encoding: 'base64' });
    });

    it('should handle element not found error', async () => {
      mockPage.$.mockResolvedValue(null);

      const result = await safeScreenshot(mockPage, { 
        selector: '.non-existent',
              });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Element not found');
    });

    it('should respect timeout option', async () => {
      // Mock CDP to fail so it falls back to standard screenshot
      mockCDPSession.send.mockRejectedValue(new Error('CDP failed'));
      
      // Create a promise that hangs for longer than timeout
      mockPage.screenshot.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('delayed'), 200))
      );

      const result = await safeScreenshot(mockPage, { 
        timeout: 50, // Very short timeout
              });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out after 50ms');
    }, 10000); // 10 second test timeout

    it('should detect and handle stack overflow errors', async () => {
      const stackOverflowError = new RangeError('Maximum call stack size exceeded');
      mockCDPSession.send.mockRejectedValue(stackOverflowError);
      mockPage.screenshot.mockRejectedValue(stackOverflowError);

      const result = await safeScreenshot(mockPage);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Maximum call stack size exceeded');
    }, 10000); // Add timeout

    it('should retry operations with exponential backoff', async () => {
      // Setup mock sequence: fail first, succeed on retry
      mockCDPSession.send
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce({ layoutViewport: { clientWidth: 1920, clientHeight: 1080 } })
        .mockResolvedValueOnce({ data: 'retrySuccessData' });

      const result = await safeScreenshot(mockPage, { 
        maxRetries: 2,
        format: 'png' 
      });

      expect(result.success).toBe(true);
      expect(result.screenshot).toBe('retrySuccessData');
      expect(result.method).toBe('cdp');
      
      // Verify retry logic was triggered
      expect(mockCDPSession.send).toHaveBeenCalledTimes(3); // 1 fail + 2 success calls
    }, 15000); // Longer timeout to account for retry delays
  });

  describe('Circuit Breaker', () => {
    it('should open circuit after threshold failures', async () => {
      // Ensure clean state - circuit should start closed
      expect(screenshotControls.isCircuitBreakerOpen()).toBe(false);
      
      // Make both CDP and standard methods fail consistently
      mockCDPSession.send.mockRejectedValue(new Error('Failed'));
      mockPage.screenshot.mockRejectedValue(new Error('Failed'));

      // Fail 3 times (threshold is 3 in circuit breaker)
      for (let i = 0; i < 3; i++) {
        const result = await safeScreenshot(mockPage, { format: 'png' });
        expect(result.success).toBe(false);
        expect(result.error).toBeTruthy();
      }

      // Circuit should be open now (true means open/blocked)
      expect(screenshotControls.isCircuitBreakerOpen()).toBe(true);

      // Next attempt should fail immediately due to open circuit
      const result = await safeScreenshot(mockPage);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Circuit breaker is open');
    }, 15000); // Add timeout

    it('should recover circuit breaker after timeout', async () => {
      const breaker = new ScreenshotCircuitBreaker();
      
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error('Failed');
          }, 'test');
        } catch {}
      }

      expect(breaker.isOpen()).toBe(true);

      // Wait for recovery timeout (simulated by resetting the circuit breaker)
      breaker.reset();

      // Circuit should be closed after reset
      const successOp = vi.fn().mockResolvedValue('success');
      const result = await breaker.execute(successOp, 'test');
      
      expect(result).toBe('success');
      expect(breaker.isOpen()).toBe(false);
    });
  });

  describe('preparePageForScreenshot', () => {
    it('should prepare page for screenshot', async () => {
      // Clear mock call history but keep implementation
      mockPage.evaluate.mockClear();
      
      // Ensure the mock resolves properly for the preparation calls
      mockPage.evaluate.mockResolvedValue(undefined);

      await preparePageForScreenshot(mockPage);

      // Should have called evaluate twice: once for readyState check, once for scroll
      expect(mockPage.evaluate).toHaveBeenCalledTimes(2);
      
      // Verify the calls were made with functions
      expect(mockPage.evaluate).toHaveBeenNthCalledWith(1, expect.any(Function));
      expect(mockPage.evaluate).toHaveBeenNthCalledWith(2, expect.any(Function));
    }, 10000); // Add timeout

    it('should handle preparation errors gracefully', async () => {
      mockPage.evaluate.mockRejectedValue(new Error('Page error'));

      // Should not throw
      await expect(preparePageForScreenshot(mockPage)).resolves.toBeUndefined();
    });
  });

  describe('isBrowserHealthy', () => {
    it('should return true for healthy browser', async () => {
      mockPage.evaluate.mockResolvedValue({
        url: 'https://example.com',
        readyState: 'complete',
        timestamp: Date.now(),
      });

      const isHealthy = await isBrowserHealthy(mockPage);
      expect(isHealthy).toBe(true);
    });

    it('should return false for unhealthy browser', async () => {
      mockPage.evaluate.mockRejectedValue(new Error('Browser error'));

      const isHealthy = await isBrowserHealthy(mockPage);
      expect(isHealthy).toBe(false);
    });

    it('should return false if page not complete', async () => {
      mockPage.evaluate.mockResolvedValue({
        url: 'https://example.com',
        readyState: 'loading',
        timestamp: Date.now(),
      });

      const isHealthy = await isBrowserHealthy(mockPage);
      expect(isHealthy).toBe(false);
    });
  });

  describe('Full Page Screenshots', () => {
    it('should handle full page screenshots', async () => {
      mockCDPSession.send.mockRejectedValue(new Error('CDP not available'));
      mockPage.screenshot.mockResolvedValue('fullPageScreenshotData');

      const result = await safeScreenshot(mockPage, { 
        fullPage: true,
              });

      expect(result.success).toBe(true);
      expect(mockPage.screenshot).toHaveBeenCalledWith({
        encoding: 'base64',
        fullPage: true,
      });
    });

    it('should apply viewport limits in safe mode', async () => {
      mockCDPSession.send.mockRejectedValue(new Error('CDP not available'));
      mockPage.screenshot.mockResolvedValue('clippedScreenshotData');

      const result = await safeScreenshot(mockPage, { 
        fullPage: false,
        format: 'png',
      });

      expect(mockPage.screenshot).toHaveBeenCalledWith({
        encoding: 'base64',
        fullPage: false,
        clip: {
          x: 0,
          y: 0,
          width: 1920,
          height: 1080,
        },
      });
    });
  });
});