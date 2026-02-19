import { walk } from 'estree-walker';
import type { Rule } from '../types.js';

export const perfNoLoadWaterfalls: Rule = {
  id: 'perf-no-load-waterfalls',
  severity: 'warning',
  applicableTo: ['page-server', 'layout-server', 'page-client', 'layout-client'],
  description: 'Detects sequential independent await calls in load() that could be parallelized.',
  agentPrompt:
    'These `await` calls appear independent and could run in parallel. Use `Promise.all()`: `const [a, b] = await Promise.all([fetchA(), fetchB()]);`',
  analyze: (ast, context) => {
    if (!ast.body) return;

    // Find the exported load function
    let loadBody: any[] | null = null;

    for (const node of ast.body) {
      if (
        node.type === 'ExportNamedDeclaration' &&
        node.declaration?.type === 'FunctionDeclaration' &&
        node.declaration.id?.name === 'load' &&
        node.declaration.async
      ) {
        loadBody = node.declaration.body?.body ?? null;
        break;
      }
    }

    if (!loadBody) return;

    // Collect top-level await statements
    const awaitStatements: { node: any; declaredNames: Set<string>; referencedNames: Set<string> }[] = [];

    for (const stmt of loadBody) {
      if (stmt.type === 'VariableDeclaration') {
        for (const decl of stmt.declarations) {
          if (decl.init?.type === 'AwaitExpression') {
            const declaredNames = new Set<string>();
            const referencedNames = new Set<string>();

            // Collect declared variable names
            if (decl.id?.type === 'Identifier') {
              declaredNames.add(decl.id.name);
            }

            // Collect referenced identifiers in the await expression
            walk(decl.init, {
              enter(n: any) {
                if (n.type === 'Identifier') {
                  referencedNames.add(n.name);
                }
              },
            });

            awaitStatements.push({ node: stmt, declaredNames, referencedNames });
          }
        }
      }
    }

    // Check consecutive pairs for independence
    for (let i = 1; i < awaitStatements.length; i++) {
      const prev = awaitStatements[i - 1];
      const curr = awaitStatements[i];

      // If current references nothing declared by previous, they're independent
      const isDependent = [...curr.referencedNames].some((name) =>
        prev.declaredNames.has(name)
      );

      if (!isDependent) {
        context.report({
          node: curr.node,
          message:
            'Potential waterfall: this `await` appears independent from the previous one. Consider `Promise.all()` for parallel execution.',
        });
      }
    }
  },
};
