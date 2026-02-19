import { describe, it, expect } from 'vitest';
import { scanFiles } from '../src/scanner.js';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

describe('scanFiles', () => {
  it('discovers .svelte, .ts, and .js files', async () => {
    // Create a temp directory with test files
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'svelte-doctor-test-'));
    const srcDir = path.join(tmpDir, 'src', 'routes');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, '+page.svelte'), '<p>hello</p>');
    fs.writeFileSync(path.join(srcDir, '+page.server.ts'), 'export function load() {}');
    fs.writeFileSync(path.join(srcDir, 'style.css'), 'body {}');

    const files = await scanFiles(tmpDir, { ignore: { files: [] } });

    expect(files.map((f) => path.basename(f))).toContain('+page.svelte');
    expect(files.map((f) => path.basename(f))).toContain('+page.server.ts');
    expect(files.map((f) => path.basename(f))).not.toContain('style.css');

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('respects ignore.files config', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'svelte-doctor-test-'));
    const srcDir = path.join(tmpDir, 'src', 'lib');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'utils.ts'), 'export const x = 1;');
    fs.writeFileSync(path.join(srcDir, 'utils.test.ts'), 'test()');

    const files = await scanFiles(tmpDir, { ignore: { files: ['**/*.test.ts'] } });

    expect(files.map((f) => path.basename(f))).toContain('utils.ts');
    expect(files.map((f) => path.basename(f))).not.toContain('utils.test.ts');

    fs.rmSync(tmpDir, { recursive: true });
  });
});
