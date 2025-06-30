// MCP Tool Definitions and Schemas

// Server metadata
export const SERVER_INFO = {
  name: 'puppeteer-real-browser-mcp-server',
  version: '1.4.0',
};

// MCP capabilities
export const CAPABILITIES = {
  tools: {},
  resources: {},
  prompts: {},
};

// Circuit breaker and retry configuration constants
export const MAX_RETRY_DEPTH = 3;
export const CIRCUIT_BREAKER_THRESHOLD = 5;
export const CIRCUIT_BREAKER_TIMEOUT = 30000; // 30 seconds
export const MAX_BROWSER_INIT_DEPTH = 2;

// Content prioritization configuration interface
export interface ContentPriorityConfig {
  prioritizeContent: boolean;
  fallbackToScreenshots: boolean;
  autoSuggestGetContent: boolean;
}

// Check environment variable for testing override
const disableContentPriority = process.env.DISABLE_CONTENT_PRIORITY === 'true' || process.env.NODE_ENV === 'test';

export const DEFAULT_CONTENT_PRIORITY_CONFIG: ContentPriorityConfig = {
  prioritizeContent: !disableContentPriority,
  fallbackToScreenshots: disableContentPriority,
  autoSuggestGetContent: !disableContentPriority
};

// Complete tool definitions array
export const TOOLS = [
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

// Tool name constants for type safety
export const TOOL_NAMES = {
  BROWSER_INIT: 'browser_init',
  NAVIGATE: 'navigate', 
  SCREENSHOT: 'screenshot',
  GET_CONTENT: 'get_content',
  CLICK: 'click',
  TYPE: 'type',
  WAIT: 'wait',
  BROWSER_CLOSE: 'browser_close',
  SOLVE_CAPTCHA: 'solve_captcha',
  RANDOM_SCROLL: 'random_scroll',
  FIND_SELECTOR: 'find_selector',
} as const;

// Type definitions for tool inputs
export interface BrowserInitArgs {
  headless?: boolean;
  disableXvfb?: boolean;
  ignoreAllFlags?: boolean;
  proxy?: string;
  plugins?: string[];
  connectOption?: any;
  customConfig?: {
    chromePath?: string;
    [key: string]: any;
  };
  contentPriority?: ContentPriorityConfig;
}

export interface NavigateArgs {
  url: string;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';
}

export interface ScreenshotArgs {
  fullPage?: boolean;
  selector?: string;
  safeMode?: boolean;
}

export interface GetContentArgs {
  type?: 'html' | 'text';
  selector?: string;
}

export interface ClickArgs {
  selector: string;
  waitForNavigation?: boolean;
}

export interface TypeArgs {
  selector: string;
  text: string;
  delay?: number;
}

export interface WaitArgs {
  type: 'selector' | 'navigation' | 'timeout';
  value: string;
  timeout?: number;
}

export interface SolveCaptchaArgs {
  type: 'recaptcha' | 'hCaptcha' | 'turnstile';
}

export interface FindSelectorArgs {
  text: string;
  elementType?: string;
  exact?: boolean;
}

// Union type for all tool arguments
export type ToolArgs = 
  | BrowserInitArgs
  | NavigateArgs
  | ScreenshotArgs
  | GetContentArgs
  | ClickArgs
  | TypeArgs
  | WaitArgs
  | SolveCaptchaArgs
  | FindSelectorArgs
  | Record<string, never>; // For tools with no arguments

// Tool categories for organization
export const TOOL_CATEGORIES = {
  BROWSER_MANAGEMENT: [TOOL_NAMES.BROWSER_INIT, TOOL_NAMES.BROWSER_CLOSE],
  NAVIGATION: [TOOL_NAMES.NAVIGATE, TOOL_NAMES.WAIT],
  INTERACTION: [TOOL_NAMES.CLICK, TOOL_NAMES.TYPE, TOOL_NAMES.SOLVE_CAPTCHA, TOOL_NAMES.RANDOM_SCROLL],
  CONTENT: [TOOL_NAMES.GET_CONTENT, TOOL_NAMES.SCREENSHOT, TOOL_NAMES.FIND_SELECTOR],
} as const;