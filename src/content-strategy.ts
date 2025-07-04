/**
 * Content Strategy Engine for MCP Server
 * 
 * Provides intelligent content retrieval and processing strategies:
 * - Pre-flight content size estimation
 * - Automatic HTML vs text selection
 * - Progressive content loading
 * - Context-aware content optimization
 * 
 * Integrates with workflow validation and token management systems.
 */

import { tokenManager, ContentStrategy, TokenCountResult, ContentChunk } from './token-management.js';
import { workflowValidator, WorkflowState } from './workflow-validation.js';

export interface ContentRequest {
  type?: 'html' | 'text';
  selector?: string;
  estimateOnly?: boolean;
  maxTokens?: number;
  chunkingPreference?: 'avoid' | 'allow' | 'prefer';
  contentMode?: 'full' | 'main' | 'summary';
  resourceBlocking?: 'disabled' | 'minimal' | 'standard' | 'aggressive';
}

export interface ContentResponse {
  content: string | ContentChunk[];
  strategy: ContentStrategy;
  metadata: ContentMetadata;
  workflowGuidance?: string;
}

export interface ContentMetadata {
  originalTokens: number;
  processedTokens: number;
  exceedsLimit: boolean;
  chunksCount?: number;
  compressionRatio?: number;
  estimationOnly: boolean;
  selector?: string;
  recommendations?: string[];
}

export interface PreflightEstimate {
  htmlTokens: number;
  textTokens: number;
  recommendedType: 'html' | 'text';
  requiresChunking: boolean;
  strategy: ContentStrategy;
  warnings?: string[];
}

export class ContentStrategyEngine {
  private readonly ESTIMATION_SAMPLE_SIZE = 2000; // Characters to sample for estimation
  private readonly CHUNK_WARNING_THRESHOLD = 3; // Warn if more than 3 chunks needed
  
  // Main content selectors based on 2025 best practices
  private readonly MAIN_CONTENT_SELECTORS = [
    'main',
    'article', 
    '[role="main"]',
    '.main-content',
    '.content',
    '.post-content',
    '.entry-content',
    '.article-content',
    '#main-content',
    '#content',
    '#main'
  ];
  
  // Elements to exclude from content extraction
  private readonly EXCLUDE_SELECTORS = [
    'script',
    'style', 
    'nav',
    'header',
    'footer',
    '.navigation',
    '.nav',
    '.sidebar',
    '.ads',
    '.advertisement',
    '.social-share',
    '.comments',
    '[aria-hidden="true"]',
    '.sr-only'
  ];

  // Resource types to block for optimized content extraction
  private readonly BLOCKED_RESOURCE_TYPES = [
    'image',
    'media',
    'font',
    'texttrack',
    'object',
    'beacon',
    'csp_report',
    'imageset'
  ];

  // URLs patterns to block for optimized content extraction
  private readonly BLOCKED_URL_PATTERNS = [
    /.*\.(css|jpg|jpeg|png|gif|svg|ico|woff|woff2|ttf|eot)(\?.*)?$/i,
    /.*\/(ads|analytics|tracking|social|comments)\//i,
    /google-analytics\.com/,
    /googletagmanager\.com/,
    /facebook\.net/,
    /twitter\.com\/widgets/,
    /linkedin\.com\/widget/,
    /doubleclick\.net/,
    /googlesyndication\.com/,
    /amazon-adsystem\.com/
  ];

  /**
   * Quick page size check to determine if content is likely to exceed token limits
   */
  private async quickPageSizeCheck(pageInstance: any): Promise<{ likelyLarge: boolean, estimatedSize: number }> {
    try {
      const sizeInfo = await pageInstance.evaluate(() => {
        const htmlLength = document.documentElement.outerHTML.length;
        const textLength = document.body?.innerText?.length || 0;
        
        return {
          htmlLength,
          textLength,
          // Check for signs of heavy content
          hasLargeScripts: document.querySelectorAll('script').length > 50,
          hasManySVGs: document.querySelectorAll('svg').length > 20,
          hasLargeTables: document.querySelectorAll('table').length > 10,
          hasCodeBlocks: document.querySelectorAll('pre, code').length > 50
        };
      });

      // Estimate if content is likely to exceed token limits
      const estimatedTokens = Math.min(sizeInfo.htmlLength, sizeInfo.textLength * 2) / 4; // Rough token estimate
      const likelyLarge = estimatedTokens > 20000 || 
                          sizeInfo.htmlLength > 100000 ||
                          sizeInfo.hasLargeScripts ||
                          sizeInfo.hasManySVGs ||
                          sizeInfo.hasCodeBlocks;

      return {
        likelyLarge,
        estimatedSize: sizeInfo.htmlLength
      };
    } catch (error) {
      // If check fails, assume not large to avoid blocking
      return { likelyLarge: false, estimatedSize: 0 };
    }
  }

  /**
   * Enable resource blocking for optimized content extraction
   */
  async enableResourceBlocking(pageInstance: any, blockLevel: 'minimal' | 'standard' | 'aggressive' = 'standard'): Promise<void> {
    try {
      await pageInstance.setRequestInterception(true);
      
      pageInstance.on('request', (request: any) => {
        const resourceType = request.resourceType();
        const url = request.url();
        
        let shouldBlock = false;
        
        switch (blockLevel) {
          case 'minimal':
            // Only block obvious non-content resources
            shouldBlock = ['image', 'media', 'font'].includes(resourceType) ||
                         /\.(jpg|jpeg|png|gif|svg|ico|woff|woff2|ttf|eot)(\?.*)?$/i.test(url);
            break;
            
          case 'standard':
            // Block most non-essential resources
            shouldBlock = this.BLOCKED_RESOURCE_TYPES.includes(resourceType) ||
                         this.BLOCKED_URL_PATTERNS.some(pattern => pattern.test(url)) ||
                         url.includes('ads') || url.includes('analytics');
            break;
            
          case 'aggressive':
            // Block everything except HTML, CSS for layout, and essential scripts
            shouldBlock = !['document', 'stylesheet', 'script'].includes(resourceType) ||
                         this.BLOCKED_URL_PATTERNS.some(pattern => pattern.test(url));
            break;
        }
        
        if (shouldBlock) {
          request.abort();
        } else {
          request.continue();
        }
      });
      
      console.warn(`Resource blocking enabled at '${blockLevel}' level for optimized content extraction`);
    } catch (error) {
      console.warn('Failed to enable resource blocking:', error);
      // Don't throw - this is an optimization, not a critical requirement
    }
  }

  /**
   * Disable resource blocking
   */
  async disableResourceBlocking(pageInstance: any): Promise<void> {
    try {
      await pageInstance.setRequestInterception(false);
      console.warn('Resource blocking disabled');
    } catch (error) {
      console.warn('Failed to disable resource blocking:', error);
    }
  }

  /**
   * Extract main content from page using intelligent DOM filtering
   */
  private async extractMainContent(pageInstance: any, type: 'html' | 'text'): Promise<string> {
    return await pageInstance.evaluate((selectors: string[], excludeSelectors: string[], extractType: string) => {
      // Function to find the main content element
      const findMainContent = (): Element | null => {
        // Try specific main content selectors first
        for (const selector of selectors) {
          const element = document.querySelector(selector);
          if (element && element.textContent && element.textContent.trim().length > 200) {
            return element;
          }
        }
        
        // Fallback: find largest content block by text length
        const contentCandidates = Array.from(document.querySelectorAll('div, section, article'));
        let bestCandidate: Element | null = null;
        let maxTextLength = 0;
        
        for (const candidate of contentCandidates) {
          // Skip if it's likely navigation, header, footer, etc.
          const tagName = candidate.tagName.toLowerCase();
          const className = candidate.className.toLowerCase();
          const id = candidate.id.toLowerCase();
          
          if (className.includes('nav') || className.includes('header') || 
              className.includes('footer') || className.includes('sidebar') ||
              id.includes('nav') || id.includes('header') || id.includes('footer')) {
            continue;
          }
          
          const textLength = candidate.textContent?.trim().length || 0;
          if (textLength > maxTextLength && textLength > 500) {
            maxTextLength = textLength;
            bestCandidate = candidate;
          }
        }
        
        return bestCandidate || document.body;
      };
      
      // Function to clean content by removing unwanted elements
      const cleanContent = (element: Element): Element => {
        const clone = element.cloneNode(true) as Element;
        
        // Remove unwanted elements
        for (const excludeSelector of excludeSelectors) {
          const unwantedElements = clone.querySelectorAll(excludeSelector);
          unwantedElements.forEach(el => el.remove());
        }
        
        return clone;
      };
      
      const mainElement = findMainContent();
      if (!mainElement) {
        return extractType === 'text' ? document.body?.innerText || '' : document.documentElement.outerHTML;
      }
      
      const cleanedElement = cleanContent(mainElement);
      
      if (extractType === 'text') {
        return cleanedElement.textContent || '';
      } else {
        return cleanedElement.outerHTML;
      }
    }, this.MAIN_CONTENT_SELECTORS, this.EXCLUDE_SELECTORS, type);
  }

  /**
   * Extract content summary (headings, first paragraphs, key sections)
   */
  private async extractSummaryContent(pageInstance: any, type: 'html' | 'text'): Promise<string> {
    return await pageInstance.evaluate((extractType: string) => {
      const summaryElements: Element[] = [];
      
      // Get page title
      const title = document.querySelector('title, h1');
      if (title) summaryElements.push(title);
      
      // Get main headings (h1, h2, h3)
      const headings = Array.from(document.querySelectorAll('h1, h2, h3')).slice(0, 10);
      summaryElements.push(...headings);
      
      // Get first few paragraphs with substantial content
      const paragraphs = Array.from(document.querySelectorAll('p'))
        .filter(p => (p.textContent?.trim().length || 0) > 50)
        .slice(0, 5);
      summaryElements.push(...paragraphs);
      
      // Get any meta description
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc && metaDesc.getAttribute('content')) {
        const metaElement = document.createElement('p');
        metaElement.textContent = `Meta Description: ${metaDesc.getAttribute('content')}`;
        summaryElements.push(metaElement);
      }
      
      if (extractType === 'text') {
        return summaryElements.map(el => el.textContent?.trim()).filter(Boolean).join('\n\n');
      } else {
        return summaryElements.map(el => el.outerHTML).join('\n');
      }
    }, type);
  }

  /**
   * Estimate content size for different extraction modes with actual content sampling
   */
  private async estimateContentByMode(pageInstance: any, contentMode: string = 'full'): Promise<{html: number, text: number, actualTokens: {html: number, text: number}}> {
    let html: string, text: string;
    
    switch (contentMode) {
      case 'summary':
        html = await this.extractSummaryContent(pageInstance, 'html');
        text = await this.extractSummaryContent(pageInstance, 'text');
        break;
      
      case 'main':
        html = await this.extractMainContent(pageInstance, 'html');
        text = await this.extractMainContent(pageInstance, 'text');
        break;
      
      default: // 'full'
        const fullContent = await pageInstance.evaluate(() => ({
          html: document.documentElement.outerHTML,
          text: document.body?.innerText || ''
        }));
        html = fullContent.html;
        text = fullContent.text;
        break;
    }
    
    // Calculate actual token counts from real content
    const actualTokens = {
      html: tokenManager.countTokens(html, 'html'),
      text: tokenManager.countTokens(text, 'text')
    };
    
    return {
      html: html.length,
      text: text.length,
      actualTokens
    };
  }

  /**
   * Analyze and process content request with optimal strategy
   */
  async processContentRequest(
    pageInstance: any,
    request: ContentRequest
  ): Promise<ContentResponse> {
    // Validate workflow state
    const workflowState = workflowValidator.getContext().currentState;
    if (workflowState === WorkflowState.INITIAL) {
      throw new Error('Cannot retrieve content before browser initialization and page navigation. Use browser_init and navigate first.');
    }

    // Note: Auto-detection is now less necessary since get_content automatically retries with reduced modes
    // We'll keep it for cases where we can predict extremely large pages

    // Determine content mode - default to 'main' for better token efficiency
    const contentMode = request.contentMode || (request.selector ? 'full' : 'main');
    
    // Handle resource blocking for optimized content extraction
    const resourceBlocking = request.resourceBlocking || (contentMode === 'main' || contentMode === 'summary' ? 'standard' : 'disabled');
    let resourceBlockingEnabled = false;
    
    if (resourceBlocking !== 'disabled' && !request.selector && !request.estimateOnly) {
      try {
        await this.enableResourceBlocking(pageInstance, resourceBlocking);
        resourceBlockingEnabled = true;
      } catch (error) {
        console.warn('Resource blocking setup failed, continuing without optimization:', error);
      }
    }
    
    // Perform pre-flight estimation if no specific type requested
    let finalType = request.type;
    let strategy: ContentStrategy;
    
    if (!finalType || request.estimateOnly) {
      const estimate = await this.performPreflightEstimation(pageInstance, request.selector, contentMode);
      
      if (request.estimateOnly) {
        return {
          content: '',
          strategy: estimate.strategy,
          metadata: {
            originalTokens: estimate.htmlTokens,
            processedTokens: finalType === 'text' ? estimate.textTokens : estimate.htmlTokens,
            exceedsLimit: estimate.requiresChunking,
            estimationOnly: true,
            selector: request.selector,
            recommendations: this.generateRecommendations(estimate, request)
          }
        };
      }
      
      finalType = estimate.recommendedType;
      strategy = estimate.strategy;
    } else {
      // Use requested type but still check if it's optimal
      strategy = finalType === 'html' ? ContentStrategy.FULL_HTML : ContentStrategy.FULL_TEXT;
    }

    try {
      // Retrieve actual content
      const rawContent = await this.retrieveContent(pageInstance, finalType, request.selector, contentMode);
      
      // Process content through token management
      const processing = tokenManager.processContent(rawContent, finalType, strategy);
      
      // Generate workflow guidance
      const workflowGuidance = this.generateWorkflowGuidance(processing, request);

      return {
        content: processing.processedContent,
        strategy: processing.strategy,
        metadata: {
          originalTokens: processing.metadata.originalTokens,
          processedTokens: processing.metadata.processedTokens,
          exceedsLimit: processing.metadata.originalTokens > 24000,
          chunksCount: processing.metadata.chunks,
          compressionRatio: processing.metadata.compressionRatio,
          estimationOnly: false,
          selector: request.selector,
          recommendations: this.generateProcessingRecommendations(processing, request)
        },
        workflowGuidance
      };
    } finally {
      // Always clean up resource blocking
      if (resourceBlockingEnabled) {
        try {
          await this.disableResourceBlocking(pageInstance);
        } catch (error) {
          console.warn('Failed to disable resource blocking during cleanup:', error);
        }
      }
    }
  }

  /**
   * Perform pre-flight content size estimation
   */
  private async performPreflightEstimation(
    pageInstance: any,
    selector?: string,
    contentMode: string = 'full'
  ): Promise<PreflightEstimate> {
    const warnings: string[] = [];
    
    try {
      // Use mode-aware content estimation with real content sampling
      let htmlTokens: number, textTokens: number;
      
      if (selector) {
        // For specific selectors, use traditional sampling
        const sampleContent = await this.sampleContent(pageInstance, selector);
        const fullSizeEstimate = await this.estimateFullContentSize(pageInstance, sampleContent, selector);
        htmlTokens = tokenManager.countTokens(fullSizeEstimate.html, 'html');
        textTokens = tokenManager.countTokens(fullSizeEstimate.text, 'text');
      } else {
        // Use intelligent content mode estimation with real content
        const contentEstimate = await this.estimateContentByMode(pageInstance, contentMode);
        htmlTokens = contentEstimate.actualTokens.html;
        textTokens = contentEstimate.actualTokens.text;
        
        // If initial estimate exceeds safe limits, try more aggressive filtering
        if (htmlTokens > 22000 || textTokens > 22000) {
          console.warn(`Initial ${contentMode} mode estimate too large (${Math.max(htmlTokens, textTokens)} tokens), applying aggressive filtering...`);
          
          // Try emergency content reduction
          const emergencyContent = await this.extractEmergencyContent(pageInstance);
          htmlTokens = tokenManager.countTokens(emergencyContent.html, 'html');
          textTokens = tokenManager.countTokens(emergencyContent.text, 'text');
          
          warnings.push(`Applied emergency content filtering due to large page size`);
        }
      }
      
      // Use actual token counts for validation instead of character-based estimation
      const htmlExceedsLimit = htmlTokens > 23000;
      const textExceedsLimit = textTokens > 23000;
      
      let recommendedType: 'html' | 'text';
      let strategy: ContentStrategy;
      let requiresChunking = false;
      
      if (!htmlExceedsLimit) {
        // HTML fits within limits
        recommendedType = 'html';
        strategy = ContentStrategy.FULL_HTML;
      } else if (!textExceedsLimit) {
        // HTML too large but text fits
        recommendedType = 'text';
        strategy = ContentStrategy.FULL_TEXT;
        warnings.push('HTML content is large, recommending text extraction for better performance');
      } else {
        // Both exceed limits - choose based on compression ratio
        const compressionRatio = textTokens / htmlTokens;
        if (compressionRatio < 0.6) {
          // Text is significantly smaller
          recommendedType = 'text';
          strategy = ContentStrategy.CHUNKED_TEXT;
        } else {
          // HTML structure might be worth preserving
          recommendedType = 'html';
          strategy = ContentStrategy.CHUNKED_HTML;
        }
        requiresChunking = true;
        warnings.push(`Content exceeds MCP token limits. Estimated ${Math.ceil(Math.max(htmlTokens, textTokens) / 20000)} chunks needed.`);
      }
      
      return {
        htmlTokens,
        textTokens,
        recommendedType,
        requiresChunking,
        strategy,
        warnings: warnings.length > 0 ? warnings : undefined
      };
      
    } catch (error) {
      // Fallback estimation
      console.warn('Pre-flight estimation failed, using conservative defaults:', error);
      return {
        htmlTokens: 30000, // Conservative estimate
        textTokens: 15000,
        recommendedType: 'text',
        requiresChunking: true,
        strategy: ContentStrategy.CHUNKED_TEXT,
        warnings: ['Could not estimate content size, using conservative text strategy']
      };
    }
  }

  /**
   * Sample content for estimation without retrieving full content
   */
  private async sampleContent(pageInstance: any, selector?: string): Promise<{html: string, text: string}> {
    if (selector) {
      // Sample specific element
      const element = await pageInstance.$(selector);
      if (!element) {
        throw new Error(`Element not found for sampling: ${selector}`);
      }
      
      const html = await element.evaluate((el: any) => el.outerHTML.substring(0, 2000));
      const text = await element.evaluate((el: any) => el.textContent?.substring(0, 2000) || '');
      
      return { html, text };
    } else {
      // Sample page content
      const html = await pageInstance.evaluate(() => {
        return document.documentElement.outerHTML.substring(0, 2000);
      });
      
      const text = await pageInstance.evaluate(() => {
        return document.body?.innerText?.substring(0, 2000) || '';
      });
      
      return { html, text };
    }
  }

  /**
   * Estimate full content size based on sample
   */
  private async estimateFullContentSize(
    pageInstance: any,
    sample: {html: string, text: string},
    selector?: string
  ): Promise<{html: string, text: string}> {
    
    if (selector) {
      // For specific elements, sample is likely representative
      const element = await pageInstance.$(selector);
      if (!element) {
        throw new Error(`Element not found: ${selector}`);
      }
      
      // Get actual content length for better estimation
      const actualLength = await element.evaluate((el: any) => ({
        html: el.outerHTML.length,
        text: (el.textContent || '').length
      }));
      
      // Scale sample to actual size
      const htmlRatio = actualLength.html / sample.html.length;
      const textRatio = actualLength.text / sample.text.length;
      
      return {
        html: sample.html.repeat(Math.ceil(htmlRatio)).substring(0, actualLength.html),
        text: sample.text.repeat(Math.ceil(textRatio)).substring(0, actualLength.text)
      };
    } else {
      // For full page, get actual sizes
      const pageSizes = await pageInstance.evaluate(() => ({
        html: document.documentElement.outerHTML.length,
        text: (document.body?.innerText || '').length
      }));
      
      // Scale sample to full page size
      const htmlRatio = pageSizes.html / this.ESTIMATION_SAMPLE_SIZE;
      const textRatio = pageSizes.text / this.ESTIMATION_SAMPLE_SIZE;
      
      return {
        html: sample.html.repeat(Math.ceil(htmlRatio)).substring(0, pageSizes.html),
        text: sample.text.repeat(Math.ceil(textRatio)).substring(0, pageSizes.text)
      };
    }
  }

  /**
   * Retrieve actual content from page
   */
  private async retrieveContent(
    pageInstance: any,
    type: 'html' | 'text',
    selector?: string,
    contentMode: string = 'full'
  ): Promise<string> {
    if (selector) {
      // Specific element extraction (unchanged)
      const element = await pageInstance.$(selector);
      if (!element) {
        throw new Error(`Element not found: ${selector}`);
      }
      
      if (type === 'text') {
        return await element.evaluate((el: any) => el.textContent || '');
      } else {
        return await element.evaluate((el: any) => el.outerHTML);
      }
    } else {
      // Full page extraction with intelligent content modes
      switch (contentMode) {
        case 'summary':
          return await this.extractSummaryContent(pageInstance, type);
          
        case 'main':
          return await this.extractMainContent(pageInstance, type);
          
        default: // 'full'
          if (type === 'text') {
            return await pageInstance.evaluate(() => {
              return document.body ? document.body.innerText : '';
            });
          } else {
            return await pageInstance.content();
          }
      }
    }
  }

  /**
   * Generate recommendations based on estimation
   */
  private generateRecommendations(estimate: PreflightEstimate, request: ContentRequest): string[] {
    const recommendations: string[] = [];
    
    if (estimate.requiresChunking) {
      recommendations.push('Content exceeds MCP token limits and will require chunking');
      
      if (estimate.textTokens < estimate.htmlTokens * 0.7) {
        recommendations.push('Consider using type="text" for significantly smaller token count');
      }
      
      if (request.chunkingPreference === 'avoid') {
        recommendations.push('Use a more specific selector to reduce content size');
        recommendations.push('Try contentMode="main" to extract only main content areas');
        recommendations.push('Try contentMode="summary" for page overview with key headings');
      }
    }
    
    // Content mode recommendations
    if (!request.selector && (!request.contentMode || request.contentMode === 'full')) {
      if (estimate.htmlTokens > 15000) {
        recommendations.push('💡 Try contentMode="main" to automatically extract main content and reduce tokens by ~70%');
      }
      if (estimate.htmlTokens > 30000) {
        recommendations.push('📋 Try contentMode="summary" for page overview (headings, key paragraphs)');
      }
    }
    
    if (estimate.htmlTokens > 50000) {
      recommendations.push('Content is very large - consider progressive loading with specific selectors');
    }
    
    if (estimate.warnings) {
      recommendations.push(...estimate.warnings);
    }
    
    return recommendations;
  }

  /**
   * Generate processing recommendations
   */
  private generateProcessingRecommendations(processing: any, request: ContentRequest): string[] {
    const recommendations: string[] = [];
    
    if (processing.metadata.chunks && processing.metadata.chunks > this.CHUNK_WARNING_THRESHOLD) {
      recommendations.push(`Content was split into ${processing.metadata.chunks} chunks - consider using more specific selectors`);
    }
    
    if (processing.strategy === ContentStrategy.FALLBACK_TEXT && request.type === 'html') {
      recommendations.push('Automatically switched to text content due to token limits');
    }
    
    if (processing.metadata.compressionRatio && processing.metadata.compressionRatio < 0.5) {
      recommendations.push('Text extraction achieved significant size reduction - consider using type="text" for future requests');
    }
    
    return recommendations;
  }

  /**
   * Generate workflow guidance message
   */
  private generateWorkflowGuidance(processing: any, request: ContentRequest): string {
    let guidance = '';
    
    // Workflow state guidance
    const workflowState = workflowValidator.getContext().currentState;
    if (workflowState === WorkflowState.CONTENT_ANALYZED) {
      guidance += '\n✅ Content analyzed successfully! You can now use:\n';
      guidance += '  • find_selector to locate elements by text content\n';
      guidance += '  • click, type, and other interaction tools\n';
      guidance += '  • Additional get_content calls for specific elements\n';
      guidance += '  • Different contentMode options: "main", "summary", "full"\n';
    }
    
    // Token management guidance
    if (Array.isArray(processing.processedContent)) {
      guidance += `\n📋 Content split into ${processing.processedContent.length} chunks for MCP compliance\n`;
      guidance += '  • Each chunk respects the 25,000 token limit\n';
      guidance += '  • Use chunk metadata for navigation and reference\n';
    }
    
    // Strategy guidance
    if (processing.strategy === ContentStrategy.FALLBACK_TEXT) {
      guidance += '\n💡 Automatically optimized to text content for better performance\n';
    }
    
    return guidance.trim();
  }

  /**
   * Get content strategy summary for debugging
   */
  getStrategySummary(pageInstance: any, selector?: string): Promise<string> {
    return this.performPreflightEstimation(pageInstance, selector).then(estimate => {
      const workflowContext = workflowValidator.getContext();
      
      return `
Content Strategy Summary:
- Workflow State: ${workflowContext.currentState}
- Content Analyzed: ${workflowContext.contentAnalyzed}
- Estimated HTML Tokens: ${estimate.htmlTokens}
- Estimated Text Tokens: ${estimate.textTokens}
- Recommended Type: ${estimate.recommendedType}
- Strategy: ${estimate.strategy}
- Requires Chunking: ${estimate.requiresChunking}
- Warnings: ${estimate.warnings?.join(', ') || 'None'}
      `.trim();
    });
  }
  /**
   * Emergency content extraction for extremely large pages
   * Extracts only the most essential content to stay within token limits
   */
  private async extractEmergencyContent(pageInstance: any): Promise<{html: string, text: string}> {
    return await pageInstance.evaluate(() => {
      const essentialElements: Element[] = [];
      
      // Page title
      const title = document.querySelector('title');
      if (title) essentialElements.push(title);
      
      // Main heading only
      const mainHeading = document.querySelector('h1');
      if (mainHeading) essentialElements.push(mainHeading);
      
      // First significant paragraph
      const firstParagraph = Array.from(document.querySelectorAll('p'))
        .find(p => (p.textContent?.trim().length || 0) > 100);
      if (firstParagraph) essentialElements.push(firstParagraph);
      
      // Navigation elements (for interactive elements)
      const navElements = Array.from(document.querySelectorAll('a, button, input[type="submit"], input[type="button"]'))
        .filter(el => el.textContent?.trim())
        .slice(0, 10); // Limit to first 10 interactive elements
      essentialElements.push(...navElements);
      
      // Key form elements
      const formElements = Array.from(document.querySelectorAll('input[type="text"], input[type="email"], input[type="password"], textarea'))
        .slice(0, 5); // Limit to first 5 form elements
      essentialElements.push(...formElements);
      
      const htmlContent = essentialElements.map(el => el.outerHTML).join('\n');
      const textContent = `Page: ${document.title || 'Unknown'}\n\n` +
        essentialElements.map(el => {
          const text = el.textContent?.trim();
          const tagName = el.tagName.toLowerCase();
          const type = el.getAttribute('type');
          const href = el.getAttribute('href');
          
          if (tagName === 'a' && href) {
            return `Link: ${text} (${href})`;
          } else if (['input', 'button'].includes(tagName)) {
            return `${type ? type.charAt(0).toUpperCase() + type.slice(1) : 'Input'}: ${text || el.getAttribute('placeholder') || el.getAttribute('value') || '[Element]'}`;
          } else {
            return text;
          }
        }).filter(Boolean).join('\n\n');
      
      return {
        html: `<!-- Emergency content extraction for large page -->\n${htmlContent}`,
        text: `Emergency Content Summary:\n${textContent}`
      };
    });
  }
}

// Global content strategy engine instance
export const contentStrategy = new ContentStrategyEngine();