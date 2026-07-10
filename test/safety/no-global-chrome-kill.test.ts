import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const PROJECT_ROOT = resolve(import.meta.dirname, '../..');
const SCANNED_EXTENSIONS = new Set([
  '.cjs',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.sh',
  '.toml',
  '.ts',
]);

function projectFiles(): string[] {
  const output = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard'],
    { cwd: PROJECT_ROOT, encoding: 'utf8' },
  );

  return output
    .split('\n')
    .filter(Boolean)
    .filter((file) => existsSync(resolve(PROJECT_ROOT, file)))
    .filter((file) => SCANNED_EXTENSIONS.has(extname(file)))
    .filter((file) => file !== 'test/safety/no-global-chrome-kill.test.ts');
}

describe('Chrome process ownership safety', () => {
  it('contains no system-wide Chrome termination commands or APIs', () => {
    const prohibitedPatterns = [
      new RegExp(`\\bp${'kill'}\\b[^\\n]*(?:Google Chrome|chrome)`, 'i'),
      new RegExp(`\\bkill${'all'}\\b[^\\n]*(?:Google Chrome|chrome)`, 'i'),
      new RegExp(`\\btask${'kill'}\\b[^\\n]*(?:/IM|/im)[^\\n]*(?:chrome\\.exe|GoogleChrome\\.exe)`, 'i'),
      new RegExp(`forceKillAllChrome${'Processes'}`),
      new RegExp(`browserInstance\\.process\\(\\)\\.kill`),
    ];

    const violations: string[] = [];

    for (const file of projectFiles()) {
      const contents = readFileSync(resolve(PROJECT_ROOT, file), 'utf8');
      const lines = contents.split('\n');

      for (const [index, line] of lines.entries()) {
        if (prohibitedPatterns.some((pattern) => pattern.test(line))) {
          violations.push(`${file}:${index + 1}: ${line.trim()}`);
        }
      }
    }

    expect(violations, violations.join('\n')).toEqual([]);
  });
});
