import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateSGPA,
  calculateCGPA,
  projectGPA,
  attemptsFromState,
  isCountedGrade,
  gradePoints,
} from '../src/domain/gpa.js';
import { createSeedState } from '../src/data/seed.js';

const attempt = (overrides) => ({
  id: overrides.id,
  courseId: overrides.courseId ?? overrides.id,
  semesterOrder: overrides.semesterOrder ?? 1,
  credits: overrides.credits ?? 3,
  grade: overrides.grade ?? null,
  status: overrides.status ?? 'completed',
  nonCredit: overrides.nonCredit ?? false,
});

test('three credits at A plus one credit at B is 3.75', () => {
  const result = calculateSGPA([
    { courseId: 'a', credits: 3, grade: 'A' },
    { courseId: 'b', credits: 1, grade: 'B' },
  ]);
  assert.equal(result.value, 3.75);
  assert.equal(result.includedCredits, 4);
  assert.equal(result.exclusions.length, 0);
});

test('a repeat uses the latest attempt, not an average and not the earlier grade', () => {
  const attempts = [
    attempt({ id: 'first', courseId: 'cs1102', semesterOrder: 1, credits: 3, grade: 'A' }),
    attempt({ id: 'second', courseId: 'cs1102', semesterOrder: 2, credits: 3, grade: 'B' }),
  ];
  const cgpa = calculateCGPA(attempts);
  assert.equal(cgpa.value, 3);
  assert.deepEqual(cgpa.countedAttemptIds, ['second']);
  assert.ok(cgpa.exclusions.some((e) => /Superseded/.test(e.reason)));
  assert.equal(cgpa.repeated.length, 1);

  // The earlier term still reports the grade earned in that term.
  const sgpa = calculateSGPA(attempts, { semesterOrder: 1 });
  assert.equal(sgpa.value, 4);
});

test('a historical cutoff selects the attempt available at that point', () => {
  const attempts = [
    attempt({ id: 'first', courseId: 'cs1102', semesterOrder: 1, credits: 3, grade: 'A' }),
    attempt({ id: 'second', courseId: 'cs1102', semesterOrder: 2, credits: 3, grade: 'B' }),
  ];
  assert.equal(calculateCGPA(attempts, 1).value, 4);
  assert.equal(calculateCGPA(attempts, 2).value, 3);
});

test('W, I and non-credit coursework are excluded, while F/FA count at 0 points', () => {
  const attempts = [
    attempt({ id: 'kept', courseId: 'a', credits: 3, grade: 'A' }),
    attempt({ id: 'w', courseId: 'b', credits: 3, grade: 'W' }),
    attempt({ id: 'i', courseId: 'c', credits: 2, grade: 'I' }),
    attempt({ id: 'fa', courseId: 'd', credits: 3, grade: 'FA' }),
    attempt({ id: 'nc', courseId: 'e', credits: 1, grade: 'A', nonCredit: true }),
  ];
  const result = calculateSGPA(attempts);
  assert.equal(result.value, 2, 'the FA contributes 0 points but still enlarges the denominator');
  assert.equal(result.includedCredits, 6);
  assert.equal(result.exclusions.length, 3, 'only W, I and non-credit are excluded');
  assert.ok(result.exclusions.every((e) => typeof e.reason === 'string' && e.reason.length > 0));
});

test('F and FA are counted grades worth zero points, never dropped from the denominator', () => {
  assert.equal(isCountedGrade('F'), true);
  assert.equal(isCountedGrade('FA'), true);
  assert.equal(gradePoints('F'), 0);
  assert.equal(gradePoints('FA'), 0);

  const sgpa = calculateSGPA([
    attempt({ id: 'b', courseId: 'a', credits: 3, grade: 'B' }),
    attempt({ id: 'f', courseId: 'b', credits: 3, grade: 'F' }),
  ]);
  assert.equal(sgpa.includedCredits, 6);
  assert.equal(sgpa.value, 1.5);
});

test('an unfinished repeat does not erase the earlier finalized result', () => {
  const attempts = [
    attempt({ id: 'first', courseId: 'cs1102', semesterOrder: 1, credits: 3, grade: 'A' }),
    attempt({ id: 'retake', courseId: 'cs1102', semesterOrder: 2, credits: 3, grade: 'I' }),
  ];
  const cgpa = calculateCGPA(attempts);
  assert.equal(cgpa.value, 4);
  assert.deepEqual(cgpa.countedAttemptIds, ['first']);
  assert.ok(cgpa.exclusions.some((e) => e.id === 'retake' && /Incomplete/.test(e.reason)));
});

test('an empty denominator reports unavailable rather than zero', () => {
  const result = calculateSGPA([attempt({ id: 'w', courseId: 'a', grade: 'W' })]);
  assert.equal(result.value, null);
  assert.equal(result.includedCredits, 0);
});

test('pending, withdrawn and unrecognised grades never count', () => {
  assert.equal(isCountedGrade('A'), true);
  assert.equal(isCountedGrade('D+'), true);
  assert.equal(isCountedGrade('F'), true, 'F counts with 0 points');
  assert.equal(isCountedGrade('FA'), true, 'FA counts with 0 points');
  assert.equal(isCountedGrade('W'), false);
  assert.equal(isCountedGrade(null), false);
  assert.equal(gradePoints('B+'), 3.33);
  assert.equal(gradePoints('Z'), null);
});

test('hypothetical grades never mutate the transcript and never imply a score', () => {
  const attempts = [
    attempt({ id: 'hist', courseId: 'a', semesterOrder: 1, credits: 3, grade: 'A' }),
    attempt({ id: 'now', courseId: 'b', semesterOrder: 2, credits: 3, grade: null, status: 'enrolled' }),
  ];
  const snapshot = JSON.stringify(attempts);
  const projection = projectGPA(attempts, [{ courseId: 'b', grade: 'B+', credits: 3, semesterOrder: 2 }], 2);

  assert.equal(projection.baseline.value, 4);
  assert.equal(projection.projected.value, 3.665);
  assert.equal(projection.delta, -0.335);
  assert.equal(JSON.stringify(attempts), snapshot, 'transcript records are unchanged');
  assert.ok(projection.applied.some((a) => a.mode === 'replaced' && a.attemptId === 'now'));
});

test('a projection without grade assumptions says so instead of guessing', () => {
  const projection = projectGPA([attempt({ id: 'hist', courseId: 'a', grade: 'A' })], [], 1);
  assert.equal(projection.hasAssumptions, false);
  assert.equal(projection.projected.value, 4);
  assert.match(projection.note, /never converted into grades automatically/);
});

test('seeded transcript reproduces the documented SGPA and CGPA values', () => {
  const state = createSeedState();
  const attempts = attemptsFromState(state);

  const spring = calculateSGPA(attempts, { semesterOrder: 1 });
  assert.equal(spring.includedCredits, 9);
  assert.equal(spring.value, 3.7767);

  const fall = calculateSGPA(attempts, { semesterOrder: 2 });
  assert.equal(fall.includedCredits, 11);
  assert.equal(fall.value, 2.3936);

  const cgpa = calculateCGPA(attempts, 2);
  assert.equal(cgpa.includedCredits, 17);
  assert.equal(cgpa.value, 2.8424);
  assert.equal(cgpa.repeated.length, 1);
  assert.equal(cgpa.repeated[0].courseId, 'c-ds-1102');

  // Current-term enrollments carry no grade and cannot move the CGPA.
  const withCurrent = calculateCGPA(attempts, 4);
  assert.equal(withCurrent.value, cgpa.value);
});

test('the current term has no declared grade, so its SGPA is unavailable', () => {
  const state = createSeedState();
  const attempts = attemptsFromState(state);
  const current = calculateSGPA(attempts, { semesterOrder: 4 });
  assert.equal(current.value, null);
  assert.equal(current.includedCredits, 0);
  assert.equal(current.exclusions.length, 7);
});
