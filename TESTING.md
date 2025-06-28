# Testing Guide

This document explains the restructured testing approach for the puppeteer-real-browser MCP server, with clear separation of concerns and elimination of redundancy.

## Testing Philosophy

Each testing approach serves a specific purpose:

- **Jest Tests**: Fast protocol compliance and unit testing for CI/CD
- **MCP Client Tests**: Comprehensive end-to-end functional testing
- **Performance Tests**: Benchmarking and load testing
- **Claude Code Integration**: Real-world user experience validation
- **Debug Tools**: Quick troubleshooting and environment validation

## Test Categories

### 1. Quick Tests (`npm run test:quick`) - ~30 seconds
**Purpose**: Fast feedback for development and CI/CD

**Location**: `test/` directory
**Technology**: Jest
**Coverage**:
- ✅ Server startup validation
- ✅ JSON-RPC protocol compliance  
- ✅ Tool availability (centralized)
- ✅ Error handling implementation
- ✅ Code structure validation

**When to use**:
- Before committing code
- In CI/CD pipelines
- Quick development feedback

### 2. Full Functional Tests (`npm run test:full`) - ~5-10 minutes
**Purpose**: Comprehensive end-to-end functionality testing

**Location**: `tests/mcp-testing/` directory
**Technology**: Custom MCP client
**Coverage**:
- ✅ MCP client connection (Phase 1)
- ✅ Browser operations (Phase 2)
- ✅ Error recovery (Phase 3)
- ✅ Advanced features (Phase 4)

**When to use**:
- Before releases
- Testing complex scenarios
- Validating bug fixes

### 3. Performance Tests (`npm run test:performance`) - ~2-3 minutes
**Purpose**: Performance benchmarking and load testing

**Location**: `tests/performance/` directory
**Technology**: Custom performance framework
**Coverage**:
- ⚡ Browser initialization timing
- ⚡ Navigation performance
- ⚡ Screenshot generation speed
- ⚡ Concurrent operation handling
- ⚡ Session longevity testing

**When to use**:
- Performance regression testing
- Before performance-critical releases
- Identifying bottlenecks

### 4. Integration Tests (`npm run test:integration`)
**Purpose**: Real-world user experience validation

**Location**: `tests/mcp-testing/claude-prompts/` directory
**Technology**: Claude Code CLI
**Coverage**:
- 🤝 Claude Code integration
- 🤝 Natural language commands
- 🤝 User workflow validation

**When to use**:
- User acceptance testing
- Integration validation
- End-user experience verification

### 5. Debug Tools (`npm run test:debug`) - ~10 seconds
**Purpose**: Quick environment and troubleshooting validation

**Location**: `debug-server.js`
**Technology**: Custom diagnostics
**Coverage**:
- 🔍 Environment validation
- 🔍 Chrome installation check
- 🔍 Network connectivity
- 🔍 Quick server health check

**When to use**:
- Troubleshooting setup issues
- Environment validation
- Quick health checks

## Running Tests

### Individual Test Categories
```bash
# Quick protocol compliance tests (30s)
npm run test:quick

# Comprehensive functional tests (5-10min)
npm run test:full

# Performance benchmarking (2-3min)
npm run test:performance

# Debug and troubleshooting (10s)
npm run test:debug

# All automated tests (7-13min)
npm run test:all
```

### Default Test Command
```bash
# Runs quick tests by default
npm test
```

## Test Organization Structure

```
puppeteer-real-browser-mcp-server/
├── test/                           # Jest tests (quick)
│   ├── server.test.ts             # Protocol compliance
│   └── setup.ts                   # Jest configuration
├── tests/
│   ├── mcp-testing/               # End-to-end tests (full)
│   │   ├── phase1-protocol-tests.js    # MCP client connection
│   │   ├── phase2-browser-tests.js     # Browser operations
│   │   ├── phase3-error-recovery-tests.js  # Error handling
│   │   ├── phase4-advanced-features-tests.js  # Advanced features
│   │   └── claude-prompts/        # Integration test prompts
│   └── performance/               # Performance tests
│       └── performance-tests.js   # Benchmarking suite
└── debug-server.js               # Debug tools
```

## Test Coverage Matrix

| Test Area | Jest | MCP Client | Performance | Integration | Debug |
|-----------|------|------------|-------------|-------------|-------|
| Protocol Compliance | ✅ | ❌ | ❌ | ❌ | ❌ |
| Tool Validation | ✅ | ❌ | ❌ | ❌ | ❌ |
| Server Startup | ✅ | ❌ | ❌ | ❌ | ✅ |
| Browser Operations | ❌ | ✅ | ❌ | ✅ | ❌ |
| Error Recovery | ❌ | ✅ | ❌ | ❌ | ❌ |
| Performance Metrics | ❌ | ❌ | ✅ | ❌ | ❌ |
| Environment Validation | ❌ | ❌ | ❌ | ❌ | ✅ |
| User Experience | ❌ | ❌ | ❌ | ✅ | ❌ |

## Best Practices

### For Development
1. Run `npm run test:quick` frequently during development
2. Use `npm run test:debug` when encountering setup issues
3. Run `npm run test:full` before major commits

### For CI/CD
1. Use `npm run test:quick` for fast feedback in CI
2. Run `npm run test:all` for release validation
3. Set up performance regression alerts with performance tests

### For Debugging
1. Start with `npm run test:debug` for environment issues
2. Check Jest tests for protocol compliance issues
3. Use MCP client tests for functional debugging
4. Use Claude Code integration tests for user experience issues

## Optimization Results

This restructured approach has eliminated redundancy:

- ❌ **Removed**: Duplicate protocol testing (was in 3 places)
- ❌ **Removed**: Duplicate tool validation (was in 4 places)  
- ❌ **Removed**: Redundant standalone scripts
- ✅ **Added**: Performance testing framework
- ✅ **Added**: Focused debug tools
- ✅ **Added**: Clear test categorization

**Result**: Faster execution, better organization, comprehensive coverage without redundancy.

## Performance Thresholds

The performance tests include these thresholds:

- **Browser Init**: < 5 seconds (warning if exceeded)
- **Navigation**: < 10 seconds per site (warning if exceeded)
- **Session Longevity**: > 90% success rate (warning if below)
- **Screenshot Generation**: Benchmarked for regression detection

## Getting Help

If tests fail:

1. **Environment Issues**: Run `npm run test:debug`
2. **Protocol Issues**: Check `npm run test:quick` output
3. **Functional Issues**: Check `npm run test:full` logs
4. **Performance Issues**: Run `npm run test:performance`
5. **Integration Issues**: Try Claude Code prompts manually

For detailed test logs, check the `tests/mcp-testing/test-logs/` directory.