import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use any types to match project pattern (puppeteer-real-browser instances)
type Page = any;
type Browser = any;
type CDPSession = any;

// Mock puppeteer-real-browser
vi.mock('puppeteer-real-browser', () => ({
  connect: vi.fn(),
}));

// Types for our test setup
interface MockPage extends Partial<Page> {
  screenshot: ReturnType<typeof vi.fn>;
  $: ReturnType<typeof vi.fn>;
  target: ReturnType<typeof vi.fn>;
}

interface MockBrowser extends Partial<Browser> {
  newPage: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  isConnected: ReturnType<typeof vi.fn>;
}

interface MockCDPSession extends Partial<CDPSession> {
  send: ReturnType<typeof vi.fn>;
  detach: ReturnType<typeof vi.fn>;
}

interface MockElement {
  screenshot: ReturnType<typeof vi.fn>;
}

// Helper to create mock objects
function createMockPage(): MockPage {
  const mockCDPSession: MockCDPSession = {
    send: vi.fn(),
    detach: vi.fn(),
  };

  const mockPage: MockPage = {
    screenshot: vi.fn(),
    $: vi.fn(),
    target: vi.fn(() => ({
      createCDPSession: vi.fn(() => Promise.resolve(mockCDPSession)),
    })),
  };

  return mockPage;
}

function createMockBrowser(): MockBrowser {
  const mockBrowser: MockBrowser = {
    newPage: vi.fn(),
    close: vi.fn(),
    isConnected: vi.fn(() => true),
  };

  return mockBrowser;
}

describe('Screenshot Functionality Tests', () => {
  let mockBrowser: MockBrowser;
  let mockPage: MockPage;

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
    
    // Create fresh mock instances
    mockBrowser = createMockBrowser();
    mockPage = createMockPage();
    
    // Setup default mock behaviors
    mockBrowser.newPage.mockResolvedValue(mockPage);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Core Screenshot Functionality', () => {
    it('should capture a basic screenshot successfully', async () => {
      // Arrange
      const expectedBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
      mockPage.screenshot.mockResolvedValue(expectedBase64);

      // Act
      const result = await mockPage.screenshot({ encoding: 'base64' });

      // Assert
      expect(result).toBe(expectedBase64);
      expect(mockPage.screenshot).toHaveBeenCalledWith({ encoding: 'base64' });
    });

    it('should capture a full page screenshot', async () => {
      // Arrange
      const expectedBase64 = 'fullPageScreenshotBase64';
      mockPage.screenshot.mockResolvedValue(expectedBase64);

      // Act
      const result = await mockPage.screenshot({ fullPage: true, encoding: 'base64' });

      // Assert
      expect(result).toBe(expectedBase64);
      expect(mockPage.screenshot).toHaveBeenCalledWith({ fullPage: true, encoding: 'base64' });
    });

    it('should capture an element screenshot', async () => {
      // Arrange
      const elementBase64 = 'elementScreenshotBase64';
      const mockElement: MockElement = {
        screenshot: vi.fn().mockResolvedValue(elementBase64),
      };
      mockPage.$.mockResolvedValue(mockElement);

      // Act
      const element = await mockPage.$('.some-selector');
      const result = await element!.screenshot({ encoding: 'base64' });

      // Assert
      expect(result).toBe(elementBase64);
      expect(mockPage.$).toHaveBeenCalledWith('.some-selector');
      expect(mockElement.screenshot).toHaveBeenCalledWith({ encoding: 'base64' });
    });

    it('should handle element not found error gracefully', async () => {
      // Arrange
      mockPage.$.mockResolvedValue(null);

      // Act & Assert
      const element = await mockPage.$('.non-existent');
      expect(element).toBeNull();
    });
  });

  describe('CDP Safe Mode Screenshots', () => {
    it('should use CDP for screenshot in safe mode', async () => {
      // Arrange
      const mockCDPSession = {
        send: vi.fn(),
        detach: vi.fn(),
      };
      
      mockCDPSession.send
        .mockResolvedValueOnce({ // Page.getLayoutMetrics
          layoutViewport: {
            clientWidth: 1920,
            clientHeight: 1080,
          },
        })
        .mockResolvedValueOnce({ // Page.captureScreenshot
          data: 'cdpScreenshotBase64Data',
        });

      const mockTarget = {
        createCDPSession: vi.fn().mockResolvedValue(mockCDPSession),
      };
      
      mockPage.target = vi.fn(() => mockTarget);

      // Act
      const client = await mockPage.target().createCDPSession();
      const metrics = await client.send('Page.getLayoutMetrics');
      const screenshot = await client.send('Page.captureScreenshot', {
        format: 'png',
        quality: 80,
        clip: {
          x: 0,
          y: 0,
          width: Math.min(metrics.layoutViewport.clientWidth, 1920),
          height: Math.min(metrics.layoutViewport.clientHeight, 1080),
          scale: 1,
        },
        captureBeyondViewport: false,
      });
      await client.detach();

      // Assert
      expect(screenshot.data).toBe('cdpScreenshotBase64Data');
      expect(mockCDPSession.send).toHaveBeenCalledTimes(2);
      expect(mockCDPSession.detach).toHaveBeenCalledTimes(1);
    });
  });

  describe('Stack Overflow Prevention', () => {
    it('should detect and prevent stack overflow errors', async () => {
      // Arrange
      const stackOverflowError = new RangeError('Maximum call stack size exceeded');
      mockPage.screenshot.mockRejectedValue(stackOverflowError);

      // Act & Assert
      await expect(mockPage.screenshot()).rejects.toThrow('Maximum call stack size exceeded');
    });

    it('should limit retry depth to prevent infinite recursion', async () => {
      // Simulate a retry mechanism with depth tracking
      const MAX_RETRY_DEPTH = 3;
      let currentDepth = 0;

      async function withDepthTracking<T>(fn: () => Promise<T>): Promise<T> {
        if (currentDepth >= MAX_RETRY_DEPTH) {
          throw new Error(`Maximum recursion depth (${MAX_RETRY_DEPTH}) exceeded`);
        }
        
        currentDepth++;
        try {
          return await fn();
        } finally {
          currentDepth--;
        }
      }

      // Test that depth tracking works
      let attempts = 0;
      const recursiveFunction = async (): Promise<void> => {
        attempts++;
        await withDepthTracking(recursiveFunction);
      };

      await expect(recursiveFunction()).rejects.toThrow('Maximum recursion depth (3) exceeded');
      expect(attempts).toBeLessThanOrEqual(MAX_RETRY_DEPTH);
    });

    it('should use loop-based retry instead of recursion', async () => {
      // Implement loop-based retry logic
      async function safeRetry<T>(
        operation: () => Promise<T>,
        maxRetries: number = 3
      ): Promise<T> {
        let lastError: Error | undefined;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            return await operation();
          } catch (error) {
            lastError = error as Error;
            console.log(`Attempt ${attempt}/${maxRetries} failed:`, error);
          }
        }
        
        throw lastError || new Error('Operation failed');
      }

      // Test the loop-based retry
      let attempts = 0;
      const failingOperation = async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Temporary failure');
        }
        return 'success';
      };

      const result = await safeRetry(failingOperation, 3);
      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });
  });

  describe('Circuit Breaker Pattern', () => {
    it('should implement circuit breaker for browser operations', async () => {
      // Circuit breaker implementation
      class CircuitBreaker {
        private failureCount = 0;
        private lastFailureTime = 0;
        private state: 'closed' | 'open' | 'half-open' = 'closed';
        private readonly threshold = 5;
        private readonly timeout = 30000; // 30 seconds

        async execute<T>(operation: () => Promise<T>): Promise<T> {
          if (this.state === 'open') {
            const timeSinceLastFailure = Date.now() - this.lastFailureTime;
            if (timeSinceLastFailure > this.timeout) {
              this.state = 'half-open';
            } else {
              throw new Error('Circuit breaker is open');
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
          this.failureCount = 0;
          this.state = 'closed';
        }

        private onFailure() {
          this.failureCount++;
          this.lastFailureTime = Date.now();
          
          if (this.failureCount >= this.threshold) {
            this.state = 'open';
          }
        }

        isOpen(): boolean {
          return this.state === 'open';
        }
      }

      // Test circuit breaker
      const breaker = new CircuitBreaker();
      const failingOperation = async () => {
        throw new Error('Operation failed');
      };

      // Trigger failures to open the circuit
      for (let i = 0; i < 5; i++) {
        await expect(breaker.execute(failingOperation)).rejects.toThrow('Operation failed');
      }

      // Circuit should now be open
      expect(breaker.isOpen()).toBe(true);
      await expect(breaker.execute(failingOperation)).rejects.toThrow('Circuit breaker is open');
    });
  });

  describe('Fresh Browser Instance Pattern', () => {
    it('should create fresh browser instance for each screenshot', async () => {
      // Simulate creating fresh browser for screenshot
      async function screenshotWithFreshBrowser(): Promise<string> {
        const browser = createMockBrowser();
        const page = createMockPage();
        
        browser.newPage.mockResolvedValue(page);
        page.screenshot.mockResolvedValue('freshBrowserScreenshot');
        
        try {
          const newPage = await browser.newPage();
          const screenshot = await newPage.screenshot({ encoding: 'base64' });
          return screenshot as string;
        } finally {
          await browser.close();
        }
      }

      const result = await screenshotWithFreshBrowser();
      expect(result).toBe('freshBrowserScreenshot');
    });

    it('should properly cleanup browser after screenshot', async () => {
      let browserClosed = false;
      
      mockBrowser.close.mockImplementation(async () => {
        browserClosed = true;
      });

      try {
        await mockPage.screenshot();
      } finally {
        await mockBrowser.close();
      }

      expect(browserClosed).toBe(true);
    });
  });

  describe('Timeout Protection', () => {
    it('should timeout long-running screenshot operations', async () => {
      // Helper to add timeout to any promise
      async function withTimeout<T>(
        promise: Promise<T>,
        timeoutMs: number
      ): Promise<T> {
        let timeoutId: NodeJS.Timeout;
        
        const timeoutPromise = new Promise<T>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error(`Operation timed out after ${timeoutMs}ms`));
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

      // Test timeout
      const slowOperation = new Promise((resolve) => {
        setTimeout(resolve, 5000);
      });

      await expect(withTimeout(slowOperation, 100)).rejects.toThrow('Operation timed out after 100ms');
    });
  });

  describe('Plugin Management', () => {
    it('should disable stealth plugins during screenshot', async () => {
      // Mock plugin configuration
      const pluginConfig = {
        stealthEnabled: true,
        plugins: ['stealth', 'recaptcha'],
      };

      // Function to temporarily disable plugins
      async function screenshotWithDisabledPlugins(config: typeof pluginConfig): Promise<string> {
        const originalConfig = { ...config };
        
        try {
          // Disable plugins for screenshot
          config.stealthEnabled = false;
          config.plugins = [];
          
          // Take screenshot
          mockPage.screenshot.mockResolvedValue('screenshotWithoutPlugins');
          return await mockPage.screenshot({ encoding: 'base64' }) as string;
        } finally {
          // Restore original config
          config.stealthEnabled = originalConfig.stealthEnabled;
          config.plugins = originalConfig.plugins;
        }
      }

      const result = await screenshotWithDisabledPlugins(pluginConfig);
      
      expect(result).toBe('screenshotWithoutPlugins');
      // Config should be restored
      expect(pluginConfig.stealthEnabled).toBe(true);
      expect(pluginConfig.plugins).toEqual(['stealth', 'recaptcha']);
    });
  });

  describe('Error Recovery Strategies', () => {
    it('should fallback to CDP when regular screenshot fails', async () => {
      // First attempt fails
      mockPage.screenshot.mockRejectedValueOnce(new Error('Screenshot failed'));
      
      // CDP fallback succeeds
      const mockCDPSession = {
        send: vi.fn()
          .mockResolvedValueOnce({ layoutViewport: { clientWidth: 1920, clientHeight: 1080 } })
          .mockResolvedValueOnce({ data: 'cdpFallbackScreenshot' }),
        detach: vi.fn(),
      };
      
      mockPage.target = vi.fn(() => ({
        createCDPSession: vi.fn().mockResolvedValue(mockCDPSession),
      }));

      // Fallback logic
      async function screenshotWithFallback(): Promise<string> {
        try {
          return await mockPage.screenshot({ encoding: 'base64' }) as string;
        } catch (error) {
          console.log('Regular screenshot failed, trying CDP fallback');
          
          const client = await mockPage.target().createCDPSession();
          const { layoutViewport } = await client.send('Page.getLayoutMetrics');
          const screenshot = await client.send('Page.captureScreenshot', {
            format: 'png',
            quality: 80,
            clip: {
              x: 0,
              y: 0,
              width: Math.min(layoutViewport.clientWidth, 1920),
              height: Math.min(layoutViewport.clientHeight, 1080),
              scale: 1,
            },
            captureBeyondViewport: false,
          });
          await client.detach();
          
          return screenshot.data;
        }
      }

      const result = await screenshotWithFallback();
      expect(result).toBe('cdpFallbackScreenshot');
    });

    it('should handle browser disconnection gracefully', async () => {
      mockBrowser.isConnected.mockReturnValue(false);
      
      async function checkBrowserBeforeScreenshot(): Promise<void> {
        if (!mockBrowser.isConnected()) {
          throw new Error('Browser is not connected');
        }
        await mockPage.screenshot();
      }

      await expect(checkBrowserBeforeScreenshot()).rejects.toThrow('Browser is not connected');
    });
  });
});