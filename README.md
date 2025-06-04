# Puppeteer Real Browser MCP Server

A Model Context Protocol (MCP) server that provides AI assistants with
powerful, detection-resistant browser automation capabilities using
puppeteer-real-browser.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Table of Contents

1. [Quick Start for Beginners](#quick-start-for-beginners)
2. [Introduction](#introduction)
3. [Features](#features)
4. [Prerequisites](#prerequisites)
5. [Installation](#installation)
6. [Usage](#usage)
   - [With Claude Desktop](#with-claude-desktop)
   - [With Other AI Assistants](#with-other-ai-assistants)
7. [Available Tools](#available-tools)
8. [Advanced Features](#advanced-features)
9. [Configuration](#configuration)
10. [Troubleshooting](#troubleshooting)
11. [Development](#development)
12. [Contributing](#contributing)
13. [License](#license)

## Quick Start for Beginners

### What is this?
This is an MCP (Model Context Protocol) server that lets AI assistants like Claude control a real web browser. Think of it as giving Claude "hands" to interact with websites - it can click buttons, fill forms, take screenshots, and much more, all while avoiding bot detection.

### Step-by-Step Setup

#### 1. Install Node.js
- Go to [nodejs.org](https://nodejs.org/)
- Download and install Node.js (version 18 or higher)
- Verify installation by opening terminal/command prompt and typing: `node --version`

#### 2. Install the MCP Server
Open your terminal/command prompt and run:
```bash
npm install -g puppeteer-real-browser-mcp-server
```

#### 3. Set Up with Claude Desktop

**For Windows:**
1. Open File Explorer and navigate to: `%APPDATA%\Claude\`
2. Open (or create) `claude_desktop_config.json`
3. Add this configuration:

```json
{
  "mcpServers": {
    "puppeteer-real-browser": {
      "command": "puppeteer-real-browser-mcp-server"
    }
  }
}
```

**For Mac:**
1. Open Finder and press `Cmd+Shift+G`
2. Go to: `~/Library/Application Support/Claude/`
3. Open (or create) `claude_desktop_config.json`
4. Add the same configuration as above

**For Linux:**
1. Navigate to: `~/.config/Claude/`
2. Open (or create) `claude_desktop_config.json`
3. Add the same configuration as above

#### 4. Restart Claude Desktop
Close and reopen Claude Desktop completely.

#### 5. Test It Works
In Claude Desktop, try saying:
> "Initialize a browser and navigate to google.com, then take a screenshot"

If everything is working, Claude should be able to:
- Start a browser
- Navigate to Google
- Take and show you a screenshot

### What Can You Do With It?

Once set up, you can ask Claude to:
- **Browse websites**: "Go to amazon.com and search for laptops"
- **Fill forms**: "Fill out this contact form with my details"
- **Take screenshots**: "Show me what this page looks like"
- **Extract data**: "Get all the product prices from this page"
- **Automate tasks**: "Log into my account and download my invoice"
- **Solve captchas**: "Handle any captchas that appear"

### Safety Notes
- Claude will show you what it's doing - you can see the browser window
- Always review what Claude does before approving sensitive actions
- Use headless mode (`headless: true`) if you don't want to see the browser window
- Be respectful of websites' terms of service

## Introduction

The Puppeteer Real Browser MCP Server acts as a bridge between AI assistants
and browser automation. It leverages puppeteer-real-browser to provide stealth
browsing capabilities that can bypass common bot detection mechanisms.

This server implements the Model Context Protocol (MCP), allowing AI
assistants to control a real browser with human-like interactions, take
screenshots, extract content, and more.

## Features

- **Stealth by default**: All browser instances use anti-detection features
- **Enhanced page methods**: Support for `page.realClick` and `page.realCursor`
- **Advanced configuration**: Full support for all puppeteer-real-browser options
- **Human-like actions**: Tools for natural interactions to avoid detection
- **Comprehensive toolset**: 16+ tools covering all browser automation needs
- **Proxy support**: Built-in proxy configuration for enhanced privacy
- **Captcha handling**: Support for solving reCAPTCHA, hCaptcha, and Turnstile
- **Target management**: Support for `setTarget` function
- **Error handling**: Robust error handling and reporting

## Prerequisites

- Node.js >= 18.0.0
- npm or yarn
- Basic understanding of TypeScript/JavaScript (for development)

## Installation

### From npm

```bash
npm install -g puppeteer-real-browser-mcp-server
```

### From source

```bash
# Clone the repository
git clone https://github.com/withLinda/puppeteer-real-browser-mcp-server.git
cd puppeteer-real-browser-mcp-server

# Install dependencies
npm install

# Build the project
npm run build
```

## Usage

### With Claude Desktop

Add to Claude Desktop config:

```json
{
  "mcpServers": {
    "puppeteer-real-browser": {
      "command": "puppeteer-real-browser-mcp-server"
    }
  }
}
```

### With Other AI Assistants

Start the server:

```bash
puppeteer-real-browser-mcp-server
```

Or if installed from source:

```bash
npm start
```

The server communicates via stdin/stdout using the MCP protocol.

### Example Interactions

#### Basic Web Browsing
```text
User: "Initialize a browser and navigate to example.com"
AI: I'll initialize a stealth browser and navigate to the website.
[Uses browser_init and navigate tools]

User: "Take a screenshot of the main content"
AI: I'll capture a screenshot of the page.
[Uses screenshot tool]
```

#### Form Automation
```text
User: "Fill in the search form with 'test query'"
AI: I'll type that into the search field using human-like typing.
[Uses human_like_type tool with selector and text]

User: "Click the search button"
AI: I'll click the search button with human-like movement.
[Uses human_like_click tool]
```

#### Data Extraction
```text
User: "Get all the product names from this e-commerce page"
AI: I'll extract the product information from the page.
[Uses get_content tool with appropriate selectors]

User: "Save the page content as text"
AI: I'll get the text content of the entire page.
[Uses get_content tool with type: 'text']
```

#### Advanced Interactions
```text
User: "Use real click on the dropdown menu"
AI: I'll use the enhanced real_click method for better interaction.
[Uses real_click tool with selector and options]

User: "Move the cursor to coordinates 500, 300 smoothly"
AI: I'll move the cursor using enhanced movement.
[Uses real_cursor tool with x, y coordinates and step options]
```

#### Working with Proxies
```text
User: "Initialize a browser with a proxy server"
AI: I'll set up the browser with your proxy configuration.
[Uses browser_init with proxy: "https://proxy.example.com:8080"]
```

## Available Tools

### Core Browser Tools

| Tool Name | Description | Required Parameters | Optional Parameters |
|-----------|-------------|---------------------|-------------------|
| `browser_init` | Initialize stealth browser with advanced options | None | `headless`, `disableXvfb`, `ignoreAllFlags`, `proxy`, `plugins`, `connectOption` |
| `navigate` | Navigate to a URL | `url` | `waitUntil` |
| `screenshot` | Take a screenshot of page or element | None | `fullPage`, `selector` |
| `get_content` | Get page content (HTML or text) | None | `type`, `selector` |
| `browser_close` | Close the browser instance | None | None |

### Interaction Tools

| Tool Name | Description | Required Parameters | Optional Parameters |
|-----------|-------------|---------------------|-------------------|
| `click` | Standard click on element | `selector` | `waitForNavigation` |
| `type` | Type text into input field | `selector`, `text` | `delay` |
| `wait` | Wait for various conditions | `type`, `value` | `timeout` |

### Enhanced Puppeteer-Real-Browser Tools

| Tool Name | Description | Required Parameters | Optional Parameters |
|-----------|-------------|---------------------|-------------------|
| `real_click` | Enhanced click using page.realClick | `selector` | `options` (button, clickCount, delay) |
| `real_cursor` | Enhanced cursor movement using page.realCursor | `selector` OR `x`,`y` | `options` (steps) |
| `set_target` | Use setTarget function for advanced targeting | `target` | None |

### Human-like Behavior Tools

| Tool Name | Description | Required Parameters | Optional Parameters |
|-----------|-------------|---------------------|-------------------|
| `human_like_click` | Click with human-like mouse movement | `selector` | None |
| `human_like_type` | Type text with human-like timing | `selector`, `text` | None |
| `random_scroll` | Perform random scrolling with natural timing | None | None |

### Anti-Detection Tools

| Tool Name | Description | Required Parameters | Optional Parameters |
|-----------|-------------|---------------------|-------------------|
| `solve_captcha` | Attempt to solve captchas | `type` | None |

## Advanced Features

### Human-like Interactions

The server includes several tools designed to mimic human behavior:

- **Human-like mouse movement**: Moves the cursor in a natural, non-linear path
- **Variable typing speed**: Types with random delays between keystrokes
- **Random scrolling**: Performs scrolling with natural timing and variable distances

These features help avoid detection by sophisticated bot-detection systems
that analyze user behavior patterns.

### Captcha Handling

The server includes basic support for solving common captcha types:

- reCAPTCHA
- hCaptcha
- Cloudflare Turnstile

Note that captcha solving capabilities depend on the underlying
puppeteer-real-browser implementation.

## Configuration

### Configuring Custom Options (like headless mode)
Custom options like headless mode are **not configured in the MCP config file**. Instead, they're passed when initializing the browser using the `browser_init` tool:

When you ask Claude to initialize a browser, you can specify options like:

```
Please initialize a browser with headless mode enabled and a 30-second timeout
```

Claude will then use the `browser_init` tool with appropriate parameters:

```json
{
  "headless": true,
  "connectOption": {
    "timeout": 30000
  }
}
```

### Available Browser Options
When initializing with `browser_init`, you can configure:

- `headless`: true/false (Set to true for headless operation)
- `disableXvfb`: true/false (Disable X Virtual Framebuffer)
- `ignoreAllFlags`: true/false (Ignore all Chrome flags)
- `proxy`: "https://proxy:8080" (Proxy server URL)
- `plugins`: ["plugin1", "plugin2"] (Array of plugins to load)
- `connectOption`: Additional connection options like:
  - `slowMo`: 250 (Slow down operations by milliseconds)
  - `timeout`: 60,000 (Connection timeout)

The MCP config file only tells Claude where to find the server - all browser-specific options are configured through your conversations with Claude.

### Browser Options Example

When initializing the browser with `browser_init`, you can configure:

```json
{
  "headless": false,
  "disableXvfb": false,
  "ignoreAllFlags": false,
  "proxy": "https://proxy:8080",
  "plugins": ["plugin1", "plugin2"],
  "connectOption": {
    "slowMo": 250,
    "timeout": 60000
  }
}
```

### Advanced Configuration Examples

#### Using a Proxy
```json
{
  "headless": true,
  "proxy": "https://username:password@proxy.example.com:8080"
}
```

#### Stealth Mode with Custom Options
```json
{
  "headless": false,
  "ignoreAllFlags": true,
  "disableXvfb": false,
  "connectOption": {
    "slowMo": 100,
    "devtools": false
  }
}
```

#### Enhanced Real Browser Features

Using real_click with options:
```json
{
  "selector": "#submit-button",
  "options": {
    "button": "left",
    "clickCount": 2,
    "delay": 150
  }
}
```

Using real_cursor with coordinates:
```json
{
  "x": 500,
  "y": 300,
  "options": {
    "steps": 30
  }
}
```

### Server Configuration

For advanced users, you can modify the server behavior by editing the source code:

- Change default viewport size in the `initializeBrowser` function
- Adjust timeout values for various operations
- Enable debug logging

## Troubleshooting

### Common Issues

1. **"command not found" error**
   - Make sure you installed globally: `npm install -g puppeteer-real-browser-mcp-server`
   - Check your PATH includes npm global binaries: `npm config get prefix`
   - Try reinstalling: `npm uninstall -g puppeteer-real-browser-mcp-server && npm install -g puppeteer-real-browser-mcp-server`

2. **Browser won't start**
   - Check if Chrome/Chromium is installed
   - On Linux: Install dependencies: `sudo apt-get install -y chromium-browser`
   - On Windows: Make sure you have Chrome installed
   - Try with `headless: true` first

3. **Claude doesn't see the MCP server**
   - Verify `claude_desktop_config.json` is in the correct location
   - Check JSON syntax is valid (use [jsonlint.com](https://jsonlint.com/))
   - Restart Claude Desktop completely
   - Check for any error messages in Claude Desktop

4. **Permission denied errors**
   - On Linux/Mac: Try `sudo npm install -g puppeteer-real-browser-mcp-server`
   - Or use nvm to manage Node.js without sudo
   - On Windows: Run command prompt as Administrator

5. **Detection issues**
   - Use `real_click` and `real_cursor` instead of basic click
   - Enable human-like tools: `human_like_click`, `human_like_type`
   - Add random delays with `random_scroll`
   - Use proxy if needed: `proxy: "http://proxy.example.com:8080"`

6. **Memory leaks**
   - Always close browser instances with `browser_close` when done
   - Don't initialize multiple browsers without closing previous ones
   - Check for uncaught exceptions that might prevent cleanup

7. **Timeout errors**
   - Increase timeout values: `{ "timeout": 60000 }`
   - Use `wait` tool before interacting with elements
   - Check network connectivity and website response times

### Frequently Asked Questions

**Q: Does this work with headless browsers?**
A: Yes, set `headless: true` in browser_init options.

**Q: Can I use multiple browsers at once?**
A: Currently supports one browser instance. Close the current one before starting a new one.

**Q: What captchas can it solve?**
A: Supports reCAPTCHA, hCaptcha, and Cloudflare Turnstile through puppeteer-real-browser.

**Q: Is this detectable by websites?**
A: puppeteer-real-browser includes anti-detection features, but no solution is 100% undetectable.

**Q: Can I use custom Chrome extensions?**
A: Yes, through the `plugins` option in browser_init.

**Q: Does it work on all operating systems?**
A: Yes, tested on Windows, macOS, and Linux.

### Debug Mode

To enable debug logging:

```bash
DEBUG=true npm start
```

Or when running from source:
```bash
DEBUG=true npm run dev
```

### Getting Help

If you're still having issues:
1. Check the [GitHub Issues](https://github.com/your-organization/puppeteer-real-browser-mcp-server/issues)
2. Create a new issue with:
   - Your operating system
   - Node.js version (`node --version`)
   - npm version (`npm --version`)
   - Full error message
   - Steps to reproduce the problem

## Development

### Project Structure

```text
puppeteer-real-browser-mcp-server/
├── src/
│   ├── index.ts         # Main server implementation
│   └── stealth-actions.ts # Human-like interaction functions
├── test/
│   └── test-server.ts   # Test script
├── package.json
└── tsconfig.json
```

### Building from Source

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build

# Test the server
npm test
```

### Adding New Tools

To add a new tool:

1. Add the tool definition to the `TOOLS` array in `src/index.ts`
2. Implement the tool handler in the `CallToolRequestSchema` handler
3. Test the new tool functionality

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
