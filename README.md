# Puppeteer Real Browser MCP Server

A Model Context Protocol (MCP) server that provides AI assistants with
powerful, detection-resistant browser automation capabilities using
puppeteer-real-browser.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Table of Contents

1. [Introduction](#introduction)
2. [Features](#features)
3. [Prerequisites](#prerequisites)
4. [Installation](#installation)
5. [Usage](#usage)
   - [With Claude Desktop](#with-claude-desktop)
   - [With Other AI Assistants](#with-other-ai-assistants)
6. [Available Tools](#available-tools)
7. [Advanced Features](#advanced-features)
8. [Configuration](#configuration)
9. [Troubleshooting](#troubleshooting)
10. [Development](#development)
11. [Contributing](#contributing)
12. [License](#license)

## Introduction

The Puppeteer Real Browser MCP Server acts as a bridge between AI assistants
and browser automation. It leverages puppeteer-real-browser to provide stealth
browsing capabilities that can bypass common bot detection mechanisms.

This server implements the Model Context Protocol (MCP), allowing AI
assistants to control a real browser with human-like interactions, take
screenshots, extract content, and more.

## Features

- **Stealth by default**: All browser instances use anti-detection features
- **Human-like actions**: Optional tools for more natural interactions
- **Comprehensive toolset**: Covers most browser automation needs
- **Extensible design**: Easy to add new tools as needed
- **Captcha handling**: Support for solving common captcha types
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
git clone https://github.com/your-organization/puppeteer-real-browser-mcp-server.git
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

Once integrated with an AI assistant:

```text
User: "Initialize a browser and navigate to example.com"
AI: I'll initialize a stealth browser and navigate to the website.
[Uses browser_init and navigate tools]

User: "Take a screenshot of the main content"
AI: I'll capture a screenshot of the page.
[Uses screenshot tool]

User: "Fill in the search form with 'test query'"
AI: I'll type that into the search field using human-like typing.
[Uses human_like_type tool]
```

## Available Tools

| Tool Name | Description | Required Parameters |
|-----------|-------------|---------------------|
| `browser_init` | Initialize stealth browser | `headless` (optional, boolean) |
| `navigate` | Navigate to a URL | `url` (required), `waitUntil` (optional, string) |
| `screenshot` | Take a screenshot | `fullPage` (optional, boolean), `selector` (optional, string) |
| `get_content` | Get page content | `type` (required, string), `selector` (optional, string) |
| `click` | Click on an element | `selector` (required, string), `waitForNavigation` (optional, boolean) |
| `type` | Type text into an input field | `selector` (required, string), `text` (required, string), `delay` (optional, number) |
| `wait` | Wait for various conditions | `type` (required, string), `value` (required), `timeout` (optional, number) |
| `browser_close` | Close the browser instance | None |
| `human_like_click` | Click with human-like mouse movement | `selector` (required, string) |
| `human_like_type` | Type text with human-like timing | `selector` (required, string), `text` (required, string) |
| `random_scroll` | Perform random scrolling | None |
| `solve_captcha` | Attempt to solve captchas | `type` (required, string) |

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

### Browser Options

When initializing the browser with `browser_init`, you can configure:

```javascript
{
  "headless": false,  // Set to true for headless operation
  // Additional options can be added in future versions
}
```

### Server Configuration

For advanced users, you can modify the server behavior by editing the source code:

- Change default viewport size in the `initializeBrowser` function
- Adjust timeout values for various operations
- Enable debug logging

## Troubleshooting

### Common Issues

1. **Browser won't start**
   - Check if Chrome/Chromium is installed
   - Ensure you have sufficient permissions

2. **Detection issues**
   - Make sure fingerprint protection is enabled
   - Use human-like interaction tools
   - Avoid making too many requests in a short time

3. **Memory leaks**
   - Always close browser instances with `browser_close` when done
   - Check for uncaught exceptions that might prevent cleanup

4. **Timeout errors**
   - Increase timeout values for slow connections
   - Check network connectivity

### Debug Mode

To enable debug logging:

```bash
DEBUG=true npm start
```

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
