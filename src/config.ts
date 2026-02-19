import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SvelteDoctorConfig } from './types.js';

export function loadConfig(projectRoot: string): SvelteDoctorConfig {
  const configPath = path.join(projectRoot, 'svelte-doctor.config.json');
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, 'utf-8');
    try {
      return JSON.parse(raw) as SvelteDoctorConfig;
    } catch (err) {
      console.warn(
        `Warning: Failed to parse svelte-doctor.config.json: ${err instanceof Error ? err.message : err}`
      );
      return {};
    }
  }

  const pkgPath = path.join(projectRoot, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const raw = fs.readFileSync(pkgPath, 'utf-8');
    try {
      const pkg = JSON.parse(raw);
      if (pkg.svelteDoctor) {
        return pkg.svelteDoctor as SvelteDoctorConfig;
      }
    } catch (err) {
      console.warn(
        `Warning: Failed to parse package.json: ${err instanceof Error ? err.message : err}`
      );
      return {};
    }
  }

  return {};
}
