import { parse } from 'svelte/compiler';

export function parseSvelte(source: string, filename: string): any | null {
  try {
    return parse(source, { modern: true, filename });
  } catch {
    return null;
  }
}
