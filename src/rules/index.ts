// Migration rules (sv-*)
import { svNoExportLet } from './sv-no-export-let.js';
import { svNoReactiveStatements } from './sv-no-reactive-statements.js';
import { svNoEffectStateMutation } from './sv-no-effect-state-mutation.js';
import { svPreferSnippets } from './sv-prefer-snippets.js';
import { svNoEventDispatcher } from './sv-no-event-dispatcher.js';
import { svRequireNativeEvents } from './sv-require-native-events.js';
import { svNoComponentConstructor } from './sv-no-component-constructor.js';
import { svPreferDerivedOverEffect } from './sv-prefer-derived-over-effect.js';
import { svNoStaleDerivedLet } from './sv-no-stale-derived-let.js';
import { svRequireBindableRune } from './sv-require-bindable-rune.js';
import { svReactivityLossPrimitive } from './sv-reactivity-loss-primitive.js';
import { svNoMagicProps } from './sv-no-magic-props.js';
import { svNoSvelteComponent } from './sv-no-svelte-component.js';
// SvelteKit rules (kit-*)
import { kitNoSharedServerState } from './kit-no-shared-server-state.js';
import { kitServerOnlySecrets } from './kit-server-only-secrets.js';
import { kitRequireUseEnhance } from './kit-require-use-enhance.js';
import { kitNoGotoInServer } from './kit-no-goto-in-server.js';
// Performance rules (perf-*)
import { perfNoLoadWaterfalls } from './perf-no-load-waterfalls.js';
import { perfPreferStateRaw } from './perf-prefer-state-raw.js';
import { perfNoFunctionDerived } from './perf-no-function-derived.js';
import type { Rule } from '../types.js';

export const allRules: Rule[] = [
  // Migration rules (sv-*)
  svNoExportLet,
  svNoReactiveStatements,
  svNoEffectStateMutation,
  svPreferSnippets,
  svNoEventDispatcher,
  svRequireNativeEvents,
  svNoComponentConstructor,
  svPreferDerivedOverEffect,
  svNoStaleDerivedLet,
  svRequireBindableRune,
  svReactivityLossPrimitive,
  svNoMagicProps,
  svNoSvelteComponent,
  // SvelteKit rules (kit-*)
  kitNoSharedServerState,
  kitServerOnlySecrets,
  kitRequireUseEnhance,
  kitNoGotoInServer,
  // Performance rules (perf-*)
  perfNoLoadWaterfalls,
  perfPreferStateRaw,
  perfNoFunctionDerived,
];

export {
  svNoExportLet,
  svNoReactiveStatements,
  svNoEffectStateMutation,
  svPreferSnippets,
  svNoEventDispatcher,
  svRequireNativeEvents,
  svNoComponentConstructor,
  svPreferDerivedOverEffect,
  svNoStaleDerivedLet,
  svRequireBindableRune,
  svReactivityLossPrimitive,
  svNoMagicProps,
  svNoSvelteComponent,
  kitNoSharedServerState,
  kitServerOnlySecrets,
  kitRequireUseEnhance,
  kitNoGotoInServer,
  perfNoLoadWaterfalls,
  perfPreferStateRaw,
  perfNoFunctionDerived,
};
