import { parseSync } from 'oxc-parser';

export interface ParsedTypeScript {
  program: any;
  errors: any[];
  module: any;
}

export function parseTypeScript(source: string, filename: string): ParsedTypeScript {
  const result = parseSync(filename, source);
  return {
    program: result.program,
    errors: result.errors,
    module: result.module,
  };
}
