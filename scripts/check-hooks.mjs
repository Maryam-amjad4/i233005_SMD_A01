#!/usr/bin/env node
/**
 * Rules-of-Hooks check for React components.
 *
 * Metro bundles happily compile a component whose hooks sit after an early
 * `return`, or inside an `if`. The app then crashes the first time that branch
 * is taken, and only on a device. This script parses every source file with
 * @babel/parser and flags both classes of bug:
 *
 *   1. a hook called after a top-level `return` in the same function
 *   2. a hook called inside a conditional, a loop, a switch or a nested block
 *
 * Nested function scopes (a component defined inside another, a callback) are
 * treated as separate scopes, since each may call hooks legitimately.
 *
 * Idempotent, non-interactive. Usage: node scripts/check-hooks.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@babel/parser';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const HOOKS = new Set([
  'useState', 'useEffect', 'useLayoutEffect', 'useInsertionEffect', 'useMemo', 'useCallback',
  'useRef', 'useReducer', 'useContext', 'useImperativeHandle', 'useDebugValue', 'useId',
]);

const FUNCTION_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression', 'ObjectMethod', 'ClassMethod']);

function walkFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkFiles(full, out);
    else if (entry.endsWith('.js')) out.push(full);
  }
  return out;
}

const problems = [];

/** True when a call expression is a hook call. */
function hookName(node) {
  if (node.type !== 'CallExpression') return null;
  const callee = node.callee;
  return callee.type === 'Identifier' && HOOKS.has(callee.name) ? callee.name : null;
}

/** Children of a node, skipping bookkeeping fields. */
function children(node) {
  const out = [];
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments' || key === 'innerComments') continue;
    const value = node[key];
    if (Array.isArray(value)) value.forEach((item) => item && typeof item.type === 'string' && out.push(item));
    else if (value && typeof value.type === 'string') out.push(value);
  }
  return out;
}

function report(file, node, message) {
  const line = node.loc ? node.loc.start.line : 0;
  problems.push(`${relative(ROOT, file)}:${line} ${message}`);
}

/**
 * Inspect one function scope.
 * `inBranch` is true when this scope is a conditional/loop body inside the
 * function, which is exactly the situation where hook order becomes unstable.
 */
function inspectFunctionScope(node, file, label) {
  const body = node.body;
  if (!body || body.type !== 'BlockStatement') return;

  let afterReturn = false;
  for (const statement of body.body) {
    if (statement.type === 'ReturnStatement' || statement.type === 'ThrowStatement') {
      afterReturn = true;
      continue;
    }
    walkStatement(statement, file, label, afterReturn);
  }
}

/**
 * Walk statements inside a function scope. `afterReturn` marks statements that
 * follow a top-level return; hooks found there break hook ordering.
 */
function walkStatement(node, file, label, afterReturn) {
  if (FUNCTION_TYPES.has(node.type)) {
    // A new scope: inspect it independently (callbacks and nested components).
    inspectFunctionScope(node, file, node.id?.name || 'nested scope');
    return;
  }

  if (node.type === 'ExpressionStatement') {
    const name = hookName(node.expression);
    if (name) {
      if (afterReturn) report(file, node, `${name}() is called after a return statement`);
      return;
    }
  }

  if (node.type === 'VariableDeclaration') {
    for (const declarator of node.declarations || []) {
      const name = declarator.init ? hookName(declarator.init) : null;
      if (name) {
        if (afterReturn) report(file, declarator, `${name}() is called after a return statement`);
        continue;
      }
      // `const x = useMemo(...)` may be wrapped: `useMemo(...) || fallback`.
      if (declarator.init) walkExpression(declarator.init, file, label, afterReturn);
    }
    return;
  }

  // Any block-like construct can contain statements; keep descending, but mark
  // branches so a hook inside them is reported.
  const inBranch = node.type === 'IfStatement' || node.type === 'SwitchStatement' || node.type === 'TryStatement' ||
    node.type === 'CatchClause' || node.type === 'WhileStatement' || node.type === 'DoWhileStatement' ||
    node.type === 'ForStatement' || node.type === 'ForInStatement' || node.type === 'ForOfStatement' ||
    node.type === 'LogicalExpression' || node.type === 'ConditionalExpression' || node.type === 'SwitchCase';

  for (const child of children(node)) {
    if (child.type === 'FunctionDeclaration' || child.type === 'FunctionExpression' || child.type === 'ArrowFunctionExpression') {
      inspectFunctionScope(child, file, child.id?.name || 'nested scope');
      continue;
    }
    if (inBranch) {
      const found = firstHookIn(child);
      if (found) {
        report(file, child, `${found}() appears inside a conditional, loop or callback expression`);
        continue;
      }
    }
    walkStatement(child, file, label, afterReturn);
  }
}

function walkExpression(node, file, label, afterReturn) {
  if (!node || typeof node.type !== 'string') return;
  if (FUNCTION_TYPES.has(node.type)) {
    inspectFunctionScope(node, file, 'callback scope');
    return;
  }
  if (node.type === 'CallExpression') {
    const name = hookName(node);
    if (name && afterReturn) report(file, node, `${name}() is called after a return statement`);
  }
  children(node).forEach((child) => walkExpression(child, file, label, afterReturn));
}

/** Shallow scan for a hook call that is not wrapped in another function. */
function firstHookIn(node) {
  if (!node || typeof node.type !== 'string') return null;
  const name = hookName(node);
  if (name) return name;
  for (const child of children(node)) {
    if (FUNCTION_TYPES.has(child.type)) continue;
    const found = firstHookIn(child);
    if (found) return found;
  }
  return null;
}

const files = [...walkFiles(join(ROOT, 'src')), join(ROOT, 'App.js')];
for (const file of files) {
  if (!statSync(file).isFile()) continue;
  let ast;
  try {
    ast = parse(readFileSync(file, 'utf8'), { sourceType: 'module', plugins: ['jsx'] });
  } catch (error) {
    problems.push(`${relative(ROOT, file)}: parse error — ${error.message}`);
    continue;
  }
  for (const statement of ast.program.body) {
    if (FUNCTION_TYPES.has(statement.type)) inspectFunctionScope(statement, file, statement.id?.name || 'top level');
    else {
      for (const child of children(statement)) {
        if (FUNCTION_TYPES.has(child.type)) inspectFunctionScope(child, file, child.id?.name || 'scope');
      }
    }
  }
}

const unique = [...new Set(problems)];
if (unique.length === 0) {
  process.stdout.write(`check-hooks: OK (${files.length} files)\n`);
  process.exit(0);
}
process.stdout.write(`check-hooks: ${unique.length} problem(s)\n`);
unique.forEach((problem) => process.stdout.write(`  - ${problem}\n`));
process.exit(1);