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
import { randomScroll } from './stealth-actions.js';
import { setTimeout as sleep } from 'node:timers/promises';
import * as fs from 'fs';
import * as path from 'path';
import * as net from 'net';
import { validateWorkflow, recordExecution, workflowValidator } from './workflow-validation.js';
import { contentStrategy } from './content-strategy.js';
import { tokenManager } from './token-management.js';
import { selfHealingLocators } from './self-healing-locators.js';

// Store browser instance
let browserInstance: any = null;
let pageInstance: any = null;

// Content prioritization configuration
interface ContentPriorityConfig {
  prioritizeContent: boolean;
  fallbackToScreenshots: boolean;
  autoSuggestGetContent: boolean;
}

// Check environment variable for testing override
const disableContentPriority = process.env.DISABLE_CONTENT_PRIORITY === 'true' || process.env.NODE_ENV === 'test';

let contentPriorityConfig: ContentPriorityConfig = {
  prioritizeContent: !disableContentPriority,  // Default to prioritizing get_content (unless testing)
  fallbackToScreenshots: disableContentPriority,  // Allow screenshots in test mode
  autoSuggestGetContent: !disableContentPriority  // Provide guidance toward get_content (unless testing)
};

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
        // '--no-sandbox' removed for security - using ignoreDefaultFlags instead
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
        // '--no-sandbox' removed for security - using ignoreDefaultFlags instead
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
    // Strategy 0: Maximized window configuration
    {
      strategyName: 'Maximized Window Configuration',
      strategy: {
        executablePath: detectedChromePath,
        headless: options?.headless ?? false,
        turnstile: true,
        args: [
          "--start-maximized",
          "--disable-blink-features=AutomationControlled",
        ],
        disableXvfb: true,
        connectOption: {
          defaultViewport: null,
        },
      }
    },
    
    // Strategy 1: Minimal Configuration (simplest approach)
    createConnectionStrategy('Minimal Configuration', {
      customConfig: {
        chromeFlags: [
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-default-apps'
        ]
      }
    }),
    
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
          // '--no-sandbox' removed for security - using ignoreDefaultFlags instead
          '--disable-dev-shm-usage', 
          // '--disable-setuid-sandbox' removed for security
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
          // Debug logging
          console.error(`   Strategy config: ${JSON.stringify({
            headless: strategy.headless,
            chromeFlags: strategy.customConfig?.chromeFlags?.slice(0, 5) || 'none',
            chromePath: strategy.customConfig?.chromePath || 'default'
          })}`);
          
          // First attempt with the strategy as configured
          const connectResult = await connect(strategy);
          console.error(`   ✅ Connection successful with ${strategyName}`);
          return connectResult;
        } catch (connectionError) {
          // Log the specific error for debugging
          console.error(`   ❌ Connection failed: ${connectionError instanceof Error ? connectionError.message : String(connectionError)}`);
          
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
      // First, close all pages to prevent lingering processes
      const pages = await browserInstance.pages();
      for (const page of pages) {
        try {
          await page.close();
        } catch (error) {
          console.error('Error closing page:', error);
        }
      }
      
      // Then close the browser
      await browserInstance.close();
      
      // Force kill the browser process if it still exists
      if (browserInstance.process() != null) {
        try {
          browserInstance.process().kill('SIGTERM');
          // Wait a moment for graceful shutdown
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // If still running, force kill
          if (browserInstance.process() != null && !browserInstance.process().killed) {
            browserInstance.process().kill('SIGKILL');
          }
        } catch (error) {
          console.error('Error force-killing browser process:', error);
        }
      }
    } catch (error) {
      console.error('Error closing browser:', error);
      
      // Force kill as last resort
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

// Force kill all Chrome processes system-wide (last resort cleanup)
async function forceKillAllChromeProcesses() {
  try {
    const { spawn } = require('child_process');
    
    // Kill Chrome processes on macOS/Linux
    if (process.platform !== 'win32') {
      spawn('pkill', ['-f', 'Google Chrome'], { stdio: 'ignore' });
      spawn('pkill', ['-f', 'chrome'], { stdio: 'ignore' });
    } else {
      // Kill Chrome processes on Windows
      spawn('taskkill', ['/F', '/IM', 'chrome.exe'], { stdio: 'ignore' });
      spawn('taskkill', ['/F', '/IM', 'GoogleChrome.exe'], { stdio: 'ignore' });
    }
  } catch (error) {
    console.error('Error force-killing Chrome processes:', error);
  }
}

// Helper function to quickly find authentication elements
async function findAuthElements(pageInstance: any): Promise<string[]> {
  return await pageInstance.evaluate(() => {
    const authSelectors: string[] = [];
    
    // Common auth-related text patterns
    const authPatterns = [
      /^(log\s*in|sign\s*in|log\s*on|sign\s*on)$/i,
      /^(login|signin|authenticate|enter)$/i,
      /continue with (google|github|facebook|twitter|microsoft)/i,
      /sign in with/i
    ];
    
    // Find all clickable elements
    const clickableElements = document.querySelectorAll('a, button, [role="button"], input[type="submit"], input[type="button"]');
    
    clickableElements.forEach(el => {
      const text = (el.textContent || '').trim();
      const ariaLabel = el.getAttribute('aria-label') || '';
      const href = (el as HTMLAnchorElement).href || '';
      
      // Check if element matches auth patterns
      const matchesPattern = authPatterns.some(pattern => 
        pattern.test(text) || pattern.test(ariaLabel)
      );
      
      // Check href for auth routes
      const hasAuthRoute = href.includes('login') || href.includes('signin') || 
                          href.includes('auth') || href.includes('oauth');
      
      if (matchesPattern || hasAuthRoute) {
        // Generate a reliable selector
        if (el.id) {
          authSelectors.push(`#${CSS.escape(el.id)}`);
        } else if (el.className && typeof el.className === 'string') {
          const classes = el.className.trim().split(/\s+/).filter(c => c);
          if (classes.length > 0) {
            authSelectors.push(el.tagName.toLowerCase() + '.' + classes.map(c => CSS.escape(c)).join('.'));
          }
        } else {
          // Fallback to text-based selector
          authSelectors.push(`${el.tagName.toLowerCase()}:contains("${text}")`);
        }
      }
    });
    
    return [...new Set(authSelectors)]; // Remove duplicates
  });
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
          description: 'Ignore all Chrome flags (recommended: true for clean startup without --no-sandbox)',
          default: true,
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
        contentPriority: {
          type: 'object',
          description: 'Configuration for prioritizing get_content over screenshots',
          properties: {
            prioritizeContent: {
              type: 'boolean',
              description: 'Prioritize get_content method over screenshots for better reliability',
              default: true,
            },
            fallbackToScreenshots: {
              type: 'boolean',
              description: 'Allow fallback to screenshots when get_content is insufficient',
              default: false,
            },
            autoSuggestGetContent: {
              type: 'boolean',
              description: 'Automatically suggest get_content alternatives when screenshots fail',
              default: true,
            },
          },
          additionalProperties: false,
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
    description: 'Take a screenshot of the current page (Note: May fail on some configurations due to stack overflow issues. Consider using get_content for content analysis instead)',
    deprecated: 'Consider using get_content for more reliable page analysis',
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
    description: '**Recommended** method to get page content (HTML or text) - More reliable than screenshots for content analysis and navigation tasks',
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
        contentMode: {
          type: 'string',
          enum: ['full', 'main', 'summary'],
          description: 'Content extraction mode: "full" (entire page), "main" (main content areas only), "summary" (headings and key sections)',
          default: 'main',
        },
        resourceBlocking: {
          type: 'string',
          enum: ['disabled', 'minimal', 'standard', 'aggressive'],
          description: 'Block non-essential resources for faster extraction: "disabled" (no blocking), "minimal" (images/fonts), "standard" (ads/analytics), "aggressive" (most non-content)',
          default: 'standard',
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
    description: 'Wait for various conditions with smart detection mechanisms',
    inputSchema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['selector', 'navigation', 'timeout', 'function', 'response', 'request', 'element_stable', 'content_loaded', 'network_idle'],
          description: 'Type of wait condition: selector (element appears), navigation (page loads), timeout (fixed time), function (custom JS), response (API response), request (network request), element_stable (element stops moving), content_loaded (dynamic content), network_idle (no network activity)',
        },
        value: {
          type: 'string',
          description: 'Selector, timeout in ms, JavaScript function, URL pattern, or condition to wait for',
        },
        timeout: {
          type: 'number',
          description: 'Maximum wait time in ms',
          default: 30000,
        },
        options: {
          type: 'object',
          description: 'Additional wait options (visible, hidden, polling interval, etc.)',
          additionalProperties: true,
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
    description: 'Find CSS selector for element containing specific text with enhanced semantic awareness',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Text content to search for in elements',
        },
        elementType: {
          type: 'string',
          description: 'Semantic element type: "button", "link", "input", "navigation", "heading", "list", "article", "form", or specific HTML tag. Uses semantic role mappings for better detection.',
          default: '*',
        },
        exact: {
          type: 'boolean',
          description: 'Whether to match exact text (true) or partial text (false)',
          default: false,
        },
        includeHidden: {
          type: 'boolean',
          description: 'Whether to include hidden/invisible elements in search',
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
    version: '1.4.0',
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
      return await withWorkflowValidation('browser_init', args, async () => {
        return await withErrorHandling(async () => {
          // Update content priority configuration if provided
          if ((args as any).contentPriority) {
            contentPriorityConfig = {
              ...contentPriorityConfig,
              ...(args as any).contentPriority
            };
          }
          
          await initializeBrowser(args as any);
          
          const configMessage = contentPriorityConfig.prioritizeContent 
            ? '\n\n💡 Content Priority Mode: get_content is prioritized for better reliability. Use get_content for page analysis instead of screenshots.'
            : '';

          const workflowMessage = '\n\n🔄 Workflow Status: Browser initialized\n' +
            '  • Next step: Use navigate to load a web page\n' +
            '  • Then: Use get_content to analyze page content\n' +
            '  • Finally: Use find_selector and interaction tools\n\n' +
            '✅ Workflow validation is now active - prevents blind selector guessing';
          
          return {
            content: [
              {
                type: 'text',
                text: `Browser initialized successfully with anti-detection features${configMessage}${workflowMessage}`,
              },
            ],
          };
        }, 'Failed to initialize browser');
      });

    case 'navigate':
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

    case 'screenshot':
      return await withErrorHandling(async () => {
        // Check content priority configuration
        if (contentPriorityConfig.prioritizeContent && !contentPriorityConfig.fallbackToScreenshots) {
          const suggestion = contentPriorityConfig.autoSuggestGetContent 
            ? '\n\n💡 Recommendation: Use get_content instead of screenshots for:\n' +
              '  • get_content with type="text" for readable page content\n' +
              '  • get_content with type="html" for DOM structure analysis\n' +
              '  • More reliable and faster than screenshots for content analysis\n' +
              '  • Enables all navigation and automation tasks without visual capture'
            : '';
          
          throw new Error(`Screenshot disabled in content priority mode. ${suggestion}`);
        }
        
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
                    const suggestion = contentPriorityConfig.autoSuggestGetContent 
                      ? '\n\n💡 Alternative Solution: Use get_content instead of screenshots:\n' +
                        '  • get_content with type="text" for readable content\n' +
                        '  • get_content with type="html" for structure analysis\n' +
                        '  • More reliable for automation and navigation tasks\n' +
                        '  • No stack overflow issues'
                      : '';
                    
                    throw new Error(`Screenshot failed with stack overflow. Original error: ${error.message}. CDP fallback error: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}. Simple fallback error: ${lastResortError instanceof Error ? lastResortError.message : String(lastResortError)}.${suggestion}`);
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
      return await withWorkflowValidation('get_content', args, async () => {
        const { page } = await initializeBrowser();

        // Progressive content modes to try (start with main for better efficiency)
        const contentModes = ['main', 'summary', 'full'];
        let lastError: Error | null = null;
        
        // If user specified a content mode, respect it
        const userSpecifiedMode = (args as any).contentMode;
        const modesToTry = userSpecifiedMode ? [userSpecifiedMode] : contentModes;
        
        // Try each content mode progressively
        for (const mode of modesToTry) {
          try {
            console.error(`Attempting get_content with contentMode: ${mode}`);
            
            // Use content strategy engine for intelligent content processing
            const contentRequest = {
              type: (args as any).type as 'html' | 'text' | undefined,
              selector: (args as any).selector,
              contentMode: mode,
              resourceBlocking: (args as any).resourceBlocking || 'standard',
              estimateOnly: false,
              chunkingPreference: 'allow' as const
            };

            const response = await contentStrategy.processContentRequest(page, contentRequest);

            // Apply strict validation as final safeguard
            const strictValidation = tokenManager.strictValidateForMCP(response.content, (args as any).type || 'html');
            
            if (!strictValidation.isValid) {
              console.warn(`Content validation failed: ${strictValidation.message}`);
              
              if (strictValidation.action === 'truncate' && typeof response.content === 'string') {
                // Emergency truncation
                const truncatedContent = tokenManager.emergencyTruncate(response.content, (args as any).type || 'html');
                response.content = truncatedContent;
                console.log(`Applied emergency truncation, new token count: ${tokenManager.countTokens(truncatedContent, (args as any).type || 'html')}`);
              } else if (strictValidation.action === 'reject') {
                throw new Error(`Content too large even after processing (${strictValidation.tokenCount} tokens). Try using a more specific selector or contentMode='summary'.`);
              }
            }

          // Format response based on whether content was chunked
          let responseText: string;
          if (Array.isArray(response.content)) {
            // Content was chunked
            const chunks = response.content;
            responseText = `Content processed into ${chunks.length} chunks due to MCP token limits:\n\n`;
            
            chunks.forEach((chunk, index) => {
              responseText += `--- Chunk ${index + 1}/${chunks.length} (${chunk.tokenCount} tokens) ---\n`;
              responseText += chunk.content;
              if (index < chunks.length - 1) {
                responseText += '\n\n';
              }
            });

            responseText += `\n\n📊 Token Management Summary:\n`;
            responseText += `  • Original tokens: ${response.metadata.originalTokens}\n`;
            responseText += `  • Processed tokens: ${response.metadata.processedTokens}\n`;
            responseText += `  • Strategy: ${response.strategy}\n`;
            responseText += `  • Chunks: ${response.metadata.chunksCount}\n`;
            
            if (response.metadata.compressionRatio) {
              responseText += `  • Compression ratio: ${(response.metadata.compressionRatio * 100).toFixed(1)}%\n`;
            }
          } else {
            // Content was not chunked
            responseText = response.content;
            
            if (response.metadata.originalTokens > 20000) {
              responseText += `\n\n📊 Token Info: ${response.metadata.processedTokens} tokens (within MCP limits)`;
            }
          }

          // Add workflow guidance
          if (response.workflowGuidance) {
            responseText += response.workflowGuidance;
          }

            // Add mode info to the response
            if (mode !== 'full' && !userSpecifiedMode) {
              responseText += `\n\n📊 Content Mode: Automatically used '${mode}' mode for optimal token usage`;
            }

            // Add content priority suggestions
            const successMessage = contentPriorityConfig.autoSuggestGetContent && (args as any).type !== 'html' 
              ? `\n\n✅ Content retrieved successfully! This method is more reliable than screenshots for:\n` +
                `  • Navigation and automation tasks\n` +
                `  • Content analysis and text extraction\n` +
                `  • Finding elements and form fields\n` +
                `  • No browser compatibility issues`
              : '';

            return {
              content: [
                {
                  type: 'text',
                  text: responseText + successMessage,
                },
              ],
            };
          } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            const errorMessage = lastError.message;
            
            // Check if this is a token limit error
            if (errorMessage.includes('exceeds maximum allowed tokens') || 
                (errorMessage.includes('MCP tool') && errorMessage.includes('response'))) {
              
              console.error(`Content mode '${mode}' exceeded token limits`);
              
              // If this wasn't the last mode to try, continue to next mode
              if (mode !== modesToTry[modesToTry.length - 1]) {
                console.error(`Retrying with next content mode...`);
                continue;
              }
            } else {
              // For non-token errors, fail immediately
              throw error;
            }
          }
        }
        
        // If we get here, all modes failed
        const finalError = lastError || new Error('Failed to retrieve content');
        
        // Provide helpful guidance about the failure
        let errorMessage = finalError.message;
        if (errorMessage.includes('exceeds maximum allowed tokens')) {
          errorMessage += '\n\n❌ All content modes exceeded token limits. The page is extremely large.\n' +
            '💡 Try these approaches:\n' +
            '  1. Use a specific selector to target a small section\n' +
            '  2. Use type="text" instead of type="html"\n' +
            '  3. Break down the analysis into multiple targeted get_content calls\n' +
            '  4. Consider if you really need the full page content';
        }
        
        throw new Error(errorMessage);
      });

    case 'click':
      return await withWorkflowValidation('click', args, async () => {
        return await withErrorHandling(async () => {
          return await withRetry(async () => {
            const { page } = await initializeBrowser();
            const selector = (args as any).selector;
            const waitForNavigation = (args as any).waitForNavigation;
            const options = (args as any).options || {};

            // Try to find element using self-healing locators
            const elementResult = await selfHealingLocators.findElementWithFallbacks(
              page, 
              selector
            );

            if (!elementResult) {
              // Generate helpful error with fallback suggestions
              const fallbackSummary = await selfHealingLocators.getFallbackSummary(page, selector);
              
              throw new Error(
                `Element not found: ${selector}\n\n` +
                '🔧 Self-healing locators tried multiple fallback strategies but could not find the element.\n\n' +
                '💡 Troubleshooting suggestions:\n' +
                '  • Use find_selector to locate elements by text content\n' +
                '  • Verify the selector with get_content first\n' +
                '  • Ensure the page content has been analyzed\n' +
                '  • Check if the element is dynamically loaded\n' +
                '  • Wait for the element to appear using wait tool\n\n' +
                '🔧 Workflow validation ensures:\n' +
                '  • Content was analyzed before interaction\n' +
                '  • Selector is based on current page state\n\n' +
                fallbackSummary
              );
            }

            const { element, usedSelector, strategy } = elementResult;
            let strategyMessage = '';
            
            if (strategy !== 'primary') {
              strategyMessage = `\n🔄 Self-healing: Used ${strategy} fallback selector: ${usedSelector}`;
              console.warn(`Self-healing click: Primary selector '${selector}' failed, used '${usedSelector}' (${strategy})`);
            }

            try {
              // Wait for element to be ready
              await page.waitForSelector(usedSelector, { timeout: 5000 });

              // Check element visibility and interaction options
              const boundingBox = await element.boundingBox();
              
              if (!boundingBox) {
                console.warn(`Element ${usedSelector} has no bounding box, attempting JavaScript click`);
                // Fallback to JavaScript click
                await page.$eval(usedSelector, (el: any) => el.click());
              } else {
                // Standard click with options
                if (waitForNavigation) {
                  await Promise.all([
                    page.waitForNavigation({ waitUntil: 'networkidle2' }),
                    page.click(usedSelector, options),
                  ]);
                } else {
                  await page.click(usedSelector, options);
                }
              }

              return {
                content: [
                  {
                    type: 'text',
                    text: `Clicked element: ${usedSelector}${strategyMessage}\n\n✅ Interaction completed successfully through validated workflow`,
                  },
                ],
              };

            } catch (clickError) {
              // Final fallback: JavaScript click
              try {
                await page.$eval(usedSelector, (el: any) => el.click());
                return {
                  content: [
                    {
                      type: 'text',
                      text: `Clicked element using JavaScript fallback: ${usedSelector}${strategyMessage}\n\n✅ Interaction completed successfully through validated workflow`,
                    },
                  ],
                };
              } catch (jsClickError) {
                throw new Error(
                  `Click failed on element found by self-healing locators: ${usedSelector}. ` +
                  `Original error: ${clickError instanceof Error ? clickError.message : String(clickError)}. ` +
                  `JavaScript fallback error: ${jsClickError instanceof Error ? jsClickError.message : String(jsClickError)}`
                );
              }
            }
          }, 3, 1000, 'click');
        }, 'Failed to click element');
      });

    case 'type':
      return await withWorkflowValidation('type', args, async () => {
        return await withErrorHandling(async () => {
          const { page } = await initializeBrowser();
          const selector = (args as any).selector;
          const text = (args as any).text;
          const delay = (args as any).delay || 100;

          // Try to find element using self-healing locators
          const elementResult = await selfHealingLocators.findElementWithFallbacks(
            page, 
            selector
          );

          if (!elementResult) {
            // Generate helpful error with fallback suggestions
            const fallbackSummary = await selfHealingLocators.getFallbackSummary(page, selector);
            
            throw new Error(
              `Input element not found: ${selector}\n\n` +
              '🔧 Self-healing locators tried multiple fallback strategies but could not find the input element.\n\n' +
              '💡 Troubleshooting suggestions:\n' +
              '  • Use find_selector to locate input elements by text content or labels\n' +
              '  • Verify the selector with get_content first\n' +
              '  • Check for input elements inside forms or containers\n' +
              '  • Ensure the input field is visible and enabled\n\n' +
              fallbackSummary
            );
          }

          const { element, usedSelector, strategy } = elementResult;
          let strategyMessage = '';
          
          if (strategy !== 'primary') {
            strategyMessage = `\n🔄 Self-healing: Used ${strategy} fallback selector: ${usedSelector}`;
            console.warn(`Self-healing type: Primary selector '${selector}' failed, used '${usedSelector}' (${strategy})`);
          }

          try {
            // Wait for element to be ready and interactable
            await page.waitForSelector(usedSelector, { timeout: 5000 });

            // Focus on the element first
            await element.focus();

            // Clear existing content (cross-platform approach)
            await page.evaluate((sel: string) => {
              const el = document.querySelector(sel) as HTMLInputElement | HTMLTextAreaElement;
              if (el) {
                el.select();
                el.value = '';
              }
            }, usedSelector);

            // Type the new text
            await page.type(usedSelector, text, { delay });

            return {
              content: [
                {
                  type: 'text',
                  text: `Typed text into: ${usedSelector}${strategyMessage}\n\n✅ Text input completed successfully through validated workflow`,
                },
              ],
            };

          } catch (typeError) {
            // Fallback: Direct value assignment
            try {
              await page.evaluate((sel: string, inputText: string) => {
                const el = document.querySelector(sel) as HTMLInputElement | HTMLTextAreaElement;
                if (el) {
                  el.value = inputText;
                  el.dispatchEvent(new Event('input', { bubbles: true }));
                  el.dispatchEvent(new Event('change', { bubbles: true }));
                }
              }, usedSelector, text);

              return {
                content: [
                  {
                    type: 'text',
                    text: `Typed text using value assignment fallback: ${usedSelector}${strategyMessage}\n\n✅ Text input completed successfully through validated workflow`,
                  },
                ],
              };
            } catch (fallbackError) {
              throw new Error(
                `Type failed on element found by self-healing locators: ${usedSelector}. ` +
                `Original error: ${typeError instanceof Error ? typeError.message : String(typeError)}. ` +
                `Value assignment fallback error: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`
              );
            }
          }
        }, 'Failed to type text');
      });

    case 'wait':
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

    case 'browser_close':
      return await withWorkflowValidation('browser_close', args, async () => {
        return await withErrorHandling(async () => {
          await closeBrowser();
          
          // Reset workflow state when browser is closed
          workflowValidator.reset();
          
          return {
            content: [
              {
                type: 'text',
                text: 'Browser closed successfully\n\n🔄 Workflow state reset - ready for new browser initialization',
              },
            ],
          };
        }, 'Failed to close browser');
      });


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
      return await withWorkflowValidation('find_selector', args, async () => {
        return await withErrorHandling(async () => {
          const { page } = await initializeBrowser();
          const { text, elementType = '*', exact = false, includeHidden = false } = args as any;

          // Additional validation: Ensure content has been analyzed successfully
          const workflowContext = workflowValidator.getContext();
          if (!workflowContext.contentAnalyzed || workflowValidator.isContentAnalysisStale()) {
            throw new Error(
              'Content analysis is required before searching for selectors.\n\n' +
              '💡 Please use get_content first. It will automatically try different modes if the page is large:\n' +
              '   • First attempt: contentMode="main" (extracts main content)\n' +
              '   • If too large: contentMode="summary" (page overview)\n' +
              '   • Last resort: contentMode="full" (entire page)\n\n' +
              `🔍 Current workflow state: ${workflowContext.currentState}\n` +
              `   Content analyzed: ${workflowContext.contentAnalyzed}\n` +
              `   Page URL: ${workflowContext.pageUrl || 'Unknown'}`
            );
          }

          const selector = await page.evaluate((searchText: string, elType: string, exactMatch: boolean, includeHidden: boolean) => {
            // Enhanced element scoring and detection with semantic awareness
            interface ElementScore {
              element: Element;
              score: number;
              matchType: 'exact' | 'partial' | 'semantic' | 'role';
              confidence: number;
            }

            // Semantic role mappings for better element detection
            const SEMANTIC_ROLES = {
              button: ['button', '[role="button"]', 'input[type="button"]', 'input[type="submit"]', '.btn', '.button'],
              link: ['a', '[role="link"]', '.link'],
              input: ['input', 'textarea', '[role="textbox"]', '[contenteditable="true"]'],
              navigation: ['nav', '[role="navigation"]', '.nav', '.navigation'],
              heading: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', '[role="heading"]'],
              list: ['ul', 'ol', '[role="list"]', '.list'],
              article: ['article', '[role="article"]', '.article', '.post'],
              form: ['form', '[role="form"]', '.form'],
              // Special category for authentication elements
              auth: [
                'a[href*="login"]', 'a[href*="signin"]', 'a[href*="sign-in"]', 'a[href*="auth"]',
                'button:contains("Login")', 'button:contains("Sign in")', 'button:contains("Log in")',
                'button:contains("Sign In")', 'button:contains("Log In")',
                '[class*="login"]', '[class*="signin"]', '[class*="auth"]',
                '[id*="login"]', '[id*="signin"]', '[id*="auth"]'
              ]
            };

            // Get semantic role selectors for the element type
            function getSemanticSelectors(elType: string): string[] {
              const normalizedType = elType.toLowerCase();
              return SEMANTIC_ROLES[normalizedType as keyof typeof SEMANTIC_ROLES] || [elType];
            }

            // Enhanced CSS selector generation with semantic awareness and validation
            function getCssSelector(el: Element): string {
              // Try to generate a simple, specific selector first
              const simpleSelector = generateSimpleSelector(el);
              if (simpleSelector && isValidSelector(simpleSelector, el)) {
                return simpleSelector;
              }
              
              // Fall back to building a path-based selector
              return generatePathSelector(el);
            }
            
            // Generate a simple, specific selector for the element
            function generateSimpleSelector(el: Element): string | null {
              // Try ID first (highest priority)
              if (el.id) {
                return `#${CSS.escape(el.id)}`;
              }
              
              // Try data attributes
              const dataTestId = el.getAttribute('data-testid') || el.getAttribute('data-test');
              if (dataTestId) {
                return `[data-testid="${dataTestId}"]`;
              }
              
              // Try aria-label for interactive elements
              const ariaLabel = el.getAttribute('aria-label');
              if (ariaLabel && ariaLabel.length < 50 && ['button', 'a', 'input'].includes(el.tagName.toLowerCase())) {
                return `[aria-label="${ariaLabel}"]`;
              }
              
              // Try meaningful class combinations
              if (el.className && typeof el.className === 'string') {
                const classes = el.className.trim().split(/\s+/)
                  .filter(cls => cls && !isUtilityClass(cls) && isMeaningfulClass(cls))
                  .slice(0, 2); // Limit to first 2 meaningful classes
                
                if (classes.length > 0) {
                  const tagName = el.tagName.toLowerCase();
                  const classSelector = '.' + classes.map(c => CSS.escape(c)).join('.');
                  
                  // For generic tags, include tag name for specificity
                  if (['div', 'span', 'p'].includes(tagName)) {
                    return `${tagName}${classSelector}`;
                  } else {
                    return classSelector;
                  }
                }
              }
              
              // For form elements, try name or type attributes
              if (['input', 'select', 'textarea'].includes(el.tagName.toLowerCase())) {
                const name = el.getAttribute('name');
                const type = el.getAttribute('type');
                if (name) {
                  return `${el.tagName.toLowerCase()}[name="${name}"]`;
                } else if (type) {
                  return `${el.tagName.toLowerCase()}[type="${type}"]`;
                }
              }
              
              return null;
            }
            
            // Generate a path-based selector as fallback
            function generatePathSelector(el: Element): string {
              const path: string[] = [];
              let current = el;
              
              while (current && current.nodeType === Node.ELEMENT_NODE) {
                // Skip html and body elements to avoid overly generic selectors
                if (['html', 'body'].includes(current.nodeName.toLowerCase())) {
                  break;
                }
                
                let selector = current.nodeName.toLowerCase();
                let hasSpecificAttribute = false;
                
                // Add ID if present
                if (current.id) {
                  selector += '#' + CSS.escape(current.id);
                  path.unshift(selector);
                  break; // ID is unique, we can stop here
                }
                
                // Add semantic role if present
                const role = current.getAttribute('role');
                if (role) {
                  selector += `[role="${role}"]`;
                  hasSpecificAttribute = true;
                }
                
                // Add meaningful classes (skip utility classes)
                if (current.className && typeof current.className === 'string') {
                  const classes = current.className.trim().split(/\s+/)
                    .filter(cls => cls && !isUtilityClass(cls) && isMeaningfulClass(cls))
                    .slice(0, 2); // Limit to first 2 meaningful classes
                  
                  if (classes.length > 0) {
                    selector += '.' + classes.map(c => CSS.escape(c)).join('.');
                    hasSpecificAttribute = true;
                  }
                }
                
                // Add data attributes for better targeting
                const dataTestId = current.getAttribute('data-testid') || current.getAttribute('data-test');
                if (dataTestId) {
                  selector += `[data-testid="${dataTestId}"]`;
                  hasSpecificAttribute = true;
                }
                
                // Only add nth-of-type if we don't have specific attributes
                if (!hasSpecificAttribute) {
                  const siblings = Array.from(current.parentElement?.children || [])
                    .filter(sibling => sibling.nodeName.toLowerCase() === current.nodeName.toLowerCase());
                  
                  if (siblings.length > 1) {
                    const index = siblings.indexOf(current) + 1;
                    selector += `:nth-of-type(${index})`;
                  }
                }
                
                path.unshift(selector);
                const parent = current.parentElement;
                if (!parent) break;
                current = parent;
                
                // Stop if we have a sufficiently specific selector or reached reasonable depth
                if (path.length >= 3 || hasSpecificAttribute) break;
              }
              
              // If path is empty or too generic, create a fallback
              if (path.length === 0 || path.join(' > ').includes('html') || path.join(' > ').includes('body')) {
                return generateFallbackSelector(el);
              }
              
              return path.join(' > ');
            }
            
            // Generate a fallback selector for problematic cases
            function generateFallbackSelector(el: Element): string {
              const tagName = el.tagName.toLowerCase();
              
              // For interactive elements, try text content matching
              if (['a', 'button'].includes(tagName)) {
                const text = el.textContent?.trim();
                if (text && text.length < 30) {
                  return `${tagName}:contains("${text}")`;
                }
              }
              
              // For form elements, use type or structure
              if (['input', 'select', 'textarea'].includes(tagName)) {
                const type = el.getAttribute('type');
                if (type) {
                  return `${tagName}[type="${type}"]`;
                }
              }
              
              // Last resort: use tag name with position
              const siblings = Array.from((el.parentElement?.children || []))
                .filter(sibling => sibling.nodeName.toLowerCase() === tagName);
              
              if (siblings.length > 1) {
                const index = siblings.indexOf(el) + 1;
                return `${tagName}:nth-of-type(${index})`;
              }
              
              return tagName;
            }
            
            // Check if a class name is meaningful (not just utility)
            function isMeaningfulClass(className: string): boolean {
              // Meaningful classes usually contain semantic information
              const meaningfulPatterns = [
                /^(btn|button)/, // button classes
                /^(nav|navigation)/, // navigation classes
                /^(form|input)/, // form classes
                /^(card|panel|modal)/, // component classes
                /^(header|footer|main|content)/, // layout classes
                /^(login|signin|auth)/, // authentication classes
                /^[a-zA-Z][a-zA-Z0-9-_]*$/ // general semantic classes
              ];
              
              // Must not be too short or too generic
              if (className.length < 3 || ['cls', 'el', 'obj'].includes(className.toLowerCase())) {
                return false;
              }
              
              return meaningfulPatterns.some(pattern => pattern.test(className));
            }
            
            // Validate that a selector actually targets the intended element uniquely
            function isValidSelector(selector: string, targetElement: Element): boolean {
              try {
                const elements = Array.from(document.querySelectorAll(selector));
                return elements.length === 1 && elements[0] === targetElement;
              } catch (error) {
                return false;
              }
            }

            // Check if a class name is a utility class (should be ignored)
            function isUtilityClass(className: string): boolean {
              const utilityPatterns = [
                /^(m|p)[trblxy]?-\d+$/, // margin/padding utilities
                /^(w|h)-\d+$/, // width/height utilities
                /^text-(xs|sm|lg|xl|\d+)$/, // text size utilities
                /^(flex|grid|block|inline)/, // layout utilities
                /^(bg|text|border)-(red|blue|green|gray|white|black)-\d+$/, // color utilities
                /^(rounded|shadow|opacity)-/, // appearance utilities
                /^(hidden|visible|sr-only)$/, // visibility utilities
                /^has-[a-z]+$/, // state classes like 'has-cq'
                /^is-[a-z]+$/, // state classes like 'is-active'
                /^[a-z]+-\d+$/, // generic utility classes
                /^(active|disabled|selected|current)$/, // common state classes
                /^(sm|md|lg|xl):[a-z-]+$/ // responsive prefixes
              ];
              
              return utilityPatterns.some(pattern => pattern.test(className));
            }

            // Calculate element importance score
            function calculateElementScore(el: Element, searchText: string, exactMatch: boolean): ElementScore {
              let score = 0;
              let matchType: ElementScore['matchType'] = 'partial';
              let confidence = 0;

              const content = el.textContent?.trim() || '';
              const tagName = el.tagName.toLowerCase();
              
              // Text matching scoring
              if (exactMatch && content === searchText) {
                score += 100;
                matchType = 'exact';
                confidence = 0.95;
              } else if (!exactMatch && content.includes(searchText)) {
                score += 50;
                
                // Bonus for exact word match
                const words = content.toLowerCase().split(/\s+/);
                const searchWords = searchText.toLowerCase().split(/\s+/);
                const wordMatches = searchWords.filter(word => words.includes(word)).length;
                score += (wordMatches / searchWords.length) * 30;
                confidence = 0.7 + (wordMatches / searchWords.length) * 0.2;
              }
              
              // Semantic role bonus
              const role = el.getAttribute('role');
              if (role) {
                score += 20;
                matchType = 'role';
              }
              
              // Interactive element bonus
              if (['button', 'a', 'input', 'select', 'textarea'].includes(tagName)) {
                score += 15;
              }
              
              // ARIA attributes bonus
              const ariaLabel = el.getAttribute('aria-label');
              if (ariaLabel && (ariaLabel.includes(searchText) || searchText.includes(ariaLabel))) {
                score += 25;
                matchType = 'semantic';
                confidence += 0.1;
              }
              
              // Data attributes bonus
              const dataTestId = el.getAttribute('data-testid') || el.getAttribute('data-test');
              if (dataTestId && dataTestId.toLowerCase().includes(searchText.toLowerCase())) {
                score += 30;
                confidence += 0.15;
              }
              
              // Visibility and accessibility scoring
              if (!includeHidden) {
                const computedStyle = window.getComputedStyle(el);
                if (computedStyle.display === 'none' || computedStyle.visibility === 'hidden') {
                  score -= 50; // Heavily penalize hidden elements
                }
                
                if (computedStyle.opacity === '0') {
                  score -= 30; // Penalize invisible elements
                }
              }
              
              // Size relevance (avoid tiny elements)
              const rect = el.getBoundingClientRect();
              if (rect.width < 10 || rect.height < 10) {
                score -= 25;
              }
              
              // Prefer elements in main content areas
              const inMainContent = el.closest('main, article, .content, .main-content, #content, #main');
              if (inMainContent) {
                score += 10;
              }
              
              // Avoid elements in navigation, footer, ads
              const inNonContent = el.closest('nav, footer, .nav, .footer, .ads, .advertisement, .sidebar');
              if (inNonContent) {
                score -= 15;
              }
              
              return {
                element: el,
                score: Math.max(0, score),
                matchType,
                confidence: Math.min(0.99, confidence)
              };
            }

            // Enhanced element search with semantic awareness
            const semanticSelectors = getSemanticSelectors(elType);
            const allMatches: ElementScore[] = [];
            
            // Search using semantic selectors
            for (const semanticSelector of semanticSelectors) {
              try {
                const elements = Array.from(document.querySelectorAll(semanticSelector));
                
                for (const el of elements) {
                  const content = el.textContent || '';
                  const hasTextMatch = exactMatch 
                    ? content.trim() === searchText 
                    : content.includes(searchText);
                  
                  // Also check aria-label and data attributes for semantic matching
                  const ariaLabel = el.getAttribute('aria-label') || '';
                  const dataTestId = el.getAttribute('data-testid') || el.getAttribute('data-test') || '';
                  
                  const hasSemanticMatch = ariaLabel.toLowerCase().includes(searchText.toLowerCase()) ||
                                         dataTestId.toLowerCase().includes(searchText.toLowerCase());
                  
                  if (hasTextMatch || hasSemanticMatch) {
                    const scored = calculateElementScore(el, searchText, exactMatch);
                    allMatches.push(scored);
                  }
                }
              } catch (error) {
                // Continue with other selectors if one fails
                console.warn('Selector failed:', semanticSelector, error);
              }
            }

            // Remove duplicates and sort by score
            const uniqueMatches = allMatches.filter((match, index, arr) => 
              arr.findIndex(m => m.element === match.element) === index
            );
            
            uniqueMatches.sort((a, b) => b.score - a.score);

            if (uniqueMatches.length === 0) {
              return null;
            }

            // Return the best match with metadata
            const bestMatch = uniqueMatches[0];
            let selector = getCssSelector(bestMatch.element);
            
            // Validate the selector quality and provide fallbacks if needed
            if (selector.includes('html.has-') || selector.includes('body.') || selector.includes('html >')) {
              console.warn(`Generated problematic selector: ${selector}, attempting to improve...`);
              
              // Try to generate a better selector
              const tagName = bestMatch.element.tagName.toLowerCase();
              const text = bestMatch.element.textContent?.trim();
              
              // For links with href
              if (tagName === 'a') {
                const href = bestMatch.element.getAttribute('href');
                if (href && href !== '#' && href !== 'javascript:void(0)') {
                  selector = `a[href="${href}"]`;
                  console.log(`Improved selector: ${selector}`);
                }
              }
              
              // For form elements with name or type
              if (['input', 'select', 'textarea'].includes(tagName)) {
                const name = bestMatch.element.getAttribute('name');
                const type = bestMatch.element.getAttribute('type');
                if (name) {
                  selector = `${tagName}[name="${name}"]`;
                  console.log(`Improved selector: ${selector}`);
                } else if (type) {
                  selector = `${tagName}[type="${type}"]`;
                  console.log(`Improved selector: ${selector}`);
                }
              }
              
              // For elements with data attributes
              const dataTestId = bestMatch.element.getAttribute('data-testid') || bestMatch.element.getAttribute('data-test');
              if (dataTestId) {
                selector = `[data-testid="${dataTestId}"]`;
                console.log(`Improved selector: ${selector}`);
              }
            }
            
            // Add debug info in development
            if (uniqueMatches.length > 1) {
              console.log(`Found ${uniqueMatches.length} matches, selected best with score ${bestMatch.score} (${bestMatch.matchType})`);
            }
            
            return selector;
          }, text, elementType, exact, includeHidden);

          if (!selector) {
            // Check if this might be an auth-related search
            const authKeywords = ['login', 'sign in', 'log in', 'signin', 'authenticate'];
            const isAuthSearch = authKeywords.some(keyword => 
              text.toLowerCase().includes(keyword) || elementType === 'auth'
            );
            
            let errorMessage = `No element found containing text: "${text}"\n\n` +
              '💡 Troubleshooting tips:\n' +
              '  • Verify the text exists on the current page\n' +
              '  • Try using partial text matching (exact=false)\n' +
              '  • Use get_content first to see available page content\n' +
              '  • Check if the element type filter is too restrictive\n\n';
            
            // Add auth-specific help if relevant
            if (isAuthSearch) {
              // Try to find auth elements
              const authElements = await findAuthElements(page);
              if (authElements.length > 0) {
                errorMessage += `\n🔐 Found ${authElements.length} potential authentication elements:\n`;
                authElements.slice(0, 5).forEach(sel => {
                  errorMessage += `   • ${sel}\n`;
                });
                errorMessage += '\n   Try clicking on one of these selectors directly.\n';
              }
            }
            
            errorMessage += `\n🔍 Search parameters:\n` +
              `   Text: "${text}"\n` +
              `   Element type: ${elementType}\n` +
              `   Exact match: ${exact}`;
            
            throw new Error(errorMessage);
          }

          // Add workflow guidance about successful selector finding
          const successMessage = '\n\n✅ Selector found successfully! You can now:\n' +
            '  • Use this selector with click, type, or other interaction tools\n' +
            '  • Verify the element with get_content using the selector\n' +
            '  • Continue with your automation workflow\n\n' +
            '🔧 Workflow validation ensured:\n' +
            '  • Content was analyzed before selector search\n' +
            '  • No blind guessing - element location is based on current page content\n' +
            '  • Selector generated from actual DOM structure';

          return {
            content: [
              {
                type: 'text',
                text: selector + successMessage,
              },
            ],
          };
        }, 'Failed to find selector');
      });

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
    // Force kill any remaining Chrome processes
    await forceKillAllChromeProcesses();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
