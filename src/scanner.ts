import fg from 'fast-glob';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SvelteDoctorConfig } from './types.js';

function loadGitignorePatterns(projectRoot: string): string[] {
  const gitignorePath = path.join(projectRoot, '.gitignore');
  if (!fs.existsSync(gitignorePath)) return [];

  const content = fs.readFileSync(gitignorePath, 'utf-8');
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'))
    .map((pattern) => (pattern.startsWith('**/') ? pattern : `**/${pattern}`));
}

export async function scanFiles(
  projectRoot: string,
  config: SvelteDoctorConfig
): Promise<string[]> {
  const ignorePatterns = config.ignore?.files ?? [];
  const gitignorePatterns = loadGitignorePatterns(projectRoot);

  const files = await fg(['**/*.svelte', '**/*.ts', '**/*.js'], {
    cwd: projectRoot,
    absolute: true,
    ignore: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.svelte-kit/**',
      ...ignorePatterns,
      ...gitignorePatterns,
    ],
  });

  return files.sort();
}
