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
