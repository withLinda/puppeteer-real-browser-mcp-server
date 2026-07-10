import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { SERVER_INFO } from './tool-definitions.js';

describe('release version', () => {
  it('keeps MCP server metadata synchronized with package.json', async () => {
    const manifest = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { name: string; version: string };

    expect(SERVER_INFO).toEqual({
      name: manifest.name,
      version: manifest.version,
    });
  });
});
