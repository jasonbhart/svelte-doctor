import { describe, it, expect } from 'vitest';
import { svNoEventDispatcher } from '../../src/rules/sv-no-event-dispatcher.js';
import { createAnalyzeFixture } from '../helpers/analyze-fixture.js';

const analyzeFixture = createAnalyzeFixture(svNoEventDispatcher);

describe('sv-no-event-dispatcher', () => {
  it('flags createEventDispatcher import', () => {
    const diagnostics = analyzeFixture('legacy-dispatcher.svelte');
    expect(diagnostics.length).toBeGreaterThanOrEqual(1);
    expect(diagnostics[0].message).toContain('createEventDispatcher');
  });

  it('passes callback prop pattern', () => {
    const diagnostics = analyzeFixture('clean-callback-props.svelte');
    expect(diagnostics).toHaveLength(0);
  });
});
