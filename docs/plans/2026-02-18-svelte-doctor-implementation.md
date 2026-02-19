# Svelte Doctor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a deterministic CLI diagnostic tool that scans Svelte 5 / SvelteKit codebases for legacy patterns, architectural violations, and performance anti-patterns, producing a 0-100 health score with actionable diagnostics.

**Architecture:** Monolithic CLI with a four-stage pipeline: File Scanner (fast-glob) -> Parser (svelte/compiler for .svelte, oxc-parser for .ts/.js) -> Rule Engine (estree-walker, 9 rules) -> Reporter/Fixer. Each file is classified by its SvelteKit routing role (FileRole) to determine which rules apply.

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
      JSON.stringify({ ignore: { rules: ['sv-require-runes'] } })
    );
    const config = loadConfig('/fake/project');
    expect(config.ignore?.rules).toEqual(['sv-require-runes']);
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

### Task 7: Rule — sv-require-runes

**Files:**
- Create: `src/rules/sv-require-runes.ts`
- Create: `tests/rules/sv-require-runes.test.ts`
- Create: `tests/fixtures/legacy-props.svelte`
- Create: `tests/fixtures/legacy-reactive.svelte`
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

`tests/fixtures/legacy-reactive.svelte`:
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
import { svRequireRunes } from '../../src/rules/sv-require-runes.js';
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
    rules: [svRequireRunes],
  });
}

describe('sv-require-runes', () => {
  it('flags export let declarations', () => {
    const diagnostics = analyzeFixture('legacy-props.svelte');
    const propIssues = diagnostics.filter((d) => d.message.includes('export let'));
    expect(propIssues.length).toBeGreaterThanOrEqual(1);
  });

  it('flags $: reactive statements', () => {
    const diagnostics = analyzeFixture('legacy-reactive.svelte');
    const reactiveIssues = diagnostics.filter((d) => d.message.includes('$:'));
    expect(reactiveIssues.length).toBeGreaterThanOrEqual(1);
  });

  it('passes clean Svelte 5 runes code', () => {
    const diagnostics = analyzeFixture('clean-runes.svelte');
    expect(diagnostics).toHaveLength(0);
  });

  it('has correct metadata', () => {
    expect(svRequireRunes.id).toBe('sv-require-runes');
    expect(svRequireRunes.severity).toBe('error');
    expect(svRequireRunes.applicableTo).toContain('svelte-component');
  });
});
```

**Step 3: Run test to verify it fails**

Run: `npx vitest run tests/rules/sv-require-runes.test.ts`
Expected: FAIL — cannot resolve rule module.

**Step 4: Implement the rule**

```typescript
import { walk } from 'estree-walker';
import type { Rule } from '../types.js';

export const svRequireRunes: Rule = {
  id: 'sv-require-runes',
  severity: 'error',
  applicableTo: ['svelte-component'],
  description: 'Flags legacy Svelte 4 export let props and $: reactive statements.',
  agentPrompt:
    'This is Svelte 5. Replace all `export let` props with a single `let { ...props } = $props()` destructuring. Replace all `$:` reactive statements with `$derived()` for computed values or `$effect()` for side effects.',
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

        // Detect: $: reactive statement
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
};
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run tests/rules/sv-require-runes.test.ts`
Expected: All 4 tests pass.

**Step 6: Commit**

```bash
git add src/rules/sv-require-runes.ts tests/rules/sv-require-runes.test.ts tests/fixtures/legacy-props.svelte tests/fixtures/legacy-reactive.svelte tests/fixtures/clean-runes.svelte
git commit -m "feat: add sv-require-runes rule (detects export let and $:)"
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

### Task 11: Rule — sv-no-legacy-event-syntax

**Files:**
- Create: `src/rules/sv-no-legacy-event-syntax.ts`
- Create: `tests/rules/sv-no-legacy-event-syntax.test.ts`
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
import { svNoLegacyEventSyntax } from '../../src/rules/sv-no-legacy-event-syntax.js';
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
    rules: [svNoLegacyEventSyntax],
  });
}

describe('sv-no-legacy-event-syntax', () => {
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

Run: `npx vitest run tests/rules/sv-no-legacy-event-syntax.test.ts`
Expected: FAIL

**Step 4: Implement the rule**

Walk the template AST looking for `OnDirective` nodes.

```typescript
import { walk } from 'estree-walker';
import type { Rule } from '../types.js';

export const svNoLegacyEventSyntax: Rule = {
  id: 'sv-no-legacy-event-syntax',
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

Run: `npx vitest run tests/rules/sv-no-legacy-event-syntax.test.ts`
Expected: All 2 tests pass.

**Step 6: Commit**

```bash
git add src/rules/sv-no-legacy-event-syntax.ts tests/rules/sv-no-legacy-event-syntax.test.ts tests/fixtures/legacy-events.svelte tests/fixtures/clean-events.svelte
git commit -m "feat: add sv-no-legacy-event-syntax rule (on:click -> onclick)"
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

### Task 13: Rules — kit-require-use-enhance + perf-avoid-load-waterfalls

**Files:**
- Create: `src/rules/kit-require-use-enhance.ts`
- Create: `src/rules/perf-avoid-load-waterfalls.ts`
- Create: `tests/rules/kit-require-use-enhance.test.ts`
- Create: `tests/rules/perf-avoid-load-waterfalls.test.ts`
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

`tests/rules/perf-avoid-load-waterfalls.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { perfAvoidLoadWaterfalls } from '../../src/rules/perf-avoid-load-waterfalls.js';
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
    rules: [perfAvoidLoadWaterfalls],
  });
}

describe('perf-avoid-load-waterfalls', () => {
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

Run: `npx vitest run tests/rules/kit-require-use-enhance.test.ts tests/rules/perf-avoid-load-waterfalls.test.ts`
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

**Step 5: Implement perf-avoid-load-waterfalls**

Walk the TS AST looking for the exported `load` function. Then check for consecutive `await` expressions in its body where the second does not reference variables from the first.

```typescript
import { walk } from 'estree-walker';
import type { Rule } from '../types.js';

export const perfAvoidLoadWaterfalls: Rule = {
  id: 'perf-avoid-load-waterfalls',
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

Run: `npx vitest run tests/rules/kit-require-use-enhance.test.ts tests/rules/perf-avoid-load-waterfalls.test.ts`
Expected: All 4 tests pass.

**Step 7: Commit**

```bash
git add src/rules/kit-require-use-enhance.ts src/rules/perf-avoid-load-waterfalls.ts tests/rules/ tests/fixtures/form-no-enhance.svelte tests/fixtures/form-with-enhance.svelte tests/fixtures/load-waterfall.ts tests/fixtures/load-parallel.ts
git commit -m "feat: add kit-require-use-enhance and perf-avoid-load-waterfalls rules"
```

---

### Task 14: Rule Registry

**Files:**
- Create: `src/rules/index.ts`
- Modify: `tests/engine.test.ts` — add integration test with real rules

**Step 1: Create the rule registry**

```typescript
import { svRequireRunes } from './sv-require-runes.js';
import { svNoEffectStateMutation } from './sv-no-effect-state-mutation.js';
import { svPreferSnippets } from './sv-prefer-snippets.js';
import { svNoEventDispatcher } from './sv-no-event-dispatcher.js';
import { svNoLegacyEventSyntax } from './sv-no-legacy-event-syntax.js';
import { kitNoSharedServerState } from './kit-no-shared-server-state.js';
import { kitServerOnlySecrets } from './kit-server-only-secrets.js';
import { kitRequireUseEnhance } from './kit-require-use-enhance.js';
import { perfAvoidLoadWaterfalls } from './perf-avoid-load-waterfalls.js';
import type { Rule } from '../types.js';

export const allRules: Rule[] = [
  svRequireRunes,
  svNoEffectStateMutation,
  svPreferSnippets,
  svNoEventDispatcher,
  svNoLegacyEventSyntax,
  kitNoSharedServerState,
  kitServerOnlySecrets,
  kitRequireUseEnhance,
  perfAvoidLoadWaterfalls,
];

export {
  svRequireRunes,
  svNoEffectStateMutation,
  svPreferSnippets,
  svNoEventDispatcher,
  svNoLegacyEventSyntax,
  kitNoSharedServerState,
  kitServerOnlySecrets,
  kitRequireUseEnhance,
  perfAvoidLoadWaterfalls,
};
```

**Step 2: Verify all tests still pass**

Run: `npx vitest run`
Expected: All tests pass.

**Step 3: Commit**

```bash
git add src/rules/index.ts
git commit -m "feat: add rule registry exporting all 9 rules"
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
        ruleId: 'sv-require-runes',
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
    expect(output).toContain('sv-require-runes');
    expect(output).toContain('1 issue');
  });

  it('shows file details in verbose mode', () => {
    const diagnostics: Diagnostic[] = [
      {
        ruleId: 'sv-require-runes',
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
        ruleId: 'sv-require-runes',
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
    expect(output).toContain('rule="sv-require-runes"');
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

Test the fixer with the `sv-require-runes` rule's fix function. The fixer collects all fixable diagnostics and applies their rule's `fix()` function.

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

This fixture has violations for: `sv-require-runes` (export let, $:), `sv-no-event-dispatcher`, `sv-no-legacy-event-syntax` (on:click), `sv-prefer-snippets` (<slot>), `kit-require-use-enhance`.

`tests/integration/fixtures/src/routes/+page.server.ts`:
```typescript
let cache = new Map();

export async function load({ fetch }) {
  const users = await fetch('/api/users');
  const posts = await fetch('/api/posts');
  return { users, posts };
}
```

This has violations for: `kit-no-shared-server-state`, `perf-avoid-load-waterfalls`.

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

    expect(ruleIds.has('sv-require-runes')).toBe(true);
    expect(ruleIds.has('sv-no-event-dispatcher')).toBe(true);
    expect(ruleIds.has('sv-no-legacy-event-syntax')).toBe(true);
    expect(ruleIds.has('sv-prefer-snippets')).toBe(true);
    expect(ruleIds.has('kit-require-use-enhance')).toBe(true);
    expect(ruleIds.has('kit-no-shared-server-state')).toBe(true);
    expect(ruleIds.has('kit-server-only-secrets')).toBe(true);
    expect(ruleIds.has('perf-avoid-load-waterfalls')).toBe(true);

    // Score should be low with this many violations
    expect(result.score.score).toBeLessThan(75);
    expect(result.score.label).toBe('Needs Work');
  });

  it('respects rule ignoring via config', async () => {
    const result = await diagnose(FIXTURES_ROOT, {
      ignoreRules: ['sv-require-runes', 'sv-no-event-dispatcher'],
    });

    const ruleIds = new Set(result.diagnostics.map((d) => d.ruleId));
    expect(ruleIds.has('sv-require-runes')).toBe(false);
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
