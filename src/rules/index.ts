// Rules from Tasks 7-13
import { svNoExportLet } from './sv-no-export-let.js';
import { svNoEffectStateMutation } from './sv-no-effect-state-mutation.js';
import { svPreferSnippets } from './sv-prefer-snippets.js';
import { svNoEventDispatcher } from './sv-no-event-dispatcher.js';
import { svRequireNativeEvents } from './sv-require-native-events.js';
import { kitNoSharedServerState } from './kit-no-shared-server-state.js';
import { kitServerOnlySecrets } from './kit-server-only-secrets.js';
import { kitRequireUseEnhance } from './kit-require-use-enhance.js';
import { perfNoLoadWaterfalls } from './perf-no-load-waterfalls.js';
import type { Rule } from '../types.js';

export const allRules: Rule[] = [
  // Migration rules (sv-*)
  svNoExportLet,
  svNoEffectStateMutation,
  svPreferSnippets,
  svNoEventDispatcher,
  svRequireNativeEvents,
  // SvelteKit rules (kit-*)
  kitNoSharedServerState,
  kitServerOnlySecrets,
  kitRequireUseEnhance,
  // Performance rules (perf-*)
  perfNoLoadWaterfalls,
];

export {
  svNoExportLet,
  svNoEffectStateMutation,
  svPreferSnippets,
  svNoEventDispatcher,
  svRequireNativeEvents,
  kitNoSharedServerState,
  kitServerOnlySecrets,
  kitRequireUseEnhance,
  perfNoLoadWaterfalls,
};
