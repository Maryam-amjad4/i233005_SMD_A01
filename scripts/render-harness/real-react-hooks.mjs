/**
 * Loader for the REAL-React test lane.
 *
 * The other harness (`hooks.mjs`) swaps `react` for a hand-written double. That
 * double is fast and good at reading rendered strings, but it cannot model real
 * React scheduling: batching, passive-effect timing, unmount cleanup order, or
 * StrictMode double-invocation. This loader keeps the real `react` and real
 * `react-test-renderer` and swaps only the native-only packages, so a test can
 * exercise those behaviours with `react-test-renderer`.
 *
 * JSX is transformed with @babel/plugin-transform-react-jsx (classic runtime),
 * exactly as the stub lane does.
 */
import { transformSync } from '@babel/core';
import { readFileSync } from 'node:fs';

/** Native-only modules -> Node-safe stubs. `react` is deliberately absent. */
const STUBS = {
  'react-native': './rn-stub.mjs',
  '@expo/vector-icons': './icons-stub.mjs',
  'react-native-chart-kit': './chart-stub.mjs',
  'expo-status-bar': './statusbar-stub.mjs',
  '@react-native-async-storage/async-storage': './storage-stub.mjs',
};

export async function resolve(specifier, context, next) {
  const stub = STUBS[specifier];
  if (stub) return { url: new URL(stub, import.meta.url).href, shortCircuit: true, format: 'module' };
  return next(specifier, context);
}

export async function load(url, context, next) {
  const isProjectFile = url.startsWith('file:') && url.endsWith('.js') && !url.includes('node_modules');
  if (isProjectFile) {
    const source = readFileSync(new URL(url), 'utf8');
    const out = transformSync(source, {
      filename: url,
      babelrc: false,
      configFile: false,
      sourceType: 'module',
      plugins: ['@babel/plugin-transform-react-jsx'],
    });
    return { format: 'module', shortCircuit: true, source: out.code };
  }
  return next(url, context);
}
