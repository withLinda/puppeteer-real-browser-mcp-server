/**
 * Self-Healing Locator System for MCP Server
 * 
 * Automatically generates fallback selectors when primary selectors fail:
 * - Attribute-based fallbacks (id, name, data-*, aria-*)
 * - Text content-based selectors
 * - Position-based selectors (nth-child, etc.)
 * - Semantic role-based selectors
 * - Visual hint-based selectors
 * 
 * Based on 2025 web automation resilience best practices.
 */

export interface SelectorFallback {
  selector: string;
  type: 'attribute' | 'text' | 'position' | 'semantic' | 'visual';
  confidence: number; // 0-1 score
  description: string;
  strategy: string;
}

export interface ElementInfo {
  tagName: string;
  id?: string;
  className?: string;
  name?: string;
  placeholder?: string;
  ariaLabel?: string;
  ariaRole?: string;
  dataTestId?: string;
  textContent?: string;
  value?: string;
  type?: string;
  href?: string;
  src?: string;
  title?: string;
  alt?: string;
  position?: {
    parentSelector: string;
    childIndex: number;
    siblingIndex: number;
  };
}

export class SelfHealingLocators {
  private readonly MAX_FALLBACKS = 10;
  private readonly MIN_CONFIDENCE = 0.3;
  
  // High-confidence attribute selectors
  private readonly HIGH_CONFIDENCE_ATTRIBUTES = [
    'id', 'data-testid', 'data-test-id', 'data-cy', 'data-test',
    'aria-label', 'aria-labelledby', 'name', 'data-automation',
    'data-qa', 'data-selector'
  ];
  
  // Medium-confidence attribute selectors
  private readonly MEDIUM_CONFIDENCE_ATTRIBUTES = [
    'class', 'aria-role', 'title', 'placeholder', 'alt',
    'href', 'src', 'type', 'value', 'data-*'
  ];

  /**
   * Generate fallback selectors for a failed primary selector
   */
  async generateFallbacks(
    pageInstance: any,
    primarySelector: string,
    expectedText?: string
  ): Promise<SelectorFallback[]> {
    const fallbacks: SelectorFallback[] = [];
    
    try {
      // First, try to understand what the primary selector was targeting
      const elementInfo = await this.analyzeFailedSelector(pageInstance, primarySelector, expectedText);
      
      if (elementInfo) {
        // Generate fallbacks based on element information
        fallbacks.push(...this.generateAttributeFallbacks(elementInfo));
        fallbacks.push(...this.generateTextFallbacks(elementInfo));
        fallbacks.push(...this.generateSemanticFallbacks(elementInfo));
        fallbacks.push(...this.generatePositionFallbacks(elementInfo));
      } else {
        // Primary selector completely failed, generate exploratory fallbacks
        fallbacks.push(...await this.generateExploratoryFallbacks(pageInstance, primarySelector, expectedText));
      }
      
      // Sort by confidence and limit results
      const sortedFallbacks = fallbacks
        .filter(f => f.confidence >= this.MIN_CONFIDENCE)
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, this.MAX_FALLBACKS);
      
      return sortedFallbacks;
      
    } catch (error) {
      console.warn('Fallback generation failed:', error);
      return [];
    }
  }

  /**
   * Try to find an element using fallback selectors
   */
  async findElementWithFallbacks(
    pageInstance: any,
    primarySelector: string,
    expectedText?: string
  ): Promise<{ element: any; usedSelector: string; strategy: string } | null> {
    
    // First try the primary selector
    try {
      const primaryElement = await pageInstance.$(primarySelector);
      if (primaryElement) {
        return {
          element: primaryElement,
          usedSelector: primarySelector,
          strategy: 'primary'
        };
      }
    } catch (error) {
      // Continue to fallbacks
    }
    
    // Generate and try fallback selectors
    const fallbacks = await this.generateFallbacks(pageInstance, primarySelector, expectedText);
    
    for (const fallback of fallbacks) {
      try {
        const element = await pageInstance.$(fallback.selector);
        if (element) {
          // Verify element is reasonable match if we have expected text
          if (expectedText) {
            const elementText = await element.evaluate((el: any) => 
              (el.textContent || el.value || el.placeholder || '').toLowerCase()
            );
            
            if (!elementText.includes(expectedText.toLowerCase())) {
              continue; // Skip this fallback if text doesn't match
            }
          }
          
          console.warn(`Self-healing: Found element using fallback selector '${fallback.selector}' (${fallback.type}, confidence: ${fallback.confidence})`);
          
          return {
            element,
            usedSelector: fallback.selector,
            strategy: fallback.type
          };
        }
      } catch (error) {
        // Continue to next fallback
        continue;
      }
    }
    
    return null;
  }

  /**
   * Analyze a failed selector to understand what it was targeting
   */
  private async analyzeFailedSelector(
    pageInstance: any,
    selector: string,
    expectedText?: string
  ): Promise<ElementInfo | null> {
    
    try {
      // Try to find similar elements or get page context
      const analysis = await pageInstance.evaluate(
        (sel: string, text?: string) => {
          // Parse the selector to understand intent
          const selectorInfo = {
            hasId: sel.includes('#'),
            hasClass: sel.includes('.'),
            hasAttribute: sel.includes('['),
            tagName: sel.match(/^[a-zA-Z]+/)?.[0] || '',
            idValue: sel.match(/#([^.\[\s]+)/)?.[1],
            classValues: sel.match(/\.([^#.\[\s]+)/g)?.map(c => c.slice(1)) || [],
            attributes: []
          };
          
          // If we have expected text, search for elements containing it
          if (text) {
            const candidates = Array.from(document.querySelectorAll('*'))
              .filter(el => {
                const textContent = (el.textContent || '').toLowerCase();
                const value = (el as any).value || '';
                const placeholder = (el as any).placeholder || '';
                const ariaLabel = el.getAttribute('aria-label') || '';
                
                return textContent.includes(text.toLowerCase()) ||
                       value.toLowerCase().includes(text.toLowerCase()) ||
                       placeholder.toLowerCase().includes(text.toLowerCase()) ||
                       ariaLabel.toLowerCase().includes(text.toLowerCase());
              })
              .slice(0, 5); // Limit candidates
            
            // Return info about the first promising candidate
            if (candidates.length > 0) {
              const el = candidates[0];
              return {
                tagName: el.tagName.toLowerCase(),
                id: el.id || undefined,
                className: el.className || undefined,
                name: (el as any).name || undefined,
                placeholder: (el as any).placeholder || undefined,
                ariaLabel: el.getAttribute('aria-label') || undefined,
                ariaRole: el.getAttribute('role') || undefined,
                dataTestId: el.getAttribute('data-testid') || el.getAttribute('data-test-id') || undefined,
                textContent: (el.textContent || '').trim().slice(0, 50),
                value: (el as any).value || undefined,
                type: (el as any).type || undefined,
                href: (el as any).href || undefined,
                src: (el as any).src || undefined,
                title: el.getAttribute('title') || undefined,
                alt: (el as any).alt || undefined
              };
            }
          }
          
          return null;
        },
        selector,
        expectedText
      );
      
      return analysis;
      
    } catch (error) {
      console.warn('Selector analysis failed:', error);
      return null;
    }
  }

  /**
   * Generate attribute-based fallback selectors
   */
  private generateAttributeFallbacks(elementInfo: ElementInfo): SelectorFallback[] {
    const fallbacks: SelectorFallback[] = [];
    
    // High-confidence attributes
    for (const attr of this.HIGH_CONFIDENCE_ATTRIBUTES) {
      const value = (elementInfo as any)[attr.replace(/-([a-z])/g, (g) => g[1].toUpperCase())];
      if (value) {
        fallbacks.push({
          selector: `[${attr}="${value}"]`,
          type: 'attribute',
          confidence: 0.9,
          description: `Using ${attr} attribute`,
          strategy: `attribute-${attr}`
        });
        
        // Also try tag + attribute combination
        if (elementInfo.tagName) {
          fallbacks.push({
            selector: `${elementInfo.tagName}[${attr}="${value}"]`,
            type: 'attribute',
            confidence: 0.85,
            description: `Using ${elementInfo.tagName} with ${attr}`,
            strategy: `tag-attribute-${attr}`
          });
        }
      }
    }
    
    // ID-based fallbacks (highest priority)
    if (elementInfo.id) {
      fallbacks.push({
        selector: `#${elementInfo.id}`,
        type: 'attribute',
        confidence: 0.95,
        description: 'Using ID selector',
        strategy: 'id'
      });
    }
    
    // Name attribute
    if (elementInfo.name) {
      fallbacks.push({
        selector: `[name="${elementInfo.name}"]`,
        type: 'attribute',
        confidence: 0.8,
        description: 'Using name attribute',
        strategy: 'name'
      });
      
      if (elementInfo.tagName) {
        fallbacks.push({
          selector: `${elementInfo.tagName}[name="${elementInfo.name}"]`,
          type: 'attribute',
          confidence: 0.75,
          description: `Using ${elementInfo.tagName} with name`,
          strategy: 'tag-name'
        });
      }
    }
    
    // Class-based fallbacks (lower confidence due to potential changes)
    if (elementInfo.className) {
      const classes = elementInfo.className.split(/\s+/).filter(Boolean);
      for (const cls of classes.slice(0, 3)) { // Limit to first 3 classes
        fallbacks.push({
          selector: `.${cls}`,
          type: 'attribute',
          confidence: 0.6,
          description: `Using class ${cls}`,
          strategy: 'class'
        });
        
        if (elementInfo.tagName) {
          fallbacks.push({
            selector: `${elementInfo.tagName}.${cls}`,
            type: 'attribute',
            confidence: 0.65,
            description: `Using ${elementInfo.tagName} with class ${cls}`,
            strategy: 'tag-class'
          });
        }
      }
    }
    
    return fallbacks;
  }

  /**
   * Generate text-based fallback selectors
   */
  private generateTextFallbacks(elementInfo: ElementInfo): SelectorFallback[] {
    const fallbacks: SelectorFallback[] = [];
    
    // Text content fallbacks
    if (elementInfo.textContent && elementInfo.textContent.trim()) {
      const text = elementInfo.textContent.trim();
      
      // Exact text match
      fallbacks.push({
        selector: `//*[text()='${text}']`,
        type: 'text',
        confidence: 0.8,
        description: `Using exact text: "${text}"`,
        strategy: 'text-exact'
      });
      
      // Partial text match
      if (text.length > 10) {
        const shortText = text.slice(0, 20);
        fallbacks.push({
          selector: `//*[contains(text(), '${shortText}')]`,
          type: 'text',
          confidence: 0.7,
          description: `Using partial text: "${shortText}"`,
          strategy: 'text-partial'
        });
      }
      
      // Tag + text combination
      if (elementInfo.tagName) {
        fallbacks.push({
          selector: `//${elementInfo.tagName}[text()='${text}']`,
          type: 'text',
          confidence: 0.85,
          description: `Using ${elementInfo.tagName} with text: "${text}"`,
          strategy: 'tag-text'
        });
      }
    }
    
    // Placeholder text
    if (elementInfo.placeholder) {
      fallbacks.push({
        selector: `[placeholder="${elementInfo.placeholder}"]`,
        type: 'text',
        confidence: 0.75,
        description: `Using placeholder: "${elementInfo.placeholder}"`,
        strategy: 'placeholder'
      });
    }
    
    // Value attribute
    if (elementInfo.value) {
      fallbacks.push({
        selector: `[value="${elementInfo.value}"]`,
        type: 'text',
        confidence: 0.6,
        description: `Using value: "${elementInfo.value}"`,
        strategy: 'value'
      });
    }
    
    return fallbacks;
  }

  /**
   * Generate semantic fallback selectors
   */
  private generateSemanticFallbacks(elementInfo: ElementInfo): SelectorFallback[] {
    const fallbacks: SelectorFallback[] = [];
    
    // ARIA label
    if (elementInfo.ariaLabel) {
      fallbacks.push({
        selector: `[aria-label="${elementInfo.ariaLabel}"]`,
        type: 'semantic',
        confidence: 0.85,
        description: `Using ARIA label: "${elementInfo.ariaLabel}"`,
        strategy: 'aria-label'
      });
    }
    
    // ARIA role
    if (elementInfo.ariaRole) {
      fallbacks.push({
        selector: `[role="${elementInfo.ariaRole}"]`,
        type: 'semantic',
        confidence: 0.7,
        description: `Using ARIA role: "${elementInfo.ariaRole}"`,
        strategy: 'aria-role'
      });
      
      if (elementInfo.tagName) {
        fallbacks.push({
          selector: `${elementInfo.tagName}[role="${elementInfo.ariaRole}"]`,
          type: 'semantic',
          confidence: 0.75,
          description: `Using ${elementInfo.tagName} with role: "${elementInfo.ariaRole}"`,
          strategy: 'tag-role'
        });
      }
    }
    
    // Title attribute
    if (elementInfo.title) {
      fallbacks.push({
        selector: `[title="${elementInfo.title}"]`,
        type: 'semantic',
        confidence: 0.7,
        description: `Using title: "${elementInfo.title}"`,
        strategy: 'title'
      });
    }
    
    // Alt text for images
    if (elementInfo.alt) {
      fallbacks.push({
        selector: `[alt="${elementInfo.alt}"]`,
        type: 'semantic',
        confidence: 0.75,
        description: `Using alt text: "${elementInfo.alt}"`,
        strategy: 'alt'
      });
    }
    
    // Input type
    if (elementInfo.type && elementInfo.tagName === 'input') {
      fallbacks.push({
        selector: `input[type="${elementInfo.type}"]`,
        type: 'semantic',
        confidence: 0.6,
        description: `Using input type: "${elementInfo.type}"`,
        strategy: 'input-type'
      });
    }
    
    return fallbacks;
  }

  /**
   * Generate position-based fallback selectors
   */
  private generatePositionFallbacks(elementInfo: ElementInfo): SelectorFallback[] {
    const fallbacks: SelectorFallback[] = [];
    
    // These are lower confidence as positions can change
    if (elementInfo.position) {
      const { parentSelector, childIndex, siblingIndex } = elementInfo.position;
      
      if (parentSelector && childIndex !== undefined) {
        fallbacks.push({
          selector: `${parentSelector} > *:nth-child(${childIndex + 1})`,
          type: 'position',
          confidence: 0.4,
          description: `Using parent-child position: ${childIndex + 1}`,
          strategy: 'nth-child'
        });
      }
      
      if (elementInfo.tagName && siblingIndex !== undefined) {
        fallbacks.push({
          selector: `${elementInfo.tagName}:nth-of-type(${siblingIndex + 1})`,
          type: 'position',
          confidence: 0.35,
          description: `Using sibling position: ${siblingIndex + 1}`,
          strategy: 'nth-of-type'
        });
      }
    }
    
    return fallbacks;
  }

  /**
   * Generate exploratory fallbacks when primary selector completely fails
   */
  private async generateExploratoryFallbacks(
    pageInstance: any,
    primarySelector: string,
    expectedText?: string
  ): Promise<SelectorFallback[]> {
    const fallbacks: SelectorFallback[] = [];
    
    try {
      // Analyze the selector structure to understand intent
      const selectorAnalysis = this.analyzeSelectorStructure(primarySelector);
      
      // Generate similar selectors based on structure
      if (selectorAnalysis.hasId) {
        // Try variations without ID
        const withoutId = primarySelector.replace(/#[^.\[\s]+/g, '');
        if (withoutId && withoutId !== primarySelector) {
          fallbacks.push({
            selector: withoutId,
            type: 'attribute',
            confidence: 0.5,
            description: 'Trying selector without ID',
            strategy: 'remove-id'
          });
        }
      }
      
      if (selectorAnalysis.hasClass) {
        // Try with fewer classes
        const classes = selectorAnalysis.classValues;
        if (classes.length > 1) {
          for (let i = 0; i < classes.length; i++) {
            fallbacks.push({
              selector: `.${classes[i]}`,
              type: 'attribute',
              confidence: 0.4,
              description: `Trying single class: ${classes[i]}`,
              strategy: 'single-class'
            });
          }
        }
      }
      
      // If we have expected text, search broadly
      if (expectedText) {
        const textBasedFallbacks = await this.findByTextContent(pageInstance, expectedText);
        fallbacks.push(...textBasedFallbacks);
      }
      
    } catch (error) {
      console.warn('Exploratory fallback generation failed:', error);
    }
    
    return fallbacks;
  }

  /**
   * Analyze selector structure to understand intent
   */
  private analyzeSelectorStructure(selector: string): {
    hasId: boolean;
    hasClass: boolean;
    hasAttribute: boolean;
    tagName?: string;
    idValue?: string;
    classValues: string[];
  } {
    return {
      hasId: selector.includes('#'),
      hasClass: selector.includes('.'),
      hasAttribute: selector.includes('['),
      tagName: selector.match(/^[a-zA-Z]+/)?.[0],
      idValue: selector.match(/#([^.\[\s]+)/)?.[1],
      classValues: selector.match(/\.([^#.\[\s]+)/g)?.map(c => c.slice(1)) || []
    };
  }

  /**
   * Find elements by text content
   */
  private async findByTextContent(pageInstance: any, text: string): Promise<SelectorFallback[]> {
    const fallbacks: SelectorFallback[] = [];
    
    try {
      const candidates = await pageInstance.evaluate((searchText: string) => {
        const elements = Array.from(document.querySelectorAll('*'))
          .filter(el => {
            const textContent = (el.textContent || '').toLowerCase();
            const value = (el as any).value || '';
            const placeholder = (el as any).placeholder || '';
            
            return textContent.includes(searchText.toLowerCase()) ||
                   value.toLowerCase().includes(searchText.toLowerCase()) ||
                   placeholder.toLowerCase().includes(searchText.toLowerCase());
          })
          .slice(0, 5)
          .map(el => ({
            tagName: el.tagName.toLowerCase(),
            id: el.id || null,
            className: el.className || null,
            textContent: (el.textContent || '').trim().slice(0, 30)
          }));
        
        return elements;
      }, text);
      
      for (const candidate of candidates) {
        if (candidate.id) {
          fallbacks.push({
            selector: `#${candidate.id}`,
            type: 'text',
            confidence: 0.6,
            description: `Found by text, using ID: ${candidate.id}`,
            strategy: 'text-search-id'
          });
        }
        
        if (candidate.className) {
          const firstClass = candidate.className.split(/\s+/)[0];
          fallbacks.push({
            selector: `.${firstClass}`,
            type: 'text',
            confidence: 0.4,
            description: `Found by text, using class: ${firstClass}`,
            strategy: 'text-search-class'
          });
        }
        
        fallbacks.push({
          selector: candidate.tagName,
          type: 'text',
          confidence: 0.3,
          description: `Found by text, using tag: ${candidate.tagName}`,
          strategy: 'text-search-tag'
        });
      }
      
    } catch (error) {
      console.warn('Text-based search failed:', error);
    }
    
    return fallbacks;
  }

  /**
   * Get summary of fallback strategies for debugging
   */
  async getFallbackSummary(
    pageInstance: any,
    primarySelector: string,
    expectedText?: string
  ): Promise<string> {
    const fallbacks = await this.generateFallbacks(pageInstance, primarySelector, expectedText);
    
    if (fallbacks.length === 0) {
      return `No fallback selectors generated for: ${primarySelector}`;
    }
    
    const summary = fallbacks
      .slice(0, 5) // Top 5 fallbacks
      .map((fb, index) => 
        `${index + 1}. ${fb.selector} (${fb.type}, confidence: ${fb.confidence}, ${fb.strategy})`
      )
      .join('\n');
    
    return `\nSelf-Healing Fallback Selectors for: ${primarySelector}\n${summary}`;
  }
}

// Global self-healing locators instance
export const selfHealingLocators = new SelfHealingLocators();