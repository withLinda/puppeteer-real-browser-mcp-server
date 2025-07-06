import { getBrowserInstance, getPageInstance, getContentPriorityConfig, getScreenshotSaveConfig } from '../browser-manager.js';
import { 
  withErrorHandling, 
  detectExplicitScreenshotRequest, 
  saveBufferToFile, 
  generateFilename, 
  createDateSubfolder, 
  resolvePath, 
  formatFileSize 
} from '../system-utils.js';
import path from 'path';
import { validateWorkflow, recordExecution } from '../workflow-validation.js';
import { ScreenshotArgs, DEFAULT_SCREENSHOT_SAVE_CONFIG } from '../tool-definitions.js';
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
        maxRetries = 2,
        saveToFile,
        customSaveFolder,
        customFilename
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

      // Auto-save screenshot if enabled
      let fileSaveResult: { success: boolean; filePath?: string; error?: string } | null = null;
      
      // Get current screenshot configuration
      const screenshotConfig = getScreenshotSaveConfig();
      
      // Determine if we should save to file
      const shouldSaveToFile = saveToFile !== undefined ? saveToFile : screenshotConfig.autoSave;
      
      if (shouldSaveToFile && result.screenshot) {
        try {
          // Get current page URL for filename generation
          const currentUrl = await pageInstance.url();
          
          // Determine save folder
          const saveFolder = customSaveFolder || screenshotConfig.saveFolder;
          const resolvedFolder = resolvePath(saveFolder);
          
          // Handle subfolder creation
          const finalFolder = screenshotConfig.createSubfolders 
            ? createDateSubfolder(resolvedFolder)
            : resolvedFolder;
          
          // Generate filename
          let filename: string;
          if (customFilename) {
            filename = customFilename;
            if (!filename.includes('.')) {
              filename += `.${format}`;
            }
          } else {
            filename = generateFilename(screenshotConfig.filenamePattern, currentUrl);
          }
          
          // Combine path
          const fullPath = path.join(finalFolder, filename);
          
          // Convert base64 to buffer
          const screenshotBuffer = Buffer.from(result.screenshot, 'base64');
          
          // Save to file
          fileSaveResult = await saveBufferToFile(screenshotBuffer, fullPath, {
            overwrite: false,
            autoIncrement: true
          });
          
          if (fileSaveResult.success) {
            console.log(`📁 Screenshot saved to: ${fileSaveResult.filePath}`);
          } else {
            console.error(`❌ Failed to save screenshot: ${fileSaveResult.error}`);
          }
        } catch (error) {
          fileSaveResult = {
            success: false,
            error: error instanceof Error ? error.message : String(error)
          };
          console.error('❌ Screenshot auto-save failed:', error);
        }
      }

      // Format response for MCP
      const screenshotSize = Math.round((result.screenshot?.length || 0) * 0.75); // Approximate bytes from base64
      const methodDescription = selector ? `element (${selector})` : fullPage ? 'full page' : 'viewport';
      
      // Build file save status message
      let fileSaveMessage = '';
      if (fileSaveResult) {
        if (fileSaveResult.success) {
          const fileSize = formatFileSize(Buffer.from(result.screenshot!, 'base64').length);
          fileSaveMessage = `\n📁 File Saved:\n` +
                           `  • Path: ${fileSaveResult.filePath}\n` +
                           `  • Size: ${fileSize}`;
        } else {
          fileSaveMessage = `\n❌ File Save Failed:\n` +
                           `  • Error: ${fileSaveResult.error}`;
        }
      } else if (saveToFile === false) {
        fileSaveMessage = `\n📁 File saving disabled for this screenshot`;
      } else if (!screenshotConfig.autoSave) {
        fileSaveMessage = `\n📁 Auto-save disabled in configuration`;
      }

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
                  fileSaveMessage +
                  `\n\n🔒 Anti-detection: CDP method ensures stealth compatibility`
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
  // Get content priority configuration
  const config = getContentPriorityConfig();
  
  // Check if we should respect explicit screenshot requests (new balanced approach)
  if (config.respectExplicitScreenshotRequests) {
    // In balanced mode: Allow screenshots when explicitly requested or when workflow allows
    // The improved tool descriptions will guide the AI to make better choices
    console.log('📸 Screenshot request - balanced mode: respecting explicit requests');
  } else {
    // Legacy mode: Screenshot bypasses normal workflow validation entirely
    console.log('📸 Screenshot request - legacy mode: bypassing all workflow validation');
  }
  
  // Note: Screenshot tool bypasses normal workflow validation for better user experience
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