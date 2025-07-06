import { getBrowserInstance, getPageInstance } from '../browser-manager.js';
import { withErrorHandling } from '../system-utils.js';
import { validateWorkflow, recordExecution } from '../workflow-validation.js';
import { ScreenshotArgs } from '../tool-definitions.js';
import { safeScreenshot, preparePageForScreenshot } from '../screenshot-handler.js';

// Screenshot handler - CDP-only approach for stealth compatibility
export async function handleScreenshot(args: ScreenshotArgs) {
  return await withWorkflowValidation('screenshot', args, async () => {
    return await withErrorHandling(async () => {
      const pageInstance = getPageInstance();
      if (!pageInstance) {
        throw new Error('Browser not initialized. Call browser_init first.');
      }

      const { 
        selector, 
        fullPage = false, 
        quality = 90, 
        format = 'png', 
        timeout = 15000, 
        maxRetries = 2 
      } = args;

      // Prepare page for optimal screenshot
      console.log('📸 Preparing page for screenshot...');
      await preparePageForScreenshot(pageInstance);

      // Take screenshot using CDP-only method
      console.log(`📸 Taking ${selector ? 'element' : fullPage ? 'full page' : 'viewport'} screenshot...`);
      const result = await safeScreenshot(pageInstance, {
        selector,
        fullPage,
        quality,
        format,
        timeout,
        maxRetries
      });

      if (!result.success) {
        throw new Error(result.error || 'Screenshot capture failed');
      }

      // Format response for MCP
      const screenshotSize = Math.round((result.screenshot?.length || 0) * 0.75); // Approximate bytes from base64
      const methodDescription = selector ? `element (${selector})` : fullPage ? 'full page' : 'viewport';
      
      return {
        content: [
          {
            type: 'text',
            text: `✅ Screenshot captured successfully!\n\n` +
                  `📊 Details:\n` +
                  `  • Method: ${result.method} (CDP-based)\n` +
                  `  • Type: ${methodDescription}\n` +
                  `  • Format: ${format.toUpperCase()}\n` +
                  `  • Quality: ${quality}%\n` +
                  `  • Size: ~${(screenshotSize / 1024).toFixed(1)} KB\n` +
                  (result.metadata ? 
                    `  • Dimensions: ${result.metadata.width}x${result.metadata.height}px\n` : '') +
                  `\n🔒 Anti-detection: CDP method ensures stealth compatibility`
          },
          {
            type: 'image',
            data: result.screenshot!,
            mimeType: `image/${format}`
          }
        ],
      };
    }, 'Failed to capture screenshot');
  });
}

// Workflow validation wrapper for screenshot
async function withWorkflowValidation<T>(
  toolName: string,
  args: any,
  operation: () => Promise<T>
): Promise<T> {
  // Note: Screenshot tool bypasses normal workflow validation since it's EXPLICIT REQUEST ONLY
  // We still record execution for audit purposes but don't enforce workflow state
  
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