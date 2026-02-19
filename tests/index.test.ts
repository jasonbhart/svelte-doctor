import { describe, it, expect } from 'vitest';
import { diagnose } from '../src/index.js';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

describe('diagnose API', () => {
  it('returns a score and diagnostics for a project with issues', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'svelte-doctor-api-'));
    const routeDir = path.join(tmpDir, 'src', 'routes');
    fs.mkdirSync(routeDir, { recursive: true });

    // Write a component with a legacy pattern
    fs.writeFileSync(
      path.join(routeDir, '+page.svelte'),
      '<script>\n  export let name;\n</script>\n<p>{name}</p>'
    );

    const result = await diagnose(tmpDir);

    expect(result.filesScanned).toBe(1);
    expect(result.diagnostics.length).toBe(1);
    expect(result.score.score).toBeLessThan(100);

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('returns perfect score for clean code', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'svelte-doctor-api-'));
    const routeDir = path.join(tmpDir, 'src', 'routes');
    fs.mkdirSync(routeDir, { recursive: true });

    fs.writeFileSync(
      path.join(routeDir, '+page.svelte'),
      '<script>\n  let { name } = $props();\n</script>\n<p>{name}</p>'
    );

    const result = await diagnose(tmpDir);

    expect(result.score.score).toBe(100);
    expect(result.diagnostics).toHaveLength(0);

    fs.rmSync(tmpDir, { recursive: true });
  });
});
