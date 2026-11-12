import { readFile, mkdir, mkdtemp, rename, writeFile, copyFile, stat, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
const directory = dirname(fileURLToPath(import.meta.url)),
  root = resolve(directory, '../..');
const tag = process.platform + '-' + process.arch + '-napi9';
const sources = ['kernel.h', 'addon.cc', 'build.mjs'];
export async function sourceHash() {
  const hash = createHash('sha256');
  for (const name of sources) {
    hash.update(name);
    hash.update(await readFile(join(directory, name)));
  }
  return hash.digest('hex');
}
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
export async function copyNativeRuntime(destination = join(root, 'dist')) {
  const cache = join(root, '.build/accounting-native', tag);
  let metadata, bytes;
  try {
    metadata = JSON.parse(await readFile(join(cache, 'build.json'), 'utf8'));
    bytes = await readFile(join(cache, 'accounting.node'));
  } catch {
    return false;
  }
  if (
    metadata.sourceHash !== (await sourceHash()) ||
    metadata.sha256 !== digest(bytes) ||
    metadata.tag !== tag
  )
    return false;
  const output = join(destination, 'native', tag);
  await mkdir(output, { recursive: true });
  const stage = await mkdtemp(join(output, '.stage-'));
  await writeFile(join(stage, 'accounting.node'), bytes);
  await rename(join(stage, 'accounting.node'), join(output, 'accounting.node'));
  await writeFile(join(output, 'build.json'), JSON.stringify(metadata, null, 2) + '\n');
  await rm(stage, { recursive: true, force: true });
  return true;
}
export async function buildNative({ sanitize = false, headers } = {}) {
  if (!['darwin', 'linux'].includes(process.platform) || !['arm64', 'x64'].includes(process.arch))
    throw new Error(
      'The optional native prototype supports macOS/Linux arm64/x64 with a 128-bit-capable C++ compiler. The JavaScript backend works without it.',
    );
  const candidates = [
    headers,
    process.env.ARYA_NODE_INCLUDE,
    resolve(dirname(process.execPath), '../include/node'),
    '/usr/local/include/node',
    '/usr/include/node',
  ].filter(Boolean);
  let include;
  for (const candidate of candidates) {
    try {
      if ((await stat(join(candidate, 'node_api.h'))).isFile()) {
        include = candidate;
        break;
      }
    } catch {}
  }
  if (!include)
    throw new Error(
      'Node-API headers not found. Supply --headers /path/to/include/node or ARYA_NODE_INCLUDE.',
    );
  const compiler = process.env.CXX || 'c++';
  const version = spawnSync(compiler, ['--version'], { encoding: 'utf8' });
  if (version.error || version.status !== 0)
    throw new Error('A working C++ compiler is required for this explicit native build.');
  const cache = join(root, '.build/accounting-native', tag);
  await mkdir(cache, { recursive: true });
  const stage = await mkdtemp(join(cache, '.stage-'));
  const flags = [
    '-std=c++17',
    '-O3',
    '-DNDEBUG',
    '-fPIC',
    '-fvisibility=hidden',
    '-Wall',
    '-Wextra',
    '-Werror',
    '-DNAPI_VERSION=9',
    '-I',
    include,
  ];
  const args = [
    ...flags,
    ...(process.platform === 'darwin' ? ['-bundle', '-undefined', 'dynamic_lookup'] : ['-shared']),
    join(directory, 'addon.cc'),
    '-o',
    join(stage, 'accounting.node'),
  ];
  const built = spawnSync(compiler, args, { stdio: 'inherit' });
  if (built.error) throw built.error;
  if (built.status !== 0) throw new Error('Native compilation failed.');
  if (sanitize) {
    const test = join(stage, 'kernel-test');
    const checked = spawnSync(
      compiler,
      [
        '-std=c++17',
        '-O1',
        '-g',
        '-fsanitize=address,undefined',
        '-fno-omit-frame-pointer',
        join(directory, 'kernel-test.cc'),
        '-o',
        test,
      ],
      { stdio: 'inherit' },
    );
    if (checked.error) throw checked.error;
    if (checked.status !== 0) throw new Error('Cannot build sanitizer checks.');
    const ran = spawnSync(test, [], {
      stdio: 'inherit',
      env: {
        ...process.env,
        UBSAN_OPTIONS: 'halt_on_error=1',
        ASAN_OPTIONS: process.platform === 'linux' ? 'detect_leaks=1' : 'detect_leaks=0',
      },
    });
    if (ran.error) throw ran.error;
    if (ran.status !== 0) throw new Error('Native sanitizer checks failed.');
  }
  const bytes = await readFile(join(stage, 'accounting.node'));
  const metadata = {
    abi: 1,
    nodeApi: 9,
    tag,
    sourceHash: await sourceHash(),
    sha256: digest(bytes),
    bytes: bytes.length,
    compiler: version.stdout.trim().split('\n')[0],
    flags,
    node: process.version,
    sanitizersPassed: sanitize,
    leakSanitizer: sanitize && process.platform === 'linux' ? 'passed' : 'not-run',
  };
  await rename(join(stage, 'accounting.node'), join(cache, 'accounting.node'));
  await writeFile(join(cache, 'build.json'), JSON.stringify(metadata, null, 2) + '\n');
  await copyNativeRuntime();
  await rm(stage, { recursive: true, force: true });
  console.log(JSON.stringify(metadata, null, 2));
  return metadata;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2);
  let headers;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--headers') {
      headers = args[++i];
      if (!headers) throw new Error('--headers requires a directory.');
    } else if (args[i] !== '--sanitize')
      throw new Error('Use --sanitize and/or --headers /path/to/include/node.');
  }
  await buildNative({ sanitize: args.includes('--sanitize'), headers });
}
