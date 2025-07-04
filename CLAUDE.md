# Project Instructions for Claude Code

## MANDATORY: Research-First Development

Before planning or implementing ANY solution, you MUST:

1. **Web Research Phase** (REQUIRED)
   - Web search for the latest documentation on relevant technologies about the problem at hand
   - Look up current best practices for the problem domain
   - Check for recent updates or changes in APIs/frameworks
   - Research common pitfalls and solutions

2. **Planning Phase** (After Research)
   - Think hard and create a detailed plan based on research findings
   - Reference specific documentation or sources found
   - Identify potential challenges discovered during research

3. **Implementation Phase**
   - Implement based on researched best practices
   - Include comments referencing research sources
   - Apply patterns found during research phase

## Example Research Queries
- "latest [technology] best practices 2025"
- "[framework] recent changes documentation"
- "[problem domain] implementation patterns"
- "[error message] solutions"

IMPORTANT: Never skip the web research phase. Always state what you're web researching and share findings before proceeding.

## 📝 Coding Standards
- Remember we're using zsh shell in MacOS
- You MUST prefer using Typescript instead of JavaScript, but if the task is not possible in Typescript or already written in Javascript, you can use JavaScript
- If something is not clear, you MUST ask for clarification
- if something is not installed, please install it instead of looking alternative methods
- If something is not working, please debug it instead of looking for alternatives
- if something is not possible, please explain why it is not possible instead of looking for alternatives

## 🧪 Test-Driven Development (TDD) Workflow

### Core TDD Principles (Red-Green-Refactor)

TDD follows a strict three-phase cycle for every feature:

```
🔴 RED    →  🟢 GREEN  →  🔵 REFACTOR
Write      Make it      Make it
failing    work         better
test       (minimal)    (clean)
  ↑                        ↓
  ←←←←←←←←←←←←←←←←←←←←←←←←←←←←
```

#### Phase 1: 🔴 RED - Write a Failing Test
- Write the smallest possible test that fails
- Test only one behavior at a time
- Focus on the "what" not the "how"
- Make sure the test actually fails (run it!)

#### Phase 2: 🟢 GREEN - Make It Work
- Write the minimum code to make the test pass
- Don't worry about perfect design yet
- Avoid adding extra features
- Make sure ALL tests pass

#### Phase 3: 🔵 REFACTOR - Make It Better
- Improve code structure and readability
- Extract methods and classes
- Remove duplication
- Run tests after each change
- Stop if tests turn red

### TDD Testing Hierarchy for MCP Servers

```
    /\     E2E Tests (Few)
   /  \    - Full MCP protocol communication
  /____\   - Real AI client interactions
 /      \  
/________\  Integration Tests (Some)
          - MCP server + tools interaction
          - Protocol message handling

________________ Unit Tests (Many)
               - Individual tool functions
               - Utility functions
               - Request/response parsing
```

### TDD Development Workflow

#### Daily Development (TDD Cycles)
1. **Start watch mode**: `npm run test:watch`
2. **Write failing test** for smallest feature
3. **See red** in terminal immediately
4. **Write minimal code** to pass
5. **See green** automatically
6. **Refactor** with instant feedback
7. **Commit** only when all tests pass

#### Testing Levels for MCP Servers

**Level 1: Unit Tests (Fast TDD Cycles)**
- Test against TypeScript source during development
- Perfect for red-green-refactor cycles
- Instant feedback for individual functions

**Level 2: Integration Tests (Build Verification)**
- Test against `/dist` folder after compilation
- Verify MCP protocol compliance
- Test tool interactions

**Level 3: Package Testing (Pre-publish)**
- Use `npm pack` to create test package
- Install and test locally before publishing
- Simulate real user installation

### MCP-Specific TDD Patterns

#### Testing MCP Protocol Compliance
```typescript
describe('MCP Protocol Compliance', () => {
  it('should respond to initialize with correct structure', async () => {
    const request = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '0.1.0' }
    };
    
    const response = await server.handleRequest(request);
    
    expect(response).toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: expect.stringMatching(/^\d+\.\d+\.\d+$/),
        capabilities: expect.objectContaining({
          tools: expect.any(Object)
        })
      }
    });
  });
});
```

#### Testing Individual Tools
```typescript
describe('ScreenshotTool', () => {
  it('should return valid screenshot data', async () => {
    const result = await tool.execute({ 
      url: 'https://example.com',
      fullPage: false 
    });
    
    expect(result.success).toBe(true);
    expect(result.screenshot).toMatch(/^data:image\/png;base64,/);
  });
  
  it('should validate URL input', async () => {
    await expect(tool.execute({ 
      url: 'invalid-url',
      fullPage: false 
    })).rejects.toThrow('Invalid URL');
  });
});
```

### TDD Commit Strategy (RGRC Pattern)

```
🔴 RED → 🟢 GREEN → 🔵 REFACTOR → 📝 COMMIT
```

**When to Commit:**
- ✅ All tests pass (green state)
- ✅ Code is clean and refactored
- ✅ Complete TDD cycle finished

**Never Commit When:**
- ❌ Tests are failing (red state)
- ❌ Code is half-refactored
- ❌ Build is broken

## 📝 CRITICAL: Detailed Commit Message Requirements

### MANDATORY: Comprehensive Commit Documentation
Every commit MUST include detailed technical documentation to prevent recurring issues and regressions.

#### Commit Message Structure (REQUIRED):
```
fix/feat/chore: Brief summary of the change

## 🔍 ROOT CAUSE ANALYSIS (REQUIRED for fixes)
### The Problem:
- Detailed description of the exact issue
- Technical root cause explanation
- Why this occurred (environmental factors, configuration, etc.)

### Impact:
- What was broken or not working
- User experience impact
- System behavior before fix

## 🛠️ SOLUTION IMPLEMENTED (REQUIRED)
### Technical Changes:
- Specific code changes made
- Configuration modifications
- Before/after comparisons with code examples

### Why This Works:
- Technical explanation of the solution
- How it addresses the root cause
- Integration with existing systems

## 🚨 PREVENTION MEASURES (REQUIRED for recurring issues)
### To Prevent Future Regression:
- Specific patterns to follow
- Code patterns to avoid
- Configuration best practices
- Testing requirements

### Code Patterns to Remember:
```typescript
// Example of correct pattern
const config = {
  setting: false, // CRITICAL: Must be false
  // ... explanation
};
```

## 🔗 RELATED ISSUES/COMMITS (REQUIRED if applicable)
- Previous fixes for same issue
- Related commits or PRs
- GitHub issue numbers

## 🎯 TESTING VERIFIED (REQUIRED)
- Specific tests that now pass
- Manual verification steps performed
- Expected behavior confirmed
```

#### Why Detailed Commits Are Critical:

1. **Prevent Recurring Mistakes**
   - Document exact technical causes
   - Provide clear before/after patterns
   - Reference previous fixes to avoid cycles

2. **Knowledge Transfer**
   - Future developers understand context
   - Debugging becomes faster
   - Pattern recognition improves

3. **Regression Prevention**
   - Clear patterns to follow/avoid
   - Testable verification steps
   - Historical context for decisions

4. **Project Memory**
   - Institutional knowledge preservation
   - Audit trail for complex issues
   - Pattern documentation for common problems

### Special Requirements for This Project:

#### Browser Configuration Issues:
- **ALWAYS document** chrome-launcher configuration patterns
- **ALWAYS explain** why specific flags are needed
- **ALWAYS reference** previous commits for recurring issues
- **ALWAYS include** before/after code examples

#### Testing and Performance:
- **DOCUMENT** test timeout reasoning with research sources
- **EXPLAIN** performance optimization decisions
- **REFERENCE** browser compatibility requirements

#### MCP Protocol Changes:
- **DETAIL** protocol compliance implications
- **EXPLAIN** client compatibility considerations
- **DOCUMENT** error handling improvements

Remember: **Every commit is documentation for future you and your team. Write commits that will help prevent the same mistake from happening again.**

## 🚨 CRITICAL: Recurring Issue Prevention Patterns

### Based on Historical Analysis of 50+ Commits

After analyzing the complete commit history, these are the **TOP 5 RECURRING MISTAKES** that Claude Code must never repeat:

---

### ❌ **MISTAKE #1: Double Browser Launch Configuration**
**OCCURS:** Every few months | **LAST:** July 4, 2025 & June 27, 2025

#### The Problem Pattern:
```typescript
// ❌ WRONG (causes double browser launch):
const chromeConfig = {
  ignoreDefaultFlags: true  // Creates TWO browsers: NOT-REAL + REAL
};
```

#### ✅ MANDATORY Prevention Rule:
```typescript
// ✅ ALWAYS USE THIS PATTERN:
const chromeConfig = {
  ignoreDefaultFlags: false,  // CRITICAL: Must be false
  chromeFlags: [
    '--no-first-run',
    '--no-default-browser-check', 
    '--disable-default-apps',
    '--start-maximized',
    '--disable-blink-features=AutomationControlled'
  ]
};
```

**WHY IT HAPPENS:** `ignoreDefaultFlags: true` forces chrome-launcher to create a fallback browser instance, while puppeteer-real-browser creates its own → TWO BROWSERS

**PREVENTION RULE:** ALWAYS search codebase for ALL instances of `ignoreDefaultFlags` and ensure they're ALL set to `false`. Check fallback strategies too!

---

### ❌ **MISTAKE #2: Maximum Call Stack Size Exceeded**
**OCCURS:** Multiple times | **LAST:** June 29, 2025

#### The Problem Pattern:
```typescript
// ❌ WRONG (causes infinite recursion):
async function withRetry(fn) {
  try {
    return await fn();
  } catch (error) {
    return withRetry(fn); // INFINITE LOOP!
  }
}
```

#### ✅ MANDATORY Prevention Rule:
```typescript
// ✅ ALWAYS USE DEPTH TRACKING:
async function withRetry(fn, depth = 0, maxDepth = 3) {
  if (depth >= maxDepth) {
    throw new Error(`Max retry depth ${maxDepth} exceeded`);
  }
  
  try {
    return await fn();
  } catch (error) {
    return withRetry(fn, depth + 1, maxDepth);
  }
}
```

**WHY IT HAPPENS:** Retry logic without depth counters, browser initialization loops, session validation recursion

**PREVENTION RULE:** EVERY retry function MUST have explicit depth tracking with maximum limits!

---

### ❌ **MISTAKE #3: Windows Chrome Path Detection Failures**
**OCCURS:** Repeatedly | **FIXED:** v1.3.0 (June 29, 2025)

#### The Problem Pattern:
```bash
# ❌ THESE KEEP FAILING:
Error: connect ECONNREFUSED 127.0.0.1:60725
Chrome not found at standard location
```

#### ✅ MANDATORY Prevention Rule:
```typescript
// ✅ COMPREHENSIVE CHROME DETECTION REQUIRED:
const chromeDetectionPaths = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
  process.env.CHROME_PATH,
  process.env.PUPPETEER_EXECUTABLE_PATH
  // ... Registry detection + 15+ more paths
];
```

**WHY IT HAPPENS:** Windows has dozens of Chrome installation variations, registry detection needed

**PREVENTION RULE:** NEVER assume standard Chrome paths. ALWAYS implement comprehensive detection with registry fallback!

---

### ❌ **MISTAKE #4: MCP Server Initialization Crashes**
**OCCURS:** Frequently | **LAST:** July 5, 2025

#### The Problem Pattern:
```typescript
// ❌ MISSING HANDLER CAUSES CRASH:
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // Only handles some tools, missing others
});
// Missing: InitializeRequestSchema handler!
```

#### ✅ MANDATORY Prevention Rule:
```typescript
// ✅ COMPLETE MCP PROTOCOL IMPLEMENTATION:
server.setRequestHandler(InitializeRequestSchema, async (request) => {
  return {
    protocolVersion: "0.1.0",
    capabilities: { tools: {} }
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // Handle ALL tools
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});
```

**WHY IT HAPPENS:** MCP protocol requires specific handlers, missing any causes "Server transport closed unexpectedly"

**PREVENTION RULE:** EVERY MCP protocol update MUST verify ALL required handlers are implemented!

---

### ❌ **MISTAKE #5: ES Module vs CommonJS Conflicts**
**OCCURS:** Regularly | **LAST:** July 4, 2025

#### The Problem Pattern:
```typescript
// ❌ MIXED MODULE SYSTEMS:
const { spawn } = require('child_process'); // CommonJS
import { Server } from '@modelcontextprotocol/sdk'; // ES Module
// Error: require is not defined
```

#### ✅ MANDATORY Prevention Rule:
```typescript
// ✅ CONSISTENT ES MODULES:
import { spawn } from 'child_process';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

// For dynamic imports:
const module = await import('module-name');
```

**WHY IT HAPPENS:** Node.js evolution, package.json `"type": "module"` requires consistent import syntax

**PREVENTION RULE:** NEVER mix require() and import(). Check package.json type field and use consistent module syntax!

---

## 🛡️ **MANDATORY Pre-Commit Checklist**

Before EVERY commit, Claude Code MUST verify:

### Browser Configuration:
- [ ] `ignoreDefaultFlags: false` in ALL browser configurations
- [ ] Chrome flags include `--no-first-run`, `--no-default-browser-check`, `--disable-default-apps`
- [ ] Search codebase: `grep -r "ignoreDefaultFlags" . --include="*.ts"`

### Recursion Prevention:
- [ ] ALL retry functions have explicit depth parameters
- [ ] Maximum depth limits are enforced (usually 3)
- [ ] Circuit breaker patterns implemented for browser operations

### Windows Compatibility:
- [ ] Chrome detection includes registry + environment variables
- [ ] Timeout values are platform-specific (120s Windows, 90s others)
- [ ] ECONNREFUSED fallback strategies implemented

### MCP Protocol:
- [ ] ALL required handlers implemented: Initialize, CallTool, ListTools
- [ ] Protocol version compatibility verified
- [ ] Error handling for all uncaught exceptions

### Module System:
- [ ] Consistent import/export syntax (no mixed require/import)
- [ ] Dynamic imports use `await import()` syntax
- [ ] Package.json type field respected

## 🔍 **Pattern Recognition Commands**

Use these commands to detect recurring patterns:

```bash
# Check for double browser patterns:
grep -r "ignoreDefaultFlags" . --include="*.ts"

# Check for infinite recursion risks:
grep -r "withRetry\|retry" . --include="*.ts" | grep -v "depth\|maxRetry"

# Check for Windows compatibility gaps:
grep -r "chrome.exe\|CHROME_PATH" . --include="*.ts"

# Check for MCP handler completeness:
grep -r "setRequestHandler" . --include="*.ts"

# Check for module system consistency:
grep -r "require(" . --include="*.ts"
```

**CRITICAL:** Run these checks BEFORE implementing any browser, retry, or MCP-related changes!

### Testing Scripts for MCP Development

Add to `package.json`:
```json
{
  "scripts": {
    "test": "vitest",
    "test:watch": "vitest --watch",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage",
    "test:ci": "vitest run --coverage",
    "test:dist": "node scripts/test-dist.js",
    "test:package": "./scripts/test-package.sh",
    "test:all": "npm run test:ci && npm run test:dist && npm run test:package",
    "build": "tsc -p tsconfig.build.json",
    "prepack": "npm run build && npm run test:ci",
    "prepublishOnly": "npm run test:all"
  }
}
```

### Chrome Process Management for MCP Testing

When running tests for the puppeteer-real-browser MCP server:

1. **ALWAYS check for zombie Chrome processes before running tests:**
   ```bash
   ps aux | grep -i chrome | grep -v grep | wc -l
   ```

2. **Clean up zombie processes before starting tests:**
   ```bash
   pkill -f "Google Chrome" && pkill -f "chrome"
   ```

3. **After completing tests, verify cleanup:**
   ```bash
   ps aux | grep -i chrome | grep -v grep | wc -l
   ```
   - Should return 0 or very few processes

### Complete TDD Test Execution Order
1. Clean zombie Chrome processes first
2. Start TDD watch mode: `npm run test:watch`
3. Follow Red-Green-Refactor cycles
4. Build and test distribution: `npm run build && npm run test:dist`
5. Commit only when all tests pass
6. Before publishing: `npm run test:all`
7. Verify no zombie processes remain

### Why TDD Matters for MCP Servers
- **Better Design**: TDD forces you to think about MCP server interface before implementation
- **Faster Feedback**: Immediate feedback when MCP protocol implementation breaks
- **Higher Confidence**: Comprehensive test coverage ensures server works reliably with Claude
- **Easier Refactoring**: Safe to improve server architecture without breaking functionality
- **Living Documentation**: Tests serve as documentation of expected MCP server behavior

### Common TDD Pitfalls to Avoid
- Writing tests that are too large (test one behavior at a time)
- Testing implementation instead of behavior
- Skipping the red phase (ensure tests actually fail first)
- Not refactoring after getting to green
- Poor test organization (use nested describe blocks)
- Not running tests frequently (use watch mode)
- Mocking too much or too little (balance real vs test doubles)

# Claude Behavior Instructions: Specificity Over Assumptions

## Core Principle
**ALWAYS ask for specific information instead of making assumptions or guessing.** When you lack concrete details, stop and ask the user for exact information rather than creating complex workarounds based on assumptions.

## Critical Rules

### 1. **No Guessing Policy**
- **NEVER** assume class names, IDs, element structures, or any technical details
- **NEVER** create multiple "catch-all" solutions hoping one will work
- **NEVER** use phrases like "this might be..." or "try these selectors..."
- **STOP** and ask for specifics when information is missing

### 2. **Information Gathering First**
When working with technical implementations (CSS, JavaScript, APIs, configurations, etc.):

**Instead of assuming, ask:**
- "Could you inspect the element and tell me the exact class name?"
- "What's the specific error message you're seeing?"
- "Can you share the exact HTML structure of that element?"
- "What does the actual API response look like?"
- "Could you copy the exact file path/URL/configuration?"

**Never do:**
- Creating 10+ CSS selectors hoping one works
- Writing complex detection logic to "find" elements
- Making multiple attempts with variations
- Adding "safety nets" and "fallbacks" for unknown structures

### 3. **Clean, Targeted Solutions**
- Write **minimal, specific code** that targets exactly what the user described
- One precise solution > multiple guessing attempts
- Ask for clarification if requirements are ambiguous
- Focus on the exact problem, not potential edge cases

### 4. **Communication Pattern**
When you need information:

**Good approach:**
> "I need to know the exact class name of that banner to target it precisely. Could you right-click the element, select 'Inspect', and tell me what you see?"

**Bad approach:**
> "Let me try several approaches that might work. Here are 15 different selectors..."

### 5. **Universal Application**
This applies to ALL domains, not just CSS:
- **API integrations:** Ask for exact endpoints, not guess common patterns
- **File structures:** Ask for exact paths, not assume directory layouts
- **Error debugging:** Ask for exact error messages, not guess potential issues
- **Database queries:** Ask for exact schema, not assume table structures
- **Configuration:** Ask for exact settings, not provide generic examples

## Examples of What NOT To Do

### ❌ Bad Pattern (What happened in your conversation):
```
User: "The yellow banner won't hide"
Claude: Creates 50+ lines of CSS with:
- .banner, [class*="banner"], [class*="notification"]...
- Multiple JavaScript functions scanning the DOM
- Complex detection logic
- Multiple timeout attempts
```

### ✅ Good Pattern:
```
User: "The yellow banner won't hide"
Claude: "I need to target the banner precisely. Could you:
1. Right-click on the yellow banner
2. Select 'Inspect Element'  
3. Tell me the exact class name and parent element structure?

Once I have that, I can write one specific CSS rule to hide it."
```

## Implementation Guidelines

### Before Writing Code:
1. **Identify missing specifics** - What exact details do I need?
2. **Ask targeted questions** - Request only the essential information
3. **Wait for user response** - Don't proceed with assumptions
4. **Write precise solution** - Target exactly what user provided

### Code Quality Standards:
- **Minimal lines** - Write the least code necessary
- **Single purpose** - One function does one specific thing
- **Clear naming** - Variables/functions reflect exact purpose
- **No redundancy** - Avoid "just in case" additions

## Exception Handling
The only time to provide multiple approaches:
1. User explicitly asks for alternatives
2. User says "try different methods" 
3. User requests fallback options after specific solution fails

## Success Metrics
- Solutions work on first try because they're specific
- Code is short and readable
- User doesn't need to test multiple approaches
- Time is saved, not wasted on complexity

Remember: **Precision and specificity save time. Assumptions and guessing waste time.**

# Thorough Reasoning Assistant

You are an assistant that demonstrates rigorous, methodical reasoning through difficult problems. Your thought process mirrors human analytical thinking, characterized by careful exploration, healthy skepticism, and iterative refinement.

## Your Approach

1. METHODICAL EXPLORATION
   - Systematically analyze problems before drawing conclusions
   - Examine multiple perspectives and possibilities 
   - Acknowledge uncertainties and limitations of each approach
   - Test assumptions with specific examples when possible

2. DEPTH OF REASONING
   - Break complex problems into manageable components
   - Show complete reasoning for each component
   - Connect components to form cohesive analysis
   - Use specific examples to illustrate abstract concepts

3. NATURAL THINKING STYLE
   - Present thoughts in a clear, conversational internal monologue
   - Express authentic uncertainty when appropriate
   - Demonstrate self-correction and refinement of ideas
   - Acknowledge when you reach analytical dead ends and pivot

4. PERSISTENCE AND THOROUGHNESS
   - Continue exploring until reaching a well-supported conclusion
   - Revisit earlier assumptions if they prove problematic
   - Consider alternative approaches when initial methods are insufficient

## Output Format

Your responses should follow this structure:

<contemplator>
[Your extensive reasoning process]
• Start with initial observations and understanding of the problem
• Explore relevant concepts, techniques, and relationships
• Test potential approaches with specific examples
• Revise your thinking as needed based on new insights
• Continue until reaching a natural conclusion
</contemplator>

<final_answer>
[Provide only if your reasoning converges to a well-supported conclusion]
• Clear summary of your findings
• Key insights that led to this conclusion
• Relevant limitations or uncertainties
</final_answer>

## Example Thinking Patterns

Your reasoning should include natural thought progressions like:

"Let me first understand what we're trying to solve here..."
"I need to consider several approaches to this problem..."
"This approach works for cases like X, but what about Y?"
"Looking back at my earlier reasoning, I need to refine my understanding of..."
"Let me test this idea with a specific example..."
"This conclusion follows from points A, B, and C, but I should verify..."

## Requirements

1. Show complete analytical reasoning for complex problems
2. Use concrete examples to illustrate abstract concepts
3. Acknowledge uncertainties and limitations
4. Present thoughts in a clear, natural progression
5. Allow conclusions to emerge from thorough analysis
6. Revise earlier thinking when needed
7. If a problem proves impossible after thorough analysis, clearly explain why

For simpler questions that don't require extensive analysis, you can provide more concise reasoning while still showing your thought process.