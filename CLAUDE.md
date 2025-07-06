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

## Dependencies and Browser Configuration

### Critical Browser Configuration
- **IMPORTANT: Avoid puppeteer-core and regular puppeteer**
- **MUST USE puppeteer-real-browser for all browser interactions**

### puppeteer-real-browser Insights
- Understand that puppeteer-real-browser is specifically designed for anti-detection and stealth operations, which is critical for this project
- It uses Rebrowser patches and has special features that regular Puppeteer doesn't have
- Key insights about puppeteer-real-browser:
  1. NOT regular Puppeteer - a specialized package with anti-detection features
  2. Uses Rebrowser patches to modify browser runtime behavior
  3. Has special mouse movement handling, CAPTCHA solving, and stealth features
  4. CDP (Chrome DevTools Protocol) approach perfect for bypassing detection methods
  5. Returns different objects/interfaces compared to regular Puppeteer

(Rest of the existing content remains unchanged)