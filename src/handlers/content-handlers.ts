import { getBrowserInstance, getPageInstance, getContentPriorityConfig } from '../browser-manager';
import { withErrorHandling, withTimeout } from '../system-utils';
import { validateWorkflow, recordExecution, workflowValidator } from '../workflow-validation';
import { contentStrategy } from '../content-strategy';
import { tokenManager } from '../token-management';
import { GetContentArgs, ScreenshotArgs, FindSelectorArgs } from '../tool-definitions';

// Get content handler
export async function handleGetContent(args: GetContentArgs) {
  return await withWorkflowValidation('get_content', args, async () => {
    return await withErrorHandling(async () => {
      const pageInstance = getPageInstance();
      if (!pageInstance) {
        throw new Error('Browser not initialized. Call browser_init first.');
      }

      const { type = 'html', selector } = args;

      let content: string;
      
      if (selector) {
        // Get content from specific element
        const element = await pageInstance.$(selector);
        if (!element) {
          throw new Error(`Element not found: ${selector}. Use find_selector to locate elements first.`);
        }
        
        if (type === 'text') {
          content = await pageInstance.$eval(selector, (el: any) => el.innerText || el.textContent || '');
        } else {
          content = await pageInstance.$eval(selector, (el: any) => el.outerHTML || '');
        }
      } else {
        // Get full page content
        if (type === 'text') {
          content = await pageInstance.evaluate(() => document.body.innerText || document.body.textContent || '');
        } else {
          content = await pageInstance.content();
        }
      }

      // Process content using content strategy
      const processedContent = content; // Use content directly for now

      // Check token limits and handle large content  
      const tokenCount = tokenManager.countTokens(processedContent);
      const maxTokens = 20000; // Safe default for MCP

      if (tokenCount > maxTokens) {
        console.warn(`Content size (${tokenCount} tokens) exceeds limit (${maxTokens} tokens). Chunking content...`);
        
        const chunks = [processedContent.substring(0, Math.floor(maxTokens * 0.8 * 3))];
        const firstChunk = chunks[0];
        
        return {
          content: [
            {
              type: 'text',
              text: `Content retrieved successfully (showing first chunk of ${chunks.length} total chunks):\n\n${firstChunk}\n\n📊 Content Stats: ${tokenCount} tokens total, showing ${tokenManager.countTokens(firstChunk)} tokens`,
            },
          ],
        };
      }

      const workflowMessage = '\n\n🔄 Workflow Status: Content analyzed\n' +
        '  • Next step: Use find_selector to locate specific elements\n' +
        '  • Then: Use interaction tools (click, type) for automation\n\n' +
        '✅ Content available for element discovery and interactions';

      return {
        content: [
          {
            type: 'text',
            text: `${processedContent}${workflowMessage}`,
          },
        ],
      };
    }, 'Failed to get page content');
  });
}

// Screenshot handler
export async function handleScreenshot(args: ScreenshotArgs): Promise<any> {
  return await withWorkflowValidation('screenshot', args, async () => {
    return await withErrorHandling(async () => {
      const pageInstance = getPageInstance();
      if (!pageInstance) {
        throw new Error('Browser not initialized. Call browser_init first.');
      }

      const config = getContentPriorityConfig();
      const { fullPage = false, selector, safeMode = false } = args;

      // Check content priority configuration
      if (config.prioritizeContent && config.autoSuggestGetContent) {
        const suggestion = '\n\n💡 Content Priority Mode: Consider using get_content instead of screenshot for better content analysis and reliability.\n' +
          '  • get_content provides structured text/HTML output\n' +
          '  • More reliable than image processing\n' +
          '  • Better for element discovery and automation\n' +
          '  • Avoids screenshot-related technical issues';
        
        if (!config.fallbackToScreenshots) {
          throw new Error(
            'Screenshots are disabled in content priority mode. Use get_content for page analysis.' + suggestion
          );
        }
        
        console.warn('Screenshot in content priority mode. Consider using get_content instead.');
      }

      try {
        let screenshotOptions: any = {
          fullPage: fullPage,
          type: 'png',
          encoding: 'base64'
        };

        if (selector) {
          // Element-specific screenshot
          const element = await pageInstance.$(selector);
          if (!element) {
            throw new Error(`Element not found for screenshot: ${selector}`);
          }
          screenshotOptions.clip = await element.boundingBox();
        }

        let screenshot: string;

        if (safeMode) {
          // Use CDP directly for safer screenshot
          console.warn('Using safe mode screenshot method');
          const client = await pageInstance.target().createCDPSession();
          
          try {
            const result = await client.send('Page.captureScreenshot', {
              format: 'png',
              fromSurface: true,
              captureBeyondViewport: fullPage
            });
            screenshot = result.data;
          } finally {
            await client.detach();
          }
        } else {
          // Standard screenshot method
          screenshot = await pageInstance.screenshot(screenshotOptions);
        }

        const suggestion = config.autoSuggestGetContent ? 
          '\n\n💡 For content analysis, consider using get_content which provides structured text/HTML output and is more reliable than image processing.' : '';

        return {
          content: [
            {
              type: 'image',
              data: screenshot,
              mimeType: 'image/png',
            },
            {
              type: 'text', 
              text: `Screenshot captured successfully${selector ? ` for element: ${selector}` : ''}${suggestion}`,
            },
          ],
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        if (errorMessage.includes('stack overflow') || errorMessage.includes('RangeError')) {
          if (!safeMode) {
            console.warn('Screenshot failed with stack overflow, retrying with safe mode...');
            return await handleScreenshot({ ...args, safeMode: true });
          }
        }

        const fallbackSuggestion = config.autoSuggestGetContent ?
          '\n\n💡 Screenshot failed. Use get_content for reliable page analysis:\n' +
          '  • get_content provides text/HTML without image processing issues\n' +
          '  • More reliable for content extraction and element discovery\n' +
          '  • Avoids technical screenshot limitations' : '';

        throw new Error(`Screenshot failed: ${errorMessage}${fallbackSuggestion}`);
      }
    }, 'Failed to take screenshot');
  });
}

// Find selector handler
export async function handleFindSelector(args: FindSelectorArgs) {
  return await withWorkflowValidation('find_selector', args, async () => {
    return await withErrorHandling(async () => {
      const pageInstance = getPageInstance();
      if (!pageInstance) {
        throw new Error('Browser not initialized. Call browser_init first.');
      }

      const { text, elementType = '*', exact = false } = args;

      // Enhanced semantic element type mappings
      const semanticMappings: { [key: string]: string[] } = {
        'button': ['button', '[role="button"]', 'input[type="button"]', 'input[type="submit"]'],
        'link': ['a', '[role="link"]'],
        'input': ['input', 'textarea', '[role="textbox"]', '[contenteditable="true"]'],
        'navigation': ['nav', '[role="navigation"]', '.nav', '.navbar', '.menu'],
        'heading': ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', '[role="heading"]'],
        'list': ['ul', 'ol', '[role="list"]', '.list'],
        'article': ['article', '[role="article"]', '.article', '.post'],
        'form': ['form', '[role="form"]'],
        'dialog': ['dialog', '[role="dialog"]', '.modal', '.popup'],
        'tab': ['[role="tab"]', '.tab'],
        'menu': ['[role="menu"]', '.menu', '.dropdown'],
        'checkbox': ['input[type="checkbox"]', '[role="checkbox"]'],
        'radio': ['input[type="radio"]', '[role="radio"]']
      };

      // Convert semantic element type to actual selectors
      let searchSelectors: string[];
      if (semanticMappings[elementType.toLowerCase()]) {
        searchSelectors = semanticMappings[elementType.toLowerCase()];
      } else {
        searchSelectors = [elementType];
      }

      // Enhanced selector finding with authentication detection
      const results = await pageInstance.evaluate(
        (searchText: string, selectors: string[], isExact: boolean) => {
          const elements: Array<{
            selector: string;
            text: string;
            tagName: string;
            confidence: number;
            rect: { x: number; y: number; width: number; height: number };
          }> = [];

          // Authentication patterns for special handling
          const authPatterns = [
            /^(log\s*in|sign\s*in|log\s*on|sign\s*on)$/i,
            /^(login|signin|authenticate|enter)$/i,
            /continue with (google|github|facebook|twitter|microsoft)/i,
            /sign in with/i
          ];

          const isAuthSearch = authPatterns.some(pattern => pattern.test(searchText));

          // Utility class patterns to ignore (but not remove completely)
          const utilityPatterns = [
            /^(m|p|mt|mb|ml|mr|pt|pb|pl|pr|mx|my|px|py)-?\d+$/,
            /^(text|bg|border)-(primary|secondary|danger|warning|info|success|light|dark|white|black)$/,
            /^(d|display)-(none|block|inline|flex|grid)$/,
            /^(w|h)-\d+$/,
            /^(btn|button)-(sm|md|lg|xl)$/
          ];

          function isUtilityClass(className: string): boolean {
            return utilityPatterns.some(pattern => pattern.test(className));
          }

          function isMeaningfulClass(className: string): boolean {
            // Keep classes that seem semantic/meaningful
            const meaningfulPatterns = [
              /^(nav|menu|header|footer|sidebar|content|main|article)/, 
              /^(form|input|button|link|modal|dialog)/,
              /^(auth|login|signin|signup|register)/,
              /^(search|filter|sort|toggle)/,
              /(container|wrapper|section|panel|card)$/
            ];
            
            return meaningfulPatterns.some(pattern => pattern.test(className.toLowerCase()));
          }

          function generateSimpleSelector(element: Element): string {
            // Prioritize ID
            if (element.id && /^[a-zA-Z][\w-]*$/.test(element.id)) {
              return `#${CSS.escape(element.id)}`;
            }

            // Try data attributes
            const dataAttrs = Array.from(element.attributes)
              .filter(attr => attr.name.startsWith('data-') && attr.value)
              .map(attr => `[${attr.name}="${CSS.escape(attr.value)}"]`);
            
            if (dataAttrs.length > 0) {
              return element.tagName.toLowerCase() + dataAttrs[0];
            }

            // Use meaningful classes
            if (element.className && typeof element.className === 'string') {
              const classes = element.className.trim().split(/\s+/)
                .filter(cls => cls && (isMeaningfulClass(cls) || !isUtilityClass(cls)))
                .slice(0, 2); // Limit to 2 classes for simplicity
              
              if (classes.length > 0) {
                return element.tagName.toLowerCase() + '.' + classes.map(c => CSS.escape(c)).join('.');
              }
            }

            // Fallback to tag + text content for small text
            const textContent = element.textContent?.trim() || '';
            if (textContent.length > 0 && textContent.length <= 30) {
              return `${element.tagName.toLowerCase()}:contains("${textContent}")`;
            }

            return element.tagName.toLowerCase();
          }

          function calculateElementScore(element: Element, searchText: string): number {
            let score = 0;
            const elementText = element.textContent?.trim() || '';
            const lowerSearchText = searchText.toLowerCase();
            const lowerElementText = elementText.toLowerCase();

            // Exact match bonus
            if (lowerElementText === lowerSearchText) score += 100;
            
            // Contains match
            else if (lowerElementText.includes(lowerSearchText)) score += 50;
            
            // Word boundary match bonus
            const wordRegex = new RegExp(`\\b${lowerSearchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
            if (wordRegex.test(lowerElementText)) score += 25;

            // Interactive elements bonus
            if (['button', 'a', 'input'].includes(element.tagName.toLowerCase())) score += 20;
            
            // Role attribute bonus
            if (element.getAttribute('role')) score += 10;
            
            // ID bonus
            if (element.id) score += 15;
            
            // Clickable bonus
            if (element.getAttribute('onclick') || element.getAttribute('href')) score += 10;

            // Penalize utility classes
            if (element.className && typeof element.className === 'string') {
              const utilityCount = element.className.split(/\s+/).filter(isUtilityClass).length;
              score -= utilityCount * 5;
            }

            return score;
          }

          // Search through specified selectors
          for (const baseSelector of selectors) {
            const candidates = document.querySelectorAll(baseSelector);
            
            candidates.forEach(element => {
              const elementText = element.textContent?.trim() || '';
              const ariaLabel = element.getAttribute('aria-label') || '';
              const title = element.getAttribute('title') || '';
              const placeholder = element.getAttribute('placeholder') || '';
              
              const searchableText = [elementText, ariaLabel, title, placeholder].join(' ').toLowerCase();
              const lowerSearchText = searchText.toLowerCase();

              let matches = false;
              if (isExact) {
                matches = elementText.toLowerCase() === lowerSearchText ||
                         ariaLabel.toLowerCase() === lowerSearchText;
              } else {
                matches = searchableText.includes(lowerSearchText);
              }

              // Special handling for authentication searches
              if (isAuthSearch && !matches) {
                const href = (element as HTMLAnchorElement).href || '';
                const hasAuthRoute = href.includes('login') || href.includes('signin') || 
                                   href.includes('auth') || href.includes('oauth');
                if (hasAuthRoute) matches = true;
              }

              if (matches) {
                const rect = element.getBoundingClientRect();
                const selector = generateSimpleSelector(element);
                const confidence = calculateElementScore(element, searchText);

                elements.push({
                  selector,
                  text: elementText,
                  tagName: element.tagName.toLowerCase(),
                  confidence,
                  rect: {
                    x: rect.x,
                    y: rect.y,
                    width: rect.width,
                    height: rect.height
                  }
                });
              }
            });
          }

          // Sort by confidence score
          return elements.sort((a, b) => b.confidence - a.confidence);
        },
        text,
        searchSelectors,
        exact
      );

      if (results.length === 0) {
        throw new Error(
          `No elements found containing text: "${text}"\n\n` +
          '💡 Troubleshooting suggestions:\n' +
          '  • Check if the text appears exactly as shown on the page\n' +
          '  • Try partial text search with exact=false\n' +
          '  • Use get_content to see all available text first\n' +
          '  • Verify the page has fully loaded\n' +
          '  • Check if the element is hidden or in a different frame'
        );
      }

      // Return the best match with additional options
      const bestMatch = results[0];
      const additionalMatches = results.slice(1, 3).map((r: any) => 
        `  • ${r.selector} (confidence: ${r.confidence})`
      ).join('\n');

      const workflowMessage = '\n\n🔄 Workflow Status: Element located\n' +
        '  • Next step: Use interaction tools (click, type) with this selector\n' +
        '  • Selector is validated and ready for automation\n\n' +
        '✅ Element discovery complete - ready for interactions';

      return {
        content: [
          {
            type: 'text',
            text: `Found element: ${bestMatch.selector}\n` +
                  `Text: "${bestMatch.text}"\n` +
                  `Confidence: ${bestMatch.confidence}\n` +
                  (additionalMatches ? `\nAlternative matches:\n${additionalMatches}` : '') +
                  workflowMessage,
          },
        ],
      };
    }, 'Failed to find selector');
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