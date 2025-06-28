# Comprehensive MCP Server Testing Plan for Claude Code

## Overview
This plan provides a detailed, step-by-step approach to test the puppeteer-real-browser MCP server through Claude Code CLI in a new session. It includes interactive test phases, debugging procedures, and additional test scenarios.

## Table of Contents
- [Pre-Testing Setup](#pre-testing-setup)
- [Phase 1: Basic MCP Protocol Testing](#phase-1-basic-mcp-protocol-testing)
- [Phase 2: Basic Browser Operations](#phase-2-basic-browser-operations)
- [Phase 3: Error Recovery Testing](#phase-3-error-recovery-testing)
- [Phase 4: Advanced Features Testing](#phase-4-advanced-features-testing)
- [Phase 5: Performance Testing](#phase-5-performance-testing)
- [Phase 6: Edge Cases and Stress Testing](#phase-6-edge-cases-and-stress-testing)
- [Debugging Procedures](#debugging-procedures)
- [Additional Test Scenarios](#additional-test-scenarios)
- [Test Documentation](#test-documentation)
- [Success Criteria](#success-criteria)
- [Next Steps](#next-steps-after-testing)

---

## Pre-Testing Setup

### 1. Environment Verification Checklist
- [ ] Ensure Claude Code CLI is installed: `claude --version`
- [ ] Navigate to project directory: `cd /Users/linda/Documents/DEV/puppeteer-real-browser-mcp-server`
- [ ] Check if project is built: `ls -la dist/index.js`
- [ ] Build the project if needed: `npx tsc`
- [ ] Verify test directory exists: `cd tests/mcp-testing`

### 2. Add MCP Server to Claude Code
```bash
# Option 1: Use the setup script
./setup-claude-code-server.sh

# Option 2: Manual setup
claude mcp remove puppeteer-test-server 2>/dev/null || true
claude mcp add puppeteer-test-server -- node /Users/linda/Documents/DEV/puppeteer-real-browser-mcp-server/dist/index.js
```

### 3. Verify Server Installation
- [ ] Run: `claude mcp list`
- [ ] Confirm `puppeteer-test-server` is listed
- [ ] Check details: `claude mcp get puppeteer-test-server`
- [ ] Note the server scope (should be "Local")

---

## Phase 1: Basic MCP Protocol Testing

### Test 1.1: Server Connection
**Steps:**
1. [ ] Start Claude Code: `claude`
2. [ ] Run command: `/mcp`
3. [ ] Look for `puppeteer-test-server` in the list
4. [ ] Verify status shows as "connected" ✅ or note if disconnected ❌

**Expected Results:**
- Server appears in MCP list
- Status indicates successful connection
- No error messages

**To Document:**
- Connection status
- Any error messages
- Time taken to connect

### Test 1.2: Tool Availability
**Steps:**
1. [ ] In Claude Code, type:
   ```
   @/Users/linda/Documents/DEV/puppeteer-real-browser-mcp-server/tests/mcp-testing/claude-prompts/test-all-tools.txt
   ```
2. [ ] Or manually type:
   ```
   Using the puppeteer-test-server MCP server, list all available tools with their descriptions.
   ```
3. [ ] Count the number of tools returned
4. [ ] Verify these 10 tools are present:
   - [ ] browser_init
   - [ ] navigate
   - [ ] screenshot
   - [ ] get_content
   - [ ] click
   - [ ] type
   - [ ] wait
   - [ ] browser_close
   - [ ] solve_captcha
   - [ ] random_scroll

**To Document:**
- Total number of tools found
- Any missing tools
- Tools with missing schemas or descriptions

### Test 1.3: Protocol Compliance
**Steps:**
1. [ ] Ask Claude: "Show me the full capabilities of the puppeteer-test-server MCP server"
2. [ ] Verify response includes:
   - [ ] Tools object (should have 10 tools)
   - [ ] Resources object (should be empty)
   - [ ] Prompts object (should be empty)
3. [ ] Check for any protocol errors or warnings

---

## Phase 2: Basic Browser Operations

### Test 2.1: Browser Initialization - Headless
**Steps:**
1. [ ] Type in Claude:
   ```
   Use the puppeteer-test-server MCP server to initialize a browser with headless: true
   ```
2. [ ] Note the response time
3. [ ] Look for:
   - [ ] Success confirmation
   - [ ] Chrome path detection message
   - [ ] Anti-detection features message

**To Document:**
- Initialization time
- Chrome path detected
- Any error messages

### Test 2.2: Browser Initialization - Non-Headless
**Steps:**
1. [ ] Type in Claude:
   ```
   Use the puppeteer-test-server MCP server to initialize a browser with headless: false
   ```
2. [ ] Verify a browser window opens (if on desktop)
3. [ ] Note any differences from headless mode

### Test 2.3: Complete Browser Lifecycle
**Steps:**
1. [ ] Use the test prompt:
   ```
   @/Users/linda/Documents/DEV/puppeteer-real-browser-mcp-server/tests/mcp-testing/claude-prompts/test-browser-lifecycle.txt
   ```
2. [ ] Or run these commands sequentially:
   ```
   1. Initialize a headless browser with puppeteer-test-server
   2. Navigate to https://example.com
   3. Take a screenshot
   4. Get the page title
   5. Navigate to https://httpbin.org/user-agent
   6. Get the page content
   7. Close the browser
   ```
3. [ ] Verify each step completes successfully

**Check for:**
- [ ] No "frame detached" errors
- [ ] Screenshot is captured (base64 string returned)
- [ ] Page content is retrieved
- [ ] Browser closes without errors

### Test 2.4: Multiple Navigation Test
**Steps:**
1. [ ] Initialize browser
2. [ ] Navigate to these sites in sequence:
   - [ ] https://example.com
   - [ ] https://httpbin.org/html
   - [ ] https://www.google.com
3. [ ] Take screenshot at each site
4. [ ] Close browser

**Monitor for:**
- Session stability
- Navigation timing
- Memory usage indicators

---

## Phase 3: Error Recovery Testing

### Test 3.1: Original Failing Scenario (cursor.com)
**Steps:**
1. [ ] Use test prompt:
   ```
   @/Users/linda/Documents/DEV/puppeteer-real-browser-mcp-server/tests/mcp-testing/claude-prompts/test-cursor-scenario.txt
   ```
2. [ ] Monitor Claude's response for:
   - [ ] Retry attempts mentioned
   - [ ] Frame detachment errors
   - [ ] Successful recovery
   - [ ] Screenshot capture status

**Critical Observations:**
- Does navigation succeed on first try?
- How many retries were needed?
- Was screenshot captured successfully?

### Test 3.2: Error Handling Tests
**Steps:**
1. [ ] Use test prompt:
   ```
   @/Users/linda/Documents/DEV/puppeteer-real-browser-mcp-server/tests/mcp-testing/claude-prompts/test-error-handling.txt
   ```
2. [ ] For each error test, note:
   - [ ] Error message clarity
   - [ ] Error category (if mentioned)
   - [ ] Whether retry was attempted
   - [ ] Recovery success

**Test Cases:**
- [ ] Click non-existent element
- [ ] Navigate to invalid URL
- [ ] Screenshot after browser close
- [ ] Type in non-existent field

### Test 3.3: Session Recovery
**Steps:**
1. [ ] Initialize browser
2. [ ] Perform rapid operations:
   ```
   Rapidly navigate between these URLs 10 times:
   - https://example.com
   - https://httpbin.org/get
   Take a screenshot after each navigation
   ```
3. [ ] Monitor for:
   - [ ] Session loss indicators
   - [ ] Automatic recovery messages
   - [ ] Operation failures

---

## Phase 4: Advanced Features Testing

### Test 4.1: Enhanced Interaction Actions
**Steps:**
1. [ ] Navigate to a form page:
   ```
   Navigate to https://httpbin.org/forms/post with puppeteer-test-server
   ```
2. [ ] Test standard typing:
   ```
   Use type to enter "Test User" in the custname field
   ```
3. [ ] Test standard clicking:
   ```
   Use click to click the submit button
   ```
4. [ ] Test random scrolling:
   ```
   Use random_scroll on the current page
   ```

**Observe:**
- [ ] Form interaction works correctly
- [ ] Button clicking functions properly
- [ ] Scrolling appears natural

### Test 4.2: Wait Conditions
**Steps:**
1. [ ] Test wait for selector:
   ```
   Navigate to https://httpbin.org/delay/2 and wait for the "pre" selector
   ```
2. [ ] Test wait timeout:
   ```
   Use wait with type "timeout" for 3000ms
   ```
3. [ ] Test wait for navigation:
   ```
   Start waiting for navigation, then navigate to a new page
   ```

**Document:**
- Actual wait times
- Timeout handling
- Success/failure of each wait type

### Test 4.3: Element-Specific Operations
**Steps:**
1. [ ] Get content from specific selector:
   ```
   Navigate to example.com and get text content from the h1 element
   ```
2. [ ] Take screenshot of specific element:
   ```
   Take a screenshot of just the h1 element on the page
   ```
3. [ ] Get HTML vs text content:
   ```
   Get both HTML and text content from the page body
   ```

---

## Phase 5: Performance Testing

### Test 5.1: Operation Timing
Create a timing log for:
1. [ ] Browser initialization times:
   - [ ] Headless mode: _____ ms
   - [ ] Non-headless mode: _____ ms
2. [ ] Navigation times:
   - [ ] Simple site (example.com): _____ ms
   - [ ] Complex site (google.com): _____ ms
   - [ ] Slow site (httpbin.org/delay/2): _____ ms
3. [ ] Screenshot times:
   - [ ] Viewport screenshot: _____ ms
   - [ ] Full page screenshot: _____ ms
   - [ ] Element screenshot: _____ ms

### Test 5.2: Long-Running Session
**Steps:**
1. [ ] Initialize browser
2. [ ] Set a timer for 5 minutes
3. [ ] Every 30 seconds:
   - [ ] Navigate to a different page
   - [ ] Take a screenshot
   - [ ] Get page content
4. [ ] After 5 minutes:
   - [ ] Check if all operations still work
   - [ ] Note any performance degradation
   - [ ] Close browser successfully

**Monitor:**
- Response time changes
- Memory usage indicators
- Session stability

---

## Phase 6: Edge Cases and Stress Testing

### Test 6.1: Rapid Sequential Operations
**Steps:**
1. [ ] Without delays, execute:
   ```
   Navigate to 5 different websites as fast as possible and take screenshots
   ```
2. [ ] Monitor for:
   - [ ] Race conditions
   - [ ] Dropped operations
   - [ ] Error accumulation

### Test 6.2: Resource-Intensive Operations
**Steps:**
1. [ ] Large page screenshot:
   ```
   Navigate to a long article page and take a full-page screenshot
   ```
2. [ ] Heavy JavaScript site:
   ```
   Navigate to a modern SPA (like github.com) and interact with dynamic elements
   ```
3. [ ] Multiple format requests:
   ```
   Get the same page as HTML, text, and screenshot simultaneously
   ```

### Test 6.3: Edge Case URLs
Test navigation to:
- [ ] `about:blank`
- [ ] `data:text/html,<h1>Test</h1>`
- [ ] Very long URL (1000+ characters)
- [ ] URL with special characters
- [ ] Redirecting URLs

---

## Debugging Procedures

### For Each Error Encountered:

#### Step 1: Document the Error
```markdown
## Error Report
- **Operation**: [What were you trying to do]
- **Command**: [Exact command used]
- **Error Message**: [Complete error text]
- **Timestamp**: [When it occurred]
- **Context**: [What happened before the error]
```

#### Step 2: Initial Troubleshooting
1. [ ] Retry the exact same operation
2. [ ] Check server status: `/mcp`
3. [ ] Look for server details: `claude mcp get puppeteer-test-server`

#### Step 3: Isolation Testing
1. [ ] Try a simpler version of the operation
2. [ ] Test with different parameters
3. [ ] Check if other operations still work

#### Step 4: Common Fixes
- [ ] **For connection errors**:
  ```bash
  # Exit Claude Code
  # Restart Claude Code
  claude
  /mcp
  ```
  
- [ ] **For tool errors**:
  ```bash
  # Remove and re-add server
  claude mcp remove puppeteer-test-server
  claude mcp add puppeteer-test-server -- node /path/to/dist/index.js
  ```
  
- [ ] **For persistent errors**:
  ```bash
  # Rebuild project
  cd /Users/linda/Documents/DEV/puppeteer-real-browser-mcp-server
  npx tsc
  # Then re-add server
  ```

#### Step 5: Advanced Debugging
1. [ ] Check Chrome installation:
   ```bash
   which chromium || which google-chrome || which chrome
   ```
2. [ ] Test server directly:
   ```bash
   node /Users/linda/Documents/DEV/puppeteer-real-browser-mcp-server/dist/index.js
   ```
3. [ ] Check for port conflicts or process issues

---

## Additional Test Scenarios

### Scenario 1: Form Interaction and Authentication
```
Test Case: Login Flow
1. Navigate to a demo login page (e.g., https://the-internet.herokuapp.com/login)
2. Use type to enter username: "tomsmith"
3. Use type to enter password: "SuperSecretPassword!"
4. Use click on the login button
5. Verify successful navigation to secure area
6. Take screenshot of logged-in state
```

### Scenario 2: Dynamic Content Handling
```
Test Case: AJAX Content Loading
1. Navigate to a page with lazy-loaded content
2. Scroll down to trigger content loading
3. Wait for new elements to appear
4. Interact with dynamically loaded elements
5. Verify content updates properly
```

### Scenario 3: File Download Handling
```
Test Case: Download Interaction
1. Navigate to https://the-internet.herokuapp.com/download
2. Click on a download link
3. Monitor for download initiation
4. Check how downloads are handled
```

### Scenario 4: Multi-Window/Tab Testing
```
Test Case: Multiple Contexts
1. Open main browser window
2. Trigger action that opens new window/tab
3. Try to interact with new window
4. Switch back to original window
5. Close specific windows
```

### Scenario 5: Cookie and Storage Testing
```
Test Case: State Persistence
1. Navigate to a site that sets cookies
2. Interact with localStorage/sessionStorage
3. Navigate away and return
4. Verify state persistence
```

---

## Test Documentation

### Test Session Template
Create a file `test-session-[date].md` with:

```markdown
# Test Session - [Date]

## Environment
- Claude Code Version: [version]
- OS: [your OS]
- Chrome Version: [if known]
- Project Version: [from package.json]

## Pre-Test Checklist
- [ ] Server built successfully
- [ ] Server added to Claude Code
- [ ] Initial /mcp check passed

## Test Results by Phase

### Phase 1: Protocol Testing
| Test | Result | Notes |
|------|--------|-------|
| Server Connection | ✅/❌ | [notes] |
| Tool Availability | ✅/❌ | [notes] |
| Protocol Compliance | ✅/❌ | [notes] |

### Phase 2: Browser Operations
[Similar table format]

### Phase 3: Error Recovery
[Similar table format]

### Phase 4: Advanced Features
[Similar table format]

### Phase 5: Performance
| Operation | Time | Notes |
|-----------|------|-------|
| Browser Init (headless) | X ms | [notes] |
| Navigate (simple) | X ms | [notes] |
| Screenshot (viewport) | X ms | [notes] |

### Phase 6: Edge Cases
[Results]

## Issues Found
1. **Issue**: [description]
   - **Severity**: High/Medium/Low
   - **Reproduction**: [steps]
   - **Error**: [message]
   - **Workaround**: [if any]

## Summary
- Total Tests: X
- Passed: X
- Failed: X
- Blocked: X

## Recommendations
1. [Recommendation 1]
2. [Recommendation 2]
```

---

## Success Criteria

### Must Pass (Critical)
- [ ] Server connects successfully in Claude Code
- [ ] All 10 tools are available and callable
- [ ] Basic browser initialization works
- [ ] Simple navigation succeeds
- [ ] Screenshots can be captured
- [ ] Browser closes cleanly
- [ ] Error messages are helpful and specific

### Should Pass (Important)
- [ ] Retry mechanisms engage for failures
- [ ] Session recovery works automatically
- [ ] Standard actions work reliably
- [ ] Complex navigation chains succeed
- [ ] Performance is acceptable (<5s for most operations)
- [ ] Chrome path auto-detection works

### Nice to Have (Optimal)
- [ ] No memory leaks in long sessions
- [ ] All edge cases handled gracefully
- [ ] Fast initialization (<2s)
- [ ] Minimal retry attempts needed
- [ ] Comprehensive error categorization
- [ ] Smooth handling of dynamic content

---

## Next Steps After Testing

### If All Critical Tests Pass ✅
1. **Clean up test environment**:
   ```bash
   claude mcp remove puppeteer-test-server
   ```
2. **Document successful configuration**:
   - Save working commands
   - Note any special requirements
   - Create user guide

3. **Prepare for production**:
   - Update .mcp.json if needed
   - Create README for other users
   - Set up monitoring

### If Tests Fail ❌
1. **Collect debugging information**:
   - All error messages
   - Failed test cases
   - System information

2. **Create issue reports**:
   ```markdown
   ## Issue: [Title]
   - **Test Phase**: [1-6]
   - **Operation**: [what failed]
   - **Expected**: [what should happen]
   - **Actual**: [what happened]
   - **Error**: [full error message]
   - **Steps to Reproduce**:
     1. [step 1]
     2. [step 2]
   ```

3. **Implement fixes**:
   - Fix identified issues
   - Rebuild project
   - Re-run failed tests only

### For Ongoing Testing
1. **Set up regression tests**:
   - Save successful test commands
   - Create automated test scripts
   - Schedule regular test runs

2. **Monitor production usage**:
   - Track error rates
   - Monitor performance
   - Collect user feedback

---

## Quick Reference Commands

### Essential Commands
```bash
# Add server
claude mcp add puppeteer-test-server -- node /path/to/dist/index.js

# Check status
claude mcp list
claude mcp get puppeteer-test-server

# Remove server
claude mcp remove puppeteer-test-server

# In Claude Code
/mcp  # Check all MCP servers
```

### Common Test Commands
```
# List tools
List all tools from puppeteer-test-server

# Basic test
Use puppeteer-test-server to navigate to example.com and take a screenshot

# Error test
Use puppeteer-test-server to click on #non-existent-element

# Performance test
Use puppeteer-test-server to navigate to 5 different sites rapidly
```

---

This comprehensive testing plan ensures thorough validation of the puppeteer-real-browser MCP server through Claude Code CLI. Follow the phases sequentially and document all results for effective debugging and improvement.