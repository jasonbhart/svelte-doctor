import { walk } from 'estree-walker';
import type { Rule } from '../types.js';

const PRIVATE_ENV_MODULES = ['$env/static/private', '$env/dynamic/private'];

export const kitServerOnlySecrets: Rule = {
  id: 'kit-server-only-secrets',
  severity: 'error',
  applicableTo: ['svelte-component', 'page-client', 'layout-client', 'lib-client'],
  description: 'Flags private env variable imports in client-accessible files.',
  agentPrompt:
    'Private environment variables (`$env/static/private`, `$env/dynamic/private`) can ONLY be imported in server-side files. Use `$env/static/public` or `$env/dynamic/public` for client access.',
  analyze: (ast, context) => {
    // Determine which AST node to walk
    // For Svelte files: ast.instance?.content; for TS files: ast (the Program)
    const root = ast.instance?.content ?? ast;

    walk(root, {
      enter(node: any) {
        if (
          node.type === 'ImportDeclaration' &&
          PRIVATE_ENV_MODULES.includes(node.source?.value)
        ) {
          context.report({
            node,
            message: `\`${node.source.value}\` imported in client-accessible file. Private env vars can only be used in server files (+page.server.ts, +server.ts, src/lib/server/).`,
          });
        }
      },
    });
  },
};
