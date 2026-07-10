import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import type { ManagedBrowserLaunchOptions } from './managed-browser-session.js';
import { managedBrowserSession } from './managed-browser-session.js';

// Content prioritization configuration
export interface ContentPriorityConfig {
  prioritizeContent: boolean;
  autoSuggestGetContent: boolean;
}


// Circuit breaker and recursion tracking
export interface CircuitBreakerState {
  failureCount: number;
  lastFailureTime: number;
  state: 'closed' | 'open' | 'half-open';
}

// Browser error categorization
export enum BrowserErrorType {
  FRAME_DETACHED = 'FRAME_DETACHED',
  SESSION_CLOSED = 'SESSION_CLOSED',
  TARGET_CLOSED = 'TARGET_CLOSED',
  PROTOCOL_ERROR = 'PROTOCOL_ERROR',
  NAVIGATION_TIMEOUT = 'NAVIGATION_TIMEOUT',
  ELEMENT_NOT_FOUND = 'ELEMENT_NOT_FOUND',
  UNKNOWN = 'UNKNOWN'
}

// Store browser instance
let browserInstance: any = null;
let pageInstance: any = null;

// Check environment variable for testing override
const disableContentPriority = process.env.DISABLE_CONTENT_PRIORITY === 'true' || process.env.NODE_ENV === 'test';

let contentPriorityConfig: ContentPriorityConfig = {
  prioritizeContent: !disableContentPriority,
  autoSuggestGetContent: !disableContentPriority
};


let browserCircuitBreaker: CircuitBreakerState = {
  failureCount: 0,
  lastFailureTime: 0,
  state: 'closed'
};

const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_TIMEOUT = 30000; // 30 seconds

let browserInitDepth = 0;
const MAX_BROWSER_INIT_DEPTH = 2;

// Reset function for testing and error recovery
export function resetBrowserInitDepth() {
  browserInitDepth = 0;
}

// Test-safe browser initialization that bypasses depth limit
export async function initializeBrowserForTesting(options?: any) {
  // Reset depth counter for testing
  browserInitDepth = 0;
  
  // Force close any existing browser first
  try {
    await closeBrowser();
  } catch (error) {
    // Ignore close errors
  }
  
  // Now initialize normally
  return await initializeBrowser(options);
}

let sessionValidationInProgress = false;

// Error handling functions
export function categorizeError(error: Error): BrowserErrorType {
  const message = error.message.toLowerCase();

  if (message.includes('navigating frame was detached')) {
    return BrowserErrorType.FRAME_DETACHED;
  }
  if (message.includes('session closed')) {
    return BrowserErrorType.SESSION_CLOSED;
  }
  if (message.includes('target closed')) {
    return BrowserErrorType.TARGET_CLOSED;
  }
  if (message.includes('protocol error')) {
    return BrowserErrorType.PROTOCOL_ERROR;
  }
  if (message.includes('navigation timeout') || message.includes('timeout')) {
    return BrowserErrorType.NAVIGATION_TIMEOUT;
  }
  if (message.includes('element not found') || message.includes('no node found')) {
    return BrowserErrorType.ELEMENT_NOT_FOUND;
  }

  return BrowserErrorType.UNKNOWN;
}

// Timeout wrapper for operations that may hang
export async function withTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  context: string = 'unknown'
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeoutMs}ms in context: ${context}`));
    }, timeoutMs);

    operation()
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

// Circuit breaker functions
export function updateCircuitBreakerOnFailure(): void {
  browserCircuitBreaker.failureCount++;
  browserCircuitBreaker.lastFailureTime = Date.now();
  
  if (browserCircuitBreaker.failureCount >= CIRCUIT_BREAKER_THRESHOLD) {
    browserCircuitBreaker.state = 'open';
    console.error(`Circuit breaker opened after ${browserCircuitBreaker.failureCount} failures`);
  }
}

export function updateCircuitBreakerOnSuccess(): void {
  browserCircuitBreaker.failureCount = 0;
  browserCircuitBreaker.state = 'closed';
}

export function isCircuitBreakerOpen(): boolean {
  if (browserCircuitBreaker.state === 'closed') {
    return false;
  }
  
  if (browserCircuitBreaker.state === 'open') {
    const timeSinceLastFailure = Date.now() - browserCircuitBreaker.lastFailureTime;
    if (timeSinceLastFailure > CIRCUIT_BREAKER_TIMEOUT) {
      browserCircuitBreaker.state = 'half-open';
      console.error('Circuit breaker entering half-open state');
      return false;
    }
    return true;
  }
  
  return false;
}

// Windows Registry Chrome detection
function getWindowsChromeFromRegistry(): string | null {
  if (process.platform !== 'win32') return null;
  
  try {
    const registryQueries = [
      'reg query "HKEY_CURRENT_USER\\Software\\Google\\Chrome\\BLBeacon" /v version 2>nul',
      'reg query "HKEY_LOCAL_MACHINE\\Software\\Google\\Chrome\\BLBeacon" /v version 2>nul',
      'reg query "HKEY_LOCAL_MACHINE\\Software\\WOW6432Node\\Google\\Chrome\\BLBeacon" /v version 2>nul',
    ];
    
    for (const query of registryQueries) {
      try {
        const result = execSync(query, { encoding: 'utf8', timeout: 5000 });
        if (result) {
          const standardPaths = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
          ];
          
          for (const standardPath of standardPaths) {
            if (fs.existsSync(standardPath)) {
              console.error(`✓ Found Chrome via Registry detection: ${standardPath}`);
              return standardPath;
            }
          }
        }
      } catch (error) {
        // Continue to next registry query
      }
    }
    
    try {
      const installDirQuery = 'reg query "HKEY_LOCAL_MACHINE\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe" /ve 2>nul';
      const result = execSync(installDirQuery, { encoding: 'utf8', timeout: 5000 });
      const match = result.match(/REG_SZ\s+(.+\.exe)/);
      if (match && match[1] && fs.existsSync(match[1])) {
        console.error(`✓ Found Chrome via App Paths registry: ${match[1]}`);
        return match[1];
      }
    } catch (error) {
      // Registry detection failed, will fall back to file system search
    }
    
  } catch (error) {
    console.error('Windows Registry Chrome detection failed:', error instanceof Error ? error.message : String(error));
  }
  
  return null;
}

// Chrome path detection for cross-platform support with enhanced Windows support
export function detectChromePath(): string | null {
  const platform = process.platform;

  // Check environment variables first
  const envChromePath = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
  if (envChromePath && fs.existsSync(envChromePath)) {
    console.error(`✓ Found Chrome via environment variable: ${envChromePath}`);
    return envChromePath;
  }

  let possiblePaths: string[] = [];

  switch (platform) {
    case 'win32':
      possiblePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
        path.join(process.env.USERPROFILE || '', 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'),
        path.join(process.env.PROGRAMFILES || '', 'Google\\Chrome\\Application\\chrome.exe'),
        path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google\\Chrome\\Application\\chrome.exe'),
        path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome SxS\\Application\\chrome.exe'),
        'C:\\Program Files\\Google\\Chrome SxS\\Application\\chrome.exe',
        'C:\\Users\\Public\\Desktop\\Google Chrome.exe',
        path.join(process.env.APPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
        'C:\\Chrome\\chrome.exe',
        'C:\\google\\chrome\\chrome.exe',
        'C:\\PortableApps\\GoogleChromePortable\\App\\Chrome-bin\\chrome.exe',
      ];

      try {
        const registryPath = getWindowsChromeFromRegistry();
        if (registryPath) {
          possiblePaths.unshift(registryPath);
        }
      } catch (error) {
        console.error('Registry detection failed, continuing with file system search...');
      }
      break;
      
    case 'darwin':
      possiblePaths = [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary'
      ];
      break;
      
    case 'linux':
      possiblePaths = [
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/snap/bin/chromium',
        '/usr/bin/chrome',
        '/opt/google/chrome/chrome'
      ];
      break;
      
    default:
      console.error(`Platform ${platform} not explicitly supported for Chrome path detection`);
      return null;
  }

  for (const chromePath of possiblePaths) {
    try {
      if (fs.existsSync(chromePath)) {
        console.error(`✓ Found Chrome at: ${chromePath}`);
        return chromePath;
      }
    } catch (error) {
      // Continue to next path
    }
  }

  if (platform === 'win32') {
    console.error(`❌ Chrome not found at any expected Windows paths:`);
    console.error(`   Searched ${possiblePaths.length} locations:`);
    possiblePaths.slice(0, 8).forEach(path => console.error(`   - ${path}`));
    if (possiblePaths.length > 8) {
      console.error(`   ... and ${possiblePaths.length - 8} more locations`);
    }
    console.error(`\n   🔧 Windows Troubleshooting Solutions:`);
    console.error(`   1. Environment Variables (Recommended):`);
    console.error(`      - Set CHROME_PATH environment variable to your Chrome location`);
    console.error(`      - Example: set CHROME_PATH="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"`);
    console.error(`      - For Cursor IDE: Add env vars to MCP configuration`);
    console.error(`\n   2. Chrome Installation:`);
    console.error(`      - Download/reinstall Chrome: https://www.google.com/chrome/`);
    console.error(`      - Check if Chrome is installed for all users vs current user only`);
    console.error(`      - Try Chrome Canary if regular Chrome fails`);
    console.error(`\n   3. Permissions & Security:`);
    console.error(`      - Run IDE/terminal as Administrator`);
    console.error(`      - Add Chrome to Windows Defender exclusions`);
    console.error(`      - Check if antivirus software is blocking Chrome`);
    console.error(`\n   4. Custom Configuration:`);
    console.error(`      - Use customConfig.chromePath parameter in browser_init`);
    console.error(`      - Example: {"customConfig": {"chromePath": "C:\\\\custom\\\\path\\\\chrome.exe"}}`);
  } else {
    console.error(`❌ Chrome not found at any expected paths for platform: ${platform}`);
    console.error(`   Searched locations:`);
    possiblePaths.forEach(path => console.error(`   - ${path}`));
  }
  
  return null;
}

// Session validation utility
export async function validateSession(): Promise<boolean> {
  if (sessionValidationInProgress) {
    console.warn('Session validation already in progress, skipping duplicate validation');
    return false;
  }

  if (!browserInstance || !pageInstance) {
    return false;
  }

  sessionValidationInProgress = true;

  try {
    await withTimeout(async () => {
      await browserInstance.version();
      await pageInstance.evaluate(() => true);
    }, 5000, 'session-validation');

    return true;
  } catch (error) {
    console.error('Session validation failed:', error);
    return false;
  } finally {
    sessionValidationInProgress = false;
  }
}


// Helper function to quickly find authentication elements
export async function findAuthElements(pageInstance: any): Promise<string[]> {
  return await pageInstance.evaluate(() => {
    const authSelectors: string[] = [];
    
    const authPatterns = [
      /^(log\s*in|sign\s*in|log\s*on|sign\s*on)$/i,
      /^(login|signin|authenticate|enter)$/i,
      /continue with (google|github|facebook|twitter|microsoft)/i,
      /sign in with/i
    ];
    
    const clickableElements = document.querySelectorAll('a, button, [role="button"], input[type="submit"], input[type="button"]');
    
    clickableElements.forEach(el => {
      const text = (el.textContent || '').trim();
      const ariaLabel = el.getAttribute('aria-label') || '';
      const href = (el as HTMLAnchorElement).href || '';
      
      const matchesPattern = authPatterns.some(pattern => 
        pattern.test(text) || pattern.test(ariaLabel)
      );
      
      const hasAuthRoute = href.includes('login') || href.includes('signin') || 
                          href.includes('auth') || href.includes('oauth');
      
      if (matchesPattern || hasAuthRoute) {
        if (el.id) {
          authSelectors.push(`#${CSS.escape(el.id)}`);
        } else if (el.className && typeof el.className === 'string') {
          const classes = el.className.trim().split(/\s+/).filter(c => c);
          if (classes.length > 0) {
            authSelectors.push(el.tagName.toLowerCase() + '.' + classes.map(c => CSS.escape(c)).join('.'));
          }
        } else {
          authSelectors.push(`${el.tagName.toLowerCase()}:contains("${text}")`);
        }
      }
    });
    
    return [...new Set(authSelectors)];
  });
}

// Main browser initialization function
export async function initializeBrowser(options?: any) {
  if (browserInitDepth >= MAX_BROWSER_INIT_DEPTH) {
    throw new Error(`Maximum browser initialization depth (${MAX_BROWSER_INIT_DEPTH}) exceeded. This prevents infinite initialization loops.`);
  }

  if (isCircuitBreakerOpen()) {
    throw new Error(`Circuit breaker is open. Browser initialization is temporarily disabled. Wait ${CIRCUIT_BREAKER_TIMEOUT}ms before retrying.`);
  }

  browserInitDepth++;
  
  try {
    if (browserInstance && pageInstance) {
      const isValid = await validateSession();
      if (isValid) {
        return { browser: browserInstance, page: pageInstance };
      } else {
        console.error('Existing session is invalid, reinitializing browser...');
        await closeBrowser();
      }
    }

    const detectedChromePath = detectChromePath();
    const customConfig = { ...(options?.customConfig ?? {}) };
    const defaultFlags = [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-default-apps',
      '--start-maximized',
      '--disable-blink-features=AutomationControlled',
    ];
    const configuredFlags = Array.isArray(customConfig.chromeFlags)
      ? customConfig.chromeFlags as string[]
      : Array.isArray(customConfig.args)
        ? customConfig.args as string[]
        : defaultFlags;
    const chromeFlags = options?.proxy
      ? [...configuredFlags, `--proxy-server=${options.proxy}`]
      : configuredFlags;

    const launchOptions: ManagedBrowserLaunchOptions = {
      connectOption: {
        defaultViewport: null,
        timeout: process.platform === 'win32' ? 60_000 : 30_000,
        ...(options?.connectOption ?? {}),
      },
      customConfig: {
        ...customConfig,
        chromeFlags,
        ignoreDefaultFlags: customConfig.ignoreDefaultFlags === true,
      },
      disableXvfb: options?.disableXvfb ?? true,
      executablePath: detectedChromePath ?? undefined,
      headless: options?.headless ?? false,
      profilePath: options?.profilePath,
      proxy: options?.proxy,
      turnstile: true,
    };

    console.error('🔄 Starting one MCP-owned Chrome process...');
    try {
      const { browser, page } = await managedBrowserSession.launch(launchOptions);
      browserInstance = browser;
      pageInstance = page;
      updateCircuitBreakerOnSuccess();
      console.error(`✅ Browser initialized; owned PID: ${managedBrowserSession.ownedPid ?? 'unknown'}`);
      return { browser, page };
    } catch (error) {
      updateCircuitBreakerOnFailure();
      const message = error instanceof Error ? error.message : String(error);
      console.error(`❌ MCP-owned Chrome launch failed: ${message}`);
      throw new Error(`Browser initialization failed: ${message}`, { cause: error });
    }
  } finally {
    browserInitDepth--;
  }
}

// Close browser function
export async function closeBrowser() {
  try {
    await managedBrowserSession.close();
  } catch (error) {
    console.error('Error closing browser:', error);
  } finally {
    browserInstance = null;
    pageInstance = null;
  }
}

export function emergencyCloseBrowser(): void {
  managedBrowserSession.emergencyClose();
  browserInstance = null;
  pageInstance = null;
}

export function getOwnedBrowserPid(): number | null {
  return managedBrowserSession.ownedPid;
}

// Getters for browser instances
export function getBrowserInstance() {
  return browserInstance;
}

export function getPageInstance() {
  return pageInstance;
}

export function getContentPriorityConfig() {
  return contentPriorityConfig;
}

export function updateContentPriorityConfig(config: Partial<ContentPriorityConfig>) {
  contentPriorityConfig = { ...contentPriorityConfig, ...config };
}
