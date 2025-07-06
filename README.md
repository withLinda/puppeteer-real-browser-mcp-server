
# Puppeteer Real Browser MCP Server

Provides AI assistants with powerful, detection-resistant browser automation capabilities built on ZFC Digital's puppeteer-real-browser package.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Table of Contents

1. [Quick Start for Beginners](#quick-start-for-beginners)
2. [Introduction](#introduction)
3. [Features](#features)
4. [Prerequisites](#prerequisites)
5. [Installation](#installation)
6. [Usage](#usage)
   - [With Claude Desktop](#with-claude-desktop)
   - [With Claude Code CLI](#with-claude-code-cli)
   - [With Cursor IDE](#with-cursor-ide)
   - [With Other AI Assistants](#with-other-ai-assistants)
7. [Available Tools](#available-tools)
8. [Advanced Features](#advanced-features)
9. [Configuration](#configuration)
10. [Troubleshooting](#troubleshooting)
11. [Development](#development)
12. [Testing](#testing)
13. [Contributing](#contributing)
14. [License](#license)

## Quick Start for Beginners

### What is this?
This is an MCP (Model Context Protocol) server that lets AI assistants like Claude control a real web browser. Think of it as giving Claude "hands" to interact with websites - it can click buttons, fill forms, extract content, and much more, all while avoiding bot detection.

### Important: You DON'T Need to Install This Package!
If you're just using this MCP server (not developing it), you don't need to run `npm install`. The `npx` command in the configuration will automatically download and run the latest version for you. Installation is only required for development purposes.

### Step-by-Step Setup

#### 1. Install Node.js (Required)
- Go to [nodejs.org](https://nodejs.org/)
- Download and install Node.js (version 18 or higher)
- Verify installation by opening terminal/command prompt and typing: `node --version`

#### 2. Configure Claude Desktop

**For Windows:**
1. Open File Explorer and navigate to: `%APPDATA%\Claude\`
2. Open (or create) `claude_desktop_config.json`
3. Add this configuration:

```json
{
  "mcpServers": {
    "puppeteer-real-browser": {
      "command": "npx",
      "args": ["puppeteer-real-browser-mcp-server@latest"]
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

**Why @latest?** The `@latest` tag ensures you always get the most recent version with bug fixes and improvements. The `npx` command automatically downloads and runs it without installing anything permanently on your system.

#### 3. Restart Claude Desktop
Close and reopen Claude Desktop completely.

#### 4. Test It Works
In Claude Desktop, try saying:
> "Initialize a browser and navigate to google.com, then get the page content"

If everything is working, Claude should be able to:
- Start a browser
- Navigate to Google
- Extract and show you the page content

### What Can You Do With It?

Once set up, you can ask Claude to:
- **Browse websites**: "Go to amazon.com and search for laptops"
- **Fill forms**: "Fill out this contact form with my details"
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
assistants to control a real browser, extract content, and more.

## Features

- **Stealth by default**: All browser instances use anti-detection features
- **Enhanced Windows support**: Comprehensive Chrome detection and ECONNREFUSED error fixes (v1.3.0)
- **Smart Chrome detection**: Registry-based detection + 15+ installation paths (Windows)
- **Connection resilience**: Automatic localhost/127.0.0.1 fallback with port management
- **Multiple retry strategies**: 5 different connection approaches with progressive fallback
- **Advanced configuration**: Full support for all puppeteer-real-browser options
- **Dynamic selector discovery**: Intelligent element finding without hardcoded selectors
- **Random scrolling**: Tools for natural scrolling to avoid detection
- **Comprehensive toolset**: 11 tools covering all browser automation needs
- **Proxy support**: Built-in proxy configuration for enhanced privacy
- **Captcha handling**: Support for solving reCAPTCHA, hCaptcha, and Turnstile
- **Robust error handling**: Advanced error recovery with circuit breaker pattern
- **Stack overflow protection**: Comprehensive protection against infinite recursion
- **Timeout controls**: Automatic timeout mechanisms prevent hanging operations
- **Platform optimization**: Windows-specific flags and longer timeouts for better compatibility

## Prerequisites

- Node.js >= 18.0.0
- npm or yarn
- Google Chrome or Chromium browser installed
- Basic understanding of TypeScript/JavaScript (for development)

### Platform-Specific Requirements

**Windows:**
- Google Chrome installation (automatic detection in v1.3.0+ includes):
  - Standard installations: `C:\Program Files\Google\Chrome\Application\chrome.exe`
  - 32-bit installations: `C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`
  - User installations: `%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe`
  - Chrome Canary: `%LOCALAPPDATA%\Google\Chrome SxS\Application\chrome.exe`
  - Portable installations and Registry-detected paths
  - Manual path specification: Use `CHROME_PATH` environment variable

**macOS:**
- Google Chrome or Chromium must be installed in `/Applications/`

**Linux:**
- Install Chrome/Chromium: `sudo apt-get install -y google-chrome-stable` or `sudo apt-get install -y chromium-browser`
- Install xvfb for headless operation: `sudo apt-get install -y xvfb`

## Installation for Developers

> **Note for Claude Desktop Users:** You don't need to install anything! The npx command in your configuration automatically handles everything. Skip to the [Usage](#usage) section.

This section is for developers who want to:
- Contribute to the project
- Run the server locally for development
- Create custom modifications

### Global Installation (For Command Line Usage)

If you want to run the server directly from the command line without using npx:

```bash
npm install -g puppeteer-real-browser-mcp-server@latest
```

After global installation, you can run:
```bash
puppeteer-real-browser-mcp-server
```

### Development Setup (For Contributors)

```bash
# Clone the repository
git clone https://github.com/withLinda/puppeteer-real-browser-mcp-server.git
cd puppeteer-real-browser-mcp-server

# Install dependencies
npm install

# Build the project
npm run build

# Run in development mode
npm run dev
```

## Usage

### With Claude Desktop

The configuration below uses `npx` to automatically download and run the latest version. No installation required!

```json
{
  "mcpServers": {
    "puppeteer-real-browser": {
      "command": "npx",
      "args": ["puppeteer-real-browser-mcp-server@latest"]
    }
  }
}
```

> **What does npx do?** The `npx` command downloads and runs the package without permanently installing it. The `@latest` ensures you always get the newest version with all bug fixes and improvements.

### With Claude Code CLI

Claude Code CLI offers multiple convenient methods to add the puppeteer-real-browser MCP server. Choose the method that best fits your workflow:

#### Method 1: Quick Setup (Recommended)

The fastest way to get started is using the `claude mcp add` command:

```bash
claude mcp add puppeteer-real-browser -- npx puppeteer-real-browser-mcp-server@latest
```

This command:
- Adds the server to your local scope (available only to you in current project)
- Uses npx to automatically download and run the latest version
- No installation required - everything is handled automatically

#### Method 2: Add with Environment Variables

If you need to configure proxy settings or custom Chrome paths:

```bash
claude mcp add puppeteer-real-browser \
  -e CHROME_PATH="/path/to/chrome" \
  -e PROXY_URL="http://proxy:8080" \
  -- npx puppeteer-real-browser-mcp-server@latest
```

#### Method 3: Scoped Configuration

**For User-Wide Access (Available Across All Projects):**
```bash
claude mcp add puppeteer-real-browser -s user -- npx puppeteer-real-browser-mcp-server@latest
```

**For Project-Wide Access (Shared with Team via .mcp.json):**
```bash
claude mcp add puppeteer-real-browser -s project -- npx puppeteer-real-browser-mcp-server@latest
```

#### Method 4: JSON Configuration

For advanced users who want precise control:

```bash
claude mcp add-json puppeteer-real-browser '{
  "type": "stdio",
  "command": "npx",
  "args": ["puppeteer-real-browser-mcp-server@latest"],
  "env": {
    "CHROME_PATH": "/path/to/chrome",
    "PROXY_URL": "http://proxy:8080"
  }
}'
```

#### Verification and Testing

After adding the server:

1. **Check MCP Server Status:**
   ```bash
   /mcp
   ```
   This command in Claude Code shows all active MCP servers.

2. **Test the Server:**
   In Claude Code, try:
   > "Initialize a browser and navigate to google.com, then get the page content"

   If working correctly, you should see:
   - Browser initialization
   - Navigation to Google
   - Page content extracted and displayed

#### Configuration Scopes Explained

| Scope | Description | Config Location | Use Case |
|-------|-------------|----------------|----------|
| **local** (default) | Available only to you in current project | `.mcp.json` in project | Testing, project-specific |
| **project** | Shared with entire team | `.mcp.json` committed to repo | Team collaboration |
| **user** | Available to you across all projects | User config directory | Personal productivity |

#### Benefits of Claude Code CLI

- **Automatic Updates**: Using `@latest` ensures you get bug fixes and improvements
- **No Installation**: npx handles downloading and running automatically  
- **Environment Variables**: Easy configuration of proxies, Chrome paths, etc.
- **Scope Control**: Choose where the server is available (local/project/user)
- **Team Sharing**: Project scope allows sharing configurations with teammates
- **Status Monitoring**: Built-in `/mcp` command for server health checks

### With Cursor IDE

Cursor IDE uses the same npx approach - no installation needed! Here are the setup methods:

#### Method 1: One-Click Installation (Recommended)

1. **Open Cursor IDE**
2. **Open Command Palette** (`Ctrl+Shift+P` on Windows/Linux, `Cmd+Shift+P` on Mac)
3. **Search for "Cursor Settings"** and select it
4. **Click on "MCP" in the sidebar**
5. **Browse curated MCP servers** and install browser automation tools with one-click
6. **OAuth authentication** will be handled automatically

#### Method 2: Manual Configuration

**Configuration File Location:**
- **Project-specific**: Create `.cursor/mcp.json` in your project directory
- **Global**: Create `~/.cursor/mcp.json` in your home directory

**Basic Configuration (No Installation Required):**
```json
{
  "mcpServers": {
    "puppeteer-real-browser": {
      "command": "npx",
      "args": ["puppeteer-real-browser-mcp-server@latest"]
    }
  }
}
```

> **Important:** Just like Claude Desktop, Cursor will use `npx` to automatically download and run the server. You don't need to install anything with npm!

**Windows-Specific Configuration (if experiencing Chrome path issues):**
```json
{
  "mcpServers": {
    "puppeteer-real-browser": {
      "command": "npx",
      "args": ["puppeteer-real-browser-mcp-server@latest"],
      "env": {
        "PUPPETEER_LAUNCH_OPTIONS": "{\"headless\": false, \"executablePath\": \"C:/Program Files/Google/Chrome/Application/chrome.exe\", \"args\": [\"--disable-gpu\"]}",
        "ALLOW_DANGEROUS": "true"
      }
    }
  }
}
```

**Advanced Configuration with Proxy and Custom Options:**
```json
{
  "mcpServers": {
    "puppeteer-real-browser": {
      "command": "npx",
      "args": ["puppeteer-real-browser-mcp-server@latest"],
      "env": {
        "PUPPETEER_LAUNCH_OPTIONS": "{\"headless\": false, \"args\": [\"--proxy-server=http://proxy:8080\"], \"executablePath\": \"C:/Program Files/Google/Chrome/Application/chrome.exe\"}",
        "ALLOW_DANGEROUS": "true"
      }
    }
  }
}
```

#### Platform-Specific Chrome Paths for Cursor IDE

**Windows:**
```json
"executablePath": "C:/Program Files/Google/Chrome/Application/chrome.exe"
```
Alternative paths to try:
- `"C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"`
- `"%LOCALAPPDATA%/Google/Chrome/Application/chrome.exe"`

**macOS:**
```json
"executablePath": "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

**Linux:**
```json
"executablePath": "/usr/bin/google-chrome"
```
Alternative paths: `/usr/bin/chromium-browser`, `/snap/bin/chromium`


#### Testing Cursor IDE Setup

After configuration:
1. **Restart Cursor IDE completely**
2. **Open a new chat** 
3. **Test with**: "Initialize a browser and navigate to google.com, then get the page content"

If successful, you should see:
- Browser window opening
- Navigation to Google
- Page content extracted and displayed in the chat

#### Cursor IDE Troubleshooting

**Common Issues:**

1. **"MCP server not found"**
   - Verify config file location and JSON syntax
   - Use [jsonlint.com](https://jsonlint.com/) to validate JSON
   - Ensure Node.js 18+ is installed

2. **"Browser failed to launch" on Windows**
   - Add explicit Chrome path in `executablePath`
   - Try running Cursor IDE as Administrator
   - Check Windows Defender isn't blocking Chrome

3. **"Permission denied"**
   - Use `sudo npm install -g puppeteer-real-browser-mcp-server` on Linux/Mac
   - Run Command Prompt as Administrator on Windows

4. **Configuration not loading**
   - Ensure file is named exactly `mcp.json` (not `mcp.json.txt`)
   - Check file is in correct directory
   - Restart Cursor IDE after changes

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

```

#### Form Automation
```text
User: "Fill in the search form with 'test query'"
AI: I'll type that into the search field.
[Uses type tool with selector and text]

User: "Click the search button"
AI: I'll click the search button.
[Uses click tool]
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
| `get_content` | Get page content (HTML or text) | None | `type`, `selector` |
| `browser_close` | Close the browser instance | None | None |

### Interaction Tools

| Tool Name | Description | Required Parameters | Optional Parameters |
|-----------|-------------|---------------------|-------------------|
| `click` | Standard click on element | `selector` | `waitForNavigation` |
| `type` | Type text into input field | `selector`, `text` | `delay` |
| `wait` | Wait for various conditions | `type`, `value` | `timeout` |
| `find_selector` | Find CSS selector for element containing specific text | `text` | `elementType`, `exact` |


### Behavior Tools

| Tool Name | Description | Required Parameters | Optional Parameters |
|-----------|-------------|---------------------|-------------------|
| `random_scroll` | Perform random scrolling with natural timing | None | None |

### Element Discovery Tools

| Tool Name | Description | Required Parameters | Optional Parameters |
|-----------|-------------|---------------------|-------------------|
| `find_selector` | Find CSS selector for element containing specific text | `text` | `elementType`, `exact` |

### Anti-Detection Tools

| Tool Name | Description | Required Parameters | Optional Parameters |
|-----------|-------------|---------------------|-------------------|
| `solve_captcha` | Attempt to solve captchas | `type` | None |

## Advanced Features

### Dynamic Selector Discovery

The server includes intelligent element discovery capabilities through the `find_selector` tool:

- **Text-based element finding**: Automatically locates elements containing specific text
- **Smart CSS selector generation**: Creates unique, robust CSS selectors similar to Chrome DevTools
- **Element type filtering**: Optionally restrict search to specific HTML elements (e.g., buttons, links)
- **Exact or partial text matching**: Choose between precise text matching or substring searches
- **Universal compatibility**: Works across any website without hardcoded selectors

**Example Usage:**
```text
User: "Find the submit button that says 'Sign Up'"
AI: I'll locate that button for you.
[Uses find_selector with text: "Sign Up", elementType: "button"]

AI: Found button at selector: "form > button.btn-primary:nth-of-type(2)"
```

This approach eliminates the need for manually crafted selectors and makes automation more reliable across different websites.

### Natural Interactions

The server includes tools designed for natural browsing behavior:

- **Random scrolling**: Performs scrolling with natural timing and variable distances

This feature helps avoid detection by sophisticated bot-detection systems
that analyze user behavior patterns.

### Captcha Handling

The server includes basic support for solving common captcha types:

- reCAPTCHA
- hCaptcha
- Cloudflare Turnstile

Note that captcha solving capabilities depend on the underlying
puppeteer-real-browser implementation.

## Configuration

### Automatic Chrome Path Detection (Enhanced in v1.3.0)

The server automatically detects Chrome installation paths across different operating systems with significantly improved Windows support:

- **Windows (v1.3.0+)**: 
  - Registry-based detection for installed Chrome versions
  - Searches 15+ common installation directories including Program Files, user-specific locations, and portable installations
  - Support for Chrome Canary fallback
  - Environment variable detection (`CHROME_PATH`, `PUPPETEER_EXECUTABLE_PATH`)
  - Detailed troubleshooting guidance when Chrome is not found
  
- **macOS**: Looks for Chrome in `/Applications/Google Chrome.app/` and Chrome Canary locations

- **Linux**: Checks multiple locations including `/usr/bin/google-chrome`, `/usr/bin/chromium-browser`, and snap installations

**Windows Registry Detection** (NEW in v1.3.0):
The server now queries Windows Registry to find Chrome installations, making detection more reliable across different installation types.

If Chrome is not found automatically, you can specify a custom path using:
1. Environment variable: `set CHROME_PATH="C:\Your\Chrome\Path\chrome.exe"`
2. Browser init option: `customConfig.chromePath` when initializing the browser

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

#### Specifying Custom Chrome Path
```json
{
  "customConfig": {
    "chromePath": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
  }
}
```

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


### Server Configuration

For advanced users, you can modify the server behavior by editing the source code:

- Change default viewport size in the `initializeBrowser` function
- Adjust timeout values for various operations
- Enable debug logging

## Troubleshooting

### Major Windows Connection Issues (Fixed in v1.3.0)

**🔧 ECONNREFUSED Error Solutions**

Version 1.3.0 includes comprehensive fixes for the `connect ECONNREFUSED 127.0.0.1:60725` error commonly experienced on Windows systems:

**Enhanced Chrome Path Detection:**
- Added Windows Registry-based Chrome detection
- Expanded search to 15+ Windows installation locations including portable installations
- Added support for Chrome Canary fallback
- Environment variable support (`CHROME_PATH`, `PUPPETEER_EXECUTABLE_PATH`)

**Windows-Specific Launch Optimizations:**
- 20+ Windows-specific Chrome flags for better compatibility
- Multiple fallback strategies (5 different connection approaches)
- Progressive retry logic with exponential backoff
- Enhanced timeout handling (120s for Windows vs 90s for other platforms)

**Connection Resilience Features:**
- Localhost vs 127.0.0.1 fallback handling (fixes known Puppeteer issue)
- Port availability checking and automatic port assignment
- Network connectivity testing before browser launch
- Enhanced error categorization and automatic fallback strategies

**If you're still experiencing ECONNREFUSED errors:**

1. **Environment Variables (Recommended):**
   ```bash
   set CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
   ```

2. **Manual Chrome Path Configuration:**
   ```text
   Ask Claude: "Initialize browser with custom Chrome path at C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
   ```

3. **Network Troubleshooting:**
   ```bash
   # Test localhost resolution
   ping localhost
   # Should resolve to 127.0.0.1
   
   # Check Windows hosts file
   notepad C:\Windows\System32\drivers\etc\hosts
   # Ensure: 127.0.0.1 localhost
   ```

4. **Chrome Process Management:**
   ```bash
   # Kill existing Chrome processes
   taskkill /f /im chrome.exe
   ```

### Common Issues

#### npx-Specific Issues

1. **"spawn npx ENOENT" or "command not found" errors**
   - **Cause:** npx is not in your system PATH or Node.js is not properly installed
   - **Solutions:**
     - Verify Node.js installation: `node --version` and `npm --version`
     - Reinstall Node.js from [nodejs.org](https://nodejs.org/)
     - For NVM users, see the NVM-specific section below

2. **"npx: command not found" in Claude Desktop/Cursor**
   - **Windows:** Make sure to restart your IDE after installing Node.js
   - **Mac/Linux:** Add npm to PATH: `export PATH="$PATH:$(npm bin -g)"`
   - **Alternative:** Use the full path to npx: `/usr/local/bin/npx`

3. **npx hangs or takes too long**
   - npx downloads the package on first run, which can take 30-60 seconds
   - Ensure you have a stable internet connection
   - Try clearing npm cache: `npm cache clean --force`

4. **Using NVM (Node Version Manager)?**
   - Standard npx commands may fail with NVM
   - **Solution 1:** Use absolute paths in your config:
     ```json
     {
       "mcpServers": {
         "puppeteer-real-browser": {
           "command": "/Users/yourname/.nvm/versions/node/v20.0.0/bin/npx",
           "args": ["puppeteer-real-browser-mcp-server@latest"]
         }
       }
     }
     ```
   - **Solution 2:** Set a default Node version: `nvm alias default 20.0.0`

5. **Permission denied errors with npx**
   - **Mac/Linux:** Try with sudo: `sudo npx puppeteer-real-browser-mcp-server@latest`
   - **Better solution:** Fix npm permissions: `npm config set prefix ~/.npm`

#### Other Common Issues

1. **"Maximum call stack size exceeded" errors**
   - This was fixed in version 1.2.0 with comprehensive stack overflow protection
   - The server now includes circuit breaker patterns and recursion depth tracking
   - Timeout controls prevent hanging operations that could lead to stack overflow
   - If you encounter this error, ensure you're using the latest version: `npx puppeteer-real-browser-mcp-server@latest`

2. **"command not found" or "syntax error" when using npx**
   - This was fixed in version 1.0.3 with the addition of a proper shebang line
   - Make sure you're using the latest version: `npx puppeteer-real-browser-mcp-server@latest`
   - For global installation: `npm install -g puppeteer-real-browser-mcp-server@latest`
   - If still having issues, install globally: `npm install -g puppeteer-real-browser-mcp-server`
   - Check your PATH includes npm global binaries: `npm config get prefix`

3. **Browser won't start**
   - Check if Chrome/Chromium is installed in standard locations
   - **Windows specific troubleshooting**:
     
     **Step 1: Verify Chrome Installation Paths**
     Check these locations in order:
     - `C:\Program Files\Google\Chrome\Application\chrome.exe`
     - `C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`
     - `%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe`
     - `%PROGRAMFILES%\Google\Chrome\Application\chrome.exe`
     
     **Step 2: Manual Path Configuration**
     If Chrome is in a different location, specify it manually:
     ```
     Ask Claude: "Initialize browser with custom Chrome path at C:\Your\Chrome\Path\chrome.exe"
     ```
     
     **Step 3: Windows Launch Arguments**
     For Windows compatibility, use these launch arguments:
     ```
     Ask Claude: "Initialize browser with args --disable-gpu --disable-setuid-sandbox"
     ```
     
     **Step 4: Windows-Specific Solutions**
     - **Run as Administrator**: Try running your IDE/terminal as Administrator
     - **Windows Defender**: Add Chrome and Node.js to Windows Defender exclusions
     - **Antivirus Software**: Temporarily disable antivirus to test if it's blocking Chrome
     - **User Account Control**: Lower UAC settings temporarily for testing
     - **Chrome Processes**: Kill any existing Chrome processes in Task Manager
     
     **Step 5: Alternative Chrome Installation**
     If Chrome detection still fails:
     - Download Chrome directly from [google.com/chrome](https://www.google.com/chrome/)
     - Install to default location (`C:\Program Files\Google\Chrome\`)
     - Restart your IDE after installation
     
     **Step 6: PowerShell vs Command Prompt**
     Try switching between PowerShell and Command Prompt:
     - Test with `cmd.exe` instead of PowerShell
     - Test with PowerShell instead of Command Prompt
     
     **Step 7: Node.js and npm Configuration**
     - Ensure Node.js is added to PATH: `node --version`
     - Clear npm cache: `npm cache clean --force`
     - Reinstall global packages: `npm install -g puppeteer-real-browser-mcp-server@latest`
     
   - **Linux**: Install dependencies: `sudo apt-get install -y google-chrome-stable`
   - **macOS**: Ensure Chrome is in `/Applications/`
   - Try with `headless: true` first
   - Check console output for Chrome path detection messages

4. **Claude doesn't see the MCP server**
   - Verify `claude_desktop_config.json` is in the correct location
   - Check JSON syntax is valid (use [jsonlint.com](https://jsonlint.com/))
   - Restart Claude Desktop completely
   - Check for any error messages in Claude Desktop

**4a. Claude Code CLI doesn't see the MCP server**
   - **Installation Issues**:
     - Verify `claude mcp add` command was successful
     - Check command syntax: `claude mcp add puppeteer-real-browser -- npx puppeteer-real-browser-mcp-server@latest`
     - Ensure you have the latest Claude Code CLI version
   
   - **Scope and Configuration**:
     - Check which scope you used: local (default), project, or user
     - For local scope: ensure you're in the correct project directory
     - For project scope: verify `.mcp.json` exists in project root
     - For user scope: check user config directory
   
   - **MCP Server Status**:
     - Use `/mcp` command in Claude Code to check server status
     - Look for the "puppeteer-real-browser" server in the list
     - Check if server status shows "connected" or error messages
   
   - **Environment Variables**:
     - If using custom environment variables (Chrome path, proxy), verify they're correctly set
     - Test without environment variables first: `claude mcp add puppeteer-real-browser -- npx puppeteer-real-browser-mcp-server@latest`
   
   - **Node.js and npx Issues**:
     - Verify Node.js version 18+: `node --version`
     - Test npx directly: `npx puppeteer-real-browser-mcp-server@latest`
     - Clear npm cache: `npm cache clean --force`
   
   - **Protocol Version Issues** (Known Issue):
     - Claude CLI may show protocolVersion validation errors despite correct configuration
     - This is a known issue with internal validation in Claude CLI
     - Server may still work despite validation warnings
   
   - **Re-adding Server**:
     ```bash
     # Remove and re-add if issues persist
     claude mcp remove puppeteer-real-browser
     claude mcp add puppeteer-real-browser -- npx puppeteer-real-browser-mcp-server@latest
     ```

**4b. Cursor IDE doesn't see the MCP server**
   - **Config File Location Issues**:
     - Verify `mcp.json` is in the correct location:
       - Global: `~/.cursor/mcp.json` (`%USERPROFILE%\.cursor\mcp.json` on Windows)
       - Project: `.cursor/mcp.json` in your project root
     - Ensure filename is exactly `mcp.json` (not `mcp.json.txt`)
     - Check file permissions allow reading
   
   - **JSON Syntax Validation**:
     - Use [jsonlint.com](https://jsonlint.com/) to validate JSON syntax
     - Common issues: missing commas, incorrect quotes, trailing commas
     - Ensure proper escaping of Windows paths: `"C:/Program Files/Google/Chrome/Application/chrome.exe"`
   
   - **Cursor IDE Restart Process**:
     - Close Cursor IDE completely (check Task Manager on Windows)
     - Wait 5 seconds
     - Restart Cursor IDE
     - Open Command Palette and check MCP servers are listed
   
   - **Environment Variables**:
     - Verify Node.js is accessible: `node --version`
     - Check PATH includes npm: `npm --version`
     - Clear any conflicting environment variables
   
   - **Cursor IDE Version Compatibility**:
     - Ensure Cursor IDE version supports MCP (latest versions)
     - Update Cursor IDE if using an older version
     - Check Cursor IDE documentation for MCP requirements

5. **Permission denied errors**
   - On Linux/Mac: Try `sudo npm install -g puppeteer-real-browser-mcp-server`
   - Or use nvm to manage Node.js without sudo
   - On Windows: Run command prompt as Administrator

6. **Detection issues**
   - Use appropriate delays between actions for better reliability
   - Add random delays with `random_scroll`
   - Use proxy if needed: `proxy: "http://proxy.example.com:8080"`

7. **Memory leaks**
   - Always close browser instances with `browser_close` when done
   - Don't initialize multiple browsers without closing previous ones
   - Check for uncaught exceptions that might prevent cleanup

8. **Timeout errors**
   - Increase timeout values: `{ "timeout": 60000 }`
   - Use `wait` tool before interacting with elements
   - Check network connectivity and website response times

### Frequently Asked Questions

**Q: When should I use npm install vs npx?**
A: 
- **Use npx (recommended for most users):** When using with Claude Desktop, Claude Code CLI, or Cursor IDE. The npx command in your config automatically downloads and runs the latest version without installation.
- **Use npm install -g:** Only if you want to run the server directly from command line frequently, or if you're developing/contributing to the project.
- **Never needed:** If you're just a Claude Desktop/Claude Code CLI user following the Quick Start guide - npx handles everything!

**Q: Should I use Claude Desktop or Claude Code CLI?**
A: Both are excellent choices, depending on your needs:

**Claude Desktop:**
- **Best for:** Simple web browsing automation, content extraction, basic form filling
- **Setup:** Manual JSON config file editing
- **Sharing:** Individual use only
- **Interface:** Desktop GUI application
- **Authentication:** None required

**Claude Code CLI:**
- **Best for:** Development workflows, team collaboration, project-specific automation
- **Setup:** Simple command-line setup (`claude mcp add`)
- **Sharing:** Supports team sharing via project scope
- **Interface:** Command-line integration with IDEs
- **Authentication:** OAuth support available
- **Advanced Features:** Environment variables, scope control, server monitoring

**Use Claude Code CLI if you:**
- Work in development teams
- Need project-specific browser automation
- Want environment variable configuration
- Prefer command-line workflows
- Need server health monitoring

**Use Claude Desktop if you:**
- Want a simple GUI experience
- Do individual browsing automation
- Don't need team collaboration features
- Prefer visual interfaces over command-line

**Q: Why do we use @latest in the npx command?**
A: The `@latest` tag ensures you always get the newest version with bug fixes and security updates. Without it, npx might cache an older version. It's especially important for actively maintained projects.

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
A: Yes, tested on Windows, macOS, and Linux. The server automatically detects Chrome installations on all platforms.

**Q: What's the difference between Claude Desktop, Claude Code CLI, and Cursor IDE configurations?**
A: Here's a comparison:

| Feature | Claude Desktop | Claude Code CLI | Cursor IDE |
|---------|---------------|-----------------|------------|
| **Setup Method** | Manual JSON editing | Command-line (`claude mcp add`) | One-click install OR manual JSON |
| **Config Location** | `claude_desktop_config.json` | `.mcp.json` (scoped) | `.cursor/mcp.json` |
| **Team Sharing** | No | Yes (project scope) | Yes |
| **Environment Variables** | Limited support | Full support | Full support |
| **Scope Control** | No | Yes (local/project/user) | Project/Global |
| **Server Monitoring** | No | Yes (`/mcp` command) | Limited |
| **Authentication** | None | OAuth available | OAuth available |
| **Best For** | Individual GUI use | Development teams | Code-focused workflows |

**Command Examples:**
- **Claude Desktop**: Edit config file with JSON
- **Claude Code CLI**: `claude mcp add puppeteer-real-browser -- npx puppeteer-real-browser-mcp-server@latest`
- **Cursor IDE**: One-click install or manual JSON config

**Q: What if Chrome is installed in a non-standard location?**
A: Version 1.3.0 dramatically improves Chrome detection. The server now searches 15+ locations including portable installations and uses Windows Registry detection. If Chrome is still not found automatically, you can:
1. Set environment variable: `set CHROME_PATH="C:\Your\Chrome\Path\chrome.exe"`
2. Use the `customConfig.chromePath` option: `{"customConfig": {"chromePath": "C:\\Custom\\Chrome\\chrome.exe"}}`

**Q: Why am I getting "Chrome not found" or ECONNREFUSED errors on Windows?**
A: Version 1.3.0 includes comprehensive fixes for Windows Chrome detection and connection issues. The server now automatically searches these locations and more:
- `C:\Program Files\Google\Chrome\Application\chrome.exe`
- `C:\Program Files (x86)\Google\Chrome\Application\chrome.exe` 
- `%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe`
- `%USERPROFILE%\AppData\Local\Google\Chrome\Application\chrome.exe`
- Chrome Canary installations
- Portable Chrome installations
- Registry-detected installations

The server also implements multiple connection strategies with automatic fallback between localhost and 127.0.0.1, plus enhanced Windows-specific Chrome flags for better compatibility.

**Q: I'm still getting ECONNREFUSED errors after upgrading to v1.3.0. What should I do?**
A: Try these steps in order:
1. Set the `CHROME_PATH` environment variable to your Chrome location
2. Kill all existing Chrome processes: `taskkill /f /im chrome.exe`
3. Check your Windows hosts file contains: `127.0.0.1 localhost`
4. Try running your IDE as Administrator
5. Add Chrome to Windows Defender exclusions
6. If using a VPN/proxy, try disabling it temporarily

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
│   └── stealth-actions.ts # Browser interaction functions
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

## Testing

This project includes a comprehensive testing suite with multiple categories optimized for different purposes:

### Quick Tests (CI/CD) - ~30 seconds
```bash
npm run test:quick    # Fast Jest tests for protocol compliance
npm test              # Alias for test:quick
```

### Comprehensive Tests - ~5-10 minutes  
```bash
npm run test:full     # End-to-end MCP client testing
```

### Performance Testing - ~2-3 minutes
```bash
npm run test:performance  # Browser performance benchmarking
```

Performance tests measure:
- Browser initialization timing (5 trials)
- Navigation performance across different site types
- Concurrent operation handling
- Session longevity testing (30+ operations over 30 seconds)

### Debug Tools - ~10 seconds
```bash
npm run test:debug    # Environment diagnostics and troubleshooting
```

Debug tools provide:
- Environment validation (Node.js version, platform, memory)
- Chrome installation detection with specific paths
- Quick server health check with startup timing
- Network connectivity validation
- Build status verification

### All Tests - ~7-13 minutes
```bash
npm run test:all      # Runs quick + full + performance tests
npm run test:dashboard # Unified test runner with reporting
```

The test dashboard provides:
- Unified execution of multiple test categories
- Real-time progress reporting
- Performance metrics and timing
- Overall test status summary
- Recommendations for failed tests
- JSON results saved to `test-results/` directory

### Integration Testing
```bash
npm run test:integration  # Claude Code CLI integration testing
```

For detailed testing information, see [TESTING.md](TESTING.md).

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

This MCP server is based on the excellent [puppeteer-real-browser](https://github.com/ZFC-Digital/puppeteer-real-browser) library by ZFC-Digital.

**Thank you** to the puppeteer-real-browser team for creating such a powerful and detection-resistant browser automation solution!

- GitHub: [https://github.com/ZFC-Digital/puppeteer-real-browser](https://github.com/ZFC-Digital/puppeteer-real-browser)
- npm: [https://www.npmjs.com/package/puppeteer-real-browser](https://www.npmjs.com/package/puppeteer-real-browser)
