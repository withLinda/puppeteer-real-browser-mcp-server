# Troubleshooting Guide

This guide provides comprehensive solutions for common issues with the puppeteer-real-browser MCP server.

## Quick Diagnosis

Before diving into specific issues, try these quick checks:

1. **Verify Node.js version**: `node --version` (requires >= 18.0.0)
2. **Test npx**: `npx --version` (should return a version number)
3. **Kill zombie Chrome processes**: `pkill -f "Google Chrome" || taskkill /f /im chrome.exe`
4. **Restart your IDE/AI assistant completely**

## Major Issues and Solutions

### 1. Windows Connection Issues (ECONNREFUSED)

**Error**: `connect ECONNREFUSED 127.0.0.1:60725`

**Enhanced Chrome Path Detection (Fixed in v1.3.0)**:
- Windows Registry-based Chrome detection
- Expanded search to 15+ Windows installation locations
- Chrome Canary fallback support
- Environment variable support (`CHROME_PATH`, `PUPPETEER_EXECUTABLE_PATH`)

**Solutions**:

1. **Environment Variables (Recommended)**:
   ```bash
   set CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
   ```

2. **Manual Chrome Path Configuration**:
   Ask your AI assistant: "Initialize browser with custom Chrome path at C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"

3. **Network Troubleshooting**:
   ```bash
   # Test localhost resolution
   ping localhost
   # Should resolve to 127.0.0.1
   
   # Check Windows hosts file
   notepad C:\Windows\System32\drivers\etc\hosts
   # Ensure: 127.0.0.1 localhost
   ```

4. **Chrome Process Management**:
   ```bash
   # Kill existing Chrome processes
   taskkill /f /im chrome.exe
   ```

### 2. Chrome Browser Launch Issues

**Windows-Specific Solutions**:

1. **Verify Chrome Installation Paths**:
   Check these locations in order:
   - `C:\Program Files\Google\Chrome\Application\chrome.exe`
   - `C:\Program Files (x86)\Google\Chrome\Application\chrome.exe`
   - `%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe`
   - `%PROGRAMFILES%\Google\Chrome\Application\chrome.exe`

2. **Manual Path Configuration**:
   ```
   Ask AI: "Initialize browser with custom Chrome path at C:\Your\Chrome\Path\chrome.exe"
   ```

3. **Windows Launch Arguments**:
   ```
   Ask AI: "Initialize browser with args --disable-gpu --disable-setuid-sandbox"
   ```

4. **Windows-Specific Solutions**:
   - Run as Administrator
   - Add Chrome and Node.js to Windows Defender exclusions
   - Temporarily disable antivirus software
   - Lower UAC settings temporarily
   - Kill existing Chrome processes in Task Manager

5. **Alternative Chrome Installation**:
   - Download Chrome from [google.com/chrome](https://www.google.com/chrome/)
   - Install to default location (`C:\Program Files\Google\Chrome\`)
   - Restart your IDE after installation

**Linux**: 
```bash
sudo apt-get install -y google-chrome-stable
# Or: sudo apt-get install -y chromium-browser
```

**macOS**: 
Ensure Chrome is installed in `/Applications/Google Chrome.app/`

### 3. npx and Node.js Issues

**"spawn npx ENOENT" or "command not found"**:

1. **Verify Node.js installation**:
   ```bash
   node --version
   npm --version
   ```

2. **Reinstall Node.js**:
   - Download from [nodejs.org](https://nodejs.org/)
   - Restart your IDE after installation

3. **NVM (Node Version Manager) Issues**:
   - **Solution 1**: Use absolute paths in your config:
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
   - **Solution 2**: Set default Node version: `nvm alias default 20.0.0`

4. **Permission Issues**:
   - **Mac/Linux**: `sudo npx puppeteer-real-browser-mcp-server@latest`
   - **Better solution**: `npm config set prefix ~/.npm`

5. **npx hangs or takes too long**:
   - npx downloads on first run (30-60 seconds)
   - Clear npm cache: `npm cache clean --force`

### 4. AI Assistant Integration Issues

#### Claude Desktop Issues

**"Claude doesn't see the MCP server"**:
1. Verify `claude_desktop_config.json` is in correct location:
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
   - **Mac**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Linux**: `~/.config/Claude/claude_desktop_config.json`

2. Validate JSON syntax at [jsonlint.com](https://jsonlint.com/)

3. Restart Claude Desktop completely

#### Claude Code CLI Issues

**"MCP server not found"**:
1. **Installation Issues**:
   ```bash
   # Verify installation
   claude mcp add puppeteer-real-browser -- npx puppeteer-real-browser-mcp-server@latest
   ```

2. **Check server status**:
   ```bash
   /mcp
   ```

3. **Scope Issues**:
   - Local scope: ensure you're in correct project directory
   - Project scope: verify `.mcp.json` exists in project root
   - User scope: check user config directory

4. **Re-adding Server**:
   ```bash
   claude mcp remove puppeteer-real-browser
   claude mcp add puppeteer-real-browser -- npx puppeteer-real-browser-mcp-server@latest
   ```

#### Cursor IDE Issues

**"MCP server not found"**:
1. **Config file location**:
   - Global: `~/.cursor/mcp.json`
   - Project: `.cursor/mcp.json` in project root
   - Ensure filename is exactly `mcp.json` (not `mcp.json.txt`)

2. **Cursor IDE restart process**:
   - Close Cursor IDE completely (check Task Manager on Windows)
   - Wait 5 seconds, then restart
   - Open Command Palette and check MCP servers

### 5. Stack Overflow Protection

**"Maximum call stack size exceeded"**:
- Fixed in version 1.2.0 with comprehensive protection
- Ensure you're using latest version: `npx puppeteer-real-browser-mcp-server@latest`
- Circuit breaker patterns prevent infinite recursion
- Timeout controls prevent hanging operations

### 6. Advanced Configuration Issues

**Custom Chrome Path**:
```json
{
  "customConfig": {
    "chromePath": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
  }
}
```

**Proxy Configuration**:
```json
{
  "headless": true,
  "proxy": "https://username:password@proxy.example.com:8080"
}
```

**Stealth Mode with Custom Options**:
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

### 7. Performance and Memory Issues

**Memory leaks**:
- Always close browser instances with `browser_close` when done
- Don't initialize multiple browsers without closing previous ones
- Check for uncaught exceptions that might prevent cleanup

**Timeout errors**:
- Increase timeout values: `{ "timeout": 60000 }`
- Use `wait` tool before interacting with elements
- Check network connectivity and website response times

**Detection issues**:
- Use appropriate delays between actions
- Add random delays with `random_scroll`
- Use proxy if needed: `proxy: "http://proxy.example.com:8080"`

## Platform-Specific Troubleshooting

### Windows
- **Chrome Detection**: v1.3.0+ includes Registry-based detection
- **Path Separators**: Use forward slashes or double backslashes in paths
- **Administrator Rights**: Some operations may require elevated privileges
- **Antivirus**: May block Chrome or Node.js operations

### macOS
- **Chrome Location**: Must be in `/Applications/Google Chrome.app/`
- **Permissions**: May need to allow Chrome in System Preferences
- **PATH Issues**: Ensure npm is in PATH for npx commands

### Linux
- **Dependencies**: Install required packages (`xvfb`, `google-chrome-stable`)
- **Headless Mode**: Use `headless: true` if no display available
- **Permissions**: May need `sudo` for global installations

## Debug Mode

Enable debug logging:
```bash
DEBUG=true npm start
```

Or when running from source:
```bash
DEBUG=true npm run dev
```

## Getting Help

If you're still having issues:

1. **Check GitHub Issues**: [GitHub Issues](https://github.com/withLinda/puppeteer-real-browser-mcp-server/issues)

2. **Create a new issue** with:
   - Your operating system
   - Node.js version (`node --version`)
   - npm version (`npm --version`)
   - Full error message
   - Steps to reproduce the problem

3. **Include diagnostic information**:
   ```bash
   # Run diagnostic check
   npm run test:debug
   ```

## FAQ

**Q: When should I use npm install vs npx?**
A: Use npx (recommended) for AI assistant integration. Only use npm install for development or direct command-line usage.

**Q: Why @latest in npx command?**
A: Ensures you always get the newest version with bug fixes and security updates.

**Q: Does this work with headless browsers?**
A: Yes, set `headless: true` in browser_init options.

**Q: Can I use multiple browsers at once?**
A: Currently supports one browser instance. Close the current one before starting a new one.

**Q: What if Chrome is in a non-standard location?**
A: Use the `CHROME_PATH` environment variable or `customConfig.chromePath` option.

**Q: Still getting ECONNREFUSED after v1.3.0?**
A: Try these steps:
1. Set `CHROME_PATH` environment variable
2. Kill all Chrome processes
3. Check Windows hosts file
4. Run as Administrator
5. Add Chrome to antivirus exclusions