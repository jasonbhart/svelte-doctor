import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { generateCursorRules, generateClaudeSkill, generateGitHubWorkflow, generateHuskyHook, generateClaudeHook, mergeClaudeSettings, runInit } from '../src/init.js';

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

describe('runInit', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'svelte-doctor-init-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates all integration files in a fresh directory', () => {
    runInit(tmpDir);

    // Agent context files (existing behavior)
    expect(fs.existsSync(path.join(tmpDir, '.cursorrules'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.windsurfrules'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'skills', 'svelte-doctor.md'))).toBe(true);

    // New integration files
    expect(fs.existsSync(path.join(tmpDir, '.github', 'workflows', 'svelte-doctor.yml'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.husky', 'svelte-doctor'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.claude', 'settings.json'))).toBe(true);

    // Verify content
    const workflow = fs.readFileSync(path.join(tmpDir, '.github', 'workflows', 'svelte-doctor.yml'), 'utf-8');
    expect(workflow).toContain('npx svelte-doctor . --score');

    const huskyHook = fs.readFileSync(path.join(tmpDir, '.husky', 'svelte-doctor'), 'utf-8');
    expect(huskyHook).toContain('npx svelte-doctor . --score');

    const settings = JSON.parse(fs.readFileSync(path.join(tmpDir, '.claude', 'settings.json'), 'utf-8'));
    expect(settings.hooks.Stop[0].hooks[0].command).toContain('svelte-doctor');
  });

  it('skips GitHub workflow if already exists', () => {
    const workflowDir = path.join(tmpDir, '.github', 'workflows');
    fs.mkdirSync(workflowDir, { recursive: true });
    fs.writeFileSync(path.join(workflowDir, 'svelte-doctor.yml'), 'custom workflow', 'utf-8');

    runInit(tmpDir);

    const workflow = fs.readFileSync(path.join(workflowDir, 'svelte-doctor.yml'), 'utf-8');
    expect(workflow).toBe('custom workflow');
  });

  it('skips Husky hook if already exists', () => {
    const huskyDir = path.join(tmpDir, '.husky');
    fs.mkdirSync(huskyDir, { recursive: true });
    fs.writeFileSync(path.join(huskyDir, 'svelte-doctor'), 'custom hook', 'utf-8');

    runInit(tmpDir);

    const hook = fs.readFileSync(path.join(huskyDir, 'svelte-doctor'), 'utf-8');
    expect(hook).toBe('custom hook');
  });

  it('merges into existing .claude/settings.json', () => {
    const claudeDir = path.join(tmpDir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(
      path.join(claudeDir, 'settings.json'),
      JSON.stringify({ permissions: { allow: ['Read'] } }, null, 2),
      'utf-8'
    );

    runInit(tmpDir);

    const settings = JSON.parse(fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf-8'));
    expect(settings.permissions.allow).toContain('Read');
    expect(settings.hooks.Stop).toBeDefined();
  });
});
