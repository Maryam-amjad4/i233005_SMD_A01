import test from 'node:test';
import assert from 'node:assert/strict';

import {
  initialNavigation,
  navigationReducer,
  createView,
  canGoBack,
  checkViewValidity,
} from '../src/app/viewState.js';
import { createSeedState } from '../src/data/seed.js';

test('opening a view pushes the previous view onto the history', () => {
  const first = navigationReducer(initialNavigation, { type: 'open', name: 'courses' });
  assert.equal(first.view.name, 'courses');
  assert.deepEqual(first.history.map((v) => v.name), ['home']);

  const second = navigationReducer(first, { type: 'open', name: 'course', params: { enrollmentId: 'e-ds-2101-f26' } });
  assert.equal(second.view.params.enrollmentId, 'e-ds-2101-f26');
  assert.deepEqual(second.history.map((v) => v.name), ['home', 'courses']);
});

test('back restores the previous view and its parameters', () => {
  const first = navigationReducer(initialNavigation, { type: 'open', name: 'course', params: { enrollmentId: 'e-1' } });
  const second = navigationReducer(first, { type: 'open', name: 'attendance', params: { enrollmentId: 'e-1' } });
  const back = navigationReducer(second, { type: 'back' });
  assert.equal(back.view.name, 'course');
  assert.equal(back.view.params.enrollmentId, 'e-1');
  assert.deepEqual(back.history.map((v) => v.name), ['home']);
});

test('back at the root is a no-op so the app can exit normally', () => {
  const state = navigationReducer(initialNavigation, { type: 'open', name: 'courses' });
  const back = navigationReducer(state, { type: 'back' });
  assert.equal(back.view.name, 'home');
  assert.equal(canGoBack(back), false);
  const again = navigationReducer(back, { type: 'back' });
  assert.deepEqual(again, back);
});

test('home clears the history', () => {
  let state = navigationReducer(initialNavigation, { type: 'open', name: 'finance' });
  state = navigationReducer(state, { type: 'open', name: 'feeDetail' });
  state = navigationReducer(state, { type: 'home' });
  assert.equal(state.view.name, 'home');
  assert.equal(state.history.length, 0);
});

test('replace swaps the view without growing the history', () => {
  const state = navigationReducer(initialNavigation, { type: 'open', name: 'services', replace: true });
  assert.equal(state.view.name, 'services');
  assert.equal(state.history.length, 0);
});

test('reset forces a view and clears the history', () => {
  let state = navigationReducer(initialNavigation, { type: 'open', name: 'course', params: { enrollmentId: 'e-1' } });
  state = navigationReducer(state, { type: 'reset', view: { name: 'history' } });
  assert.equal(state.view.name, 'history');
  assert.equal(state.history.length, 0);
});

test('an unknown action leaves the state untouched', () => {
  const state = navigationReducer(initialNavigation, { type: 'nope' });
  assert.equal(state, initialNavigation);
});

test('creating a view always has a params object', () => {
  assert.deepEqual(createView('tasks'), { name: 'tasks', params: {} });
  assert.deepEqual(createView('tasks', { id: 'x' }), { name: 'tasks', params: { id: 'x' } });
});

test('a course view from another semester is reported instead of breaking', () => {
  const state = createSeedState();
  const valid = checkViewValidity({ name: 'course', params: { enrollmentId: 'e-ds-2101-f26' } }, state);
  assert.equal(valid.valid, true);

  const missing = checkViewValidity({ name: 'course', params: { enrollmentId: 'e-gone' } }, state);
  assert.equal(missing.valid, false);
  assert.match(missing.reason, /no longer in the dataset/);

  const otherSemester = checkViewValidity({ name: 'course', params: { enrollmentId: 'e-prog-1101-s25s' } }, state);
  assert.equal(otherSemester.valid, false);
  assert.match(otherSemester.reason, /another semester/);
});

test('non-course views are always valid', () => {
  const state = createSeedState();
  assert.equal(checkViewValidity({ name: 'finance', params: {} }, state).valid, true);
});
