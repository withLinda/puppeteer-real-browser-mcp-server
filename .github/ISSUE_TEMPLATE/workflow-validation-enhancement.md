# [ENHANCEMENT] Implement MCP Server Workflow Validation and Token Management

## 🚨 Problem Summary

The MCP server currently allows `find_selector` to be called before obtaining page content, leading to blind selector guessing and repeated failures. Additionally, `get_content` with HTML type can exceed token limits, causing workflow disruption.

## 📋 Detailed Problem Analysis

### Issue Sequence (From Production Logs)
```
1. ⏺ get_content (type: "html") → Error: 196,081 tokens > 25,000 limit
2. ⏺ find_selector (text: "login") → Error: No element found
3. ⏺ find_selector (text: "sign in") → Error: No element found  
4. ⏺ find_selector (text: "Sign In") → Error: No element found
5. 🔴 User intervention required: "please use get_content to find the selector"
6. ✅ get_content (type: "text") → Success, content retrieved
7. ✅ find_selector (text: "Sign in", exact: true) → Success, selector found
```

### Root Cause Analysis

#### 1. **Workflow Enforcement Gap**
- **Problem**: No validation prevents `find_selector` before content analysis
- **Impact**: Leads to blind guessing and assumption-based selector attempts
- **Evidence**: Multiple failed attempts with assumed text ("login", "sign in", "Sign In")

#### 2. **Token Management Deficiency**  
- **Problem**: HTML content can exceed MCP token limits (25,000 tokens)
- **Impact**: Workflow breaks, forcing manual intervention
- **Evidence**: 196,081 tokens returned, 784% over limit

#### 3. **Content Strategy Limitation**
- **Problem**: No intelligent content type selection based on page size
- **Impact**: Inefficient content retrieval causing token violations
- **Evidence**: HTML type used by default regardless of content size

#### 4. **State Management Absence**
- **Problem**: No tracking of tool execution order or prerequisites
- **Impact**: Tools can be called in invalid sequences
- **Evidence**: `find_selector` attempted without prior content analysis

## 🎯 Proposed Solutions

### 1. **Workflow State Machine Implementation**

```typescript
enum WorkflowState {
  BROWSER_INIT = 'browser_init',
  PAGE_LOADED = 'page_loaded', 
  CONTENT_ANALYZED = 'content_analyzed',
  SELECTOR_AVAILABLE = 'selector_available'
}

interface WorkflowContext {
  currentState: WorkflowState;
  lastContentType?: 'html' | 'text';
  contentTokenCount?: number;
  availableSelectors: Map<string, string>;
  pageUrl?: string;
}
```

#### Benefits:
- **Prevents Invalid Sequences**: `find_selector` blocked until content analysis
- **Type Safety**: TypeScript-based validation with discriminated unions
- **Clear Dependencies**: Explicit prerequisites for each tool
- **Better Error Messages**: Context-aware guidance for users

### 2. **Intelligent Content Management**

```typescript
interface ContentStrategy {
  estimateTokenCount(url: string): Promise<number>;
  selectContentType(estimatedTokens: number): 'html' | 'text';
  chunkContent(content: string, maxTokens: number): string[];
  validateTokenLimit(content: string): boolean;
}
```

#### Features:
- **Pre-flight Size Estimation**: Check content size before retrieval
- **Automatic Type Selection**: Use `text` when HTML would exceed limits
- **Content Chunking**: Split large content into manageable pieces
- **Token Validation**: Runtime checks against MCP limits

### 3. **Enhanced Tool Validation Middleware**

```typescript
interface ToolPrerequisites {
  requiredState: WorkflowState[];
  requiredTools: string[];
  maxRetries: number;
  fallbackStrategy?: string;
}

const TOOL_PREREQUISITES: Record<string, ToolPrerequisites> = {
  find_selector: {
    requiredState: [WorkflowState.CONTENT_ANALYZED],
    requiredTools: ['get_content'],
    maxRetries: 0, // Prevent blind guessing
    fallbackStrategy: 'suggest_get_content'
  }
};
```

### 4. **Content Chunking Strategy**

Based on 2025 LLM best practices:

#### **Fixed-Size Chunking** (Primary)
- **Chunk Size**: 20,000 tokens (80% of MCP limit)
- **Overlap**: 200 tokens for context preservation  
- **Boundary Respect**: Honor sentence/element boundaries

#### **Semantic Chunking** (Advanced)
- **HTML Structure**: Split by `<section>`, `<article>`, `<div>` boundaries
- **Content Preservation**: Maintain complete elements
- **Progressive Loading**: Load chunks on-demand

#### **Token-Aware Selection**
```typescript
function selectContentStrategy(estimatedTokens: number): ContentConfig {
  if (estimatedTokens < 20000) return { type: 'html', chunking: false };
  if (estimatedTokens < 50000) return { type: 'html', chunking: true };
  return { type: 'text', chunking: false }; // Text is more compact
}
```

## 🔒 Security Considerations (2025 MCP Best Practices)

### Validation Framework
- **Input Sanitization**: Validate all selector inputs against injection attacks
- **Schema Validation**: Runtime validation using Zod or similar
- **Rate Limiting**: Prevent rapid-fire tool calls
- **Audit Logging**: Track tool usage patterns for monitoring

### Workflow Enforcement
- **Allowlisting**: Only permit valid tool sequences
- **State Verification**: Cryptographic validation of workflow state
- **Circuit Breaker**: Prevent cascade failures from invalid sequences
- **Resource Limits**: Enforce memory/CPU boundaries for content processing

## 📊 Implementation Roadmap

### Phase 1: Core Workflow Validation (Week 1-2)
- [ ] Implement `WorkflowState` enum and context tracking
- [ ] Add prerequisite validation middleware  
- [ ] Create enhanced error messages with workflow guidance
- [ ] Unit tests for state machine logic

### Phase 2: Content Management (Week 3-4)  
- [ ] Implement token estimation for HTML content
- [ ] Add automatic content type selection
- [ ] Create content chunking utilities
- [ ] Integration tests with various page sizes

### Phase 3: Advanced Features (Week 5-6)
- [ ] Semantic HTML chunking
- [ ] Progressive content loading
- [ ] Performance optimization
- [ ] Load testing with large websites

### Phase 4: Security & Monitoring (Week 7-8)
- [ ] Security validation framework
- [ ] Audit logging implementation  
- [ ] Circuit breaker patterns
- [ ] Production monitoring setup

## 🎯 Success Metrics

### Immediate Benefits
- **Zero Blind Guessing**: `find_selector` requires prior content analysis
- **Token Compliance**: 100% compliance with MCP limits
- **Workflow Guidance**: Clear error messages guide proper usage
- **Type Safety**: Compile-time validation of tool sequences

### Long-term Improvements  
- **Reduced Support Tickets**: Self-healing workflows
- **Better Performance**: Intelligent content loading
- **Enhanced Security**: Validated tool execution patterns
- **Developer Experience**: Clear APIs with helpful errors

## 🔗 Related Resources

### Research Sources
- [MCP Security Best Practices 2025](https://equixly.com/blog/2025/03/29/mcp-server-new-security-nightmare/)
- [Chunking Strategies for LLM Applications](https://www.pinecone.io/learn/chunking-strategies/)
- [TypeScript Workflow Patterns 2025](https://dev.to/mitu_mariam/typescript-best-practices-in-2025-57hb)
- [API Validation Best Practices](https://apidog.com/blog/api-validation-best-practices/)

### Technical References
- [Puppeteer Real Browser Documentation](https://github.com/zfcsoftware/puppeteer-real-browser)
- [MCP Protocol Specification](https://modelcontextprotocol.io/)
- [Claude Code Best Practices](https://docs.anthropic.com/en/docs/claude-code)

---

**Priority**: High  
**Complexity**: Medium  
**Estimated Effort**: 8 weeks  
**Risk Level**: Low (backward compatible)