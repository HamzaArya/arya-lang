import { open, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

/** CLI-local file guards. Embedders retain their own workspace/trust policy. */
export async function readBounded(filename: string): Promise<string> {
  const limit = 256 * 1024;
  const handle = await open(filename, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
  try {
    if (!(await handle.stat()).isFile()) throw new Error('Choose a regular Arya source file.');
    const buffer = Buffer.alloc(limit + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > limit) throw new Error('Arya source files support up to 256 KiB.');
    return buffer.subarray(0, bytesRead).toString('utf8');
  } finally { await handle.close(); }
}

export async function containedPath(root: string, filename: string): Promise<string> {
  const full = resolve(filename);
  const inside = (candidate: string) => {
    const path = relative(root, candidate);
    return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith('../') && !path.startsWith('..\\'));
  };
  let parent = full;
  while (true) {
    try {
      if (!inside(full) || !inside(await realpath(parent))) throw new Error('Generated output resolves outside the source directory.');
      return full;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const next = dirname(parent); if (next === parent) throw error; parent = next;
    }
  }
}
