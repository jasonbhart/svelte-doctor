import { walk } from 'estree-walker';
import type { Rule } from '../types.js';

export const svReactivityLossPrimitive: Rule = {
  id: 'sv-reactivity-loss-primitive',
  severity: 'warning',
  applicableTo: ['svelte-component'],
  description: 'Flags $props variables passed as function arguments, which may lose reactivity.',
  agentPrompt:
    'Passing a `$props()` variable directly to a function captures its current value, losing reactivity. Wrap in a getter: `() => propVar` or use `$derived()` to compute the result reactively.',
  analyze: (ast, context) => {
    if (!ast.instance) return;

    // Step 1: Collect $props() variable names
    const propsVars = new Set<string>();
    walk(ast.instance.content, {
      enter(node: any) {
        if (node.type === 'VariableDeclaration') {
          for (const decl of node.declarations) {
            if (
              decl.init?.type === 'CallExpression' &&
              decl.init.callee?.name === '$props' &&
              decl.id?.type === 'ObjectPattern'
            ) {
              for (const prop of decl.id.properties) {
                if (prop.type === 'Property' && prop.value?.type === 'Identifier') {
                  propsVars.add(prop.value.name);
                } else if (prop.type === 'Property' && prop.value?.type === 'AssignmentPattern') {
                  if (prop.value.left?.name) {
                    propsVars.add(prop.value.left.name);
                  }
                }
              }
            }
          }
        }
      },
    });

    if (propsVars.size === 0) return;

    // Step 2: Find function calls in the script (not template) that pass $props vars directly
    walk(ast.instance.content, {
      enter(node: any) {
        if (
          node.type === 'CallExpression' &&
          node.callee?.type === 'Identifier' &&
          // Skip reactive runes — they handle reactivity correctly
          !['$derived', '$effect', '$state', '$props', '$bindable', '$inspect'].includes(node.callee.name)
        ) {
          for (const arg of node.arguments ?? []) {
            if (arg.type === 'Identifier' && propsVars.has(arg.name)) {
              context.report({
                node: arg,
                message: `Prop \`${arg.name}\` passed directly to \`${node.callee.name}()\` may lose reactivity. Wrap in a getter \`() => ${arg.name}\` or use \`$derived()\`.`,
              });
            }
          }
        }
      },
    });
  },
};
