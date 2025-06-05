#!/usr/bin/env node
import { Server } from '@modelContextProtocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelContextProtocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelContextProtocol/sdk/types.js';
import { connect } from 'puppeteer-real-browser';
import { humanLikeMouseMove, humanLikeTyping, randomScroll } from './stealth-actions';

// Store browser instance
let browserInstance: any = null;
let pageInstance: any = null;
let setTargetFunction: any = null;

// Initialize MCP server
const server = new Server(
  {
    name: 'puppeteer-real-browser-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
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

// Browser lifecycle management
async function initializeBrowser(options?: any) {
  if (browserInstance) {
    return { browser: browserInstance, page: pageInstance };
  }

  const connectOptions: any = {
    headless: options?.headless ?? false,
    args: options?.ignoreAllFlags ? [] : ['--no-sandbox', '--disable-setuid-sandbox'],
    customConfig: options?.customConfig ?? {},
    turnstile: true,
    ...(options?.connectOption ?? {}),
  };

  if (options?.disableXvfb !== undefined) {
    connectOptions.disableXvfb = options.disableXvfb;
  }

  if (options?.proxy) {
    connectOptions.args = connectOptions.args || [];
    connectOptions.args.push(`--proxy-server=${options.proxy}`);
  }

  if (options?.plugins && Array.isArray(options.plugins)) {
    connectOptions.plugins = options.plugins;
  }

  const result = await connect(connectOptions);
  const { browser, page } = result;
  const setTarget = (result as any).setTarget;

  browserInstance = browser;
  pageInstance = page;
  setTargetFunction = setTarget || null;

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
  {
    name: 'real_click',
    description: 'Use page.realClick for enhanced clicking with puppeteer-real-browser',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector of element to click',
        },
        options: {
          type: 'object',
          description: 'Click options (button, clickCount, delay, etc.)',
          properties: {
            button: {
              type: 'string',
              enum: ['left', 'right', 'middle'],
              default: 'left',
            },
            clickCount: {
              type: 'number',
              default: 1,
            },
            delay: {
              type: 'number',
              description: 'Delay in milliseconds',
            },
          },
        },
      },
      required: ['selector'],
    },
  },
  {
    name: 'real_cursor',
    description: 'Use page.realCursor for enhanced cursor movements with puppeteer-real-browser',
    inputSchema: {
      type: 'object',
      properties: {
        selector: {
          type: 'string',
          description: 'CSS selector to move cursor to',
        },
        x: {
          type: 'number',
          description: 'X coordinate to move cursor to',
        },
        y: {
          type: 'number',
          description: 'Y coordinate to move cursor to',
        },
        options: {
          type: 'object',
          description: 'Cursor movement options',
          properties: {
            steps: {
              type: 'number',
              description: 'Number of movement steps',
              default: 20,
            },
          },
        },
      },
    },
  },
  {
    name: 'set_target',
    description: 'Use setTarget function from puppeteer-real-browser',
    inputSchema: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          description: 'Target configuration',
        },
      },
      required: ['target'],
    },
  },
];

// Register tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
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
      }, 'Failed to navigate');

    case 'screenshot':
      return await withErrorHandling(async () => {
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
        const { page } = await initializeBrowser();

        const options = (args as any).options || {};
        
        if ((args as any).waitForNavigation) {
          await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2' }),
            page.click((args as any).selector, options),
          ]);
        } else {
          await page.click((args as any).selector, options);
        }

        return {
          content: [
            {
              type: 'text',
              text: `Clicked element: ${(args as any).selector}`,
            },
          ],
        };
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
            await page.waitForTimeout(parseInt((args as any).value as string));
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

    case 'human_like_click':
      return await withErrorHandling(async () => {
        const { page } = await initializeBrowser();

        // Get element position
        const element = await page.$((args as any).selector);
        if (!element) throw new Error(`Element not found: ${(args as any).selector}`);

        const boundingBox = await element.boundingBox();
        if (!boundingBox) throw new Error(`Cannot get position of element: ${(args as any).selector}`);

        // Calculate center point
        const x = boundingBox.x + boundingBox.width / 2;
        const y = boundingBox.y + boundingBox.height / 2;

        // Use the humanLikeMouseMove function from stealth-actions.ts
        await humanLikeMouseMove(page, x, y);

        // Click after movement
        await page.mouse.click(x, y);

        return {
          content: [
            {
              type: 'text',
              text: `Human-like click on element: ${(args as any).selector}`,
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
              text: `Attempted to solve ${(args as any).type} captcha. Check page to verify success.`,
            },
          ],
        };
      }, 'Failed to solve captcha');

    case 'human_like_type':
      return await withErrorHandling(async () => {
        const { page } = await initializeBrowser();

        // Use the humanLikeTyping function from stealth-actions.ts
        await humanLikeTyping(page, (args as any).selector as string, (args as any).text as string);

        return {
          content: [
            {
              type: 'text',
              text: `Typed text with human-like timing into: ${(args as any).selector}`,
            },
          ],
        };
      }, 'Failed to perform human-like typing');

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

    case 'real_click':
      return await withErrorHandling(async () => {
        const { page } = await initializeBrowser();

        if (typeof page.realClick !== 'function') {
          throw new Error('realClick method not available on page object');
        }

        const options = (args as any).options || {};
        await page.realClick((args as any).selector, options);

        return {
          content: [
            {
              type: 'text',
              text: `Real click performed on element: ${(args as any).selector}`,
            },
          ],
        };
      }, 'Failed to perform real click');

    case 'real_cursor':
      return await withErrorHandling(async () => {
        const { page } = await initializeBrowser();

        if (!page.realCursor || typeof page.realCursor !== 'object') {
          throw new Error('realCursor object not available on page object');
        }

        if ((args as any).selector) {
          await page.realCursor.moveTo((args as any).selector);
        } else if ((args as any).x !== undefined && (args as any).y !== undefined) {
          await page.realCursor.moveTo((args as any).x, (args as any).y);
        } else {
          throw new Error('Either selector or x,y coordinates must be provided');
        }

        return {
          content: [
            {
              type: 'text',
              text: 'Real cursor movement performed',
            },
          ],
        };
      }, 'Failed to perform real cursor movement');

    case 'set_target':
      return await withErrorHandling(async () => {
        await initializeBrowser();

        if (!setTargetFunction) {
          throw new Error('setTarget function not available in current puppeteer-real-browser version');
        }

        await setTargetFunction((args as any).target);

        return {
          content: [
            {
              type: 'text',
              text: `Target set to: ${(args as any).target}`,
            },
          ],
        };
      }, 'Failed to set target');

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
