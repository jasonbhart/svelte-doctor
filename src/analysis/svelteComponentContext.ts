import { walk } from 'estree-walker';

export interface WriteSite {
  kind: 'effect' | 'function' | 'handler' | 'top-level';
  node: any;
  effectNode?: any;
}

export interface SvelteComponentContext {
  stateVars: Set<string>;
  bindableVars: Set<string>;
  derivedVars: Set<string>;
  propsVars: Set<string>;
  writeSites: Map<string, WriteSite[]>;
}

/**
 * Walk a Svelte component AST once and collect variable classification
 * and per-variable write-site information for use by multiple rules.
 */
export function buildComponentContext(ast: any): SvelteComponentContext | null {
  if (!ast.instance) return null;

  const stateVars = new Set<string>();
  const bindableVars = new Set<string>();
  const derivedVars = new Set<string>();
  const propsVars = new Set<string>();
  const writeSites = new Map<string, WriteSite[]>();

  function addWriteSite(varName: string, site: WriteSite) {
    let sites = writeSites.get(varName);
    if (!sites) {
      sites = [];
      writeSites.set(varName, sites);
    }
    sites.push(site);
  }

  // ============================================
  // Pass 1: Collect variable declarations
  // ============================================
  walk(ast.instance.content, {
    enter(node: any) {
      if (node.type !== 'VariableDeclaration') return;

      for (const decl of node.declarations) {
        const init = decl.init;
        if (!init || init.type !== 'CallExpression') continue;

        const callee = init.callee?.name;

        // $state()
        if (callee === '$state' && decl.id?.type === 'Identifier') {
          stateVars.add(decl.id.name);
        }

        // $derived()
        if (callee === '$derived' && decl.id?.type === 'Identifier') {
          derivedVars.add(decl.id.name);
        }

        // $props() with possible $bindable() defaults
        if (callee === '$props' && decl.id?.type === 'ObjectPattern') {
          for (const prop of decl.id.properties) {
            if (prop.type === 'Property' && prop.value?.type === 'Identifier') {
              propsVars.add(prop.value.name);
            } else if (prop.type === 'Property' && prop.value?.type === 'AssignmentPattern') {
              const varName = prop.value.left?.name;
              if (varName) {
                propsVars.add(varName);
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
    },
  });

  // ============================================
  // Pass 2: Classify assignment write sites
  // ============================================
  // We need to track scope context during the walk.
  // Build a parent stack to determine if an assignment is inside an $effect, function, or top-level.

  const parentStack: any[] = [];

  walk(ast.instance.content, {
    enter(node: any) {
      parentStack.push(node);

      let varName: string | null = null;

      if (node.type === 'AssignmentExpression' && node.left?.type === 'Identifier') {
        varName = node.left.name;
      } else if (node.type === 'UpdateExpression' && node.argument?.type === 'Identifier') {
        varName = node.argument.name;
      }

      if (varName) {
        const site = classifyWriteSite(parentStack, node);
        addWriteSite(varName, site);
      }
    },
    leave() {
      parentStack.pop();
    },
  });

  return { stateVars, bindableVars, derivedVars, propsVars, writeSites };
}

/**
 * Determine the kind of write site by examining the parent stack.
 * Innermost relevant scope wins.
 */
function classifyWriteSite(parentStack: any[], assignmentNode: any): WriteSite {
  // Walk the parent stack from innermost to outermost (skip the assignment itself at the end)
  for (let i = parentStack.length - 1; i >= 0; i--) {
    const ancestor = parentStack[i];

    // Check if this is an $effect callback
    if (
      ancestor.type === 'ArrowFunctionExpression' ||
      ancestor.type === 'FunctionExpression'
    ) {
      // Check if the parent of this function is a CallExpression to $effect
      const grandparent = i > 0 ? parentStack[i - 1] : null;
      if (
        grandparent?.type === 'CallExpression' &&
        grandparent.callee?.name === '$effect'
      ) {
        // Find the ExpressionStatement wrapping the $effect call
        const effectStmt = i > 1 ? parentStack[i - 2] : grandparent;
        return { kind: 'effect', node: assignmentNode, effectNode: effectStmt };
      }

      // It's inside some other function (event handler, helper, etc.)
      return { kind: 'function', node: assignmentNode };
    }
  }

  // If not inside any function, it's top-level script
  return { kind: 'top-level', node: assignmentNode };
}

/**
 * Check if an identifier name is reactively read within an effect body.
 * Excludes:
 *  - LHS of assignments (writes, not reads)
 *  - MemberExpression property identifiers (e.g. `now` in `Date.now()`)
 *  - Reads inside `untrack()` calls (not tracked by Svelte reactivity)
 *  - Reads inside nested functions (callbacks/handlers run outside effect tracking)
 */
export function isIdentifierReadInSubtree(subtree: any, varName: string): boolean {
  let found = false;

  walk(subtree, {
    enter(node: any, parent: any) {
      if (found) {
        this.skip();
        return;
      }

      // Skip inside untrack() calls — reads there aren't tracked reactively
      if (
        node.type === 'CallExpression' &&
        node.callee?.type === 'Identifier' &&
        node.callee.name === 'untrack'
      ) {
        this.skip();
        return;
      }

      // Skip nested functions — they run outside the effect's tracking scope
      // (event handlers, setTimeout callbacks, etc.)
      if (
        node !== subtree &&
        (node.type === 'ArrowFunctionExpression' ||
         node.type === 'FunctionExpression' ||
         node.type === 'FunctionDeclaration')
      ) {
        this.skip();
        return;
      }

      if (node.type === 'Identifier' && node.name === varName) {
        // Exclude LHS of assignments
        if (
          parent?.type === 'AssignmentExpression' &&
          parent.left === node
        ) {
          return;
        }

        // Exclude non-computed MemberExpression properties (e.g. `now` in `Date.now()`)
        if (
          parent?.type === 'MemberExpression' &&
          parent.property === node &&
          !parent.computed
        ) {
          return;
        }

        found = true;
      }
    },
  });

  return found;
}

/**
 * Check if an effect callback is async or contains await.
 */
export function isAsyncEffect(callback: any): boolean {
  if (callback.async) return true;

  let hasAwait = false;
  walk(callback, {
    enter(node: any) {
      if (hasAwait) {
        this.skip();
        return;
      }
      if (node.type === 'AwaitExpression') {
        hasAwait = true;
      }
      // Don't descend into nested functions — their async/await is independent
      if (
        node !== callback &&
        (node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression' || node.type === 'FunctionDeclaration')
      ) {
        this.skip();
      }
    },
  });

  return hasAwait;
}

/**
 * Check if an effect callback has a cleanup return (returns a function).
 */
export function hasCleanupReturn(callback: any): boolean {
  const body = callback.body;
  if (body?.type !== 'BlockStatement') return false;

  const stmts = body.body;
  if (!stmts || stmts.length === 0) return false;

  const lastStmt = stmts[stmts.length - 1];
  return lastStmt.type === 'ReturnStatement' && lastStmt.argument != null;
}
