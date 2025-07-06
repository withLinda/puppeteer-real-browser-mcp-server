import { initializeBrowser, closeBrowser, getBrowserInstance, getPageInstance, getContentPriorityConfig, updateContentPriorityConfig, getScreenshotSaveConfig, updateScreenshotSaveConfig } from '../browser-manager.js';
import { withErrorHandling, validateScreenshotSaveConfig, sanitizeScreenshotConfig } from '../system-utils.js';
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
      
      // Update screenshot save configuration if provided
      if (args.screenshotConfig) {
        // Validate the configuration
        const validation = validateScreenshotSaveConfig(args.screenshotConfig);
        if (!validation.isValid) {
          throw new Error(`Invalid screenshot configuration: ${validation.errors.join(', ')}`);
        }
        
        // Sanitize the configuration
        const sanitizedConfig = sanitizeScreenshotConfig(args.screenshotConfig);
        updateScreenshotSaveConfig(sanitizedConfig);
        
        // Log warnings if any
        if (validation.warnings.length > 0) {
          console.warn('Screenshot configuration warnings:', validation.warnings.join(', '));
        }
      }
      
      await initializeBrowser(args);
      
      const config = getContentPriorityConfig();
      const screenshotConfig = getScreenshotSaveConfig();
      let configMessage = '';
      
      if (config.prioritizeContent && config.respectExplicitScreenshotRequests) {
        configMessage = '\n\n💡 Balanced Mode: get_content is recommended for content analysis; screenshots available when explicitly requested or for visual tasks.';
      } else if (config.prioritizeContent) {
        configMessage = '\n\n💡 Content Priority Mode: get_content is prioritized for better reliability. Use get_content for page analysis instead of screenshots.';
      } else {
        configMessage = '\n\n💡 Flexible Mode: Both get_content and screenshot tools available without restrictions.';
      }
      
      // Add screenshot auto-save information
      if (screenshotConfig.autoSave) {
        configMessage += `\n📁 Screenshot Auto-Save: Enabled (saving to ${screenshotConfig.saveFolder})`;
      } else {
        configMessage += `\n📁 Screenshot Auto-Save: Disabled`;
      }

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