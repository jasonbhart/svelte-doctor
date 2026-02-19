import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadConfig } from '../src/config.js';
import * as fs from 'node:fs';

vi.mock('node:fs');

describe('loadConfig', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns empty config when no config file exists', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    vi.spyOn(fs, 'readFileSync').mockReturnValue('{}');
    const config = loadConfig('/fake/project');
    expect(config).toEqual({});
  });

  it('loads svelte-doctor.config.json when present', () => {
    vi.spyOn(fs, 'existsSync').mockImplementation((p) =>
      String(p).endsWith('svelte-doctor.config.json')
    );
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      JSON.stringify({ ignore: { rules: ['sv-no-export-let'] } })
    );
    const config = loadConfig('/fake/project');
    expect(config.ignore?.rules).toEqual(['sv-no-export-let']);
  });

  it('falls back to package.json svelteDoctor key', () => {
    vi.spyOn(fs, 'existsSync').mockImplementation((p) =>
      String(p).endsWith('package.json')
    );
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      JSON.stringify({ svelteDoctor: { ignore: { files: ['dist/**'] } } })
    );
    const config = loadConfig('/fake/project');
    expect(config.ignore?.files).toEqual(['dist/**']);
  });

  it('svelte-doctor.config.json takes precedence over package.json', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockImplementation((p) => {
      if (String(p).endsWith('svelte-doctor.config.json')) {
        return JSON.stringify({ ignore: { rules: ['from-config'] } });
      }
      return JSON.stringify({ svelteDoctor: { ignore: { rules: ['from-pkg'] } } });
    });
    const config = loadConfig('/fake/project');
    expect(config.ignore?.rules).toEqual(['from-config']);
  });
});
