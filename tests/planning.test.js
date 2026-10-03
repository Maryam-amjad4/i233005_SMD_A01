import test from 'node:test';
import assert from 'node:assert/strict';

import { createSeedState } from '../src/data/seed.js';
import { studyPlanSummary } from '../src/domain/planning.js';
import { attemptsFromState, calculateCGPA, gradePoints } from '../src/domain/gpa.js';

test('the study plan summary buckets completed, in-progress and planned courses', () => {
  const state = createSeedState();
  state.plans[0].shortlistedCourseIds = ['c-os-2301'];
  const summary = studyPlanSummary(state);
  assert.equal(summary.completed.length, 5, 'the repeated CS-1102 pass is credited once');
  assert.equal(summary.inProgress.length, 7);
  assert.equal(summary.planned.length, 1);
  assert.equal(summary.planned[0].code, 'OS-2301');
  assert.equal(summary.creditsCompleted, 14);
  assert.equal(summary.creditsInProgress, 17);
});

test('completed credits are deduplicated so a repeated pass is not credited twice', () => {
  const state = createSeedState();
  const summary = studyPlanSummary(state);
  const attempts = attemptsFromState(state);
  const cgpa = calculateCGPA(attempts);

  // CS-1102 was passed twice (A in Spring 2025, B in Fall 2025). Only the later
  // attempt is credited, so the completed credits match the CGPA's passing credits.
  const passingAttemptIds = new Set(
    attempts
      .filter((attempt) => !attempt.nonCredit && gradePoints(attempt.grade) > 0)
      .map((attempt) => attempt.id),
  );
  const countedPassingCredits = cgpa.included
    .filter((row) => passingAttemptIds.has(row.attemptId))
    .reduce((sum, row) => sum + row.credits, 0);

  assert.equal(summary.creditsCompleted, 14);
  assert.equal(summary.creditsCompleted, countedPassingCredits);

  // The CGPA denominator also carries the 3-credit FA attempt at 0 points, so it
  // is deliberately larger than the completed (passed) credits.
  assert.equal(cgpa.includedCredits, 17);
});

test('a planned course that is already completed is not planned again', () => {
  const state = createSeedState();
  state.plans[0].shortlistedCourseIds = ['c-prog-1101'];
  const summary = studyPlanSummary(state);
  assert.equal(summary.planned.length, 0);
});
