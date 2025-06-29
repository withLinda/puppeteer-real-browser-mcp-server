# Comprehensive MCP Server Testing Checklist

## Purpose
This document provides detailed testing procedures for the puppeteer-real-browser MCP server using Claude Code CLI. Use this checklist for regression testing, pre-publication validation, and ongoing development verification.

---

## 🔧 Pre-Testing Setup

### Environment Preparation
```bash
# Navigate to project directory
cd /path/to/puppeteer-real-browser-mcp-server

# Ensure latest build
npm run build

# Check Claude Code CLI is available
claude --version

# Verify MCP configuration exists
ls -la .mcp.json
```

### Required Files Verification
- [ ] `.mcp.json` exists with correct server configuration
- [ ] `dist/index.js` exists (compiled server)
- [ ] `package.json` has correct version and dependencies
- [ ] No hardcoded credentials in source code

---

## 📋 Testing Categories

## Phase 1: Basic MCP Protocol Testing

### 1.1 Server Recognition Test
**Prompt for Claude Code CLI:**
```
Check if the puppeteer-real-browser MCP server is properly configured and recognized. Use the /mcp command to show server status and list all available tools.
```

**Expected Results:**
- [ ] Server shows as "connected" or "active"
- [ ] 11 tools are listed (browser_init, navigate, screenshot, get_content, click, type, wait, browser_close, solve_captcha, random_scroll, find_selector)
- [ ] No connection errors or warnings

### 1.2 Tool Availability Verification
**Prompt for Claude Code CLI:**
```
List all available tools from the puppeteer-real-browser MCP server and describe what each tool does. Verify that all 11 expected tools are present and have proper descriptions.
```

**Expected Results:**
- [ ] All 11 tools present with descriptions
- [ ] Tool schemas include required parameters
- [ ] No "Method not found" errors

---

## Phase 2: Basic Browser Operations

### 2.1 Browser Initialization Test
**Prompt for Claude Code CLI:**
```
Use the puppeteer-real-browser MCP server to:
1. Initialize a browser in headless mode
2. Verify the browser started successfully
3. Show any Chrome path detection messages

Test both headless=true and headless=false modes if possible.
```

**Expected Results:**
- [ ] Browser initializes without errors
- [ ] Chrome path is auto-detected and logged to stderr (not stdout)
- [ ] Success message indicates "anti-detection features" enabled
- [ ] Both headless modes work

### 2.2 Simple Navigation Test
**Prompt for Claude Code CLI:**
```
Use the puppeteer-real-browser MCP server to:
1. Initialize a browser (headless mode)
2. Navigate to https://example.com
3. Take a screenshot of the page
4. Get the page title or content
5. Close the browser

Verify each step completes successfully.
```

**Expected Results:**
- [ ] Navigation completes without "frame detached" errors
- [ ] Screenshot is captured successfully (base64 image returned)
- [ ] Page content is retrieved
- [ ] Browser closes cleanly
- [ ] No session-related errors

---

## Phase 3: Error Recovery Testing

### 3.1 Original Failing Scenario Test
**Prompt for Claude Code CLI:**
```
Test the original failing scenario that caused errors:
1. Initialize a browser (non-headless mode)
2. Navigate to https://www.cursor.com/dashboard
3. Take a screenshot
4. Close the browser

This scenario previously caused "Navigating frame was detached", "Maximum call stack size exceeded", and screenshot session errors. Verify the retry mechanism and stack overflow protection works.
```

**Expected Results:**
- [ ] Navigation succeeds (with or without retries)
- [ ] Screenshot captures successfully
- [ ] No "Session closed" errors
- [ ] No "Maximum call stack size exceeded" errors
- [ ] Retry mechanism engages if needed (check logs)
- [ ] Browser recovery works if session fails
- [ ] Circuit breaker prevents infinite loops

### 3.2 Complex Navigation Test
**Prompt for Claude Code CLI:**
```
Test complex browser operations that may trigger retry logic:
1. Initialize browser
2. Navigate to https://httpbin.org/delay/2 (slow loading page)
3. Wait for the page to load
4. Take a full-page screenshot
5. Navigate to https://httpbin.org/status/200
6. Take another screenshot
7. Close browser

Monitor for any retry attempts or error recovery.
```

**Expected Results:**
- [ ] Handles slow-loading pages correctly
- [ ] Multiple navigations work without session loss
- [ ] Screenshots work after navigation changes
- [ ] No frame detachment errors
- [ ] Proper timeout handling

---

## Phase 4: Advanced Features Testing

### 4.1 Random Scroll Test
**Prompt for Claude Code CLI:**
```
Test the random scroll stealth feature:
1. Initialize browser (non-headless)
2. Navigate to https://example.com
3. Use random_scroll to simulate natural scrolling
4. Take a screenshot to verify actions
5. Close browser
```

**Expected Results:**
- [ ] Random scroll executes with timing variations
- [ ] No bot detection triggers
- [ ] Scrolling appears natural

### 4.2 Error Handling Categories Test
**Prompt for Claude Code CLI:**
```
Test the error categorization system by attempting operations that may fail:
1. Try to click on a non-existent element
2. Try to navigate to an invalid URL
3. Try to take a screenshot after browser is closed
4. Try to interact with elements before page loads

Verify that different error types are handled appropriately.
```

**Expected Results:**
- [ ] "Element not found" errors are categorized correctly
- [ ] Navigation errors are handled with retries
- [ ] Session errors trigger browser recovery
- [ ] Helpful error messages are provided
- [ ] No undefined or generic errors

---

## Phase 5: Performance and Reliability Testing

### 5.1 Session Management Test
**Prompt for Claude Code CLI:**
```
Test session validation and recovery:
1. Initialize browser
2. Navigate to https://example.com
3. Take a screenshot
4. Simulate session loss (if possible) or continue with multiple operations
5. Navigate to https://httpbin.org/get
6. Take another screenshot
7. Get page content
8. Close browser

Monitor for session validation checks and automatic recovery.
```

**Expected Results:**
- [ ] Session validation occurs before operations
- [ ] Invalid sessions are detected and recovered
- [ ] Multiple operations maintain session integrity
- [ ] No unexpected session terminations

### 5.2 Cross-Platform Chrome Detection Test
**Prompt for Claude Code CLI:**
```
Test Chrome path detection and custom configuration:
1. Initialize browser with default settings (auto-detect Chrome)
2. Show the detected Chrome path in the logs
3. If possible, test with custom Chrome path configuration
4. Verify browser launches successfully with detected path

Report the detected Chrome path and any detection issues.
```

**Expected Results:**
- [ ] Chrome path is detected automatically
- [ ] Detection works for current platform
- [ ] Path is logged to stderr (not stdout)
- [ ] Browser launches with detected executable
- [ ] Custom paths work if specified

---

## Phase 6: Integration and Compatibility Testing

### 6.1 MCP Protocol Compliance Test
**Prompt for Claude Code CLI:**
```
Verify MCP protocol compliance:
1. Check that resources/list returns empty array (not "Method not found")
2. Check that prompts/list returns empty array (not "Method not found")
3. Verify tools/list returns all expected tools
4. Test that all JSON-RPC responses are valid
5. Confirm no non-JSON output pollutes the protocol stream
```

**Expected Results:**
- [ ] resources/list returns `{"resources": []}`
- [ ] prompts/list returns `{"prompts": []}`
- [ ] tools/list returns array of 11 tools
- [ ] All responses are valid JSON-RPC 2.0
- [ ] No stdout pollution with non-JSON content

### 6.2 Claude Code CLI Integration Test
**Prompt for Claude Code CLI:**
```
Test full integration with Claude Code CLI features:
1. Use the /mcp command to check server status
2. Ask Claude to "use puppeteer to browse to google.com and describe what you see"
3. Request multiple browser operations in sequence
4. Test error recovery during interactive use
5. Verify all tools are accessible through natural language requests
```

**Expected Results:**
- [ ] MCP server responds to /mcp command
- [ ] Natural language requests map to correct tools
- [ ] Sequential operations work smoothly
- [ ] Error recovery is transparent to user
- [ ] All browser tools are accessible via Claude Code

---

## Phase 7: Edge Cases and Stress Testing

### 7.1 Rapid Operations Test
**Prompt for Claude Code CLI:**
```
Test rapid sequential operations:
1. Initialize browser
2. Rapidly navigate between 3-5 different websites
3. Take screenshots at each site
4. Get content from each page
5. Close browser

Monitor for race conditions, session issues, or timing problems.
```

**Expected Results:**
- [ ] Rapid operations complete successfully
- [ ] No race conditions or timing issues
- [ ] Session remains stable throughout
- [ ] All screenshots and content captured
- [ ] No resource leaks or hanging processes

### 7.2 Long-Running Session Test
**Prompt for Claude Code CLI:**
```
Test long-running browser session:
1. Initialize browser
2. Perform 10+ navigation and screenshot operations over several minutes
3. Test various wait conditions and timeouts
4. Verify session remains active throughout
5. Close browser after extended use

Monitor for memory leaks, session timeouts, or degraded performance.
```

**Expected Results:**
- [ ] Session remains stable over time
- [ ] No memory leaks or resource buildup
- [ ] Performance remains consistent
- [ ] All operations complete successfully
- [ ] Clean browser shutdown after extended use

---

## 🔍 Detailed Verification Prompts

### Complete End-to-End Test
**Copy and paste this exact prompt into Claude Code CLI:**

```
I need you to perform a comprehensive test of the puppeteer-real-browser MCP server. Please execute the following test sequence and report on each step:

PHASE 1 - Basic Setup:
1. Check MCP server status with /mcp command
2. List all available puppeteer-real-browser tools
3. Verify server is connected and responsive

PHASE 2 - Browser Lifecycle:
1. Initialize browser in headless mode
2. Navigate to https://example.com
3. Take a screenshot
4. Get the page content/title
5. Close the browser
Report any errors and verify clean execution.

PHASE 3 - Error Recovery (Original Failing Scenario):
1. Initialize browser (non-headless if possible)
2. Navigate to https://www.cursor.com/dashboard
3. Take a screenshot (this previously failed with "frame detached" errors)
4. Close browser
Monitor for retry attempts and recovery mechanisms.

PHASE 4 - Advanced Features:
1. Initialize browser
2. Navigate to https://httpbin.org/forms/post
3. Use type to fill in a form field
4. Use click to click elements
5. Use random_scroll to simulate natural behavior
6. Take final screenshot
7. Close browser

PHASE 5 - Protocol Compliance:
1. Verify resources/list returns empty array (not "Method not found")
2. Verify prompts/list returns empty array (not "Method not found")
3. Confirm all responses are valid JSON-RPC
4. Check for any stdout pollution or protocol violations

Please provide detailed results for each phase, including:
- Success/failure status
- Any error messages encountered
- Evidence of retry mechanisms working
- Performance observations
- Any unexpected behavior

Report the overall health status of the MCP server and whether it's ready for production use.
```

### Quick Smoke Test
**For rapid verification:**

```
Perform a quick smoke test of the puppeteer-real-browser MCP server:

1. Check server is connected with /mcp
2. Initialize browser (headless mode)
3. Navigate to https://example.com  
4. Take screenshot
5. Close browser

Report if all steps complete successfully and note any errors or issues. This should take under 30 seconds to complete.
```

---

## 📊 Success Criteria Checklist

### Critical Requirements (Must Pass)
- [ ] Server connects and responds to MCP commands
- [ ] Browser initialization works consistently
- [ ] Navigation completes without frame detachment errors
- [ ] Screenshots capture successfully after navigation
- [ ] Browser closes cleanly without hanging processes
- [ ] No "Method not found" errors for resources/list or prompts/list
- [ ] JSON-RPC protocol compliance maintained
- [ ] Retry mechanisms engage when needed
- [ ] Session validation and recovery works
- [ ] No "Maximum call stack size exceeded" errors occur
- [ ] Circuit breaker prevents infinite recursion
- [ ] Timeout controls prevent hanging operations

### Performance Requirements
- [ ] Browser initialization under 10 seconds
- [ ] Navigation completes within reasonable timeouts
- [ ] Screenshot capture under 5 seconds
- [ ] Error recovery within 3 retry attempts
- [ ] No memory leaks during extended use

### Compatibility Requirements
- [ ] Works with Claude Code CLI
- [ ] Chrome auto-detection functions
- [ ] Cross-platform path resolution
- [ ] MCP Inspector compatibility
- [ ] JSON protocol stream cleanliness

---

## 🚨 Common Issues and Troubleshooting

### If Tests Fail

1. **Server Not Recognized:**
   - Check `.mcp.json` configuration
   - Rebuild with `npm run build`
   - Restart Claude Code CLI

2. **Browser Initialization Fails:**
   - Verify Chrome installation
   - Check Chrome path detection logs
   - Test with custom Chrome path

3. **Navigation Errors:**
   - Monitor retry attempts in logs
   - Check network connectivity
   - Verify URL accessibility

4. **Screenshot Failures:**
   - Ensure browser session is valid
   - Check for timing issues
   - Verify page load completion

5. **Protocol Errors:**
   - Check for stdout pollution
   - Verify JSON-RPC format
   - Monitor stderr logs

### Debug Commands
```bash
# Check server logs
npm run dev

# Test with MCP Inspector
npx @modelcontextprotocol/inspector node dist/index.js

# Run Jest tests
npm test

# Check environment and Chrome detection
npm run test:debug
```

---

## 📝 Test Result Documentation

After running tests, document results using this template:

```markdown
## Test Execution Report - [Date]

### Environment
- OS: [Operating System]
- Node.js: [Version]
- Claude Code CLI: [Version]
- Chrome: [Version and Path]

### Test Results
- Phase 1 (Basic Protocol): ✅/❌
- Phase 2 (Browser Operations): ✅/❌
- Phase 3 (Error Recovery): ✅/❌
- Phase 4 (Advanced Features): ✅/❌
- Phase 5 (Performance): ✅/❌
- Phase 6 (Integration): ✅/❌
- Phase 7 (Edge Cases): ✅/❌

### Issues Found
[List any failures or unexpected behavior]

### Performance Metrics
- Average browser init time: [X seconds]
- Average navigation time: [X seconds]
- Average screenshot time: [X seconds]
- Retry attempts observed: [X]

### Recommendations
[Any suggested improvements or fixes]

### Overall Status
✅ READY FOR PRODUCTION / ❌ NEEDS FIXES
```

---

## 🎯 Quick Reference

### Essential Test Commands
```bash
# Check MCP status
echo "/mcp" | claude

# Basic functionality test
echo "Use puppeteer-real-browser to navigate to example.com and take a screenshot" | claude

# Original error scenario
echo "Use puppeteer-real-browser to navigate to cursor.com/dashboard and screenshot (test retry logic)" | claude

# Error recovery test
echo "Test puppeteer-real-browser error handling by clicking non-existent elements" | claude
```

This checklist ensures comprehensive testing coverage and provides you with detailed procedures for validating your MCP server's functionality through Claude Code CLI. Save this document and use it for regression testing, pre-release validation, and ongoing development verification.