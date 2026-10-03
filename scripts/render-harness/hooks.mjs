/**
 * Loader hooks for the offline screen-render harness.
 *
 * Metro can prove a screen compiles. It cannot prove the screen renders. This
 * loader swaps every native-only module for a Node-safe stub so every screen can
 * be mounted in plain Node:
 *
 *   react                     -> a minimal hook implementation with real mount
 *                                semantics (state, effects, refs, reducer)
 *   react-native              -> host component tags plus StyleSheet.create
 *   @expo/vector-icons        -> a tag
 *   react-native-chart-kit    -> chart tags
 *   expo-status-bar           -> a tag
 *   @react-native-async-storage/async-storage -> an in-memory store
 *
 * For the real-React lane (unmount ordering, StrictMode), see
 * real-react-hooks.mjs, which swaps the same natives but keeps real `react`.
 *
 * JSX is transformed with @babel/plugin-transform-react-jsx for the same reason.
 *
 * What this does NOT prove: native rendering, layout, gestures or fonts. It
 * proves that a screen mounts, runs its effects and produces its text without
 * throwing. Scripts/smoke-render.mjs says so in its own output.
 */
import { transformSync } from '@babel/core';
import { readFileSync } from 'node:fs';

const STUBS = {
  react: './react-stub.mjs',
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