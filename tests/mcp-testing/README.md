# MCP Server Test Suite

This directory contains a comprehensive test suite for the puppeteer-real-browser MCP server, implementing all test phases from TESTING_CHECKLIST.md.

## Installation

```bash
cd tests/mcp-testing
npm install
```

## Running Tests

### Quick Smoke Test (30 seconds)
```bash
npm run test:smoke
# or
./run-smoke-test.js
```

### Full Test Suite (5-10 minutes)
```bash
npm test
# or
./run-all-tests.js
```

### Individual Phase Tests
```bash
npm run test:phase1  # Protocol tests
npm run test:phase2  # Browser operations
npm run test:phase3  # Error recovery
npm run test:phase4  # Advanced features
```

## Test Phases

1. **Phase 1: Basic MCP Protocol Testing**
   - Server initialization
   - Tool availability verification
   - Protocol compliance (resources/list, prompts/list)

2. **Phase 2: Basic Browser Operations**
   - Browser initialization (headless and non-headless)
   - Simple navigation
   - Screenshot capture
   - Content retrieval

3. **Phase 3: Error Recovery Testing**
   - Original failing scenario (cursor.com/dashboard)
   - Complex navigation with retries
   - Error categorization
   - Session recovery

4. **Phase 4: Advanced Features Testing**
   - Standard actions (typing, clicking, scrolling)
   - Wait conditions
   - Element interactions
   - Selector-based operations

## Test Output

All test results are saved to the `test-logs/` directory:

- `test-run-[timestamp].log` - Full test log
- `errors-[timestamp].log` - Error-only log
- `results-[timestamp].json` - Structured JSON results
- `summary-[timestamp].md` - Markdown summary report

## Error Monitoring

The test suite automatically:
- Logs all errors to separate error files
- Tracks retry attempts
- Records performance metrics
- Identifies session recovery events
- Categorizes errors by type

## Interpreting Results

### Success Criteria
- ✅ **PASSED**: Test completed successfully
- ❌ **FAILED**: Test encountered an error
- ⏭️ **SKIPPED**: Test was not run

### Key Metrics
- **Retry Count**: Number of retry attempts (indicates recovery mechanisms working)
- **Session Recovery**: Whether the browser session was recovered after failure
- **Performance**: Operation durations (initialization, navigation, screenshots)

## Common Issues

1. **Server Not Starting**: Check that `dist/index.js` exists (run `npm run build` in project root)
2. **Chrome Not Found**: Ensure Chrome/Chromium is installed
3. **Permission Errors**: Check file permissions and Chrome executable permissions
4. **Network Issues**: Some tests require internet access

## Development

To add new test phases:

1. Create a new file `phaseX-description-tests.js`
2. Extend the base pattern from existing phase files
3. Add the phase to `run-all-tests.js`
4. Update this README

## Exit Codes

- `0`: All tests passed
- `1`: One or more tests failed