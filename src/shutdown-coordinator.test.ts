import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ShutdownCoordinator,
  type ShutdownDependencies,
} from './shutdown-coordinator.js';

function createDependencies(overrides: Partial<ShutdownDependencies> = {}) {
  const dependencies: ShutdownDependencies = {
    closeBrowser: vi.fn().mockResolvedValue(undefined),
    closeServer: vi.fn().mockResolvedValue(undefined),
    emergencyCloseBrowser: vi.fn(),
    exit: vi.fn(),
    log: vi.fn(),
    setExitCode: vi.fn(),
    ...overrides,
  };
  return dependencies;
}

describe('ShutdownCoordinator', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shares one graceful cleanup across repeated shutdown requests', async () => {
    const dependencies = createDependencies();
    const coordinator = new ShutdownCoordinator(dependencies);

    await Promise.all([
      coordinator.requestShutdown('stdin-end', 0),
      coordinator.requestShutdown('stdin-close', 0),
      coordinator.requestShutdown('stdin-end', 0),
    ]);

    expect(dependencies.closeServer).toHaveBeenCalledTimes(1);
    expect(dependencies.closeBrowser).toHaveBeenCalledTimes(1);
    expect(dependencies.setExitCode).toHaveBeenCalledWith(0);
    expect(dependencies.exit).not.toHaveBeenCalled();
  });

  it('forces exact browser cleanup when a second signal arrives', async () => {
    let finishServerClose: (() => void) | undefined;
    const dependencies = createDependencies({
      closeServer: vi.fn(() => new Promise<void>((resolve) => {
        finishServerClose = resolve;
      })),
    });
    const coordinator = new ShutdownCoordinator(dependencies);

    const firstSignal = coordinator.handleSignal('SIGTERM');
    const secondSignal = coordinator.handleSignal('SIGTERM');

    expect(dependencies.emergencyCloseBrowser).toHaveBeenCalledTimes(1);
    expect(dependencies.exit).toHaveBeenCalledWith(143);

    finishServerClose?.();
    await Promise.all([firstSignal, secondSignal]);
  });

  it('forces exact cleanup when graceful shutdown exceeds its deadline', async () => {
    vi.useFakeTimers();
    const dependencies = createDependencies({
      closeServer: vi.fn(() => new Promise<void>(() => undefined)),
    });
    const coordinator = new ShutdownCoordinator(dependencies, 1_500);

    void coordinator.requestShutdown('stdin-end', 0);
    await vi.advanceTimersByTimeAsync(1_500);

    expect(dependencies.emergencyCloseBrowser).toHaveBeenCalledTimes(1);
    expect(dependencies.exit).toHaveBeenCalledWith(0);
  });

  it('performs synchronous exact cleanup for a fatal exception', () => {
    const dependencies = createDependencies();
    const coordinator = new ShutdownCoordinator(dependencies);

    coordinator.handleFatalError(new Error('fatal'));

    expect(dependencies.emergencyCloseBrowser).toHaveBeenCalledTimes(1);
    expect(dependencies.closeBrowser).not.toHaveBeenCalled();
    expect(dependencies.exit).not.toHaveBeenCalled();
  });
});
