#!/usr/bin/env node
import { Server } from '@modelContextProtocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelContextProtocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ListPromptsRequestSchema,
} from '@modelContextProtocol/sdk/types.js';
import { connect } from 'puppeteer-real-browser';
import { randomScroll } from './stealth-actions';
import { setTimeout as sleep } from 'node:timers/promises';
import * as fs from 'fs';
import * as path from 'path';

// Store browser instance
let browserInstance: any = null;
let pageInstance: any = null;

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

// Retry wrapper for operations that may fail due to browser issues
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const errorType = categorizeError(lastError);

      console.error(`Attempt ${attempt}/${maxRetries} failed (${errorType}):`, lastError.message);

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
      const waitTime = delay * Math.pow(2, attempt - 1); // Exponential backoff
      await new Promise(resolve => setTimeout(resolve, waitTime));

      // Browser recovery for session-related errors
      if ([BrowserErrorType.SESSION_CLOSED, BrowserErrorType.TARGET_CLOSED, BrowserErrorType.FRAME_DETACHED].includes(errorType)) {
        console.error('Attempting browser recovery...');
        try {
          await closeBrowser();
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s before reinit
        } catch (e) {
          console.error('Error during browser cleanup:', e);
        }
      }
    }
  }

  throw lastError!;
}

// Session validation utility
async function validateSession(): Promise<boolean> {
  if (!browserInstance || !pageInstance) {
    return false;
  }

  try {
    // Test if browser is still connected
    await browserInstance.version();

    // Test if page is still active
    await pageInstance.evaluate(() => true);

    return true;
  } catch (error) {
    console.error('Session validation failed:', error);
    return false;
  }
}

// Chrome path detection for cross-platform support
function detectChromePath(): string | null {
  const platform = process.platform;

  let possiblePaths: string[] = [];

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
        console.error(`Found Chrome at: ${chromePath}`);
        return chromePath;
      }
    } catch (error) {
      // Continue to next path
    }
  }

  console.error(`Chrome not found at any expected paths for platform: ${platform}`);
  return null;
}

// Browser lifecycle management
async function initializeBrowser(options?: any) {
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

  // Configure chrome-launcher options to prevent double browser launch
  const chromeConfig = {
    ignoreDefaultFlags: false,
    chromeFlags: [
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-default-apps',
      '--start-maximized',
      '--disable-blink-features=AutomationControlled'
    ],
    ...customConfig
  };

  // Add detected Chrome path if found and not already specified
  if (detectedChromePath && !chromeConfig.chromePath) {
    chromeConfig.chromePath = detectedChromePath;
  }

  const connectOptions: any = {
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

  const result = await connect(connectOptions);
  const { browser, page } = result;

  browserInstance = browser;
  pageInstance = page;

  // Viewport is now set to null for maximized window behavior

  return { browser, page };
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
];

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
        });
      }, 'Failed to navigate');

    case 'screenshot':
      return await withErrorHandling(async () => {
        return await withRetry(async () => {
          const { page } = await initializeBrowser();

          let screenshotOptions: any = {
            fullPage: (args as any).fullPage || false,
            encoding: 'base64',
          };

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
        });
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
        });
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
