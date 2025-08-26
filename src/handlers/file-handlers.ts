import { promises as fs } from 'fs';
import { dirname, extname, resolve, relative } from 'path';
import TurndownService from 'turndown';
import { getPageInstance } from '../browser-manager.js';
import { withErrorHandling, withTimeout } from '../system-utils.js';
import { validateWorkflow, recordExecution, workflowValidator } from '../workflow-validation.js';
import { tokenManager } from '../token-management.js';
import { SaveContentAsMarkdownArgs } from '../tool-definitions.js';

// Path validation and security functions
function validateFilePath(filePath: string): void {
  // Check file extension
  if (extname(filePath).toLowerCase() !== '.md') {
    throw new Error('File path must end with .md extension');
  }
  
  // Normalize the path to resolve any relative components
  const normalizedPath = resolve(filePath);
  
  // Check if the original path contained directory traversal patterns
  // This protects against inputs like "../../etc/passwd.md"
  if (filePath.includes('..')) {
    throw new Error('File path cannot contain directory traversal patterns (..)');
  }
  
  // Additional security: prevent writing to system directories
  const systemPaths = ['/etc', '/usr', '/var', '/bin', '/sbin', '/proc', '/sys'];
  const isSystemPath = systemPaths.some(systemPath => 
    normalizedPath.startsWith(systemPath)
  );
  
  if (isSystemPath) {
    throw new Error('Cannot write to system directories');
  }
}

// Configure Turndown service for optimal markdown conversion
function createTurndownService(formatOptions: SaveContentAsMarkdownArgs['formatOptions'] = {}): TurndownService {
  const {
    preserveLinks = true,
    headingStyle = 'atx',
    cleanupWhitespace = true
  } = formatOptions;

  const turndownService = new TurndownService({
    headingStyle,
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    fence: '```',
    emDelimiter: '*',
    strongDelimiter: '**',
    linkStyle: 'inlined',
    linkReferenceStyle: 'full',
    preformattedCode: false
  });

  // Customize table handling
  turndownService.addRule('table', {
    filter: 'table',
    replacement: function(content) {
      return '\n\n' + content + '\n\n';
    }
  });

  // Improve list handling
  turndownService.addRule('listItem', {
    filter: 'li',
    replacement: function(content, node, options) {
      content = content
        .replace(/^\n+/, '') // remove leading newlines
        .replace(/\n+$/, '\n') // replace trailing newlines with just one
        .replace(/\n/gm, '\n    '); // indent

      const prefix = options.bulletListMarker + ' ';
      return prefix + content + (node.nextSibling && !/\n$/.test(content) ? '\n' : '');
    }
  });

  // Handle links based on preserveLinks option
  if (!preserveLinks) {
    turndownService.addRule('stripLinks', {
      filter: 'a',
      replacement: function(content) {
        return content;
      }
    });
  }

  return turndownService;
}

// Generate metadata header for the markdown file
function generateMetadata(currentUrl?: string): string {
  const timestamp = new Date().toISOString();
  const date = new Date().toLocaleDateString();
  
  let metadata = `---
title: Extracted Content
date: ${date}
timestamp: ${timestamp}
`;

  if (currentUrl) {
    metadata += `source: ${currentUrl}
`;
  }

  metadata += `extracted_by: Puppeteer Real Browser MCP Server
---

`;

  return metadata;
}

// Clean up whitespace in markdown content
function cleanupMarkdownWhitespace(content: string): string {
  return content
    // Remove excessive blank lines (more than 2)
    .replace(/\n{3,}/g, '\n\n')
    // Remove trailing whitespace from lines
    .replace(/[ \t]+$/gm, '')
    // Remove leading/trailing whitespace
    .trim();
}

// Main handler function for saving content as markdown
export async function handleSaveContentAsMarkdown(args: SaveContentAsMarkdownArgs) {
  return await withWorkflowValidation('save_content_as_markdown', args, async () => {
    return await withErrorHandling(async () => {
      const pageInstance = getPageInstance();
      if (!pageInstance) {
        throw new Error('Browser not initialized. Call browser_init first.');
      }

      const {
        filePath,
        contentType = 'text',
        selector,
        formatOptions = {}
      } = args;

      // Validate file path for security
      validateFilePath(filePath);

      // Ensure directory exists
      const dirPath = dirname(filePath);
      try {
        await fs.mkdir(dirPath, { recursive: true });
      } catch (error) {
        throw new Error(`Failed to create directory: ${dirPath}. ${error instanceof Error ? error.message : String(error)}`);
      }

      // Check if file already exists
      try {
        await fs.access(filePath);
        throw new Error(`File already exists: ${filePath}. Please choose a different path or delete the existing file.`);
      } catch (error) {
        // File doesn't exist, which is what we want
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }

      // Extract content from page
      let content: string;
      let currentUrl: string;

      try {
        currentUrl = await pageInstance.url();
      } catch (error) {
        currentUrl = 'Unknown';
      }

      if (selector) {
        // Get content from specific element
        const element = await pageInstance.$(selector);
        if (!element) {
          throw new Error(`Element not found: ${selector}. Use find_selector to locate elements first.`);
        }
        
        if (contentType === 'text') {
          content = await pageInstance.$eval(selector, (el: any) => el.innerText || el.textContent || '');
        } else {
          content = await pageInstance.$eval(selector, (el: any) => el.outerHTML || '');
        }
      } else {
        // Get full page content
        if (contentType === 'text') {
          content = await pageInstance.evaluate(() => document.body.innerText || document.body.textContent || '');
        } else {
          content = await pageInstance.content();
        }
      }

      if (!content.trim()) {
        throw new Error('No content found to save. The page or selected element appears to be empty.');
      }

      // Process content based on type
      let markdownContent: string;
      
      if (contentType === 'html') {
        // Convert HTML to markdown
        const turndownService = createTurndownService(formatOptions);
        markdownContent = turndownService.turndown(content);
      } else {
        // Content is already text, format as markdown
        markdownContent = content;
      }

      // Apply formatting options
      if (formatOptions.cleanupWhitespace !== false) {
        markdownContent = cleanupMarkdownWhitespace(markdownContent);
      }

      // Add metadata header if requested
      let finalContent = '';
      if (formatOptions.includeMetadata !== false) {
        finalContent += generateMetadata(currentUrl);
      }
      finalContent += markdownContent;

      // Check token count for large files
      const tokenCount = tokenManager.countTokens(finalContent);
      if (tokenCount > 50000) {
        console.warn(`Large file detected: ${tokenCount} tokens. Consider extracting specific content with a selector.`);
      }

      // Write file
      try {
        await fs.writeFile(filePath, finalContent, 'utf8');
      } catch (error) {
        throw new Error(`Failed to write file: ${filePath}. ${error instanceof Error ? error.message : String(error)}`);
      }

      // Verify file was written successfully
      let fileStats;
      try {
        fileStats = await fs.stat(filePath);
      } catch (error) {
        throw new Error(`File was not created successfully: ${filePath}`);
      }

      const workflowMessage = '\n\n🔄 Workflow Status: Content saved to markdown file\n' +
        '  • File successfully written to disk\n' +
        '  • Content extracted and formatted as markdown\n' +
        '  • Ready for further content extraction or navigation\n\n' +
        '✅ Markdown file creation complete';

      return {
        content: [
          {
            type: 'text',
            text: `✅ Content saved successfully!\n\n` +
                  `📁 File: ${filePath}\n` +
                  `📊 Size: ${(fileStats.size / 1024).toFixed(2)} KB\n` +
                  `🎯 Content type: ${contentType}\n` +
                  `📝 Token count: ${tokenCount}\n` +
                  (selector ? `🎯 Selector: ${selector}\n` : '') +
                  `🌐 Source: ${currentUrl}` +
                  workflowMessage,
          },
        ],
      };
    }, 'Failed to save content as markdown');
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