import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  BrowserLaunchConfigurationError,
  ManagedBrowserSessionManager,
  type ManagedBrowserDependencies,
  type OwnedChromeLauncher,
} from './managed-browser-session.js';

function createLauncher() {
  const child: {
    exitCode: number | null;
    signalCode: NodeJS.Signals | null;
    once: ReturnType<typeof vi.fn>;
  } = {
    exitCode: null,
    signalCode: null,
    once: vi.fn(),
  };

  const launcher: OwnedChromeLauncher = {
    pid: 4242,
    port: 9333,
    chromeProcess: child as never,
    launch: vi.fn().mockResolvedValue(undefined),
    kill: vi.fn(() => {
      child.signalCode = 'SIGKILL';
    }),
  };

  return { child, launcher };
}

function createBrowser() {
  return {
    close: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
  };
}

function createDependencies(overrides: Partial<ManagedBrowserDependencies> = {}) {
  const { launcher } = createLauncher();
  const browser = createBrowser();
  const page = { id: 'page-1' };

  const dependencies: ManagedBrowserDependencies = {
    createLauncher: vi.fn(() => launcher),
    connect: vi.fn().mockResolvedValue(browser),
    preparePage: vi.fn().mockResolvedValue(page),
    ...overrides,
  };

  return { browser, dependencies, launcher, page };
}

describe('ManagedBrowserSessionManager', () => {
  it('closes the Puppeteer connection and only its owned launcher', async () => {
    const { browser, dependencies, launcher } = createDependencies();
    const manager = new ManagedBrowserSessionManager(dependencies);

    await manager.launch({ headless: true });
    await manager.close();

    expect(browser.close).toHaveBeenCalledTimes(1);
    expect(launcher.kill).toHaveBeenCalledTimes(1);
    expect(manager.state).toBe('idle');
  });

  it('kills the exact launcher when Puppeteer connection fails', async () => {
    const connectError = new Error('connection failed');
    const { dependencies, launcher } = createDependencies({
      connect: vi.fn().mockRejectedValue(connectError),
    });
    const manager = new ManagedBrowserSessionManager(dependencies);

    await expect(manager.launch({ headless: true })).rejects.toThrow('connection failed');

    expect(launcher.kill).toHaveBeenCalledTimes(1);
    expect(manager.state).toBe('idle');
  });

  it('kills the exact launcher when Chrome launch fails after creating a child', async () => {
    const launchError = new Error('Chrome exited during startup');
    const { dependencies, launcher } = createDependencies();
    vi.mocked(launcher.launch).mockRejectedValue(launchError);
    const manager = new ManagedBrowserSessionManager(dependencies);

    await expect(manager.launch({ headless: true })).rejects.toThrow(launchError.message);

    expect(launcher.kill).toHaveBeenCalledTimes(1);
    expect(manager.state).toBe('idle');
  });

  it('kills the exact launcher when page preparation fails', async () => {
    const prepareError = new Error('page preparation failed');
    const { browser, dependencies, launcher } = createDependencies({
      preparePage: vi.fn().mockRejectedValue(prepareError),
    });
    const manager = new ManagedBrowserSessionManager(dependencies);

    await expect(manager.launch({ headless: true })).rejects.toThrow(prepareError.message);

    expect(browser.disconnect).toHaveBeenCalledTimes(1);
    expect(launcher.kill).toHaveBeenCalledTimes(1);
    expect(manager.state).toBe('idle');
  });

  it('kills the exact launcher when connection times out', async () => {
    const { dependencies, launcher } = createDependencies({
      connect: vi.fn(() => new Promise<never>(() => undefined)),
    });
    const manager = new ManagedBrowserSessionManager(dependencies);

    await expect(
      manager.launch({ headless: true, connectOption: { timeout: 10 } }),
    ).rejects.toThrow('timed out');

    expect(launcher.kill).toHaveBeenCalledTimes(1);
    expect(manager.state).toBe('idle');
  });

  it('closes a late Puppeteer connection after its launch already timed out', async () => {
    let resolveConnection!: (browser: ReturnType<typeof createBrowser>) => void;
    const lateBrowser = createBrowser();
    const { dependencies } = createDependencies({
      connect: vi.fn(() => new Promise<ReturnType<typeof createBrowser>>((resolve) => {
        resolveConnection = resolve;
      })),
    });
    const manager = new ManagedBrowserSessionManager(dependencies);

    await expect(
      manager.launch({ headless: true, connectOption: { timeout: 10 } }),
    ).rejects.toThrow('timed out');
    resolveConnection(lateBrowser);
    await vi.waitFor(() => expect(lateBrowser.close).toHaveBeenCalledTimes(1));
  });

  it('shares one owned launch across concurrent callers', async () => {
    const { dependencies } = createDependencies();
    const manager = new ManagedBrowserSessionManager(dependencies);

    const [first, second] = await Promise.all([
      manager.launch({ headless: true }),
      manager.launch({ headless: true }),
    ]);

    expect(first).toBe(second);
    expect(dependencies.createLauncher).toHaveBeenCalledTimes(1);
    expect(dependencies.connect).toHaveBeenCalledTimes(1);
  });

  it('shares one cleanup operation across concurrent close calls', async () => {
    const { browser, dependencies, launcher } = createDependencies();
    const manager = new ManagedBrowserSessionManager(dependencies);
    await manager.launch({ headless: true });

    await Promise.all([manager.close(), manager.close(), manager.close()]);

    expect(browser.close).toHaveBeenCalledTimes(1);
    expect(launcher.kill).toHaveBeenCalledTimes(1);
  });

  it('performs emergency cleanup only through the exact owned launcher', async () => {
    const { browser, dependencies, launcher } = createDependencies();
    const manager = new ManagedBrowserSessionManager(dependencies);
    await manager.launch({ headless: true });

    manager.emergencyClose();

    expect(browser.disconnect).toHaveBeenCalledTimes(1);
    expect(launcher.kill).toHaveBeenCalledTimes(1);
    expect(manager.state).toBe('idle');
  });

  it.each([
    { customConfig: { userDataDir: false } },
    { customConfig: { userDataDir: '/tmp/unowned-profile' } },
    { customConfig: { port: 9222 } },
    { customConfig: { handleSIGINT: true } },
    { connectOption: { browserURL: 'http://127.0.0.1:9222' } },
    { connectOption: { browserWSEndpoint: 'ws://127.0.0.1:9222' } },
    { connectOption: { timeout: 0 } },
    { connectOption: { timeout: Number.NaN } },
    { profilePath: 42 },
  ])('rejects ownership-breaking configuration: %j', async (options) => {
    const { dependencies } = createDependencies();
    const manager = new ManagedBrowserSessionManager(dependencies);

    await expect(manager.launch(options as never)).rejects.toBeInstanceOf(
      BrowserLaunchConfigurationError,
    );
  });

  it('rejects launcher-owned flags supplied by the caller', async () => {
    const { dependencies } = createDependencies();
    const manager = new ManagedBrowserSessionManager(dependencies);

    await expect(
      manager.launch({
        customConfig: {
          chromeFlags: ['--remote-debugging-port=9222'],
        },
      }),
    ).rejects.toBeInstanceOf(BrowserLaunchConfigurationError);
  });

  it('creates an ownership marker in a new dedicated profile directory', async () => {
    const root = await mkdtemp(join(tmpdir(), 'prb-mcp-profile-test-'));
    const profilePath = join(root, 'profile');
    const { dependencies } = createDependencies();
    const manager = new ManagedBrowserSessionManager(dependencies);

    try {
      await manager.launch({ profilePath });
      const marker = await readFile(
        join(profilePath, '.puppeteer-real-browser-mcp-owned'),
        'utf8',
      );

      expect(marker).toBe('puppeteer-real-browser-mcp-server\n');
      expect(dependencies.createLauncher).toHaveBeenCalledWith(
        expect.objectContaining({ userDataDir: profilePath }),
      );
    } finally {
      await manager.close();
      await rm(root, { force: true, recursive: true });
    }
  });

  it('rejects a non-empty profile directory without the ownership marker', async () => {
    const root = await mkdtemp(join(tmpdir(), 'prb-mcp-profile-test-'));
    const profilePath = join(root, 'profile');
    await mkdir(profilePath);
    await writeFile(join(profilePath, 'Preferences'), '{}');
    const { dependencies } = createDependencies();
    const manager = new ManagedBrowserSessionManager(dependencies);

    try {
      await expect(manager.launch({ profilePath })).rejects.toBeInstanceOf(
        BrowserLaunchConfigurationError,
      );
      expect(dependencies.createLauncher).not.toHaveBeenCalled();
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it('rejects a relative profile path', async () => {
    const { dependencies } = createDependencies();
    const manager = new ManagedBrowserSessionManager(dependencies);

    await expect(manager.launch({ profilePath: 'relative/profile' })).rejects.toBeInstanceOf(
      BrowserLaunchConfigurationError,
    );
  });
});
