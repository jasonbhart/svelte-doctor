# Product Requirements Document: svelte-doctor

**Version:** 1.0
**Date:** 2026-02-18
**Status:** Draft
**Target Audience:** AI coding agent implementing this specification

---

## 1. Product Overview

**svelte-doctor** is a deterministic CLI diagnostic tool and AI coding agent skill for Svelte 5 / SvelteKit codebases. It scans `.svelte`, `.ts`, and `.js` files and produces a 0-100 codebase health score with actionable diagnostics.

### Problem Statement

AI coding agents (Claude Code, Cursor, Copilot, Windsurf) are heavily trained on Svelte 3/4 syntax. When writing Svelte 5 code, they frequently hallucinate legacy patterns (`export let`, `$:`, `<slot>`, `on:click`, `createEventDispatcher`). The official `svelte-check` tool only validates types and syntax — it does not catch architectural violations, legacy pattern usage, or performance anti-patterns that are syntactically valid but semantically wrong.

### What svelte-doctor Does

1. **Catches Svelte 4 legacy patterns** that AI agents hallucinate — the primary problem
2. **Enforces SvelteKit architectural boundaries** that pass type-checking but are catastrophic at runtime (e.g., shared server state causing cross-request data leaks)
3. **Detects performance anti-patterns** specific to Svelte 5's reactivity model

### What svelte-doctor Does NOT Do

- Replace `svelte-check` (type/syntax validation is out of scope)
- Act as a general-purpose linter (no eslint-style rule ecosystem)
- Use LLMs for fixes (v1 is purely deterministic — AST scanning + `magic-string` transforms)

### Relationship to svelte-check

You run `svelte-check` to ensure your code compiles. You run `svelte-doctor` to ensure AI agents and developers don't write legacy Svelte 4 patterns in a Svelte 5 codebase, and that SvelteKit architectural boundaries are respected.

---

## 2. Target Audience

**Primary:** AI coding agents that need structured diagnostics and explicit refactoring instructions to write correct Svelte 5 code.

**Secondary:** Svelte developers migrating codebases from Svelte 4 to Svelte 5 (Runes) who want automated scanning and CI/CD gating.

---

## 3. Interfaces

### 3.1 CLI Interface

```
npx svelte-doctor [directory] [options]

Commands:
  svelte-doctor [dir]     Scan directory and report diagnostics (default: ".")
  svelte-doctor init      Generate agent context files (.cursorrules, skill, etc.)

Options:
  -v, --version           Display version number
  --verbose               Show file details per rule (file paths, line numbers)
  --score                 Output only the numeric score (0-100)
  --agent                 Output structured XML for LLM consumption
  --fix                   Auto-fix all fixable issues in-place
  --diff [base]           Scan only files changed vs base branch
  -y, --yes               Skip interactive prompts
  -h, --help              Display help
```

**Exit codes:**
- `0` — score >= 75
- `1` — score < 75 (useful for CI gating)

### 3.2 Node.js API

```typescript
import { diagnose } from 'svelte-doctor/api';

const result = await diagnose('./path/to/sveltekit-project');

console.log(result.score);        // { score: 82, label: "Good" }
console.log(result.diagnostics);  // Diagnostic[]
console.log(result.filesScanned); // number
```

### 3.3 Agent Output Format (`--agent`)

When invoked with `--agent`, output structured XML optimized for LLM context windows:

```xml
<svelte-doctor-report score="72" label="Needs Work" files-scanned="47" issues="12">
  <issue rule="sv-require-runes" file="src/routes/profile/+page.svelte"
         severity="error" line="3" fixable="true">
    <description>Legacy Svelte 4 props detected.</description>
    <code-snippet>
      export let user;
      export let theme = 'dark';
    </code-snippet>
    <agent-instruction>
      Remove `export let`. Use the $props() rune:
      `let { user, theme = 'dark' } = $props();`
    </agent-instruction>
  </issue>
</svelte-doctor-report>
```

### 3.4 Claude Code Skill

A Claude Code skill file that instructs the agent to:

1. Run `npx svelte-doctor . --agent` via shell before writing Svelte code
2. Parse the XML output to understand current codebase health
3. Follow `<agent-instruction>` tags when fixing issues
4. Re-run after fixes to verify score improvement

The skill content includes a compact Svelte 5 runes reference, SvelteKit boundary rules, CLI invocation patterns, and diagnostic interpretation guidance.

### 3.5 `init` Command

`npx svelte-doctor init` generates agent context files:

- `.cursorrules` — Cursor-specific rules with Svelte 5 conventions
- `.windsurfrules` — Windsurf-specific equivalent
- `.claude/skills/svelte-doctor.md` — Claude Code skill (or appends to existing `CLAUDE.md`)

All generated files contain the same core knowledge: "This is a Svelte 5 project. Use runes, not legacy syntax." Each is formatted for its target agent's conventions.

---

## 4. Configuration

### 4.1 Config File

`svelte-doctor.config.json` at project root:

```json
{
  "ignore": {
    "rules": ["kit-require-use-enhance"],
    "files": ["src/lib/legacy/**", "**/*.test.ts"]
  }
}
```

### 4.2 package.json Alternative

```json
{
  "svelteDoctor": {
    "ignore": {
      "rules": ["kit-require-use-enhance"]
    }
  }
}
```

`svelte-doctor.config.json` takes precedence if both exist. CLI flags always override config values.

### 4.3 Config Options

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `ignore.rules` | `string[]` | `[]` | Rule IDs to suppress (e.g., `sv-require-runes`, `kit-require-use-enhance`) |
| `ignore.files` | `string[]` | `[]` | File paths to exclude, supports glob patterns |
| `verbose` | `boolean` | `false` | Show file details per rule (same as `--verbose`) |
| `diff` | `boolean \| string` | — | Force diff mode (`true`) or pin a base branch (`"main"`) |

---

## 5. Rule Engine Specifications

### 5.1 Rule Interface

```typescript
interface Rule {
  id: string;
  severity: 'error' | 'warning';
  applicableTo: FileRole[];
  description: string;        // Human-readable rule description
  agentPrompt: string;        // Dense instruction for LLM context
  analyze: (ast: SvelteAST | JSAST, context: RuleContext) => void;
  fix?: (source: string, diagnostic: Diagnostic) => string | null;
}

interface RuleContext {
  filePath: string;
  fileRole: FileRole;
  report: (info: { node: ASTNode; message: string }) => void;
}

interface Diagnostic {
  ruleId: string;
  severity: 'error' | 'warning';
  filePath: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  message: string;             // Human-readable
  agentInstruction: string;    // Machine-readable fix guidance
  fixable: boolean;
  codeSnippet?: string;        // Extracted source at violation point
}
```

### 5.2 File Role Classification

Every scanned file is classified by its SvelteKit routing role. Rules use this classification to determine applicability.

```typescript
type FileRole =
  | 'svelte-component'   // *.svelte
  | 'page-server'        // +page.server.ts/js
  | 'layout-server'      // +layout.server.ts/js
  | 'server-endpoint'    // +server.ts/js
  | 'page-client'        // +page.ts/js
  | 'layout-client'      // +layout.ts/js
  | 'lib-server'         // src/lib/server/** or *.server.ts/js
  | 'lib-client'         // src/lib/** (non-server)
  | 'config'             // svelte.config.js, vite.config.ts
```

**Classification logic:** Based on file path pattern matching against SvelteKit's routing conventions. The path `src/routes/` is the routing root. Files outside `src/` are classified as `lib-client` by default.

### 5.3 Rule Applicability Matrix

| Rule ID | Applies to File Roles |
|---------|-----------------------|
| `sv-require-runes` | `svelte-component` |
| `sv-no-effect-state-mutation` | `svelte-component` |
| `sv-prefer-snippets` | `svelte-component` |
| `sv-no-event-dispatcher` | `svelte-component` |
| `sv-no-legacy-event-syntax` | `svelte-component` |
| `kit-no-shared-server-state` | `page-server`, `layout-server`, `server-endpoint` |
| `kit-server-only-secrets` | `svelte-component`, `page-client`, `layout-client`, `lib-client` |
| `kit-require-use-enhance` | `svelte-component` |
| `perf-avoid-load-waterfalls` | `page-server`, `layout-server`, `page-client`, `layout-client` |

### 5.4 Rule Specifications

---

#### Rule: `sv-require-runes`

**Severity:** error
**Category:** Svelte 5 Runes & Reactivity
**Applies to:** `svelte-component`
**Fixable:** Yes

**Detection:**
1. In the `<script>` AST (`ast.instance`), find `ExportNamedDeclaration` nodes where the declaration is a `VariableDeclaration` — this matches `export let prop`. Do NOT flag `export const` or `export function` (these are valid module exports).
2. Find `LabeledStatement` nodes where `label.name === '$'` — this matches `$: derived = expr` (legacy reactive statements).

**Auto-fix:**
- `export let prop` → Collect all exported `let` declarations. Replace the block with a single `let { prop1, prop2 = defaultVal } = $props();` destructuring statement.
- `$: name = expression` → Replace with `let name = $derived(expression);`
- `$: { statements }` → Replace with `$effect(() => { statements });` (with a warning that `$derived` may be more appropriate).

**Agent instruction:** "This is Svelte 5. Replace all `export let` props with a single `let { ...props } = $props()` destructuring. Replace all `$:` reactive statements with `$derived()` for computed values or `$effect()` for side effects."

---

#### Rule: `sv-no-effect-state-mutation`

**Severity:** error
**Category:** Svelte 5 Runes & Reactivity
**Applies to:** `svelte-component`
**Fixable:** No (report-only — requires semantic understanding)

**Detection:**
1. Find all `$effect()` call expressions in the `<script>` AST.
2. Walk the callback body of each `$effect()`.
3. Flag any `AssignmentExpression` where the left-hand side is a variable that was declared with `$state()`.

**Why this matters:** Mutating `$state` inside `$effect` creates an infinite re-render loop in Svelte 5. The effect reads the state (tracking it), mutates it (triggering re-run), reads it again (infinite loop).

**Agent instruction:** "Do NOT mutate `$state` variables inside `$effect()`. If you need a value derived from other state, use `$derived()` instead. If mutation is truly necessary, wrap the assignment in `untrack(() => { ... })` to break the reactivity cycle."

---

#### Rule: `sv-prefer-snippets`

**Severity:** warning
**Category:** Svelte 5 Runes & Reactivity
**Applies to:** `svelte-component`
**Fixable:** Yes (simple cases)

**Detection:**
In the template AST (`ast.fragment`), find `SlotElement` nodes (the AST representation of `<slot>`).

**Auto-fix (simple cases):**
- `<slot />` (default slot) → `{@render children?.()}` and add `let { children } = $props();` to script.
- `<slot name="header" />` → `{@render header?.()}` and add `header` to `$props()` destructuring.

Named slots with fallback content require `{#snippet}` blocks and are flagged as fixable but require more complex transforms.

**Agent instruction:** "Svelte 5 replaces `<slot>` with snippets. Use `{@render children?.()}` for default slot content. Declare snippet props via `$props()`: `let { children, header } = $props();`"

---

#### Rule: `sv-no-event-dispatcher`

**Severity:** error
**Category:** Svelte 5 Runes & Reactivity
**Applies to:** `svelte-component`
**Fixable:** No (report-only — requires understanding call sites)

**Detection:**
1. Find `import` declarations that import `createEventDispatcher` from `'svelte'`.
2. Find `CallExpression` nodes calling `createEventDispatcher()`.
3. Find subsequent `dispatch('eventname', data)` calls.

**Agent instruction:** "Svelte 5 removes `createEventDispatcher`. Pass callback functions as props instead. Replace `dispatch('submit', data)` with calling `onsubmit?.(data)` where `let { onsubmit } = $props();`"

---

#### Rule: `sv-no-legacy-event-syntax`

**Severity:** warning
**Category:** Svelte 5 Runes & Reactivity
**Applies to:** `svelte-component`
**Fixable:** Yes

**Detection:**
In the template AST, find event directive attributes: nodes where `type === 'OnDirective'` or attribute names matching the `on:` prefix pattern.

**Auto-fix:**
- `on:click={handler}` → `onclick={handler}`
- `on:keydown|preventDefault={handler}` → Flag as report-only (modifiers need manual refactoring to use event methods inside the handler).

**Agent instruction:** "Svelte 5 uses standard HTML event attributes. Replace `on:click={handler}` with `onclick={handler}`. For event modifiers like `|preventDefault`, call `event.preventDefault()` inside the handler function instead."

---

#### Rule: `kit-no-shared-server-state`

**Severity:** error
**Category:** SvelteKit Architecture & Boundaries
**Applies to:** `page-server`, `layout-server`, `server-endpoint`
**Fixable:** No (report-only — requires architectural restructuring)

**Detection:**
1. Parse the module's top-level scope (outside any function body).
2. Find `VariableDeclaration` nodes with `kind === 'let'` at the module scope.
3. Exclude declarations inside exported functions (`load`, `GET`, `POST`, etc.).

**Why this matters:** In SvelteKit, server modules are long-lived Node.js modules. A `let` variable at module scope is shared across ALL concurrent requests. This causes catastrophic cross-user data leaks.

**Agent instruction:** "CRITICAL: Module-level `let` in server files creates shared mutable state across all requests. This is a security vulnerability. Move per-request state to `event.locals` (set in `hooks.server.ts` `handle` function) or declare variables inside the `load`/`GET`/`POST` function body."

---

#### Rule: `kit-server-only-secrets`

**Severity:** error
**Category:** SvelteKit Architecture & Boundaries
**Applies to:** `svelte-component`, `page-client`, `layout-client`, `lib-client`
**Fixable:** No (report-only — requires architectural restructuring)

**Detection:**
Find `ImportDeclaration` nodes where the source value is:
- `'$env/static/private'`
- `'$env/dynamic/private'`

These imports are only valid in server-side files. SvelteKit will error at build time, but agents may generate this code and waste time debugging cryptic build errors.

**Agent instruction:** "Private environment variables (`$env/static/private`, `$env/dynamic/private`) can ONLY be imported in server-side files (`+page.server.ts`, `+server.ts`, `src/lib/server/**`). For client-side env access, use `$env/static/public` or `$env/dynamic/public`."

---

#### Rule: `kit-require-use-enhance`

**Severity:** warning
**Category:** SvelteKit Architecture & Boundaries
**Applies to:** `svelte-component`
**Fixable:** Yes

**Detection:**
In the template AST, find `<form>` elements that have a `method` attribute set to `"POST"` (case-insensitive) but do NOT have a `use:enhance` action directive.

**Auto-fix:**
Add `use:enhance` attribute to the form element. Also add `import { enhance } from '$app/forms';` to the script block if not already present.

**Agent instruction:** "SvelteKit forms with `method=\"POST\"` should use `use:enhance` for progressive enhancement. Add `use:enhance` to the form element and import `enhance` from `'$app/forms'`."

---

#### Rule: `perf-avoid-load-waterfalls`

**Severity:** warning
**Category:** Performance
**Applies to:** `page-server`, `layout-server`, `page-client`, `layout-client`
**Fixable:** No (report-only — requires semantic understanding)

**Detection:**
1. Find the exported `load` function.
2. Walk its body looking for consecutive `AwaitExpression` nodes that are:
   - Both at the top level of the function body (not nested in conditionals)
   - Independent (the second `await` does not reference variables declared by the first)

**Heuristic:** If two sequential `await` statements exist where the second does not reference any identifier declared or assigned in the first's `VariableDeclaration`, they are likely independent and parallelizable.

**Agent instruction:** "These `await` calls in the `load` function appear independent and could run in parallel. Wrap them in `Promise.all()` to avoid waterfall loading: `const [a, b] = await Promise.all([fetchA(), fetchB()]);`"

---

### 5.5 Scoring Algorithm

```
score = 100 - (errorCount * 3) - (warningCount * 1)
score = Math.max(0, Math.min(100, score))
```

**Score labels:**
| Range | Label |
|-------|-------|
| 90-100 | Excellent |
| 75-89 | Good |
| 50-74 | Needs Work |
| 0-49 | Critical |

**Scoring rationale:** Errors (legacy syntax, security violations) deduct 3 points. Warnings (missing enhancements, performance) deduct 1 point. This weights security and correctness heavily over style.

---

## 6. Architecture

### 6.1 Pipeline

```
CLI Entry (commander)
    |
    v
File Scanner (fast-glob)
    |  Discovers .svelte, .ts, .js files
    |  Respects .gitignore + svelte-doctor.config.json ignores
    |
    v
Router Context Classifier
    |  Classifies each file by SvelteKit role (FileRole)
    |  Based on file path pattern matching
    |
    v
Parser (per file type)
    |  .svelte --> svelte/compiler parse({ modern: true })
    |  .ts/.js --> oxc-parser parseSync()
    |
    v
Rule Engine (estree-walker)
    |  Walks AST, applies rules filtered by FileRole
    |  Each rule calls context.report() to emit Diagnostic[]
    |
    v
Diagnostics Aggregator
    |  Collects all diagnostics, computes score
    |
    +---> Terminal Reporter (default)
    |     Colored output via picocolors, grouped by file
    |     Shows 0-100 score with label
    |
    +---> Agent Reporter (--agent)
    |     Structured XML with <agent-instruction> tags
    |
    +---> Fixer (--fix)
          magic-string source transforms for fixable rules
          Writes modified files back to disk
```

### 6.2 Project Structure

```
svelte-doctor/
  package.json
  tsconfig.json
  svelte-doctor.config.json     # dogfooding: config for self
  src/
    cli.ts                       # commander entry point, option parsing
    index.ts                     # Node.js API: export { diagnose }
    scanner.ts                   # fast-glob file discovery + .gitignore
    classifier.ts                # FileRole classification from file paths
    parsers/
      svelte.ts                  # svelte/compiler parse({ modern: true })
      typescript.ts              # oxc-parser parseSync()
    rules/
      index.ts                   # Rule registry: exports all rules as Rule[]
      sv-require-runes.ts
      sv-no-effect-state-mutation.ts
      sv-prefer-snippets.ts
      sv-no-event-dispatcher.ts
      sv-no-legacy-event-syntax.ts
      kit-no-shared-server-state.ts
      kit-server-only-secrets.ts
      kit-require-use-enhance.ts
      perf-avoid-load-waterfalls.ts
    engine.ts                    # Walks AST with estree-walker, runs rules
    scorer.ts                    # Computes 0-100 score from Diagnostic[]
    reporters/
      terminal.ts                # Human-readable colored terminal output
      agent.ts                   # XML output for --agent flag
    fixer.ts                     # magic-string transforms, applies fixes
    config.ts                    # Loads svelte-doctor.config.json / package.json
    init.ts                      # Generates .cursorrules, skill files
    types.ts                     # Shared types: Rule, Diagnostic, FileRole, etc.
  tests/
    fixtures/                    # Sample .svelte and .ts files with known violations
      legacy-props.svelte
      effect-mutation.svelte
      shared-server-state.ts
      private-env-leak.svelte
      ...
    rules/                       # One test file per rule
      sv-require-runes.test.ts
      ...
    scanner.test.ts
    classifier.test.ts
    scorer.test.ts
    engine.test.ts
```

### 6.3 Tech Stack

| Component | Package | Purpose |
|-----------|---------|---------|
| CLI framework | `commander` | Argument parsing, subcommands |
| Svelte parsing | `svelte/compiler` | `parse({ modern: true })` for .svelte AST |
| TS/JS parsing | `oxc-parser` | `parseSync()` for SvelteKit route files |
| AST walking | `estree-walker` | Visitor pattern over AST nodes |
| Source transforms | `magic-string` | Position-aware string replacement for --fix |
| File discovery | `fast-glob` | Glob-based file scanning with .gitignore support |
| Terminal colors | `picocolors` | Lightweight colored output |
| Spinner | `ora` | Progress indicator during scan |
| Build | `tsdown` | TypeScript bundling |
| Test | `vitest` | Unit and integration tests |

### 6.4 Peer Dependency Strategy

svelte-doctor resolves `svelte/compiler` from the **target project's** `node_modules/`, not its own dependencies. This ensures AST compatibility with whatever Svelte 5.x version the project uses.

```typescript
// In parsers/svelte.ts
import { createRequire } from 'node:module';

function getSvelteCompiler(projectRoot: string) {
  const require = createRequire(path.join(projectRoot, 'package.json'));
  return require('svelte/compiler');
}
```

If `svelte` is not found in the target project, exit with a clear error: "svelte-doctor requires Svelte 5. Install svelte@5 in your project."

---

## 7. Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| Scan performance | < 3 seconds for 500-file SvelteKit project |
| Zero config | `npx svelte-doctor .` works immediately on any SvelteKit project |
| Node.js version | >= 18.0.0 |
| Svelte version | Svelte 5.x (rejects Svelte 3/4 projects with a clear message) |
| Package size | < 5MB installed (excluding peer deps) |
| No network calls | v1 is fully offline — no API keys, no telemetry |

---

## 8. Out of Scope (v1)

- LLM-powered fixes (no Vercel AI SDK, no API key management)
- MCP server (skill instructs agent to use CLI via shell instead)
- `perf-prefer-raw-state` rule (reliable static detection is too heuristic-dependent)
- Watch mode / file watcher
- Editor integrations (VS Code extension)
- Custom rule authoring / plugin API
- Svelte 3/4 support (only Svelte 5)

---

## 9. Future Considerations (v2+)

- **LLM-powered fixes:** Integrate Vercel AI SDK for complex refactors where deterministic AST transforms fail (e.g., untangling `run()` blocks from `sv migrate` into clean `$derived` statements).
- **Plugin architecture:** Allow community-authored rules via a standardized plugin interface.
- **MCP server:** Expose diagnostics as an MCP tool for Claude Desktop and other MCP clients.
- **`perf-prefer-raw-state`:** Flag deep objects in `$state()` that should use `$state.raw()`.
- **Leaderboard:** Public scoring of popular SvelteKit projects (following react-doctor's model).
- **Watch mode:** Re-scan on file changes during development.

---

## 10. Success Criteria

1. Running `npx svelte-doctor .` on a SvelteKit project with known Svelte 4 patterns correctly identifies all legacy syntax and produces a meaningful 0-100 score.
2. Running `npx svelte-doctor . --fix` on a project with `export let` props and `on:click` directives produces correct Svelte 5 code that compiles without errors.
3. Running `npx svelte-doctor . --agent` produces valid XML that an AI agent can parse and act on to fix all reported issues.
4. The Claude Code skill successfully guides an agent to invoke the CLI, interpret results, and apply fixes without human intervention.
5. All 9 rules have unit tests with fixture files demonstrating both positive (violation detected) and negative (clean code passes) cases.
