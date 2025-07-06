# Puppeteer Real Browser MCP Server

**Give your AI assistant browser superpowers.** This MCP server lets AI assistants like Claude control a real web browser - click buttons, fill forms, take screenshots, and extract data from any website while avoiding bot detection.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## What This Does

Transform your AI assistant into a web automation expert that can:
- **Browse any website** naturally without being blocked
- **Take screenshots** and analyze visual content
- **Fill forms and click buttons** like a human user
- **Extract data** from any web page
- **Solve captchas** automatically
- **Work across platforms** (Windows, Mac, Linux)

Perfect for research, data collection, testing, and automating repetitive web tasks.

## 🚀 Quick Start

### Step 1: Install Node.js
Download and install Node.js 18+ from [nodejs.org](https://nodejs.org/)

### Step 2: Choose Your Platform

#### Claude Desktop (Most Popular)
1. **Find your config file**:
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
   - **Mac**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Linux**: `~/.config/Claude/claude_desktop_config.json`

2. **Add this configuration**:
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

3. **Restart Claude Desktop**

#### Claude Code CLI (For Developers)
```bash
claude mcp add puppeteer-real-browser -- npx puppeteer-real-browser-mcp-server@latest
```

#### Cursor IDE (For Developers)
Create `.cursor/mcp.json` with the same configuration as Claude Desktop above.

### Step 3: Test It Works
Ask your AI assistant:
> "Initialize a browser, go to google.com, and take a screenshot"

If successful, you'll see a browser window open and a screenshot appear!

## 🎯 What You Can Do

### Web Browsing & Research
- "Browse to Amazon and search for laptops under $500"
- "Navigate to this article and summarize the key points"
- "Check if this product is in stock"

### Data Collection
- "Extract all email addresses from this contact page"
- "Get the prices of all products on this page"
- "Save this table data as text"

### Form Automation
- "Fill out this contact form with my details"
- "Submit this job application"
- "Login to my account and download the latest invoice"

### Visual Analysis
- "Take a screenshot of this page and describe what you see"
- "Show me what this website looks like on mobile"
- "Capture this error message"

## 🔧 Configuration Options

### Browser Settings
Configure through your AI assistant conversation:
- **Headless mode**: "Initialize browser in headless mode"
- **Custom Chrome path**: "Use Chrome at /path/to/chrome"
- **Proxy settings**: "Initialize browser with proxy http://proxy:8080"
- **Slow mode**: "Initialize browser with 500ms delay between actions"

### Advanced Options
```json
{
  "headless": false,
  "proxy": "http://proxy:8080",
  "customConfig": {
    "chromePath": "/path/to/chrome"
  },
  "connectOption": {
    "slowMo": 250,
    "timeout": 60000
  }
}
```

## 🛠️ Available Tools

| Tool | Purpose | Example |
|------|---------|---------|
| `browser_init` | Start browser | "Initialize a browser" |
| `navigate` | Go to URL | "Navigate to google.com" |
| `screenshot` | Take screenshot | "Take a screenshot" |
| `click` | Click element | "Click the search button" |
| `type` | Type text | "Type 'hello world' in the search box" |
| `get_content` | Extract content | "Get the page text" |
| `wait` | Wait for element | "Wait for the page to load" |
| `find_selector` | Find element | "Find the submit button" |
| `solve_captcha` | Solve captcha | "Solve the reCAPTCHA" |
| `random_scroll` | Natural scrolling | "Scroll down naturally" |
| `browser_close` | Close browser | "Close the browser" |

## 🔒 Safety & Best Practices

### Security
- **Always review** what your AI assistant is doing before approving sensitive actions
- **Use headless mode** for background tasks to avoid interruption
- **Respect websites** and their terms of service
- **Set reasonable delays** to avoid overwhelming servers

### Performance
- **Close browsers** when finished to free up resources
- **Use specific selectors** for better reliability
- **Handle errors gracefully** with retry logic

### Detection Avoidance
- **Built-in stealth features** make the browser appear human-like
- **Natural timing** and scrolling patterns
- **Proxy support** for additional anonymity
- **Real browser engine** bypasses most detection systems

## 📋 Requirements

- **Node.js 18+** (required)
- **Google Chrome** (auto-detected on most systems)
- **Internet connection** (for downloading package)

### Platform Support
- ✅ **Windows** (comprehensive Chrome detection)
- ✅ **macOS** (automatic Chrome detection)
- ✅ **Linux** (includes headless support)

## 🆘 Need Help?

### Common Issues
1. **Browser won't start**: Check Chrome installation and try running as administrator
2. **Connection refused**: Kill existing Chrome processes and retry
3. **Permission errors**: Install Node.js with proper permissions
4. **Slow performance**: Use headless mode and adjust timeout settings

### Get Support
- **Quick issues**: Check [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for detailed solutions
- **Bug reports**: [GitHub Issues](https://github.com/withLinda/puppeteer-real-browser-mcp-server/issues)
- **Feature requests**: [GitHub Discussions](https://github.com/withLinda/puppeteer-real-browser-mcp-server/discussions)

### Debug Information
Run diagnostics:
```bash
npm run test:debug
```

## 🏗️ For Developers

### Installation for Development
```bash
git clone https://github.com/withLinda/puppeteer-real-browser-mcp-server.git
cd puppeteer-real-browser-mcp-server
npm install
npm run dev
```

### Testing
```bash
npm test              # Quick tests
npm run test:full     # Comprehensive tests
npm run test:all      # All test suites
```

### Architecture
- **MCP Protocol**: Standard interface for AI assistant integration
- **TypeScript**: Full type safety and modern JavaScript features
- **Modular Design**: Clean separation of concerns
- **Comprehensive Testing**: Unit, integration, and e2e tests

For detailed development information, see [TESTING.md](TESTING.md).

## 📚 Technical Details

### Version History
- **v1.5.x**: Current stable release with enhanced Windows support
- **v1.3.x**: Major Windows compatibility improvements
- **v1.2.x**: Stack overflow protection and stability fixes
- **v1.0.x**: Initial release with core functionality

### Dependencies
- **@modelcontextprotocol/sdk**: MCP protocol implementation
- **puppeteer-real-browser**: Stealth browser automation engine

### Performance Metrics
- **Startup time**: ~2-3 seconds
- **Memory usage**: ~100-200MB per browser instance
- **Network overhead**: Minimal (only package download)

## 🤝 Contributing

Contributions welcome! Please see our [contribution guidelines](CONTRIBUTING.md).

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

Built on the excellent [puppeteer-real-browser](https://github.com/ZFC-Digital/puppeteer-real-browser) library by ZFC-Digital.

Special thanks to the puppeteer-real-browser team for creating such a powerful and detection-resistant browser automation solution!