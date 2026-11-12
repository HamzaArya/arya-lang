import { externalModuleTypes } from './declarations.js';
import type { Type } from './types.js';
import { readdir } from 'node:fs/promises';
import { watch, type FSWatcher } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readBounded } from './files.js';
import type { SourceDocument } from './workspace-service.js';

const excluded = new Set([
  '.git',
  'node_modules',
  'dist',
  '.build',
  'artifacts',
  '.arya',
  '__pycache__',
]);
const inside = (root: string, path: string) => {
  const part = relative(root, path);
  return part === '' || (!isAbsolute(part) && part !== '..' && !part.startsWith('..' + sep));
};

/** A bounded, read-only disk index. Open buffers always override disk snapshots. */
export function createWorkspaceIndex(onChange: () => void = () => {}) {
  let roots: string[] = [],
    disk = new Map<string, SourceDocument>(),
    dirty = true;
  let generation = 0,
    loading: Promise<void> | undefined;
  let issues: string[] = [];
  const watchers = new Map<string, FSWatcher>();
  let declarations = new Map<string, Promise<Type | undefined>>();
  const buffers = new Map<string, SourceDocument>();
  const invalidate = () => {
    dirty = true;
    generation++;
    onChange();
  };
  const watchDirectory = (directory: string) => {
    if (watchers.has(directory)) return;
    try {
      const watcher = watch(directory, { persistent: false }, (event, filename) => {
        const name = filename?.toString();
        if (
          !name ||
          (!excluded.has(name) &&
            (event === 'rename' ||
              /(?:\.arya|\.d\.(?:ts|mts|cts)|package(?:-lock)?\.json)$/.test(name)))
        )
          invalidate();
      });
      watcher.on('error', invalidate);
      watchers.set(directory, watcher);
    } catch {
      /* Clients can also send file-watcher notifications. */
    }
  };
  const configure = (uris: string[]) => {
    for (const watcher of watchers.values()) watcher.close();
    watchers.clear();
    roots = [
      ...new Set(
        uris.filter((uri) => uri.startsWith('file:')).map((uri) => resolve(fileURLToPath(uri))),
      ),
    ];
    disk.clear();
    buffers.clear();
    issues = [];
    dirty = true;
    generation++;
  };
  const scan = async () => {
    const revision = generation,
      next = new Map<string, SourceDocument>(),
      failures: string[] = [];
    let bytes = 0,
      visited = 0,
      sourceCount = 0;
    const directories = new Set<string>();
    declarations = new Map();
    buffers.clear();
    const collect = async (directory: string): Promise<void> => {
      if (revision !== generation) return;
      if (++visited > 8192)
        throw new Error('Workspace discovery supports at most 8192 directories.');
      directories.add(directory);
      watchDirectory(directory);
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (revision !== generation) return;
        if (excluded.has(entry.name)) continue;
        const filename = join(directory, entry.name);
        if (entry.isSymbolicLink()) {
          failures.push(`Symbolic workspace entry is excluded: ${filename}`);
          continue;
        }
        if (entry.isDirectory()) await collect(filename);
        else if (entry.isFile() && entry.name.endsWith('.arya')) {
          const uri = pathToFileURL(filename).href;
          if (next.has(uri)) continue;
          if (++sourceCount > 1024)
            throw new Error('Workspace discovery supports at most 1024 Arya modules.');
          try {
            const source = await readBounded(filename);
            bytes += Buffer.byteLength(source);
            if (bytes > 16 * 1024 * 1024)
              throw new RangeError('Workspace discovery supports at most 16 MiB of source.');
            const moduleTypes = await externalModuleTypes(source, filename, declarations);
            next.set(uri, {
              uri,
              source,
              ...(Object.keys(moduleTypes).length ? { moduleTypes } : {}),
            });
          } catch (error) {
            if (error instanceof RangeError) throw error;
            failures.push(`${filename}: ${(error as Error).message}`);
          }
        }
      }
    };
    try {
      for (const root of roots) await collect(root);
    } catch (error) {
      failures.push((error as Error).message);
    }
    if (revision === generation) {
      disk = next;
      issues = failures;
      dirty = false;
      for (const [directory, watcher] of watchers)
        if (!directories.has(directory)) {
          watcher.close();
          watchers.delete(directory);
        }
    }
  };
  return {
    configure,
    invalidate,
    async refresh(
      open: SourceDocument[],
    ): Promise<{ documents: SourceDocument[]; complete: boolean; issues: string[] }> {
      // Coalesce requests; retry if a file changed during the scan.
      for (let attempt = 0; dirty && attempt < 3; attempt++) {
        loading ??= scan().finally(() => {
          loading = undefined;
        });
        await loading;
      }
      const documents = new Map(disk);
      const opened = new Set(open.map((d) => d.uri));
      for (const uri of buffers.keys()) if (!opened.has(uri)) buffers.delete(uri);
      for (const document of open) {
        const buffered = buffers.get(document.uri);
        if (buffered?.source === document.source) {
          documents.set(document.uri, buffered);
          continue;
        }
        const previous = disk.get(document.uri);
        const moduleTypes =
          previous?.source === document.source
            ? previous.moduleTypes
            : document.uri.startsWith('file:')
              ? await externalModuleTypes(
                  document.source,
                  fileURLToPath(document.uri),
                  declarations,
                )
              : {};
        const snapshot = { ...document, ...(moduleTypes ? { moduleTypes } : {}) };
        documents.set(document.uri, snapshot);
        buffers.set(document.uri, snapshot);
      }
      const covered = open.every(
        (d) =>
          d.uri.startsWith('file:') && roots.some((root) => inside(root, fileURLToPath(d.uri))),
      );
      return {
        documents: [...documents.values()],
        complete: roots.length > 0 && covered && !dirty && !issues.length,
        issues: [...issues],
      };
    },
    dispose() {
      for (const watcher of watchers.values()) watcher.close();
      watchers.clear();
      disk.clear();
      buffers.clear();
      roots = [];
      generation++;
      dirty = true;
    },
  };
}
