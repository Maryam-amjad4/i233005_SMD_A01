/**
 * Regression fixtures for the saved-plan comparison defects.
 *
 * Each test below reproduces a specific defect that was observed in the
 * committed code and must fail if the fix is reverted:
 *
 *  R1  an impossible schedule is presented as a successful recovery, and the
 *      pending-session bounds are missing from the comparison row.
 *  R2  the target and the uncertainty range are computed from the BASELINE
 *      marks and ignore the hypothetical scores saved in the plan.
 *  GAP the offered grade assumptions were hardcoded and omitted the failure
 *      grades.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSeedState } from '../src/data/seed.js';
import { createEmptyPlan, compareScenario, uncertaintyRange } from '../src/domain/scenarios.js';
import { GRADE_POINTS } from '../src/data/policies.js';

const state = () => createSeedState();

const scenario = (overrides = {}) => ({
  futurePresent: '',
  futureAbsent: '',
  remainingSessions: '',
  targetPoints: '',
  hypotheticalRaw: {},
  ...overrides,
});

const planWith = (state, enrollmentId, overrides) => {
  const plan = createEmptyPlan(`plan-${enrollmentId}`, 'Regression', state.revision, '2026-10-01T00:00:00.000Z');
  plan.enrollmentScenarios[enrollmentId] = scenario(overrides);
  return plan;
};

/* --------------------------------------------------------------------- R1 */

test('R1: an impossible attendance schedule is reported as infeasible, not as a success', () => {
  const s = state();
  // Digital Logic baseline: 7 present of 10 held. Attend 5, miss 0, only 3
  // classes remain in the term, so the scenario cannot happen as described.
  const plan = planWith(s, 'e-dl-2103-f26', {
    futurePresent: '5',
    futureAbsent: '0',
    remainingSessions: '3',
  });
  const row = compareScenario(plan, s).rows[0];

  // The arithmetic result and the feasibility are separate claims.
  assert.equal(row.projected.attendance.percent, 80);
  assert.equal(row.projected.attendance.thresholdMet, true);
  assert.equal(row.projected.attendance.scheduleFeasible, false, 'five future classes do not fit in three remaining');
  assert.equal(row.projected.attendance.exceedsRemaining, true);
  assert.equal(row.projected.attendance.recoveryFeasible, false);
  assert.equal(row.projected.attendance.recoveryNeeded, 5);
});

test('R1: a scenario that fits the remaining schedule stays feasible', () => {
  const s = state();
  const plan = planWith(s, 'e-dl-2103-f26', {
    futurePresent: '5',
    futureAbsent: '0',
    remainingSessions: '5',
  });
  const row = compareScenario(plan, s).rows[0];
  assert.equal(row.projected.attendance.percent, 80);
  assert.equal(row.projected.attendance.thresholdMet, true);
  assert.equal(row.projected.attendance.scheduleFeasible, true);
  assert.equal(row.projected.attendance.recoveryFeasible, true);
});

test('R1: the comparison discloses pending counts and pending bounds', () => {
  const s = state();
  // Software Engineering: 4 present, 1 absent, 2 pending.
  const plan = planWith(s, 'e-se-2201-f26', {});
  const row = compareScenario(plan, s).rows[0];

  assert.equal(row.pending.count, 2);
  assert.equal(row.pending.provisional, true);
  assert.equal(row.pending.bounds.hasPending, true);
  assert.equal(row.pending.bounds.lowerPercent, 57.1);
  assert.equal(row.pending.bounds.upperPercent, 85.7);
  assert.equal(row.baseline.attendance.percent, 80, 'the recorded-only result stays separate from the bounds');
});

test('R1: a pending-only module never becomes a confident zero', () => {
  const s = state();
  // EE-2001 has no session records at all; give it two unresolved pending entries.
  s.attendanceSessions = s.attendanceSessions.map((session) =>
    session.enrollmentId === 'e-ee-2001-f26' ? { ...session, presence: 'pending' } : session,
  );
  s.attendanceSessions = s.attendanceSessions.filter((session) => session.enrollmentId !== 'e-ee-2001-f26');
  s.attendanceSessions.push(
    { id: 'ses-ee-p1', enrollmentId: 'e-ee-2001-f26', date: '2026-09-01', durationHours: 1, presence: 'pending' },
    { id: 'ses-ee-p2', enrollmentId: 'e-ee-2001-f26', date: '2026-09-02', durationHours: 1, presence: 'pending' },
  );

  const plan = planWith(s, 'e-ee-2001-f26', {});
  const row = compareScenario(plan, s).rows[0];

  assert.equal(row.baseline.attendance.percent, null, 'no recorded sessions is never 0%');
  assert.equal(row.baseline.attendance.status, 'no-data');
  assert.equal(row.projected.attendance.valid, false, 'no recorded and no future session yields no number');
  assert.equal(row.projected.attendance.percent, null);
  assert.equal(row.pending.count, 2);
  assert.equal(row.pending.bounds.lowerPercent, 0, 'conservative lower bound is 0, not a confident result');
  assert.equal(row.pending.bounds.upperPercent, 100);
});

/* --------------------------------------------------------------------- R2 */

test('R2: an assumed future score fixes that weight and narrows the range to 66-96', () => {
  const s = state();
  // CS-2101: 16 earned (published quiz), 30% submitted assignment, 50% scheduled midterm.
  const plan = planWith(s, 'e-ds-2101-f26', {
    targetPoints: '70',
    hypotheticalRaw: { 'as-ds-mid': '50' },
  });
  const row = compareScenario(plan, s).rows[0];

  assert.equal(row.projected.marks.projectedPoints, 66);
  assert.equal(row.uncertainty.lower, 66);
  assert.equal(row.uncertainty.upper, 96);
  assert.equal(row.uncertainty.includesFutureWork, false, 'the midterm is now fixed, so future work is excluded');
});

test('R2: assuming only the unpublished assignment leaves 48% required across the midterm', () => {
  const s = state();
  const plan = planWith(s, 'e-ds-2101-f26', {
    targetPoints: '70',
    hypotheticalRaw: { 'as-ds-a1': '30' },
  });
  const row = compareScenario(plan, s).rows[0];

  assert.equal(row.projected.marks.projectedPoints, 46);
  assert.equal(row.projected.target.status, 'achievable');
  assert.equal(row.projected.target.requiredPercent, 48);
  assert.equal(row.projected.target.combined, false, 'only the scheduled midterm remains');
  assert.equal(row.uncertainty, null, 'a fixed future score leaves no unresolved weight');
});

test('R2: assuming every outstanding score reaches the target with no unresolved range', () => {
  const s = state();
  const plan = planWith(s, 'e-ds-2101-f26', {
    targetPoints: '70',
    hypotheticalRaw: { 'as-ds-a1': '30', 'as-ds-mid': '50' },
  });
  const row = compareScenario(plan, s).rows[0];

  assert.equal(row.projected.marks.projectedPoints, 96);
  assert.equal(row.projected.target.status, 'already-secured');
  assert.equal(row.uncertainty, null);
});

test('R2: clearing the assumptions restores baseline target and range', () => {
  const s = state();
  const plan = planWith(s, 'e-ds-2101-f26', { targetPoints: '70' });
  const row = compareScenario(plan, s).rows[0];

  assert.equal(row.projected.target.status, 'achievable');
  assert.equal(row.projected.target.requiredPercent, 67.5);
  assert.equal(row.projected.target.combined, true);
  assert.equal(row.uncertainty.lower, 16);
  assert.equal(row.uncertainty.upper, 96);
  assert.equal(row.uncertainty.includesFutureWork, true);
});

test('R2: the baseline-only target is retained and labelled separately', () => {
  const s = state();
  const plan = planWith(s, 'e-ds-2101-f26', {
    targetPoints: '70',
    hypotheticalRaw: { 'as-ds-a1': '30' },
  });
  const row = compareScenario(plan, s).rows[0];

  // The raw baseline figure stays available for comparison, clearly not the
  // scenario-conditioned one.
  assert.equal(row.baseline.target.requiredPercent, 67.5);
  assert.equal(row.projected.target.requiredPercent, 48);
});

test('R2: an out-of-range assumption cannot produce a usable target', () => {
  const s = state();
  const plan = planWith(s, 'e-ds-2101-f26', {
    targetPoints: '70',
    hypotheticalRaw: { 'as-ds-mid': '999' },
  });
  const row = compareScenario(plan, s).rows[0];

  assert.equal(row.projected.marks.valid, false);
  assert.equal(row.projected.target.status, 'invalid-assumption');
  assert.equal(row.projected.target.requiredPercent, null);
  assert.equal(row.uncertainty, null);
});

test('R2: uncertaintyRange still spans only unresolved weight after assumptions', () => {
  // Direct guard for the helper that the comparison now feeds scenario values.
  assert.deepEqual(
    [uncertaintyRange({ earnedPoints: 66, unresolvedWeight: 30, futureWeight: 0 }).lower,
      uncertaintyRange({ earnedPoints: 66, unresolvedWeight: 30, futureWeight: 0 }).upper],
    [66, 96],
  );
  assert.equal(uncertaintyRange({ earnedPoints: 96, unresolvedWeight: 0, futureWeight: 0 }), null);
});

/* -------------------------------------------------------------------- GAP */

test('GAP: offered grade choices equal the shared grade-point table', async () => {
  const { gradeChoices } = await import('../src/domain/scenarios.js');
  const choices = gradeChoices();
  assert.deepEqual(choices, Object.keys(GRADE_POINTS));
  for (const grade of ['F', 'FA', 'C-', 'D+']) {
    assert.ok(choices.includes(grade), `${grade} must be offered so a zero-point fail can be modelled`);
  }
});

test('GAP: an F assumption is a real zero-point result, not missing data', () => {
  assert.equal(GRADE_POINTS.F, 0);
  assert.equal(GRADE_POINTS.FA, 0);
});
