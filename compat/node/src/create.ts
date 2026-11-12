import { runProjectCreator } from './project-creator.js';

void runProjectCreator(process.argv.slice(2)).catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
