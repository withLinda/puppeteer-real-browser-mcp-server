import { spawn } from 'child_process';
import { access, mkdtemp, mkdir, readFile, readdir, rm, symlink } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

import { environmentForNestedNpmPack } from './npm-pack-environment.js';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

// npm package names are lowercase, so the MCP SDK import must stay exact.
const WRONG_CASE_IMPORT_PREFIX = '@modelContextProtocol/';
const EXPECTED_IMPORT_PREFIX = '@modelcontextprotocol/';
const SERVER_START_MESSAGE = 'Puppeteer Real Browser MCP Server started successfully';
const REQUEST_TIMEOUT_MS = 15000;
const STARTUP_TIMEOUT_MS = 15000;

interface CommandResult {
  stdout: string;
  stderr: string;
}

interface JsonRpcResponse {
  jsonrpc: string;
  id: number;
  result?: Record<string, unknown>;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

async function listFilesRecursively(directory: string, prefix = ''): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const relativePath = join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFilesRecursively(join(directory, entry.name), relativePath));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }

  return files;
}

type PendingRequest = {
  resolve: (response: JsonRpcResponse) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};

async function runCommand(
  command: string,
  args: string[],
  cwd: string = PROJECT_ROOT,
  env: NodeJS.ProcessEnv = process.env,
): Promise<CommandResult> {
  return await new Promise((resolveCommand, rejectCommand) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      rejectCommand(error);
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolveCommand({ stdout, stderr });
        return;
      }

      rejectCommand(
        new Error(
          `Command failed: ${command} ${args.join(' ')}\n` +
            `Exit code: ${code}\n` +
            `STDOUT:\n${stdout}\n` +
            `STDERR:\n${stderr}`,
        ),
      );
    });
  });
}

async function buildIfNeeded(skipBuild: boolean): Promise<void> {
  if (skipBuild) {
    console.log('Skipping build step because --skip-build was provided.');
    return;
  }

  console.log('Building project before package smoke test...');
  await runCommand(npmCommand, ['run', 'build']);
}

async function createTarball(packDir: string): Promise<string> {
  console.log('Packing project into a temporary tarball...');
  const { stdout } = await runCommand(
    npmCommand,
    [
      'pack',
      '--json',
      '--ignore-scripts',
      '--pack-destination',
      packDir,
    ],
    PROJECT_ROOT,
    environmentForNestedNpmPack(),
  );

  const parsedOutput = JSON.parse(stdout.trim()) as Array<{ filename?: string }>;
  const tarballName = parsedOutput[0]?.filename;

  if (!tarballName) {
    throw new Error(`npm pack did not return a tarball filename. Output: ${stdout}`);
  }

  return join(packDir, tarballName);
}

async function extractTarball(tarballPath: string, workDir: string): Promise<string> {
  const extractDir = join(workDir, 'extracted');
  await mkdir(extractDir, { recursive: true });

  console.log(`Extracting ${tarballPath}...`);
  await runCommand('tar', ['-xzf', tarballPath, '-C', extractDir]);

  return join(extractDir, 'package');
}

async function assertPackedEntrypoint(packageRoot: string): Promise<string> {
  const packagedEntrypoint = join(packageRoot, 'dist', 'index.js');
  const entrypointContents = await readFile(packagedEntrypoint, 'utf8');

  if (entrypointContents.includes(WRONG_CASE_IMPORT_PREFIX)) {
    throw new Error(
      `Packed entrypoint still contains the wrong MCP SDK import prefix: ${WRONG_CASE_IMPORT_PREFIX}`,
    );
  }

  if (!entrypointContents.includes(EXPECTED_IMPORT_PREFIX)) {
    throw new Error(
      `Packed entrypoint no longer contains the MCP SDK import prefix: ${EXPECTED_IMPORT_PREFIX}`,
    );
  }

  const packageManifest = JSON.parse(
    await readFile(join(packageRoot, 'package.json'), 'utf8'),
  ) as { dependencies?: Record<string, string> };
  if (packageManifest.dependencies?.['puppeteer-real-browser']) {
    throw new Error('Packed package still depends on the end-of-life puppeteer-real-browser package.');
  }

  await access(join(packageRoot, 'LICENSE'));
  await access(join(packageRoot, 'THIRD_PARTY_NOTICES.md'));

  const distFiles = await listFilesRecursively(join(packageRoot, 'dist'));
  const packedTestFile = distFiles.find(
    (file) => /\.(?:test|spec)\.(?:js|d\.ts|js\.map)$/.test(file),
  );
  if (packedTestFile) {
    throw new Error(`Packed dist contains a test artifact: ${packedTestFile}`);
  }

  console.log('Packed runtime, metadata, notices, and dependency boundary are valid.');
  return packagedEntrypoint;
}

async function linkInstalledDependencies(packageRoot: string): Promise<void> {
  const sourceNodeModules = join(PROJECT_ROOT, 'node_modules');
  const targetNodeModules = join(packageRoot, 'node_modules');

  await access(sourceNodeModules);

  await symlink(
    sourceNodeModules,
    targetNodeModules,
    process.platform === 'win32' ? 'junction' : 'dir',
  );

  console.log('Linked installed runtime dependencies into the extracted package.');
}

async function stopServer(child: ReturnType<typeof spawn>): Promise<void> {
  if (child.exitCode !== null) {
    return;
  }

  await new Promise<void>((resolveStop, rejectStop) => {
    let fallbackSignalUsed = false;
    const sigtermTimer = setTimeout(() => {
      fallbackSignalUsed = true;
      child.kill('SIGTERM');
    }, 3000);
    const forceExitTimer = setTimeout(() => {
      fallbackSignalUsed = true;
      child.kill('SIGKILL');
    }, 5000);

    child.once('exit', (code, signal) => {
      clearTimeout(sigtermTimer);
      clearTimeout(forceExitTimer);
      if (fallbackSignalUsed) {
        rejectStop(
          new Error(`Packaged server did not stop cleanly after stdin EOF (code: ${code}, signal: ${signal}).`),
        );
        return;
      }
      resolveStop();
    });

    child.stdin.end();
  });
}

async function smokeTestPackagedServer(packageRoot: string, entrypointPath: string): Promise<void> {
  console.log('Starting packaged server smoke test...');

  const child = spawn('node', [entrypointPath], {
    cwd: packageRoot,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stdoutBuffer = '';
  let stderrOutput = '';
  let shuttingDown = false;
  const pendingRequests = new Map<number, PendingRequest>();

  const rejectPendingRequests = (message: string) => {
    for (const [requestId, pendingRequest] of pendingRequests.entries()) {
      clearTimeout(pendingRequest.timer);
      pendingRequest.reject(new Error(`${message} (request id: ${requestId})`));
      pendingRequests.delete(requestId);
    }
  };

  child.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk.toString();

    let newlineIndex = stdoutBuffer.indexOf('\n');
    while (newlineIndex >= 0) {
      const line = stdoutBuffer.slice(0, newlineIndex).trim();
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);

      if (line.length > 0) {
        try {
          const response = JSON.parse(line) as JsonRpcResponse;
          const pendingRequest = pendingRequests.get(response.id);

          if (pendingRequest) {
            clearTimeout(pendingRequest.timer);
            pendingRequests.delete(response.id);
            pendingRequest.resolve(response);
          }
        } catch {
          // Ignore non-JSON output. The smoke test only cares about JSON-RPC responses.
        }
      }

      newlineIndex = stdoutBuffer.indexOf('\n');
    }
  });

  const startupPromise = new Promise<void>((resolveStartup, rejectStartup) => {
    const startupTimer = setTimeout(() => {
      rejectStartup(
        new Error(
          `Packaged server did not report startup within ${STARTUP_TIMEOUT_MS}ms.\nSTDERR:\n${stderrOutput}`,
        ),
      );
    }, STARTUP_TIMEOUT_MS);

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderrOutput += text;

      if (stderrOutput.includes('ERR_MODULE_NOT_FOUND')) {
        clearTimeout(startupTimer);
        rejectStartup(
          new Error(`Packaged server failed with ERR_MODULE_NOT_FOUND.\nSTDERR:\n${stderrOutput}`),
        );
        return;
      }

      if (stderrOutput.includes(SERVER_START_MESSAGE)) {
        clearTimeout(startupTimer);
        resolveStartup();
      }
    });

    child.on('error', (error) => {
      clearTimeout(startupTimer);
      rejectStartup(error);
    });

    child.on('exit', (code, signal) => {
      if (shuttingDown) {
        return;
      }

      clearTimeout(startupTimer);
      rejectStartup(
        new Error(
          `Packaged server exited before smoke test completed (code: ${code}, signal: ${signal}).\n` +
            `STDERR:\n${stderrOutput}`,
        ),
      );
    });
  });

  const sendRequest = async (
    request: Record<string, unknown> & { id: number },
  ): Promise<JsonRpcResponse> => {
    return await new Promise((resolveRequest, rejectRequest) => {
      const timer = setTimeout(() => {
        pendingRequests.delete(request.id);
        rejectRequest(
          new Error(
            `Timed out waiting for response to ${String(request.method)}.\nSTDERR:\n${stderrOutput}`,
          ),
        );
      }, REQUEST_TIMEOUT_MS);

      pendingRequests.set(request.id, {
        resolve: resolveRequest,
        reject: rejectRequest,
        timer,
      });

      child.stdin.write(`${JSON.stringify(request)}\n`);
    });
  };

  try {
    await startupPromise;

    const initializeResponse = await sendRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'package-smoke-test',
          version: '1.0.0',
        },
      },
    });

    if (initializeResponse.error) {
      throw new Error(`Initialize failed: ${initializeResponse.error.message}`);
    }

    const toolsResponse = await sendRequest({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    });

    if (toolsResponse.error) {
      throw new Error(`tools/list failed: ${toolsResponse.error.message}`);
    }

    const tools = toolsResponse.result?.tools;
    if (!Array.isArray(tools) || tools.length === 0) {
      throw new Error(`tools/list returned no tools. Response: ${JSON.stringify(toolsResponse)}`);
    }

    console.log(`Packaged server responded successfully with ${tools.length} tools.`);
  } finally {
    shuttingDown = true;
    rejectPendingRequests('Packaged server stopped before all requests completed');
    await stopServer(child);
  }
}

async function main(): Promise<void> {
  const skipBuild = process.argv.includes('--skip-build');
  const workDir = await mkdtemp(join(tmpdir(), 'puppeteer-real-browser-pack-'));

  try {
    await buildIfNeeded(skipBuild);

    const tarballPath = await createTarball(workDir);
    const packageRoot = await extractTarball(tarballPath, workDir);
    await linkInstalledDependencies(packageRoot);
    const packagedEntrypoint = await assertPackedEntrypoint(packageRoot);
    await smokeTestPackagedServer(packageRoot, packagedEntrypoint);

    console.log('Package smoke test passed.');
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exit(1);
});
