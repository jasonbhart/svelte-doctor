# Svelte Doctor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a deterministic CLI diagnostic tool that scans Svelte 5 / SvelteKit codebases for legacy patterns, architectural violations, and performance anti-patterns, producing a 0-100 health score with actionable diagnostics.

**Architecture:** Monolithic CLI with a four-stage pipeline: File Scanner (fast-glob) -> Parser (svelte/compiler for .svelte, oxc-parser for .ts/.js) -> Rule Engine (estree-walker, 22 rules) -> Reporter/Fixer. Each file is classified by its SvelteKit routing role (FileRole) to determine which rules apply.

**Tech Stack:** TypeScript, commander, svelte/compiler, oxc-parser, estree-walker, magic-string, fast-glob, picocolors, ora, vitest, tsdown

**PRD Reference:** `docs/plans/2026-02-18-svelte-doctor-prd.md`

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`

**Step 1: Initialize package.json**

```json
{
  "name": "svelte-doctor",
  "version": "0.0.1",
  "description": "Diagnose and fix Svelte 5 anti-patterns in your codebase",
  "type": "module",
  "bin": {
    "svelte-doctor": "./dist/cli.js"
  },
  "exports": {
    ".": {
      "types": "./dist/cli.d.ts",
      "default": "./dist/cli.js"
    },
    "./api": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "dev": "tsdown --watch",
    "build": "rm -rf dist && NODE_ENV=production tsdown",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "commander": "^14.0.0",
    "estree-walker": "^3.0.3",
    "fast-glob": "^3.3.0",
    "magic-string": "^0.30.0",
    "ora": "^8.0.0",
    "oxc-parser": "^0.112.0",
    "picocolors": "^1.1.0"
  },
  "devDependencies": {
    "svelte": "^5.0.0",
    "tsdown": "^0.20.0",
    "typescript": "^5.5.0",
    "vitest": "^3.0.0"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "license": "MIT"
}
```

Note: `svelte` is a devDependency for testing only. At runtime, svelte-doctor resolves the compiler from the target project's `node_modules/`.

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
  },
});
```

**Step 4: Create .gitignore**

```
node_modules/
dist/
*.tgz
```

**Step 5: Install dependencies**

Run: `npm install`
Expected: Clean install, no errors.

**Step 6: Verify test runner works**

Create a smoke test file `tests/smoke.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

describe('smoke test', () => {
  it('works', () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run: `npx vitest run`
Expected: 1 test passes.

**Step 7: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts .gitignore tests/smoke.test.ts package-lock.json
git commit -m "feat: scaffold project with dependencies and build config"
```

---

### Task 2: Shared Types

**Files:**
- Create: `src/types.ts`

**Step 1: Write the types file**

This is the single source of truth for all interfaces used across the codebase. Reference: PRD sections 5.1 and 5.2.

```typescript
export type FileRole =
  | 'svelte-component'
  | 'page-server'
  | 'layout-server'
  | 'server-endpoint'
  | 'page-client'
  | 'layout-client'
  | 'lib-server'
  | 'lib-client'
  | 'config';

export interface ClassifiedFile {
  filePath: string;
  role: FileRole;
}

export interface RuleContext {
  filePath: string;
  fileRole: FileRole;
  source: string;
  report: (info: { node: any; message: string }) => void;
}

export interface Rule {
  id: string;
  severity: 'error' | 'warning';
  applicableTo: FileRole[];
  description: string;
  agentPrompt: string;
  analyze: (ast: any, context: RuleContext) => void;
  fix?: (source: string, diagnostic: Diagnostic) => string | null;
}

export interface Diagnostic {
  ruleId: string;
  severity: 'error' | 'warning';
  filePath: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  message: string;
  agentInstruction: string;
  fixable: boolean;
  codeSnippet?: string;
}

export interface ScoreResult {
  score: number;
  label: 'Excellent' | 'Good' | 'Needs Work' | 'Critical';
}

export interface DiagnoseResult {
  score: ScoreResult;
  diagnostics: Diagnostic[];
  filesScanned: number;
}

export interface SvelteDoctorConfig {
  ignore?: {
    rules?: string[];
    files?: string[];
  };
  verbose?: boolean;
  diff?: boolean | string;
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add shared type definitions"
```

---

### Task 3: Config Loader

**Files:**
- Create: `src/config.ts`
- Create: `tests/config.test.ts`

**Step 1: Write the failing test**

```typescript
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
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/config.test.ts`
Expected: FAIL — cannot resolve `../src/config.js`

**Step 3: Write minimal implementation**

```typescript
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
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/config.test.ts`
Expected: All 4 tests pass.

**Step 5: Commit**

```bash
git add src/config.ts tests/config.test.ts
git commit -m "feat: add config loader with config file + package.json support"
```

---

### Task 4: File Scanner + Classifier

**Files:**
- Create: `src/scanner.ts`
- Create: `src/classifier.ts`
- Create: `tests/scanner.test.ts`
- Create: `tests/classifier.test.ts`

**Step 1: Write classifier tests**

The classifier is pure logic (path pattern matching) so it's easy to test without fixtures.

```typescript
import { describe, it, expect } from 'vitest';
import { classifyFile } from '../src/classifier.js';

describe('classifyFile', () => {
  it('classifies .svelte files as svelte-component', () => {
    expect(classifyFile('src/routes/+page.svelte')).toBe('svelte-component');
    expect(classifyFile('src/lib/Button.svelte')).toBe('svelte-component');
  });

  it('classifies +page.server.ts as page-server', () => {
    expect(classifyFile('src/routes/+page.server.ts')).toBe('page-server');
    expect(classifyFile('src/routes/about/+page.server.js')).toBe('page-server');
  });

  it('classifies +layout.server.ts as layout-server', () => {
    expect(classifyFile('src/routes/+layout.server.ts')).toBe('layout-server');
  });

  it('classifies +server.ts as server-endpoint', () => {
    expect(classifyFile('src/routes/api/users/+server.ts')).toBe('server-endpoint');
  });

  it('classifies +page.ts as page-client', () => {
    expect(classifyFile('src/routes/+page.ts')).toBe('page-client');
  });

  it('classifies +layout.ts as layout-client', () => {
    expect(classifyFile('src/routes/+layout.ts')).toBe('layout-client');
  });

  it('classifies src/lib/server/** as lib-server', () => {
    expect(classifyFile('src/lib/server/db.ts')).toBe('lib-server');
  });

  it('classifies *.server.ts in src/lib as lib-server', () => {
    expect(classifyFile('src/lib/auth.server.ts')).toBe('lib-server');
  });

  it('classifies other src/lib files as lib-client', () => {
    expect(classifyFile('src/lib/utils.ts')).toBe('lib-client');
  });

  it('classifies svelte.config.js as config', () => {
    expect(classifyFile('svelte.config.js')).toBe('config');
    expect(classifyFile('vite.config.ts')).toBe('config');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/classifier.test.ts`
Expected: FAIL — cannot resolve `../src/classifier.js`

**Step 3: Implement classifier**

```typescript
import type { FileRole } from './types.js';

const CONFIG_FILES = ['svelte.config.js', 'svelte.config.ts', 'vite.config.js', 'vite.config.ts'];

export function classifyFile(filePath: string): FileRole {
  const normalized = filePath.replace(/\\/g, '/');
  const basename = normalized.split('/').pop() ?? '';

  // Config files
  if (CONFIG_FILES.some((c) => basename === c)) {
    return 'config';
  }

  // Svelte components
  if (normalized.endsWith('.svelte')) {
    return 'svelte-component';
  }

  // SvelteKit routing files (order matters: more specific first)
  if (/\+page\.server\.[tj]s$/.test(basename)) return 'page-server';
  if (/\+layout\.server\.[tj]s$/.test(basename)) return 'layout-server';
  if (/\+server\.[tj]s$/.test(basename)) return 'server-endpoint';
  if (/\+page\.[tj]s$/.test(basename)) return 'page-client';
  if (/\+layout\.[tj]s$/.test(basename)) return 'layout-client';

  // Library server files
  if (normalized.includes('/lib/server/') || /\.server\.[tj]s$/.test(basename)) {
    return 'lib-server';
  }

  // Everything else in src/lib or elsewhere
  return 'lib-client';
}
```

**Step 4: Run classifier tests**

Run: `npx vitest run tests/classifier.test.ts`
Expected: All 10 tests pass.

**Step 5: Write scanner tests**

Create test fixtures directory structure for scanner tests.

```typescript
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
```

**Step 6: Implement scanner**

```typescript
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
```

**Step 7: Run all tests**

Run: `npx vitest run`
Expected: All tests pass (smoke + config + classifier + scanner).

**Step 8: Commit**

```bash
git add src/scanner.ts src/classifier.ts tests/scanner.test.ts tests/classifier.test.ts
git commit -m "feat: add file scanner and SvelteKit role classifier"
```

---

### Task 5: Parsers

**Files:**
- Create: `src/parsers/svelte.ts`
- Create: `src/parsers/typescript.ts`
- Create: `tests/parsers/svelte.test.ts`
- Create: `tests/parsers/typescript.test.ts`
- Create: `tests/fixtures/simple-component.svelte`
- Create: `tests/fixtures/simple-module.ts`

**Step 1: Create test fixtures**

`tests/fixtures/simple-component.svelte`:
```svelte
<script>
  let count = $state(0);
  let doubled = $derived(count * 2);
</script>

<button onclick={() => count++}>
  {count} * 2 = {doubled}
</button>
```

`tests/fixtures/simple-module.ts`:
```typescript
export async function load() {
  const data = await fetch('/api/data');
  return { data };
}
```

**Step 2: Write Svelte parser test**

```typescript
import { describe, it, expect } from 'vitest';
import { parseSvelte } from '../../src/parsers/svelte.js';
import * as path from 'node:path';
import * as fs from 'node:fs';

describe('parseSvelte', () => {
  it('parses a valid Svelte 5 component', () => {
    const fixturePath = path.join(__dirname, '../fixtures/simple-component.svelte');
    const source = fs.readFileSync(fixturePath, 'utf-8');
    const ast = parseSvelte(source, fixturePath);

    expect(ast).toBeDefined();
    expect(ast.type).toBe('Root');
    expect(ast.fragment).toBeDefined();
    expect(ast.instance).toBeDefined();
  });

  it('returns null for unparseable content', () => {
    const ast = parseSvelte('<<<invalid>>>', 'bad.svelte');
    expect(ast).toBeNull();
  });
});
```

**Step 3: Implement Svelte parser**

The parser uses the `svelte/compiler` installed as a devDependency for testing. In production, it resolves from the target project. For now, import directly since tests use the local devDependency.

```typescript
import { parse } from 'svelte/compiler';

export function parseSvelte(source: string, filename: string): any | null {
  try {
    return parse(source, { modern: true, filename });
  } catch {
    return null;
  }
}
```

**Step 4: Run Svelte parser test**

Run: `npx vitest run tests/parsers/svelte.test.ts`
Expected: Both tests pass.

**Step 5: Write TypeScript parser test**

```typescript
import { describe, it, expect } from 'vitest';
import { parseTypeScript } from '../../src/parsers/typescript.js';
import * as path from 'node:path';
import * as fs from 'node:fs';

describe('parseTypeScript', () => {
  it('parses a valid TypeScript file', () => {
    const fixturePath = path.join(__dirname, '../fixtures/simple-module.ts');
    const source = fs.readFileSync(fixturePath, 'utf-8');
    const result = parseTypeScript(source, fixturePath);

    expect(result).toBeDefined();
    expect(result.program).toBeDefined();
    expect(result.program.type).toBe('Program');
    expect(result.errors).toHaveLength(0);
  });

  it('parses JavaScript files as well', () => {
    const source = 'const x = 1;';
    const result = parseTypeScript(source, 'test.js');

    expect(result).toBeDefined();
    expect(result.program.body.length).toBeGreaterThan(0);
  });
});
```

**Step 6: Implement TypeScript parser**

```typescript
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
```

**Step 7: Run all parser tests**

Run: `npx vitest run tests/parsers/`
Expected: All 4 tests pass.

**Step 8: Commit**

```bash
git add src/parsers/ tests/parsers/ tests/fixtures/simple-component.svelte tests/fixtures/simple-module.ts
git commit -m "feat: add Svelte and TypeScript parsers"
```

---

### Task 6: Scorer + Engine

**Files:**
- Create: `src/scorer.ts`
- Create: `src/engine.ts`
- Create: `tests/scorer.test.ts`
- Create: `tests/engine.test.ts`

**Step 1: Write scorer tests**

```typescript
import { describe, it, expect } from 'vitest';
import { computeScore } from '../src/scorer.js';
import type { Diagnostic } from '../src/types.js';

function makeDiag(severity: 'error' | 'warning'): Diagnostic {
  return {
    ruleId: 'test',
    severity,
    filePath: 'test.svelte',
    line: 1,
    column: 1,
    message: 'test',
    agentInstruction: 'test',
    fixable: false,
  };
}

describe('computeScore', () => {
  it('returns 100 for no diagnostics', () => {
    const result = computeScore([]);
    expect(result.score).toBe(100);
    expect(result.label).toBe('Excellent');
  });

  it('deducts 3 per error', () => {
    const result = computeScore([makeDiag('error'), makeDiag('error')]);
    expect(result.score).toBe(94);
  });

  it('deducts 1 per warning', () => {
    const result = computeScore([makeDiag('warning'), makeDiag('warning'), makeDiag('warning')]);
    expect(result.score).toBe(97);
  });

  it('clamps to 0 minimum', () => {
    const errors = Array.from({ length: 50 }, () => makeDiag('error'));
    const result = computeScore(errors);
    expect(result.score).toBe(0);
    expect(result.label).toBe('Critical');
  });

  it('labels correctly at boundaries', () => {
    // 75 = Good (100 - (8 errors * 3) - (1 warning * 1) = 100 - 24 - 1 = 75)
    const diags = [
      ...Array.from({ length: 8 }, () => makeDiag('error')),
      makeDiag('warning'),
    ];
    expect(computeScore(diags).label).toBe('Good');
  });
});
```

**Step 2: Implement scorer**

```typescript
import type { Diagnostic, ScoreResult } from './types.js';

export function computeScore(diagnostics: Diagnostic[]): ScoreResult {
  const errors = diagnostics.filter((d) => d.severity === 'error').length;
  const warnings = diagnostics.filter((d) => d.severity === 'warning').length;

  const raw = 100 - errors * 3 - warnings * 1;
  const score = Math.max(0, Math.min(100, raw));

  let label: ScoreResult['label'];
  if (score >= 90) label = 'Excellent';
  else if (score >= 75) label = 'Good';
  else if (score >= 50) label = 'Needs Work';
  else label = 'Critical';

  return { score, label };
}
```

**Step 3: Run scorer tests**

Run: `npx vitest run tests/scorer.test.ts`
Expected: All 5 tests pass.

**Step 4: Write engine tests**

The engine orchestrates: parse file -> run applicable rules -> collect diagnostics. Test with a minimal rule stub.

```typescript
import { describe, it, expect } from 'vitest';
import { analyzeFile } from '../src/engine.js';
import type { Rule } from '../src/types.js';

const mockRule: Rule = {
  id: 'test-rule',
  severity: 'error',
  applicableTo: ['svelte-component'],
  description: 'Test rule',
  agentPrompt: 'Fix it',
  analyze: (ast, context) => {
    // Always report one issue for testing
    context.report({ node: { start: 0, end: 1 }, message: 'test violation' });
  },
};

const mockRuleWrongRole: Rule = {
  id: 'wrong-role',
  severity: 'warning',
  applicableTo: ['page-server'],
  description: 'Should not run on components',
  agentPrompt: 'N/A',
  analyze: (_ast, context) => {
    context.report({ node: { start: 0, end: 1 }, message: 'should not appear' });
  },
};

describe('analyzeFile', () => {
  it('runs applicable rules and collects diagnostics', () => {
    const source = '<script>let x = 1;</script><p>hi</p>';
    const diagnostics = analyzeFile({
      filePath: 'src/routes/+page.svelte',
      fileRole: 'svelte-component',
      source,
      rules: [mockRule],
    });

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].ruleId).toBe('test-rule');
    expect(diagnostics[0].message).toBe('test violation');
  });

  it('skips rules that do not apply to the file role', () => {
    const source = '<script>let x = 1;</script><p>hi</p>';
    const diagnostics = analyzeFile({
      filePath: 'src/routes/+page.svelte',
      fileRole: 'svelte-component',
      source,
      rules: [mockRuleWrongRole],
    });

    expect(diagnostics).toHaveLength(0);
  });
});
```

**Step 5: Implement engine**

```typescript
import { parseSvelte } from './parsers/svelte.js';
import { parseTypeScript } from './parsers/typescript.js';
import type { Rule, Diagnostic, FileRole } from './types.js';

interface AnalyzeFileOptions {
  filePath: string;
  fileRole: FileRole;
  source: string;
  rules: Rule[];
}

export function analyzeFile(options: AnalyzeFileOptions): Diagnostic[] {
  const { filePath, fileRole, source, rules } = options;
  const diagnostics: Diagnostic[] = [];

  // Filter rules applicable to this file role
  const applicableRules = rules.filter((r) => r.applicableTo.includes(fileRole));
  if (applicableRules.length === 0) return diagnostics;

  // Parse the file
  let ast: any;
  if (fileRole === 'svelte-component') {
    ast = parseSvelte(source, filePath);
  } else {
    const result = parseTypeScript(source, filePath);
    ast = result.program;
  }

  if (!ast) return diagnostics;

  // Run each applicable rule
  for (const rule of applicableRules) {
    const context = {
      filePath,
      fileRole,
      source,
      report: (info: { node: any; message: string }) => {
        const line = info.node.loc?.start?.line ?? info.node.start ?? 1;
        const column = info.node.loc?.start?.column ?? 0;

        diagnostics.push({
          ruleId: rule.id,
          severity: rule.severity,
          filePath,
          line: typeof line === 'number' && line > 0 ? line : 1,
          column: typeof column === 'number' ? column : 0,
          message: info.message,
          agentInstruction: rule.agentPrompt,
          fixable: typeof rule.fix === 'function',
        });
      },
    };

    rule.analyze(ast, context);
  }

  return diagnostics;
}
```

**Step 6: Run all tests**

Run: `npx vitest run`
Expected: All tests pass.

**Step 7: Commit**

```bash
git add src/scorer.ts src/engine.ts tests/scorer.test.ts tests/engine.test.ts
git commit -m "feat: add scoring algorithm and rule engine"
```

---

### Task 7: Rule — sv-no-export-let

**Files:**
- Create: `src/rules/sv-no-export-let.ts`
- Create: `tests/rules/sv-no-export-let.test.ts`
- Create: `tests/fixtures/legacy-props.svelte`
- Create: `tests/fixtures/clean-runes.svelte`

**Step 1: Create test fixtures**

`tests/fixtures/legacy-props.svelte`:
```svelte
<script>
  export let name;
  export let count = 0;
</script>

<p>{name}: {count}</p>
```

`tests/fixtures/clean-runes.svelte`:
```svelte
<script>
  let { name, count = 0 } = $props();
  let doubled = $derived(count * 2);
</script>

<p>{name}: {doubled}</p>
```

**Step 2: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { svNoExportLet } from '../../src/rules/sv-no-export-let.js';
import { analyzeFile } from '../../src/engine.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

function analyzeFixture(fixtureName: string) {
  const fixturePath = path.join(__dirname, '../fixtures', fixtureName);
  const source = fs.readFileSync(fixturePath, 'utf-8');
  return analyzeFile({
    filePath: fixturePath,
    fileRole: 'svelte-component',
    source,
    rules: [svNoExportLet],
  });
}

describe('sv-no-export-let', () => {
  it('flags export let declarations', () => {
    const diagnostics = analyzeFixture('legacy-props.svelte');
    const propIssues = diagnostics.filter((d) => d.message.includes('export let'));
    expect(propIssues.length).toBeGreaterThanOrEqual(1);
  });

  it('passes clean Svelte 5 runes code', () => {
    const diagnostics = analyzeFixture('clean-runes.svelte');
    expect(diagnostics).toHaveLength(0);
  });

  it('has correct metadata', () => {
    expect(svNoExportLet.id).toBe('sv-no-export-let');
    expect(svNoExportLet.severity).toBe('error');
    expect(svNoExportLet.applicableTo).toContain('svelte-component');
  });
});
```

**Step 3: Run test to verify it fails**

Run: `npx vitest run tests/rules/sv-no-export-let.test.ts`
Expected: FAIL — cannot resolve rule module.

**Step 4: Implement the rule**

```typescript
import { walk } from 'estree-walker';
import type { Rule } from '../types.js';

export const svNoExportLet: Rule = {
  id: 'sv-no-export-let',
  severity: 'error',
  applicableTo: ['svelte-component'],
  description: 'Flags legacy Svelte 4 export let props.',
  agentPrompt:
    'This is Svelte 5. Replace all `export let` props with a single `let { ...props } = $props()` destructuring.',
  analyze: (ast, context) => {
    if (!ast.instance) return;

    walk(ast.instance.content, {
      enter(node: any) {
        // Detect: export let prop
        if (
          node.type === 'ExportNamedDeclaration' &&
          node.declaration?.type === 'VariableDeclaration' &&
          node.declaration.kind === 'let'
        ) {
          context.report({
            node,
            message:
              'Legacy Svelte 4 `export let` prop detected. Use `let { prop } = $props()` instead.',
          });
        }
      },
    });
  },
};
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run tests/rules/sv-no-export-let.test.ts`
Expected: All 3 tests pass.

**Step 6: Commit**

```bash
git add src/rules/sv-no-export-let.ts tests/rules/sv-no-export-let.test.ts tests/fixtures/legacy-props.svelte tests/fixtures/clean-runes.svelte
git commit -m "feat: add sv-no-export-let rule (detects legacy export let props)"
```

---

### Task 8: Rule — sv-no-effect-state-mutation

**Files:**
- Create: `src/rules/sv-no-effect-state-mutation.ts`
- Create: `tests/rules/sv-no-effect-state-mutation.test.ts`
- Create: `tests/fixtures/effect-mutation.svelte`
- Create: `tests/fixtures/clean-effect.svelte`

**Step 1: Create test fixtures**

`tests/fixtures/effect-mutation.svelte`:
```svelte
<script>
  let count = $state(0);
  let doubled = $state(0);

  $effect(() => {
    doubled = count * 2;
  });
</script>

<p>{doubled}</p>
```

`tests/fixtures/clean-effect.svelte`:
```svelte
<script>
  let count = $state(0);
  let doubled = $derived(count * 2);

  $effect(() => {
    console.log('count changed:', count);
  });
</script>

<p>{doubled}</p>
```

**Step 2: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { svNoEffectStateMutation } from '../../src/rules/sv-no-effect-state-mutation.js';
import { analyzeFile } from '../../src/engine.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

function analyzeFixture(fixtureName: string) {
  const fixturePath = path.join(__dirname, '../fixtures', fixtureName);
  const source = fs.readFileSync(fixturePath, 'utf-8');
  return analyzeFile({
    filePath: fixturePath,
    fileRole: 'svelte-component',
    source,
    rules: [svNoEffectStateMutation],
  });
}

describe('sv-no-effect-state-mutation', () => {
  it('flags $state mutation inside $effect', () => {
    const diagnostics = analyzeFixture('effect-mutation.svelte');
    expect(diagnostics.length).toBeGreaterThanOrEqual(1);
    expect(diagnostics[0].message).toContain('$state');
    expect(diagnostics[0].message).toContain('$effect');
  });

  it('passes clean effect usage (no state mutation)', () => {
    const diagnostics = analyzeFixture('clean-effect.svelte');
    expect(diagnostics).toHaveLength(0);
  });

  it('is not fixable', () => {
    expect(svNoEffectStateMutation.fix).toBeUndefined();
  });
});
```

**Step 3: Run test to verify it fails**

Run: `npx vitest run tests/rules/sv-no-effect-state-mutation.test.ts`
Expected: FAIL

**Step 4: Implement the rule**

The detection strategy:
1. Collect all variable names initialized with `$state()`.
2. Find all `$effect()` call expressions.
3. Walk each `$effect` callback body for `AssignmentExpression` where the left-hand side is one of the `$state` variables.

```typescript
import { walk } from 'estree-walker';
import type { Rule } from '../types.js';

export const svNoEffectStateMutation: Rule = {
  id: 'sv-no-effect-state-mutation',
  severity: 'error',
  applicableTo: ['svelte-component'],
  description: 'Flags $state variables mutated inside $effect() (infinite re-render risk).',
  agentPrompt:
    'Do NOT mutate `$state` variables inside `$effect()`. Use `$derived()` instead. If mutation is truly necessary, wrap in `untrack(() => { ... })`.',
  analyze: (ast, context) => {
    if (!ast.instance) return;

    // Step 1: Collect $state variable names
    const stateVars = new Set<string>();
    walk(ast.instance.content, {
      enter(node: any) {
        if (
          node.type === 'VariableDeclaration' &&
          node.declarations
        ) {
          for (const decl of node.declarations) {
            if (
              decl.init?.type === 'CallExpression' &&
              decl.init.callee?.name === '$state' &&
              decl.id?.type === 'Identifier'
            ) {
              stateVars.add(decl.id.name);
            }
          }
        }
      },
    });

    if (stateVars.size === 0) return;

    // Step 2: Find $effect() calls and check for state mutation
    walk(ast.instance.content, {
      enter(node: any) {
        if (
          node.type === 'ExpressionStatement' &&
          node.expression?.type === 'CallExpression' &&
          node.expression.callee?.name === '$effect' &&
          node.expression.arguments?.[0]
        ) {
          const effectBody = node.expression.arguments[0];

          // Walk the effect callback body
          walk(effectBody, {
            enter(inner: any) {
              if (
                inner.type === 'AssignmentExpression' &&
                inner.left?.type === 'Identifier' &&
                stateVars.has(inner.left.name)
              ) {
                context.report({
                  node: inner,
                  message: `\`$state\` variable \`${inner.left.name}\` is mutated inside \`$effect()\`. This can cause infinite re-renders. Use \`$derived()\` instead.`,
                });
              }
            },
          });
        }
      },
    });
  },
};
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run tests/rules/sv-no-effect-state-mutation.test.ts`
Expected: All 3 tests pass.

**Step 6: Commit**

```bash
git add src/rules/sv-no-effect-state-mutation.ts tests/rules/sv-no-effect-state-mutation.test.ts tests/fixtures/effect-mutation.svelte tests/fixtures/clean-effect.svelte
git commit -m "feat: add sv-no-effect-state-mutation rule"
```

---

### Task 9: Rule — sv-prefer-snippets

**Files:**
- Create: `src/rules/sv-prefer-snippets.ts`
- Create: `tests/rules/sv-prefer-snippets.test.ts`
- Create: `tests/fixtures/legacy-slot.svelte`
- Create: `tests/fixtures/clean-snippet.svelte`

**Step 1: Create test fixtures**

`tests/fixtures/legacy-slot.svelte`:
```svelte
<script>
  let { title } = $props();
</script>

<div>
  <h1>{title}</h1>
  <slot />
  <slot name="footer" />
</div>
```

`tests/fixtures/clean-snippet.svelte`:
```svelte
<script>
  let { title, children, footer } = $props();
</script>

<div>
  <h1>{title}</h1>
  {@render children?.()}
  {@render footer?.()}
</div>
```

**Step 2: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { svPreferSnippets } from '../../src/rules/sv-prefer-snippets.js';
import { analyzeFile } from '../../src/engine.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

function analyzeFixture(fixtureName: string) {
  const fixturePath = path.join(__dirname, '../fixtures', fixtureName);
  const source = fs.readFileSync(fixturePath, 'utf-8');
  return analyzeFile({
    filePath: fixturePath,
    fileRole: 'svelte-component',
    source,
    rules: [svPreferSnippets],
  });
}

describe('sv-prefer-snippets', () => {
  it('flags <slot> elements', () => {
    const diagnostics = analyzeFixture('legacy-slot.svelte');
    expect(diagnostics.length).toBe(2); // default slot + named slot
  });

  it('passes clean snippet usage', () => {
    const diagnostics = analyzeFixture('clean-snippet.svelte');
    expect(diagnostics).toHaveLength(0);
  });
});
```

**Step 3: Run test to verify it fails**

Run: `npx vitest run tests/rules/sv-prefer-snippets.test.ts`
Expected: FAIL

**Step 4: Implement the rule**

Walk the template AST (`ast.fragment`) looking for `SlotElement` nodes.

```typescript
import { walk } from 'estree-walker';
import type { Rule } from '../types.js';

export const svPreferSnippets: Rule = {
  id: 'sv-prefer-snippets',
  severity: 'warning',
  applicableTo: ['svelte-component'],
  description: 'Flags legacy <slot> usage. Use {#snippet} and {@render} instead.',
  agentPrompt:
    'Svelte 5 replaces `<slot>` with snippets. Use `{@render children?.()}` for default slot. Declare snippet props via `$props()`: `let { children, header } = $props();`',
  analyze: (ast, context) => {
    if (!ast.fragment) return;

    walk(ast.fragment, {
      enter(node: any) {
        if (node.type === 'SlotElement') {
          const slotName = node.attributes?.find(
            (a: any) => a.type === 'Attribute' && a.name === 'name'
          );
          const name = slotName
            ? (slotName.value?.[0]?.data ?? 'named')
            : 'default';

          context.report({
            node,
            message: `Legacy \`<slot${name !== 'default' ? ` name="${name}"` : ''}>\` detected. Use \`{@render ${name === 'default' ? 'children' : name}?.()}\` instead.`,
          });
        }
      },
    });
  },
};
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run tests/rules/sv-prefer-snippets.test.ts`
Expected: All 2 tests pass.

**Step 6: Commit**

```bash
git add src/rules/sv-prefer-snippets.ts tests/rules/sv-prefer-snippets.test.ts tests/fixtures/legacy-slot.svelte tests/fixtures/clean-snippet.svelte
git commit -m "feat: add sv-prefer-snippets rule (detects legacy <slot>)"
```

---

### Task 10: Rule — sv-no-event-dispatcher

**Files:**
- Create: `src/rules/sv-no-event-dispatcher.ts`
- Create: `tests/rules/sv-no-event-dispatcher.test.ts`
- Create: `tests/fixtures/legacy-dispatcher.svelte`
- Create: `tests/fixtures/clean-callback-props.svelte`

**Step 1: Create test fixtures**

`tests/fixtures/legacy-dispatcher.svelte`:
```svelte
<script>
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();

  function handleClick() {
    dispatch('submit', { value: 42 });
  }
</script>

<button on:click={handleClick}>Submit</button>
```

`tests/fixtures/clean-callback-props.svelte`:
```svelte
<script>
  let { onsubmit } = $props();

  function handleClick() {
    onsubmit?.({ value: 42 });
  }
</script>

<button onclick={handleClick}>Submit</button>
```

**Step 2: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { svNoEventDispatcher } from '../../src/rules/sv-no-event-dispatcher.js';
import { analyzeFile } from '../../src/engine.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

function analyzeFixture(fixtureName: string) {
  const fixturePath = path.join(__dirname, '../fixtures', fixtureName);
  const source = fs.readFileSync(fixturePath, 'utf-8');
  return analyzeFile({
    filePath: fixturePath,
    fileRole: 'svelte-component',
    source,
    rules: [svNoEventDispatcher],
  });
}

describe('sv-no-event-dispatcher', () => {
  it('flags createEventDispatcher import', () => {
    const diagnostics = analyzeFixture('legacy-dispatcher.svelte');
    expect(diagnostics.length).toBeGreaterThanOrEqual(1);
    expect(diagnostics[0].message).toContain('createEventDispatcher');
  });

  it('passes callback prop pattern', () => {
    const diagnostics = analyzeFixture('clean-callback-props.svelte');
    expect(diagnostics).toHaveLength(0);
  });
});
```

**Step 3: Run test to verify it fails**

Run: `npx vitest run tests/rules/sv-no-event-dispatcher.test.ts`
Expected: FAIL

**Step 4: Implement the rule**

```typescript
import { walk } from 'estree-walker';
import type { Rule } from '../types.js';

export const svNoEventDispatcher: Rule = {
  id: 'sv-no-event-dispatcher',
  severity: 'error',
  applicableTo: ['svelte-component'],
  description: 'Flags createEventDispatcher usage. Use callback props instead.',
  agentPrompt:
    'Svelte 5 removes `createEventDispatcher`. Pass callback functions as props instead. Replace `dispatch(\'submit\', data)` with `onsubmit?.(data)` where `let { onsubmit } = $props();`',
  analyze: (ast, context) => {
    if (!ast.instance) return;

    walk(ast.instance.content, {
      enter(node: any) {
        // Detect import of createEventDispatcher
        if (
          node.type === 'ImportDeclaration' &&
          node.source?.value === 'svelte'
        ) {
          const hasDispatcher = node.specifiers?.some(
            (s: any) =>
              (s.type === 'ImportSpecifier' && s.imported?.name === 'createEventDispatcher')
          );
          if (hasDispatcher) {
            context.report({
              node,
              message:
                'Legacy `createEventDispatcher` import detected. Use callback props via `$props()` instead.',
            });
          }
        }

        // Detect createEventDispatcher() call
        if (
          node.type === 'VariableDeclarator' &&
          node.init?.type === 'CallExpression' &&
          node.init.callee?.name === 'createEventDispatcher'
        ) {
          context.report({
            node,
            message:
              '`createEventDispatcher()` is deprecated in Svelte 5. Pass callback functions as props instead.',
          });
        }
      },
    });
  },
};
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run tests/rules/sv-no-event-dispatcher.test.ts`
Expected: All 2 tests pass.

**Step 6: Commit**

```bash
git add src/rules/sv-no-event-dispatcher.ts tests/rules/sv-no-event-dispatcher.test.ts tests/fixtures/legacy-dispatcher.svelte tests/fixtures/clean-callback-props.svelte
git commit -m "feat: add sv-no-event-dispatcher rule"
```

---

### Task 11: Rule — sv-require-native-events

**Files:**
- Create: `src/rules/sv-require-native-events.ts`
- Create: `tests/rules/sv-require-native-events.test.ts`
- Create: `tests/fixtures/legacy-events.svelte`
- Create: `tests/fixtures/clean-events.svelte`

**Step 1: Create test fixtures**

`tests/fixtures/legacy-events.svelte`:
```svelte
<script>
  function handleClick() { console.log('clicked'); }
  function handleKey(e) { console.log(e.key); }
</script>

<button on:click={handleClick}>Click</button>
<input on:keydown={handleKey} />
```

`tests/fixtures/clean-events.svelte`:
```svelte
<script>
  function handleClick() { console.log('clicked'); }
  function handleKey(e) { console.log(e.key); }
</script>

<button onclick={handleClick}>Click</button>
<input onkeydown={handleKey} />
```

**Step 2: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { svRequireNativeEvents } from '../../src/rules/sv-require-native-events.js';
import { analyzeFile } from '../../src/engine.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

function analyzeFixture(fixtureName: string) {
  const fixturePath = path.join(__dirname, '../fixtures', fixtureName);
  const source = fs.readFileSync(fixturePath, 'utf-8');
  return analyzeFile({
    filePath: fixturePath,
    fileRole: 'svelte-component',
    source,
    rules: [svRequireNativeEvents],
  });
}

describe('sv-require-native-events', () => {
  it('flags on:click directive syntax', () => {
    const diagnostics = analyzeFixture('legacy-events.svelte');
    expect(diagnostics.length).toBe(2); // on:click + on:keydown
    expect(diagnostics[0].message).toContain('on:');
  });

  it('passes modern onclick syntax', () => {
    const diagnostics = analyzeFixture('clean-events.svelte');
    expect(diagnostics).toHaveLength(0);
  });
});
```

**Step 3: Run test to verify it fails**

Run: `npx vitest run tests/rules/sv-require-native-events.test.ts`
Expected: FAIL

**Step 4: Implement the rule**

Walk the template AST looking for `OnDirective` nodes.

```typescript
import { walk } from 'estree-walker';
import type { Rule } from '../types.js';

export const svRequireNativeEvents: Rule = {
  id: 'sv-require-native-events',
  severity: 'warning',
  applicableTo: ['svelte-component'],
  description: 'Flags on:event directive syntax. Use onevent attributes instead.',
  agentPrompt:
    'Svelte 5 uses standard HTML event attributes. Replace `on:click={handler}` with `onclick={handler}`. For modifiers like `|preventDefault`, call `event.preventDefault()` inside the handler.',
  analyze: (ast, context) => {
    if (!ast.fragment) return;

    walk(ast.fragment, {
      enter(node: any) {
        if (node.type === 'OnDirective') {
          context.report({
            node,
            message: `Legacy \`on:${node.name}\` directive detected. Use \`on${node.name}={handler}\` instead.`,
          });
        }
      },
    });
  },
};
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run tests/rules/sv-require-native-events.test.ts`
Expected: All 2 tests pass.

**Step 6: Commit**

```bash
git add src/rules/sv-require-native-events.ts tests/rules/sv-require-native-events.test.ts tests/fixtures/legacy-events.svelte tests/fixtures/clean-events.svelte
git commit -m "feat: add sv-require-native-events rule (on:click -> onclick)"
```

---

### Task 12: Rules — kit-no-shared-server-state + kit-server-only-secrets

**Files:**
- Create: `src/rules/kit-no-shared-server-state.ts`
- Create: `src/rules/kit-server-only-secrets.ts`
- Create: `tests/rules/kit-no-shared-server-state.test.ts`
- Create: `tests/rules/kit-server-only-secrets.test.ts`
- Create: `tests/fixtures/shared-server-state.ts`
- Create: `tests/fixtures/clean-server.ts`
- Create: `tests/fixtures/private-env-leak.svelte`
- Create: `tests/fixtures/public-env.svelte`

**Step 1: Create test fixtures**

`tests/fixtures/shared-server-state.ts`:
```typescript
let cache = new Map();
let requestCount = 0;

export async function load({ params }) {
  requestCount++;
  if (cache.has(params.id)) {
    return cache.get(params.id);
  }
  const data = await fetch(`/api/${params.id}`);
  cache.set(params.id, data);
  return data;
}
```

`tests/fixtures/clean-server.ts`:
```typescript
const API_VERSION = 'v2';

export async function load({ params, locals }) {
  let requestData = null;
  requestData = await fetch(`/api/${API_VERSION}/${params.id}`);
  return requestData;
}
```

`tests/fixtures/private-env-leak.svelte`:
```svelte
<script>
  import { API_SECRET } from '$env/static/private';
  import { PUBLIC_URL } from '$env/static/public';
</script>

<p>URL: {PUBLIC_URL}</p>
```

`tests/fixtures/public-env.svelte`:
```svelte
<script>
  import { PUBLIC_URL } from '$env/static/public';
</script>

<p>URL: {PUBLIC_URL}</p>
```

**Step 2: Write failing tests**

`tests/rules/kit-no-shared-server-state.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { kitNoSharedServerState } from '../../src/rules/kit-no-shared-server-state.js';
import { analyzeFile } from '../../src/engine.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

function analyzeFixture(fixtureName: string, fileRole: 'page-server' | 'server-endpoint') {
  const fixturePath = path.join(__dirname, '../fixtures', fixtureName);
  const source = fs.readFileSync(fixturePath, 'utf-8');
  return analyzeFile({
    filePath: fixturePath,
    fileRole,
    source,
    rules: [kitNoSharedServerState],
  });
}

describe('kit-no-shared-server-state', () => {
  it('flags module-level let declarations in server files', () => {
    const diagnostics = analyzeFixture('shared-server-state.ts', 'page-server');
    expect(diagnostics.length).toBe(2); // cache + requestCount
    expect(diagnostics[0].message).toContain('module-level');
  });

  it('passes const declarations and function-scoped let', () => {
    const diagnostics = analyzeFixture('clean-server.ts', 'page-server');
    expect(diagnostics).toHaveLength(0);
  });
});
```

`tests/rules/kit-server-only-secrets.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { kitServerOnlySecrets } from '../../src/rules/kit-server-only-secrets.js';
import { analyzeFile } from '../../src/engine.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

function analyzeFixture(fixtureName: string) {
  const fixturePath = path.join(__dirname, '../fixtures', fixtureName);
  const source = fs.readFileSync(fixturePath, 'utf-8');
  return analyzeFile({
    filePath: fixturePath,
    fileRole: 'svelte-component',
    source,
    rules: [kitServerOnlySecrets],
  });
}

describe('kit-server-only-secrets', () => {
  it('flags $env/static/private import in client files', () => {
    const diagnostics = analyzeFixture('private-env-leak.svelte');
    expect(diagnostics.length).toBe(1);
    expect(diagnostics[0].message).toContain('$env/static/private');
  });

  it('passes $env/static/public imports', () => {
    const diagnostics = analyzeFixture('public-env.svelte');
    expect(diagnostics).toHaveLength(0);
  });
});
```

**Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/rules/kit-no-shared-server-state.test.ts tests/rules/kit-server-only-secrets.test.ts`
Expected: FAIL

**Step 4: Implement kit-no-shared-server-state**

This rule operates on TS/JS ASTs (from oxc-parser), not Svelte ASTs.

```typescript
import { walk } from 'estree-walker';
import type { Rule } from '../types.js';

export const kitNoSharedServerState: Rule = {
  id: 'kit-no-shared-server-state',
  severity: 'error',
  applicableTo: ['page-server', 'layout-server', 'server-endpoint'],
  description: 'Flags mutable module-level state in server files (cross-request data leak).',
  agentPrompt:
    'CRITICAL: Module-level `let` in server files creates shared mutable state across all requests. Move per-request state to `event.locals` or inside the function body.',
  analyze: (ast, context) => {
    // ast is oxc-parser Program — walk top-level body only
    if (!ast.body) return;

    for (const node of ast.body) {
      if (node.type === 'VariableDeclaration' && node.kind === 'let') {
        for (const decl of node.declarations) {
          const name = decl.id?.name ?? 'unknown';
          context.report({
            node,
            message: `Module-level \`let ${name}\` in server file creates shared mutable state across all requests. Move to \`event.locals\` or inside the handler function.`,
          });
        }
      }
    }
  },
};
```

**Step 5: Implement kit-server-only-secrets**

This rule checks Svelte components and client-side TS files for private env imports. For Svelte files, it walks `ast.instance.content`. For TS files, it walks `ast.body`.

```typescript
import { walk } from 'estree-walker';
import type { Rule } from '../types.js';

const PRIVATE_ENV_MODULES = ['$env/static/private', '$env/dynamic/private'];

export const kitServerOnlySecrets: Rule = {
  id: 'kit-server-only-secrets',
  severity: 'error',
  applicableTo: ['svelte-component', 'page-client', 'layout-client', 'lib-client'],
  description: 'Flags private env variable imports in client-accessible files.',
  agentPrompt:
    'Private environment variables (`$env/static/private`, `$env/dynamic/private`) can ONLY be imported in server-side files. Use `$env/static/public` or `$env/dynamic/public` for client access.',
  analyze: (ast, context) => {
    // Determine which AST node to walk
    const root = ast.instance?.content ?? ast;

    walk(root, {
      enter(node: any) {
        if (
          node.type === 'ImportDeclaration' &&
          PRIVATE_ENV_MODULES.includes(node.source?.value)
        ) {
          context.report({
            node,
            message: `\`${node.source.value}\` imported in client-accessible file. Private env vars can only be used in server files (+page.server.ts, +server.ts, src/lib/server/).`,
          });
        }
      },
    });
  },
};
```

**Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/rules/kit-no-shared-server-state.test.ts tests/rules/kit-server-only-secrets.test.ts`
Expected: All 4 tests pass.

**Step 7: Commit**

```bash
git add src/rules/kit-no-shared-server-state.ts src/rules/kit-server-only-secrets.ts tests/rules/ tests/fixtures/shared-server-state.ts tests/fixtures/clean-server.ts tests/fixtures/private-env-leak.svelte tests/fixtures/public-env.svelte
git commit -m "feat: add SvelteKit boundary rules (shared state + env secrets)"
```

---

### Task 13: Rules — kit-require-use-enhance + perf-no-load-waterfalls

**Files:**
- Create: `src/rules/kit-require-use-enhance.ts`
- Create: `src/rules/perf-no-load-waterfalls.ts`
- Create: `tests/rules/kit-require-use-enhance.test.ts`
- Create: `tests/rules/perf-no-load-waterfalls.test.ts`
- Create: `tests/fixtures/form-no-enhance.svelte`
- Create: `tests/fixtures/form-with-enhance.svelte`
- Create: `tests/fixtures/load-waterfall.ts`
- Create: `tests/fixtures/load-parallel.ts`

**Step 1: Create test fixtures**

`tests/fixtures/form-no-enhance.svelte`:
```svelte
<script>
  let { data } = $props();
</script>

<form method="POST">
  <input name="email" type="email" />
  <button type="submit">Submit</button>
</form>
```

`tests/fixtures/form-with-enhance.svelte`:
```svelte
<script>
  import { enhance } from '$app/forms';
  let { data } = $props();
</script>

<form method="POST" use:enhance>
  <input name="email" type="email" />
  <button type="submit">Submit</button>
</form>
```

`tests/fixtures/load-waterfall.ts`:
```typescript
export async function load({ fetch }) {
  const users = await fetch('/api/users');
  const posts = await fetch('/api/posts');
  return { users, posts };
}
```

`tests/fixtures/load-parallel.ts`:
```typescript
export async function load({ fetch }) {
  const [users, posts] = await Promise.all([
    fetch('/api/users'),
    fetch('/api/posts'),
  ]);
  return { users, posts };
}
```

**Step 2: Write failing tests**

`tests/rules/kit-require-use-enhance.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { kitRequireUseEnhance } from '../../src/rules/kit-require-use-enhance.js';
import { analyzeFile } from '../../src/engine.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

function analyzeFixture(fixtureName: string) {
  const fixturePath = path.join(__dirname, '../fixtures', fixtureName);
  const source = fs.readFileSync(fixturePath, 'utf-8');
  return analyzeFile({
    filePath: fixturePath,
    fileRole: 'svelte-component',
    source,
    rules: [kitRequireUseEnhance],
  });
}

describe('kit-require-use-enhance', () => {
  it('flags POST form without use:enhance', () => {
    const diagnostics = analyzeFixture('form-no-enhance.svelte');
    expect(diagnostics.length).toBe(1);
    expect(diagnostics[0].message).toContain('use:enhance');
  });

  it('passes form with use:enhance', () => {
    const diagnostics = analyzeFixture('form-with-enhance.svelte');
    expect(diagnostics).toHaveLength(0);
  });
});
```

`tests/rules/perf-no-load-waterfalls.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { perfNoLoadWaterfalls } from '../../src/rules/perf-no-load-waterfalls.js';
import { analyzeFile } from '../../src/engine.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

function analyzeFixture(fixtureName: string) {
  const fixturePath = path.join(__dirname, '../fixtures', fixtureName);
  const source = fs.readFileSync(fixturePath, 'utf-8');
  return analyzeFile({
    filePath: fixturePath,
    fileRole: 'page-server',
    source,
    rules: [perfNoLoadWaterfalls],
  });
}

describe('perf-no-load-waterfalls', () => {
  it('flags sequential independent awaits in load()', () => {
    const diagnostics = analyzeFixture('load-waterfall.ts');
    expect(diagnostics.length).toBeGreaterThanOrEqual(1);
    expect(diagnostics[0].message).toContain('waterfall');
  });

  it('passes Promise.all pattern', () => {
    const diagnostics = analyzeFixture('load-parallel.ts');
    expect(diagnostics).toHaveLength(0);
  });
});
```

**Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/rules/kit-require-use-enhance.test.ts tests/rules/perf-no-load-waterfalls.test.ts`
Expected: FAIL

**Step 4: Implement kit-require-use-enhance**

Walk the Svelte template AST looking for `RegularElement` nodes with `name === 'form'`. Check if it has a `method="POST"` attribute and a `use:enhance` directive.

```typescript
import { walk } from 'estree-walker';
import type { Rule } from '../types.js';

export const kitRequireUseEnhance: Rule = {
  id: 'kit-require-use-enhance',
  severity: 'warning',
  applicableTo: ['svelte-component'],
  description: 'Flags POST forms without use:enhance for progressive enhancement.',
  agentPrompt:
    'SvelteKit forms with `method="POST"` should use `use:enhance` for progressive enhancement. Add `use:enhance` to the form and import `enhance` from `\'$app/forms\'`.',
  analyze: (ast, context) => {
    if (!ast.fragment) return;

    walk(ast.fragment, {
      enter(node: any) {
        if (node.type === 'RegularElement' && node.name === 'form') {
          const methodAttr = node.attributes?.find(
            (a: any) =>
              a.type === 'Attribute' &&
              a.name === 'method' &&
              a.value?.[0]?.data?.toUpperCase() === 'POST'
          );

          if (!methodAttr) return;

          const hasEnhance = node.attributes?.some(
            (a: any) => a.type === 'UseDirective' && a.name === 'enhance'
          );

          if (!hasEnhance) {
            context.report({
              node,
              message:
                'POST form is missing `use:enhance`. Add it for progressive enhancement.',
            });
          }
        }
      },
    });
  },
};
```

**Step 5: Implement perf-no-load-waterfalls**

Walk the TS AST looking for the exported `load` function. Then check for consecutive `await` expressions in its body where the second does not reference variables from the first.

```typescript
import { walk } from 'estree-walker';
import type { Rule } from '../types.js';

export const perfNoLoadWaterfalls: Rule = {
  id: 'perf-no-load-waterfalls',
  severity: 'warning',
  applicableTo: ['page-server', 'layout-server', 'page-client', 'layout-client'],
  description: 'Detects sequential independent await calls in load() that could be parallelized.',
  agentPrompt:
    'These `await` calls appear independent and could run in parallel. Use `Promise.all()`: `const [a, b] = await Promise.all([fetchA(), fetchB()]);`',
  analyze: (ast, context) => {
    if (!ast.body) return;

    // Find the exported load function
    let loadBody: any[] | null = null;

    for (const node of ast.body) {
      if (
        node.type === 'ExportNamedDeclaration' &&
        node.declaration?.type === 'FunctionDeclaration' &&
        node.declaration.id?.name === 'load' &&
        node.declaration.async
      ) {
        loadBody = node.declaration.body?.body ?? null;
        break;
      }
    }

    if (!loadBody) return;

    // Collect top-level await statements
    const awaitStatements: { node: any; declaredNames: Set<string>; referencedNames: Set<string> }[] = [];

    for (const stmt of loadBody) {
      if (stmt.type === 'VariableDeclaration') {
        for (const decl of stmt.declarations) {
          if (decl.init?.type === 'AwaitExpression') {
            const declaredNames = new Set<string>();
            const referencedNames = new Set<string>();

            // Collect declared variable names
            if (decl.id?.type === 'Identifier') {
              declaredNames.add(decl.id.name);
            }

            // Collect referenced identifiers in the await expression
            walk(decl.init, {
              enter(n: any) {
                if (n.type === 'Identifier') {
                  referencedNames.add(n.name);
                }
              },
            });

            awaitStatements.push({ node: stmt, declaredNames, referencedNames });
          }
        }
      }
    }

    // Check consecutive pairs for independence
    for (let i = 1; i < awaitStatements.length; i++) {
      const prev = awaitStatements[i - 1];
      const curr = awaitStatements[i];

      // If current references nothing declared by previous, they're independent
      const isDependent = [...curr.referencedNames].some((name) =>
        prev.declaredNames.has(name)
      );

      if (!isDependent) {
        context.report({
          node: curr.node,
          message:
            'Potential waterfall: this `await` appears independent from the previous one. Consider `Promise.all()` for parallel execution.',
        });
      }
    }
  },
};
```

**Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/rules/kit-require-use-enhance.test.ts tests/rules/perf-no-load-waterfalls.test.ts`
Expected: All 4 tests pass.

**Step 7: Commit**

```bash
git add src/rules/kit-require-use-enhance.ts src/rules/perf-no-load-waterfalls.ts tests/rules/ tests/fixtures/form-no-enhance.svelte tests/fixtures/form-with-enhance.svelte tests/fixtures/load-waterfall.ts tests/fixtures/load-parallel.ts
git commit -m "feat: add kit-require-use-enhance and perf-no-load-waterfalls rules"
```

---

### Task 14: Rule Registry

**Note:** This task initially creates the registry with the first 10 rules (Tasks 7-13). After Tasks 23-28 are completed, this registry MUST be updated to import and export all 22 rules.

**Files:**
- Create: `src/rules/index.ts`
- Modify: `tests/engine.test.ts` — add integration test with real rules

**Step 1: Create the rule registry**

Initially with rules from Tasks 7-13 only. After all rule tasks are complete, update to include all 22 rules:

```typescript
// Rules from Tasks 7-13
import { svNoExportLet } from './sv-no-export-let.js';
import { svNoEffectStateMutation } from './sv-no-effect-state-mutation.js';
import { svPreferSnippets } from './sv-prefer-snippets.js';
import { svNoEventDispatcher } from './sv-no-event-dispatcher.js';
import { svRequireNativeEvents } from './sv-require-native-events.js';
import { kitNoSharedServerState } from './kit-no-shared-server-state.js';
import { kitServerOnlySecrets } from './kit-server-only-secrets.js';
import { kitRequireUseEnhance } from './kit-require-use-enhance.js';
import { perfNoLoadWaterfalls } from './perf-no-load-waterfalls.js';
// Rules from Task 23
import { svNoReactiveStatements } from './sv-no-reactive-statements.js';
// Rules from Task 24
import { svNoEventModifiers } from './sv-no-event-modifiers.js';
import { svNoComponentConstructor } from './sv-no-component-constructor.js';
// Rules from Task 25
import { svPreferDerivedOverEffect } from './sv-prefer-derived-over-effect.js';
import { svNoStaleDerivedLet } from './sv-no-stale-derived-let.js';
// Rules from Task 26
import { svRequireBindableRune } from './sv-require-bindable-rune.js';
import { svReactivityLossPrimitive } from './sv-reactivity-loss-primitive.js';
// Rules from Task 27
import { svNoMagicProps } from './sv-no-magic-props.js';
import { svRequireSnippetInvocation } from './sv-require-snippet-invocation.js';
import { svNoSvelteComponent } from './sv-no-svelte-component.js';
// Rules from Task 28
import { kitNoGotoInServer } from './kit-no-goto-in-server.js';
import { perfPreferStateRaw } from './perf-prefer-state-raw.js';
import { perfNoFunctionDerived } from './perf-no-function-derived.js';
import type { Rule } from '../types.js';

export const allRules: Rule[] = [
  // Migration rules (sv-*)
  svNoExportLet,
  svNoReactiveStatements,
  svNoEffectStateMutation,
  svPreferSnippets,
  svNoEventDispatcher,
  svRequireNativeEvents,
  svNoEventModifiers,
  svNoComponentConstructor,
  svPreferDerivedOverEffect,
  svNoStaleDerivedLet,
  svRequireBindableRune,
  svReactivityLossPrimitive,
  svNoMagicProps,
  svRequireSnippetInvocation,
  svNoSvelteComponent,
  // SvelteKit rules (kit-*)
  kitNoSharedServerState,
  kitServerOnlySecrets,
  kitRequireUseEnhance,
  kitNoGotoInServer,
  // Performance rules (perf-*)
  perfNoLoadWaterfalls,
  perfPreferStateRaw,
  perfNoFunctionDerived,
];

export {
  svNoExportLet,
  svNoReactiveStatements,
  svNoEffectStateMutation,
  svPreferSnippets,
  svNoEventDispatcher,
  svRequireNativeEvents,
  svNoEventModifiers,
  svNoComponentConstructor,
  svPreferDerivedOverEffect,
  svNoStaleDerivedLet,
  svRequireBindableRune,
  svReactivityLossPrimitive,
  svNoMagicProps,
  svRequireSnippetInvocation,
  svNoSvelteComponent,
  kitNoSharedServerState,
  kitServerOnlySecrets,
  kitRequireUseEnhance,
  kitNoGotoInServer,
  perfNoLoadWaterfalls,
  perfPreferStateRaw,
  perfNoFunctionDerived,
};
```

**Step 2: Verify all tests still pass**

Run: `npx vitest run`
Expected: All tests pass.

**Step 3: Commit**

```bash
git add src/rules/index.ts
git commit -m "feat: add rule registry exporting all 22 rules"
```

---

### Task 15: Terminal Reporter

**Files:**
- Create: `src/reporters/terminal.ts`
- Create: `tests/reporters/terminal.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { formatTerminalReport } from '../../src/reporters/terminal.js';
import type { Diagnostic, ScoreResult } from '../../src/types.js';

describe('formatTerminalReport', () => {
  it('formats a report with diagnostics', () => {
    const diagnostics: Diagnostic[] = [
      {
        ruleId: 'sv-no-export-let',
        severity: 'error',
        filePath: 'src/routes/+page.svelte',
        line: 3,
        column: 2,
        message: 'Legacy export let detected',
        agentInstruction: 'Use $props()',
        fixable: true,
      },
    ];
    const score: ScoreResult = { score: 97, label: 'Excellent' };
    const output = formatTerminalReport(diagnostics, score, 10, false);

    expect(output).toContain('97');
    expect(output).toContain('sv-no-export-let');
    expect(output).toContain('1 issue');
  });

  it('shows file details in verbose mode', () => {
    const diagnostics: Diagnostic[] = [
      {
        ruleId: 'sv-no-export-let',
        severity: 'error',
        filePath: 'src/routes/+page.svelte',
        line: 3,
        column: 2,
        message: 'Legacy export let detected',
        agentInstruction: 'Use $props()',
        fixable: true,
      },
    ];
    const score: ScoreResult = { score: 97, label: 'Excellent' };
    const output = formatTerminalReport(diagnostics, score, 10, true);

    expect(output).toContain('src/routes/+page.svelte');
    expect(output).toContain(':3');
  });

  it('handles zero diagnostics', () => {
    const score: ScoreResult = { score: 100, label: 'Excellent' };
    const output = formatTerminalReport([], score, 5, false);

    expect(output).toContain('100');
    expect(output).toContain('No issues');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/reporters/terminal.test.ts`
Expected: FAIL

**Step 3: Implement terminal reporter**

```typescript
import pc from 'picocolors';
import type { Diagnostic, ScoreResult } from '../types.js';

export function formatTerminalReport(
  diagnostics: Diagnostic[],
  score: ScoreResult,
  filesScanned: number,
  verbose: boolean
): string {
  const lines: string[] = [];

  // Header
  lines.push('');
  lines.push(pc.bold('  svelte-doctor'));
  lines.push('');

  // Score
  const scoreColor =
    score.score >= 90 ? pc.green : score.score >= 75 ? pc.yellow : pc.red;
  lines.push(`  Score: ${scoreColor(pc.bold(String(score.score)))} / 100 (${score.label})`);
  lines.push(`  Files scanned: ${filesScanned}`);
  lines.push('');

  if (diagnostics.length === 0) {
    lines.push(pc.green('  No issues found!'));
    lines.push('');
    return lines.join('\n');
  }

  // Group by rule
  const byRule = new Map<string, Diagnostic[]>();
  for (const d of diagnostics) {
    const existing = byRule.get(d.ruleId) ?? [];
    existing.push(d);
    byRule.set(d.ruleId, existing);
  }

  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
  const warningCount = diagnostics.filter((d) => d.severity === 'warning').length;

  lines.push(
    `  ${diagnostics.length} issue${diagnostics.length !== 1 ? 's' : ''} found: ${errorCount} error${errorCount !== 1 ? 's' : ''}, ${warningCount} warning${warningCount !== 1 ? 's' : ''}`
  );
  lines.push('');

  for (const [ruleId, ruleDiags] of byRule) {
    const severity = ruleDiags[0].severity;
    const icon = severity === 'error' ? pc.red('x') : pc.yellow('!');
    const fixable = ruleDiags[0].fixable ? pc.dim(' (fixable)') : '';

    lines.push(`  ${icon} ${pc.bold(ruleId)} (${ruleDiags.length})${fixable}`);

    if (verbose) {
      for (const d of ruleDiags) {
        lines.push(pc.dim(`    ${d.filePath}:${d.line} - ${d.message}`));
      }
    }

    lines.push('');
  }

  return lines.join('\n');
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/reporters/terminal.test.ts`
Expected: All 3 tests pass.

**Step 5: Commit**

```bash
git add src/reporters/terminal.ts tests/reporters/terminal.test.ts
git commit -m "feat: add terminal reporter with verbose mode"
```

---

### Task 16: Agent Reporter (XML)

**Files:**
- Create: `src/reporters/agent.ts`
- Create: `tests/reporters/agent.test.ts`

**Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { formatAgentReport } from '../../src/reporters/agent.js';
import type { Diagnostic, ScoreResult } from '../../src/types.js';

describe('formatAgentReport', () => {
  it('produces valid XML with diagnostics', () => {
    const diagnostics: Diagnostic[] = [
      {
        ruleId: 'sv-no-export-let',
        severity: 'error',
        filePath: 'src/routes/+page.svelte',
        line: 3,
        column: 2,
        message: 'Legacy export let detected',
        agentInstruction: 'Use $props() rune instead',
        fixable: true,
        codeSnippet: 'export let name;',
      },
    ];
    const score: ScoreResult = { score: 97, label: 'Excellent' };
    const output = formatAgentReport(diagnostics, score, 10);

    expect(output).toContain('<svelte-doctor-report');
    expect(output).toContain('score="97"');
    expect(output).toContain('label="Excellent"');
    expect(output).toContain('<issue');
    expect(output).toContain('rule="sv-no-export-let"');
    expect(output).toContain('<agent-instruction>');
    expect(output).toContain('Use $props() rune instead');
    expect(output).toContain('</svelte-doctor-report>');
  });

  it('produces valid XML with no diagnostics', () => {
    const score: ScoreResult = { score: 100, label: 'Excellent' };
    const output = formatAgentReport([], score, 5);

    expect(output).toContain('issues="0"');
    expect(output).not.toContain('<issue');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/reporters/agent.test.ts`
Expected: FAIL

**Step 3: Implement agent reporter**

```typescript
import type { Diagnostic, ScoreResult } from '../types.js';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function formatAgentReport(
  diagnostics: Diagnostic[],
  score: ScoreResult,
  filesScanned: number
): string {
  const lines: string[] = [];

  lines.push(
    `<svelte-doctor-report score="${score.score}" label="${score.label}" files-scanned="${filesScanned}" issues="${diagnostics.length}">`
  );

  for (const d of diagnostics) {
    lines.push(
      `  <issue rule="${escapeXml(d.ruleId)}" file="${escapeXml(d.filePath)}" severity="${d.severity}" line="${d.line}" fixable="${d.fixable}">`
    );
    lines.push(`    <description>${escapeXml(d.message)}</description>`);

    if (d.codeSnippet) {
      lines.push(`    <code-snippet>${escapeXml(d.codeSnippet)}</code-snippet>`);
    }

    lines.push(`    <agent-instruction>${escapeXml(d.agentInstruction)}</agent-instruction>`);
    lines.push('  </issue>');
  }

  lines.push('</svelte-doctor-report>');

  return lines.join('\n');
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/reporters/agent.test.ts`
Expected: All 2 tests pass.

**Step 5: Commit**

```bash
git add src/reporters/agent.ts tests/reporters/agent.test.ts
git commit -m "feat: add agent XML reporter for LLM consumption"
```

---

### Task 17: Fixer Engine

**Files:**
- Create: `src/fixer.ts`
- Create: `tests/fixer.test.ts`

**Step 1: Write the failing test**

Test the fixer with the `sv-no-export-let` rule's fix function. The fixer collects all fixable diagnostics and applies their rule's `fix()` function.

```typescript
import { describe, it, expect } from 'vitest';
import { applyFixes } from '../src/fixer.js';
import type { Diagnostic, Rule } from '../src/types.js';

describe('applyFixes', () => {
  it('applies a simple string replacement fix', () => {
    const source = '<script>\n  export let name;\n</script>\n<p>{name}</p>';
    const diagnostics: Diagnostic[] = [
      {
        ruleId: 'test-fix',
        severity: 'error',
        filePath: 'test.svelte',
        line: 2,
        column: 2,
        message: 'test',
        agentInstruction: 'test',
        fixable: true,
      },
    ];
    const rules: Rule[] = [
      {
        id: 'test-fix',
        severity: 'error',
        applicableTo: ['svelte-component'],
        description: 'test',
        agentPrompt: 'test',
        analyze: () => {},
        fix: (src, _diag) => {
          return src.replace('export let name;', 'let { name } = $props();');
        },
      },
    ];

    const result = applyFixes(source, diagnostics, rules);
    expect(result).toContain('let { name } = $props();');
    expect(result).not.toContain('export let');
  });

  it('returns original source if no fixes apply', () => {
    const source = '<script>let x = 1;</script>';
    const result = applyFixes(source, [], []);
    expect(result).toBe(source);
  });

  it('skips non-fixable diagnostics', () => {
    const source = '<script>let x = 1;</script>';
    const diagnostics: Diagnostic[] = [
      {
        ruleId: 'no-fix',
        severity: 'error',
        filePath: 'test.svelte',
        line: 1,
        column: 1,
        message: 'test',
        agentInstruction: 'test',
        fixable: false,
      },
    ];
    const result = applyFixes(source, diagnostics, []);
    expect(result).toBe(source);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/fixer.test.ts`
Expected: FAIL

**Step 3: Implement fixer**

The fixer applies rule `fix()` functions sequentially. Each fix receives the current source and returns the modified source (or null to skip).

```typescript
import type { Diagnostic, Rule } from './types.js';

export function applyFixes(
  source: string,
  diagnostics: Diagnostic[],
  rules: Rule[]
): string {
  const fixableDiags = diagnostics.filter((d) => d.fixable);
  if (fixableDiags.length === 0) return source;

  const ruleMap = new Map(rules.map((r) => [r.id, r]));
  let result = source;

  // Group by rule to apply each rule's fix once (rules may fix multiple instances)
  const byRule = new Map<string, Diagnostic[]>();
  for (const d of fixableDiags) {
    const existing = byRule.get(d.ruleId) ?? [];
    existing.push(d);
    byRule.set(d.ruleId, existing);
  }

  for (const [ruleId, ruleDiags] of byRule) {
    const rule = ruleMap.get(ruleId);
    if (!rule?.fix) continue;

    for (const diag of ruleDiags) {
      const fixed = rule.fix(result, diag);
      if (fixed !== null) {
        result = fixed;
      }
    }
  }

  return result;
}
```

**Step 4: Run test to verify it passes**

Run: `npx vitest run tests/fixer.test.ts`
Expected: All 3 tests pass.

**Step 5: Commit**

```bash
git add src/fixer.ts tests/fixer.test.ts
git commit -m "feat: add fixer engine for auto-fix pipeline"
```

---

### Task 18: CLI Entry Point + Node.js API

**Files:**
- Create: `src/cli.ts`
- Create: `src/index.ts`
- Create: `tests/index.test.ts`

**Step 1: Implement the Node.js API (index.ts)**

This is the `diagnose()` function that the CLI and external consumers use.

```typescript
import { scanFiles } from './scanner.js';
import { classifyFile } from './classifier.js';
import { analyzeFile } from './engine.js';
import { computeScore } from './scorer.js';
import { loadConfig } from './config.js';
import { allRules } from './rules/index.js';
import { applyFixes } from './fixer.js';
import type { DiagnoseResult, SvelteDoctorConfig } from './types.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface DiagnoseOptions {
  fix?: boolean;
  config?: SvelteDoctorConfig;
  ignoreRules?: string[];
}

export async function diagnose(
  projectRoot: string,
  options: DiagnoseOptions = {}
): Promise<DiagnoseResult> {
  const resolvedRoot = path.resolve(projectRoot);
  const config = options.config ?? loadConfig(resolvedRoot);

  // Merge ignored rules from config and options
  const ignoredRules = new Set([
    ...(config.ignore?.rules ?? []),
    ...(options.ignoreRules ?? []),
  ]);

  const rules = allRules.filter((r) => !ignoredRules.has(r.id));

  // Scan files
  const filePaths = await scanFiles(resolvedRoot, config);

  // Analyze each file
  const allDiagnostics = [];

  for (const filePath of filePaths) {
    const relativePath = path.relative(resolvedRoot, filePath);
    const fileRole = classifyFile(relativePath);
    const source = fs.readFileSync(filePath, 'utf-8');

    const diagnostics = analyzeFile({
      filePath: relativePath,
      fileRole,
      source,
      rules,
    });

    // Apply fixes if requested
    if (options.fix && diagnostics.some((d) => d.fixable)) {
      const fixed = applyFixes(source, diagnostics, rules);
      if (fixed !== source) {
        fs.writeFileSync(filePath, fixed, 'utf-8');
      }
    }

    allDiagnostics.push(...diagnostics);
  }

  const score = computeScore(allDiagnostics);

  return {
    score,
    diagnostics: allDiagnostics,
    filesScanned: filePaths.length,
  };
}
```

**Step 2: Implement the CLI (cli.ts)**

```typescript
#!/usr/bin/env node
import { program } from 'commander';
import ora from 'ora';
import { diagnose } from './index.js';
import { formatTerminalReport } from './reporters/terminal.js';
import { formatAgentReport } from './reporters/agent.js';

program
  .name('svelte-doctor')
  .description('Diagnose and fix Svelte 5 anti-patterns in your codebase')
  .version('0.0.1')
  .argument('[directory]', 'Directory to scan', '.')
  .option('--verbose', 'Show file details per rule')
  .option('--score', 'Output only the score')
  .option('--agent', 'Output structured XML for LLM consumption')
  .option('--fix', 'Auto-fix all fixable issues')
  .option('--diff [base]', 'Scan only changed files vs base branch')
  .option('-y, --yes', 'Skip prompts')
  .action(async (directory, options) => {
    const spinner = ora('Scanning...').start();

    try {
      const result = await diagnose(directory, {
        fix: options.fix,
      });

      spinner.stop();

      if (options.score) {
        console.log(result.score.score);
        process.exit(result.score.score >= 75 ? 0 : 1);
        return;
      }

      if (options.agent) {
        console.log(
          formatAgentReport(result.diagnostics, result.score, result.filesScanned)
        );
        process.exit(result.score.score >= 75 ? 0 : 1);
        return;
      }

      console.log(
        formatTerminalReport(
          result.diagnostics,
          result.score,
          result.filesScanned,
          options.verbose ?? false
        )
      );

      process.exit(result.score.score >= 75 ? 0 : 1);
    } catch (error: any) {
      spinner.fail(error.message);
      process.exit(1);
    }
  });

program.parse();
```

**Step 3: Write a basic API test**

```typescript
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
    expect(result.diagnostics.length).toBeGreaterThan(0);
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
```

**Step 4: Run all tests**

Run: `npx vitest run`
Expected: All tests pass.

**Step 5: Verify CLI works**

Run: `npx tsc --noEmit` to check types.
Then: `npx tsdown` to build.
Then: `node dist/cli.js --help` to verify CLI boots.

**Step 6: Commit**

```bash
git add src/cli.ts src/index.ts tests/index.test.ts
git commit -m "feat: add CLI entry point and Node.js diagnose API"
```

---

### Task 19: Init Command

**Files:**
- Create: `src/init.ts`
- Create: `tests/init.test.ts`
- Modify: `src/cli.ts` — add `init` subcommand

**Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { generateCursorRules, generateClaudeSkill } from '../src/init.js';

describe('init', () => {
  it('generates .cursorrules content', () => {
    const content = generateCursorRules();
    expect(content).toContain('Svelte 5');
    expect(content).toContain('$props()');
    expect(content).toContain('$derived');
    expect(content).toContain('$state');
    expect(content).toContain('event.locals');
  });

  it('generates Claude Code skill content', () => {
    const content = generateClaudeSkill();
    expect(content).toContain('svelte-doctor');
    expect(content).toContain('npx svelte-doctor');
    expect(content).toContain('--agent');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/init.test.ts`
Expected: FAIL

**Step 3: Implement init module**

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';

export function generateCursorRules(): string {
  return `# Svelte 5 / SvelteKit Project Rules

## CRITICAL: This is a Svelte 5 (Runes) project

### Reactivity
- Use \`$state()\` for reactive state, NOT \`let x = value\`
- Use \`$derived()\` for computed values, NOT \`$: x = computed\`
- Use \`$effect()\` for side effects, NOT \`$: { sideEffect() }\`
- Use \`$props()\` for component props: \`let { prop1, prop2 = default } = $props();\`
- NEVER use \`export let\` for props
- NEVER use \`$:\` reactive labels
- NEVER mutate \`$state\` inside \`$effect()\` — use \`$derived()\` instead

### Events
- Use \`onclick={handler}\`, NOT \`on:click={handler}\`
- NEVER use \`createEventDispatcher\` — pass callback props instead
- For event modifiers, call methods inside handler (e.g., \`event.preventDefault()\`)

### Slots / Snippets
- Use \`{@render children?.()}\`, NOT \`<slot />\`
- Declare snippet props via \`$props()\`: \`let { children, header } = $props();\`

### SvelteKit Boundaries
- NEVER use \`let\` at module scope in +page.server.ts/+server.ts (causes cross-request data leaks)
- NEVER import \`$env/static/private\` in client files — use \`$env/static/public\`
- Use \`event.locals\` for per-request server state
- Always add \`use:enhance\` to POST forms

### Diagnostics
Run \`npx svelte-doctor . --verbose\` to check for violations.
`;
}

export function generateClaudeSkill(): string {
  return `---
name: svelte-doctor
description: Diagnose and fix Svelte 5 anti-patterns. Run before writing or modifying Svelte/SvelteKit code.
---

# Svelte Doctor Skill

## When to Use
- Before writing new Svelte components
- After modifying existing Svelte/SvelteKit code
- When debugging unexpected Svelte behavior

## Usage

### Scan the project
\`\`\`bash
npx svelte-doctor . --agent
\`\`\`

### Interpret results
- Parse the XML output for \`<issue>\` elements
- Follow each \`<agent-instruction>\` to fix violations
- Re-run after fixes to verify score improvement

### Auto-fix
\`\`\`bash
npx svelte-doctor . --fix
\`\`\`

## Key Svelte 5 Rules
- Props: \`let { prop } = $props();\` (NOT \`export let prop\`)
- Derived: \`let x = $derived(expr);\` (NOT \`$: x = expr\`)
- Events: \`onclick={fn}\` (NOT \`on:click={fn}\`)
- Slots: \`{@render children?.()}\` (NOT \`<slot />\`)
- No \`createEventDispatcher\` — use callback props
- No \`$state\` mutation inside \`$effect()\`
`;
}

export function runInit(projectRoot: string): void {
  const resolvedRoot = path.resolve(projectRoot);

  // Write .cursorrules
  const cursorRulesPath = path.join(resolvedRoot, '.cursorrules');
  fs.writeFileSync(cursorRulesPath, generateCursorRules(), 'utf-8');
  console.log(`  Created ${cursorRulesPath}`);

  // Write .windsurfrules (same content)
  const windsurfRulesPath = path.join(resolvedRoot, '.windsurfrules');
  fs.writeFileSync(windsurfRulesPath, generateCursorRules(), 'utf-8');
  console.log(`  Created ${windsurfRulesPath}`);

  // Write Claude Code skill
  const claudeDir = path.join(resolvedRoot, '.claude', 'skills');
  fs.mkdirSync(claudeDir, { recursive: true });
  const skillPath = path.join(claudeDir, 'svelte-doctor.md');
  fs.writeFileSync(skillPath, generateClaudeSkill(), 'utf-8');
  console.log(`  Created ${skillPath}`);
}
```

**Step 4: Add init subcommand to CLI**

Add to `src/cli.ts`, before `program.parse()`:

```typescript
program
  .command('init')
  .description('Generate agent context files (.cursorrules, Claude Code skill)')
  .action(() => {
    const { runInit } = await import('./init.js');
    console.log('\n  svelte-doctor init\n');
    runInit('.');
    console.log('\n  Done! Agent context files generated.\n');
  });
```

Note: The `init` import uses dynamic import because the CLI `action` callback needs to be async. Adjust the init command action to use `async`:

```typescript
program
  .command('init')
  .description('Generate agent context files (.cursorrules, Claude Code skill)')
  .action(async () => {
    const { runInit } = await import('./init.js');
    console.log('\n  svelte-doctor init\n');
    runInit('.');
    console.log('\n  Done! Agent context files generated.\n');
  });
```

**Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/init.test.ts`
Expected: Both tests pass.

**Step 6: Commit**

```bash
git add src/init.ts tests/init.test.ts src/cli.ts
git commit -m "feat: add init command for agent context generation"
```

---

### Task 20: Integration Test

**Note:** After Tasks 23-28 are completed, this integration test MUST be updated to include fixtures that exercise all 22 rules and to assert that all 22 rule IDs fire as expected.

**Files:**
- Create: `tests/integration/full-scan.test.ts`
- Create: `tests/integration/fixtures/` (mini SvelteKit project)

**Step 1: Create a minimal SvelteKit fixture project**

Create the following files to simulate a SvelteKit project with known violations:

`tests/integration/fixtures/src/routes/+page.svelte`:
```svelte
<script>
  import { createEventDispatcher } from 'svelte';
  export let name;
  export let count = 0;

  const dispatch = createEventDispatcher();
  $: doubled = count * 2;
</script>

<button on:click={() => dispatch('increment')}>
  {name}: {doubled}
</button>

<slot />

<form method="POST">
  <input name="q" />
  <button type="submit">Search</button>
</form>
```

This fixture has violations for: `sv-no-export-let` (export let), `sv-no-reactive-statements` ($:), `sv-no-event-dispatcher`, `sv-require-native-events` (on:click), `sv-prefer-snippets` (<slot>), `kit-require-use-enhance`.

`tests/integration/fixtures/src/routes/+page.server.ts`:
```typescript
let cache = new Map();

export async function load({ fetch }) {
  const users = await fetch('/api/users');
  const posts = await fetch('/api/posts');
  return { users, posts };
}
```

This has violations for: `kit-no-shared-server-state`, `perf-no-load-waterfalls`.

`tests/integration/fixtures/src/routes/+page.ts`:
```typescript
import { SECRET_KEY } from '$env/static/private';

export function load() {
  return { key: SECRET_KEY };
}
```

This has violations for: `kit-server-only-secrets`.

**Step 2: Write the integration test**

```typescript
import { describe, it, expect } from 'vitest';
import { diagnose } from '../../src/index.js';
import * as path from 'node:path';

const FIXTURES_ROOT = path.join(__dirname, 'fixtures');

describe('integration: full scan', () => {
  it('detects all expected violations in the fixture project', async () => {
    const result = await diagnose(FIXTURES_ROOT);

    // Should have scanned all 3 files
    expect(result.filesScanned).toBe(3);

    // Check that expected rules fired
    const ruleIds = new Set(result.diagnostics.map((d) => d.ruleId));

    expect(ruleIds.has('sv-no-export-let')).toBe(true);
    expect(ruleIds.has('sv-no-event-dispatcher')).toBe(true);
    expect(ruleIds.has('sv-require-native-events')).toBe(true);
    expect(ruleIds.has('sv-prefer-snippets')).toBe(true);
    expect(ruleIds.has('kit-require-use-enhance')).toBe(true);
    expect(ruleIds.has('kit-no-shared-server-state')).toBe(true);
    expect(ruleIds.has('kit-server-only-secrets')).toBe(true);
    expect(ruleIds.has('perf-no-load-waterfalls')).toBe(true);

    // Score should be low with this many violations
    expect(result.score.score).toBeLessThan(75);
    expect(result.score.label).toBe('Needs Work');
  });

  it('respects rule ignoring via config', async () => {
    const result = await diagnose(FIXTURES_ROOT, {
      ignoreRules: ['sv-no-export-let', 'sv-no-event-dispatcher'],
    });

    const ruleIds = new Set(result.diagnostics.map((d) => d.ruleId));
    expect(ruleIds.has('sv-no-export-let')).toBe(false);
    expect(ruleIds.has('sv-no-event-dispatcher')).toBe(false);
    // Other rules should still fire
    expect(ruleIds.has('sv-prefer-snippets')).toBe(true);
  });
});
```

**Step 3: Run the integration test**

Run: `npx vitest run tests/integration/full-scan.test.ts`
Expected: All tests pass. If any rule doesn't fire, debug the specific rule's AST detection logic.

**Step 4: Commit**

```bash
git add tests/integration/
git commit -m "test: add full integration test with fixture SvelteKit project"
```

---

### Task 21: Build + Manual Verification

**Files:**
- Modify: `package.json` — verify tsdown config if needed

**Step 1: Build the project**

Run: `npx tsdown`
Expected: Clean build, `dist/` contains `cli.js` and `index.js`.

**Step 2: Test CLI against the integration fixtures**

Run: `node dist/cli.js tests/integration/fixtures`
Expected: Terminal output showing score and diagnostics.

Run: `node dist/cli.js tests/integration/fixtures --verbose`
Expected: Terminal output with file paths and line numbers.

Run: `node dist/cli.js tests/integration/fixtures --agent`
Expected: XML output with `<svelte-doctor-report>` wrapper.

Run: `node dist/cli.js tests/integration/fixtures --score`
Expected: Just a number (the score).

**Step 3: Test init command**

Run in a temp directory:
```bash
tmpdir=$(mktemp -d) && node dist/cli.js init --help
```
Expected: Help text for init subcommand.

**Step 4: Run the full test suite one final time**

Run: `npx vitest run`
Expected: All tests pass.

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: verify build and CLI functionality"
```

---

### Task 22: Clean Up + Remove Smoke Test

**Files:**
- Delete: `tests/smoke.test.ts`

**Step 1: Remove the scaffolding smoke test**

It served its purpose. Delete `tests/smoke.test.ts`.

**Step 2: Run all tests to ensure nothing broke**

Run: `npx vitest run`
Expected: All remaining tests pass.

**Step 3: Final commit**

```bash
git rm tests/smoke.test.ts
git commit -m "chore: remove scaffolding smoke test"
```

---

### Task 23: Rule — sv-no-reactive-statements

This rule detects legacy `$:` labeled statements (split from the original sv-require-runes rule). The `$:` detection was removed from Task 7 (sv-no-export-let) and moved here.

**Files:**
- Create: `src/rules/sv-no-reactive-statements.ts`
- Create: `tests/rules/sv-no-reactive-statements.test.ts`
- Create: `tests/fixtures/clean-derived.svelte`
- Reuse: `tests/fixtures/legacy-reactive.svelte` (already created in Task 7)

**Step 1: Create test fixtures**

`tests/fixtures/legacy-reactive.svelte` (already exists from Task 7):
```svelte
<script>
  let count = 0;
  $: doubled = count * 2;
  $: {
    console.log(count);
  }
</script>

<p>{doubled}</p>
```

`tests/fixtures/clean-derived.svelte`:
```svelte
<script>
  let count = $state(0);
  let doubled = $derived(count * 2);

  $effect(() => {
    console.log(count);
  });
</script>

<p>{doubled}</p>
```

**Step 2: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { svNoReactiveStatements } from '../../src/rules/sv-no-reactive-statements.js';
import { analyzeFile } from '../../src/engine.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

function analyzeFixture(fixtureName: string) {
  const fixturePath = path.join(__dirname, '../fixtures', fixtureName);
  const source = fs.readFileSync(fixturePath, 'utf-8');
  return analyzeFile({
    filePath: fixturePath,
    fileRole: 'svelte-component',
    source,
    rules: [svNoReactiveStatements],
  });
}

describe('sv-no-reactive-statements', () => {
  it('flags $: reactive assignment statements', () => {
    const diagnostics = analyzeFixture('legacy-reactive.svelte');
    const reactiveIssues = diagnostics.filter((d) => d.message.includes('$:'));
    expect(reactiveIssues.length).toBeGreaterThanOrEqual(2); // $: doubled = ... and $: { block }
  });

  it('passes clean $derived and $effect code', () => {
    const diagnostics = analyzeFixture('clean-derived.svelte');
    expect(diagnostics).toHaveLength(0);
  });

  it('has correct metadata', () => {
    expect(svNoReactiveStatements.id).toBe('sv-no-reactive-statements');
    expect(svNoReactiveStatements.severity).toBe('error');
    expect(svNoReactiveStatements.applicableTo).toContain('svelte-component');
  });

  it('is fixable', () => {
    expect(svNoReactiveStatements.fix).toBeDefined();
  });

  it('fixes $: x = expr to $derived', () => {
    const source = '<script>\n  $: doubled = count * 2;\n</script>';
    const diagnostic = {
      ruleId: 'sv-no-reactive-statements',
      severity: 'error' as const,
      filePath: 'test.svelte',
      line: 2,
      column: 2,
      message: 'test',
      agentInstruction: 'test',
      fixable: true,
    };
    const result = svNoReactiveStatements.fix!(source, diagnostic);
    expect(result).toContain('$derived(');
    expect(result).not.toContain('$:');
  });
});
```

**Step 3: Run test to verify it fails**

Run: `npx vitest run tests/rules/sv-no-reactive-statements.test.ts`
Expected: FAIL — cannot resolve rule module.

**Step 4: Implement the rule**

```typescript
import { walk } from 'estree-walker';
import type { Rule } from '../types.js';

export const svNoReactiveStatements: Rule = {
  id: 'sv-no-reactive-statements',
  severity: 'error',
  applicableTo: ['svelte-component'],
  description: 'Flags legacy Svelte 4 $: reactive statements.',
  agentPrompt:
    'This is Svelte 5. Replace `$: x = expr` with `let x = $derived(expr)`. Replace `$: { block }` with `$effect(() => { block })`.',
  analyze: (ast, context) => {
    if (!ast.instance) return;

    walk(ast.instance.content, {
      enter(node: any) {
        if (node.type === 'LabeledStatement' && node.label?.name === '$') {
          context.report({
            node,
            message:
              'Legacy Svelte 4 `$:` reactive statement detected. Use `$derived()` or `$effect()` instead.',
          });
        }
      },
    });
  },
  fix: (source, _diagnostic) => {
    // Fix $: x = expr -> let x = $derived(expr)
    let result = source.replace(
      /\$:\s+(\w+)\s*=\s*(.+);/g,
      'let $1 = $derived($2);'
    );
    // Fix $: { block } -> $effect(() => { block })
    result = result.replace(
      /\$:\s*\{([^}]+)\}/g,
      '$effect(() => {$1})'
    );
    return result !== source ? result : null;
  },
};
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run tests/rules/sv-no-reactive-statements.test.ts`
Expected: All 5 tests pass.

**Step 6: Commit**

```bash
git add src/rules/sv-no-reactive-statements.ts tests/rules/sv-no-reactive-statements.test.ts tests/fixtures/clean-derived.svelte
git commit -m "feat: add sv-no-reactive-statements rule (detects legacy $: statements)"
```

---

### Task 24: Rules — sv-no-event-modifiers + sv-no-component-constructor

Group of two migration rules: event modifier detection and legacy component constructor detection.

**Files:**
- Create: `src/rules/sv-no-event-modifiers.ts`
- Create: `src/rules/sv-no-component-constructor.ts`
- Create: `tests/rules/sv-no-event-modifiers.test.ts`
- Create: `tests/rules/sv-no-component-constructor.test.ts`
- Create: `tests/fixtures/event-modifiers.svelte`
- Create: `tests/fixtures/legacy-constructor.ts`
- Create: `tests/fixtures/clean-mount.ts`

**Step 1: Create test fixtures**

`tests/fixtures/event-modifiers.svelte`:
```svelte
<script>
  function handleClick(e) {
    console.log('clicked');
  }
  function handleSubmit(e) {
    console.log('submitted');
  }
</script>

<button on:click|preventDefault={handleClick}>Click</button>
<form on:submit|preventDefault|stopPropagation={handleSubmit}>
  <button type="submit">Submit</button>
</form>
```

`tests/fixtures/legacy-constructor.ts`:
```typescript
import App from './App.svelte';

const app = new App({
  target: document.body,
  props: { name: 'world' },
});

export default app;
```

`tests/fixtures/clean-mount.ts`:
```typescript
import { mount } from 'svelte';
import App from './App.svelte';

const app = mount(App, {
  target: document.body,
  props: { name: 'world' },
});

export default app;
```

**Step 2: Write failing tests**

`tests/rules/sv-no-event-modifiers.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { svNoEventModifiers } from '../../src/rules/sv-no-event-modifiers.js';
import { analyzeFile } from '../../src/engine.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

function analyzeFixture(fixtureName: string) {
  const fixturePath = path.join(__dirname, '../fixtures', fixtureName);
  const source = fs.readFileSync(fixturePath, 'utf-8');
  return analyzeFile({
    filePath: fixturePath,
    fileRole: 'svelte-component',
    source,
    rules: [svNoEventModifiers],
  });
}

describe('sv-no-event-modifiers', () => {
  it('flags on:click|preventDefault modifier syntax', () => {
    const diagnostics = analyzeFixture('event-modifiers.svelte');
    expect(diagnostics.length).toBeGreaterThanOrEqual(2); // click + submit with modifiers
    expect(diagnostics[0].message).toContain('modifier');
  });

  it('passes clean event syntax without modifiers', () => {
    const diagnostics = analyzeFixture('clean-events.svelte');
    expect(diagnostics).toHaveLength(0);
  });

  it('is not fixable', () => {
    expect(svNoEventModifiers.fix).toBeUndefined();
  });

  it('has correct metadata', () => {
    expect(svNoEventModifiers.id).toBe('sv-no-event-modifiers');
    expect(svNoEventModifiers.severity).toBe('warning');
    expect(svNoEventModifiers.applicableTo).toContain('svelte-component');
  });
});
```

`tests/rules/sv-no-component-constructor.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { svNoComponentConstructor } from '../../src/rules/sv-no-component-constructor.js';
import { analyzeFile } from '../../src/engine.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

function analyzeFixture(fixtureName: string, fileRole: 'svelte-component' | 'lib-client' | 'lib-server' = 'lib-client') {
  const fixturePath = path.join(__dirname, '../fixtures', fixtureName);
  const source = fs.readFileSync(fixturePath, 'utf-8');
  return analyzeFile({
    filePath: fixturePath,
    fileRole,
    source,
    rules: [svNoComponentConstructor],
  });
}

describe('sv-no-component-constructor', () => {
  it('flags new App({ target: ... }) constructor pattern', () => {
    const diagnostics = analyzeFixture('legacy-constructor.ts');
    expect(diagnostics.length).toBeGreaterThanOrEqual(1);
    expect(diagnostics[0].message).toContain('constructor');
  });

  it('passes mount() pattern', () => {
    const diagnostics = analyzeFixture('clean-mount.ts');
    expect(diagnostics).toHaveLength(0);
  });

  it('is not fixable', () => {
    expect(svNoComponentConstructor.fix).toBeUndefined();
  });

  it('has correct metadata', () => {
    expect(svNoComponentConstructor.id).toBe('sv-no-component-constructor');
    expect(svNoComponentConstructor.severity).toBe('error');
    expect(svNoComponentConstructor.applicableTo).toContain('svelte-component');
    expect(svNoComponentConstructor.applicableTo).toContain('lib-client');
    expect(svNoComponentConstructor.applicableTo).toContain('lib-server');
  });
});
```

**Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/rules/sv-no-event-modifiers.test.ts tests/rules/sv-no-component-constructor.test.ts`
Expected: FAIL

**Step 4: Implement sv-no-event-modifiers**

Walk the template AST looking for `OnDirective` nodes with a non-empty `modifiers` array.

```typescript
import { walk } from 'estree-walker';
import type { Rule } from '../types.js';

export const svNoEventModifiers: Rule = {
  id: 'sv-no-event-modifiers',
  severity: 'warning',
  applicableTo: ['svelte-component'],
  description: 'Flags on:event|modifier syntax. Modifiers need manual refactoring to inline code.',
  agentPrompt:
    'Svelte 5 removes event modifiers like `|preventDefault`. Instead, call `event.preventDefault()` inside the handler function. Replace `on:click|preventDefault={handler}` with `onclick={(e) => { e.preventDefault(); handler(e); }}`.',
  analyze: (ast, context) => {
    if (!ast.fragment) return;

    walk(ast.fragment, {
      enter(node: any) {
        if (
          node.type === 'OnDirective' &&
          node.modifiers &&
          node.modifiers.length > 0
        ) {
          const mods = node.modifiers.join('|');
          context.report({
            node,
            message: `Event modifier \`|${mods}\` on \`on:${node.name}\` detected. Svelte 5 removes event modifiers. Call \`event.${node.modifiers[0]}()\` inside the handler instead.`,
          });
        }
      },
    });
  },
};
```

**Step 5: Implement sv-no-component-constructor**

Walk the TS/JS AST looking for `NewExpression` where the argument is an `ObjectExpression` containing a `target` property.

```typescript
import { walk } from 'estree-walker';
import type { Rule } from '../types.js';

export const svNoComponentConstructor: Rule = {
  id: 'sv-no-component-constructor',
  severity: 'error',
  applicableTo: ['svelte-component', 'lib-client', 'lib-server'],
  description: 'Flags legacy `new Component({ target })` constructor pattern.',
  agentPrompt:
    'Svelte 5 removes the class-based component constructor. Use `import { mount } from \'svelte\'; mount(Component, { target })` instead of `new Component({ target })`.',
  analyze: (ast, context) => {
    // For Svelte files, walk ast.instance.content; for TS/JS files, walk ast.body
    const root = ast.instance?.content ?? ast;
    if (!root) return;

    walk(root, {
      enter(node: any) {
        if (
          node.type === 'NewExpression' &&
          node.arguments?.[0]?.type === 'ObjectExpression'
        ) {
          const hasTarget = node.arguments[0].properties?.some(
            (p: any) =>
              p.type === 'Property' &&
              (p.key?.name === 'target' || p.key?.value === 'target')
          );
          if (hasTarget) {
            const name = node.callee?.name ?? 'Component';
            context.report({
              node,
              message: `Legacy component constructor \`new ${name}({ target })\` detected. Use \`mount(${name}, { target })\` from \`svelte\` instead.`,
            });
          }
        }
      },
    });
  },
};
```

**Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/rules/sv-no-event-modifiers.test.ts tests/rules/sv-no-component-constructor.test.ts`
Expected: All tests pass.

**Step 7: Commit**

```bash
git add src/rules/sv-no-event-modifiers.ts src/rules/sv-no-component-constructor.ts tests/rules/sv-no-event-modifiers.test.ts tests/rules/sv-no-component-constructor.test.ts tests/fixtures/event-modifiers.svelte tests/fixtures/legacy-constructor.ts tests/fixtures/clean-mount.ts
git commit -m "feat: add sv-no-event-modifiers and sv-no-component-constructor rules"
```

---

### Task 25: Rules — sv-prefer-derived-over-effect + sv-no-stale-derived-let

Group of two related reactivity rules for detecting common Svelte 5 anti-patterns.

**Files:**
- Create: `src/rules/sv-prefer-derived-over-effect.ts`
- Create: `src/rules/sv-no-stale-derived-let.ts`
- Create: `tests/rules/sv-prefer-derived-over-effect.test.ts`
- Create: `tests/rules/sv-no-stale-derived-let.test.ts`
- Create: `tests/fixtures/effect-as-derived.svelte`
- Create: `tests/fixtures/stale-let.svelte`

**Step 1: Create test fixtures**

`tests/fixtures/effect-as-derived.svelte`:
```svelte
<script>
  let count = $state(0);
  let doubled = $state(0);

  $effect(() => {
    doubled = count * 2;
  });
</script>

<p>{doubled}</p>
```

Note: This overlaps with `sv-no-effect-state-mutation` but serves a different purpose. That rule flags the infinite-loop risk; this rule specifically flags that the effect could be replaced with `$derived`.

`tests/fixtures/stale-let.svelte`:
```svelte
<script>
  let { a, b } = $props();
  let doubled = a * 2;
  let sum = a + b;
</script>

<p>{doubled} {sum}</p>
```

**Step 2: Write failing tests**

`tests/rules/sv-prefer-derived-over-effect.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { svPreferDerivedOverEffect } from '../../src/rules/sv-prefer-derived-over-effect.js';
import { analyzeFile } from '../../src/engine.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

function analyzeFixture(fixtureName: string) {
  const fixturePath = path.join(__dirname, '../fixtures', fixtureName);
  const source = fs.readFileSync(fixturePath, 'utf-8');
  return analyzeFile({
    filePath: fixturePath,
    fileRole: 'svelte-component',
    source,
    rules: [svPreferDerivedOverEffect],
  });
}

describe('sv-prefer-derived-over-effect', () => {
  it('flags $effect that only assigns a single variable', () => {
    const diagnostics = analyzeFixture('effect-as-derived.svelte');
    expect(diagnostics.length).toBeGreaterThanOrEqual(1);
    expect(diagnostics[0].message).toContain('$derived');
  });

  it('passes clean $effect with side effects (console.log, fetch, etc.)', () => {
    const diagnostics = analyzeFixture('clean-effect.svelte');
    expect(diagnostics).toHaveLength(0);
  });

  it('is not fixable', () => {
    expect(svPreferDerivedOverEffect.fix).toBeUndefined();
  });

  it('has correct metadata', () => {
    expect(svPreferDerivedOverEffect.id).toBe('sv-prefer-derived-over-effect');
    expect(svPreferDerivedOverEffect.severity).toBe('warning');
    expect(svPreferDerivedOverEffect.applicableTo).toContain('svelte-component');
  });
});
```

`tests/rules/sv-no-stale-derived-let.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { svNoStaleDerivedLet } from '../../src/rules/sv-no-stale-derived-let.js';
import { analyzeFile } from '../../src/engine.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

function analyzeFixture(fixtureName: string) {
  const fixturePath = path.join(__dirname, '../fixtures', fixtureName);
  const source = fs.readFileSync(fixturePath, 'utf-8');
  return analyzeFile({
    filePath: fixturePath,
    fileRole: 'svelte-component',
    source,
    rules: [svNoStaleDerivedLet],
  });
}

describe('sv-no-stale-derived-let', () => {
  it('flags let declarations that derive from $props() variables', () => {
    const diagnostics = analyzeFixture('stale-let.svelte');
    expect(diagnostics.length).toBeGreaterThanOrEqual(2); // doubled and sum
    expect(diagnostics[0].message).toContain('$derived');
  });

  it('passes clean $derived usage', () => {
    const diagnostics = analyzeFixture('clean-runes.svelte');
    expect(diagnostics).toHaveLength(0);
  });

  it('is fixable', () => {
    expect(svNoStaleDerivedLet.fix).toBeDefined();
  });

  it('has correct metadata', () => {
    expect(svNoStaleDerivedLet.id).toBe('sv-no-stale-derived-let');
    expect(svNoStaleDerivedLet.severity).toBe('warning');
    expect(svNoStaleDerivedLet.applicableTo).toContain('svelte-component');
  });
});
```

**Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/rules/sv-prefer-derived-over-effect.test.ts tests/rules/sv-no-stale-derived-let.test.ts`
Expected: FAIL

**Step 4: Implement sv-prefer-derived-over-effect**

Detects `$effect()` where the callback body contains ONLY a single `ExpressionStatement` that is an `AssignmentExpression`.

```typescript
import { walk } from 'estree-walker';
import type { Rule } from '../types.js';

export const svPreferDerivedOverEffect: Rule = {
  id: 'sv-prefer-derived-over-effect',
  severity: 'warning',
  applicableTo: ['svelte-component'],
  description: 'Flags $effect() that could be replaced with $derived().',
  agentPrompt:
    'This `$effect()` only assigns a single variable from a computation. Replace with `$derived()`: `let x = $derived(expr);` instead of `$effect(() => { x = expr; })`.',
  analyze: (ast, context) => {
    if (!ast.instance) return;

    walk(ast.instance.content, {
      enter(node: any) {
        if (
          node.type === 'ExpressionStatement' &&
          node.expression?.type === 'CallExpression' &&
          node.expression.callee?.name === '$effect' &&
          node.expression.arguments?.[0]
        ) {
          const callback = node.expression.arguments[0];
          const body = callback.body;

          // Check if the callback body is a BlockStatement with exactly one statement
          if (body?.type === 'BlockStatement' && body.body?.length === 1) {
            const stmt = body.body[0];
            if (
              stmt.type === 'ExpressionStatement' &&
              stmt.expression?.type === 'AssignmentExpression'
            ) {
              const varName = stmt.expression.left?.name ?? 'variable';
              context.report({
                node,
                message: `\`$effect()\` only assigns \`${varName}\`. Use \`let ${varName} = $derived(expr)\` instead for reactive derivation.`,
              });
            }
          }
        }
      },
    });
  },
};
```

**Step 5: Implement sv-no-stale-derived-let**

Detects `VariableDeclaration` with `kind: 'let'` where the init expression references a variable known to come from `$props()` or `$state()`.

```typescript
import { walk } from 'estree-walker';
import type { Rule } from '../types.js';

export const svNoStaleDerivedLet: Rule = {
  id: 'sv-no-stale-derived-let',
  severity: 'warning',
  applicableTo: ['svelte-component'],
  description: 'Flags `let x = expr` where expr references reactive ($props/$state) variables, causing stale values.',
  agentPrompt:
    'This `let` declaration computes a value from reactive variables but will NOT update when those variables change. Use `let x = $derived(expr)` to keep it reactive.',
  analyze: (ast, context) => {
    if (!ast.instance) return;

    // Step 1: Collect variable names from $props() destructuring and $state() init
    const reactiveVars = new Set<string>();
    walk(ast.instance.content, {
      enter(node: any) {
        if (node.type === 'VariableDeclaration') {
          for (const decl of node.declarations) {
            // Detect: let { a, b } = $props()
            if (
              decl.init?.type === 'CallExpression' &&
              decl.init.callee?.name === '$props' &&
              decl.id?.type === 'ObjectPattern'
            ) {
              for (const prop of decl.id.properties) {
                if (prop.type === 'Property' && prop.value?.type === 'Identifier') {
                  reactiveVars.add(prop.value.name);
                } else if (prop.type === 'RestElement' && prop.argument?.type === 'Identifier') {
                  reactiveVars.add(prop.argument.name);
                }
              }
            }
            // Detect: let x = $state(...)
            if (
              decl.init?.type === 'CallExpression' &&
              decl.init.callee?.name === '$state' &&
              decl.id?.type === 'Identifier'
            ) {
              reactiveVars.add(decl.id.name);
            }
          }
        }
      },
    });

    if (reactiveVars.size === 0) return;

    // Step 2: Find let declarations (not $derived, not $state, not $props) that reference reactive vars
    walk(ast.instance.content, {
      enter(node: any) {
        if (node.type === 'VariableDeclaration' && node.kind === 'let') {
          for (const decl of node.declarations) {
            // Skip $derived, $state, $props calls
            if (
              decl.init?.type === 'CallExpression' &&
              ['$derived', '$state', '$props', '$bindable'].includes(decl.init.callee?.name)
            ) {
              continue;
            }

            // Skip declarations without an init expression
            if (!decl.init || decl.id?.type !== 'Identifier') continue;

            // Check if init references any reactive variable
            const referencedReactiveVars: string[] = [];
            walk(decl.init, {
              enter(inner: any) {
                if (inner.type === 'Identifier' && reactiveVars.has(inner.name)) {
                  referencedReactiveVars.push(inner.name);
                }
              },
            });

            if (referencedReactiveVars.length > 0) {
              context.report({
                node: decl,
                message: `\`let ${decl.id.name}\` derives from reactive variable(s) \`${referencedReactiveVars.join(', ')}\` but will not update reactively. Use \`let ${decl.id.name} = $derived(expr)\` instead.`,
              });
            }
          }
        }
      },
    });
  },
  fix: (source, _diagnostic) => {
    // Heuristic fix: find `let x = <expr>` where expr does not start with $derived/$state/$props
    // and replace with `let x = $derived(<expr>)`
    // This is a simplified fix; the test validates the specific case.
    const result = source.replace(
      /let\s+(\w+)\s*=\s*(?!\$(?:derived|state|props|bindable)\()(.+);/g,
      (match, name, expr) => {
        // Only fix if it looks like a derivation (contains an identifier, not a literal)
        if (/[a-zA-Z_]/.test(expr)) {
          return `let ${name} = $derived(${expr.trim()});`;
        }
        return match;
      }
    );
    return result !== source ? result : null;
  },
};
```

**Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/rules/sv-prefer-derived-over-effect.test.ts tests/rules/sv-no-stale-derived-let.test.ts`
Expected: All tests pass.

**Step 7: Commit**

```bash
git add src/rules/sv-prefer-derived-over-effect.ts src/rules/sv-no-stale-derived-let.ts tests/rules/sv-prefer-derived-over-effect.test.ts tests/rules/sv-no-stale-derived-let.test.ts tests/fixtures/effect-as-derived.svelte tests/fixtures/stale-let.svelte
git commit -m "feat: add sv-prefer-derived-over-effect and sv-no-stale-derived-let rules"
```

---

### Task 26: Rules — sv-require-bindable-rune + sv-reactivity-loss-primitive

Group of two related reactivity rules for detecting prop mutation without `$bindable()` and reactivity loss when passing primitives to functions.

**Files:**
- Create: `src/rules/sv-require-bindable-rune.ts`
- Create: `src/rules/sv-reactivity-loss-primitive.ts`
- Create: `tests/rules/sv-require-bindable-rune.test.ts`
- Create: `tests/rules/sv-reactivity-loss-primitive.test.ts`
- Create: `tests/fixtures/prop-mutation.svelte`
- Create: `tests/fixtures/clean-bindable.svelte`
- Create: `tests/fixtures/reactivity-loss.svelte`

**Step 1: Create test fixtures**

`tests/fixtures/prop-mutation.svelte`:
```svelte
<script>
  let { count, name } = $props();

  function increment() {
    count = count + 1;
  }
</script>

<button onclick={increment}>{count} - {name}</button>
```

`tests/fixtures/clean-bindable.svelte`:
```svelte
<script>
  let { count = $bindable(0), name } = $props();

  function increment() {
    count = count + 1;
  }
</script>

<button onclick={increment}>{count} - {name}</button>
```

`tests/fixtures/reactivity-loss.svelte`:
```svelte
<script>
  let { value, label } = $props();

  function processValue(val) {
    return val * 2;
  }

  let result = processValue(value);
</script>

<p>{label}: {result}</p>
```

**Step 2: Write failing tests**

`tests/rules/sv-require-bindable-rune.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { svRequireBindableRune } from '../../src/rules/sv-require-bindable-rune.js';
import { analyzeFile } from '../../src/engine.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

function analyzeFixture(fixtureName: string) {
  const fixturePath = path.join(__dirname, '../fixtures', fixtureName);
  const source = fs.readFileSync(fixturePath, 'utf-8');
  return analyzeFile({
    filePath: fixturePath,
    fileRole: 'svelte-component',
    source,
    rules: [svRequireBindableRune],
  });
}

describe('sv-require-bindable-rune', () => {
  it('flags assignment to $props() variable without $bindable', () => {
    const diagnostics = analyzeFixture('prop-mutation.svelte');
    expect(diagnostics.length).toBeGreaterThanOrEqual(1);
    expect(diagnostics[0].message).toContain('$bindable');
  });

  it('passes $bindable() props', () => {
    const diagnostics = analyzeFixture('clean-bindable.svelte');
    expect(diagnostics).toHaveLength(0);
  });

  it('is not fixable', () => {
    expect(svRequireBindableRune.fix).toBeUndefined();
  });

  it('has correct metadata', () => {
    expect(svRequireBindableRune.id).toBe('sv-require-bindable-rune');
    expect(svRequireBindableRune.severity).toBe('warning');
    expect(svRequireBindableRune.applicableTo).toContain('svelte-component');
  });
});
```

`tests/rules/sv-reactivity-loss-primitive.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { svReactivityLossPrimitive } from '../../src/rules/sv-reactivity-loss-primitive.js';
import { analyzeFile } from '../../src/engine.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

function analyzeFixture(fixtureName: string) {
  const fixturePath = path.join(__dirname, '../fixtures', fixtureName);
  const source = fs.readFileSync(fixturePath, 'utf-8');
  return analyzeFile({
    filePath: fixturePath,
    fileRole: 'svelte-component',
    source,
    rules: [svReactivityLossPrimitive],
  });
}

describe('sv-reactivity-loss-primitive', () => {
  it('flags $props variable passed directly as function argument', () => {
    const diagnostics = analyzeFixture('reactivity-loss.svelte');
    expect(diagnostics.length).toBeGreaterThanOrEqual(1);
    expect(diagnostics[0].message).toContain('reactivity');
  });

  it('passes clean derived usage', () => {
    const diagnostics = analyzeFixture('clean-runes.svelte');
    expect(diagnostics).toHaveLength(0);
  });

  it('is not fixable', () => {
    expect(svReactivityLossPrimitive.fix).toBeUndefined();
  });

  it('has correct metadata', () => {
    expect(svReactivityLossPrimitive.id).toBe('sv-reactivity-loss-primitive');
    expect(svReactivityLossPrimitive.severity).toBe('warning');
    expect(svReactivityLossPrimitive.applicableTo).toContain('svelte-component');
  });
});
```

**Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/rules/sv-require-bindable-rune.test.ts tests/rules/sv-reactivity-loss-primitive.test.ts`
Expected: FAIL

**Step 4: Implement sv-require-bindable-rune**

Detects `AssignmentExpression` where the left side is a variable declared via `$props()` destructuring (not using `$bindable`).

```typescript
import { walk } from 'estree-walker';
import type { Rule } from '../types.js';

export const svRequireBindableRune: Rule = {
  id: 'sv-require-bindable-rune',
  severity: 'warning',
  applicableTo: ['svelte-component'],
  description: 'Flags assignment to $props() variables without $bindable().',
  agentPrompt:
    'Assigning to a prop variable requires `$bindable()`. Change `let { prop } = $props()` to `let { prop = $bindable() } = $props()` if you need two-way binding, or restructure to avoid mutation.',
  analyze: (ast, context) => {
    if (!ast.instance) return;

    // Step 1: Collect $props() variables and which ones use $bindable
    const propsVars = new Set<string>();
    const bindableVars = new Set<string>();

    walk(ast.instance.content, {
      enter(node: any) {
        if (node.type === 'VariableDeclaration') {
          for (const decl of node.declarations) {
            if (
              decl.init?.type === 'CallExpression' &&
              decl.init.callee?.name === '$props' &&
              decl.id?.type === 'ObjectPattern'
            ) {
              for (const prop of decl.id.properties) {
                if (prop.type === 'Property' && prop.value?.type === 'Identifier') {
                  propsVars.add(prop.value.name);
                } else if (prop.type === 'Property' && prop.value?.type === 'AssignmentPattern') {
                  const varName = prop.value.left?.name;
                  if (varName) {
                    propsVars.add(varName);
                    // Check if default is $bindable()
                    if (
                      prop.value.right?.type === 'CallExpression' &&
                      prop.value.right.callee?.name === '$bindable'
                    ) {
                      bindableVars.add(varName);
                    }
                  }
                }
              }
            }
          }
        }
      },
    });

    if (propsVars.size === 0) return;

    // Step 2: Find assignments to non-bindable $props variables
    walk(ast.instance.content, {
      enter(node: any) {
        if (
          node.type === 'AssignmentExpression' &&
          node.left?.type === 'Identifier' &&
          propsVars.has(node.left.name) &&
          !bindableVars.has(node.left.name)
        ) {
          context.report({
            node,
            message: `Prop \`${node.left.name}\` is mutated but not declared with \`$bindable()\`. Use \`let { ${node.left.name} = $bindable() } = $props()\` for two-way binding.`,
          });
        }
      },
    });
  },
};
```

**Step 5: Implement sv-reactivity-loss-primitive**

Detects `CallExpression` where an argument is an `Identifier` that was destructured from `$props()` as a primitive. This is deliberately heuristic — only flags when a `$props` variable is passed directly as a function argument (not in template expressions, not in reactive contexts).

```typescript
import { walk } from 'estree-walker';
import type { Rule } from '../types.js';

export const svReactivityLossPrimitive: Rule = {
  id: 'sv-reactivity-loss-primitive',
  severity: 'warning',
  applicableTo: ['svelte-component'],
  description: 'Flags $props variables passed as function arguments, which may lose reactivity.',
  agentPrompt:
    'Passing a `$props()` variable directly to a function captures its current value, losing reactivity. Wrap in a getter: `() => propVar` or use `$derived()` to compute the result reactively.',
  analyze: (ast, context) => {
    if (!ast.instance) return;

    // Step 1: Collect $props() variable names
    const propsVars = new Set<string>();
    walk(ast.instance.content, {
      enter(node: any) {
        if (node.type === 'VariableDeclaration') {
          for (const decl of node.declarations) {
            if (
              decl.init?.type === 'CallExpression' &&
              decl.init.callee?.name === '$props' &&
              decl.id?.type === 'ObjectPattern'
            ) {
              for (const prop of decl.id.properties) {
                if (prop.type === 'Property' && prop.value?.type === 'Identifier') {
                  propsVars.add(prop.value.name);
                } else if (prop.type === 'Property' && prop.value?.type === 'AssignmentPattern') {
                  if (prop.value.left?.name) {
                    propsVars.add(prop.value.left.name);
                  }
                }
              }
            }
          }
        }
      },
    });

    if (propsVars.size === 0) return;

    // Step 2: Find function calls in the script (not template) that pass $props vars directly
    walk(ast.instance.content, {
      enter(node: any) {
        if (
          node.type === 'CallExpression' &&
          node.callee?.type === 'Identifier' &&
          // Skip reactive runes — they handle reactivity correctly
          !['$derived', '$effect', '$state', '$props', '$bindable', '$inspect'].includes(node.callee.name)
        ) {
          for (const arg of node.arguments ?? []) {
            if (arg.type === 'Identifier' && propsVars.has(arg.name)) {
              context.report({
                node: arg,
                message: `Prop \`${arg.name}\` passed directly to \`${node.callee.name}()\` may lose reactivity. Wrap in a getter \`() => ${arg.name}\` or use \`$derived()\`.`,
              });
            }
          }
        }
      },
    });
  },
};
```

**Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/rules/sv-require-bindable-rune.test.ts tests/rules/sv-reactivity-loss-primitive.test.ts`
Expected: All tests pass.

**Step 7: Commit**

```bash
git add src/rules/sv-require-bindable-rune.ts src/rules/sv-reactivity-loss-primitive.ts tests/rules/sv-require-bindable-rune.test.ts tests/rules/sv-reactivity-loss-primitive.test.ts tests/fixtures/prop-mutation.svelte tests/fixtures/clean-bindable.svelte tests/fixtures/reactivity-loss.svelte
git commit -m "feat: add sv-require-bindable-rune and sv-reactivity-loss-primitive rules"
```

---

### Task 27: Rules — sv-no-magic-props + sv-require-snippet-invocation + sv-no-svelte-component

Group of three snippets/composition rules.

**Files:**
- Create: `src/rules/sv-no-magic-props.ts`
- Create: `src/rules/sv-require-snippet-invocation.ts`
- Create: `src/rules/sv-no-svelte-component.ts`
- Create: `tests/rules/sv-no-magic-props.test.ts`
- Create: `tests/rules/sv-require-snippet-invocation.test.ts`
- Create: `tests/rules/sv-no-svelte-component.test.ts`
- Create: `tests/fixtures/magic-props.svelte`
- Create: `tests/fixtures/snippet-no-invoke.svelte`
- Create: `tests/fixtures/svelte-component.svelte`

**Step 1: Create test fixtures**

`tests/fixtures/magic-props.svelte`:
```svelte
<script>
  let { title } = $props();
</script>

<div {...$$restProps}>
  <h1>{title}</h1>
  <pre>{JSON.stringify($$props)}</pre>
</div>
```

`tests/fixtures/snippet-no-invoke.svelte`:
```svelte
<script>
  let { header, children } = $props();
</script>

<div>
  {@render header}
  {@render children}
</div>
```

`tests/fixtures/svelte-component.svelte`:
```svelte
<script>
  let { component } = $props();
</script>

<svelte:component this={component} />
```

**Step 2: Write failing tests**

`tests/rules/sv-no-magic-props.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { svNoMagicProps } from '../../src/rules/sv-no-magic-props.js';
import { analyzeFile } from '../../src/engine.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

function analyzeFixture(fixtureName: string) {
  const fixturePath = path.join(__dirname, '../fixtures', fixtureName);
  const source = fs.readFileSync(fixturePath, 'utf-8');
  return analyzeFile({
    filePath: fixturePath,
    fileRole: 'svelte-component',
    source,
    rules: [svNoMagicProps],
  });
}

describe('sv-no-magic-props', () => {
  it('flags $$props and $$restProps usage', () => {
    const diagnostics = analyzeFixture('magic-props.svelte');
    expect(diagnostics.length).toBeGreaterThanOrEqual(2); // $$restProps + $$props
  });

  it('passes clean $props() destructuring', () => {
    const diagnostics = analyzeFixture('clean-runes.svelte');
    expect(diagnostics).toHaveLength(0);
  });

  it('is fixable', () => {
    expect(svNoMagicProps.fix).toBeDefined();
  });

  it('has correct metadata', () => {
    expect(svNoMagicProps.id).toBe('sv-no-magic-props');
    expect(svNoMagicProps.severity).toBe('error');
    expect(svNoMagicProps.applicableTo).toContain('svelte-component');
  });
});
```

`tests/rules/sv-require-snippet-invocation.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { svRequireSnippetInvocation } from '../../src/rules/sv-require-snippet-invocation.js';
import { analyzeFile } from '../../src/engine.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

function analyzeFixture(fixtureName: string) {
  const fixturePath = path.join(__dirname, '../fixtures', fixtureName);
  const source = fs.readFileSync(fixturePath, 'utf-8');
  return analyzeFile({
    filePath: fixturePath,
    fileRole: 'svelte-component',
    source,
    rules: [svRequireSnippetInvocation],
  });
}

describe('sv-require-snippet-invocation', () => {
  it('flags {@render foo} without parentheses', () => {
    const diagnostics = analyzeFixture('snippet-no-invoke.svelte');
    expect(diagnostics.length).toBeGreaterThanOrEqual(2); // header + children
    expect(diagnostics[0].message).toContain('()');
  });

  it('passes clean {@render children?.()} usage', () => {
    const diagnostics = analyzeFixture('clean-snippet.svelte');
    expect(diagnostics).toHaveLength(0);
  });

  it('is fixable', () => {
    expect(svRequireSnippetInvocation.fix).toBeDefined();
  });

  it('has correct metadata', () => {
    expect(svRequireSnippetInvocation.id).toBe('sv-require-snippet-invocation');
    expect(svRequireSnippetInvocation.severity).toBe('error');
    expect(svRequireSnippetInvocation.applicableTo).toContain('svelte-component');
  });
});
```

`tests/rules/sv-no-svelte-component.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { svNoSvelteComponent } from '../../src/rules/sv-no-svelte-component.js';
import { analyzeFile } from '../../src/engine.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

function analyzeFixture(fixtureName: string) {
  const fixturePath = path.join(__dirname, '../fixtures', fixtureName);
  const source = fs.readFileSync(fixturePath, 'utf-8');
  return analyzeFile({
    filePath: fixturePath,
    fileRole: 'svelte-component',
    source,
    rules: [svNoSvelteComponent],
  });
}

describe('sv-no-svelte-component', () => {
  it('flags <svelte:component this={...} />', () => {
    const diagnostics = analyzeFixture('svelte-component.svelte');
    expect(diagnostics.length).toBeGreaterThanOrEqual(1);
    expect(diagnostics[0].message).toContain('svelte:component');
  });

  it('passes clean component rendering', () => {
    const diagnostics = analyzeFixture('clean-runes.svelte');
    expect(diagnostics).toHaveLength(0);
  });

  it('is not fixable', () => {
    expect(svNoSvelteComponent.fix).toBeUndefined();
  });

  it('has correct metadata', () => {
    expect(svNoSvelteComponent.id).toBe('sv-no-svelte-component');
    expect(svNoSvelteComponent.severity).toBe('warning');
    expect(svNoSvelteComponent.applicableTo).toContain('svelte-component');
  });
});
```

**Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/rules/sv-no-magic-props.test.ts tests/rules/sv-require-snippet-invocation.test.ts tests/rules/sv-no-svelte-component.test.ts`
Expected: FAIL

**Step 4: Implement sv-no-magic-props**

Detects `Identifier` nodes where name is `$$props` or `$$restProps`.

```typescript
import { walk } from 'estree-walker';
import type { Rule } from '../types.js';

export const svNoMagicProps: Rule = {
  id: 'sv-no-magic-props',
  severity: 'error',
  applicableTo: ['svelte-component'],
  description: 'Flags $$props and $$restProps usage. Use $props() destructuring with rest pattern.',
  agentPrompt:
    'Svelte 5 removes `$$props` and `$$restProps`. Use `let { known, ...rest } = $props();` for rest props and access all props via the destructured pattern.',
  analyze: (ast, context) => {
    // Walk both script and template ASTs
    const roots = [ast.instance?.content, ast.fragment].filter(Boolean);

    for (const root of roots) {
      walk(root, {
        enter(node: any) {
          if (
            node.type === 'Identifier' &&
            (node.name === '$$props' || node.name === '$$restProps')
          ) {
            context.report({
              node,
              message: `\`${node.name}\` is removed in Svelte 5. Use \`let { ...rest } = $props();\` instead.`,
            });
          }
        },
      });
    }
  },
  fix: (source, _diagnostic) => {
    let result = source;
    result = result.replace(/\$\$restProps/g, '...rest /* TODO: add rest to $props() destructuring */');
    result = result.replace(/\$\$props/g, '$$props /* TODO: replace with $props() destructuring */');
    return result !== source ? result : null;
  },
};
```

**Step 5: Implement sv-require-snippet-invocation**

Detects `RenderTag` where expression is an `Identifier` (not a `CallExpression`), meaning `{@render foo}` without `()`.

```typescript
import { walk } from 'estree-walker';
import type { Rule } from '../types.js';

export const svRequireSnippetInvocation: Rule = {
  id: 'sv-require-snippet-invocation',
  severity: 'error',
  applicableTo: ['svelte-component'],
  description: 'Flags {@render snippet} without parentheses invocation.',
  agentPrompt:
    'Snippets must be invoked with parentheses. Change `{@render foo}` to `{@render foo()}` or `{@render foo?.()}`.',
  analyze: (ast, context) => {
    if (!ast.fragment) return;

    walk(ast.fragment, {
      enter(node: any) {
        if (
          node.type === 'RenderTag' &&
          node.expression?.type === 'Identifier'
        ) {
          context.report({
            node,
            message: `\`{@render ${node.expression.name}}\` is missing parentheses. Use \`{@render ${node.expression.name}()}\` or \`{@render ${node.expression.name}?.()}\`.`,
          });
        }
      },
    });
  },
  fix: (source, _diagnostic) => {
    // Fix {@render identifier} -> {@render identifier()}
    const result = source.replace(
      /\{@render\s+(\w+)\s*\}/g,
      '{@render $1()}'
    );
    return result !== source ? result : null;
  },
};
```

**Step 6: Implement sv-no-svelte-component**

Detects `SvelteComponent` nodes in the template AST.

```typescript
import { walk } from 'estree-walker';
import type { Rule } from '../types.js';

export const svNoSvelteComponent: Rule = {
  id: 'sv-no-svelte-component',
  severity: 'warning',
  applicableTo: ['svelte-component'],
  description: 'Flags <svelte:component this={...} /> usage.',
  agentPrompt:
    'Svelte 5 supports dynamic components directly: `<MyComponent />` where `MyComponent` is a variable. Replace `<svelte:component this={comp} />` with `<comp />` (or `{@const Tag = comp} <Tag />` if needed).',
  analyze: (ast, context) => {
    if (!ast.fragment) return;

    walk(ast.fragment, {
      enter(node: any) {
        if (node.type === 'SvelteComponent') {
          context.report({
            node,
            message: '`<svelte:component this={...}>` is deprecated in Svelte 5. Use the component variable directly as a tag: `<Component />`.',
          });
        }
      },
    });
  },
};
```

**Step 7: Run tests to verify they pass**

Run: `npx vitest run tests/rules/sv-no-magic-props.test.ts tests/rules/sv-require-snippet-invocation.test.ts tests/rules/sv-no-svelte-component.test.ts`
Expected: All tests pass.

**Step 8: Commit**

```bash
git add src/rules/sv-no-magic-props.ts src/rules/sv-require-snippet-invocation.ts src/rules/sv-no-svelte-component.ts tests/rules/sv-no-magic-props.test.ts tests/rules/sv-require-snippet-invocation.test.ts tests/rules/sv-no-svelte-component.test.ts tests/fixtures/magic-props.svelte tests/fixtures/snippet-no-invoke.svelte tests/fixtures/svelte-component.svelte
git commit -m "feat: add sv-no-magic-props, sv-require-snippet-invocation, and sv-no-svelte-component rules"
```

---

### Task 28: Rules — kit-no-goto-in-server + perf-prefer-state-raw + perf-no-function-derived

Group of remaining rules covering SvelteKit boundary enforcement and performance.

**Files:**
- Create: `src/rules/kit-no-goto-in-server.ts`
- Create: `src/rules/perf-prefer-state-raw.ts`
- Create: `src/rules/perf-no-function-derived.ts`
- Create: `tests/rules/kit-no-goto-in-server.test.ts`
- Create: `tests/rules/perf-prefer-state-raw.test.ts`
- Create: `tests/rules/perf-no-function-derived.test.ts`
- Create: `tests/fixtures/goto-in-server.ts`
- Create: `tests/fixtures/large-state.svelte`
- Create: `tests/fixtures/function-derived.svelte`

**Step 1: Create test fixtures**

`tests/fixtures/goto-in-server.ts`:
```typescript
import { goto } from '$app/navigation';
import { redirect } from '@sveltejs/kit';

export async function load({ params }) {
  if (!params.id) {
    goto('/');
  }
  return { id: params.id };
}
```

`tests/fixtures/clean-redirect-server.ts`:
```typescript
import { redirect } from '@sveltejs/kit';

export async function load({ params }) {
  if (!params.id) {
    throw redirect(302, '/');
  }
  return { id: params.id };
}
```

`tests/fixtures/large-state.svelte`:
```svelte
<script>
  let items = $state([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
    21, 22, 23, 24, 25
  ]);

  let config = $state({
    a: 1, b: 2, c: 3, d: 4, e: 5,
    f: 6, g: 7, h: 8, i: 9, j: 10,
    k: 11
  });
</script>

<p>{items.length} {Object.keys(config).length}</p>
```

`tests/fixtures/clean-state-raw.svelte`:
```svelte
<script>
  let items = $state.raw([1, 2, 3]);
  let config = $state({ a: 1, b: 2 });
</script>

<p>{items.length}</p>
```

`tests/fixtures/function-derived.svelte`:
```svelte
<script>
  let count = $state(0);
  let doubled = $derived(() => count * 2);
  let tripled = $derived(() => count * 3);
</script>

<p>{doubled} {tripled}</p>
```

`tests/fixtures/clean-derived-expr.svelte`:
```svelte
<script>
  let count = $state(0);
  let doubled = $derived(count * 2);
  let tripled = $derived(count * 3);
</script>

<p>{doubled} {tripled}</p>
```

**Step 2: Write failing tests**

`tests/rules/kit-no-goto-in-server.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { kitNoGotoInServer } from '../../src/rules/kit-no-goto-in-server.js';
import { analyzeFile } from '../../src/engine.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

function analyzeFixture(fixtureName: string, fileRole: 'page-server' | 'layout-server' | 'server-endpoint') {
  const fixturePath = path.join(__dirname, '../fixtures', fixtureName);
  const source = fs.readFileSync(fixturePath, 'utf-8');
  return analyzeFile({
    filePath: fixturePath,
    fileRole,
    source,
    rules: [kitNoGotoInServer],
  });
}

describe('kit-no-goto-in-server', () => {
  it('flags goto import from $app/navigation in server files', () => {
    const diagnostics = analyzeFixture('goto-in-server.ts', 'page-server');
    expect(diagnostics.length).toBeGreaterThanOrEqual(1);
    expect(diagnostics[0].message).toContain('goto');
  });

  it('passes server file without goto', () => {
    const diagnostics = analyzeFixture('clean-redirect-server.ts', 'page-server');
    expect(diagnostics).toHaveLength(0);
  });

  it('is not fixable', () => {
    expect(kitNoGotoInServer.fix).toBeUndefined();
  });

  it('has correct metadata', () => {
    expect(kitNoGotoInServer.id).toBe('kit-no-goto-in-server');
    expect(kitNoGotoInServer.severity).toBe('error');
    expect(kitNoGotoInServer.applicableTo).toContain('page-server');
    expect(kitNoGotoInServer.applicableTo).toContain('layout-server');
    expect(kitNoGotoInServer.applicableTo).toContain('server-endpoint');
  });
});
```

`tests/rules/perf-prefer-state-raw.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { perfPreferStateRaw } from '../../src/rules/perf-prefer-state-raw.js';
import { analyzeFile } from '../../src/engine.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

function analyzeFixture(fixtureName: string) {
  const fixturePath = path.join(__dirname, '../fixtures', fixtureName);
  const source = fs.readFileSync(fixturePath, 'utf-8');
  return analyzeFile({
    filePath: fixturePath,
    fileRole: 'svelte-component',
    source,
    rules: [perfPreferStateRaw],
  });
}

describe('perf-prefer-state-raw', () => {
  it('flags $state() with large array or object literal', () => {
    const diagnostics = analyzeFixture('large-state.svelte');
    expect(diagnostics.length).toBeGreaterThanOrEqual(2); // items (>20 elements) + config (>10 properties)
  });

  it('passes small $state or $state.raw usage', () => {
    const diagnostics = analyzeFixture('clean-state-raw.svelte');
    expect(diagnostics).toHaveLength(0);
  });

  it('is not fixable', () => {
    expect(perfPreferStateRaw.fix).toBeUndefined();
  });

  it('has correct metadata', () => {
    expect(perfPreferStateRaw.id).toBe('perf-prefer-state-raw');
    expect(perfPreferStateRaw.severity).toBe('warning');
    expect(perfPreferStateRaw.applicableTo).toContain('svelte-component');
  });
});
```

`tests/rules/perf-no-function-derived.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { perfNoFunctionDerived } from '../../src/rules/perf-no-function-derived.js';
import { analyzeFile } from '../../src/engine.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

function analyzeFixture(fixtureName: string) {
  const fixturePath = path.join(__dirname, '../fixtures', fixtureName);
  const source = fs.readFileSync(fixturePath, 'utf-8');
  return analyzeFile({
    filePath: fixturePath,
    fileRole: 'svelte-component',
    source,
    rules: [perfNoFunctionDerived],
  });
}

describe('perf-no-function-derived', () => {
  it('flags $derived(() => expr) with arrow function expression body', () => {
    const diagnostics = analyzeFixture('function-derived.svelte');
    expect(diagnostics.length).toBeGreaterThanOrEqual(2); // doubled + tripled
    expect(diagnostics[0].message).toContain('$derived');
  });

  it('passes $derived(expr) without wrapping arrow function', () => {
    const diagnostics = analyzeFixture('clean-derived-expr.svelte');
    expect(diagnostics).toHaveLength(0);
  });

  it('is fixable', () => {
    expect(perfNoFunctionDerived.fix).toBeDefined();
  });

  it('fixes $derived(() => expr) to $derived(expr)', () => {
    const source = '<script>\n  let doubled = $derived(() => count * 2);\n</script>';
    const diagnostic = {
      ruleId: 'perf-no-function-derived',
      severity: 'warning' as const,
      filePath: 'test.svelte',
      line: 2,
      column: 2,
      message: 'test',
      agentInstruction: 'test',
      fixable: true,
    };
    const result = perfNoFunctionDerived.fix!(source, diagnostic);
    expect(result).toContain('$derived(count * 2)');
    expect(result).not.toContain('=>');
  });

  it('has correct metadata', () => {
    expect(perfNoFunctionDerived.id).toBe('perf-no-function-derived');
    expect(perfNoFunctionDerived.severity).toBe('warning');
    expect(perfNoFunctionDerived.applicableTo).toContain('svelte-component');
  });
});
```

**Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/rules/kit-no-goto-in-server.test.ts tests/rules/perf-prefer-state-raw.test.ts tests/rules/perf-no-function-derived.test.ts`
Expected: FAIL

**Step 4: Implement kit-no-goto-in-server**

Detects `ImportDeclaration` where source is `$app/navigation` containing `goto` specifier in server files.

```typescript
import { walk } from 'estree-walker';
import type { Rule } from '../types.js';

export const kitNoGotoInServer: Rule = {
  id: 'kit-no-goto-in-server',
  severity: 'error',
  applicableTo: ['page-server', 'layout-server', 'server-endpoint'],
  description: 'Flags goto() import from $app/navigation in server files.',
  agentPrompt:
    '`goto()` is a client-side navigation function and cannot be used in server files. Use `throw redirect(302, url)` from `@sveltejs/kit` instead.',
  analyze: (ast, context) => {
    if (!ast.body) return;

    walk(ast, {
      enter(node: any) {
        if (
          node.type === 'ImportDeclaration' &&
          node.source?.value === '$app/navigation'
        ) {
          const hasGoto = node.specifiers?.some(
            (s: any) =>
              s.type === 'ImportSpecifier' &&
              (s.imported?.name === 'goto' || s.local?.name === 'goto')
          );
          if (hasGoto) {
            context.report({
              node,
              message: '`goto()` from `$app/navigation` cannot be used in server files. Use `throw redirect(302, url)` from `@sveltejs/kit` instead.',
            });
          }
        }
      },
    });
  },
};
```

**Step 5: Implement perf-prefer-state-raw**

Detects `$state()` where initializer is an array literal with >20 elements or an object literal with >10 properties.

```typescript
import { walk } from 'estree-walker';
import type { Rule } from '../types.js';

export const perfPreferStateRaw: Rule = {
  id: 'perf-prefer-state-raw',
  severity: 'warning',
  applicableTo: ['svelte-component'],
  description: 'Suggests $state.raw() for large data structures to avoid deep reactivity overhead.',
  agentPrompt:
    'Large arrays (>20 items) and objects (>10 properties) in `$state()` create deep reactive proxies with significant overhead. Use `$state.raw()` instead and trigger updates by reassignment: `items = [...items, newItem]`.',
  analyze: (ast, context) => {
    if (!ast.instance) return;

    walk(ast.instance.content, {
      enter(node: any) {
        if (
          node.type === 'VariableDeclaration'
        ) {
          for (const decl of node.declarations) {
            if (
              decl.init?.type === 'CallExpression' &&
              decl.init.callee?.name === '$state' &&
              decl.init.arguments?.[0]
            ) {
              const arg = decl.init.arguments[0];
              const varName = decl.id?.name ?? 'variable';

              // Check array literal with >20 elements
              if (arg.type === 'ArrayExpression' && arg.elements?.length > 20) {
                context.report({
                  node: decl,
                  message: `\`$state()\` for \`${varName}\` contains ${arg.elements.length} array elements. Consider \`$state.raw()\` to avoid deep reactivity overhead.`,
                });
              }

              // Check object literal with >10 properties
              if (arg.type === 'ObjectExpression' && arg.properties?.length > 10) {
                context.report({
                  node: decl,
                  message: `\`$state()\` for \`${varName}\` contains ${arg.properties.length} object properties. Consider \`$state.raw()\` to avoid deep reactivity overhead.`,
                });
              }
            }
          }
        }
      },
    });
  },
};
```

**Step 6: Implement perf-no-function-derived**

Detects `$derived()` where first argument is an `ArrowFunctionExpression` with expression body (not block body).

```typescript
import { walk } from 'estree-walker';
import type { Rule } from '../types.js';

export const perfNoFunctionDerived: Rule = {
  id: 'perf-no-function-derived',
  severity: 'warning',
  applicableTo: ['svelte-component'],
  description: 'Flags $derived(() => expr) which should be $derived(expr).',
  agentPrompt:
    '`$derived(() => expr)` wraps the expression in an unnecessary arrow function. Use `$derived(expr)` directly for better readability and slight performance improvement. Use `$derived.by(() => { ... })` only for multi-statement derivations.',
  analyze: (ast, context) => {
    if (!ast.instance) return;

    walk(ast.instance.content, {
      enter(node: any) {
        if (
          node.type === 'VariableDeclaration'
        ) {
          for (const decl of node.declarations) {
            if (
              decl.init?.type === 'CallExpression' &&
              decl.init.callee?.name === '$derived' &&
              decl.init.arguments?.[0]?.type === 'ArrowFunctionExpression' &&
              decl.init.arguments[0].expression === true // expression body, not block body
            ) {
              const varName = decl.id?.name ?? 'variable';
              context.report({
                node: decl,
                message: `\`$derived(() => expr)\` for \`${varName}\` should be \`$derived(expr)\`. Remove the arrow function wrapper.`,
              });
            }
          }
        }
      },
    });
  },
  fix: (source, _diagnostic) => {
    // Fix $derived(() => expr) -> $derived(expr)
    const result = source.replace(
      /\$derived\(\(\)\s*=>\s*([^)]+)\)/g,
      '$derived($1)'
    );
    return result !== source ? result : null;
  },
};
```

**Step 7: Run tests to verify they pass**

Run: `npx vitest run tests/rules/kit-no-goto-in-server.test.ts tests/rules/perf-prefer-state-raw.test.ts tests/rules/perf-no-function-derived.test.ts`
Expected: All tests pass.

**Step 8: Update the rule registry**

After all rules from Tasks 23-28 are implemented, update `src/rules/index.ts` to import and export all 22 rules as specified in Task 14.

Run: `npx vitest run`
Expected: All tests pass with all 22 rules registered.

**Step 9: Commit**

```bash
git add src/rules/kit-no-goto-in-server.ts src/rules/perf-prefer-state-raw.ts src/rules/perf-no-function-derived.ts tests/rules/kit-no-goto-in-server.test.ts tests/rules/perf-prefer-state-raw.test.ts tests/rules/perf-no-function-derived.test.ts tests/fixtures/goto-in-server.ts tests/fixtures/clean-redirect-server.ts tests/fixtures/large-state.svelte tests/fixtures/clean-state-raw.svelte tests/fixtures/function-derived.svelte tests/fixtures/clean-derived-expr.svelte src/rules/index.ts
git commit -m "feat: add kit-no-goto-in-server, perf-prefer-state-raw, and perf-no-function-derived rules"
```
