import { describe, it, expect } from 'vitest';
import { svRequireNativeEvents } from '../../src/rules/sv-require-native-events.js';
import { createAnalyzeFixture } from '../helpers/analyze-fixture.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

const analyzeFixture = createAnalyzeFixture(svRequireNativeEvents);

describe('sv-require-native-events', () => {
  it('flags on:click directive syntax', () => {
    const diagnostics = analyzeFixture('legacy-events.svelte');
    expect(diagnostics).toHaveLength(2); // on:click + on:keydown
    expect(diagnostics[0].message).toContain('on:');
  });

  it('flags on:event|modifier syntax with modifier-specific message', () => {
    const diagnostics = analyzeFixture('event-modifiers.svelte');
    expect(diagnostics).toHaveLength(2); // on:click|preventDefault + on:submit|preventDefault|stopPropagation
    expect(diagnostics[0].message).toContain('modifier');
    expect(diagnostics[0].message).toContain('preventDefault');
    expect(diagnostics[1].message).toContain('modifier');
  });

  it('passes modern onclick syntax', () => {
    const diagnostics = analyzeFixture('clean-events.svelte');
    expect(diagnostics).toHaveLength(0);
  });

  it('has correct metadata', () => {
    expect(svRequireNativeEvents.id).toBe('sv-require-native-events');
    expect(svRequireNativeEvents.severity).toBe('error');
    expect(svRequireNativeEvents.applicableTo).toContain('svelte-component');
  });

  it('fixes on:event to onevent (non-modifier cases)', () => {
    const fixturePath = path.join(__dirname, '../fixtures/legacy-events.svelte');
    const source = fs.readFileSync(fixturePath, 'utf-8');
    const fixed = svRequireNativeEvents.fix!(source, {} as any);
    expect(fixed).not.toBeNull();
    expect(fixed).toContain('onclick={handleClick}');
    expect(fixed).toContain('onkeydown={handleKey}');
    expect(fixed).not.toContain('on:click');
    expect(fixed).not.toContain('on:keydown');
  });

  it('does not fix on:event with modifiers', () => {
    const fixturePath = path.join(__dirname, '../fixtures/event-modifiers.svelte');
    const source = fs.readFileSync(fixturePath, 'utf-8');
    const fixed = svRequireNativeEvents.fix!(source, {} as any);
    // Modifier cases: on:click|preventDefault should NOT be changed to onclick|preventDefault
    // The regex on:(\w+)(\s*=) won't match on:click| because | is not = or whitespace
    // So modifier-only source returns null (no fixable patterns), leaving source untouched
    expect(fixed).toBeNull();
    // Verify the original source still has modifier syntax (untouched)
    expect(source).toContain('on:click|preventDefault');
    expect(source).toContain('on:submit|preventDefault');
  });
});
