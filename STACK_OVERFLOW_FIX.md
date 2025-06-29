# Stack Overflow Fix for Screenshot Functionality

## Problem Description

The puppeteer-real-browser MCP server was experiencing "Maximum call stack size exceeded" errors when taking screenshots. This issue is caused by the rebrowser patches used in puppeteer-real-browser, which can create recursive function calls in certain scenarios.

## Root Cause

The error occurs because:
1. **puppeteer-real-browser** uses rebrowser patches that modify the browser runtime
2. These patches can cause recursive function calls, particularly during screenshot operations
3. Unlike puppeteer-extra-plugin-stealth, you cannot selectively disable specific evasions in puppeteer-real-browser
4. The stealth behaviors are built into the browser core through rebrowser patches

## Implemented Solutions

### 1. Enhanced Error Handling
- Added specific detection for "Maximum call stack size exceeded" errors
- Implemented automatic fallback methods when stack overflow is detected

### 2. Fallback Screenshot Methods
The fix implements a cascading fallback system:

1. **Primary Method**: Standard puppeteer screenshot
2. **First Fallback**: Chrome DevTools Protocol (CDP) direct method with limited viewport
3. **Last Resort**: Simple screenshot with minimal options

### 3. Safe Mode Option
Added a new `safeMode` parameter to the screenshot tool:
```json
{
  "safeMode": true
}
```

When enabled, the screenshot tool proactively uses the safer CDP method instead of waiting for an error.

### 4. Browser Configuration Improvements
Enhanced Chrome launch flags to reduce stack overflow likelihood:
- `--disable-dev-shm-usage`: Overcome limited resource problems
- `--no-sandbox`: Bypass OS security model
- `--disable-features=VizDisplayCompositor`: Disable GPU compositing
- `--max-old-space-size=4096`: Increase memory limit
- `--stack-size=16000`: Increase stack size limit

## Usage

### Standard Usage (with automatic fallback)
```json
{
  "name": "screenshot",
  "arguments": {
    "fullPage": false
  }
}
```

### Safe Mode Usage (proactive prevention)
```json
{
  "name": "screenshot",
  "arguments": {
    "fullPage": false,
    "safeMode": true
  }
}
```

### Element Screenshot with Safe Mode
```json
{
  "name": "screenshot",
  "arguments": {
    "selector": "button.my-button",
    "safeMode": true
  }
}
```

## Technical Details

### CDP Method
The fallback uses Chrome DevTools Protocol directly:
- Limits viewport size to prevent memory issues
- Sets `captureBeyondViewport: false` to avoid recursive calls
- Uses quality: 80 to reduce data size
- Properly detaches CDP session to prevent memory leaks

### Error Detection
The fix specifically looks for:
```javascript
error.message.includes('Maximum call stack size exceeded')
```

### Logging
The fix provides detailed logging to help diagnose issues:
- Stack overflow detection messages
- Fallback method attempts
- Error details for troubleshooting

## Benefits

1. **Automatic Recovery**: Screenshots work even when stack overflow occurs
2. **Proactive Prevention**: Safe mode prevents issues before they happen
3. **Backwards Compatible**: Existing code continues to work without changes
4. **Detailed Logging**: Better debugging information for troubleshooting
5. **Multiple Fallbacks**: Three levels of fallback ensure maximum reliability

## Limitations

- Safe mode screenshots may have slightly reduced quality (80% instead of 100%)
- Viewport-only screenshots in fallback mode (no full page)
- Element screenshots not supported in CDP fallback mode

## Future Considerations

Since puppeteer-real-browser is no longer actively maintained (as of February 2025), consider:
1. Migrating to puppeteer-extra-plugin-stealth for more control
2. Using vanilla Puppeteer if stealth features aren't critical
3. Monitoring for community forks or alternatives

## Testing

The fix has been tested with:
- Standard screenshot operations
- Full page screenshots
- Element-specific screenshots
- Safe mode enabled scenarios
- Fallback method triggering

All scenarios now handle stack overflow gracefully with appropriate fallback methods.