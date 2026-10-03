/**
 * Attendance arithmetic (plan section 4).
 *
 * Definitions used throughout:
 *   P = present sessions, A = absent, U = pending (record not yet published)
 *   H = P + A  (held / recorded sessions — pending entries are NOT absences)
 *   t = threshold as a fraction
 *
 * Every comparison is done in integers (percent x count) instead of dividing
 * floating point fractions, so a boundary such as 12/15 == 80% cannot fail
 * because of a rounding error.
 */
import { validateCount } from './validation.js';

export const DEFAULT_THRESHOLD_PERCENT = 80;

const VALID_PRESENCE = ['present', 'absent', 'pending'];

/** Validate a threshold given in percent. Valid open interval is the integers 1–100. */
export function normalizeThreshold(thresholdPercent) {
  const parsed = validateCount(thresholdPercent, { label: 'Attendance threshold' });
  if (!parsed.ok) {
    return { ok: false, value: null, error: 'Attendance threshold must be a whole number between 1 and 100.' };
  }
  if (parsed.value <= 0 || parsed.value > 100) {
    return { ok: false, value: null, error: 'Attendance threshold must be greater than 0 and at most 100.' };
  }
  return { ok: true, value: parsed.value, error: null };
}

function countPresence(sessions) {
  const counts = { present: 0, absent: 0, pending: 0 };
  const errors = [];
  const valid = [];
  const list = Array.isArray(sessions) ? sessions : [];
  if (!Array.isArray(sessions)) errors.push('Attendance session list is missing or not an array.');
  list.forEach((session, index) => {
    if (!session || !VALID_PRESENCE.includes(session.presence)) {
      errors.push(`Session ${index + 1} has an unreadable presence value and was ignored.`);
      return;
    }
    // durationHours is optional (a session without one is treated as a standard
    // one-hour session) but a present, non-positive value is a data error.
    const hours = session.durationHours == null ? 1 : Number(session.durationHours);
    if (!Number.isFinite(hours) || hours <= 0) {
      errors.push(`Session on ${session.date || 'an unknown date'} has an invalid duration and was ignored.`);
      return;
    }
    counts[session.presence] += 1;
    valid.push(session);
  });
  return { counts, errors, valid };
}

const round1 = (n) => Math.round(n * 10) / 10;

/**
 * Smallest integer x >= 0 with (P + x) / (H + x) >= t.
 *
 * Rewritten as an exact integer inequality:
 *   100(P + x) >= T(H + x)   where T is the threshold in percent
 *   =>  x(100 - T) >= T*H - 100*P
 * At T = 100 the left-hand side is always zero, so a prior absence can never be
 * recovered by consecutive attendance; that is reported, not silently rounded.
 */
export function recoveryByConsecutiveAttendance(present, held, thresholdPercent) {
  const T = thresholdPercent;
  if (T >= 100) return held > 0 && present === held ? 0 : null;
  const numerator = T * held - 100 * present;
  if (numerator <= 0) return 0;
  const denominator = 100 - T;
  let x = Math.ceil(numerator / denominator);
  // Guard against any boundary disagreement between ceil and the inequality.
  return x;
}

/**
 * Largest integer k >= 0 with P / (H + k) >= t, i.e. how many consecutive
 * absences are still survivable. Zero when the course is already below.
 */
export function immediateAbsenceCapacity(present, held, thresholdPercent) {
  const T = thresholdPercent;
  if (T <= 0) return null;
  const slack = 100 * present - T * held;
  if (slack < 0) return 0;
  let k = Math.floor(slack / T);
  return k;
}

/**
 * Full attendance summary for one enrollment.
 *
 * `status` is one of: no-data | below | at-threshold | above | invalid-threshold.
 * `provisional` is true whenever pending records exist, because pending entries
 * are excluded from the denominator and could move the result either way.
 */
export function summarizeAttendance(sessions, thresholdPercent = DEFAULT_THRESHOLD_PERCENT) {
  const { counts, errors } = countPresence(sessions);
  const held = counts.present + counts.absent;
  const pending = counts.pending;
  const threshold = normalizeThreshold(thresholdPercent);

  const base = {
    present: counts.present,
    absent: counts.absent,
    pending,
    held,
    totalSessions: held + pending,
    thresholdPercent: threshold.ok ? threshold.value : null,
    provisional: pending > 0,
    errors: [...errors],
  };

  if (!threshold.ok) {
    return {
      ...base,
      status: 'invalid-threshold',
      fraction: held > 0 ? counts.present / held : null,
      percent: held > 0 ? round1((counts.present / held) * 100) : null,
      belowThreshold: null,
      recoverySessions: null,
      recoveryPossible: null,
      immediateAbsenceCapacity: null,
      thresholdError: threshold.error,
    };
  }

  // `T` is kept in PERCENT because the integer helpers below compare
  // 100 * (present + x) >= T * (held + x).
  const T = threshold.value;
  const t = T / 100;

  if (held === 0) {
    // No recorded sessions is no-data, never 0%. There is no recorded base to
    // recover from, so the recovery count is unknown rather than a confident
    // zero: a "0 sessions to recover" figure would read as an achievable target.
    // ``recoveryPossible`` stays true — with no absences recorded, recovery is
    // still conceptually possible — but with no base there is no session count.
    return {
      ...base,
      status: 'no-data',
      fraction: null,
      percent: null,
      belowThreshold: null,
      recoverySessions: null,
      recoveryPossible: true,
      immediateAbsenceCapacity: null,
      thresholdError: null,
    };
  }

  const fraction = counts.present / held;
  const percent = round1(fraction * 100);
  const below = fraction < t;
  const recovery = recoveryByConsecutiveAttendance(counts.present, held, T);

  return {
    ...base,
    status: below ? 'below' : percent === Math.round(T * 10) / 10 ? 'at-threshold' : 'above',
    fraction,
    percent,
    belowThreshold: below,
    recoverySessions: recovery,
    // At a 100% threshold a previous absence makes recovery by consecutive
    // attendance impossible; zero recoveries are reported as impossible.
    recoveryPossible: recovery != null,
    immediateAbsenceCapacity: immediateAbsenceCapacity(counts.present, held, T),
    thresholdError: null,
  };
}

/**
 * Conservative bounds implied by pending records: every pending entry treated as
 * absent (lower) or as present (upper). This is a range, not a probability and
 * not an eligibility verdict.
 */
export function pendingBounds(summary) {
  const { present, held, pending } = summary;
  const total = held + pending;
  if (total === 0) return { hasPending: false, lower: null, upper: null };
  return {
    hasPending: pending > 0,
    lower: present / total,
    upper: (present + pending) / total,
    lowerPercent: round1((present / total) * 100),
    upperPercent: round1(((present + pending) / total) * 100),
  };
}

/**
 * Future scenario. Accepts an options object so the optional remaining-session
 * limit can be omitted without shifting positional arguments.
 *
 * Returns validation errors per field instead of throwing, so a form can show
 * them inline and clear a stale result.
 */
export function projectAttendance(summary, options = {}) {
  const { futurePresent = '', futureAbsent = '', remainingSessions = '' } = options || {};
  const errors = {};

  const present = validateCount(futurePresent, { label: 'Future classes attended', allowBlank: true });
  if (!present.ok) errors.futurePresent = present.error;
  const absent = validateCount(futureAbsent, { label: 'Future classes missed', allowBlank: true });
  if (!absent.ok) errors.futureAbsent = absent.error;
  const remaining = validateCount(remainingSessions, { label: 'Remaining classes in term', allowBlank: true });
  if (!remaining.ok) errors.remainingSessions = remaining.error;

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors, fraction: null, percent: null, thresholdMet: null, scheduleFeasible: null, thresholdPercent: summary.thresholdPercent };
  }

  const fp = present.blank ? 0 : present.value;
  const fa = absent.blank ? 0 : absent.value;
  const scheduled = fp + fa;
  const projectedPresent = summary.present + fp;
  const projectedHeld = summary.held + scheduled;

  if (projectedHeld === 0) {
    return {
      valid: false,
      errors: { futurePresent: 'Add at least one future class to build a scenario.' },
      fraction: null,
      percent: null,
      thresholdMet: null,
      scheduleFeasible: null,
      thresholdPercent: summary.thresholdPercent,
    };
  }

  const fraction = projectedPresent / projectedHeld;
  const thresholdMet = summary.thresholdPercent == null ? null : fraction >= summary.thresholdPercent / 100;

  let scheduleFeasible = null;
  let exceedsRemaining = null;
  if (!remaining.blank && remaining.value != null) {
    scheduleFeasible = scheduled <= remaining.value;
    exceedsRemaining = scheduled > remaining.value;
  }

  const recoveryNeeded = recoveryByConsecutiveAttendance(summary.present, summary.held, summary.thresholdPercent);
  const recoveryFeasible =
    summary.thresholdPercent == null || recoveryNeeded == null
      ? null
      : !remaining.blank && remaining.value != null
        ? recoveryNeeded <= remaining.value
        : null;

  return {
    valid: true,
    errors: {},
    futurePresent: fp,
    futureAbsent: fa,
    projectedPresent,
    projectedHeld,
    fraction,
    percent: round1(fraction * 100),
    thresholdMet,
    scheduleFeasible,
    exceedsRemaining,
    recoveryNeeded,
    recoveryFeasible,
    thresholdPercent: summary.thresholdPercent,
  };
}

/** Convenience selector label for a status, always including the word. */
export function statusLabel(summary) {
  switch (summary.status) {
    case 'no-data':
      return { label: 'No recorded sessions', tone: 'info' };
    case 'below':
      return { label: 'Below threshold', tone: 'danger' };
    case 'at-threshold':
      return { label: 'Exactly at threshold', tone: 'warn' };
    case 'above':
      return { label: 'Above threshold', tone: 'ok' };
    case 'invalid-threshold':
      return { label: 'Threshold not set', tone: 'warn' };
    default:
      return { label: 'Unknown', tone: 'neutral' };
  }
}

export default {
  DEFAULT_THRESHOLD_PERCENT,
  normalizeThreshold,
  summarizeAttendance,
  pendingBounds,
  projectAttendance,
  recoveryByConsecutiveAttendance,
  immediateAbsenceCapacity,
  statusLabel,
};
