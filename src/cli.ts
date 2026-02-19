#!/usr/bin/env node
import { program } from 'commander';
import ora from 'ora';
import { diagnose } from './index.js';
import { formatTerminalReport } from './reporters/terminal.js';
import { formatAgentReport } from './reporters/agent.js';

program
  .name('svelte-doctor')
  .description('Diagnose and fix Svelte 5 anti-patterns in your codebase')
  .version('0.0.1')
  .argument('[directory]', 'Directory to scan', '.')
  .option('--verbose', 'Show file details per rule')
  .option('--score', 'Output only the score')
  .option('--agent', 'Output structured XML for LLM consumption')
  .option('--fix', 'Auto-fix all fixable issues')
  .option('--diff [base]', 'Scan only changed files vs base branch')
  .option('-y, --yes', 'Skip prompts')
  .action(async (directory, options) => {
    const spinner = ora('Scanning...').start();

    try {
      const result = await diagnose(directory, {
        fix: options.fix,
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
  .description('Generate agent context files (.cursorrules, Claude Code skill)')
  .action(async () => {
    const { runInit } = await import('./init.js');
    console.log('\n  svelte-doctor init\n');
    runInit('.');
    console.log('\n  Done! Agent context files generated.\n');
  });

program.parse();
