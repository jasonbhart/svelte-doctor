# svelte-doctor

Diagnose and fix Svelte 5 anti-patterns in your codebase.

One command scans your project for migration issues, SvelteKit mistakes, and performance problems, then outputs a **0–100 health score** with actionable diagnostics.

Inspired by [react-doctor](https://github.com/millionco/react-doctor).

## Install

```bash
npx svelte-doctor .
npx svelte-doctor . --verbose
```

## How it works

svelte-doctor scans `.svelte`, `.ts`, and `.js` files in your project, classifies each file by its SvelteKit role (component, page server, layout, endpoint, etc.), then runs **20 rules** against the AST. Each rule targets a specific anti-pattern — legacy Svelte 4 syntax, SvelteKit server pitfalls, or performance issues.

Issues are weighted (errors × 3, warnings × 1), normalized by project size using exponential decay, and rolled into a single score.

## Options

```
Usage: svelte-doctor [directory]

Options:
  --verbose    Show file details per rule
  --score      Output only the score (for CI)
  --agent      Output structured XML for LLM consumption
  --fix        Auto-fix all fixable issues
  -y, --yes    Skip confirmation prompts

Commands:
  init         Generate agent context files, CI workflow, and hook configs
```

## Rules

### Svelte 5 Migration (sv-\*)

| Rule | Severity | Fixable | Description |
|------|----------|---------|-------------|
| `sv-no-export-let` | error | yes | `export let` → `$props()` destructuring |
| `sv-no-reactive-statements` | error | yes | `$:` → `$derived()` / `$effect()` |
| `sv-no-effect-state-mutation` | warning | — | `$state` mutated inside `$effect()` without `untrack()` |
| `sv-prefer-snippets` | error | yes | `<slot>` → `{@render}` + `{#snippet}` |
| `sv-no-event-dispatcher` | error | — | `createEventDispatcher` → callback props |
| `sv-require-native-events` | error | yes | `on:click` → `onclick` |
| `sv-no-component-constructor` | error | yes | `new Component()` → `mount()` |
| `sv-prefer-derived-over-effect` | warning | — | `$effect` that only assigns one variable → `$derived()` |
| `sv-no-stale-derived-let` | warning | yes | `let x = reactiveExpr` → `$derived()` |
| `sv-require-bindable-rune` | warning | — | Props assigned without `$bindable()` |
| `sv-reactivity-loss-primitive` | warning | — | Reactive value passed to function loses reactivity |
| `sv-no-magic-props` | error | yes | `$$props` / `$$restProps` → `$props()` rest |
| `sv-no-svelte-component` | error | — | `<svelte:component>` → dynamic component |

### SvelteKit (kit-\*)

| Rule | Severity | Description |
|------|----------|-------------|
| `kit-no-shared-server-state` | error | Module-level `let` in server files causes cross-request leaks |
| `kit-server-only-secrets` | error | Private env imports in client-accessible files |
| `kit-require-use-enhance` | warning | POST forms missing `use:enhance` |
| `kit-no-goto-in-server` | error | `goto()` in server files → `throw redirect()` |

### Performance (perf-\*)

| Rule | Severity | Fixable | Description |
|------|----------|---------|-------------|
| `perf-no-load-waterfalls` | warning | — | Sequential `await` calls in `load()` that can be parallelized |
| `perf-prefer-state-raw` | warning | — | Large data structures should use `$state.raw()` |
| `perf-no-function-derived` | warning | yes | `$derived(() => expr)` → `$derived(expr)` |

## Scoring

```
score = round(100 × e^(−3 × density))
density = (errors × 3 + warnings) / filesScanned
```

| Score | Label |
|-------|-------|
| 90–100 | Excellent |
| 75–89 | Good |
| 50–74 | Needs Work |
| 0–49 | Critical |

The CLI exits with code **1** when the score is below 75, making it suitable for CI gates.

## Configuration

Create `svelte-doctor.config.json` (or add a `"svelteDoctor"` key to `package.json`):

```json
{
  "ignore": {
    "rules": ["sv-no-event-dispatcher", "perf-no-load-waterfalls"],
    "files": ["src/legacy/**"]
  }
}
```

## Agent output

Use `--agent` to get XML output designed for LLM consumption:

```xml
<svelte-doctor-report score="65" label="Needs Work" files-scanned="12" issues="3">
  <issue rule="sv-no-export-let" file="src/Button.svelte" severity="error" line="5" fixable="true">
    <description>Legacy Svelte 4 `export let` prop detected.</description>
    <code-snippet>export let count: number;</code-snippet>
    <agent-instruction>Replace all `export let` props with `let { ...props } = $props()`.</agent-instruction>
  </issue>
</svelte-doctor-report>
```

## Integrations (`init`)

```bash
npx svelte-doctor init
```

Generates:

- `.cursorrules` / `.windsurfrules` — AI editor context
- `.claude/skills/svelte-doctor.md` — Claude Code skill
- `.claude/settings.json` — Claude Code Stop hook
- `.github/workflows/svelte-doctor.yml` — GitHub Actions CI
- `.husky/svelte-doctor` — Git pre-commit hook

## Node.js API

```js
import { diagnose } from "svelte-doctor/api";

const result = await diagnose("./path/to/project");

console.log(result.score);        // { score: 82, label: "Good" }
console.log(result.diagnostics);  // Diagnostic[]
console.log(result.filesScanned); // number
```

## License

MIT
