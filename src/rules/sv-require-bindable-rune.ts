import { walk } from 'estree-walker';
import type { Rule } from '../types.js';

export const svRequireBindableRune: Rule = {
  id: 'sv-require-bindable-rune',
  severity: 'warning',
  applicableTo: ['svelte-component'],
  description: 'Flags assignment to $props() variables without $bindable().',
  agentPrompt:
    'Assigning to a prop variable requires `$bindable()`. Change `let { prop } = $props()` to `let { prop = $bindable() } = $props()` if you need two-way binding, or restructure to avoid mutation.',
  analyze: (ast, context) => {
    if (!ast.instance) return;

    // Step 1: Collect $props() variables and which ones use $bindable
    const propsVars = new Set<string>();
    const bindableVars = new Set<string>();

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
                  const varName = prop.value.left?.name;
                  if (varName) {
                    propsVars.add(varName);
                    // Check if default is $bindable()
                    if (
                      prop.value.right?.type === 'CallExpression' &&
                      prop.value.right.callee?.name === '$bindable'
                    ) {
                      bindableVars.add(varName);
                    }
                  }
                }
              }
            }
          }
        }
      },
    });

    if (propsVars.size === 0) return;

    // Step 2: Find assignments to non-bindable $props variables
    walk(ast.instance.content, {
      enter(node: any) {
        if (
          node.type === 'AssignmentExpression' &&
          node.left?.type === 'Identifier' &&
          propsVars.has(node.left.name) &&
          !bindableVars.has(node.left.name)
        ) {
          context.report({
            node,
            message: `Prop \`${node.left.name}\` is mutated but not declared with \`$bindable()\`. Use \`let { ${node.left.name} = $bindable() } = $props()\` for two-way binding.`,
          });
        }
      },
    });
  },
};
