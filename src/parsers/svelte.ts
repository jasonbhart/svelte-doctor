import { createRequire } from 'node:module';
import * as path from 'node:path';
import { parse as defaultParse } from 'svelte/compiler';

let resolvedParse: ((source: string, options?: any) => any) | null = null;
let resolvedProjectRoot: string | null = null;

/**
 * Set the project root so that the Svelte compiler is resolved from
 * the target project's node_modules rather than svelte-doctor's own.
 * Call once before scanning. If the target project's svelte/compiler
 * cannot be found, falls back to the bundled version.
 */
export function setSvelteCompilerRoot(projectRoot: string): void {
  if (resolvedProjectRoot === projectRoot && resolvedParse) return;

  try {
    const req = createRequire(path.join(projectRoot, 'package.json'));
    const compiler = req('svelte/compiler');
    resolvedParse = compiler.parse;
    resolvedProjectRoot = projectRoot;
  } catch {
    // Fall back to our own dependency
    resolvedParse = defaultParse;
    resolvedProjectRoot = projectRoot;
  }
}

export function parseSvelte(source: string, filename: string): any | null {
  const parse = resolvedParse ?? defaultParse;
  try {
    return parse(source, { modern: true, filename });
  } catch {
    return null;
  }
}
