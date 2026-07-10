# Puppeteer Real Browser MCP Server

[![npm version](https://img.shields.io/npm/v/puppeteer-real-browser-mcp-server.svg)](https://www.npmjs.com/package/puppeteer-real-browser-mcp-server)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-43853d.svg)](./package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

Give an MCP-compatible AI assistant a local Chrome browser that it can open,
navigate, read, and control.

> **Under maintenance:** This project is still changing. The `main` branch may
> be newer than the package published on npm. The npm badge above shows the
> published version used by `@latest`.

## What it does

This package runs as a local [Model Context Protocol (MCP)](https://modelcontextprotocol.io/)
server. Your MCP client starts the server, and the server starts one Chrome
process for browser automation.

Main features:

- Opens a visible browser by default, with optional headless mode
- Navigates pages and reads HTML or text
- Finds elements, clicks, types, waits, and scrolls
- Uses `rebrowser-puppeteer-core` and a small set of anti-detection settings
- Detects Chrome on Windows, macOS, and Linux
- Supports a custom Chrome path, proxy, and dedicated automation profile
- Tracks the exact Chrome process it starts and closes only that process
- Enforces a content-first workflow before page interaction

No browser automation is invisible. Websites may still detect it or block it.

## Safety and current limits

Please read this before using the server:

- Use it only on websites you are allowed to automate.
- Review tool calls before approving logins, forms, purchases, downloads, or
  other sensitive actions.
- The browser and file tools run with your normal user permissions.
- The server supports one browser session at a time.
- `solve_captcha` is currently a placeholder. It does not use a CAPTCHA-solving
  service. Browser startup only makes a best-effort click on detected Turnstile
  widgets.
- `save_content_as_markdown` is listed by the server, but the current workflow
  validator blocks it. This is a known code issue.

## Requirements

- [Node.js](https://nodejs.org/) 18 or newer
- npm and `npx` (included with the normal Node.js installer)
- Google Chrome or Chromium
- An MCP client that can start a local `stdio` server

Claude Desktop is available on macOS and Windows. Other MCP clients can use
this server on Linux.

## Quick start

You do not need to install this package globally. `npx` can download and run
the published package when your MCP client needs it.

The `-y` option prevents an npm install question from blocking the MCP server
while it starts.

### Claude Desktop

1. Open **Claude Desktop → Settings → Developer → Edit Config**.
2. Add this server inside `mcpServers`:

```json
{
  "mcpServers": {
    "puppeteer-real-browser": {
      "command": "npx",
      "args": [
        "-y",
        "puppeteer-real-browser-mcp-server@latest"
      ]
    }
  }
}
```

1. Save the file.
2. Fully quit Claude Desktop, then open it again.

Claude Desktop stores this file here:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

See the official [local MCP server guide](https://modelcontextprotocol.io/docs/develop/connect-local-servers)
for the current Claude Desktop steps.

### Claude Code

Run:

```bash
claude mcp add --transport stdio puppeteer-real-browser \
  -- npx -y puppeteer-real-browser-mcp-server@latest
```

Then check the connection:

```bash
claude mcp get puppeteer-real-browser
```

Inside Claude Code, `/mcp` also shows server status.

The default scope is local to the current project. Add `--scope user` before
the server name if you want the server in all your projects. See the official
[Claude Code MCP guide](https://code.claude.com/docs/en/mcp) for scope details.

### Cursor

Create `.cursor/mcp.json` in one project, or `~/.cursor/mcp.json` for all
projects:

```json
{
  "mcpServers": {
    "puppeteer-real-browser": {
      "command": "npx",
      "args": [
        "-y",
        "puppeteer-real-browser-mcp-server@latest"
      ]
    }
  }
}
```

Restart Cursor after saving the file. See the official
[Cursor MCP guide](https://docs.cursor.com/context/model-context-protocol) for
current configuration locations and formats.

### Other MCP clients

Use a local `stdio` server with this command and argument list:

```text
command: npx
args: -y puppeteer-real-browser-mcp-server@latest
```

The server communicates through standard input and standard output. Your MCP
client must keep the process open while it uses the tools.

### Test the setup

Ask your AI assistant:

> Start the browser, open <https://example.com>, read the page text, and then
> close the browser.

The expected tool order is:

```text
browser_init → navigate → get_content → browser_close
```

## Available tools

The server exposes 11 tools.

| Tool | Purpose | Required input |
| --- | --- | --- |
| `browser_init` | Start or reuse the managed Chrome session | None |
| `navigate` | Open a URL | `url` |
| `get_content` | Read full-page or selected HTML/text | None |
| `find_selector` | Find a CSS selector from element text | `text` |
| `click` | Click an element | `selector` |
| `type` | Clear and type into an input | `selector`, `text` |
| `wait` | Wait for a selector, navigation, or time | `type`, `value` |
| `random_scroll` | Scroll with varied timing and distance | None |
| `solve_captcha` | Return a placeholder attempt result | `type` |
| `save_content_as_markdown` | Save as `.md`; currently blocked | `filePath` |
| `browser_close` | Close the managed browser and reset workflow state | None |

### Content-first workflow

The server blocks blind interaction. Use this order:

```text
browser_init → navigate → get_content → find_selector → click or type
```

After a new navigation, call `get_content` again before clicking or typing.
You can call `wait` after navigation when a page loads content slowly.

## Browser configuration

Browser options are inputs to `browser_init`. They are not top-level MCP
server settings.

| Option | Meaning |
| --- | --- |
| `headless` | Set `true` to hide the browser window. Default: `false`. |
| `proxy` | Proxy URL such as `http://proxy.example.com:8080`. |
| `profilePath` | Dedicated automation profile path. |
| `disableXvfb` | Set `false` to start Xvfb on Linux. |
| `connectOption.timeout` | Connection and setup timeout in ms. |
| `connectOption.slowMo` | Delay operations in ms. |
| `customConfig.chromePath` | Absolute path to a Chrome executable. |
| `customConfig.chromeFlags` | Custom flags; replaces the server flag list. |
| `contentPriority` | Content-priority suggestion settings. |

`contentPriority` is an object with `prioritizeContent` and
`autoSuggestGetContent` Boolean values. It changes suggestions, but it does not
remove the required content-first workflow.

Example request:

```json
{
  "headless": true,
  "proxy": "http://proxy.example.com:8080",
  "connectOption": {
    "timeout": 60000,
    "slowMo": 100
  },
  "customConfig": {
    "chromePath": "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  }
}
```

### Chrome path

The server first checks these environment variables:

1. `CHROME_PATH`
2. `PUPPETEER_EXECUTABLE_PATH`

If neither points to a file, the server checks common Chrome and Chromium
locations. On Windows, it also checks the registry and common portable paths.

You can set `CHROME_PATH` in the MCP client configuration:

```json
{
  "mcpServers": {
    "puppeteer-real-browser": {
      "command": "npx",
      "args": [
        "-y",
        "puppeteer-real-browser-mcp-server@latest"
      ],
      "env": {
        "CHROME_PATH": "/absolute/path/to/chrome"
      }
    }
  }
}
```

`PROXY_URL` is not a supported environment variable. Pass a proxy to
`browser_init` instead.

### Browser ownership protection

The server keeps the exact launcher handle and process ID for the Chrome
process it starts. Normal close, startup failure, timeout, MCP disconnect, and
signal shutdown all clean up through that handle. It does not search for or
close Chrome by process name.

For safety, the server rejects settings that could attach to another browser
or take ownership of a personal Chrome profile:

- `customConfig.userDataDir`
- `customConfig.port`
- `customConfig.portStrictMode`
- `customConfig.handleSIGINT`
- `connectOption.browserURL`
- `connectOption.browserWSEndpoint`
- `connectOption.transport`
- `--remote-debugging-port`, `--remote-debugging-pipe`, and `--user-data-dir`
  inside custom Chrome flags

Use `profilePath` for persistent automation data. The directory must be
absolute and either empty or already marked as owned by this server.

## Troubleshooting

### The MCP server does not appear

1. Check the tools are installed:

   ```bash
   node --version
   npm --version
   npx --version
   ```

2. Check that Node.js is version 18 or newer.
3. Check the JSON file for missing commas or quotes.
4. Fully quit and reopen the MCP client.
5. If a desktop app cannot find `npx`, use its absolute path as `command`.
   Run `which npx` on macOS/Linux or `where npx` on Windows to find it.

Claude Desktop logs are stored here:

- macOS: `~/Library/Logs/Claude`
- Windows: `%APPDATA%\Claude\logs`

### Chrome is not found

Find the real Chrome executable, then set `CHROME_PATH` in the MCP client
configuration. Common examples are:

- Windows: `C:/Program Files/Google/Chrome/Application/chrome.exe`
- macOS: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
- Linux: `/usr/bin/google-chrome` or `/usr/bin/chromium`

Do not run the MCP client as Administrator or use `sudo npm install -g` only to
solve a Chrome path problem.

### The server looks stuck when run in a terminal

This can be normal. A `stdio` MCP server waits for protocol messages from an MCP
client. Use the MCP Inspector instead of typing into the process.

Test the published package:

```bash
npx -y @modelcontextprotocol/inspector \
  npx puppeteer-real-browser-mcp-server@latest
```

See the official [MCP Inspector guide](https://modelcontextprotocol.io/docs/tools/inspector)
for usage details.

### A page action is blocked

Follow the required workflow:

1. `browser_init`
2. `navigate`
3. `get_content`
4. `find_selector` when you need a selector
5. `click` or `type`

If the page changed, call `get_content` again.

### A browser connection times out

- Check that the Chrome path exists.
- Close the current managed browser with `browser_close`, then start it again.
- Increase `connectOption.timeout` in the `browser_init` input.
- Check whether security software is blocking the child Chrome process.
- Include the full error message when reporting the problem.

### Get help

Search or open a [GitHub issue](https://github.com/withLinda/puppeteer-real-browser-mcp-server/issues).
Include:

- Operating system
- Node.js and npm versions
- MCP client name and version
- Chrome version and executable path
- Full error message
- Exact steps that reproduce the problem

Do not include passwords, cookies, tokens, or private page content.

## Development

### Run from source

```bash
git clone https://github.com/withLinda/puppeteer-real-browser-mcp-server.git
cd puppeteer-real-browser-mcp-server
npm ci
npm run build
```

Test the local build with the MCP Inspector:

```bash
npx -y @modelcontextprotocol/inspector node dist/index.js
```

To use the local build in an MCP client, use an absolute path:

```json
{
  "mcpServers": {
    "puppeteer-real-browser-local": {
      "command": "node",
      "args": [
        "/absolute/path/to/puppeteer-real-browser-mcp-server/dist/index.js"
      ]
    }
  }
}
```

### Project structure

```text
src/index.ts                     MCP stdio server and request handlers
src/tool-definitions.ts          Tool names and input schemas
src/browser-manager.ts           Browser state, detection, and configuration
src/managed-browser-session.ts   Owned Chrome launch and cleanup
src/handlers/                    Tool implementations
src/*.test.ts                    Unit and regression tests
test/integration/                MCP protocol integration tests
test/e2e/                        Real-browser tests
test/safety/                     Browser cleanup safety guard
scripts/check-packaged-server.ts Package smoke test
```

### Test workflow

Use TDD for behavior changes: write one failing test, make it pass, then clean
up the code.

```bash
# Browser cleanup safety guard
npm run test:safety

# Fast source tests
npm run test:unit

# MCP protocol integration tests
npm run test:integration

# Build the package
npm run build

# Test the built npm package shape and stdio lifecycle
npm run test:package:smoke:built

# Real Chrome tests
npm run test:e2e

# Release-focused automated checks
npm run test:all
```

During TDD, use `npm run test:watch`. Before running real-browser tests, note
the Chrome processes already open on your machine. After testing, verify that
only the Chrome process started by the test was closed.

## Contributing

Issues and pull requests are welcome. For a code change:

1. Create a focused branch.
2. Add a failing test for one behavior.
3. Make the smallest code change that passes the test.
4. Refactor while tests stay green.
5. Run the safety, source, build, and package checks.
6. Explain the root cause, solution, prevention, and verification in the commit
   message.

## License

This project uses the [MIT License](./LICENSE).

## Acknowledgments

The original implementation and public API were based on
[`puppeteer-real-browser`](https://github.com/ZFC-Digital/puppeteer-real-browser)
by ZFC Digital. The current source replaces that end-of-life runtime dependency
with an internal managed launcher built from `chrome-launcher`,
`rebrowser-puppeteer-core`, and `ghost-cursor`.
