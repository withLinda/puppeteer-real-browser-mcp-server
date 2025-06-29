#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("@modelContextProtocol/sdk/server/index.js");
const stdio_js_1 = require("@modelContextProtocol/sdk/server/stdio.js");
const types_js_1 = require("@modelContextProtocol/sdk/types.js");
const puppeteer_real_browser_1 = require("puppeteer-real-browser");
const stealth_actions_1 = require("./stealth-actions");
const promises_1 = require("node:timers/promises");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// Store browser instance
let browserInstance = null;
let pageInstance = null;
let browserCircuitBreaker = {
    failureCount: 0,
    lastFailureTime: 0,
    state: 'closed'
};
let currentRetryDepth = 0;
const MAX_RETRY_DEPTH = 3;
const CIRCUIT_BREAKER_THRESHOLD = 5;
const CIRCUIT_BREAKER_TIMEOUT = 30000; // 30 seconds
// Initialize MCP server
const server = new index_js_1.Server({
    name: 'puppeteer-real-browser-mcp-server',
    version: '1.0.0',
}, {
    capabilities: {
        tools: {},
        resources: {},
        prompts: {},
    },
});
// Error handling wrapper
async function withErrorHandling(operation, errorMessage) {
    try {
        return await operation();
    }
    catch (error) {
        console.error(`${errorMessage}:`, error);
        throw new Error(`${errorMessage}: ${error instanceof Error ? error.message : String(error)}`);
    }
}
// Specific error types for better handling
var BrowserErrorType;
(function (BrowserErrorType) {
    BrowserErrorType["FRAME_DETACHED"] = "FRAME_DETACHED";
    BrowserErrorType["SESSION_CLOSED"] = "SESSION_CLOSED";
    BrowserErrorType["TARGET_CLOSED"] = "TARGET_CLOSED";
    BrowserErrorType["PROTOCOL_ERROR"] = "PROTOCOL_ERROR";
    BrowserErrorType["NAVIGATION_TIMEOUT"] = "NAVIGATION_TIMEOUT";
    BrowserErrorType["ELEMENT_NOT_FOUND"] = "ELEMENT_NOT_FOUND";
    BrowserErrorType["UNKNOWN"] = "UNKNOWN";
})(BrowserErrorType || (BrowserErrorType = {}));
function categorizeError(error) {
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
async function withTimeout(operation, timeoutMs, context = 'unknown') {
    return new Promise((resolve, reject) => {
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
function updateCircuitBreakerOnFailure() {
    browserCircuitBreaker.failureCount++;
    browserCircuitBreaker.lastFailureTime = Date.now();
    if (browserCircuitBreaker.failureCount >= CIRCUIT_BREAKER_THRESHOLD) {
        browserCircuitBreaker.state = 'open';
        console.error(`Circuit breaker opened after ${browserCircuitBreaker.failureCount} failures`);
    }
}
function updateCircuitBreakerOnSuccess() {
    browserCircuitBreaker.failureCount = 0;
    browserCircuitBreaker.state = 'closed';
}
function isCircuitBreakerOpen() {
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
async function withRetry(operation, maxRetries = 3, delay = 1000, context = 'unknown') {
    // Check recursion depth to prevent infinite loops
    if (currentRetryDepth >= MAX_RETRY_DEPTH) {
        throw new Error(`Maximum recursion depth (${MAX_RETRY_DEPTH}) exceeded in withRetry for context: ${context}. This prevents infinite loops.`);
    }
    // Check circuit breaker
    if (isCircuitBreakerOpen()) {
        throw new Error(`Circuit breaker is open. Browser operations are temporarily disabled to prevent cascade failures. Wait ${CIRCUIT_BREAKER_TIMEOUT}ms before retrying.`);
    }
    currentRetryDepth++;
    let lastError;
    try {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const result = await operation();
                updateCircuitBreakerOnSuccess();
                return result;
            }
            catch (error) {
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
                    }
                    catch (e) {
                        console.error('Error during browser cleanup:', e);
                    }
                }
            }
        }
        updateCircuitBreakerOnFailure();
        throw lastError;
    }
    finally {
        currentRetryDepth--;
    }
}
// Session validation utility
let sessionValidationInProgress = false;
async function validateSession() {
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
    }
    catch (error) {
        console.error('Session validation failed:', error);
        return false;
    }
    finally {
        sessionValidationInProgress = false;
    }
}
// Chrome path detection for cross-platform support
function detectChromePath() {
    const platform = process.platform;
    let possiblePaths = [];
    switch (platform) {
        case 'win32':
            possiblePaths = [
                'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
                'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
                path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
                path.join(process.env.PROGRAMFILES || '', 'Google\\Chrome\\Application\\chrome.exe'),
                path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google\\Chrome\\Application\\chrome.exe')
            ];
            break;
        case 'darwin':
            possiblePaths = [
                '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
                '/Applications/Chromium.app/Contents/MacOS/Chromium'
            ];
            break;
        case 'linux':
            possiblePaths = [
                '/usr/bin/google-chrome',
                '/usr/bin/google-chrome-stable',
                '/usr/bin/chromium-browser',
                '/usr/bin/chromium',
                '/snap/bin/chromium'
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
        }
        catch (error) {
            // Continue to next path
        }
    }
    // Enhanced error message for Windows with specific troubleshooting steps
    if (platform === 'win32') {
        console.error(`❌ Chrome not found at any expected Windows paths:`);
        console.error(`   Searched locations:`);
        possiblePaths.forEach(path => console.error(`   - ${path}`));
        console.error(`\n   📝 Windows Troubleshooting Steps:`);
        console.error(`   1. Verify Chrome is installed: Download from https://www.google.com/chrome/`);
        console.error(`   2. Check installation location manually in File Explorer`);
        console.error(`   3. If Chrome is in a custom location, specify the path manually:`);
        console.error(`      Ask Claude: "Initialize browser with custom Chrome path at C:\\Your\\Path\\chrome.exe"`);
        console.error(`   4. Try running as Administrator if permission issues occur`);
        console.error(`   5. Check Windows Defender isn't blocking Chrome execution`);
        console.error(`   6. For Cursor IDE users: Add explicit Chrome path to MCP configuration`);
    }
    else {
        console.error(`❌ Chrome not found at any expected paths for platform: ${platform}`);
        console.error(`   Searched locations:`);
        possiblePaths.forEach(path => console.error(`   - ${path}`));
    }
    return null;
}
// Browser lifecycle management
let browserInitDepth = 0;
const MAX_BROWSER_INIT_DEPTH = 2;
async function initializeBrowser(options) {
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
            }
            else {
                console.error('Existing session is invalid, reinitializing browser...');
                await closeBrowser();
            }
        }
        // Detect Chrome path for cross-platform support
        const detectedChromePath = detectChromePath();
        const customConfig = options?.customConfig ?? {};
        // Configure chrome-launcher options to prevent double browser launch
        const chromeConfig = {
            ignoreDefaultFlags: false,
            chromeFlags: [
                '--no-first-run',
                '--no-default-browser-check',
                '--disable-default-apps',
                '--start-maximized',
                '--disable-blink-features=AutomationControlled',
                // Additional flags to help with stack overflow issues
                '--disable-dev-shm-usage', // Overcome limited resource problems
                '--no-sandbox', // Bypass OS security model, critical for Linux containers
                '--disable-setuid-sandbox',
                '--disable-web-security', // Disable CORS
                '--disable-features=VizDisplayCompositor', // Disable GPU compositing
                '--max-old-space-size=4096', // Increase memory limit
                '--stack-size=16000' // Increase stack size limit for Node.js
            ],
            ...customConfig
        };
        // Add detected Chrome path if found and not already specified
        if (detectedChromePath && !chromeConfig.chromePath) {
            chromeConfig.chromePath = detectedChromePath;
        }
        const connectOptions = {
            headless: options?.headless ?? false,
            customConfig: chromeConfig,
            turnstile: true,
            disableXvfb: options?.disableXvfb ?? true,
            connectOption: {
                defaultViewport: null,
                ...(options?.connectOption ?? {}),
            },
        };
        if (options?.proxy) {
            connectOptions.customConfig.chromeFlags.push(`--proxy-server=${options.proxy}`);
        }
        if (options?.plugins && Array.isArray(options.plugins)) {
            connectOptions.plugins = options.plugins;
        }
        try {
            const result = await (0, puppeteer_real_browser_1.connect)(connectOptions);
            const { browser, page } = result;
            browserInstance = browser;
            pageInstance = page;
            // Viewport is now set to null for maximized window behavior
            console.error(`✓ Browser initialized successfully`);
            updateCircuitBreakerOnSuccess();
            return { browser, page };
        }
        catch (error) {
            updateCircuitBreakerOnFailure();
            // Enhanced error handling for browser launch failures
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes('ENOENT') || errorMessage.includes('spawn') || errorMessage.includes('chrome')) {
                const platform = process.platform;
                if (platform === 'win32') {
                    console.error(`❌ Browser launch failed on Windows:`);
                    console.error(`   Error: ${errorMessage}`);
                    console.error(`\n   🔧 Windows-Specific Solutions:`);
                    console.error(`   1. Chrome Path Issues:`);
                    console.error(`      - Chrome might not be installed or in an unexpected location`);
                    console.error(`      - Try specifying custom Chrome path: customConfig.chromePath`);
                    console.error(`      - Example: {"customConfig": {"chromePath": "C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe"}}`);
                    console.error(`\n   2. Permission Issues:`);
                    console.error(`      - Run Cursor IDE or your terminal as Administrator`);
                    console.error(`      - Check User Account Control (UAC) settings`);
                    console.error(`\n   3. Security Software:`);
                    console.error(`      - Add Chrome and Node.js to Windows Defender exclusions`);
                    console.error(`      - Temporarily disable antivirus to test`);
                    console.error(`\n   4. Chrome Process Issues:`);
                    console.error(`      - Kill any existing Chrome processes in Task Manager`);
                    console.error(`      - Try headless mode: {"headless": true}`);
                    console.error(`\n   5. Cursor IDE Configuration:`);
                    console.error(`      - Add Chrome path to MCP configuration env variables`);
                    console.error(`      - Use PUPPETEER_LAUNCH_OPTIONS environment variable`);
                }
                else {
                    console.error(`❌ Browser launch failed on ${platform}:`);
                    console.error(`   Error: ${errorMessage}`);
                }
                throw new Error(`Browser initialization failed: ${errorMessage}. See console for platform-specific troubleshooting steps.`);
            }
            // Re-throw other types of errors
            throw error;
        }
    }
    finally {
        browserInitDepth--;
    }
}
async function closeBrowser() {
    if (browserInstance) {
        try {
            await browserInstance.close();
        }
        catch (error) {
            console.error('Error closing browser:', error);
        }
        finally {
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
server.setRequestHandler(types_js_1.InitializeRequestSchema, async (request) => ({
    protocolVersion: '2024-11-05',
    capabilities: {
        tools: {},
        resources: {},
        prompts: {},
    },
    serverInfo: {
        name: 'puppeteer-real-browser-mcp-server',
        version: '1.2.0',
    },
}));
// Register tool handlers
server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => ({
    tools: TOOLS,
}));
// Register resource handlers
server.setRequestHandler(types_js_1.ListResourcesRequestSchema, async () => ({
    resources: [],
}));
// Register prompts handlers
server.setRequestHandler(types_js_1.ListPromptsRequestSchema, async () => ({
    prompts: [],
}));
server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    // Type guard to ensure args is defined
    if (!args) {
        throw new Error('Missing arguments for tool call');
    }
    switch (name) {
        case 'browser_init':
            return await withErrorHandling(async () => {
                await initializeBrowser(args);
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
                    await page.goto(args.url, {
                        waitUntil: args.waitUntil || 'networkidle2',
                        timeout: 60000,
                    });
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `Navigated to ${args.url}`,
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
                        let screenshotOptions = {
                            fullPage: args.fullPage || false,
                            encoding: 'base64',
                        };
                        // Check if safe mode is enabled to preemptively use safer methods
                        if (args.safeMode) {
                            console.error('Safe mode enabled, using CDP method directly...');
                            try {
                                const client = await page.target().createCDPSession();
                                // Get layout metrics first
                                const { layoutViewport } = await client.send('Page.getLayoutMetrics');
                                // Use CDP directly for safer screenshot
                                const screenshotData = await client.send('Page.captureScreenshot', {
                                    format: 'png',
                                    quality: 80,
                                    clip: args.selector ? undefined : {
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
                            }
                            catch (safeModeError) {
                                console.error('Safe mode CDP method failed, falling back to simple screenshot...');
                                // Fall through to try standard method with minimal options
                            }
                        }
                        try {
                            if (args.selector) {
                                const element = await page.$(args.selector);
                                if (!element)
                                    throw new Error(`Element not found: ${args.selector}`);
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
                        }
                        catch (error) {
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
                                        clip: args.selector ? undefined : {
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
                                }
                                catch (fallbackError) {
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
                                    }
                                    catch (lastResortError) {
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
                let content;
                if (args.selector) {
                    const element = await page.$(args.selector);
                    if (!element)
                        throw new Error(`Element not found: ${args.selector}`);
                    content = args.type === 'text'
                        ? await element.evaluate((el) => el.textContent)
                        : await element.evaluate((el) => el.outerHTML);
                }
                else {
                    content = args.type === 'text'
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
                    const selector = args.selector;
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
                            await page.$eval(selector, (el) => el.click());
                        }
                        else {
                            // Standard click with options
                            const options = args.options || {};
                            if (args.waitForNavigation) {
                                await Promise.all([
                                    page.waitForNavigation({ waitUntil: 'networkidle2' }),
                                    page.click(selector, options),
                                ]);
                            }
                            else {
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
                    }
                    catch (error) {
                        if (error instanceof Error && error.message.includes('not found')) {
                            throw error; // Re-throw element not found errors with our custom message
                        }
                        // For other errors, try JavaScript click as fallback
                        try {
                            await page.$eval(selector, (el) => el.click());
                            return {
                                content: [
                                    {
                                        type: 'text',
                                        text: `Clicked element using JavaScript fallback: ${selector}`,
                                    },
                                ],
                            };
                        }
                        catch (fallbackError) {
                            throw new Error(`Click failed: ${error instanceof Error ? error.message : String(error)}. Fallback also failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
                        }
                    }
                }, 3, 1000, 'click');
            }, 'Failed to click element');
        case 'type':
            return await withErrorHandling(async () => {
                const { page } = await initializeBrowser();
                // Clear existing content first
                await page.click(args.selector);
                await page.keyboard.down('Control');
                await page.keyboard.press('A');
                await page.keyboard.up('Control');
                await page.keyboard.press('Backspace');
                await page.type(args.selector, args.text, { delay: args.delay || 100 });
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Typed text into: ${args.selector}`,
                        },
                    ],
                };
            }, 'Failed to type text');
        case 'wait':
            return await withErrorHandling(async () => {
                const { page } = await initializeBrowser();
                switch (args.type) {
                    case 'selector':
                        await page.waitForSelector(args.value, { timeout: args.timeout || 30000 });
                        break;
                    case 'navigation':
                        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: args.timeout || 30000 });
                        break;
                    case 'timeout':
                        await (0, promises_1.setTimeout)(parseInt(args.value));
                        break;
                }
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Wait completed for ${args.type}: ${args.value}`,
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
                            text: `Attempted to solve ${args.type} captcha. Check page to verify success.`,
                        },
                    ],
                };
            }, 'Failed to solve captcha');
        case 'random_scroll':
            return await withErrorHandling(async () => {
                const { page } = await initializeBrowser();
                // Use the randomScroll function from stealth-actions.ts
                await (0, stealth_actions_1.randomScroll)(page);
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
                const { text, elementType = '*', exact = false } = args;
                const selector = await page.evaluate((searchText, elType, exactMatch) => {
                    // Function to generate unique CSS selector
                    function getCssSelector(el) {
                        const path = [];
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
                            if (!parent)
                                break;
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
    const transport = new stdio_js_1.StdioServerTransport();
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
