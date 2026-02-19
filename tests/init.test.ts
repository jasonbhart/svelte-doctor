import { describe, it, expect } from 'vitest';
import { generateCursorRules, generateClaudeSkill, generateGitHubWorkflow, generateHuskyHook, generateClaudeHook, mergeClaudeSettings } from '../src/init.js';

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

describe('generateGitHubWorkflow', () => {
  it('generates a valid GitHub Actions workflow', () => {
    const content = generateGitHubWorkflow();
    expect(content).toContain('name: Svelte Doctor');
    expect(content).toContain('npx svelte-doctor . --score');
    expect(content).toContain('npm ci');
    expect(content).toContain('actions/checkout@v4');
    expect(content).toContain('actions/setup-node@v4');
  });
});

describe('generateHuskyHook', () => {
  it('generates a husky-compatible hook script', () => {
    const content = generateHuskyHook();
    expect(content).toContain('npx svelte-doctor . --score');
    // Must NOT have a shebang — husky v9 hooks are plain scripts
    expect(content).not.toMatch(/^#!/);
  });
});

describe('generateClaudeHook', () => {
  it('generates Claude Code Stop hook config', () => {
    const config = generateClaudeHook();
    expect(config).toHaveProperty('hooks.Stop');
    expect(config.hooks.Stop[0].hooks[0].type).toBe('command');
    expect(config.hooks.Stop[0].hooks[0].command).toContain('svelte-doctor');
    expect(config.hooks.Stop[0].hooks[0].command).toContain('--agent');
  });
});

describe('mergeClaudeSettings', () => {
  it('adds hooks to empty settings', () => {
    const result = mergeClaudeSettings('{}');
    const parsed = JSON.parse(result);
    expect(parsed.hooks.Stop).toBeDefined();
    expect(parsed.hooks.Stop[0].hooks[0].command).toContain('svelte-doctor');
  });

  it('preserves existing settings when merging', () => {
    const existing = JSON.stringify({ permissions: { allow: ['Read'] } }, null, 2);
    const result = mergeClaudeSettings(existing);
    const parsed = JSON.parse(result);
    expect(parsed.permissions.allow).toContain('Read');
    expect(parsed.hooks.Stop).toBeDefined();
  });

  it('preserves existing hooks when merging', () => {
    const existing = JSON.stringify({
      hooks: { PreToolUse: [{ hooks: [{ type: 'command', command: 'echo hi' }] }] }
    }, null, 2);
    const result = mergeClaudeSettings(existing);
    const parsed = JSON.parse(result);
    expect(parsed.hooks.PreToolUse).toBeDefined();
    expect(parsed.hooks.Stop).toBeDefined();
  });

  it('does not duplicate Stop hook if already present', () => {
    const hookConfig = generateClaudeHook();
    const existing = JSON.stringify(hookConfig, null, 2);
    const result = mergeClaudeSettings(existing);
    const parsed = JSON.parse(result);
    expect(parsed.hooks.Stop).toHaveLength(1);
  });
});
