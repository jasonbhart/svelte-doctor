import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SvelteDoctorConfig } from './types.js';

export function loadConfig(projectRoot: string): SvelteDoctorConfig {
  const configPath = path.join(projectRoot, 'svelte-doctor.config.json');
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(raw) as SvelteDoctorConfig;
  }

  const pkgPath = path.join(projectRoot, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const raw = fs.readFileSync(pkgPath, 'utf-8');
    const pkg = JSON.parse(raw);
    if (pkg.svelteDoctor) {
      return pkg.svelteDoctor as SvelteDoctorConfig;
    }
  }

  return {};
}
