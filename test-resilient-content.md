# Test Instructions for Resilient get_content

## Test Scenario: cursor.com Login Flow

### Step 1: Initialize Browser
```
browser_init
```

### Step 2: Navigate to cursor.com
```
navigate with url: "https://www.cursor.com/"
```

### Step 3: Use get_content (will auto-retry)
```
get_content
```

Expected behavior:
- First attempts with contentMode="main" 
- If that exceeds token limits, automatically retries with contentMode="summary"
- Should succeed with summary mode and show: "📊 Content Mode: Automatically used 'summary' mode"

### Step 4: Find Login selector
```
find_selector with text: "Login"
```

Expected behavior:
- Should now work because content was successfully analyzed in summary mode
- Returns a valid selector for the login element

### Step 5: Click Login
```
click with the selector returned from step 4
```

## Key Improvements

1. **Automatic Retry**: get_content now automatically tries progressively smaller content modes
2. **Strict Validation**: find_selector still requires successful content analysis (no blind guessing)
3. **Better UX**: Users don't need to manually retry with different modes
4. **Clear Feedback**: System tells you which mode was used automatically

## Testing Other Large Sites

Try these sites that are known to be large:
- github.com
- stackoverflow.com  
- reddit.com
- youtube.com

The system should automatically adapt to their size by using appropriate content modes.