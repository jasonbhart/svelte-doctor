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

export interface ClaudeHookConfig {
  hooks: {
    Stop: Array<{
      hooks: Array<{
        type: string;
        command: string;
      }>;
    }>;
  };
}

export function generateClaudeHook(): ClaudeHookConfig {
  return {
    hooks: {
      Stop: [
        {
          hooks: [
            {
              type: 'command',
              command: 'npx svelte-doctor . --agent 2>/dev/null || true',
            },
          ],
        },
      ],
    },
  };
}

export function mergeClaudeSettings(existingJson: string): string {
  const existing = JSON.parse(existingJson);
  const hookConfig = generateClaudeHook();

  // If Stop hook already contains svelte-doctor, don't duplicate
  if (existing.hooks?.Stop?.some((entry: any) =>
    entry.hooks?.some((h: any) => h.command?.includes('svelte-doctor'))
  )) {
    return JSON.stringify(existing, null, 2) + '\n';
  }

  // Merge hooks key, preserving existing hooks
  existing.hooks = {
    ...existing.hooks,
    ...hookConfig.hooks,
  };

  return JSON.stringify(existing, null, 2) + '\n';
}

export function runInit(projectRoot: string): void {
  const resolvedRoot = path.resolve(projectRoot);

  // --- Agent context files (always overwrite) ---

  const cursorRulesPath = path.join(resolvedRoot, '.cursorrules');
  fs.writeFileSync(cursorRulesPath, generateCursorRules(), 'utf-8');
  console.log(`  Created ${path.relative(resolvedRoot, cursorRulesPath) || '.cursorrules'}`);

  const windsurfRulesPath = path.join(resolvedRoot, '.windsurfrules');
  fs.writeFileSync(windsurfRulesPath, generateCursorRules(), 'utf-8');
  console.log(`  Created ${path.relative(resolvedRoot, windsurfRulesPath) || '.windsurfrules'}`);

  const claudeSkillsDir = path.join(resolvedRoot, '.claude', 'skills');
  fs.mkdirSync(claudeSkillsDir, { recursive: true });
  const skillPath = path.join(claudeSkillsDir, 'svelte-doctor.md');
  fs.writeFileSync(skillPath, generateClaudeSkill(), 'utf-8');
  console.log(`  Created ${path.relative(resolvedRoot, skillPath)}`);

  // --- GitHub Actions workflow (skip if exists) ---

  const workflowDir = path.join(resolvedRoot, '.github', 'workflows');
  const workflowPath = path.join(workflowDir, 'svelte-doctor.yml');
  if (fs.existsSync(workflowPath)) {
    console.log(`  Skipped ${path.relative(resolvedRoot, workflowPath)} (already exists)`);
  } else {
    fs.mkdirSync(workflowDir, { recursive: true });
    fs.writeFileSync(workflowPath, generateGitHubWorkflow(), 'utf-8');
    console.log(`  Created ${path.relative(resolvedRoot, workflowPath)}`);
  }

  // --- Husky hook (skip if exists) ---

  const huskyDir = path.join(resolvedRoot, '.husky');
  const huskyPath = path.join(huskyDir, 'svelte-doctor');
  if (fs.existsSync(huskyPath)) {
    console.log(`  Skipped ${path.relative(resolvedRoot, huskyPath)} (already exists)`);
  } else {
    fs.mkdirSync(huskyDir, { recursive: true });
    fs.writeFileSync(huskyPath, generateHuskyHook(), { mode: 0o755 });
    console.log(`  Created ${path.relative(resolvedRoot, huskyPath)}`);
  }

  // --- Claude Code settings.json (merge) ---

  const claudeSettingsPath = path.join(resolvedRoot, '.claude', 'settings.json');
  if (fs.existsSync(claudeSettingsPath)) {
    const existing = fs.readFileSync(claudeSettingsPath, 'utf-8');
    const merged = mergeClaudeSettings(existing);
    if (merged !== existing) {
      fs.writeFileSync(claudeSettingsPath, merged, 'utf-8');
      console.log(`  Updated ${path.relative(resolvedRoot, claudeSettingsPath)} (added Stop hook)`);
    } else {
      console.log(`  Skipped ${path.relative(resolvedRoot, claudeSettingsPath)} (hook already present)`);
    }
  } else {
    const hookConfig = generateClaudeHook();
    fs.writeFileSync(claudeSettingsPath, JSON.stringify(hookConfig, null, 2) + '\n', 'utf-8');
    console.log(`  Created ${path.relative(resolvedRoot, claudeSettingsPath)}`);
  }
}
