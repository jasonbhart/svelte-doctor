import { walk } from 'estree-walker';
import type { Rule } from '../types.js';

export const kitNoGotoInServer: Rule = {
  id: 'kit-no-goto-in-server',
  severity: 'error',
  applicableTo: ['page-server', 'layout-server', 'server-endpoint'],
  description: 'Flags goto() import from $app/navigation in server files.',
  agentPrompt:
    '`goto()` is a client-side navigation function and cannot be used in server files. Use `throw redirect(302, url)` from `@sveltejs/kit` instead.',
  analyze: (ast, context) => {
    if (!ast.body) return;

    walk(ast, {
      enter(node: any) {
        if (
          node.type === 'ImportDeclaration' &&
          node.source?.value === '$app/navigation'
        ) {
          const hasGoto = node.specifiers?.some(
            (s: any) =>
              s.type === 'ImportSpecifier' &&
              (s.imported?.name === 'goto' || s.local?.name === 'goto')
          );
          if (hasGoto) {
            context.report({
              node,
              message: '`goto()` from `$app/navigation` cannot be used in server files. Use `throw redirect(302, url)` from `@sveltejs/kit` instead.',
            });
          }
        }
      },
    });
  },
};
