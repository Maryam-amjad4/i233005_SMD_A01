/**
 * Chart-input guards.
 *
 * Regression cover for the "missing is not zero" rule at the chart boundary.
 * The earlier guard used `Number.isFinite(Number(x))`, which is true for `null`
 * and `''` because `Number(null) === 0`. That made both "no usable data"
 * branches unreachable and let a term with no GPA be plotted as a zero.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { isRealNumber } from '../src/domain/validation.js';

test('isRealNumber accepts only finite numbers', () => {
  assert.equal(isRealNumber(0), true);
  assert.equal(isRealNumber(-1.5), true);
  assert.equal(isRealNumber(99.999), true);
});

test('isRealNumber rejects every form of missing data', () => {
  [null, undefined, '', ' ', 'abc', NaN, Infinity, -Infinity, {}, [], true, false].forEach((value) => {
    assert.equal(isRealNumber(value), false, `${JSON.stringify(value)} must not count as a measurement`);
  });
});

test('isRealNumber is not the looser Number() test', () => {
  // Pin the exact trap: these two forms disagree, which is why both exist.
  assert.equal(Number.isFinite(Number(null)), true);
  assert.equal(isRealNumber(null), false);
  assert.equal(Number.isFinite(Number('')), true);
  assert.equal(isRealNumber(''), false);
});

test('a percentage of exactly 0 is still a real measurement', () => {
  // Attendance can genuinely be 0%. Missing data must be excluded, but a
  // recorded zero must survive, otherwise the chart hides a real result.
  assert.equal(isRealNumber(0), true);
});