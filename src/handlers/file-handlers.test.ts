import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { handleSaveContentAsMarkdown } from './file-handlers.js';
import * as browserManager from '../browser-manager.js';
import * as workflowValidation from '../workflow-validation.js';
import * as tokenManagement from '../token-management.js';

// Mock modules
vi.mock('fs', () => ({
  promises: {
    mkdir: vi.fn(),
    access: vi.fn(),
    writeFile: vi.fn(),
    stat: vi.fn()
  }
}));

vi.mock('../browser-manager.js', () => ({
  getPageInstance: vi.fn()
}));

vi.mock('../workflow-validation.js', () => ({
  validateWorkflow: vi.fn(),
  recordExecution: vi.fn(),
  workflowValidator: {
    getValidationSummary: vi.fn()
  }
}));

vi.mock('../token-management.js', () => ({
  tokenManager: {
    countTokens: vi.fn()
  }
}));

// Mock TurndownService
vi.mock('turndown', () => {
  const mockInstance = {
    turndown: vi.fn().mockReturnValue('# Mock Markdown\n\nContent converted to markdown.'),
    addRule: vi.fn()
  };
  mockInstance.addRule.mockReturnValue(mockInstance);
  
  return {
    default: vi.fn().mockImplementation(() => mockInstance)
  };
});

describe('file-handlers', () => {
  const mockFs = fs as any;
  const mockBrowserManager = browserManager as any;
  const mockWorkflowValidation = workflowValidation as any;
  const mockTokenManagement = tokenManagement as any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default successful workflow validation
    mockWorkflowValidation.validateWorkflow.mockReturnValue({
      isValid: true
    });
    
    // Default token count
    mockTokenManagement.tokenManager.countTokens.mockReturnValue(1000);
    
    // Default file system mocks
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.access.mockRejectedValue({ code: 'ENOENT' }); // File doesn't exist
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.stat.mockResolvedValue({ size: 1024 });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('handleSaveContentAsMarkdown', () => {
    it('should throw error when browser is not initialized', async () => {
      // Arrange
      mockBrowserManager.getPageInstance.mockReturnValue(null);

      // Act & Assert
      await expect(handleSaveContentAsMarkdown({
        filePath: '/test/file.md'
      })).rejects.toThrow('Browser not initialized. Call browser_init first.');
    });

    it('should validate file path and reject non-.md extensions', async () => {
      // Arrange
      mockBrowserManager.getPageInstance.mockReturnValue({});

      // Act & Assert
      await expect(handleSaveContentAsMarkdown({
        filePath: '/test/file.txt'
      })).rejects.toThrow('File path must end with .md extension');
    });

    it('should prevent directory traversal attacks', async () => {
      // Arrange
      mockBrowserManager.getPageInstance.mockReturnValue({});

      // Act & Assert
      await expect(handleSaveContentAsMarkdown({
        filePath: '../../../etc/passwd.md'
      })).rejects.toThrow('File path cannot contain directory traversal patterns (..)');
    });

    it('should prevent writing to system directories', async () => {
      // Arrange
      mockBrowserManager.getPageInstance.mockReturnValue({});

      // Act & Assert
      await expect(handleSaveContentAsMarkdown({
        filePath: '/etc/malicious.md'
      })).rejects.toThrow('Cannot write to system directories');
    });

    it('should throw error when file already exists', async () => {
      // Arrange
      const mockPage = {
        url: vi.fn().mockResolvedValue('https://example.com'),
        evaluate: vi.fn().mockResolvedValue('Sample content')
      };
      mockBrowserManager.getPageInstance.mockReturnValue(mockPage);
      mockFs.access.mockResolvedValue(undefined); // File exists

      // Act & Assert
      await expect(handleSaveContentAsMarkdown({
        filePath: '/test/existing-file.md'
      })).rejects.toThrow('File already exists: /test/existing-file.md');
    });

    it('should extract text content and save as markdown successfully', async () => {
      // Arrange
      const mockPage = {
        url: vi.fn().mockResolvedValue('https://example.com'),
        evaluate: vi.fn().mockResolvedValue('Sample text content')
      };
      mockBrowserManager.getPageInstance.mockReturnValue(mockPage);

      const filePath = '/tmp/test/output.md';

      // Act
      const result = await handleSaveContentAsMarkdown({
        filePath,
        contentType: 'text'
      });

      // Assert
      expect(mockFs.mkdir).toHaveBeenCalledWith('/tmp/test', { recursive: true });
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        filePath,
        expect.stringContaining('Sample text content'),
        'utf8'
      );
      expect(result.content[0].text).toContain('✅ Content saved successfully!');
      expect(result.content[0].text).toContain(filePath);
    });

    it('should extract HTML content and convert to markdown', async () => {
      // Arrange
      const mockPage = {
        url: vi.fn().mockResolvedValue('https://example.com'),
        content: vi.fn().mockResolvedValue('<h1>Test</h1><p>Content</p>')
      };
      mockBrowserManager.getPageInstance.mockReturnValue(mockPage);

      const filePath = '/tmp/test/output.md';

      // Act
      const result = await handleSaveContentAsMarkdown({
        filePath,
        contentType: 'html'
      });

      // Assert
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        filePath,
        expect.stringContaining('# Mock Markdown'),
        'utf8'
      );
      expect(result.content[0].text).toContain('✅ Content saved successfully!');
    });

    it('should extract content from specific selector', async () => {
      // Arrange
      const mockElement = {};
      const mockPage = {
        url: vi.fn().mockResolvedValue('https://example.com'),
        $: vi.fn().mockResolvedValue(mockElement),
        $eval: vi.fn().mockResolvedValue('Selected content')
      };
      mockBrowserManager.getPageInstance.mockReturnValue(mockPage);

      const filePath = '/tmp/test/output.md';

      // Act
      const result = await handleSaveContentAsMarkdown({
        filePath,
        contentType: 'text',
        selector: '.content'
      });

      // Assert
      expect(mockPage.$).toHaveBeenCalledWith('.content');
      expect(mockPage.$eval).toHaveBeenCalledWith('.content', expect.any(Function));
      expect(result.content[0].text).toContain('✅ Content saved successfully!');
    });

    it('should throw error when selector element is not found', async () => {
      // Arrange
      const mockPage = {
        url: vi.fn().mockResolvedValue('https://example.com'),
        $: vi.fn().mockResolvedValue(null)
      };
      mockBrowserManager.getPageInstance.mockReturnValue(mockPage);

      // Act & Assert
      await expect(handleSaveContentAsMarkdown({
        filePath: '/test/output.md',
        selector: '.nonexistent'
      })).rejects.toThrow('Element not found: .nonexistent');
    });

    it('should include metadata header by default', async () => {
      // Arrange
      const mockPage = {
        url: vi.fn().mockResolvedValue('https://example.com'),
        evaluate: vi.fn().mockResolvedValue('Content')
      };
      mockBrowserManager.getPageInstance.mockReturnValue(mockPage);

      const filePath = '/tmp/test/output.md';

      // Act
      await handleSaveContentAsMarkdown({
        filePath,
        contentType: 'text'
      });

      // Assert
      const writeCall = mockFs.writeFile.mock.calls[0];
      const fileContent = writeCall[1];
      expect(fileContent).toContain('---');
      expect(fileContent).toContain('title: Extracted Content');
      expect(fileContent).toContain('source: https://example.com');
      expect(fileContent).toContain('extracted_by: Puppeteer Real Browser MCP Server');
    });

    it('should exclude metadata when includeMetadata is false', async () => {
      // Arrange
      const mockPage = {
        url: vi.fn().mockResolvedValue('https://example.com'),
        evaluate: vi.fn().mockResolvedValue('Content')
      };
      mockBrowserManager.getPageInstance.mockReturnValue(mockPage);

      const filePath = '/tmp/test/output.md';

      // Act
      await handleSaveContentAsMarkdown({
        filePath,
        contentType: 'text',
        formatOptions: {
          includeMetadata: false
        }
      });

      // Assert
      const writeCall = mockFs.writeFile.mock.calls[0];
      const fileContent = writeCall[1];
      expect(fileContent).not.toContain('---');
      expect(fileContent).not.toContain('title: Extracted Content');
    });

    it('should warn about large files', async () => {
      // Arrange
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const mockPage = {
        url: vi.fn().mockResolvedValue('https://example.com'),
        evaluate: vi.fn().mockResolvedValue('Content')
      };
      mockBrowserManager.getPageInstance.mockReturnValue(mockPage);
      mockTokenManagement.tokenManager.countTokens.mockReturnValue(60000); // Large file

      const filePath = '/tmp/test/output.md';

      // Act
      await handleSaveContentAsMarkdown({
        filePath,
        contentType: 'text'
      });

      // Assert
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Large file detected: 60000 tokens')
      );

      consoleSpy.mockRestore();
    });

    it('should throw error when content is empty', async () => {
      // Arrange
      const mockPage = {
        url: vi.fn().mockResolvedValue('https://example.com'),
        evaluate: vi.fn().mockResolvedValue('')
      };
      mockBrowserManager.getPageInstance.mockReturnValue(mockPage);

      // Act & Assert
      await expect(handleSaveContentAsMarkdown({
        filePath: '/test/output.md'
      })).rejects.toThrow('No content found to save. The page or selected element appears to be empty.');
    });

    it('should handle workflow validation failure', async () => {
      // Arrange
      mockWorkflowValidation.validateWorkflow.mockReturnValue({
        isValid: false,
        errorMessage: 'Workflow validation failed',
        suggestedAction: 'Initialize browser first'
      });
      mockWorkflowValidation.workflowValidator.getValidationSummary.mockReturnValue('Workflow summary');

      // Act & Assert
      await expect(handleSaveContentAsMarkdown({
        filePath: '/test/output.md'
      })).rejects.toThrow('Workflow validation failed');

      expect(mockWorkflowValidation.recordExecution).toHaveBeenCalledWith(
        'save_content_as_markdown',
        expect.any(Object),
        false,
        expect.stringContaining('Workflow validation failed')
      );
    });

    it('should record successful execution in workflow', async () => {
      // Arrange
      const mockPage = {
        url: vi.fn().mockResolvedValue('https://example.com'),
        evaluate: vi.fn().mockResolvedValue('Content')
      };
      mockBrowserManager.getPageInstance.mockReturnValue(mockPage);

      const filePath = '/tmp/test/output.md';

      // Act
      await handleSaveContentAsMarkdown({
        filePath,
        contentType: 'text'
      });

      // Assert
      expect(mockWorkflowValidation.recordExecution).toHaveBeenCalledWith(
        'save_content_as_markdown',
        expect.any(Object),
        true
      );
    });
  });
});