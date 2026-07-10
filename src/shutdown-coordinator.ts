export interface ShutdownDependencies {
  closeBrowser(): Promise<void>;
  closeServer(): Promise<void>;
  emergencyCloseBrowser(): void;
  exit(code: number): void;
  log(message: string, error?: unknown): void;
  setExitCode(code: number): void;
}

type ShutdownSignal = 'SIGINT' | 'SIGTERM';

const SIGNAL_EXIT_CODES: Record<ShutdownSignal, number> = {
  SIGINT: 130,
  SIGTERM: 143,
};

export class ShutdownCoordinator {
  private deadline: ReturnType<typeof setTimeout> | null = null;
  private forced = false;
  private shutdownPromise: Promise<void> | null = null;

  constructor(
    private readonly dependencies: ShutdownDependencies,
    private readonly deadlineMs = 1_500,
  ) {}

  get isShuttingDown(): boolean {
    return this.shutdownPromise !== null;
  }

  requestShutdown(reason: string, exitCode: number): Promise<void> {
    if (this.shutdownPromise) {
      return this.shutdownPromise;
    }

    this.dependencies.log(`Shutdown started: ${reason}`);
    this.deadline = setTimeout(() => {
      this.forceShutdown(`shutdown deadline exceeded after ${this.deadlineMs}ms`, exitCode);
    }, this.deadlineMs);
    this.deadline.unref?.();

    this.shutdownPromise = (async () => {
      try {
        try {
          await this.dependencies.closeServer();
        } catch (error) {
          this.dependencies.log('MCP transport close failed', error);
        }

        try {
          await this.dependencies.closeBrowser();
        } catch (error) {
          this.dependencies.log('Graceful browser close failed', error);
          this.dependencies.emergencyCloseBrowser();
        }
      } finally {
        if (this.deadline) {
          clearTimeout(this.deadline);
          this.deadline = null;
        }
        this.dependencies.setExitCode(exitCode);
        this.dependencies.log(`Shutdown complete: ${reason}`);
      }
    })();

    return this.shutdownPromise;
  }

  handleSignal(signal: ShutdownSignal): Promise<void> {
    const exitCode = SIGNAL_EXIT_CODES[signal];
    if (this.isShuttingDown) {
      this.forceShutdown(`second ${signal}`, exitCode);
      return this.shutdownPromise ?? Promise.resolve();
    }
    return this.requestShutdown(signal, exitCode);
  }

  handleFatalError(error: unknown): void {
    this.dependencies.log('Fatal process error; closing the owned browser synchronously', error);
    this.dependencies.emergencyCloseBrowser();
  }

  private forceShutdown(reason: string, exitCode: number): void {
    if (this.forced) {
      return;
    }
    this.forced = true;
    this.dependencies.log(`Forced shutdown: ${reason}`);
    this.dependencies.emergencyCloseBrowser();
    this.dependencies.setExitCode(exitCode);
    this.dependencies.exit(exitCode);
  }
}

export function installProcessLifecycle(
  coordinator: ShutdownCoordinator,
  runtime: NodeJS.Process = process,
): () => void {
  const onStdinEnd = () => {
    void coordinator.requestShutdown('stdin-end', 0);
  };
  const onStdinClose = () => {
    void coordinator.requestShutdown('stdin-close', 0);
  };
  const onSigint = () => {
    void coordinator.handleSignal('SIGINT');
  };
  const onSigterm = () => {
    void coordinator.handleSignal('SIGTERM');
  };
  const onFatal = (error: unknown) => {
    coordinator.handleFatalError(error);
  };

  runtime.stdin.on('end', onStdinEnd);
  runtime.stdin.on('close', onStdinClose);
  runtime.on('SIGINT', onSigint);
  runtime.on('SIGTERM', onSigterm);
  runtime.on('uncaughtExceptionMonitor', onFatal);

  return () => {
    runtime.stdin.off('end', onStdinEnd);
    runtime.stdin.off('close', onStdinClose);
    runtime.off('SIGINT', onSigint);
    runtime.off('SIGTERM', onSigterm);
    runtime.off('uncaughtExceptionMonitor', onFatal);
  };
}
