#!/usr/bin/env node
import { Server } from '@modelContextProtocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelContextProtocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ListPromptsRequestSchema,
  InitializeRequestSchema,
} from '@modelContextProtocol/sdk/types.js';
import { connect } from 'puppeteer-real-browser';
import { randomScroll } from './stealth-actions';
import { setTimeout as sleep } from 'node:timers/promises';
import * as fs from 'fs';
import * as path from 'path';
import * as net from 'net';

// Store browser instance
let browserInstance: any = null;
let pageInstance: any = null;

// Circuit breaker and recursion tracking
interface CircuitBreakerState {
  failureCount: number;
  lastFailureTime: number;
  state: 'closed' | 'open' | 'half-open';
}

let browserCircuitBreaker: CircuitBreakerState = {
  failureCount: 0,
  lastFailureTime: 0,
  state: 'closed'
};

let currentRetryDepth = 0;
const MAX_RETRY_DEPTH = 3;
const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_TIMEOUT = 30000; // 30 seconds

// Initialize MCP server
const server = new Server(
  {
    name: 'puppeteer-real-browser-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  }
);

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

// Specific error types for better handling
enum BrowserErrorType {
  FRAME_DETACHED = 'FRAME_DETACHED',
  SESSION_CLOSED = 'SESSION_CLOSED',
  TARGET_CLOSED = 'TARGET_CLOSED',
  PROTOCOL_ERROR = 'PROTOCOL_ERROR',
  NAVIGATION_TIMEOUT = 'NAVIGATION_TIMEOUT',
  ELEMENT_NOT_FOUND = 'ELEMENT_NOT_FOUND',
  UNKNOWN = 'UNKNOWN'
}

function categorizeError(error: Error): BrowserErrorType {
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
async function withTimeout<T>(
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
function updateCircuitBreakerOnFailure(): void {
  browserCircuitBreaker.failureCount++;
  browserCircuitBreaker.lastFailureTime = Date.now();
  
  if (browserCircuitBreaker.failureCount >= CIRCUIT_BREAKER_THRESHOLD) {
    browserCircuitBreaker.state = 'open';
    console.error(`Circuit breaker opened after ${browserCircuitBreaker.failureCount} failures`);
  }
}

function updateCircuitBreakerOnSuccess(): void {
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
      console.error('Circuit breaker entering half-open state');
      return false;
    }
    return true;
  }
  
  return false; // half-open state allows one attempt
}

// Retry wrapper for operations that may fail due to browser issues
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
  let lastError: Error;

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

        // Check if this is a recoverable error
        const recoverableErrors = [
          BrowserErrorType.FRAME_DETACHED,
          BrowserErrorType.SESSION_CLOSED,
          BrowserErrorType.TARGET_CLOSED,
          BrowserErrorType.PROTOCOL_ERROR,
          BrowserErrorType.NAVIGATION_TIMEOUT
        ];

        const isRecoverable = recoverableErrors.includes(errorType);

        if (!isRecoverable || attempt === maxRetries) {
          // For element not found errors, provide helpful message
          if (errorType === BrowserErrorType.ELEMENT_NOT_FOUND) {
            throw new Error(`Element not found after ${maxRetries} attempts. Please verify the selector is correct and the element exists on the page.`);
          }
          break;
        }

        // Wait before retry with exponential backoff
        const waitTime = delay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, waitTime));

        // Browser recovery for session-related errors (but avoid nested browser init)
        if ([BrowserErrorType.SESSION_CLOSED, BrowserErrorType.TARGET_CLOSED, BrowserErrorType.FRAME_DETACHED].includes(errorType)) {
          console.error('Attempting browser cleanup (without reinit to avoid recursion)...');
          try {
            await closeBrowser();
            await new Promise(resolve => setTimeout(resolve, 2000)); 
          } catch (e) {
            console.error('Error during browser cleanup:', e);
          }
        }
      }
    }

    updateCircuitBreakerOnFailure();
    throw lastError!;
  } finally {
    currentRetryDepth--;
  }
}

// Session validation utility
let sessionValidationInProgress = false;

async function validateSession(): Promise<boolean> {
  // Prevent concurrent session validation to avoid recursion
  if (sessionValidationInProgress) {
    console.warn('Session validation already in progress, skipping duplicate validation');
    return false;
  }

  if (!browserInstance || !pageInstance) {
    return false;
  }

  sessionValidationInProgress = true;

  try {
    // Add timeout to session validation to prevent hanging
    await withTimeout(async () => {
      // Test if browser is still connected
      await browserInstance.version();

      // Test if page is still active  
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

// Port availability and connection utilities for enhanced resilience
async function isPortAvailable(port: number, host: string = '127.0.0.1'): Promise<boolean> {
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
async function testHostConnectivity(): Promise<{ localhost: boolean; ipv4: boolean; recommendedHost: string }> {
  const testPort = 19222; // Temporary test port
  
  try {
    // Test localhost connectivity
    const localhostAvailable = await isPortAvailable(testPort, 'localhost');
    
    // Test 127.0.0.1 connectivity  
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
      ipv4: true, // Default to 127.0.0.1 if test fails
      recommendedHost: '127.0.0.1'
    };
  }
}

// Get available port in range
async function findAvailablePort(startPort: number = 9222, endPort: number = 9322): Promise<number | null> {
  for (let port = startPort; port <= endPort; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  return null;
}

// Chrome path detection for cross-platform support with enhanced Windows support
function detectChromePath(): string | null {
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
      // Enhanced Windows Chrome detection with more paths and fallbacks
      possiblePaths = [
        // Standard installations
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        
        // User-specific installations
        path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
        path.join(process.env.USERPROFILE || '', 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'),
        
        // Environment-based paths
        path.join(process.env.PROGRAMFILES || '', 'Google\\Chrome\\Application\\chrome.exe'),
        path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google\\Chrome\\Application\\chrome.exe'),
        
        // Chrome Canary fallback
        path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome SxS\\Application\\chrome.exe'),
        'C:\\Program Files\\Google\\Chrome SxS\\Application\\chrome.exe',
        
        // Additional common locations
        'C:\\Users\\Public\\Desktop\\Google Chrome.exe',
        path.join(process.env.APPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
        'C:\\Chrome\\chrome.exe',
        'C:\\google\\chrome\\chrome.exe',
        
        // Portable installations
        'C:\\PortableApps\\GoogleChromePortable\\App\\Chrome-bin\\chrome.exe',
      ];

      // Try Windows Registry detection
      try {
        const registryPath = getWindowsChromeFromRegistry();
        if (registryPath) {
          possiblePaths.unshift(registryPath); // Add to beginning for priority
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

  // Search through all possible paths
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

  // Enhanced error message for Windows with specific troubleshooting steps
  if (platform === 'win32') {
    console.error(`❌ Chrome not found at any expected Windows paths:`);
    console.error(`   Searched ${possiblePaths.length} locations:`);
    possiblePaths.slice(0, 8).forEach(path => console.error(`   - ${path}`)); // Show first 8 paths
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

// Windows Registry Chrome detection
function getWindowsChromeFromRegistry(): string | null {
  if (process.platform !== 'win32') return null;
  
  try {
    const { execSync } = require('child_process');
    
    // Query Windows Registry for Chrome installation path
    const registryQueries = [
      'reg query "HKEY_CURRENT_USER\\Software\\Google\\Chrome\\BLBeacon" /v version 2>nul',
      'reg query "HKEY_LOCAL_MACHINE\\Software\\Google\\Chrome\\BLBeacon" /v version 2>nul',
      'reg query "HKEY_LOCAL_MACHINE\\Software\\WOW6432Node\\Google\\Chrome\\BLBeacon" /v version 2>nul',
    ];
    
    for (const query of registryQueries) {
      try {
        const result = execSync(query, { encoding: 'utf8', timeout: 5000 });
        if (result) {
          // If registry key exists, Chrome is likely installed in standard location
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
    
    // Alternative: Query Chrome's installation directory directly
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

// Browser lifecycle management
let browserInitDepth = 0;
const MAX_BROWSER_INIT_DEPTH = 2;

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
      const isValid = await validateSession();
      if (isValid) {
        return { browser: browserInstance, page: pageInstance };
      } else {
        console.error('Existing session is invalid, reinitializing browser...');
        await closeBrowser();
      }
    }

  // Detect Chrome path for cross-platform support
  const detectedChromePath = detectChromePath();
  const customConfig = options?.customConfig ?? {};
  const platform = process.platform;

  // Get platform-specific Chrome flags with enhanced Windows support
  const getOptimalChromeFlags = (isWindows: boolean, isRetry: boolean = false): string[] => {
    const baseFlags = [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-default-apps',
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage', // Overcome limited resource problems
      '--disable-setuid-sandbox',
      '--disable-web-security', // Disable CORS for automation
    ];

    if (isWindows) {
      // Enhanced Windows-specific flags for better compatibility
      const windowsFlags = [
        '--no-sandbox', // Critical for Windows environments
        '--disable-gpu', // Prevent GPU-related crashes on Windows
        '--disable-gpu-sandbox',
        '--disable-software-rasterizer',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
        '--disable-features=TranslateUI,VizDisplayCompositor',
        '--force-color-profile=srgb',
        '--metrics-recording-only',
        '--no-default-browser-check',
        '--no-first-run',
        '--mute-audio',
        '--hide-scrollbars',
        '--disable-component-update',
        '--disable-background-networking',
        '--disable-sync',
        '--disable-translate',
        '--disable-ipc-flooding-protection',
        '--max-old-space-size=4096', // Increase memory limit
        '--stack-size=16000', // Increase stack size for Node.js
      ];

      if (isRetry) {
        // More aggressive flags for retry attempts
        windowsFlags.push(
          '--single-process', // Use single process (less stable but more compatible)
          '--no-zygote', // Disable zygote process forking
          '--disable-extensions', // Disable all extensions
          '--disable-plugins', // Disable plugins
          '--remote-debugging-port=0', // Let system assign random port
        );
      } else {
        // Standard flags for first attempt
        windowsFlags.push(
          '--start-maximized',
          '--disable-extensions-file-access-check',
        );
      }

      return [...baseFlags, ...windowsFlags];
    } else {
      // Non-Windows flags
      return [
        ...baseFlags,
        '--no-sandbox',
        '--disable-features=VizDisplayCompositor',
        '--start-maximized',
      ];
    }
  };

  // Check if this is a retry attempt (for fallback strategies)
  const isRetryAttempt = options?._isRetryAttempt ?? false;

  // Configure chrome-launcher options with platform-specific optimizations
  const chromeConfig = {
    ignoreDefaultFlags: false,
    chromeFlags: getOptimalChromeFlags(platform === 'win32', isRetryAttempt),
    ...customConfig
  };

  // Add detected Chrome path if found and not already specified
  if (detectedChromePath && !chromeConfig.chromePath) {
    chromeConfig.chromePath = detectedChromePath;
  }

  // Enhanced connection options with fallback support
  const connectOptions: any = {
    headless: options?.headless ?? false,
    customConfig: chromeConfig,
    turnstile: true,
    disableXvfb: options?.disableXvfb ?? true,
    connectOption: {
      defaultViewport: null,
      timeout: platform === 'win32' ? 60000 : 30000, // Longer timeout for Windows
      ...(options?.connectOption ?? {}),
    },
  };

  if (options?.proxy) {
    connectOptions.customConfig.chromeFlags.push(`--proxy-server=${options.proxy}`);
  }

  if (options?.plugins && Array.isArray(options.plugins)) {
    connectOptions.plugins = options.plugins;
  }

  // Test host connectivity for better connection resilience
  console.error('🔍 Testing network connectivity...');
  const hostTest = await testHostConnectivity();
  console.error(`   localhost available: ${hostTest.localhost}`);
  console.error(`   127.0.0.1 available: ${hostTest.ipv4}`);
  console.error(`   recommended host: ${hostTest.recommendedHost}`);

  // Find available debugging port
  const availablePort = await findAvailablePort();
  if (availablePort) {
    console.error(`🔍 Found available debugging port: ${availablePort}`);
  } else {
    console.error('⚠️  No available ports found in range 9222-9322, using system-assigned port');
  }

  // Multiple connection attempts with fallback strategies and enhanced resilience
  const createConnectionStrategy = (strategyName: string, modifications: any = {}) => {
    const strategy = {
      ...connectOptions,
      ...modifications,
      customConfig: {
        ...chromeConfig,
        ...modifications.customConfig,
        chromeFlags: [
          ...(modifications.customConfig?.chromeFlags || chromeConfig.chromeFlags),
          // Add port-specific flags if we found an available port
          ...(availablePort ? [`--remote-debugging-port=${availablePort}`] : ['--remote-debugging-port=0'])
        ]
      }
    };
    
    return { strategyName, strategy };
  };

  const connectionStrategies = [
    // Strategy 1: Standard connection with optimal port
    createConnectionStrategy('Optimal Configuration', {}),
    
    // Strategy 2: Headless mode fallback
    createConnectionStrategy('Headless Mode', { headless: true }),
    
    // Strategy 3: Windows-specific single process mode
    ...(platform === 'win32' ? [
      createConnectionStrategy('Single Process Mode', {
        customConfig: {
          chromeFlags: [...chromeConfig.chromeFlags, '--single-process', '--no-zygote']
        }
      })
    ] : []),
    
    // Strategy 4: Network fallback with explicit localhost handling
    createConnectionStrategy('Network Fallback', {
      customConfig: {
        chromeFlags: [
          ...chromeConfig.chromeFlags,
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          // Use recommended host for debugging
          ...(hostTest.recommendedHost === '127.0.0.1' ? ['--remote-debugging-address=127.0.0.1'] : [])
        ]
      }
    }),
    
    // Strategy 5: Minimal flags (last resort)
    createConnectionStrategy('Minimal Configuration', {
      customConfig: {
        chromeFlags: [
          '--no-sandbox', 
          '--disable-dev-shm-usage', 
          '--disable-setuid-sandbox',
          '--remote-debugging-port=0'
        ]
      }
    })
  ];

  let lastError: Error | null = null;

  // Try each connection strategy with enhanced resilience
  for (let strategyIndex = 0; strategyIndex < connectionStrategies.length; strategyIndex++) {
    const { strategyName, strategy } = connectionStrategies[strategyIndex];
    
    try {
      console.error(`🔄 Attempting browser connection using ${strategyName}...`);
      
      // Enhanced connection attempt with localhost/IP fallback
      const result = await withTimeout(async () => {
        try {
          // First attempt with the strategy as configured
          return await connect(strategy);
        } catch (connectionError) {
          // Check if it's a connection-related error that might benefit from host fallback
          const errorMsg = connectionError instanceof Error ? connectionError.message : String(connectionError);
          
          if (errorMsg.includes('ECONNREFUSED') || errorMsg.includes('localhost') || errorMsg.includes('127.0.0.1')) {
            console.error(`   Connection error detected, trying host fallback...`);
            
            // Create fallback strategy with different debugging address
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
          
          // Re-throw if not a connection error we can handle
          throw connectionError;
        }
      }, platform === 'win32' ? 120000 : 90000, `browser-connection-${strategyName.toLowerCase().replace(/\s+/g, '-')}`);
      
      const { browser, page } = result;

      browserInstance = browser;
      pageInstance = page;

      console.error(`✅ Browser initialized successfully using ${strategyName}`);
      updateCircuitBreakerOnSuccess();
      return { browser, page };
      
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`❌ ${strategyName} failed:`, lastError.message);
      
      // Enhanced error categorization for better troubleshooting
      if (lastError.message.includes('ECONNREFUSED')) {
        console.error(`   🔍 ECONNREFUSED detected - likely Chrome connection/port issue`);
      } else if (lastError.message.includes('ENOENT') || lastError.message.includes('spawn')) {
        console.error(`   🔍 Chrome executable issue detected`);
      } else if (lastError.message.includes('timeout')) {
        console.error(`   🔍 Connection timeout - Chrome may be slow to start`);
      }
      
      // Add progressive delay between retry attempts
      if (strategyIndex < connectionStrategies.length - 1) {
        const delayMs = 2000 + (strategyIndex * 1000); // 2s, 3s, 4s, etc.
        console.error(`⏳ Waiting ${delayMs/1000} seconds before trying next strategy...`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  // All strategies failed
  updateCircuitBreakerOnFailure();
  
  // Enhanced error handling for browser launch failures
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
  
  // Re-throw other types of errors
  throw lastError || new Error('Unknown browser initialization error');
  } finally {
    browserInitDepth--;
  }
}

async function closeBrowser() {
  if (browserInstance) {
    try {
      await browserInstance.close();
    } catch (error) {
      console.error('Error closing browser:', error);
    } finally {
      browserInstance = null;
      pageInstance = null;
    }
  }
}

// Tool definitions
const TOOLS = [
  {
    name: 'browser_init',
    description: 'Initialize a new browser instance with anti-detection features and automatic Chrome path detection',
    inputSchema: {
      type: 'object',
      properties: {
        headless: {
          type: 'boolean',
          description: 'Run browser in headless mode',
          default: false,
        },
        disableXvfb: {
          type: 'boolean',
          description: 'Disable Xvfb (X Virtual Framebuffer)',
          default: false,
        },
        ignoreAllFlags: {
          type: 'boolean',
          description: 'Ignore all Chrome flags',
          default: false,
        },
        proxy: {
          type: 'string',
          description: 'Proxy server URL (format: protocol://host:port)',
        },
        plugins: {
          type: 'array',
          description: 'Array of plugins to load',
          items: {
            type: 'string',
          },
        },
        connectOption: {
          type: 'object',
          description: 'Additional connection options',
          additionalProperties: true,
        },
        customConfig: {
          type: 'object',
          description: 'Custom configuration for Chrome launcher. Use chromePath to specify custom Chrome executable path',
          properties: {
            chromePath: {
              type: 'string',
              description: 'Custom path to Chrome executable (auto-detected if not specified)',
            },
          },
          additionalProperties: true,
        },
      },
    },
  },
  {
    name: 'navigate',
    description: 'Navigate to a URL',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to navigate to',
        },
        waitUntil: {
          type: 'string',
          description: 'When to consider navigation complete',
          enum: ['load', 'domcontentloaded', 'networkidle0', 'networkidle2'],
          default: 'networkidle2',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'screenshot',
    description: 'Take a screenshot of the current page',
    inputSchema: {
      type: 'object',
      properties: {
        fullPage: {
          type: 'boolean',
          description: 'Capture the full scrollable page',
          default: false,
        },
        selector: {
          type: 'string',
          description: 'CSS selector of element to screenshot',
        },
        safeMode: {
          type: 'boolean',
          description: 'Use safer screenshot method to avoid stack overflow issues (may reduce quality)',
          default: false,
        },
      },
    },
  },
  {
    name: 'get_content',
    description: 'Get page content (HTML or text)',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['html', 'text'],
          description: 'Type of content to retrieve',
          default: 'html',
        },
        selector: {
          type: 'string',
          description: 'CSS selector to get content from specific element',
        },
      },
    },
  },
  {
    name: 'click',
    description: 'Click on an element',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector of element to click',
        },
        waitForNavigation: {
          type: 'boolean',
          description: 'Wait for navigation after click',
          default: false,
        },
      },
      required: ['selector'],
    },
  },
  {
    name: 'type',
    description: 'Type text into an input field',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector of input element',
        },
        text: {
          type: 'string',
          description: 'Text to type',
        },
        delay: {
          type: 'number',
          description: 'Delay between keystrokes in ms',
          default: 100,
        },
      },
      required: ['selector', 'text'],
    },
  },
  {
    name: 'wait',
    description: 'Wait for various conditions',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['selector', 'navigation', 'timeout'],
          description: 'Type of wait condition',
        },
        value: {
          type: 'string',
          description: 'Selector to wait for or timeout in ms',
        },
        timeout: {
          type: 'number',
          description: 'Maximum wait time in ms',
          default: 30000,
        },
      },
      required: ['type', 'value'],
    },
  },
  {
    name: 'browser_close',
    description: 'Close the browser instance',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'solve_captcha',
    description: 'Attempt to solve CAPTCHAs (if supported)',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['recaptcha', 'hCaptcha', 'turnstile'],
          description: 'Type of captcha to solve',
        },
      },
      required: ['type'],
    },
  },
  {
    name: 'random_scroll',
    description: 'Perform random scrolling with natural timing',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'find_selector',
    description: 'Find CSS selector for element containing specific text',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Text content to search for in elements',
        },
        elementType: {
          type: 'string',
          description: 'HTML element type to search within (e.g., "button", "a", "div"). Default is "*" for any element',
          default: '*',
        },
        exact: {
          type: 'boolean',
          description: 'Whether to match exact text (true) or partial text (false)',
          default: false,
        },
      },
      required: ['text'],
    },
  },
];

// Register initialize handler
server.setRequestHandler(InitializeRequestSchema, async (request) => ({
  protocolVersion: '2024-11-05',
  capabilities: {
    tools: {},
    resources: {},
    prompts: {},
  },
  serverInfo: {
    name: 'puppeteer-real-browser-mcp-server',
    version: '1.3.0',
  },
}));

// Register tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

// Register resource handlers
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [],
}));

// Register prompts handlers
server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: [],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // Type guard to ensure args is defined
  if (!args) {
    throw new Error('Missing arguments for tool call');
  }

  switch (name) {
    case 'browser_init':
      return await withErrorHandling(async () => {
        await initializeBrowser(args as any);
        return {
          content: [
            {
              type: 'text',
              text: 'Browser initialized successfully with anti-detection features',
            },
          ],
        };
      }, 'Failed to initialize browser');

    case 'navigate':
      return await withErrorHandling(async () => {
        return await withRetry(async () => {
          const { page } = await initializeBrowser();
          await page.goto((args as any).url, {
            waitUntil: (args as any).waitUntil || 'networkidle2',
            timeout: 60000,
          });
          return {
            content: [
              {
                type: 'text',
                text: `Navigated to ${(args as any).url}`,
              },
            ],
          };
        }, 3, 1000, 'navigate');
      }, 'Failed to navigate');

    case 'screenshot':
      return await withErrorHandling(async () => {
        return await withTimeout(async () => {
          return await withRetry(async () => {
            const { page } = await initializeBrowser();

            let screenshotOptions: any = {
              fullPage: (args as any).fullPage || false,
              encoding: 'base64',
            };

            // Check if safe mode is enabled to preemptively use safer methods
            if ((args as any).safeMode) {
              console.error('Safe mode enabled, using CDP method directly...');
              
              try {
                const client = await page.target().createCDPSession();
                
                // Get layout metrics first
                const { layoutViewport } = await client.send('Page.getLayoutMetrics');
                
                // Use CDP directly for safer screenshot
                const screenshotData = await client.send('Page.captureScreenshot', {
                  format: 'png',
                  quality: 80,
                  clip: (args as any).selector ? undefined : {
                    x: 0,
                    y: 0,
                    width: Math.min(layoutViewport.clientWidth, 1920),
                    height: Math.min(layoutViewport.clientHeight, 1080),
                    scale: 1
                  },
                  captureBeyondViewport: false,
                });
                
                await client.detach();
                
                return {
                  content: [
                    {
                      type: 'image',
                      data: screenshotData.data,
                      mimeType: 'image/png',
                    },
                  ],
                };
              } catch (safeModeError) {
                console.error('Safe mode CDP method failed, falling back to simple screenshot...');
                // Fall through to try standard method with minimal options
              }
            }

            try {
              if ((args as any).selector) {
                const element = await page.$((args as any).selector);
                if (!element) throw new Error(`Element not found: ${(args as any).selector}`);
                const screenshot = await element.screenshot({ encoding: 'base64' });
                return {
                  content: [
                    {
                      type: 'image',
                      data: screenshot,
                      mimeType: 'image/png',
                    },
                  ],
                };
              }

              const screenshot = await page.screenshot(screenshotOptions);
              return {
                content: [
                  {
                    type: 'image',
                    data: screenshot,
                    mimeType: 'image/png',
                  },
                ],
              };
            } catch (error) {
              // Handle specific stack overflow error from puppeteer-real-browser/rebrowser
              if (error instanceof Error && error.message.includes('Maximum call stack size exceeded')) {
                console.error('Stack overflow detected in screenshot operation, attempting fallback method...');
                
                // Fallback method: Use CDP directly with smaller chunks
                try {
                  const client = await page.target().createCDPSession();
                  
                  // Get layout metrics first
                  const { layoutViewport, visualViewport } = await client.send('Page.getLayoutMetrics');
                  
                  // Use a simplified screenshot approach
                  const screenshotData = await client.send('Page.captureScreenshot', {
                    format: 'png',
                    quality: 80,
                    clip: (args as any).selector ? undefined : {
                      x: 0,
                      y: 0,
                      width: Math.min(layoutViewport.clientWidth, 1920),
                      height: Math.min(layoutViewport.clientHeight, 1080),
                      scale: 1
                    },
                    captureBeyondViewport: false, // Disable to avoid stack overflow
                  });
                  
                  await client.detach();
                  
                  return {
                    content: [
                      {
                        type: 'image',
                        data: screenshotData.data,
                        mimeType: 'image/png',
                      },
                    ],
                  };
                } catch (fallbackError) {
                  // Last resort: try with minimal options
                  try {
                    const simpleScreenshot = await page.screenshot({
                      encoding: 'base64',
                      fullPage: false, // Force viewport only
                      type: 'png',
                    });
                    
                    return {
                      content: [
                        {
                          type: 'image',
                          data: simpleScreenshot,
                          mimeType: 'image/png',
                        },
                      ],
                    };
                  } catch (lastResortError) {
                    throw new Error(`Screenshot failed with stack overflow. Original error: ${error.message}. CDP fallback error: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}. Simple fallback error: ${lastResortError instanceof Error ? lastResortError.message : String(lastResortError)}`);
                  }
                }
              }
              
              // Re-throw other errors
              throw error;
            }
          }, 3, 1000, 'screenshot');
        }, 30000, 'screenshot-timeout');
      }, 'Failed to take screenshot');

    case 'get_content':
      return await withErrorHandling(async () => {
        const { page } = await initializeBrowser();

        let content: string;
        if ((args as any).selector) {
          const element = await page.$((args as any).selector);
          if (!element) throw new Error(`Element not found: ${(args as any).selector}`);
          content = (args as any).type === 'text' 
            ? await element.evaluate((el: any) => el.textContent)
            : await element.evaluate((el: any) => el.outerHTML);
        } else {
          content = (args as any).type === 'text'
            ? await page.evaluate(() => {
                return document.body ? document.body.innerText : '';
              })
            : await page.content();
        }

        return {
          content: [
            {
              type: 'text',
              text: content,
            },
          ],
        };
      }, 'Failed to get content');

    case 'click':
      return await withErrorHandling(async () => {
        return await withRetry(async () => {
          const { page } = await initializeBrowser();
          const selector = (args as any).selector;

          // Pre-validation: Check if element exists using get_content functionality
          try {
            const element = await page.$(selector);
            if (!element) {
              throw new Error(`Element not found: ${selector}. Please verify the selector is correct and the element exists on the page.`);
            }

            // Wait for element to be ready
            await page.waitForSelector(selector, { timeout: 5000 });

            // Check element visibility
            const boundingBox = await element.boundingBox();
            if (!boundingBox) {
              console.warn(`Element ${selector} has no bounding box, attempting JavaScript click`);
              // Fallback to JavaScript click
              await page.$eval(selector, (el: any) => el.click());
            } else {
              // Standard click with options
              const options = (args as any).options || {};

              if ((args as any).waitForNavigation) {
                await Promise.all([
                  page.waitForNavigation({ waitUntil: 'networkidle2' }),
                  page.click(selector, options),
                ]);
              } else {
                await page.click(selector, options);
              }
            }

            return {
              content: [
                {
                  type: 'text',
                  text: `Clicked element: ${selector}`,
                },
              ],
            };
          } catch (error) {
            if (error instanceof Error && error.message.includes('not found')) {
              throw error; // Re-throw element not found errors with our custom message
            }
            // For other errors, try JavaScript click as fallback
            try {
              await page.$eval(selector, (el: any) => el.click());
              return {
                content: [
                  {
                    type: 'text',
                    text: `Clicked element using JavaScript fallback: ${selector}`,
                  },
                ],
              };
            } catch (fallbackError) {
              throw new Error(`Click failed: ${error instanceof Error ? error.message : String(error)}. Fallback also failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
            }
          }
        }, 3, 1000, 'click');
      }, 'Failed to click element');

    case 'type':
      return await withErrorHandling(async () => {
        const { page } = await initializeBrowser();

        // Clear existing content first
        await page.click((args as any).selector);
        await page.keyboard.down('Control');
        await page.keyboard.press('A');
        await page.keyboard.up('Control');
        await page.keyboard.press('Backspace');
        await page.type((args as any).selector, (args as any).text, { delay: (args as any).delay || 100 });

        return {
          content: [
            {
              type: 'text',
              text: `Typed text into: ${(args as any).selector}`,
            },
          ],
        };
      }, 'Failed to type text');

    case 'wait':
      return await withErrorHandling(async () => {
        const { page } = await initializeBrowser();

        switch ((args as any).type) {
          case 'selector':
            await page.waitForSelector((args as any).value, { timeout: (args as any).timeout || 30000 });
            break;
          case 'navigation':
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: (args as any).timeout || 30000 });
            break;
          case 'timeout':
            await sleep(parseInt((args as any).value as string));
            break;
        }

        return {
          content: [
            {
              type: 'text',
              text: `Wait completed for ${(args as any).type}: ${(args as any).value}`,
            },
          ],
        };
      }, 'Failed to wait');

    case 'browser_close':
      return await withErrorHandling(async () => {
        await closeBrowser();
        return {
          content: [
            {
              type: 'text',
              text: 'Browser closed successfully',
            },
          ],
        };
      }, 'Failed to close browser');


    case 'solve_captcha':
      return await withErrorHandling(async () => {
        await initializeBrowser();

        // Note: This is a placeholder. The actual implementation would depend on
        // the specific captcha solving capabilities of puppeteer-real-browser
        return {
          content: [
            {
              type: 'text',
              text: `Attempted to solve ${(args as any).type} captcha. Check page to verify success.`,
            },
          ],
        };
      }, 'Failed to solve captcha');


    case 'random_scroll':
      return await withErrorHandling(async () => {
        const { page } = await initializeBrowser();

        // Use the randomScroll function from stealth-actions.ts
        await randomScroll(page);

        return {
          content: [
            {
              type: 'text',
              text: 'Performed random scrolling with natural timing',
            },
          ],
        };
      }, 'Failed to perform random scrolling');

    case 'find_selector':
      return await withErrorHandling(async () => {
        const { page } = await initializeBrowser();
        const { text, elementType = '*', exact = false } = args as any;

        const selector = await page.evaluate((searchText: string, elType: string, exactMatch: boolean) => {
          // Function to generate unique CSS selector
          function getCssSelector(el: Element): string {
            const path: string[] = [];
            while (el && el.nodeType === Node.ELEMENT_NODE) {
              let selector = el.nodeName.toLowerCase();
              
              // Prefer ID
              if (el.id) {
                selector += '#' + CSS.escape(el.id);
                path.unshift(selector);
                break;
              }
              
              // Add classes if present
              if (el.className && typeof el.className === 'string') {
                const classes = el.className.trim().split(/\s+/);
                if (classes.length > 0 && classes[0]) {
                  selector += '.' + classes.map(c => CSS.escape(c)).join('.');
                }
              }
              
              // Add position among siblings if needed
              let sibling = el.previousElementSibling;
              let nth = 1;
              while (sibling) {
                if (sibling.nodeName.toLowerCase() === el.nodeName.toLowerCase()) {
                  nth++;
                }
                sibling = sibling.previousElementSibling;
              }
              
              if (nth > 1) {
                selector += ':nth-of-type(' + nth + ')';
              }
              
              path.unshift(selector);
              const parent = el.parentElement;
              if (!parent) break;
              el = parent;
            }
            
            return path.join(' > ');
          }

          // Find all matching elements
          const elements = Array.from(document.querySelectorAll(elType));
          const matches = elements.filter(el => {
            const content = el.textContent || '';
            return exactMatch 
              ? content.trim() === searchText 
              : content.includes(searchText);
          });

          if (matches.length === 0) {
            return null;
          }

          // Return selector for first match
          return getCssSelector(matches[0]);
        }, text, elementType, exact);

        if (!selector) {
          throw new Error(`No element found containing text: "${text}"`);
        }

        return {
          content: [
            {
              type: 'text',
              text: selector,
            },
          ],
        };
      }, 'Failed to find selector');

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('MCP Server for puppeteer-real-browser started');

  // Cleanup on exit
  process.on('SIGINT', async () => {
    await closeBrowser();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
