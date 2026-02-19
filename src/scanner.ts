import fg from 'fast-glob';
import type { SvelteDoctorConfig } from './types.js';

export async function scanFiles(
  projectRoot: string,
  config: SvelteDoctorConfig
): Promise<string[]> {
  const ignorePatterns = config.ignore?.files ?? [];

  const files = await fg(['**/*.svelte', '**/*.ts', '**/*.js'], {
    cwd: projectRoot,
    absolute: true,
    ignore: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.svelte-kit/**',
      ...ignorePatterns,
    ],
  });

  return files.sort();
}
