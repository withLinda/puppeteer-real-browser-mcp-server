import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import {
  closeBrowser,
  getOwnedBrowserPid,
  initializeBrowser,
  resetBrowserInitDepth,
} from '../../src/browser-manager.js';

async function stopExactChild(child: ChildProcess | null): Promise<void> {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  await exited;
}

describe.sequential('owned browser lifecycle', () => {
  let sentinel: ChildProcess | null = null;

  afterEach(async () => {
    await closeBrowser();
    await stopExactChild(sentinel);
    sentinel = null;
    resetBrowserInitDepth();
  });

  it('closes its own Chrome and leaves an unrelated Chrome-named process alive', async () => {
    sentinel = spawn(
      process.execPath,
      ['-e', 'setInterval(() => undefined, 1000)', 'Google Chrome sentinel'],
      { stdio: 'ignore' },
    );
    await once(sentinel, 'spawn');

    const { page } = await initializeBrowser({
      disableXvfb: true,
      headless: true,
    });
    const ownedPid = getOwnedBrowserPid();
    expect(ownedPid).toBeTypeOf('number');
    expect(ownedPid).not.toBe(sentinel.pid);

    await page.goto('data:text/html,<title>Owned browser test</title>');
    expect(await page.title()).toBe('Owned browser test');

    await closeBrowser();

    expect(sentinel.exitCode).toBeNull();
    expect(sentinel.signalCode).toBeNull();
    expect(() => process.kill(sentinel!.pid!, 0)).not.toThrow();
  }, 60_000);
});
