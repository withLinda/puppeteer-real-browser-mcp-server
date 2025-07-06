// Removed duplicate import - using standard setTimeout

// Generic error handling wrapper
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  errorMessage: string
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    console.error(`${errorMessage}:`, error);
    throw new Error(`${errorMessage}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Generic retry wrapper with exponential backoff (browser-agnostic version)
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number;
    delay?: number;
    context?: string;
    shouldRetry?: (error: Error, attempt: number) => boolean;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    delay = 1000,
    context = 'unknown',
    shouldRetry = () => true
  } = options;

  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      console.error(`Attempt ${attempt}/${maxRetries} failed in context ${context}:`, lastError.message);

      // Check if we should retry this error
      if (!shouldRetry(lastError, attempt) || attempt === maxRetries) {
        break;
      }

      // Wait before retry with exponential backoff
      const waitTime = delay * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  throw lastError!;
}

// Platform detection utilities
export function getPlatform(): NodeJS.Platform {
  return process.platform;
}

export function isWindows(): boolean {
  return process.platform === 'win32';
}

export function isMacOS(): boolean {
  return process.platform === 'darwin';
}

export function isLinux(): boolean {
  return process.platform === 'linux';
}

// Environment variable utilities
export function getEnvVar(name: string, defaultValue?: string): string | undefined {
  return process.env[name] || defaultValue;
}

export function requireEnvVar(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Required environment variable ${name} is not set`);
  }
  return value;
}

// Process management utilities
import { execSync } from 'child_process';

export async function executeCommand(
  command: string,
  args: string[] = [],
  options: {
    timeout?: number;
    encoding?: BufferEncoding;
    stdio?: 'ignore' | 'inherit' | 'pipe';
  } = {}
): Promise<string> {
  const { timeout = 5000, encoding = 'utf8', stdio = 'pipe' } = options;
  
  try {
    const result = execSync(`${command} ${args.join(' ')}`, {
      encoding,
      timeout,
      stdio
    });
    return result.toString();
  } catch (error) {
    throw new Error(`Command execution failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Sleep/delay utility
export async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Timeout wrapper for any async operation
export async function withTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs: number,
  context: string = 'unknown'
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeoutMs}ms in context: ${context}`));
    }, timeoutMs);

    operation()
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

// Generic validation utilities
export function validateRequired<T>(value: T | undefined | null, fieldName: string): T {
  if (value === undefined || value === null) {
    throw new Error(`Required field '${fieldName}' is missing`);
  }
  return value;
}

export function validateString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Field '${fieldName}' must be a string, got ${typeof value}`);
  }
  return value;
}

export function validateNumber(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || isNaN(value)) {
    throw new Error(`Field '${fieldName}' must be a valid number, got ${typeof value}`);
  }
  return value;
}

export function validateBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`Field '${fieldName}' must be a boolean, got ${typeof value}`);
  }
  return value;
}

// Object utilities
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  if (obj instanceof Date) {
    return new Date(obj.getTime()) as unknown as T;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item)) as unknown as T;
  }
  
  const cloned = {} as T;
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }
  
  return cloned;
}

export function isEmptyObject(obj: object): boolean {
  return Object.keys(obj).length === 0;
}

// String utilities
export function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Screenshot request detection utility
export function detectExplicitScreenshotRequest(text: string): boolean {
  if (!text || typeof text !== 'string') {
    return false;
  }

  // Convert to lowercase for case-insensitive matching
  const lowerText = text.toLowerCase();
  
  // Keywords that indicate explicit screenshot requests
  const screenshotKeywords = [
    'screenshot',
    'screen shot',
    'take a screenshot',
    'capture a screenshot',
    'take screenshot',
    'capture screenshot',
    'grab a screenshot',
    'get a screenshot',
    'show me a screenshot',
    'take a picture',
    'capture',
    'snap',
    'visual capture',
    'screen capture',
    'image of the page',
    'picture of the page',
    'visual of the page'
  ];

  // Check for exact keyword matches
  for (const keyword of screenshotKeywords) {
    if (lowerText.includes(keyword)) {
      return true;
    }
  }

  // Check for screenshot-related patterns
  const screenshotPatterns = [
    /\bscreenshot\b/i,
    /\bscreen\s+shot\b/i,
    /\btake\s+a?\s*(picture|image|snap)\b/i,
    /\bcapture\s+a?\s*(picture|image|snap)\b/i,
    /\bshow\s+me\s+a?\s*(picture|image|screenshot)\b/i,
    /\bget\s+a?\s*(picture|image|screenshot)\b/i,
    /\bgrab\s+a?\s*(picture|image|screenshot)\b/i,
    /\bvisual\s+(capture|of|analysis)\b/i,
    /\bscreen\s+capture\b/i
  ];

  return screenshotPatterns.some(pattern => pattern.test(lowerText));
}

// File system utilities for screenshot saving
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface FileSystemResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

// Get cross-platform desktop path
export function getDesktopPath(): string {
  return path.join(os.homedir(), 'Desktop');
}

// Resolve path with tilde expansion
export function resolvePath(inputPath: string): string {
  if (inputPath.startsWith('~/')) {
    return path.join(os.homedir(), inputPath.slice(2));
  }
  if (inputPath.startsWith('~')) {
    return path.join(os.homedir(), inputPath.slice(1));
  }
  return path.resolve(inputPath);
}

// Ensure directory exists, create if it doesn't
export async function ensureDirectory(dirPath: string): Promise<boolean> {
  try {
    const resolvedPath = resolvePath(dirPath);
    await fs.promises.access(resolvedPath, fs.constants.F_OK);
    return true;
  } catch {
    try {
      const resolvedPath = resolvePath(dirPath);
      await fs.promises.mkdir(resolvedPath, { recursive: true });
      return true;
    } catch (error) {
      console.error(`Failed to create directory ${dirPath}:`, error);
      return false;
    }
  }
}

// Generate timestamp string for filenames
export function generateTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

// Extract domain from URL
export function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/[^a-zA-Z0-9.-]/g, '_');
  } catch {
    return 'unknown';
  }
}

// Generate safe filename from pattern
export function generateFilename(pattern: string, url?: string): string {
  const timestamp = generateTimestamp();
  const domain = url ? extractDomain(url) : 'page';
  const urlHash = url ? Buffer.from(url).toString('base64').slice(0, 8) : 'local';
  
  return pattern
    .replace('{timestamp}', timestamp)
    .replace('{domain}', domain)
    .replace('{url_hash}', urlHash)
    .replace(/[<>:"/\\|?*]/g, '_'); // Replace invalid filename characters
}

// Create date-based subfolder path
export function createDateSubfolder(baseFolder: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return path.join(baseFolder, String(year), month, day);
}

// Save buffer to file with conflict resolution
export async function saveBufferToFile(
  buffer: Buffer,
  filePath: string,
  options: { overwrite?: boolean; autoIncrement?: boolean } = {}
): Promise<FileSystemResult> {
  try {
    const { overwrite = false, autoIncrement = true } = options;
    let finalPath = filePath;
    
    // Handle file conflicts
    if (!overwrite && await fileExists(finalPath)) {
      if (autoIncrement) {
        finalPath = await findAvailableFilename(finalPath);
      } else {
        return {
          success: false,
          error: `File already exists: ${finalPath}`
        };
      }
    }
    
    // Ensure directory exists
    const directory = path.dirname(finalPath);
    const dirCreated = await ensureDirectory(directory);
    if (!dirCreated) {
      return {
        success: false,
        error: `Failed to create directory: ${directory}`
      };
    }
    
    // Write the file
    await fs.promises.writeFile(finalPath, buffer);
    
    return {
      success: true,
      filePath: finalPath
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// Check if file exists
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

// Find available filename by incrementing number
export async function findAvailableFilename(originalPath: string): Promise<string> {
  const ext = path.extname(originalPath);
  const nameWithoutExt = originalPath.slice(0, -ext.length);
  
  let counter = 1;
  let testPath = originalPath;
  
  while (await fileExists(testPath)) {
    testPath = `${nameWithoutExt}_${counter}${ext}`;
    counter++;
  }
  
  return testPath;
}

// Get file size in a human-readable format
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Configuration validation utilities
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// Validate screenshot save configuration
export function validateScreenshotSaveConfig(config: any): ValidationResult {
  const result: ValidationResult = {
    isValid: true,
    errors: [],
    warnings: []
  };

  if (!config || typeof config !== 'object') {
    result.errors.push('Screenshot configuration must be an object');
    result.isValid = false;
    return result;
  }

  // Validate autoSave
  if (config.autoSave !== undefined && typeof config.autoSave !== 'boolean') {
    result.errors.push('autoSave must be a boolean');
    result.isValid = false;
  }

  // Validate saveFolder
  if (config.saveFolder !== undefined) {
    if (typeof config.saveFolder !== 'string') {
      result.errors.push('saveFolder must be a string');
      result.isValid = false;
    } else if (config.saveFolder.trim() === '') {
      result.errors.push('saveFolder cannot be empty');
      result.isValid = false;
    }
  }

  // Validate filenamePattern
  if (config.filenamePattern !== undefined) {
    if (typeof config.filenamePattern !== 'string') {
      result.errors.push('filenamePattern must be a string');
      result.isValid = false;
    } else if (config.filenamePattern.trim() === '') {
      result.errors.push('filenamePattern cannot be empty');
      result.isValid = false;
    } else {
      // Check for invalid filename characters
      const invalidChars = /[<>:"/\\|?*]/g;
      const hasInvalidChars = invalidChars.test(config.filenamePattern.replace(/\{[^}]+\}/g, ''));
      if (hasInvalidChars) {
        result.warnings.push('filenamePattern contains characters that will be replaced in filenames');
      }
    }
  }

  // Validate createSubfolders
  if (config.createSubfolders !== undefined && typeof config.createSubfolders !== 'boolean') {
    result.errors.push('createSubfolders must be a boolean');
    result.isValid = false;
  }

  // Validate includeDomainInFilename
  if (config.includeDomainInFilename !== undefined && typeof config.includeDomainInFilename !== 'boolean') {
    result.errors.push('includeDomainInFilename must be a boolean');
    result.isValid = false;
  }

  // Validate retentionDays
  if (config.retentionDays !== undefined) {
    if (typeof config.retentionDays !== 'number' || config.retentionDays < 0) {
      result.errors.push('retentionDays must be a positive number');
      result.isValid = false;
    } else if (config.retentionDays > 365) {
      result.warnings.push('retentionDays is very large (>365 days)');
    }
  }

  return result;
}

// Validate folder path accessibility
export async function validateFolderAccess(folderPath: string): Promise<ValidationResult> {
  const result: ValidationResult = {
    isValid: true,
    errors: [],
    warnings: []
  };

  try {
    const resolvedPath = resolvePath(folderPath);
    
    // Check if path exists
    try {
      await fs.promises.access(resolvedPath, fs.constants.F_OK);
      
      // Check if it's a directory
      const stats = await fs.promises.stat(resolvedPath);
      if (!stats.isDirectory()) {
        result.errors.push(`Path exists but is not a directory: ${resolvedPath}`);
        result.isValid = false;
        return result;
      }
      
      // Check write permissions
      try {
        await fs.promises.access(resolvedPath, fs.constants.W_OK);
      } catch {
        result.errors.push(`No write permission to directory: ${resolvedPath}`);
        result.isValid = false;
      }
    } catch {
      // Directory doesn't exist, try to create it
      try {
        await fs.promises.mkdir(resolvedPath, { recursive: true });
        result.warnings.push(`Created directory: ${resolvedPath}`);
      } catch (error) {
        result.errors.push(`Cannot create directory: ${resolvedPath} - ${error instanceof Error ? error.message : String(error)}`);
        result.isValid = false;
      }
    }
  } catch (error) {
    result.errors.push(`Invalid path: ${folderPath} - ${error instanceof Error ? error.message : String(error)}`);
    result.isValid = false;
  }

  return result;
}

// Sanitize and fix configuration
export function sanitizeScreenshotConfig(config: any): any {
  if (!config || typeof config !== 'object') {
    return {};
  }

  const sanitized: any = {};

  // Sanitize boolean values
  if (config.autoSave !== undefined) {
    sanitized.autoSave = Boolean(config.autoSave);
  }

  if (config.createSubfolders !== undefined) {
    sanitized.createSubfolders = Boolean(config.createSubfolders);
  }

  if (config.includeDomainInFilename !== undefined) {
    sanitized.includeDomainInFilename = Boolean(config.includeDomainInFilename);
  }

  // Sanitize string values
  if (config.saveFolder && typeof config.saveFolder === 'string') {
    sanitized.saveFolder = config.saveFolder.trim();
  }

  if (config.filenamePattern && typeof config.filenamePattern === 'string') {
    sanitized.filenamePattern = config.filenamePattern.trim();
  }

  // Sanitize number values
  if (config.retentionDays !== undefined) {
    const retention = Number(config.retentionDays);
    if (!isNaN(retention) && retention >= 0) {
      sanitized.retentionDays = Math.floor(retention);
    }
  }

  return sanitized;
}

// Array utilities
export function unique<T>(array: T[]): T[] {
  return [...new Set(array)];
}

export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

// Type guards
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value);
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isArray<T>(value: unknown): value is T[] {
  return Array.isArray(value);
}