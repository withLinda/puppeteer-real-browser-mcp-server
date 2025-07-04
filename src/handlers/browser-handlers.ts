import { initializeBrowser, closeBrowser, getBrowserInstance, getPageInstance, getContentPriorityConfig, updateContentPriorityConfig } from '../browser-manager.js';
import { withErrorHandling } from '../system-utils.js';
import { validateWorkflow, recordExecution, workflowValidator } from '../workflow-validation.js';
import { BrowserInitArgs } from '../tool-definitions.js';

// Browser initialization handler
export async function handleBrowserInit(args: BrowserInitArgs) {
  return await withWorkflowValidation('browser_init', args, async () => {
    return await withErrorHandling(async () => {
      // Update content priority configuration if provided
      if (args.contentPriority) {
        updateContentPriorityConfig(args.contentPriority);
      }
      
      await initializeBrowser(args);
      
      const config = getContentPriorityConfig();
      const configMessage = config.prioritizeContent 
        ? '\n\n💡 Content Priority Mode: get_content is prioritized for better reliability. Use get_content for page analysis instead of screenshots.'
        : '';

      const workflowMessage = '\n\n🔄 Workflow Status: Browser initialized\n' +
        '  • Next step: Use navigate to load a web page\n' +
        '  • Then: Use get_content to analyze page content\n' +
        '  • Finally: Use find_selector and interaction tools\n\n' +
        '✅ Workflow validation is now active - prevents blind selector guessing';
      
      return {
        content: [
          {
            type: 'text',
            text: `Browser initialized successfully with anti-detection features${configMessage}${workflowMessage}`,
          },
        ],
      };
    }, 'Failed to initialize browser');
  });
}

// Browser close handler
export async function handleBrowserClose() {
  return await withWorkflowValidation('browser_close', {}, async () => {
    return await withErrorHandling(async () => {
      await closeBrowser();
      
      // Reset workflow state when browser is closed
      workflowValidator.reset();
      
      return {
        content: [
          {
            type: 'text',
            text: 'Browser closed successfully\n\n🔄 Workflow state reset - ready for new browser initialization',
          },
        ],
      };
    }, 'Failed to close browser');
  });
}

// Workflow validation wrapper
async function withWorkflowValidation<T>(
  toolName: string,
  args: any,
  operation: () => Promise<T>
): Promise<T> {
  // Validate workflow state before execution
  const validation = validateWorkflow(toolName, args);
  
  if (!validation.isValid) {
    let errorMessage = validation.errorMessage || `Tool '${toolName}' is not allowed in current workflow state.`;
    
    if (validation.suggestedAction) {
      errorMessage += `\n\n💡 Next Steps: ${validation.suggestedAction}`;
    }
    
    // Add workflow context for debugging
    const workflowSummary = workflowValidator.getValidationSummary();
    errorMessage += `\n\n🔍 ${workflowSummary}`;
    
    // Record failed execution
    recordExecution(toolName, args, false, errorMessage);
    
    throw new Error(errorMessage);
  }
  
  try {
    // Execute the operation
    const result = await operation();
    
    // Record successful execution
    recordExecution(toolName, args, true);
    
    return result;
  } catch (error) {
    // Record failed execution
    recordExecution(toolName, args, false, error instanceof Error ? error.message : String(error));
    throw error;
  }
}

// Get current browser instances (for other handlers)
export function getCurrentBrowserInstances() {
  return {
    browser: getBrowserInstance(),
    page: getPageInstance()
  };
}