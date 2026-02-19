import type { Rule } from '../types.js';

export const kitNoSharedServerState: Rule = {
  id: 'kit-no-shared-server-state',
  severity: 'error',
  applicableTo: ['page-server', 'layout-server', 'server-endpoint'],
  description: 'Flags mutable module-level state in server files (cross-request data leak).',
  agentPrompt:
    'CRITICAL: Module-level `let` in server files creates shared mutable state across all requests. Move per-request state to `event.locals` or inside the function body.',
  analyze: (ast, context) => {
    // ast is oxc-parser Program — walk top-level body only
    if (!ast.body) return;

    for (const node of ast.body) {
      if (node.type === 'VariableDeclaration' && node.kind === 'let') {
        for (const decl of node.declarations) {
          const name = decl.id?.name ?? 'unknown';
          context.report({
            node,
            message: `Module-level \`let ${name}\` in server file creates shared mutable state across all requests. Move to \`event.locals\` or inside the handler function.`,
          });
        }
      }
    }
  },
};
