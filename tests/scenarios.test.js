import test from 'node:test';
import assert from 'node:assert/strict';

import { createSeedState } from '../src/data/seed.js';
import { compareScenario, createEmptyPlan, uncertaintyRange } from '../src/domain/scenarios.js';

const baseState = () => createSeedState();

test('a plan compares baseline and projected attendance separately', () => {
  const state = baseState();
  const plan = createEmptyPlan('plan-test', 'Recovery', state.revision, '2026-10-01T00:00:00.000Z');
  plan.enrollmentScenarios['e-dl-2103-f26'] = {
    futurePresent: '5',
    futureAbsent: '0',
    remainingSessions: '6',
    targetPoints: '',
    hypotheticalRaw: {},
  };

  const result = compareScenario(plan, state);
  const row = result.rows.find((r) => r.enrollmentId === 'e-dl-2103-f26');

  assert.equal(row.baseline.attendance.percent, 70);
  assert.equal(row.baseline.attendance.recoverySessions, 5);
  assert.equal(row.projected.attendance.percent, 80);
  assert.equal(row.projected.attendance.thresholdMet, true);
  assert.equal(row.projected.attendance.scheduleFeasible, true);
});

test('marks assumptions never silently become grade assumptions', () => {
  const state = baseState();
  const plan = createEmptyPlan('plan-test', 'Marks only', state.revision, '2026-10-01T00:00:00.000Z');
  plan.enrollmentScenarios['e-se-2201-f26'] = {
    futurePresent: '',
    futureAbsent: '',
    remainingSessions: '',
    targetPoints: '70',
    hypotheticalRaw: { 'as-se-mid': 40 },
  };

  const result = compareScenario(plan, state);
  const row = result.rows.find((r) => r.enrollmentId === 'e-se-2201-f26');

  assert.equal(row.baseline.marks.earnedPoints, 36);
  assert.equal(row.projected.marks.projectedPoints, 76);
  assert.equal(result.gpa.hasAssumptions, false, 'no grade was assumed, so no GPA projection is produced');
  assert.equal(result.gpa.projected.value, result.gpa.baseline.value);
  assert.match(result.gpa.note, /never converted into grades automatically/);
});

test('an explicit grade assumption drives the GPA projection', () => {
  const state = baseState();
  const plan = createEmptyPlan('plan-test', 'With grades', state.revision, '2026-10-01T00:00:00.000Z');
  plan.enrollmentScenarios['e-math-2205-f26'] = {
    futurePresent: '',
    futureAbsent: '',
    remainingSessions: '',
    targetPoints: '',
    hypotheticalRaw: {},
  };
  plan.gradeAssumptions['e-math-2205-f26'] = 'A';

  const result = compareScenario(plan, state);
  assert.equal(result.gpa.hasAssumptions, true);
  assert.equal(result.gpa.assumptions.length, 1);
  assert.equal(result.gpa.assumptions[0].courseId, 'c-math-2205');
  assert.equal(result.gpa.delta, 0.1736);
  assert.equal(result.gpa.baseline.value, 2.8424);
  assert.equal(result.gpa.projected.value, 3.016);
});

test('a changed baseline is flagged and recalculated from current records', () => {
  const state = baseState();
  const plan = createEmptyPlan('plan-test', 'Stale', 1, '2026-10-01T00:00:00.000Z');
  plan.enrollmentScenarios['e-dl-2103-f26'] = {
    futurePresent: '5',
    futureAbsent: '0',
    remainingSessions: '6',
    targetPoints: '',
    hypotheticalRaw: {},
  };
  assert.equal(compareScenario(plan, state).staleBaseline, false);

  state.revision = 2;
  state.attendanceSessions = state.attendanceSessions.map((s) =>
    s.enrollmentId === 'e-dl-2103-f26' && s.presence === 'absent' ? { ...s, presence: 'present' } : s,
  );
  const after = compareScenario(plan, state);
  assert.equal(after.staleBaseline, true);
  assert.equal(after.rows[0].baseline.attendance.percent, 100);
  assert.equal(after.rows[0].projected.attendance.percent, 100);
});

test('a missing course disables the affected result and offers a repair', () => {
  const state = baseState();
  const plan = createEmptyPlan('plan-test', 'Broken', state.revision, '2026-10-01T00:00:00.000Z');
  plan.enrollmentScenarios['e-gone-123'] = {
    futurePresent: '1',
    futureAbsent: '0',
    remainingSessions: '',
    targetPoints: '',
    hypotheticalRaw: {},
  };
  const result = compareScenario(plan, state);
  assert.equal(result.rows[0].missing, true);
  assert.equal(result.errors['e-gone-123'].repairable, true);
  assert.match(result.errors['e-gone-123'].enrollment, /no longer in the dataset/);
});

test('invalid scenario input is reported per field and blocks the projection', () => {
  const state = baseState();
  const plan = createEmptyPlan('plan-test', 'Bad input', state.revision, '2026-10-01T00:00:00.000Z');
  plan.enrollmentScenarios['e-dl-2103-f26'] = {
    futurePresent: 'five',
    futureAbsent: '-2',
    remainingSessions: '',
    targetPoints: '',
    hypotheticalRaw: {},
  };
  const row = compareScenario(plan, state).rows[0];
  assert.ok(row.errors.futurePresent);
  assert.ok(row.errors.futureAbsent);
  assert.equal(row.projected.attendance.fraction, null);
});

test('uncertainty spans only unresolved weight and is labelled', () => {
  const state = baseState();
  const publishedOnly = { earnedPoints: 16, unresolvedWeight: 30, futureWeight: 0 };
  const withFuture = { earnedPoints: 16, unresolvedWeight: 30, futureWeight: 50 };

  const narrow = uncertaintyRange(publishedOnly);
  assert.deepEqual([narrow.lower, narrow.upper], [16, 46]);
  assert.equal(narrow.includesFutureWork, false);

  const wide = uncertaintyRange(withFuture);
  assert.deepEqual([wide.lower, wide.upper], [16, 96]);
  assert.equal(wide.includesFutureWork, true);
  assert.match(wide.label, /Widest range/);

  assert.equal(uncertaintyRange({ earnedPoints: 36, unresolvedWeight: 0, futureWeight: 50 }), null);
});

test('a scenario that resolves every outstanding score is labelled from the applied assumptions', () => {
  const state = baseState();
  const plan = createEmptyPlan('plan-test', 'Exploratory', state.revision, '2026-10-01T00:00:00.000Z');
  plan.enrollmentScenarios['e-ds-2101-f26'] = {
    futurePresent: '',
    futureAbsent: '',
    remainingSessions: '',
    targetPoints: '95',
    hypotheticalRaw: { 'as-ds-a1': 30, 'as-ds-mid': 50 },
  };
  const row = compareScenario(plan, state).rows[0];
  // The hypothetical marks are applied first, so every unit of weight is now
  // resolved and the scenario target follows from the assumed points.
  assert.equal(row.projected.marks.projectedPoints, 96);
  assert.equal(row.projected.marks.assessedWeight, 100);
  assert.equal(row.projected.target.status, 'already-secured');
  assert.equal(row.uncertainty, null, 'no unresolved weight remains');
  // The baseline-only requirement is retained and stays clearly separate: the
  // 95 target was not reachable from the recorded results alone.
  assert.equal(row.baseline.target.status, 'achievable');
  assert.equal(row.baseline.target.requiredPercent, 98.75);
  assert.equal(row.baseline.target.combined, true);
});

test('a target above every available point is reported as unattainable', () => {
  const state = baseState();
  const plan = createEmptyPlan('plan-test', 'Impossible', state.revision, '2026-10-01T00:00:00.000Z');
  plan.enrollmentScenarios['e-math-2205-f26'] = {
    futurePresent: '',
    futureAbsent: '',
    remainingSessions: '',
    targetPoints: '95',
    hypotheticalRaw: { 'as-ma-fin': 0 },
  };
  const row = compareScenario(plan, state).rows[0];
  // 47 points are already earned and only 30 points of weight remain, so 95 is
  // out of reach no matter how well the final examination goes.
  assert.equal(row.projected.marks.projectedPoints, 47, 'a zero on the final adds no points');
  // Once the final is assumed there is no remaining weight, so the scenario
  // result is simply "not reached" - never labelled achieved.
  assert.equal(row.projected.target.status, 'not-achieved');
  assert.equal(row.projected.target.requiredPercent, null);
  // The baseline-only requirement still shows why the target was already out of
  // reach from the recorded results alone.
  assert.equal(row.baseline.target.status, 'unattainable');
  assert.equal(row.baseline.target.requiredPercent, 160);
  assert.match(row.baseline.target.message, /cannot be reached/);
});

test('plan and task style operations never change academic records', () => {
  const state = baseState();
  const before = JSON.stringify({
    courses: state.courses,
    enrollments: state.enrollments,
    attendanceSessions: state.attendanceSessions,
    assessments: state.assessments,
  });
  const plan = createEmptyPlan('plan-test', 'Read only', state.revision, '2026-10-01T00:00:00.000Z');
  plan.enrollmentScenarios['e-dl-2103-f26'] = {
    futurePresent: '5',
    futureAbsent: '0',
    remainingSessions: '6',
    targetPoints: '70',
    hypotheticalRaw: { 'as-ds-q1': 10 },
  };
  compareScenario(plan, state);

  const after = JSON.stringify({
    courses: state.courses,
    enrollments: state.enrollments,
    attendanceSessions: state.attendanceSessions,
    assessments: state.assessments,
  });
  assert.equal(before, after);
});
