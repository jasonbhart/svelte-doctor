# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

svelte-doctor is an npm CLI tool that diagnoses and auto-fixes Svelte 5 anti-patterns. It parses `.svelte` and `.ts/.js` files, runs 20 lint rules against the ASTs, reports diagnostics, computes a health score, and optionally applies fixes. It also has an `init` command that generates CI/hook/AI integrations.

## Commands

```bash
npm run build          # Production build (rm dist + tsdown)
npm run dev            # Watch mode (tsdown --watch)
npm run typecheck      # tsc --noEmit
npm run test           # vitest run (all tests)
npm run test:watch     # vitest (watch mode)
npx vitest run tests/rules/sv-no-export-let.test.ts   # Single test file
npx vitest run -t "test name pattern"                  # Single test by name
```

## Architecture

**Pipeline:** `CLI → diagnose() → scanFiles → classifyFile → analyzeFile → computeScore → report`

- `src/cli.ts` — Commander-based CLI. Three output modes: terminal (colorized), `--score` (number only), `--agent` (XML for LLMs).
- `src/index.ts` — `diagnose(projectRoot, options?)` orchestrates the full pipeline and returns `DiagnoseResult`.
- `src/scanner.ts` — Uses `fast-glob` to find `.svelte`/`.ts`/`.js` files, respects `.gitignore`.
- `src/classifier.ts` — Maps file paths to `FileRole` (9 roles: `svelte-component`, `page-server`, `layout-server`, `server-endpoint`, `page-client`, `layout-client`, `lib-server`, `lib-client`, `config`).
- `src/engine.ts` — Filters rules by `applicableTo` file roles, parses file (Svelte or TypeScript), runs each rule's `analyze()`, collects diagnostics.
- `src/parsers/svelte.ts` — Resolves target project's `svelte/compiler` first, falls back to bundled. Calls `parse(source, { modern: true })`.
- `src/parsers/typescript.ts` — Uses `oxc-parser` (Rust-based).
- `src/analysis/svelteComponentContext.ts` — Single-pass AST walker that builds shared context: `stateVars`, `derivedVars`, `propsVars`, `bindableVars`, `writeSites`. Used by complex rules to reduce false positives.
- `src/scorer.ts` — `score = round(100 * e^(-3 * density))` where density = `(errors*3 + warnings) / filesScanned`.
- `src/fixer.ts` — Groups diagnostics by rule, calls each rule's `fix(source, diagnostic)`.
- `src/reporters/terminal.ts` — Colorized output with summary/verbose modes.
- `src/reporters/agent.ts` — XML output with `<issue>` tags for LLM consumption.
- `src/config.ts` — Loads `svelte-doctor.config.json` or `svelteDoctor` key in `package.json`.
- `src/init.ts` — Generates `.cursorrules`, Claude skill, GitHub Actions workflow, Husky hook, Claude hooks.

## Rule System

Rules live in `src/rules/` and are registered in `src/rules/index.ts` via `allRules[]`. Three categories:
- **sv-\*** (13 rules) — Svelte 5 migration: runes, snippets, native events, component constructors, reactivity
- **kit-\*** (4 rules) — SvelteKit: shared server state, secrets in client code, `use:enhance`, `goto()` in server
- **perf-\*** (3 rules) — Performance: load waterfalls, `$state.raw()`, function calls in `$derived()`

Each rule implements the `Rule` interface from `src/types.ts`:
- `id`, `severity` (`error`|`warning`), `applicableTo` (list of `FileRole`s), `description`, `agentPrompt`
- `analyze(ast, context)` — walks AST, calls `context.report({ node, message })` for violations
- `fix?(source, diagnostic)` — returns modified source string or `null`

When adding a new rule: create `src/rules/<id>.ts`, add it to `src/rules/index.ts` (`allRules[]` + named export), create a fixture in `tests/fixtures/`, and add a test in `tests/rules/`.

## Testing

Tests use Vitest with `globals: true`. Test files are in `tests/` mirroring `src/` structure.

**Key pattern:** `createAnalyzeFixture(rule)` from `tests/helpers/analyze-fixture.ts` returns a function that reads a fixture file from `tests/fixtures/` and runs a single rule against it:

```ts
const analyzeFixture = createAnalyzeFixture(svNoExportLet);
const diagnostics = analyzeFixture('legacy-props.svelte');
expect(diagnostics).toHaveLength(2);
```

For server/kit rules, pass the file role: `analyzeFixture('server-state.ts', 'page-server')`.

## Build

Uses `tsdown` targeting Node 18, ESM only. Two entry points: `src/cli.ts` and `src/index.ts`. Svelte and `svelte/compiler` are externalized (resolved from the target project at runtime).
