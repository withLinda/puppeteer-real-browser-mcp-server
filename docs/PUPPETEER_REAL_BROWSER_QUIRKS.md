# Puppeteer-Real-Browser Screenshot Implementation Guide

## Overview

This document outlines the specific challenges and solutions for implementing screenshot functionality with `puppeteer-real-browser`, based on analysis of issue #7 and extensive unit testing.

## Key Challenges

### 1. Stack Overflow Issues with Rebrowser Patches

**Problem**: The Rebrowser patches that make `puppeteer-real-browser` undetectable can cause stack overflow errors during screenshot operations.

**Root Cause**: 
- Rebrowser modifies the browser runtime to remove automation traces
- These modifications can interfere with screenshot capture, especially with stealth plugins
- The interaction between Rebrowser patches and Puppeteer's screenshot mechanism can trigger unexpected recursion

**Solution Implemented**:
```typescript
// Safe screenshot with CDP fallback
async function safeScreenshot(page: Page, options: ScreenshotOptions) {
  try {
    // Always try CDP first in safe mode
    if (safeMode) {
      return await captureScreenshotWithCDP(page);
    }
  } catch (cdpError) {
    // Fallback to standard method
    return await page.screenshot(options);
  }
}
```

### 2. Circuit Breaker Pattern for Screenshot Operations

**Why Needed**: 
- Screenshot failures can cascade quickly with puppeteer-real-browser
- Failed screenshots can leave the browser in an unstable state
- Circuit breaker prevents system overload

**Implementation**:
```typescript
class ScreenshotCircuitBreaker {
  private failureCount = 0;
  private threshold = 3; // Lower threshold for screenshots
  private timeout = 15000; // 15 seconds recovery time
  
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.isOpen()) {
      throw new Error('Circuit breaker is open');
    }
    // ... implementation
  }
}
```

### 3. Loop-Based Retry (Not Recursion)

**Problem**: Recursive retry logic can trigger the same stack overflow issues

**Solution**:
```typescript
async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number
): Promise<T> {
  let lastError: Error | undefined;
  
  // Use loop instead of recursion
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      // Check for stack overflow specifically
      if (error.message.includes('Maximum call stack size exceeded')) {
        console.error('Stack overflow detected, aborting retries');
        break;
      }
      
      if (attempt < maxRetries) {
        await sleep(1000 * attempt); // Exponential backoff
      }
    }
  }
  
  throw lastError;
}
```

## Best Practices for Puppeteer-Real-Browser Screenshots

### 1. Always Use Safe Mode by Default

```typescript
const result = await safeScreenshot(page, {
  safeMode: true, // Use CDP as primary method
  timeout: 10000,
  maxRetries: 2,
});
```

### 2. Fresh Browser Instance for Screenshots

```typescript
async function takeScreenshotSafely(url: string) {
  let browser = null;
  try {
    browser = await puppeteerRealBrowser.connect({
      headless: false,
      customConfig: {
        ignoreDefaultFlags: false, // CRITICAL: Must be false
      }
    });
    
    const page = await browser.newPage();
    await page.goto(url);
    
    // Prepare page for screenshot
    await preparePageForScreenshot(page);
    
    return await safeScreenshot(page);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
```

### 3. Chrome DevTools Protocol (CDP) Fallback

**Why**: CDP is more reliable than high-level Puppeteer screenshot methods with Rebrowser patches.

```typescript
async function captureScreenshotWithCDP(page: Page): Promise<string> {
  const client = await page.target().createCDPSession();
  
  try {
    const { layoutViewport } = await client.send('Page.getLayoutMetrics');
    
    const screenshot = await client.send('Page.captureScreenshot', {
      format: 'png',
      quality: 80,
      clip: {
        x: 0,
        y: 0,
        width: Math.min(layoutViewport.clientWidth, 1920),
        height: Math.min(layoutViewport.clientHeight, 1080),
        scale: 1
      },
      captureBeyondViewport: false,
    });
    
    return screenshot.data;
  } finally {
    await client.detach();
  }
}
```

### 4. Disable Stealth Plugins During Screenshots

```typescript
async function screenshotWithDisabledPlugins(page: Page) {
  // Temporarily disable problematic plugins
  const originalUserAgent = await page.evaluate(() => navigator.userAgent);
  
  try {
    return await safeScreenshot(page, { safeMode: true });
  } finally {
    // Restore original state if needed
  }
}
```

## Error Handling Strategies

### 1. Specific Error Detection

```typescript
if (error.message.includes('Maximum call stack size exceeded')) {
  // Handle stack overflow specifically
  console.error('Stack overflow in screenshot operation');
  return await captureScreenshotWithCDP(page);
}

if (error.message.includes('Target closed') || 
    error.message.includes('Session closed')) {
  // Browser session issues - reinitialize
  await closeBrowser();
  throw new Error('Browser session lost, please reinitialize');
}
```

### 2. Timeout Protection

```typescript
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const timeoutPromise = new Promise<T>((_, reject) => {
    setTimeout(() => reject(new Error(`Operation timed out after ${ms}ms`)), ms);
  });
  
  return Promise.race([promise, timeoutPromise]);
}
```

### 3. Browser Health Checks

```typescript
async function isBrowserHealthy(page: Page): Promise<boolean> {
  try {
    const result = await page.evaluate(() => ({
      readyState: document.readyState,
      url: window.location.href,
    }));
    
    return result.readyState === 'complete';
  } catch {
    return false;
  }
}
```

## Testing Strategy

### 1. Mock puppeteer-real-browser Behavior

```typescript
// Mock specific to puppeteer-real-browser quirks
vi.mock('puppeteer-real-browser', () => ({
  connect: vi.fn(),
}));

// Test stack overflow scenarios
it('should handle stack overflow errors', async () => {
  const stackOverflowError = new RangeError('Maximum call stack size exceeded');
  mockPage.screenshot.mockRejectedValue(stackOverflowError);
  
  const result = await safeScreenshot(mockPage);
  expect(result.success).toBe(false);
  expect(result.error).toContain('Maximum call stack size exceeded');
});
```

### 2. Circuit Breaker Testing

```typescript
it('should open circuit after threshold failures', async () => {
  // Trigger failures to open circuit
  for (let i = 0; i < 3; i++) {
    await safeScreenshot(mockPageThatFails);
  }
  
  expect(screenshotControls.isCircuitBreakerOpen()).toBe(true);
});
```

### 3. Timeout Testing

```typescript
it('should respect timeout limits', async () => {
  mockPage.screenshot.mockImplementation(() => 
    new Promise(resolve => setTimeout(() => resolve('slow'), 200))
  );
  
  const result = await safeScreenshot(mockPage, { timeout: 100 });
  expect(result.error).toContain('timed out');
});
```

## Performance Considerations

1. **Limit Screenshot Size**: Use viewport clipping in safe mode
2. **Fresh Browser**: Don't reuse browser instances for screenshots
3. **Cleanup**: Always close browsers and detach CDP sessions
4. **Timeout**: Use aggressive timeouts (10s max) for screenshots
5. **Circuit Breaker**: Prevent cascade failures

## Known Limitations

1. **Plugin Interference**: Some stealth plugins may interfere with screenshots
2. **Recursion Sensitivity**: Rebrowser patches make the browser more sensitive to recursion
3. **Session Stability**: Browser sessions may become unstable after failed screenshots
4. **Window Object Access**: Limited access to window object due to runtime modifications

## Debugging Tips

1. **Enable Verbose Logging**: Track retry attempts and fallback methods
2. **Monitor Chrome Processes**: Check for zombie processes after failures
3. **Test in Headful Mode**: Easier to debug visual issues
4. **Check Console Output**: Rebrowser may log important warnings

```bash
# Monitor Chrome processes
ps aux | grep -i chrome | grep -v grep

# Clean up zombie processes
pkill -f "Google Chrome" || true
```

## Migration from Regular Puppeteer

When migrating from regular Puppeteer to puppeteer-real-browser:

1. **Replace Recursion**: Convert all recursive retry logic to loops
2. **Add Circuit Breakers**: Implement circuit breaker pattern
3. **Use CDP Fallbacks**: Always have CDP as backup method
4. **Fresh Browser Strategy**: Don't reuse browser instances
5. **Lower Timeouts**: Use more aggressive timeouts
6. **Error Specificity**: Handle stack overflow errors specifically

This approach ensures robust screenshot functionality while working within the constraints of puppeteer-real-browser's anti-detection features.