#!/usr/bin/env node
import { createRequire } from 'node:module';
import { program } from 'commander';
import ora from 'ora';
import * as readline from 'node:readline';
import { diagnose } from './index.js';
import { formatTerminalReport } from './reporters/terminal.js';
import { formatAgentReport } from './reporters/agent.js';

async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${message} (y/N) `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

program
  .name('svelte-doctor')
  .description('Diagnose and fix Svelte 5 anti-patterns in your codebase')
  .version(pkg.version)
  .argument('[directory]', 'Directory to scan', '.')
  .option('--verbose', 'Show file details per rule')
  .option('--score', 'Output only the score')
  .option('--agent', 'Output structured XML for LLM consumption')
  .option('--fix', 'Auto-fix all fixable issues')
  .option('-y, --yes', 'Skip prompts')
  .action(async (directory, options) => {
    const spinner = ora('Scanning...').start();

    try {
      const confirmFix = options.fix && !options.yes
        ? async (fixableCount: number) => {
            spinner.stop();
            return confirm(`Found ${fixableCount} fixable issue(s). Apply fixes?`);
          }
        : undefined;

      const result = await diagnose(directory, {
        fix: options.fix,
        confirmFix,
      });

      spinner.stop();

      if (options.score) {
        console.log(result.score.score);
        process.exit(result.score.score >= 75 ? 0 : 1);
        return;
      }

      if (options.agent) {
        console.log(
          formatAgentReport(result.diagnostics, result.score, result.filesScanned)
        );
        process.exit(result.score.score >= 75 ? 0 : 1);
        return;
      }

      console.log(
        formatTerminalReport(
          result.diagnostics,
          result.score,
          result.filesScanned,
          options.verbose ?? false
        )
      );

      process.exit(result.score.score >= 75 ? 0 : 1);
    } catch (error: any) {
      spinner.fail(error.message);
      process.exit(1);
    }
  });

program
  .command('init')
  .description('Generate agent context files, CI workflow, and hook configs')
  .action(async () => {
    const { runInit } = await import('./init.js');
    console.log('\n  svelte-doctor init\n');
    runInit('.');
    console.log('');
    console.log('  Next steps:');
    console.log('    CI:     Workflow runs on push/PR to main');
    console.log('    Husky:  Add to .husky/pre-commit: sh .husky/svelte-doctor');
    console.log('    Claude: Stop hook runs automatically after each response');
    console.log('\n  Done! Integration configs generated.\n');
  });

program.parse();
