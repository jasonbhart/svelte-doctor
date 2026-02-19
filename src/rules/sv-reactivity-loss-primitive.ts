import { walk } from 'estree-walker';
import type { Rule } from '../types.js';

export const svReactivityLossPrimitive: Rule = {
  id: 'sv-reactivity-loss-primitive',
  severity: 'warning',
  applicableTo: ['svelte-component'],
  description: 'Flags $props or $state variables passed as function arguments, which may lose reactivity.',
  agentPrompt:
    'Passing a `$props()` or `$state()` variable directly to a function captures its current value, losing reactivity. Wrap in a getter: `() => reactiveVar` or use `$derived()` to compute the result reactively.',
  analyze: (ast, context) => {
    if (!ast.instance) return;

    // Step 1: Collect reactive variable names from $props() and $state()
    const reactiveVars = new Set<string>();
    walk(ast.instance.content, {
      enter(node: any) {
        if (node.type === 'VariableDeclaration') {
          for (const decl of node.declarations) {
            // Detect: let { a, b } = $props()
            if (
              decl.init?.type === 'CallExpression' &&
              decl.init.callee?.name === '$props' &&
              decl.id?.type === 'ObjectPattern'
            ) {
              for (const prop of decl.id.properties) {
                if (prop.type === 'Property' && prop.value?.type === 'Identifier') {
                  reactiveVars.add(prop.value.name);
                } else if (prop.type === 'Property' && prop.value?.type === 'AssignmentPattern') {
                  if (prop.value.left?.name) {
                    reactiveVars.add(prop.value.left.name);
                  }
                }
              }
            }
            // Detect: let x = $state(...)
            if (
              decl.init?.type === 'CallExpression' &&
              decl.init.callee?.name === '$state' &&
              decl.id?.type === 'Identifier'
            ) {
              reactiveVars.add(decl.id.name);
            }
          }
        }
      },
    });

    if (reactiveVars.size === 0) return;

    // Reactive rune names that handle reactivity correctly
    const REACTIVE_RUNES = new Set([
      '$derived', '$effect', '$state', '$props', '$bindable', '$inspect',
    ]);

    // Step 2: Find function calls at top-level scope only (not inside functions,
    // $derived, or $effect which already handle reactivity)
    // Only walk the top-level body statements of the script block
    const body = ast.instance.content?.body;
    if (!body) return;

    for (const stmt of body) {
      // Only check top-level VariableDeclaration initializers like:
      //   let result = fn(propVar)
      if (stmt.type === 'VariableDeclaration') {
        for (const decl of stmt.declarations) {
          if (!decl.init) continue;

          // Skip if the init is a reactive rune call (e.g. $derived(fn(prop)))
          if (
            decl.init.type === 'CallExpression' &&
            decl.init.callee?.type === 'Identifier' &&
            REACTIVE_RUNES.has(decl.init.callee.name)
          ) {
            continue;
          }

          // Check if init is a plain function call with a reactive variable argument
          if (
            decl.init.type === 'CallExpression' &&
            decl.init.callee?.type === 'Identifier' &&
            !REACTIVE_RUNES.has(decl.init.callee.name)
          ) {
            for (const arg of decl.init.arguments ?? []) {
              if (arg.type === 'Identifier' && reactiveVars.has(arg.name)) {
                context.report({
                  node: arg,
                  message: `Reactive variable \`${arg.name}\` passed directly to \`${decl.init.callee.name}()\` captures its current value, losing reactivity. Wrap in \`$derived()\`: \`let ${decl.id?.name ?? 'x'} = $derived(${decl.init.callee.name}(${arg.name}))\`.`,
                });
              }
            }
          }
        }
      }
    }
  },
};
