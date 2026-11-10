import { createInterface } from 'node:readline';
import { relative, resolve } from 'node:path';
import { ARYA_VERSION } from './compiler.js';
import { createProject, projectTemplates, type ProjectTemplate } from './web-project.js';

interface Selection { directory?: string; template?: ProjectTemplate; compilerArchive?: string; yes: boolean }
const help = `Arya project creator

  arya create [directory] [--template web|api|cli|native|ui|desktop]
  arya init [directory] --web
  create-arya-language [directory] [--template web|api|cli|native|ui|desktop]

Without a template, the creator asks what you want to build.
Options: --yes (web defaults), --compiler /path/to/compiler.tgz, --help, --version
`;

function options(args: string[]): Selection {
  const result: Selection = { yes: false };
  for (let index = 0; index < args.length; index++) {
    const value = args[index]!;
    if (value === '--yes' || value === '-y') { if (result.yes) throw new Error('Specify --yes once.'); result.yes = true; }
    else if (value === '--web' || value === '--template') {
      if (result.template) throw new Error('Specify one project template.');
      const template = value === '--web' ? 'web' : args[++index];
      if (!template || !(projectTemplates as readonly string[]).includes(template)) throw new Error('Choose --template web, api, cli, native, ui, or desktop.');
      result.template = template as ProjectTemplate;
    } else if (value === '--compiler') {
      const archive = args[++index];
      if (result.compilerArchive || !archive || archive.startsWith('-')) throw new Error('--compiler requires one compiler .tgz path.');
      result.compilerArchive = resolve(archive);
    } else if (value.startsWith('-')) throw new Error('Unknown creator option: ' + value + '. See --help.');
    else if (result.directory !== undefined) throw new Error('Choose one project directory.');
    else result.directory = value;
  }
  return result;
}

function questions() {
  const reader = createInterface({ input: process.stdin, output: process.stdout, terminal: Boolean(process.stdin.isTTY && process.stdout.isTTY) });
  const queued: string[] = [];
  let closed = false;
  let waiting: ((line: string | undefined) => void) | undefined;
  reader.on('line', line => { if (waiting) { const callback = waiting; waiting = undefined; callback(line); } else queued.push(line); });
  reader.on('close', () => { closed = true; waiting?.(undefined); waiting = undefined; });
  reader.on('SIGINT', () => reader.close());
  return {
    ask: async (label: string, fallback: string): Promise<string> => {
      process.stdout.write(label + ' (' + fallback + '): ');
      const answer = queued.length ? queued.shift() : closed ? undefined : await new Promise<string | undefined>(resolve => { waiting = resolve; });
      if (answer === undefined || ['cancel', 'quit'].includes(answer.trim().toLowerCase())) throw new Error('Project creation cancelled. For noninteractive use, pass a directory and --template web|api|cli|native|ui|desktop.');
      return answer.trim() || fallback;
    },
    close: () => reader.close()
  };
}

function shellPath(value: string): string {
  return "'" + value.replace(/'/g, process.platform === 'win32' ? "''" : "'\"'\"'") + "'";
}

export async function runProjectCreator(args: string[], mode: 'create' | 'init' = 'create'): Promise<void> {
  if (args.includes('--help')) { process.stdout.write(help); return; }
  if (args.includes('--version')) { console.log('Arya creator ' + ARYA_VERSION); return; }
  const selection = options(args);
  console.log('\n◆ Arya ' + ARYA_VERSION + ' — create something useful\n');
  if (!selection.template && !selection.yes) {
    const prompt = questions();
    try {
      if (!selection.directory) selection.directory = await prompt.ask('Project directory', 'my-arya-app');
      console.log('\nWhat do you want to build?\n  1. Web app — index.html + div#root + Arya server\n  2. API server — JSON routes without a page\n  3. CLI tool — a Node-based command-line program\n  4. Native CLI — a standalone executable (C toolchain required)\n  5. UI app — Arya components, forms, state, animations\n  6. Desktop GUI — the same UI in Electron\n');
      while (!selection.template) {
        const answer = (await prompt.ask('Select a project type', '1')).toLowerCase();
        const choice = projectTemplates[Number(answer) - 1] ?? answer;
        if ((projectTemplates as readonly string[]).includes(choice)) selection.template = choice as ProjectTemplate;
        else console.log('Enter 1–6, or web, api, cli, native, ui, desktop.');
      }
    } finally { prompt.close(); }
  }
  const directory = resolve(selection.directory ?? (mode === 'init' ? '.' : 'my-arya-app'));
  const template = selection.template ?? 'web';
  const created = await createProject(directory, { template, ...(selection.compilerArchive ? { compilerArchive: selection.compilerArchive } : {}) });
  const display = relative(process.cwd(), directory) || '.';
  console.log('\nCreated Arya ' + template + ' project: ' + directory + '\n' + created.map(file => '  ' + file).join('\n'));
  console.log('\nNext steps:\n  cd ' + shellPath(display) + '\n  npm install\n  npm run dev\n\nAlso available: npm run check, npm run build.');
  if (selection.compilerArchive) console.log('Compiler archive included in vendor/; copy the whole project to another machine.');
}
