import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const BUILD_ENTRYPOINTS = [
  new URL('./index.ts', import.meta.url),
];

const WRONG_CASE_IMPORT_PREFIX = '@modelContextProtocol/';
const EXPECTED_IMPORT_PREFIX = '@modelcontextprotocol/';

describe('MCP SDK import casing regression', () => {
  it('uses the lowercase MCP SDK package name in build entrypoints', () => {
    for (const fileUrl of BUILD_ENTRYPOINTS) {
      const filePath = fileURLToPath(fileUrl);
      const fileContents = readFileSync(filePath, 'utf8');

      expect(
        fileContents,
        `Expected ${filePath} to import the lowercase MCP SDK package name.`,
      ).not.toContain(WRONG_CASE_IMPORT_PREFIX);

      expect(
        fileContents,
        `Expected ${filePath} to keep using the MCP SDK package imports.`,
      ).toContain(EXPECTED_IMPORT_PREFIX);
    }
  });
});
