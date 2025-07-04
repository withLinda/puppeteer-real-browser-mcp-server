import { connect } from 'puppeteer-real-browser';
import * as fs from 'fs';
import * as path from 'path';
import * as net from 'net';

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

let currentRetryDepth = 0;
const MAX_RETRY_DEPTH = 3;
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

// Port availability and connection utilities for enhanced resilience
export async function isPortAvailable(port: number, host: string = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    
    server.listen(port, host, () => {
      server.once('close', () => {
        resolve(true);
      });
      server.close();
    });
    
    server.on('error', () => {
      resolve(false);
    });
  });
}

// Test localhost resolution and connectivity
export async function testHostConnectivity(): Promise<{ localhost: boolean; ipv4: boolean; recommendedHost: string }> {
  const testPort = 19222;
  
  try {
    const localhostAvailable = await isPortAvailable(testPort, 'localhost');
    const ipv4Available = await isPortAvailable(testPort, '127.0.0.1');
    
    return {
      localhost: localhostAvailable,
      ipv4: ipv4Available,
      recommendedHost: ipv4Available ? '127.0.0.1' : 'localhost'
    };
  } catch (error) {
    console.error('Host connectivity test failed:', error);
    return {
      localhost: false,
      ipv4: true,
      recommendedHost: '127.0.0.1'
    };
  }
}

// Get available port in range
export async function findAvailablePort(startPort: number = 9222, endPort: number = 9322): Promise<number | null> {
  for (let port = startPort; port <= endPort; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  return null;
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
    const { execSync } = require('child_process');
    
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
    const customConfig = options?.customConfig ?? {};
    const platform = process.platform;


    const getOptimalChromeFlags = (isWindows: boolean, isRetry: boolean = false): string[] => {
      // 2025 best practices: Minimal, secure, performance-focused flags
      const baseFlags = [
        '--no-first-run',
        '--no-default-browser-check', 
        '--disable-default-apps',
        '--disable-blink-features=AutomationControlled', // Essential for stealth
        '--start-maximized', // UI convenience, minimal performance impact
      ];

      // Add platform-specific flags only when absolutely necessary
      const platformFlags: string[] = [];
      
      if (isWindows) {
        // Only add Windows-specific flags if there are compatibility issues
        // Note: --no-sandbox removed for security (not needed for desktop automation)
        // Note: --disable-gpu removed unless headless mode has issues
      }

      // Emergency fallback flags for retry attempts only
      if (isRetry) {
        platformFlags.push(
          '--disable-extensions',
          '--disable-plugins',
          '--remote-debugging-port=0',
        );
      }

      return [...baseFlags, ...platformFlags];
    };

    const isRetryAttempt = options?._isRetryAttempt ?? false;
    const useIgnoreAllFlags = options?.ignoreAllFlags ?? true;

    const chromeConfig = {
      ignoreDefaultFlags: false,
      chromeFlags: useIgnoreAllFlags ? [
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-default-apps',
        '--start-maximized',
        '--disable-blink-features=AutomationControlled'
      ] : getOptimalChromeFlags(platform === 'win32', isRetryAttempt),
      ...customConfig
    };

    if (detectedChromePath && !chromeConfig.chromePath) {
      chromeConfig.chromePath = detectedChromePath;
    }

    const connectOptions: any = {
      headless: options?.headless ?? false,
      customConfig: chromeConfig,
      turnstile: true,
      disableXvfb: options?.disableXvfb ?? true,
      ignoreAllFlags: options?.ignoreAllFlags ?? true,
      args: useIgnoreAllFlags ? [
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-default-apps',
        '--start-maximized',
        '--disable-blink-features=AutomationControlled'
      ] : [],
      connectOption: {
        defaultViewport: null,
        timeout: platform === 'win32' ? 60000 : 30000,
        ...(options?.connectOption ?? {}),
      },
    };

    if (options?.proxy) {
      connectOptions.customConfig.chromeFlags.push(`--proxy-server=${options.proxy}`);
    }

    if (options?.plugins && Array.isArray(options.plugins)) {
      connectOptions.plugins = options.plugins;
    }

    console.error('🔍 Testing network connectivity...');
    const hostTest = await testHostConnectivity();
    console.error(`   localhost available: ${hostTest.localhost}`);
    console.error(`   127.0.0.1 available: ${hostTest.ipv4}`);
    console.error(`   recommended host: ${hostTest.recommendedHost}`);

    const availablePort = await findAvailablePort();
    if (availablePort) {
      console.error(`🔍 Found available debugging port: ${availablePort}`);
    } else {
      console.error('⚠️  No available ports found in range 9222-9322, using system-assigned port');
    }

    const createConnectionStrategy = (strategyName: string, modifications: any = {}) => {
      const strategy = {
        ...connectOptions,
        ...modifications,
        customConfig: {
          ...chromeConfig,
          ...modifications.customConfig,
          chromeFlags: [
            ...(modifications.customConfig?.chromeFlags || chromeConfig.chromeFlags),
            ...(availablePort ? [`--remote-debugging-port=${availablePort}`] : ['--remote-debugging-port=0'])
          ]
        }
      };
      
      return { strategyName, strategy };
    };

    // Primary strategy: User-defined configuration without --no-sandbox
    const primaryStrategy = {
      strategyName: 'User-Defined Configuration',
      strategy: {
        executablePath: detectedChromePath,
        headless: options?.headless ?? false,
        turnstile: true,
        args: [
          "--start-maximized",
          "--disable-blink-features=AutomationControlled",
        ],
        disableXvfb: true,
        ignoreAllFlags: true,
        customConfig: {
          ignoreDefaultFlags: false,
          chromeFlags: [
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-default-apps",
            "--start-maximized",
            "--disable-blink-features=AutomationControlled",
          ]
        },
        connectOption: {
          defaultViewport: null,
        },
      }
    };

    const connectionStrategies = [
      primaryStrategy,
      
      // Fallback strategies only if primary fails
      createConnectionStrategy('Minimal Configuration', {
        customConfig: {
          ignoreDefaultFlags: false,
          chromeFlags: [
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-default-apps',
            '--start-maximized',
            '--disable-blink-features=AutomationControlled'
          ]
        }
      }),
      
      createConnectionStrategy('Optimal Configuration', {
        customConfig: {
          ignoreDefaultFlags: false,
          chromeFlags: [
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-default-apps',
            '--start-maximized',
            '--disable-blink-features=AutomationControlled'
          ]
        }
      }),
      
      createConnectionStrategy('Network Fallback', {
        customConfig: {
          ignoreDefaultFlags: false,
          chromeFlags: [
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-default-apps',
            '--start-maximized',
            '--disable-blink-features=AutomationControlled',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor',
            ...(hostTest.recommendedHost === '127.0.0.1' ? ['--remote-debugging-address=127.0.0.1'] : [])
          ]
        }
      })
    ];

    let lastError: Error | null = null;

    for (let strategyIndex = 0; strategyIndex < connectionStrategies.length; strategyIndex++) {
      const { strategyName, strategy } = connectionStrategies[strategyIndex];
      
      try {
        console.error(`🔄 Attempting browser connection using ${strategyName}...`);
        
        const result = await withTimeout(async () => {
          try {
            console.error(`   Strategy config: ${JSON.stringify({
              headless: strategy.headless,
              ignoreAllFlags: strategy.ignoreAllFlags,
              chromeFlags: strategy.customConfig?.chromeFlags || 'none',
              chromePath: strategy.customConfig?.chromePath || 'default'
            })}`);
            
            const connectResult = await connect(strategy);
            console.error(`   ✅ Connection successful with ${strategyName}`);
            return connectResult;
          } catch (connectionError) {
            console.error(`   ❌ Connection failed: ${connectionError instanceof Error ? connectionError.message : String(connectionError)}`);
            
            const errorMsg = connectionError instanceof Error ? connectionError.message : String(connectionError);
            
            if (errorMsg.includes('ECONNREFUSED') || errorMsg.includes('localhost') || errorMsg.includes('127.0.0.1')) {
              console.error(`   Connection error detected, trying host fallback...`);
              
              const fallbackHost = hostTest.recommendedHost === '127.0.0.1' ? 'localhost' : '127.0.0.1';
              const fallbackStrategy = {
                ...strategy,
                customConfig: {
                  ...strategy.customConfig,
                  chromeFlags: [
                    ...strategy.customConfig.chromeFlags.filter((flag: string) => !flag.includes('remote-debugging-address')),
                    `--remote-debugging-address=${fallbackHost}`
                  ]
                }
              };
              
              console.error(`   Trying fallback with --remote-debugging-address=${fallbackHost}...`);
              return await connect(fallbackStrategy);
            }
            
            throw connectionError;
          }
        }, platform === 'win32' ? 180000 : 150000, `browser-connection-${strategyName.toLowerCase().replace(/\s+/g, '-')}`);
        
        const { browser, page } = result;

        browserInstance = browser;
        pageInstance = page;


        console.error(`✅ Browser initialized successfully using ${strategyName}`);
        updateCircuitBreakerOnSuccess();
        return { browser, page };
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`❌ ${strategyName} failed:`, lastError.message);
        
        if (lastError.message.includes('ECONNREFUSED')) {
          console.error(`   🔍 ECONNREFUSED detected - likely Chrome connection/port issue`);
        } else if (lastError.message.includes('ENOENT') || lastError.message.includes('spawn')) {
          console.error(`   🔍 Chrome executable issue detected`);
        } else if (lastError.message.includes('timeout')) {
          console.error(`   🔍 Connection timeout - Chrome may be slow to start`);
        }
        
        if (strategyIndex < connectionStrategies.length - 1) {
          const delayMs = 2000 + (strategyIndex * 1000);
          console.error(`⏳ Waiting ${delayMs/1000} seconds before trying next strategy...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }

    updateCircuitBreakerOnFailure();
    
    const errorMessage = lastError ? lastError.message : 'Unknown connection error';
    
    if (errorMessage.includes('ENOENT') || errorMessage.includes('spawn') || errorMessage.includes('chrome') || errorMessage.includes('ECONNREFUSED')) {
      if (platform === 'win32') {
        console.error(`❌ All browser connection strategies failed on Windows:`);
        console.error(`   Final Error: ${errorMessage}`);
        console.error(`\n   🔧 Enhanced Windows Troubleshooting Solutions:`);
        
        if (errorMessage.includes('ECONNREFUSED')) {
          console.error(`\n   🚨 ECONNREFUSED Error Specific Solutions:`);
          console.error(`   1. Port/Connection Issues:`);
          console.error(`      - Chrome DevTools Protocol port is being blocked`);
          console.error(`      - Add Chrome to Windows Firewall exceptions`);
          console.error(`      - Check if localhost resolves to 127.0.0.1 (run: ping localhost)`);
          console.error(`      - Try different Chrome flags: --remote-debugging-port=0`);
          console.error(`\n   2. Network Configuration:`);
          console.error(`      - Disable VPN/proxy temporarily`);
          console.error(`      - Check Windows hosts file (C:\\Windows\\System32\\drivers\\etc\\hosts)`);
          console.error(`      - Ensure localhost points to 127.0.0.1`);
          console.error(`\n   3. Chrome Process Management:`);
          console.error(`      - Kill all chrome.exe processes in Task Manager`);
          console.error(`      - Clear Chrome user data: %LOCALAPPDATA%\\Google\\Chrome\\User Data`);
          console.error(`      - Try running Chrome manually to test: chrome.exe --remote-debugging-port=9222`);
        }
        
        console.error(`\n   🔧 General Solutions:`);
        console.error(`   1. Environment Variables (Recommended):`);
        console.error(`      - Set CHROME_PATH environment variable`);
        console.error(`      - Example: set CHROME_PATH="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"`);
        console.error(`\n   2. Chrome Installation:`);
        console.error(`      - Download/reinstall Chrome: https://www.google.com/chrome/`);
        console.error(`      - Try Chrome Canary: https://www.google.com/chrome/canary/`);
        console.error(`\n   3. Permissions & Security:`);
        console.error(`      - Run as Administrator`);
        console.error(`      - Add Chrome to Windows Defender exclusions`);
        console.error(`      - Temporarily disable antivirus software`);
        console.error(`\n   4. Advanced Configuration:`);
        console.error(`      - Use customConfig.chromePath in browser_init`);
        console.error(`      - Try headless mode: {"headless": true}`);
        console.error(`      - Use environment variable: PUPPETEER_EXECUTABLE_PATH`);
      } else {
        console.error(`❌ Browser launch failed on ${platform}:`);
        console.error(`   Error: ${errorMessage}`);
      }
      
      throw new Error(`Browser initialization failed after trying all strategies: ${errorMessage}. See console for platform-specific troubleshooting steps.`);
    }
    
    throw lastError || new Error('Unknown browser initialization error');
  } finally {
    browserInitDepth--;
  }
}

// Close browser function
export async function closeBrowser() {
  if (browserInstance) {
    try {
      const pages = await browserInstance.pages();
      for (const page of pages) {
        try {
          await page.close();
        } catch (error) {
          console.error('Error closing page:', error);
        }
      }
      
      await browserInstance.close();
      
      if (browserInstance.process() != null) {
        try {
          browserInstance.process().kill('SIGTERM');
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          if (browserInstance.process() != null && !browserInstance.process().killed) {
            browserInstance.process().kill('SIGKILL');
          }
        } catch (error) {
          console.error('Error force-killing browser process:', error);
        }
      }
    } catch (error) {
      console.error('Error closing browser:', error);
      
      if (browserInstance && browserInstance.process() != null) {
        try {
          browserInstance.process().kill('SIGKILL');
        } catch (killError) {
          console.error('Error force-killing browser process with SIGKILL:', killError);
        }
      }
    } finally {
      browserInstance = null;
      pageInstance = null;
    }
  }
}

// Force kill all Chrome processes system-wide
export async function forceKillAllChromeProcesses() {
  try {
    const { spawn } = await import('child_process');
    
    if (process.platform !== 'win32') {
      spawn('pkill', ['-f', 'Google Chrome'], { stdio: 'ignore' });
      spawn('pkill', ['-f', 'chrome'], { stdio: 'ignore' });
    } else {
      spawn('taskkill', ['/F', '/IM', 'chrome.exe'], { stdio: 'ignore' });
      spawn('taskkill', ['/F', '/IM', 'GoogleChrome.exe'], { stdio: 'ignore' });
    }
  } catch (error) {
    console.error('Error force-killing Chrome processes:', error);
  }
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

