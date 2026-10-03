/**
 * REAL-React lane.
 *
 * The stub harness cannot model React's scheduler: passive-effect timing, real
 * unmount ordering, or StrictMode double-invocation. This file runs the real
 * `react` and `react-test-renderer` (via render-harness/real-react-hooks.mjs,
 * which swaps only the native-only packages) so those behaviours are covered.
 *
 * The stub-based suite stays in place: it is fast and it inspects rendered text.
 * This lane is deliberately separate and much smaller.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';

register('../scripts/render-harness/real-react-hooks.mjs', import.meta.url);

// React 19 requires this flag before calling act().
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { createElement, StrictMode, useEffect, useState } = await import('react');
const TestRenderer = (await import('react-test-renderer')).default;
const { act } = await import('react-test-renderer');
const { default: HistoryScreen } = await import('../src/features/history/HistoryScreen.js');
const { createSeedState } = await import('../src/data/seed.js');

/** Every string a real render tree would show, in order. */
function collectText(node, out = []) {
  if (node == null || typeof node === 'boolean') return out;
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    node.forEach((child) => collectText(child, out));
    return out;
  }
  collectText(node.children, out);
  return out;
}

test('real React: mount effects run child-first and unmount cleanups parent-first', async () => {
  const log = [];
  function Child() {
    useEffect(() => {
      log.push('child:effect');
      return () => log.push('child:cleanup');
    }, []);
    return createElement('Text', null, 'child');
  }
  function Parent() {
    useEffect(() => {
      log.push('parent:effect');
      return () => log.push('parent:cleanup');
    }, []);
    return createElement(Child);
  }

  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(createElement(Parent));
  });
  assert.deepEqual(log, ['child:effect', 'parent:effect'], 'mount effects run child-first');

  await act(async () => {
    renderer.unmount();
  });
  assert.deepEqual(
    log,
    ['child:effect', 'parent:effect', 'parent:cleanup', 'child:cleanup'],
    'unmount cleanups run parent-first, child last',
  );
});

test('real React: an effect with changed deps cleans up before it re-runs', async () => {
  const log = [];
  function DepProbe({ dep }) {
    useEffect(() => {
      log.push(`effect:${dep}`);
      return () => log.push(`cleanup:${dep}`);
    }, [dep]);
    return null;
  }

  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(createElement(DepProbe, { dep: 'a' }));
  });
  await act(async () => {
    renderer.update(createElement(DepProbe, { dep: 'b' }));
  });
  await act(async () => {
    renderer.unmount();
  });

  assert.deepEqual(log, ['effect:a', 'cleanup:a', 'effect:b', 'cleanup:b']);
});

test('real React StrictMode: a pure setState updater is double-invoked but applies once', async () => {
  let updaterCalls = 0;
  let setCount = null;
  function Counter() {
    const [count, update] = useState(0);
    setCount = update;
    return createElement('Text', null, `count=${count}`);
  }

  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(createElement(StrictMode, null, createElement(Counter)));
  });

  await act(async () => {
    setCount((previous) => {
      updaterCalls += 1;
      return previous + 1;
    });
  });

  // StrictMode invokes the updater twice to expose impurity...
  assert.equal(updaterCalls, 2, 'StrictMode must double-invoke the updater');
  // ...but a pure updater produces the same value both times, so one press is one step.
  assert.ok(
    collectText(renderer.toJSON()).includes('count=1'),
    `a pure updater must apply exactly one increment, saw ${collectText(renderer.toJSON()).join('|')}`,
  );
});

test('real React StrictMode: an impure updater double-counts, which is why purity matters', async () => {
  const sideEffects = [];
  let setCount = null;
  function Impure() {
    const [, update] = useState(0);
    setCount = update;
    return null;
  }

  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(createElement(StrictMode, null, createElement(Impure)));
  });
  await act(async () => {
    setCount((previous) => {
      sideEffects.push('mutated');
      return previous + 1;
    });
  });

  assert.equal(sideEffects.length, 2, 'an impure updater runs its side effect twice under StrictMode');
  await act(async () => {
    renderer.unmount();
  });
});

test('real React: a real app screen mounts and renders under StrictMode', async () => {
  const state = createSeedState();
  let renderer;
  await act(async () => {
    renderer = TestRenderer.create(
      createElement(StrictMode, null, createElement(HistoryScreen, { state, actions: {}, openView: () => {} })),
    );
  });

  const text = collectText(renderer.toJSON()).join(' | ');
  assert.match(text, /cumulative GPA/, 'the transcript screen renders its CGPA caption');
  assert.match(text, /Transcript/, 'the transcript section renders');

  await act(async () => {
    renderer.unmount();
  });
});
