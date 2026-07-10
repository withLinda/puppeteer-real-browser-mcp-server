import { Launcher, type Options as ChromeLauncherOptions } from 'chrome-launcher';
import { createCursor } from 'ghost-cursor';
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import puppeteer from 'rebrowser-puppeteer-core';

export type BrowserSessionState = 'idle' | 'starting' | 'ready' | 'closing';

export interface OwnedChromeLauncher {
  pid?: number;
  port?: number;
  chromeProcess?: {
    exitCode: number | null;
    signalCode: NodeJS.Signals | null;
    once(event: 'close', listener: () => void): unknown;
  };
  launch(): Promise<void>;
  kill(): void;
}

interface BrowserLike {
  close(): Promise<void>;
  disconnect(): void;
  pages?(): Promise<any[]>;
  newPage?(): Promise<any>;
  on?(event: string, listener: (target: any) => void): void;
}

interface XvfbLike {
  startSync(): void;
  stopSync(): void;
}

export interface ManagedBrowserDependencies {
  createLauncher(options: ChromeLauncherOptions): OwnedChromeLauncher;
  connect(options: Record<string, unknown>, launchOptions?: ManagedBrowserLaunchOptions): Promise<BrowserLike>;
  preparePage(
    browser: BrowserLike,
    launchOptions: ManagedBrowserLaunchOptions,
    signal: AbortSignal,
  ): Promise<any>;
  startXvfb?(): Promise<XvfbLike>;
}

export interface ManagedBrowserLaunchOptions {
  args?: string[];
  connectOption?: Record<string, unknown>;
  customConfig?: Record<string, unknown>;
  disableXvfb?: boolean;
  executablePath?: string;
  headless?: boolean | string;
  profilePath?: string;
  proxy?: unknown;
  turnstile?: boolean;
}

interface OwnedAttempt {
  abortController: AbortController;
  browser: BrowserLike | null;
  closePromise: Promise<void> | null;
  launcher: OwnedChromeLauncher;
  page: any;
  xvfb: XvfbLike | null;
  cancelled: boolean;
}

const RESERVED_CHROME_FLAGS = [
  '--remote-debugging-port',
  '--remote-debugging-pipe',
  '--user-data-dir',
];

const RESERVED_CONNECT_OPTIONS = [
  'browserURL',
  'browserWSEndpoint',
  'transport',
];

const DEFAULT_CONNECT_TIMEOUT_MS = 30_000;
const GRACEFUL_BROWSER_CLOSE_MS = 1_000;
const PROFILE_MARKER_FILE = '.puppeteer-real-browser-mcp-owned';
const PROFILE_MARKER_CONTENT = 'puppeteer-real-browser-mcp-server\n';

export class BrowserLaunchConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BrowserLaunchConfigurationError';
  }
}

function ensureSafeOptions(options: ManagedBrowserLaunchOptions): void {
  const customConfig = options.customConfig ?? {};
  const connectOption = options.connectOption ?? {};

  if (options.profilePath !== undefined && typeof options.profilePath !== 'string') {
    throw new BrowserLaunchConfigurationError('profilePath must be a string.');
  }
  if (connectOption.timeout !== undefined &&
      (typeof connectOption.timeout !== 'number' ||
       !Number.isFinite(connectOption.timeout) ||
       connectOption.timeout <= 0)) {
    throw new BrowserLaunchConfigurationError('connectOption.timeout must be a positive number.');
  }

  if (customConfig.userDataDir !== undefined) {
    throw new BrowserLaunchConfigurationError(
      'customConfig.userDataDir is not allowed. Use profilePath so the MCP server can verify that the profile is dedicated to automation.',
    );
  }

  for (const key of ['port', 'portStrictMode', 'handleSIGINT']) {
    if (customConfig[key] !== undefined) {
      throw new BrowserLaunchConfigurationError(
        `customConfig.${key} is managed by the MCP server and cannot be overridden.`,
      );
    }
  }

  for (const key of RESERVED_CONNECT_OPTIONS) {
    if (connectOption[key] !== undefined) {
      throw new BrowserLaunchConfigurationError(
        `connectOption.${key} could attach to an unowned browser and is not allowed.`,
      );
    }
  }

  const callerFlags = [
    ...(Array.isArray(options.args) ? options.args : []),
    ...(Array.isArray(customConfig.args) ? customConfig.args as string[] : []),
    ...(Array.isArray(customConfig.chromeFlags) ? customConfig.chromeFlags as string[] : []),
  ];

  const reservedFlag = callerFlags.find((flag) =>
    RESERVED_CHROME_FLAGS.some((reserved) => flag === reserved || flag.startsWith(`${reserved}=`)),
  );

  if (reservedFlag) {
    throw new BrowserLaunchConfigurationError(
      `Chrome flag ${reservedFlag} is managed by the MCP server so browser ownership remains provable.`,
    );
  }
}

async function prepareProfilePath(profilePath: string | undefined): Promise<string | undefined> {
  if (profilePath === undefined) {
    return undefined;
  }
  if (!isAbsolute(profilePath)) {
    throw new BrowserLaunchConfigurationError('profilePath must be an absolute path.');
  }

  // Chrome 136+ requires remote debugging to use a non-default profile directory.
  // Source: https://developer.chrome.com/blog/remote-debugging-port
  const normalizedPath = resolve(profilePath);
  await mkdir(normalizedPath, { recursive: true });
  const profileStat = await lstat(normalizedPath);
  if (profileStat.isSymbolicLink() || !profileStat.isDirectory()) {
    throw new BrowserLaunchConfigurationError('profilePath must be a real directory, not a file or symbolic link.');
  }

  const markerPath = join(normalizedPath, PROFILE_MARKER_FILE);
  const entries = await readdir(normalizedPath);
  if (entries.includes(PROFILE_MARKER_FILE)) {
    const markerContent = await readFile(markerPath, 'utf8');
    if (markerContent !== PROFILE_MARKER_CONTENT) {
      throw new BrowserLaunchConfigurationError('profilePath has an invalid ownership marker.');
    }
    return normalizedPath;
  }

  if (entries.length > 0) {
    throw new BrowserLaunchConfigurationError(
      'profilePath is not empty and was not created by this MCP server. Refusing to use a personal Chrome profile.',
    );
  }

  await writeFile(markerPath, PROFILE_MARKER_CONTENT, { encoding: 'utf8', flag: 'wx' });
  return normalizedPath;
}

function chromeFlagsFor(options: ManagedBrowserLaunchOptions): string[] {
  const customConfig = options.customConfig ?? {};
  const configuredFlags = Array.isArray(customConfig.chromeFlags)
    ? customConfig.chromeFlags as string[]
    : Array.isArray(customConfig.args)
      ? customConfig.args as string[]
      : options.args ?? [];

  const flags = [...configuredFlags];
  if (options.headless !== false && options.headless !== undefined) {
    const headlessValue = options.headless === true ? 'new' : options.headless;
    flags.push(`--headless=${headlessValue}`);
  }

  return [...new Set(flags)];
}

function launcherOptionsFor(
  options: ManagedBrowserLaunchOptions,
  profilePath: string | undefined,
): ChromeLauncherOptions {
  const customConfig = options.customConfig ?? {};

  return {
    chromePath:
      typeof customConfig.chromePath === 'string'
        ? customConfig.chromePath
        : options.executablePath,
    chromeFlags: chromeFlagsFor(options),
    connectionPollInterval:
      typeof customConfig.connectionPollInterval === 'number'
        ? customConfig.connectionPollInterval
        : undefined,
    envVars:
      customConfig.envVars && typeof customConfig.envVars === 'object'
        ? customConfig.envVars as Record<string, string | undefined>
        : undefined,
    // The MCP lifecycle owns cleanup. chrome-launcher's global signal handler is disabled.
    // Source: https://github.com/GoogleChrome/chrome-launcher#launching-chrome-programmatically
    handleSIGINT: false,
    ignoreDefaultFlags: customConfig.ignoreDefaultFlags === true,
    logLevel:
      typeof customConfig.logLevel === 'string'
        ? customConfig.logLevel as ChromeLauncherOptions['logLevel']
        : 'silent',
    maxConnectionRetries:
      typeof customConfig.maxConnectionRetries === 'number'
        ? customConfig.maxConnectionRetries
        : undefined,
    port: 0,
    prefs:
      customConfig.prefs && typeof customConfig.prefs === 'object'
        ? customConfig.prefs as ChromeLauncherOptions['prefs']
        : undefined,
    userDataDir: profilePath,
  };
}

function isLauncherRunning(launcher: OwnedChromeLauncher): boolean {
  const child = launcher.chromeProcess;
  return Boolean(child && child.exitCode === null && child.signalCode === null);
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout: () => void,
  context: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          onTimeout();
          reject(new Error(`${context} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function checkTurnstile(page: any): Promise<void> {
  const elements = await page.$$('[name="cf-turnstile-response"]');

  if (elements.length > 0) {
    for (const element of elements) {
      try {
        const parentElement = await element.evaluateHandle((node: Element) => node.parentElement);
        const box = await parentElement.boundingBox();
        if (box) {
          await page.mouse.click(box.x + 30, box.y + box.height / 2);
        }
      } catch {
        // A disappearing challenge is normal while the page changes.
      }
    }
    return;
  }

  const coordinates = await page.evaluate(() => {
    const matches: Array<{ x: number; y: number; h: number }> = [];
    document.querySelectorAll('div').forEach((item) => {
      const rect = item.getBoundingClientRect();
      if (rect.width > 290 && rect.width <= 310 && !item.querySelector('*')) {
        matches.push({ x: rect.x, y: rect.y, h: rect.height });
      }
    });
    return matches;
  });

  for (const item of coordinates) {
    await page.mouse.click(item.x + 30, item.y + item.h / 2).catch(() => undefined);
  }
}

function startTurnstileLoop(page: any, signal: AbortSignal): void {
  void (async () => {
    while (!signal.aborted) {
      await checkTurnstile(page).catch(() => undefined);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 1_000);
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          resolve();
        }, { once: true });
      });
    }
  })();
}

async function defaultConnect(
  connectOptions: Record<string, unknown>,
): Promise<BrowserLike> {
  return await puppeteer.connect(connectOptions);
}

async function defaultPreparePage(
  browser: BrowserLike,
  launchOptions: ManagedBrowserLaunchOptions,
  signal: AbortSignal,
): Promise<any> {
  const pages = await browser.pages?.() ?? [];
  const page = pages[0] ?? await browser.newPage?.();
  if (!page) {
    throw new Error('Chrome started but did not provide a page');
  }

  const proxy = launchOptions.proxy;
  if (proxy && typeof proxy === 'object' &&
      'username' in proxy && 'password' in proxy &&
      typeof proxy.username === 'string' && typeof proxy.password === 'string') {
    await page.authenticate({ username: proxy.username, password: proxy.password });
  }

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(MouseEvent.prototype, 'screenX', {
      get() {
        return this.clientX + window.screenX;
      },
    });
    Object.defineProperty(MouseEvent.prototype, 'screenY', {
      get() {
        return this.clientY + window.screenY;
      },
    });
  });

  const cursor = createCursor(page);
  page.realCursor = cursor;
  page.realClick = cursor.click;

  if (launchOptions.turnstile !== false) {
    startTurnstileLoop(page, signal);
  }

  browser.on?.('targetcreated', (target: any) => {
    void target.page().then(async (newPage: any) => {
      if (!newPage || signal.aborted) {
        return;
      }
      const newCursor = createCursor(newPage);
      newPage.realCursor = newCursor;
      newPage.realClick = newCursor.click;
    }).catch(() => undefined);
  });

  return page;
}

const defaultDependencies: ManagedBrowserDependencies = {
  createLauncher: (options) => new Launcher(options),
  connect: defaultConnect,
  preparePage: defaultPreparePage,
  startXvfb: async () => {
    const { default: Xvfb } = await import('xvfb');
    const instance = new Xvfb({
      silent: true,
      xvfb_args: ['-screen', '0', '1920x1080x24', '-ac'],
    });
    instance.startSync();
    return instance;
  },
};

export class ManagedBrowserSessionManager {
  private attempt: OwnedAttempt | null = null;
  private closePromise: Promise<void> | null = null;
  private dependencies: ManagedBrowserDependencies;
  private launchPromise: Promise<{ browser: BrowserLike; page: any }> | null = null;

  public state: BrowserSessionState = 'idle';

  constructor(dependencies: ManagedBrowserDependencies = defaultDependencies) {
    this.dependencies = dependencies;
  }

  get browser(): BrowserLike | null {
    return this.state === 'ready' ? this.attempt?.browser ?? null : null;
  }

  get page(): any {
    return this.state === 'ready' ? this.attempt?.page ?? null : null;
  }

  get ownedPid(): number | null {
    return this.attempt?.launcher.pid ?? null;
  }

  async launch(options: ManagedBrowserLaunchOptions = {}): Promise<{ browser: BrowserLike; page: any }> {
    ensureSafeOptions(options);

    if (this.state === 'ready' && this.attempt?.browser && this.attempt.page) {
      return { browser: this.attempt.browser, page: this.attempt.page };
    }

    if (this.launchPromise) {
      return await this.launchPromise;
    }

    if (this.state === 'closing' && this.closePromise) {
      await this.closePromise;
    }

    this.launchPromise = this.launchOwned(options);
    try {
      return await this.launchPromise;
    } finally {
      this.launchPromise = null;
    }
  }

  private async launchOwned(
    options: ManagedBrowserLaunchOptions,
  ): Promise<{ browser: BrowserLike; page: any }> {
    const profilePath = await prepareProfilePath(options.profilePath);
    this.state = 'starting';
    const launcher = this.dependencies.createLauncher(launcherOptionsFor(options, profilePath));
    const attempt: OwnedAttempt = {
      abortController: new AbortController(),
      browser: null,
      cancelled: false,
      closePromise: null,
      launcher,
      page: null,
      xvfb: null,
    };
    this.attempt = attempt;

    try {
      if (process.platform === 'linux' && options.disableXvfb === false && this.dependencies.startXvfb) {
        attempt.xvfb = await this.dependencies.startXvfb();
      }

      await launcher.launch();
      if (attempt.cancelled) {
        throw new Error('Browser launch was cancelled');
      }
      if (!launcher.port || !launcher.pid) {
        throw new Error('Chrome launcher did not return an owned PID and debugging port');
      }

      const connectOption = { ...(options.connectOption ?? {}) };
      const timeout = typeof connectOption.timeout === 'number'
        ? connectOption.timeout
        : DEFAULT_CONNECT_TIMEOUT_MS;
      const connectionPromise = this.dependencies.connect({
        ...connectOption,
        browserURL: `http://127.0.0.1:${launcher.port}`,
      }, options);

      const guardedConnection = connectionPromise.then(async (browser) => {
        if (attempt.cancelled) {
          await browser.close().catch(() => undefined);
          throw new Error('Browser connection completed after cancellation');
        }
        return browser;
      });

      attempt.browser = await withTimeout(
        guardedConnection,
        timeout,
        () => this.cancelAttempt(attempt),
        'Browser connection',
      );
      attempt.page = await withTimeout(
        this.dependencies.preparePage(attempt.browser, options, attempt.abortController.signal),
        timeout,
        () => this.cancelAttempt(attempt),
        'Browser page setup',
      );

      if (attempt.cancelled) {
        throw new Error('Browser launch was cancelled');
      }

      this.state = 'ready';
      return { browser: attempt.browser, page: attempt.page };
    } catch (error) {
      await this.disposeAttempt(attempt, false);
      if (this.attempt === attempt) {
        this.attempt = null;
        this.state = 'idle';
      }
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.state === 'idle' || !this.attempt) {
      return;
    }
    if (this.closePromise) {
      return await this.closePromise;
    }

    const attempt = this.attempt;
    this.state = 'closing';
    this.closePromise = this.disposeAttempt(attempt, true).finally(() => {
      if (this.attempt === attempt) {
        this.attempt = null;
      }
      this.state = 'idle';
      this.closePromise = null;
    });

    return await this.closePromise;
  }

  emergencyClose(): void {
    if (!this.attempt) {
      return;
    }
    const attempt = this.attempt;
    this.cancelAttempt(attempt);
    try {
      attempt.browser?.disconnect();
    } catch {
      // Fatal cleanup must continue even when the Puppeteer transport is broken.
    }
    try {
      attempt.xvfb?.stopSync();
    } catch {
      // The exact Chrome handle has already been handled above.
    }
    this.attempt = null;
    this.state = 'idle';
  }

  private cancelAttempt(attempt: OwnedAttempt): void {
    if (attempt.cancelled) {
      return;
    }
    attempt.cancelled = true;
    attempt.abortController.abort();
    if (isLauncherRunning(attempt.launcher)) {
      try {
        attempt.launcher.kill();
      } catch {
        // A concurrent child exit can race with exact-process cleanup.
      }
    }
  }

  private async disposeAttempt(attempt: OwnedAttempt, graceful: boolean): Promise<void> {
    if (attempt.closePromise) {
      return await attempt.closePromise;
    }

    attempt.closePromise = (async () => {
      attempt.cancelled = true;
      attempt.abortController.abort();

      try {
        if (attempt.browser) {
          if (graceful) {
            await withTimeout(
              attempt.browser.close().catch(() => undefined),
              GRACEFUL_BROWSER_CLOSE_MS,
              () => undefined,
              'Graceful browser close',
            ).catch(() => undefined);
          } else {
            try {
              attempt.browser.disconnect();
            } catch {
              // Continue to the exact launcher cleanup below.
            }
          }
        }
      } finally {
        if (isLauncherRunning(attempt.launcher)) {
          try {
            attempt.launcher.kill();
          } catch {
            // A concurrent child exit can race with exact-process cleanup.
          }
        }
        try {
          attempt.xvfb?.stopSync();
        } catch {
          // Xvfb cleanup must not prevent browser state reset.
        }
        attempt.browser = null;
        attempt.page = null;
      }
    })();

    return await attempt.closePromise;
  }
}

export const managedBrowserSession = new ManagedBrowserSessionManager();
