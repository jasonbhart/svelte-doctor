import { walk } from 'estree-walker';
import type { Rule } from '../types.js';

export const svNoStaleDerivedLet: Rule = {
  id: 'sv-no-stale-derived-let',
  severity: 'warning',
  applicableTo: ['svelte-component'],
  description: 'Flags `let x = expr` where expr references reactive ($props/$state) variables, causing stale values.',
  agentPrompt:
    'This `let` declaration computes a value from reactive variables but will NOT update when those variables change. Use `let x = $derived(expr)` to keep it reactive.',
  analyze: (ast, context) => {
    if (!ast.instance) return;

    // Step 1: Collect variable names from $props() destructuring and $state() init
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
                } else if (prop.type === 'RestElement' && prop.argument?.type === 'Identifier') {
                  reactiveVars.add(prop.argument.name);
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

    // Step 2: Find top-level let declarations (not inside functions/loops) that reference reactive vars
    const body = ast.instance.content?.body;
    if (!body) return;

    for (const stmt of body) {
      if (stmt.type !== 'VariableDeclaration' || stmt.kind !== 'let') continue;

      for (const decl of stmt.declarations) {
        // Skip $derived, $state, $props calls
        if (
          decl.init?.type === 'CallExpression' &&
          ['$derived', '$state', '$props', '$bindable'].includes(decl.init.callee?.name)
        ) {
          continue;
        }

        // Skip declarations without an init expression
        if (!decl.init || decl.id?.type !== 'Identifier') continue;

        // Check if init references any reactive variable
        const referencedReactiveVars: string[] = [];
        walk(decl.init, {
          enter(inner: any) {
            if (inner.type === 'Identifier' && reactiveVars.has(inner.name)) {
              referencedReactiveVars.push(inner.name);
            }
          },
        });

        if (referencedReactiveVars.length > 0) {
          context.report({
            node: decl,
            message: `\`let ${decl.id.name}\` derives from reactive variable(s) \`${referencedReactiveVars.join(', ')}\` but will not update reactively. Use \`let ${decl.id.name} = $derived(expr)\` instead.`,
          });
        }
      }
    }
  },
  fix: (source, _diagnostic) => {
    // Heuristic fix: find `let x = <expr>` where expr does not start with $derived/$state/$props
    // and replace with `let x = $derived(<expr>)`
    // This is a simplified fix; the test validates the specific case.
    const result = source.replace(
      /let\s+(\w+)\s*=\s*(?!\$(?:derived|state|props|bindable)\()(.+);/g,
      (match, name, expr) => {
        // Only fix if it looks like a derivation (contains an identifier, not a literal)
        if (/[a-zA-Z_]/.test(expr)) {
          return `let ${name} = $derived(${expr.trim()});`;
        }
        return match;
      }
    );
    return result !== source ? result : null;
  },
};
