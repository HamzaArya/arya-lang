import { lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { analyzeSource, AryaError, compile, type AryaDiagnostic, type AryaImport, type Compilation, type SourceAnalysis, type Token } from './compiler.js';
import { containedPath, readBounded } from './files.js';

export interface ProjectOptions { outputDirectory?: string; projectRoot?: string; workspaceRoot?: string; signal?: AbortSignal; target?: 'js' | 'native' }
export interface ProjectModule { filename: string; outputFilename: string; compilation: Compilation; dependencies: string[] }
export interface Project { entry: string; root: string; outputDirectory: string; entryOutput: string; modules: ProjectModule[]; workspaceRoot?: string; signal?: AbortSignal }
export class ProjectError extends Error {
  readonly token: Token;
  constructor(readonly filename: string, readonly diagnostics: AryaDiagnostic[]) {
    super(diagnostics[0]!.message); this.name = 'ProjectError'; this.token = diagnostics[0]!.token;
  }
}
interface Edge { imported: AryaImport; filename: string }
interface ModuleSource { filename: string; source: string; analysis: SourceAnalysis; edges: Edge[] }
const start: Token = { kind: 'eof', text: '', start: 0, end: 1, line: 0, column: 0 };
const inside = (root: string, path: string) => { const part = relative(root, path); return part === '' || (!isAbsolute(part) && part !== '..' && !part.startsWith('..' + sep)); };
const urlPath = (path: string) => path.split(sep).map(encodeURIComponent).join('/');
function problem(filename: string, message: string, token = start, code: AryaDiagnostic['code'] = 'ARYA_MODULE_ESCAPE'): never { throw new ProjectError(filename, [{ message, token, code }]); }
function checkBoundary(root: string, path: string, filename: string, token = start): void { if (!inside(root, path)) problem(filename, `Module or output path resolves outside the project/workspace root: ${path}`, token); }

/** Read and validate one contained dependency graph. This never executes modules or writes output. */
export async function buildProject(filename: string, options: ProjectOptions = {}): Promise<Project> {
  options.signal?.throwIfAborted();
  const requestedEntry = resolve(filename);
  let entry: string;
  try { entry = await realpath(requestedEntry); }
  catch (error) { problem(requestedEntry, `Cannot read Arya entry file: ${(error as Error).message}`, start, 'ARYA_MODULE_NOT_FOUND'); }
  const root = options.projectRoot ? await realpath(resolve(options.projectRoot)) : dirname(entry);
  checkBoundary(root, entry, entry);
  const workspaceRoot = options.workspaceRoot ? await realpath(resolve(options.workspaceRoot)) : undefined;
  if (workspaceRoot) { checkBoundary(workspaceRoot, requestedEntry, entry); checkBoundary(workspaceRoot, entry, entry); checkBoundary(workspaceRoot, root, entry); }
  const outputDirectory = resolve(options.outputDirectory ?? join(root, '.arya', 'build'));
  checkBoundary(root, outputDirectory, entry);
  if (outputDirectory === root) problem(entry, 'Generated output cannot replace the project root.');
  if (workspaceRoot) checkBoundary(workspaceRoot, outputDirectory, entry);
  const guard = async (path: string) => {
    try { await containedPath(root, path); if (workspaceRoot) await containedPath(workspaceRoot, path); }
    catch (error) { problem(entry, (error as Error).message); }
  };
  await guard(outputDirectory);
  const sources = new Map<string, ModuleSource>();
  let bytes = 0;
  const load = async (file: string): Promise<void> => {
    options.signal?.throwIfAborted();
    if (sources.has(file)) return;
    if (sources.size >= 1024) problem(file, 'Arya projects support at most 1024 modules.', start, 'ARYA_PROJECT_LIMIT');
    let source: string, analysis: SourceAnalysis;
    try { source = await readBounded(file); analysis = analyzeSource(source, file); }
    catch (error) {
      if (error instanceof AryaError) throw new ProjectError(file, error.diagnostics);
      problem(file, `Cannot read Arya module: ${(error as Error).message}`, start, 'ARYA_MODULE_NOT_FOUND');
    }
    if (analysis.diagnostics.length) throw new ProjectError(file, analysis.diagnostics);
    bytes += Buffer.byteLength(source);
    if (bytes > 16 * 1024 * 1024) problem(file, 'Arya projects support at most 16 MiB of source.', start, 'ARYA_PROJECT_LIMIT');
    const current: ModuleSource = { filename: file, source, analysis, edges: [] };
    sources.set(file, current);
    for (const imported of analysis.imports) {
      const requested = resolve(dirname(file), imported.specifier);
      checkBoundary(root, requested, file, imported.token);
      if (workspaceRoot) checkBoundary(workspaceRoot, requested, file, imported.token);
      let target: string;
      try { target = await realpath(requested); }
      catch { problem(file, `Cannot find Arya module '${imported.specifier}' imported by ${file}.`, imported.token, 'ARYA_MODULE_NOT_FOUND'); }
      checkBoundary(root, target, file, imported.token);
      if (workspaceRoot) checkBoundary(workspaceRoot, target, file, imported.token);
      current.edges.push({ imported, filename: target });
      await load(target);
    }
  };
  await load(entry);
  // First compute topological order. Only cyclic graphs pay for shortest-cycle BFS.
  const order: ModuleSource[] = [], visited = new Set<string>(), active = new Set<string>();
  let cyclic = false;
  const visit = (file: string) => {
    if (active.has(file)) { cyclic = true; return; }
    if (visited.has(file)) return;
    visited.add(file); active.add(file);
    const module = sources.get(file)!;
    for (const edge of module.edges) visit(edge.filename);
    active.delete(file); order.push(module);
  };
  visit(entry);
  if (cyclic) {
    let best: string[] | undefined;
    for (const first of [...sources.keys()].sort()) {
      const queue: { file: string; path: string[] }[] = [{ file: first, path: [first] }];
      const seen = new Set([first]);
      for (let index = 0; index < queue.length; index++) {
        const item = queue[index]!;
        if (best && item.path.length + 1 > best.length) continue;
        for (const edge of sources.get(item.file)!.edges) {
          if (edge.filename === first) { const chain = [...item.path, first]; if (!best || chain.length < best.length) best = chain; }
          else if (!seen.has(edge.filename)) { seen.add(edge.filename); queue.push({ file: edge.filename, path: [...item.path, edge.filename] }); }
        }
      }
      if (best?.length === 2) break;
    }
    const chain = best!, importer = sources.get(chain.at(-2)!)!, edge = importer.edges.find(item => item.filename === chain[0])!;
    problem(importer.filename, `Arya module cycle: ${chain.map(file => relative(root, file).split(sep).join('/')).join(' → ')}`, edge.imported.token, 'ARYA_MODULE_CYCLE');
  }
  const outputFor = (file: string) => join(outputDirectory, relative(root, file) + '.mjs');
  for (const file of sources.keys()) if (inside(outputDirectory, file)) problem(entry, 'Generated output cannot replace a directory containing source modules.');
  const modules: ProjectModule[] = [];
  for (const module of order) {
    options.signal?.throwIfAborted();
    const outputFilename = outputFor(module.filename);
    await guard(outputFilename); await guard(outputFilename + '.map');
    const imports: Record<string, string> = Object.create(null);
    for (const edge of module.edges) {
      let specifier = urlPath(relative(dirname(outputFilename), outputFor(edge.filename)));
      if (!specifier.startsWith('.')) specifier = './' + specifier;
      imports[edge.imported.specifier] = specifier;
    }
    const byAlias = new Map(module.edges.map(edge => [edge.imported.alias.start, edge]));
    const exportErrors: AryaDiagnostic[] = [];
    for (const member of module.analysis.moduleMembers) {
      const alias = member.reference.binding?.token;
      const edge = alias && byAlias.get(alias.start);
      if (edge && !sources.get(edge.filename)!.analysis.exports.some(token => token.text === member.token.text)) exportErrors.push({ code: 'ARYA_MODULE_EXPORT', token: member.token, message: `Arya module '${edge.imported.specifier}' does not export '${member.token.text}'.` });
    }
    if (exportErrors.length) throw new ProjectError(module.filename, exportErrors);
    let compilation: Compilation;
    try { compilation = options.target === 'native' ? { ...module.analysis, code: '', map: '', mapFilename: '', usesPython: false } : compile(module.source, { filename: module.filename, outputFilename, aryaImports: imports }); }
    catch (error) { if (error instanceof AryaError) throw new ProjectError(module.filename, error.diagnostics); throw error; }
    modules.push({ filename: module.filename, outputFilename, compilation, dependencies: [...new Set(module.edges.map(edge => edge.filename))] });
  }
  const project: Project = { entry, root, outputDirectory, entryOutput: outputFor(entry), modules };
  if (workspaceRoot) project.workspaceRoot = workspaceRoot;
  if (options.signal) project.signal = options.signal;
  return project;
}

/** Explicit graph checking reads dependencies but never imports or runs them. */
export const checkProject = buildProject;

async function validateOwnedOutput(path: string, filename: string): Promise<void> {
  let stat;
  try { stat = await lstat(path); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
  if (stat.isSymbolicLink()) problem(filename, 'Generated output contains a symbolic link; refusing to publish outside its owned output tree.');
  if (!stat.isDirectory()) problem(filename, 'Choose a directory for generated output.');
  const items = await readdir(path, { withFileTypes: true });
  const generated = new Set<string>();
  for (const item of items) {
    const child = join(path, item.name);
    if (item.isSymbolicLink()) problem(filename, 'Generated output contains a symbolic link; refusing to publish outside its owned output tree.');
    if (item.isDirectory()) { await validateOwnedOutput(child, filename); continue; }
    if (!item.isFile()) problem(filename, `Generated output contains an unowned non-regular file: ${item.name}`);
    if (item.name === '.arya-build.json' || item.name.endsWith('.mjs.map')) continue;
    if (!item.name.endsWith('.mjs')) problem(filename, `Generated output contains an unowned file: ${item.name}`);
    const file = await open(child, 'r');
    try { const bytes = Buffer.alloc(64); const result = await file.read(bytes, 0, bytes.length, 0); if (!bytes.subarray(0, result.bytesRead).toString().startsWith('// Generated by Arya ')) problem(filename, `Generated output contains an unowned module: ${item.name}`); generated.add(item.name); }
    finally { await file.close(); }
  }
  for (const item of items) {
    if (item.name.endsWith('.mjs.map') && !generated.has(item.name.slice(0, -4))) problem(filename, `Generated output contains an unowned map: ${item.name}`);
    if (item.name === '.arya-build.json') {
      let metadata: { format?: unknown; entry?: unknown; modules?: unknown };
      try { metadata = JSON.parse(await readFile(join(path, item.name), 'utf8')); }
      catch { problem(filename, 'Generated output contains an invalid ownership manifest.'); }
      if (!metadata || typeof metadata !== 'object' || metadata.format !== 1 || typeof metadata.entry !== 'string' || !Array.isArray(metadata.modules) || !metadata.modules.length || !metadata.modules.every(name => typeof name === 'string' && name.endsWith('.mjs') && inside(path, resolve(path, name)))) problem(filename, 'Generated output contains an unowned manifest.');
      for (const module of metadata.modules as string[]) {
        const file = join(path, module);
        let handle;
        try { handle = await open(file, 'r'); const buffer = Buffer.alloc(64); const result = await handle.read(buffer, 0, buffer.length, 0); if (!buffer.subarray(0, result.bytesRead).toString().startsWith('// Generated by Arya ')) problem(filename, 'Generated output manifest does not identify Arya modules.'); }
        catch (error) { if (error instanceof ProjectError) throw error; problem(filename, 'Generated output manifest references a missing or unowned module.'); }
        finally { await handle?.close(); }
      }
    }
  }
}

const publications = new Map<string, Promise<void>>();
/** Stage every module/map, then swap the owned output directory with rollback. */
export async function writeProject(project: Project, options: { signal?: AbortSignal } = {}): Promise<string> {
  const previous = publications.get(project.outputDirectory) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>(ok => { release = ok; });
  publications.set(project.outputDirectory, current);
  await previous;
  const signal = options.signal ?? project.signal;
  let staging: string | undefined, backup: string | undefined, committed = false;
  try {
    signal?.throwIfAborted();
    await containedPath(project.root, project.outputDirectory);
    if (project.workspaceRoot) await containedPath(project.workspaceRoot, project.outputDirectory);
    for (const module of project.modules) {
      checkBoundary(project.outputDirectory, module.outputFilename, project.entry);
      await containedPath(project.root, module.outputFilename); await containedPath(project.root, module.outputFilename + '.map');
      if (project.workspaceRoot) { await containedPath(project.workspaceRoot, module.outputFilename); await containedPath(project.workspaceRoot, module.outputFilename + '.map'); }
    }
    await validateOwnedOutput(project.outputDirectory, project.entry);
    await mkdir(dirname(project.outputDirectory), { recursive: true });
    staging = await mkdtemp(join(dirname(project.outputDirectory), '.arya-stage-'));
    for (const module of project.modules) {
      signal?.throwIfAborted();
      const output = join(staging, relative(project.outputDirectory, module.outputFilename));
      await mkdir(dirname(output), { recursive: true });
      await writeFile(output + '.map', module.compilation.map); await writeFile(output, module.compilation.code);
    }
    await writeFile(join(staging, '.arya-build.json'), JSON.stringify({ format: 1, entry: relative(project.root, project.entry).split(sep).join('/'), modules: project.modules.map(module => relative(project.outputDirectory, module.outputFilename).split(sep).join('/')) }) + '\n');
    signal?.throwIfAborted();
    await containedPath(project.root, project.outputDirectory);
    await validateOwnedOutput(project.outputDirectory, project.entry);
    try { await lstat(project.outputDirectory); const candidate = staging + '-previous'; await rename(project.outputDirectory, candidate); backup = candidate; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    signal?.throwIfAborted();
    await rename(staging, project.outputDirectory); committed = true;
    return project.entryOutput;
  } catch (error) {
    if (backup && !committed) await rename(backup, project.outputDirectory);
    throw error;
  } finally {
    try {
      if (staging) await rm(staging, { recursive: true, force: true });
      if (committed && backup) await rm(backup, { recursive: true, force: true });
    } finally { release(); if (publications.get(project.outputDirectory) === current) publications.delete(project.outputDirectory); }
  }
}
