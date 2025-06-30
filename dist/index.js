#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_js_1 = require("@modelContextProtocol/sdk/server/index.js");
const stdio_js_1 = require("@modelContextProtocol/sdk/server/stdio.js");
const types_js_1 = require("@modelContextProtocol/sdk/types.js");
// Import extracted modules
const tool_definitions_1 = require("./tool-definitions");
const system_utils_1 = require("./system-utils");
const browser_manager_1 = require("./browser-manager");
const core_infrastructure_1 = require("./core-infrastructure");
// Import handlers
const browser_handlers_1 = require("./handlers/browser-handlers");
const navigation_handlers_1 = require("./handlers/navigation-handlers");
const interaction_handlers_1 = require("./handlers/interaction-handlers");
const content_handlers_1 = require("./handlers/content-handlers");
// Initialize MCP server
const server = new index_js_1.Server(tool_definitions_1.SERVER_INFO, { capabilities: tool_definitions_1.CAPABILITIES });
// Register tool handlers
server.setRequestHandler(types_js_1.ListToolsRequestSchema, async () => ({
    tools: tool_definitions_1.TOOLS,
}));
// Register resource handlers (placeholder)
server.setRequestHandler(types_js_1.ListResourcesRequestSchema, async () => ({
    resources: [],
}));
// Register prompt handlers (placeholder)
server.setRequestHandler(types_js_1.ListPromptsRequestSchema, async () => ({
    prompts: [],
}));
// Main tool call handler
server.setRequestHandler(types_js_1.CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
        switch (name) {
            case tool_definitions_1.TOOL_NAMES.BROWSER_INIT:
                return await (0, browser_handlers_1.handleBrowserInit)(args || {});
            case tool_definitions_1.TOOL_NAMES.NAVIGATE:
                return await (0, navigation_handlers_1.handleNavigate)(args);
            case tool_definitions_1.TOOL_NAMES.GET_CONTENT:
                return await (0, content_handlers_1.handleGetContent)(args || {});
            case tool_definitions_1.TOOL_NAMES.SCREENSHOT:
                return await (0, content_handlers_1.handleScreenshot)(args || {});
            case tool_definitions_1.TOOL_NAMES.CLICK:
                return await (0, interaction_handlers_1.handleClick)(args);
            case tool_definitions_1.TOOL_NAMES.TYPE:
                return await (0, interaction_handlers_1.handleType)(args);
            case tool_definitions_1.TOOL_NAMES.WAIT:
                return await (0, navigation_handlers_1.handleWait)(args);
            case tool_definitions_1.TOOL_NAMES.BROWSER_CLOSE:
                return await (0, browser_handlers_1.handleBrowserClose)();
            case tool_definitions_1.TOOL_NAMES.SOLVE_CAPTCHA:
                return await (0, interaction_handlers_1.handleSolveCaptcha)(args);
            case tool_definitions_1.TOOL_NAMES.RANDOM_SCROLL:
                return await (0, interaction_handlers_1.handleRandomScroll)();
            case tool_definitions_1.TOOL_NAMES.FIND_SELECTOR:
                return await (0, content_handlers_1.handleFindSelector)(args);
            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    }
    catch (error) {
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
async function main() {
    // Setup process cleanup handlers
    (0, core_infrastructure_1.setupProcessCleanup)(async () => {
        await (0, browser_manager_1.closeBrowser)();
        await (0, browser_manager_1.forceKillAllChromeProcesses)();
    });
    // Create and start the server transport
    const transport = new stdio_js_1.StdioServerTransport();
    await (0, system_utils_1.withErrorHandling)(async () => {
        await server.connect(transport);
        console.error('🚀 Puppeteer Real Browser MCP Server started successfully');
        console.error('📋 Available tools:', tool_definitions_1.TOOLS.map(t => t.name).join(', '));
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
