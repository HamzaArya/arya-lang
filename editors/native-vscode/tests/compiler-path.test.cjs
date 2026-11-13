'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {mkdtempSync, mkdirSync, writeFileSync, rmSync} = require('node:fs');
const {tmpdir} = require('node:os');
const {join} = require('node:path');
const {resolveCompiler} = require('../compiler-path.cjs');

test('explicit overrides and portable native names', () => {
  assert.equal(resolveCompiler({configured: '/some path/arya', platform: 'win32'}), '/some path/arya');
  assert.equal(resolveCompiler({directory: '/nonexistent', platform: 'linux', arch: 'x64'}), 'arya');
  assert.equal(resolveCompiler({directory: '/nonexistent', platform: 'win32', arch: 'x64'}), 'arya.exe');
});
test('bundles are selected only when operating system, architecture and binary match', () => {
  const directory = mkdtempSync(join(tmpdir(), 'arya-editor-path-'));
  try {
    mkdirSync(join(directory, 'native'));
    writeFileSync(join(directory, 'native', 'arya'), 'fixture');
    writeFileSync(join(directory, 'native', 'arya.exe'), 'fixture');
    for (const platform of ['darwin', 'linux', 'win32']) {
      writeFileSync(join(directory, 'native', 'platform.json'), JSON.stringify({platform, arch: 'arm64'}));
      const executable = platform === 'win32' ? 'arya.exe' : 'arya';
      assert.equal(resolveCompiler({directory, platform, arch: 'arm64'}), join(directory, 'native', executable));
      assert.equal(resolveCompiler({directory, platform, arch: 'x64'}), executable);
      assert.equal(resolveCompiler({directory, platform: 'freebsd', arch: 'arm64'}), 'arya');
    }
    writeFileSync(join(directory, 'native', 'platform.json'), '{broken');
    assert.equal(resolveCompiler({directory, platform: 'darwin', arch: 'arm64'}), 'arya');
    writeFileSync(join(directory, 'native', 'platform.json'), JSON.stringify({platform: 'darwin', arch: 'arm64'}));
    rmSync(join(directory, 'native', 'arya'));
    assert.equal(resolveCompiler({directory, platform: 'darwin', arch: 'arm64'}), 'arya');
  } finally { rmSync(directory, {recursive: true, force: true}); }
});
