#!/usr/bin/env node
/**
 * Static consistency check for the Flex++ source tree.
 *
 * Why this exists: Metro reports a missing export as a red screen at runtime,
 * and a missing named import inside a component is invisible until that screen
 * is opened. This script parses every source file, resolves its relative
 * imports, and verifies that each named binding is actually exported by the
 * target module. It also flags `require(` usage and files that are not reachable
 * from App.js.
 *
 * Idempotent, non-interactive, no dependencies. Exit code 0 means clean.
 *
 * Usage: node scripts/check-imports.mjs
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIRS = ['src', 'tests'];
const ENTRY = 'App.js';

const problems = [];
const notes = [];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      walk(full, out);
    } else if (entry.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}

/** Named + default exports declared by a module, good enough for our own code. */
function exportsOf(source) {
  const names = new Set();
  const patterns = [
    /export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/g,
    /export\s+(?:const|let|var)\s+([A-Za-z0-9_$]+)/g,
    /export\s+class\s+([A-Za-z0-9_$]+)/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source)) !== null) names.add(match[1]);
  }
  if (/export\s+default\b/.test(source)) names.add('default');
  const braceBlock = /export\s*\{([^}]*)\}/g;
  let block;
  while ((block = braceBlock.exec(source)) !== null) {
    block[1]
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .forEach((part) => {
        const alias = part.split(/\s+as\s+/);
        names.add((alias[1] || alias[0]).trim());
      });
  }
  return names;
}

/** Relative import bindings: { specifier, named[], hasDefault }. */
function importsOf(source) {
  const found = [];
  const pattern = /import\s+([^'"]+?)\s+from\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const clause = match[1].trim();
    const specifier = match[2];
    if (!specifier.startsWith('.')) continue;
    const named = [];
    let hasDefault = false;
    const braces = /\{([^}]*)\}/.exec(clause);
    if (braces) {
      braces[1]
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .forEach((part) => {
          const alias = part.split(/\s+as\s+/);
          named.push((alias[1] || alias[0]).trim());
        });
    }
    const beforeBrace = braces ? clause.slice(0, braces.index) : clause;
    if (beforeBrace.trim().replace(/,\s*$/, '').trim()) hasDefault = true;
    found.push({ specifier, named, hasDefault });
  }
  return found;
}

const files = [
  ...walk(join(ROOT, 'src')),
  ...walk(join(ROOT, 'tests')),
  ...(existsSync(join(ROOT, ENTRY)) ? [join(ROOT, ENTRY)] : []),
];

if (!existsSync(join(ROOT, ENTRY))) problems.push(`Entry file ${ENTRY} is missing.`);

// Pass 1: build an export index for every local module.
const exportIndex = new Map();
for (const file of files) {
  exportIndex.set(file, exportsOf(readFileSync(file, 'utf8')));
}

// Pass 2: check every relative import resolves and every named binding exists.
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  for (const entry of importsOf(source)) {
    const target = resolve(dirname(file), entry.specifier);
    if (!existsSync(target)) {
      problems.push(`${relative(ROOT, file)}: cannot resolve ${entry.specifier}`);
      continue;
    }
    const available = exportIndex.get(target);
    if (!available) continue;
    if (entry.hasDefault && !available.has('default')) {
      problems.push(`${relative(ROOT, file)}: ${entry.specifier} has no default export but one is imported`);
    }
    for (const name of entry.named) {
      if (!available.has(name)) {
        problems.push(`${relative(ROOT, file)}: ${entry.specifier} does not export "${name}"`);
      }
    }
  }
  if (/\brequire\s*\(/.test(source)) {
    problems.push(`${relative(ROOT, file)}: uses require() instead of an ESM import`);
  }
  if (/^\s*console\.(log|debug|info)\(/m.test(source)) {
    problems.push(`${relative(ROOT, file)}: contains a console log statement`);
  }
}

// Pass 2b: record every local module that is actually imported somewhere.
const importedTargets = new Set();
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  for (const entry of importsOf(source)) {
    const target = resolve(dirname(file), entry.specifier);
    if (existsSync(target)) importedTargets.add(target);
  }
}

// Pass 3: no source file may be unreachable from the entry point.
for (const file of walk(join(ROOT, 'src'))) {
  if (!importedTargets.has(file)) {
    problems.push(`${relative(ROOT, file)}: not imported by any module (unreachable code)`);
  }
}

// Pass 4: no inference client or API key may appear anywhere in the source.
const FORBIDDEN = /openai|anthropic|google\.generativeai|genai|mistralai|cohere|ollama|replicate|@google\/generative|huggingface|EXPO_PUBLIC_.*KEY|apiKey|api_key|Authorization:\s*Bearer/i;
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const hit = FORBIDDEN.exec(source);
  if (hit) problems.push(`${relative(ROOT, file)}: forbidden runtime-AI token "${hit[0]}"`);
}

notes.push(`checked ${files.length} files`);
if (problems.length === 0) {
  process.stdout.write(`check-imports: OK (${notes.join('; ')})\n`);
  process.exit(0);
}
process.stdout.write(`check-imports: ${problems.length} problem(s)\n`);
problems.forEach((problem) => process.stdout.write(`  - ${problem}\n`));
process.exit(1);
