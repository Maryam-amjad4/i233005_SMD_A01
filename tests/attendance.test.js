import test from 'node:test';
import assert from 'node:assert/strict';

import {
  summarizeAttendance,
  pendingBounds,
  projectAttendance,
  recoveryByConsecutiveAttendance,
  immediateAbsenceCapacity,
  statusLabel,
} from '../src/domain/attendance.js';

const session = (presence) => ({ presence, durationHours: 1.25, date: '2026-09-01' });

/**
 * Build a session list from counts rather than a hand-written pattern string:
 * miscounting a pattern literal is the easiest way to write a test that passes
 * for the wrong reason.
 */
const sessionsWith = (present, absent = 0, pending = 0) => [
  ...Array.from({ length: present }, () => session('present')),
  ...Array.from({ length: absent }, () => session('absent')),
  ...Array.from({ length: pending }, () => session('pending')),
];

test('seven present out of ten needs five consecutive classes', () => {
  const sessions = Array.from({ length: 10 }, (_, i) => ({ presence: i < 7 ? 'present' : 'absent' }));
  assert.equal(summarizeAttendance(sessions, 80).recoverySessions, 5);
});

test('recovery fixtures at the default 80% threshold', () => {
  const summary = summarizeAttendance(sessionsWith(7, 3), 80);
  assert.equal(summary.present, 7);
  assert.equal(summary.absent, 3);
  assert.equal(summary.held, 10);
  assert.equal(summary.percent, 70);
  assert.equal(summary.status, 'below');
  assert.equal(summary.belowThreshold, true);
  assert.equal(summary.recoverySessions, 5);
});

test('immediate absence capacity fixtures', () => {
  assert.equal(summarizeAttendance(sessionsWith(8, 2), 80).immediateAbsenceCapacity, 0);
  assert.equal(summarizeAttendance(sessionsWith(9, 1), 80).immediateAbsenceCapacity, 1);
  assert.equal(immediateAbsenceCapacity(9, 10, 80), 1);
  assert.equal(immediateAbsenceCapacity(10, 10, 80), 2);
});

test('a fully present course at a 100% threshold has zero absence capacity', () => {
  const summary = summarizeAttendance(sessionsWith(6), 100);
  assert.equal(summary.percent, 100);
  assert.equal(summary.recoverySessions, 0);
  assert.equal(summary.immediateAbsenceCapacity, 0);
});

test('a prior absence makes consecutive-attendance recovery impossible at 100%', () => {
  const summary = summarizeAttendance(sessionsWith(4, 1), 100);
  assert.equal(summary.recoveryPossible, false);
  assert.equal(summary.recoverySessions, null);
  assert.equal(recoveryByConsecutiveAttendance(4, 5, 100), null);
});

test('no recorded sessions is no-data, never 0%', () => {
  const summary = summarizeAttendance([], 80);
  assert.equal(summary.status, 'no-data');
  assert.equal(summary.percent, null);
  assert.equal(summary.fraction, null);
  assert.equal(summary.held, 0);
  assert.equal(summary.recoverySessions, null, 'no recorded base means no recovery count, not 0');
  assert.equal(summary.recoveryPossible, true, 'recovery stays conceptually possible; only the count is unknown');
  assert.equal(statusLabel(summary).tone, 'info');
});

test('exactly at the threshold is reported as its own status', () => {
  const summary = summarizeAttendance(sessionsWith(8, 2), 80);
  assert.equal(summary.percent, 80);
  assert.equal(summary.status, 'at-threshold');
  assert.equal(summary.belowThreshold, false);
  assert.equal(summary.immediateAbsenceCapacity, 0);
});

test('12/15 reaches exactly 80% and 11/14 stays below it', () => {
  const base = summarizeAttendance(sessionsWith(7, 3), 80);
  const five = projectAttendance(base, { futurePresent: '5', futureAbsent: '0' });
  assert.equal(five.projectedPresent, 12);
  assert.equal(five.projectedHeld, 15);
  assert.equal(five.fraction, 0.8);
  assert.equal(five.thresholdMet, true);

  const four = projectAttendance(base, { futurePresent: '4', futureAbsent: '0' });
  assert.equal(four.fraction, 11 / 14);
  assert.equal(four.thresholdMet, false);
});

test('scenario feasibility uses the optional remaining-session limit', () => {
  const base = summarizeAttendance(sessionsWith(7, 3), 80);
  const enough = projectAttendance(base, { futurePresent: '5', futureAbsent: '0', remainingSessions: '6' });
  assert.equal(enough.scheduleFeasible, true);
  assert.equal(enough.recoveryFeasible, true);

  const tooFew = projectAttendance(base, { futurePresent: '5', futureAbsent: '0', remainingSessions: '3' });
  assert.equal(tooFew.scheduleFeasible, false);
  assert.equal(tooFew.recoveryFeasible, false);
});

test('pending records are excluded from the denominator and given as bounds', () => {
  const summary = summarizeAttendance(sessionsWith(4, 1, 2), 80);
  assert.equal(summary.held, 5);
  assert.equal(summary.pending, 2);
  assert.equal(summary.percent, 80);
  assert.equal(summary.provisional, true);

  const bounds = pendingBounds(summary);
  assert.equal(bounds.hasPending, true);
  assert.equal(bounds.lower, 4 / 7);
  assert.equal(bounds.upper, 6 / 7);
});

test('only pending records produce no percentage but full 0–100% bounds', () => {
  const summary = summarizeAttendance(sessionsWith(0, 0, 2), 80);
  assert.equal(summary.held, 0);
  assert.equal(summary.percent, null);
  assert.equal(summary.recoverySessions, null, 'no recorded base means no recovery count, not 0');
  assert.equal(summary.recoveryPossible, true, 'recovery stays conceptually possible; only the count is unknown');

  const bounds = pendingBounds(summary);
  assert.equal(bounds.lower, 0);
  assert.equal(bounds.upper, 1);
});

test('held === 0 never reports a recovery count of zero, whether or not pending entries exist', () => {
  for (const sessions of [[], sessionsWith(0, 0, 1), sessionsWith(0, 0, 4)]) {
    const summary = summarizeAttendance(sessions, 80);
    assert.equal(summary.held, 0);
    assert.equal(summary.status, 'no-data');
    assert.equal(summary.recoverySessions, null);
    assert.equal(summary.recoveryPossible, true);
    assert.equal(summary.immediateAbsenceCapacity, null);
  }
});

test('future sessions never resolve old pending entries', () => {
  const summary = summarizeAttendance(sessionsWith(4, 1, 2), 80);
  const scenario = projectAttendance(summary, { futurePresent: '2', futureAbsent: '0' });
  assert.equal(scenario.projectedPresent, 6);
  assert.equal(scenario.projectedHeld, 7, 'only the two new classes are added');
  assert.equal(scenario.thresholdMet, true);
  assert.equal(summary.pending, 2, 'pending count is unchanged by projection');
});

test('invalid thresholds are rejected instead of being silently defaulted', () => {
  for (const bad of [0, -5, 101, '', 'abc', null, 80.5, '80.5', NaN]) {
    const summary = summarizeAttendance(sessionsWith(10), bad);
    assert.equal(summary.status, 'invalid-threshold', `threshold ${String(bad)} should be rejected`);
    assert.equal(summary.recoverySessions, null);
    assert.equal(summary.immediateAbsenceCapacity, null);
    assert.ok(summary.thresholdError);
  }
});

test('an omitted threshold falls back to the documented default', () => {
  assert.equal(summarizeAttendance(sessionsWith(9, 1)).thresholdPercent, 80);
  assert.equal(summarizeAttendance(sessionsWith(9, 1), undefined).thresholdPercent, 80);
});

test('fractional, negative and blank session counts are rejected per field', () => {
  const base = summarizeAttendance(sessionsWith(7, 3), 80);
  const result = projectAttendance(base, { futurePresent: '2.5', futureAbsent: '-1', remainingSessions: '' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.futurePresent);
  assert.ok(result.errors.futureAbsent);
  assert.equal(result.fraction, null);
  assert.equal(result.thresholdMet, null);
});

test('an unreadable session record is reported instead of counted as an absence', () => {
  const summary = summarizeAttendance([session('present'), { presence: 'unknown' }, session('absent')], 80);
  assert.equal(summary.held, 2);
  assert.equal(summary.errors.length, 1);
  assert.match(summary.errors[0], /unreadable presence/);
});

test('an invalid session duration is reported and excluded', () => {
  const summary = summarizeAttendance([session('present'), { presence: 'present', durationHours: 0 }], 80);
  assert.equal(summary.held, 1);
  assert.match(summary.errors[0], /invalid duration/);
});

test('changing the threshold changes recovery and capacity, not the record', () => {
  const sessions = sessionsWith(9, 1);
  assert.equal(summarizeAttendance(sessions, 80).recoverySessions, 0);
  assert.equal(summarizeAttendance(sessions, 95).recoverySessions, 10);
  assert.equal(summarizeAttendance(sessions, 75).immediateAbsenceCapacity, 2);
  assert.equal(summarizeAttendance(sessions, 75).present, 9, 'the stored record is unchanged');
});

test('many-session boundaries stay exact under the integer comparison', () => {
  // 199/250 = 79.6% needs 5 more attended to reach 80%; 0.8 boundary cases are
  // exactly where floating-point division usually fails.
  assert.equal(recoveryByConsecutiveAttendance(199, 250, 80), 5);
  assert.equal(recoveryByConsecutiveAttendance(7, 10, 80), 5);
  assert.equal(recoveryByConsecutiveAttendance(24, 30, 80), 0);
  assert.equal(recoveryByConsecutiveAttendance(23, 30, 80), 5);
  assert.equal(immediateAbsenceCapacity(9, 10, 80), 1);
  assert.equal(immediateAbsenceCapacity(19, 20, 80), 3);
  // Rounding-sensitive cases: 11/13 = 84.6% still misses 85%, so the answer is 4,
  // and 2.5 absences of slack can only absorb 2 whole absences.
  assert.equal(recoveryByConsecutiveAttendance(8, 10, 85), 4);
  assert.equal(immediateAbsenceCapacity(14, 15, 80), 2);
});
