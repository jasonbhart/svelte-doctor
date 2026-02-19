import { walk } from 'estree-walker';
import type { Rule } from '../types.js';

export const perfNoFunctionDerived: Rule = {
  id: 'perf-no-function-derived',
  severity: 'warning',
  applicableTo: ['svelte-component'],
  description: 'Flags $derived(() => expr) which should be $derived(expr).',
  agentPrompt:
    '`$derived(() => expr)` wraps the expression in an unnecessary arrow function. Use `$derived(expr)` directly for better readability and slight performance improvement. Use `$derived.by(() => { ... })` only for multi-statement derivations.',
  analyze: (ast, context) => {
    if (!ast.instance) return;

    walk(ast.instance.content, {
      enter(node: any) {
        if (
          node.type === 'VariableDeclaration'
        ) {
          for (const decl of node.declarations) {
            if (
              decl.init?.type === 'CallExpression' &&
              decl.init.callee?.name === '$derived' &&
              decl.init.arguments?.[0]?.type === 'ArrowFunctionExpression' &&
              decl.init.arguments[0].expression === true // expression body, not block body
            ) {
              const varName = decl.id?.name ?? 'variable';
              context.report({
                node: decl,
                message: `\`$derived(() => expr)\` for \`${varName}\` should be \`$derived(expr)\`. Remove the arrow function wrapper.`,
              });
            }
          }
        }
      },
    });
  },
  fix: (source, _diagnostic) => {
    // Fix $derived(() => expr) -> $derived(expr)
    const result = source.replace(
      /\$derived\(\(\)\s*=>\s*([^)]+)\)/g,
      '$derived($1)'
    );
    return result !== source ? result : null;
  },
};
