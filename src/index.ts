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

// Import extracted modules
import { TOOLS, SERVER_INFO, CAPABILITIES, TOOL_NAMES, NavigateArgs, ClickArgs, TypeArgs, WaitArgs, SolveCaptchaArgs, FindSelectorArgs } from './tool-definitions';
import { withErrorHandling } from './system-utils';
import { closeBrowser, forceKillAllChromeProcesses } from './browser-manager';
import { setupProcessCleanup, MCP_SERVER_CONFIG } from './core-infrastructure';

// Import handlers
import { handleBrowserInit, handleBrowserClose } from './handlers/browser-handlers';
import { handleNavigate, handleWait } from './handlers/navigation-handlers';
import { handleClick, handleType, handleSolveCaptcha, handleRandomScroll } from './handlers/interaction-handlers';
import { handleGetContent, handleScreenshot, handleFindSelector } from './handlers/content-handlers';

// Initialize MCP server
const server = new Server(SERVER_INFO, { capabilities: CAPABILITIES });

// Register tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

// Register resource handlers (placeholder)
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [],
}));

// Register prompt handlers (placeholder)
server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: [],
}));

// Main tool call handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case TOOL_NAMES.BROWSER_INIT:
        return await handleBrowserInit(args || {});

      case TOOL_NAMES.NAVIGATE:
        return await handleNavigate(args as unknown as NavigateArgs);

      case TOOL_NAMES.GET_CONTENT:
        return await handleGetContent(args || {});

      case TOOL_NAMES.SCREENSHOT:
        return await handleScreenshot(args || {});

      case TOOL_NAMES.CLICK:
        return await handleClick(args as unknown as ClickArgs);

      case TOOL_NAMES.TYPE:
        return await handleType(args as unknown as TypeArgs);

      case TOOL_NAMES.WAIT:
        return await handleWait(args as unknown as WaitArgs);

      case TOOL_NAMES.BROWSER_CLOSE:
        return await handleBrowserClose();

      case TOOL_NAMES.SOLVE_CAPTCHA:
        return await handleSolveCaptcha(args as unknown as SolveCaptchaArgs);

      case TOOL_NAMES.RANDOM_SCROLL:
        return await handleRandomScroll();

      case TOOL_NAMES.FIND_SELECTOR:
        return await handleFindSelector(args as unknown as FindSelectorArgs);

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Tool ${name} failed:`, errorMessage);
    
    return {
      content: [
        {
          type: 'text',
          text: `❌ Tool execution failed: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});

// Main function to start the server
async function main(): Promise<void> {
  // Setup process cleanup handlers
  setupProcessCleanup(async () => {
    await closeBrowser();
    await forceKillAllChromeProcesses();
  });

  // Create and start the server transport
  const transport = new StdioServerTransport();
  
  await withErrorHandling(async () => {
    await server.connect(transport);
    console.error('🚀 Puppeteer Real Browser MCP Server started successfully');
    console.error('📋 Available tools:', TOOLS.map(t => t.name).join(', '));
    console.error('🔧 Workflow validation: Active');
    console.error('💡 Content priority mode: Enabled (use get_content for better reliability)');
  }, 'Failed to start MCP server');
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled rejection:', reason);
  process.exit(1);
});

// Start the server
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  });
}