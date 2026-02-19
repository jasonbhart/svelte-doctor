import { walk } from 'estree-walker';
import type { Rule } from '../types.js';

export const svNoComponentConstructor: Rule = {
  id: 'sv-no-component-constructor',
  severity: 'error',
  applicableTo: ['svelte-component', 'lib-client', 'lib-server'],
  description: 'Flags legacy `new Component({ target })` constructor pattern.',
  agentPrompt:
    'Svelte 5 removes the class-based component constructor. Use `import { mount } from \'svelte\'; mount(Component, { target })` instead of `new Component({ target })`.',
  analyze: (ast, context) => {
    // For Svelte files, walk ast.instance.content; for TS/JS files, walk ast.body
    const root = ast.instance?.content ?? ast;
    if (!root) return;

    walk(root, {
      enter(node: any) {
        if (
          node.type === 'NewExpression' &&
          node.arguments?.[0]?.type === 'ObjectExpression'
        ) {
          const hasTarget = node.arguments[0].properties?.some(
            (p: any) =>
              p.type === 'Property' &&
              (p.key?.name === 'target' || p.key?.value === 'target')
          );
          if (hasTarget) {
            const name = node.callee?.name ?? 'Component';
            context.report({
              node,
              message: `Legacy component constructor \`new ${name}({ target })\` detected. Use \`mount(${name}, { target })\` from \`svelte\` instead.`,
            });
          }
        }
      },
    });
  },
  fix: (source) => {
    // Only match new X({ ...target:... }) - component constructors have a target property
    const result = source.replace(
      /new\s+(\w+)\s*\(\s*(\{[\s\S]*?\btarget\b[\s\S]*?\})\s*\)/g,
      'mount($1, $2)'
    );

    if (result === source) return null;

    // Add import { mount } from 'svelte' if not already present
    if (!result.includes("import { mount }") && !result.includes("import {mount}")) {
      return `import { mount } from 'svelte';\n${result}`;
    }

    return result;
  },
};
