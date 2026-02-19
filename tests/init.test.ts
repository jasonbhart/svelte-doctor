import { describe, it, expect } from 'vitest';
import { generateCursorRules, generateClaudeSkill, generateGitHubWorkflow, generateHuskyHook } from '../src/init.js';

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
