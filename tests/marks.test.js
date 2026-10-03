import test from 'node:test';
import assert from 'node:assert/strict';

import { summarizeMarks, calculateTarget, projectMarks, classComparison } from '../src/domain/marks.js';

/** Fixture from the plan: weights 20 + 30 + 50, 8/10 published and 20/30 published. */
const scheme = [
  { id: 'a1', enrollmentId: 'e1', category: 'Quiz', title: 'Quiz 1', weightPercent: 20, maxMarks: 10, obtainedMarks: 8, status: 'published', classMeanRaw: 7.1 },
  { id: 'a2', enrollmentId: 'e1', category: 'Assignment', title: 'Assignment 1', weightPercent: 30, maxMarks: 30, obtainedMarks: 20, status: 'published', classMeanRaw: null },
  { id: 'a3', enrollmentId: 'e1', category: 'Midterm', title: 'Midterm', weightPercent: 50, maxMarks: 50, obtainedMarks: null, status: 'scheduled', classMeanRaw: null },
];

test('published marks earn weighted points; scheduled weight stays future work', () => {
  const summary = summarizeMarks(scheme);
  assert.equal(summary.earnedPoints, 36, '16 + 20 = 36 points out of 100');
  assert.equal(summary.publishedWeight, 50);
  assert.equal(summary.unresolvedWeight, 0);
  assert.equal(summary.futureWeight, 50);
  assert.equal(summary.totalWeight, 100);
  assert.equal(summary.schemeValid, true);
  assert.equal(summary.assessedPerformance, 72, '72% within assessed weight only');
});

test('a target of 70 requires 68% across the remaining weight', () => {
  assert.equal(calculateTarget({ earnedPoints: 36, unresolvedWeight: 0, futureWeight: 50, schemeValid: true }, 70).requiredPercent, 68);
});

test('an unpublished score is unresolved contribution, never a zero', () => {
  const unpublished = [
    { ...scheme[0] },
    { ...scheme[1], status: 'submitted' },
    { ...scheme[2] },
  ];
  const summary = summarizeMarks(unpublished);
  assert.equal(summary.earnedPoints, 16, 'the 20-point unpublished contribution is excluded');
  assert.equal(summary.unresolvedWeight, 30);
  assert.equal(summary.publishedWeight, 20);

  const target = calculateTarget(summary, 70);
  assert.equal(target.combined, true);
  assert.match(target.message, /unpublished or still scheduled/);
  assert.equal(target.requiredPercent, 67.5);
});

test('a missed assessment is a recorded zero inside assessed weight', () => {
  const summary = summarizeMarks([
    { id: 'q', weightPercent: 20, maxMarks: 10, obtainedMarks: null, status: 'missed', title: 'Quiz' },
    { id: 'm', weightPercent: 80, maxMarks: 100, obtainedMarks: 74, status: 'published', title: 'Midterm' },
  ]);
  assert.equal(summary.earnedPoints, 59.2);
  assert.equal(summary.publishedWeight, 100);
  assert.equal(summary.missedCount, 1);
  assert.equal(summary.schemeValid, true);
});

test('an incomplete scheme disables the target but still shows published work', () => {
  const summary = summarizeMarks(scheme.slice(0, 2));
  assert.equal(summary.totalWeight, 50);
  assert.equal(summary.schemeValid, false);
  assert.equal(summary.earnedPoints, 36);
  const target = calculateTarget(summary, 70);
  assert.equal(target.status, 'scheme-invalid');
  assert.equal(target.requiredPercent, null);
  assert.ok(summary.errors.some((e) => /instead of 100%/.test(e)));
});

test('an unattainable target is reported instead of a meaningless rate', () => {
  // Best achievable is 30 + 50 = 80 points, so 95 cannot be reached.
  const target = calculateTarget({ earnedPoints: 30, unresolvedWeight: 0, futureWeight: 50, schemeValid: true }, 95);
  assert.equal(target.status, 'unattainable');
  assert.equal(target.requiredPercent, 130);
  assert.match(target.message, /cannot be reached/);
});

test('zero remaining weight gives achieved or not achieved, never a division', () => {
  const achieved = calculateTarget({ earnedPoints: 80, unresolvedWeight: 0, futureWeight: 0, schemeValid: true }, 70);
  assert.equal(achieved.status, 'already-secured');
  assert.equal(achieved.requiredPercent, 0);

  const missed = calculateTarget({ earnedPoints: 60, unresolvedWeight: 0, futureWeight: 0, schemeValid: true }, 70);
  assert.equal(missed.status, 'not-achieved');
  assert.equal(missed.requiredPercent, null);
});

test('invalid targets are rejected with a field error', () => {
  for (const bad of ['', 'abc', -5, 140, '100.5.2']) {
    const target = calculateTarget({ earnedPoints: 36, unresolvedWeight: 0, futureWeight: 50, schemeValid: true }, bad);
    assert.equal(target.status, 'invalid-target', `target ${String(bad)} should be rejected`);
    assert.ok(target.errors.targetPoints);
  }
});

test('invalid assessments are reported rather than silently counted', () => {
  const summary = summarizeMarks([
    { id: 'x', weightPercent: 50, maxMarks: 0, obtainedMarks: 5, status: 'published', title: 'Bad max' },
    { id: 'y', weightPercent: 50, maxMarks: 10, obtainedMarks: 12, status: 'published', title: 'Out of range' },
    { id: 'x', weightPercent: -5, maxMarks: 10, obtainedMarks: 5, status: 'published', title: 'Duplicate id' },
    { id: 'z', weightPercent: 50, maxMarks: 10, obtainedMarks: null, status: 'unknown-status', title: 'Bad status' },
  ]);
  assert.equal(summary.earnedPoints, 0);
  assert.equal(summary.errors.length, 4);
});

test('an empty assessment list is no data, not zero earned', () => {
  const summary = summarizeMarks([]);
  assert.equal(summary.assessmentCount, 0);
  assert.equal(summary.earnedPoints, 0);
  assert.equal(summary.assessedPerformance, null);
  assert.equal(summary.errors.length, 0);
});

test('hypothetical marks recalculate weighted points and stay inside maxMarks', () => {
  const result = projectMarks(scheme, { a3: 40 });
  assert.equal(result.valid, true);
  assert.equal(result.projectedPoints, 76, '36 earned + (50 * 40/50) = 76');
  assert.equal(result.notes.length, 0, 'the assumed midterm is no longer outstanding');
});

test('hypothetical marks outside the assessment maximum are rejected', () => {
  const result = projectMarks(scheme, { a3: 51 });
  assert.equal(result.valid, false);
  assert.ok(result.errors.a3);
  assert.equal(result.projectedPoints, null);
});

test('unpublished weight stays out of the projection until it is assumed', () => {
  const unpublished = [scheme[0], { ...scheme[1], status: 'submitted' }, scheme[2]];
  const without = projectMarks(unpublished, { a3: 50 });
  assert.equal(without.projectedPoints, 66);
  assert.ok(without.notes.some((n) => /30% of weight is still unpublished/.test(n)));

  const withAssumption = projectMarks(unpublished, { a2: 30, a3: 50 });
  assert.equal(withAssumption.projectedPoints, 96);
  assert.equal(withAssumption.notes.length, 0);
});

test('class comparison uses matching units only and infers no rank', () => {
  const rows = classComparison(scheme);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].classMeanRaw, 7.1);
  assert.equal(rows[0].difference, 0.9);
});
