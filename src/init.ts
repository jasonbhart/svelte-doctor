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

export function generateGitHubWorkflow(): string {
  return `name: Svelte Doctor
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  svelte-doctor:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 18
      - run: npm ci
      - name: Run Svelte Doctor
        run: npx svelte-doctor . --score
`;
}


export function generateHuskyHook(): string {
  return `npx svelte-doctor . --score\n`;
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
