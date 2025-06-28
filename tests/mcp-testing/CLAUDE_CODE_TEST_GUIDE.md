# Claude Code MCP Server Testing Guide

## Overview
This guide explains how to test the puppeteer-real-browser MCP server using Claude Code CLI, which is different from traditional testing approaches.

## Understanding the Difference

### Traditional Testing (What We Built Earlier)
- Runs MCP server as a subprocess
- Direct JSON-RPC communication
- Programmatic testing

### Claude Code Testing (What We Need)
- MCP server managed by Claude Code
- Testing through Claude Code CLI commands
- Interactive or automated through Claude Code API

## Setup Instructions

### 1. Build the MCP Server
```bash
cd /Users/linda/Documents/DEV/puppeteer-real-browser-mcp-server
npx tsc
```

### 2. Add MCP Server to Claude Code
```bash
# Remove any existing test server
claude mcp remove puppeteer-test-server

# Add the server
claude mcp add puppeteer-test-server -- node /Users/linda/Documents/DEV/puppeteer-real-browser-mcp-server/dist/index.js
```

### 3. Verify Server Installation
```bash
# List all MCP servers
claude mcp list

# Get server details
claude mcp get puppeteer-test-server
```

## Interactive Testing in Claude Code

### Step 1: Start Claude Code
```bash
claude
```

### Step 2: Check MCP Server Status
Type in Claude Code:
```
/mcp
```
This should show your puppeteer-test-server with its connection status.

### Step 3: Test Basic Browser Operations
Type these commands one by one:

```
Use the puppeteer-test-server MCP server to list all available tools.
```

```
Use the puppeteer-test-server MCP server to initialize a browser in headless mode.
```

```
Use the puppeteer-test-server MCP server to navigate to https://example.com and take a screenshot.
```

```
Use the puppeteer-test-server MCP server to close the browser.
```

## Test Cases to Verify

### Phase 1: Basic Protocol Testing
- [ ] Server shows as "connected" in /mcp command
- [ ] 10 tools are listed when requested
- [ ] No connection errors

### Phase 2: Browser Operations
- [ ] Browser initialization succeeds
- [ ] Navigation to example.com works
- [ ] Screenshot is captured
- [ ] Browser closes cleanly

### Phase 3: Error Recovery
- [ ] Navigate to https://www.cursor.com/dashboard
- [ ] Verify retry mechanisms work
- [ ] Check error messages are helpful

### Phase 4: Advanced Features
- [ ] Test click on elements
- [ ] Test type in forms
- [ ] Test random_scroll functionality

## Automated Testing Script

Run the automated test setup:
```bash
node claude-code-test-runner.js
```

This will:
1. Add the MCP server to Claude Code
2. Create test prompt files
3. Generate an automated test script

## Common Issues and Solutions

### Issue: "Server not found"
**Solution**: Ensure the server is built and added correctly:
```bash
npx tsc
claude mcp add puppeteer-test-server -- node $(pwd)/dist/index.js
```

### Issue: "Connection failed"
**Solution**: Check server logs:
```bash
# Run server directly to see errors
node dist/index.js
```

### Issue: "Tools not available"
**Solution**: Restart Claude Code or remove and re-add the server:
```bash
claude mcp remove puppeteer-test-server
claude mcp add puppeteer-test-server -- node $(pwd)/dist/index.js
```

## Manual Test Prompts

Save these as text files and use with `@filename` in Claude Code:

### test-all-tools.txt
```
Using the puppeteer-test-server MCP server, please:
1. List all available tools with descriptions
2. Verify all 12 expected tools are present
3. Report any missing tools
```

### test-browser-lifecycle.txt
```
Using the puppeteer-test-server MCP server, please:
1. Initialize a browser (headless: true)
2. Navigate to https://httpbin.org/user-agent
3. Get the page content
4. Take a screenshot
5. Close the browser
Report success/failure for each step.
```

### test-error-handling.txt
```
Using the puppeteer-test-server MCP server, please:
1. Try to click on a non-existent element (#does-not-exist)
2. Try to navigate to an invalid URL
3. Report how errors are handled
```

## Running Tests

1. **Quick Test**: Run `claude` and type `/mcp` to verify connection
2. **Full Test**: Use the test prompts above
3. **Automated**: Run `node automated-mcp-test.js` (after setup)

## Cleanup

To remove the test server:
```bash
claude mcp remove puppeteer-test-server
```

## Next Steps

After verifying the server works with these tests:
1. Add the server permanently using your project .mcp.json
2. Share test results
3. Fix any identified issues