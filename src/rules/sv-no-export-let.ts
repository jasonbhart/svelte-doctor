import { walk } from 'estree-walker';
import type { Rule } from '../types.js';

export const svNoExportLet: Rule = {
  id: 'sv-no-export-let',
  severity: 'error',
  applicableTo: ['svelte-component'],
  description: 'Flags legacy Svelte 4 export let props.',
  agentPrompt:
    'This is Svelte 5. Replace all `export let` props with a single `let { ...props } = $props()` destructuring.',
  analyze: (ast, context) => {
    if (!ast.instance) return;

    walk(ast.instance.content, {
      enter(node: any) {
        // Detect: export let prop
        if (
          node.type === 'ExportNamedDeclaration' &&
          node.declaration?.type === 'VariableDeclaration' &&
          node.declaration.kind === 'let'
        ) {
          context.report({
            node,
            message:
              'Legacy Svelte 4 `export let` prop detected. Use `let { prop } = $props()` instead.',
          });
        }
      },
    });
  },
  fix: (source) => {
    // Collect all export let declarations
    const exportLetRegex = /export\s+let\s+(\w+)(?:\s*=\s*([^;]+))?;/g;
    const props: string[] = [];
    let match;

    while ((match = exportLetRegex.exec(source)) !== null) {
      const name = match[1];
      const defaultVal = match[2]?.trim();
      props.push(defaultVal ? `${name} = ${defaultVal}` : name);
    }

    if (props.length === 0) return null;

    // Replace first export let with the $props() destructuring, remove the rest
    let replaced = false;
    let result = source.replace(exportLetRegex, () => {
      if (!replaced) {
        replaced = true;
        return `let { ${props.join(', ')} } = $props();`;
      }
      return ''; // Remove subsequent export let lines
    });

    // Clean up blank lines left by removed declarations
    result = result.replace(/\n\s*\n\s*\n/g, '\n\n');

    return result !== source ? result : null;
  },
};
