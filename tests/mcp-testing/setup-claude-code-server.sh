#!/bin/bash

# Setup script for adding puppeteer-real-browser MCP server to Claude Code

echo "=== Claude Code MCP Server Setup ==="
echo

# Get the project root directory
PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
echo "Project root: $PROJECT_ROOT"

# Check if dist/index.js exists
if [ ! -f "$PROJECT_ROOT/dist/index.js" ]; then
    echo "Error: dist/index.js not found. Building project..."
    cd "$PROJECT_ROOT"
    npx tsc
    if [ $? -ne 0 ]; then
        echo "Build failed. Please fix build errors and try again."
        exit 1
    fi
fi

# Server name for testing
SERVER_NAME="puppeteer-test-server"

# Remove existing server if present
echo "Removing any existing $SERVER_NAME..."
claude mcp remove "$SERVER_NAME" 2>/dev/null || true

# Add the server
echo "Adding MCP server to Claude Code..."
claude mcp add "$SERVER_NAME" -- node "$PROJECT_ROOT/dist/index.js"

if [ $? -eq 0 ]; then
    echo
    echo "✅ Server added successfully!"
    echo
    echo "Next steps:"
    echo "1. Run: claude"
    echo "2. Type: /mcp"
    echo "3. Verify $SERVER_NAME is listed and connected"
    echo
    echo "To test, you can use the prompts in: $PROJECT_ROOT/tests/mcp-testing/claude-prompts/"
    echo "Example: @$PROJECT_ROOT/tests/mcp-testing/claude-prompts/test-all-tools.txt"
else
    echo
    echo "❌ Failed to add server. Please check the error message above."
    exit 1
fi