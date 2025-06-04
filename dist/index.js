"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("@modelcontextprotocol/sdk/server/index.js");
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const types_js_1 = require("@modelcontextprotocol/sdk/types.js");
const puppeteer_real_browser_1 = require("puppeteer-real-browser");
const stealth_actions_1 = require("./stealth-actions");
// Store browser instance
let browserInstance = null;
let pageInstance = null;
// Initialize MCP server
const server = new index_js_1.Server({
    name: 'puppeteer-real-browser-mcp-server',
    version: '1.0.0',
}, {
    capabilities: {
        tools: {},
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
// Browser lifecycle management
async function initializeBrowser() {
    if (browserInstance) {
        return { browser: browserInstance, page: pageInstance };
    }
    const { browser, page } = await (0, puppeteer_real_browser_1.connect)({
        headless: false, // Set to true for production
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        customConfig: {},
        turnstile: true, // Enable turnstile solver
    });
    browserInstance = browser;
    pageInstance = page;
    // Set up default page settings
    await page.setViewport({ width: 1920, height: 1080 });
    return { browser, page };
}
async function closeBrowser() {
    if (browserInstance) {
        await browserInstance.close();
        browserInstance = null;
        pageInstance = null;
    }
}
// Tool definitions
const TOOLS = [
    {
        name: 'browser_init',
        description: 'Initialize a new browser instance with anti-detection features',
        inputSchema: {
            type: 'object',
            properties: {
                headless: {
                    type: 'boolean',
                    description: 'Run browser in headless mode',
                    default: false,
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
        name: 'human_like_click',
        description: 'Click with human-like mouse movement',
        inputSchema: {
            type: 'object',
            properties: {
                selector: {
                    type: 'string',
                    description: 'CSS selector of element to click',
                },
            },
            required: ['selector'],
        },
    },
    {
        name: 'solve_captcha',
        description: 'Attempt to solve captchas (if supported)',
        inputSchema: {
            type: 'object',
            properties: {
                type: {
                    type: 'string',
                    enum: ['recaptcha', 'hcaptcha', 'turnstile'],
                    description: 'Type of captcha to solve',
                },
            },
            required: ['type'],
        },
    },
    {
        name: 'human_like_type',
        description: 'Type text with human-like timing variations',
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
            },
            required: ['selector', 'text'],
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
];
// Register tool handlers
server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => ({
    tools: TOOLS,
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
                await initializeBrowser();
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
            }, 'Failed to navigate');
        case 'screenshot':
            return await withErrorHandling(async () => {
                const { page } = await initializeBrowser();
                let screenshotOptions = {
                    fullPage: args.fullPage || false,
                    encoding: 'base64',
                };
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
                const { page } = await initializeBrowser();
                if (args.waitForNavigation) {
                    await Promise.all([
                        page.waitForNavigation({ waitUntil: 'networkidle2' }),
                        page.click(args.selector),
                    ]);
                }
                else {
                    await page.click(args.selector);
                }
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Clicked element: ${args.selector}`,
                        },
                    ],
                };
            }, 'Failed to click element');
        case 'type':
            return await withErrorHandling(async () => {
                const { page } = await initializeBrowser();
                // Clear existing content first
                await page.click(args.selector, { clickCount: 3 });
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
                        await page.waitForTimeout(parseInt(args.value));
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
        case 'human_like_click':
            return await withErrorHandling(async () => {
                const { page } = await initializeBrowser();
                // Get element position
                const element = await page.$(args.selector);
                if (!element)
                    throw new Error(`Element not found: ${args.selector}`);
                const boundingBox = await element.boundingBox();
                if (!boundingBox)
                    throw new Error(`Cannot get position of element: ${args.selector}`);
                // Calculate center point
                const x = boundingBox.x + boundingBox.width / 2;
                const y = boundingBox.y + boundingBox.height / 2;
                // Use the humanLikeMouseMove function from stealth-actions.ts
                await (0, stealth_actions_1.humanLikeMouseMove)(page, x, y);
                // Click after movement
                await page.mouse.click(x, y);
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Human-like click on element: ${args.selector}`,
                        },
                    ],
                };
            }, 'Failed to perform human-like click');
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
        case 'human_like_type':
            return await withErrorHandling(async () => {
                const { page } = await initializeBrowser();
                // Use the humanLikeTyping function from stealth-actions.ts
                await (0, stealth_actions_1.humanLikeTyping)(page, args.selector, args.text);
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Typed text with human-like timing into: ${args.selector}`,
                        },
                    ],
                };
            }, 'Failed to perform human-like typing');
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
