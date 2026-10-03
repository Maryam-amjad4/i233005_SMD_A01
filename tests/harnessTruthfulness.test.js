/**
 * Harness truthfulness — the render harness must not pass a broken screen.
 *
 * These tests pin the three ways the old harness lied:
 *   H1  an effect that threw was swallowed, so a crashing screen mounted "clean";
 *   H2  useMemo/useCallback ignored their dependency arrays, so a stale memo was
 *       invisible;
 *   H4  the storage stub always resolved immediately and always succeeded, so a
 *       held write and a failing device could never be observed.
 *
 * Each test fails if its fix is reverted.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { register } from 'node:module';
import test from 'node:test';

register('../scripts/render-harness/hooks.mjs', import.meta.url);

const { __mount, __renderNested, createElement, useEffect, useMemo, useCallback } = await import('../scripts/render-harness/react-stub.mjs');
const { default: AsyncStorage, __storage } = await import('../scripts/render-harness/storage-stub.mjs');
const { dirname } = await import('node:path');
const { fileURLToPath } = await import('node:url');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ------------------------------------------------------------------- H1 */

test('H1: an effect that throws fails the mount, naming the component and the error', () => {
  function EffectBoom() {
    useEffect(() => {
      throw new Error('kaput');
    }, []);
    return createElement('Text', null, 'never reached');
  }

  assert.throws(
    () => __mount(EffectBoom, {}),
    /effect threw in EffectBoom \(mount\/commit\): kaput/,
    'a throwing effect must abort the mount with the component name and the error',
  );
});

test('H1: a screen whose effect is clean still mounts (the failure is not blanket)', () => {
  function EffectFine() {
    useEffect(() => {}, []);
    return createElement('Text', null, 'fine');
  }
  const handle = __mount(EffectFine, {});
  assert.ok(handle.tree);
  handle.unmount();
});

test('H1: an effect thrown inside a nested component is not swallowed either', () => {
  function NestedBoom() {
    useEffect(() => {
      throw new Error('nested kaput');
    }, []);
    return null;
  }
  function Wrapper() {
    return createElement(NestedBoom);
  }
  void Wrapper;
  assert.throws(
    () => __renderNested(NestedBoom, {}, 'wrapper-child'),
    /nested kaput/,
    'a nested effect failure must surface',
  );
});

test('H1: a cleanup that throws fails loudly on unmount', () => {
  function CleanupBoom() {
    useEffect(
      () => () => {
        throw new Error('cleanup bang');
      },
      [],
    );
    return null;
  }
  const handle = __mount(CleanupBoom, {});
  assert.throws(() => handle.unmount(), /cleanup bang/);
});

/* ------------------------------------------------------------------- H2 */

test('H2: useMemo recomputes only when its dependencies change', () => {
  let factoryCalls = 0;
  function MemoProbe({ dep }) {
    const value = useMemo(() => {
      factoryCalls += 1;
      return `${dep}:${factoryCalls}`;
    }, [dep]);
    return createElement('Text', null, value);
  }

  const handle = __mount(MemoProbe, { dep: 'a' });
  assert.equal(factoryCalls, 1, 'first render computes once');

  handle.rerender({ dep: 'a' });
  assert.equal(factoryCalls, 1, 'same deps must reuse the memo, not recompute');

  handle.rerender({ dep: 'b' });
  assert.equal(factoryCalls, 2, 'changed deps must recompute');
  handle.unmount();
});

test('H2: useMemo with no dependency array recomputes every render (React parity)', () => {
  let factoryCalls = 0;
  function NoDepsProbe() {
    useMemo(() => {
      factoryCalls += 1;
      return factoryCalls;
    });
    return null;
  }
  const handle = __mount(NoDepsProbe, {});
  handle.rerender({});
  assert.equal(factoryCalls, 2, 'undefined deps means recompute every render');
  handle.unmount();
});

test('H2: useCallback keeps a stable identity until its dependencies change', () => {
  const seen = [];
  function CallbackProbe({ dep }) {
    const fn = useCallback(() => dep, [dep]);
    seen.push(fn);
    return null;
  }
  const handle = __mount(CallbackProbe, { dep: 'a' });
  handle.rerender({ dep: 'a' });
  handle.rerender({ dep: 'b' });
  assert.equal(seen.length, 3);
  assert.equal(seen[0], seen[1], 'same deps must return the same callback');
  assert.notEqual(seen[1], seen[2], 'changed deps must return a new callback');
  handle.unmount();
});

/* ------------------------------------------------------------------- H4 */

test('H4: a held write stays pending until the test releases it', async () => {
  __storage.reset();
  const held = __storage.holdWrites();
  let settled = false;
  const write = AsyncStorage.setItem('probe', 'value').then(() => {
    settled = true;
  });

  await Promise.resolve();
  await Promise.resolve();
  assert.equal(settled, false, 'a held write must not resolve until released');
  assert.equal(held.pending, 1, 'the handle must expose the pending write');

  held.release();
  await write;
  assert.equal(settled, true, 'releasing the gate must let the write finish');
  assert.equal(__storage.store.get('probe'), 'value');
});

test('H4: a forced write failure rejects and leaves the store unchanged', async () => {
  __storage.reset();
  __storage.failWrites(1, 'disk full');
  await assert.rejects(AsyncStorage.setItem('probe', 'value'), /disk full/);
  assert.equal(__storage.store.has('probe'), false, 'a failed write must not store anything');
});

test('H4: a forced read failure rejects', async () => {
  __storage.reset();
  __storage.failReads(1, 'unreadable');
  await assert.rejects(AsyncStorage.getItem('probe'), /unreadable/);
});

test('H4: reset clears data, held gates and queued failures', async () => {
  __storage.reset();
  await AsyncStorage.setItem('old', '1');
  assert.equal(__storage.store.get('old'), '1');

  __storage.failWrites(1, 'stale failure');
  const held = __storage.holdWrites();
  const pending = AsyncStorage.setItem('probe', 'value');
  await Promise.resolve();
  assert.equal(held.pending, 1);

  __storage.reset();
  assert.equal(held.pending, 0, 'reset must release held writes');
  assert.equal(__storage.store.has('old'), false, 'reset clears the pre-reset store');
  await pending;

  // The queued failure must have been cleared too: this write succeeds.
  await AsyncStorage.setItem('after', 'ok');
  assert.equal(__storage.store.get('after'), 'ok');
});
