'use strict';
// A portable VSIX uses an installed compiler. Platform packages may carry one,
// but must never launch a binary intended for a different extension host.
const {join} = require('path');
const {existsSync, readFileSync} = require('fs');

function resolveCompiler({configured = '', directory = __dirname,
  platform = process.platform, arch = process.arch} = {}) {
  if (configured) return configured;
  const executable = platform === 'win32' ? 'arya.exe' : 'arya';
  try {
    const metadata = JSON.parse(readFileSync(join(directory, 'native', 'platform.json'), 'utf8'));
    const bundled = join(directory, 'native', executable);
    if (metadata.platform === platform && metadata.arch === arch && existsSync(bundled)) return bundled;
  } catch { /* Source checkouts, portable packages and incomplete bundles use PATH. */ }
  return executable;
}

module.exports = {resolveCompiler};
