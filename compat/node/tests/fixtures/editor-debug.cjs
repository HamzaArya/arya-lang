const vscode = require('vscode');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

exports.checkDebugging = async (extension) => {
  const root = process.env.ARYA_EDITOR_TEST_WORKSPACE;
  const adapter = vscode.extensions.getExtension('ms-vscode.js-debug');
  assert.ok(
    adapter,
    'Install a Node debug adapter, or set ARYA_EDITOR_TEST_JS_DEBUG for an isolated test copy',
  );
  const source = path.join(root, 'debug.arya');
  await fs.writeFile(
    source,
    'const amount = 42\nconst label = "Arya"\nprint(amount)\nprint(label)\nprint("done")\n',
  );
  execFileSync(
    process.env.ARYA_EDITOR_TEST_NODE,
    [path.join(extension.extensionPath, 'dist/arya.cjs'), 'build', source],
    { cwd: root, encoding: 'utf8', timeout: 15000 },
  );
  const stops = [],
    waiters = [];
  let session, rootSession;
  const tracker = vscode.debug.registerDebugAdapterTrackerFactory('*', {
    createDebugAdapterTracker(active) {
      rootSession ??= active;
      void fs.appendFile(
        process.env.ARYA_EDITOR_TEST_TRACE,
        JSON.stringify({
          session: active.name,
          type: active.type,
          program: active.configuration.program,
        }) + '\n',
      );
      return {
        onDidSendMessage(message) {
          if (message.body?.category !== 'telemetry')
            void fs.appendFile(process.env.ARYA_EDITOR_TEST_TRACE, JSON.stringify(message) + '\n');
          if (message.type === 'event' && message.event === 'stopped') {
            session = active;
            const waiter = waiters.shift();
            if (waiter) waiter(message.body);
            else stops.push(message.body);
          }
        },
      };
    },
  });
  const nextStop = () =>
    new Promise((resolve, reject) => {
      if (stops.length) return resolve(stops.shift());
      const timer = setTimeout(
        () => reject(new Error('Timed out waiting for Arya breakpoint/step')),
        20000,
      );
      waiters.push((value) => {
        clearTimeout(timer);
        resolve(value);
      });
    });
  const document = await vscode.workspace.openTextDocument(source);
  const editor = await vscode.window.showTextDocument(document);
  editor.selection = new vscode.Selection(2, 0, 2, 0);
  await vscode.commands.executeCommand('editor.debug.action.toggleBreakpoint');
  const findBreakpoint = () =>
    vscode.debug.breakpoints.find(
      (value) =>
        value instanceof vscode.SourceBreakpoint &&
        value.location.uri.toString() === document.uri.toString() &&
        value.location.range.start.line === 2,
    );
  for (let attempt = 0; attempt < 100 && !findBreakpoint(); attempt++)
    await new Promise((resolve) => setTimeout(resolve, 20));
  const breakpoint = findBreakpoint();
  assert.ok(breakpoint, 'editor toggles an Arya source breakpoint');
  try {
    assert.equal(
      await vscode.debug.startDebugging(vscode.workspace.workspaceFolders[0], {
        name: 'Arya qualification',
        type: 'node',
        request: 'launch',
        runtimeExecutable: process.env.ARYA_EDITOR_TEST_NODE,
        program: path.join(root, '.arya/build/debug.arya.mjs'),
        cwd: root,
        console: 'internalConsole',
        sourceMaps: true,
        outFiles: [path.join(root, '.arya/build/**/*.mjs')],
        resolveSourceMapLocations: [path.join(root, '**'), '!**/node_modules/**'],
        skipFiles: ['<node_internals>/**'],
      }),
      true,
      'launch Node debug adapter',
    );
    const paused = await nextStop();
    assert.ok(session, 'debug session');
    const stack = await session.customRequest('stackTrace', {
      threadId: paused.threadId,
      startFrame: 0,
      levels: 1,
    });
    const frame = stack.stackFrames[0];
    assert.equal(path.resolve(frame.source.path), path.resolve(source), 'breakpoint maps to Arya');
    assert.equal(frame.line, 3);
    const value = await session.customRequest('evaluate', {
      expression: 'amount',
      frameId: frame.id,
      context: 'watch',
    });
    assert.equal(value.result, '42');
    const stepped = nextStop();
    await session.customRequest('next', { threadId: paused.threadId });
    const stop = await stepped;
    const next = await session.customRequest('stackTrace', {
      threadId: stop.threadId,
      startFrame: 0,
      levels: 1,
    });
    assert.equal(path.resolve(next.stackFrames[0].source.path), path.resolve(source));
    assert.equal(next.stackFrames[0].line, 4, 'step advances to next Arya statement');
    return {
      breakpointLine: frame.line,
      stepLine: next.stackFrames[0].line,
      evaluatedAmount: value.result,
      adapter: {
        id: adapter.id,
        version: adapter.packageJSON.version,
        origin: process.env.ARYA_EDITOR_TEST_DEBUG_ADAPTER_ORIGIN,
      },
    };
  } finally {
    vscode.debug.removeBreakpoints([breakpoint]);
    if (rootSession) await vscode.debug.stopDebugging(rootSession);
    tracker.dispose();
  }
};
