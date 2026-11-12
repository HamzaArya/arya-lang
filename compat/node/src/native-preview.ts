import { readFile, writeFile, mkdir, mkdtemp, rm, link, lstat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { readBounded } from './files.js';
import { lowerNative } from './native-lower.js';
import { emitNativeLLVM, nativeRuntimeSource } from './native-backend.js';
import { serializeNativeIR, verifyNativeIR } from './native-ir.js';
export { NativeCompileError } from './native-lower.js';
export { NativeIRError, verifyNativeIR, serializeNativeIR } from './native-ir.js';
export type {
  IRProgram,
  IRFunction,
  IRExpr,
  IRStmt,
  IRSpan,
  IRType,
  IRScalarType,
} from './native-ir.js';

export class NativeBuildError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'NativeBuildError';
  }
}
export interface NativeBuildOptions {
  output: string;
  mode?: 'debug' | 'release';
  compiler?: string;
  sanitize?: boolean;
}
/** Shared frontend and verified IR; no source imports, toolchain processes or filesystem effects. */
export function compileNative(source: string, filename = 'main.arya') {
  if (
    typeof source !== 'string' ||
    Buffer.byteLength(source) > 256 * 1024 ||
    typeof filename !== 'string'
  )
    throw new NativeBuildError(
      'ARYA_NATIVE_INPUT',
      'Provide a source string of at most 256 KiB and a filename.',
    );
  const ir = lowerNative(source, filename);
  verifyNativeIR(ir);
  return { ir, llvm: emitNativeLLVM(ir) };
}
const execute = promisify(execFile);
/** Explicit host-only compiler invocation; publish the executable exclusively after success. */
export async function buildNativePreview(entry: string, options: NativeBuildOptions) {
  const started = performance.now();
  if (
    !options ||
    typeof options !== 'object' ||
    Array.isArray(options) ||
    Object.keys(options).some((key) => !['output', 'mode', 'compiler', 'sanitize'].includes(key)) ||
    typeof options.output !== 'string' ||
    !options.output ||
    (options.mode !== undefined && !['debug', 'release'].includes(options.mode)) ||
    (options.compiler !== undefined &&
      (typeof options.compiler !== 'string' || !options.compiler)) ||
    (options.sanitize !== undefined && typeof options.sanitize !== 'boolean')
  )
    throw new NativeBuildError(
      'ARYA_NATIVE_INPUT',
      'Specify output, optional debug/release mode, compiler executable and boolean sanitize.',
    );
  if (!['darwin', 'linux'].includes(process.platform) || !['arm64', 'x64'].includes(process.arch))
    throw new NativeBuildError(
      'ARYA_NATIVE_PLATFORM',
      'The native preview driver currently targets macOS/Linux ARM64 and x86-64 hosts.',
    );
  const filename = resolve(entry),
    output = resolve(options.output);
  const source = await readBounded(filename),
    compiled = compileNative(source, filename);
  const mode = options.mode ?? 'debug',
    compilerPath = options.compiler ?? process.env.ARYA_NATIVE_CLANG ?? 'clang++';
  try {
    await lstat(output);
    throw new NativeBuildError('ARYA_NATIVE_EXISTS', 'Output already exists: ' + output);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  let compiler: string;
  try {
    const version = await execute(compilerPath, ['--version'], {
      timeout: 10000,
      maxBuffer: 65536,
    });
    if (!/clang version/i.test(version.stdout)) throw new Error('Expected a Clang C++ driver.');
    compiler = version.stdout.trim().split('\n')[0]!;
  } catch (error) {
    throw new NativeBuildError(
      'ARYA_NATIVE_TOOLCHAIN',
      'A working Clang C++ driver and platform SDK are required: ' + (error as Error).message,
    );
  }
  await mkdir(dirname(output), { recursive: true });
  const stage = await mkdtemp(join(dirname(output), '.arya-native-'));
  try {
    const module = join(stage, 'program.ll'),
      runtime = join(stage, 'runtime.cc'),
      binary = join(stage, 'program');
    await writeFile(module, compiled.llvm);
    await writeFile(runtime, nativeRuntimeSource);
    const flags = [
      '-std=c++17',
      mode === 'release' ? '-O2' : '-O0',
      '-fno-fast-math',
      '-ffp-contract=off',
      ...(mode === 'debug' ? ['-g'] : []),
      ...(options.sanitize ? ['-fsanitize=address,undefined', '-fno-omit-frame-pointer'] : []),
      '-Wno-override-module',
      module,
      runtime,
      '-o',
      binary,
    ];
    try {
      await execute(compilerPath, flags, { timeout: 60000, maxBuffer: 2 * 1024 * 1024 });
    } catch (error) {
      const detail = error as Error & { stderr?: string };
      throw new NativeBuildError(
        'ARYA_NATIVE_TOOLCHAIN',
        'Native compilation/linking failed: ' + (detail.stderr || detail.message),
      );
    }
    const bytes = await readFile(binary);
    // Same-filesystem hard link publishes the entire executable atomically and refuses clobbering.
    try {
      await link(binary, output);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST')
        throw new NativeBuildError('ARYA_NATIVE_EXISTS', 'Output already exists: ' + output);
      throw error;
    }
    return {
      output,
      ...compiled,
      compiler,
      mode,
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      buildMs: performance.now() - started,
    };
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}
