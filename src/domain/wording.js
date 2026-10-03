/**
 * One home for the words a state reads as.
 *
 * The same underlying state used to be spelled differently on different screens
 * ("Overdue by 5 days" in Tasks, "Passed 5 days ago" in Calendar, and a third
 * inline copy in attention.js), so an identical overdue task looked like two
 * different things depending on where it was opened. Every phrase below is
 * defined once here and imported everywhere, so a state can only read one way.
 *
 * Product rules encoded here:
 *   - A missing or unreadable date is "no data". It is never overdue, never
 *     zero days, and never "due today".
 *   - Wording never upgrades missing/uncertain data into a confident number.
 */
import { daysBetween, windowStatus } from './validation.js';

/** Plural without an inline ternary at every call site. */
export const plural = (count, singular, pluralForm = `${singular}s`) =>
  `${count} ${count === 1 ? singular : pluralForm}`;

/**
 * Due-date wording for a stored due date, measured against the stored demo date.
 * Returns the human phrase plus the tone used for the status pill.
 *
 *   daysLeft < 0  -> Overdue by N days      (danger)
 *   daysLeft == 0 -> Due today              (warn)
 *   daysLeft > 0  -> Due in N days          (warn when N <= 3, else info)
 *   unreadable    -> No due date recorded   (neutral)
 */
export function dueWording(daysLeft) {
  const days = Number.isFinite(daysLeft) ? daysLeft : null;
  if (days == null) return { text: 'No due date recorded', tone: 'neutral', daysLeft: null };
  if (days < 0) {
    return { text: `Overdue by ${plural(Math.abs(days), 'day')}`, tone: 'danger', daysLeft: days };
  }
  if (days === 0) return { text: 'Due today', tone: 'warn', daysLeft: 0 };
  return { text: `Due in ${plural(days, 'day')}`, tone: days <= 3 ? 'warn' : 'info', daysLeft: days };
}

/** Convenience wrapper for call sites that hold two dates rather than a delta. */
export function dueWordingBetween(demoDate, dueDate) {
  return dueWording(daysBetween(demoDate, dueDate));
}

const WINDOW_WORDS = {
  open: 'Open',
  upcoming: 'Upcoming',
  closed: 'Closed',
  unknown: 'Status unknown',
  'not configured': 'Not configured',
};

/**
 * Human wording for an academic-window state.
 *
 * Called with a status it returns the phrase. Called with no argument it
 * returns the whole table, so a screen that describes a window without
 * evaluating one still uses the same words as a screen that does.
 */
export function windowStatusWords(status) {
  if (arguments.length === 0) return { ...WINDOW_WORDS };
  return WINDOW_WORDS[status] || 'Status unknown';
}

/** Window wording straight from an event plus the demo date. */
export function windowStatusWording(event, demoDate) {
  return windowStatusWords(windowStatus(event, demoDate));
}

/**
 * The wording used when a course record cannot be resolved.
 *
 * A screen must never render a bare identifier or an empty course name where a
 * reader expects a title, so both cases say plainly what is wrong. The helpers
 * accept either an enrollment record or a gpa attempt record; both carry
 * `courseId`, `courseCode` and `courseName`.
 */
export const UNKNOWN_COURSE_NAME = 'Unknown course';

/**
 * The course code where one is known. A raw id is deliberately NOT returned: it
 * is not a code, and printing it in a title reads as a course the catalogue
 * actually names.
 */
export function enrollmentCode(enrollment, course) {
  return course?.code || enrollment?.courseCode || UNKNOWN_COURSE_NAME;
}

/** Just the name side, falling back to an explicit unknown. */
export function enrollmentName(enrollment, course) {
  return course?.name || enrollment?.courseName || UNKNOWN_COURSE_NAME;
}

/** `CS-2101 · Data Structures`, or a single-name fallback when one side is unknown. */
export function enrollmentLabel(enrollment, course) {
  const code = enrollmentCode(enrollment, course);
  const name = enrollmentName(enrollment, course);
  if (code === UNKNOWN_COURSE_NAME) return name;
  if (name === UNKNOWN_COURSE_NAME) return code;
  return `${code} · ${name}`;
}

/**
 * What a GPA grade assumption actually does, in the words the calculator uses.
 *
 * `projectGPA` offers two branches: an assumption for a course that already has
 * a record replaces that course's latest attempt, and one for a course with no
 * record at all is added as a new hypothetical attempt. `mode` is the `applied`
 * entry the calculator returned, so the sentence can only describe what really
 * happened.
 *
 * `assumed` and `previous` are the assumption and the replaced attempt; the
 * credit consequence is stated only when the two can actually be compared.
 */
export function assumptionEffectWording(label, { mode, assumed, previous } = {}) {
  const replacesExisting = mode === 'replaced';
  const credits = Number.isFinite(assumed?.credits) ? assumed.credits : null;
  const creditCount = credits == null || credits === 0 ? 'no' : plural(credits, 'credit');
  const previousCredits = Number.isFinite(previous?.credits) ? previous.credits : null;
  const previousGrade = previous?.grade == null ? null : String(previous.grade).trim();

  if (replacesExisting) {
    const stillCounted = previousCredits != null && previousCredits === credits;
    return {
      mode: 'replaced',
      label: `Replaces the latest ${label} attempt`,
      text: stillCounted
        ? `The assumption replaces the latest ${label} attempt, so ${creditCount} stay in the GPA denominator. A graded attempt is a counted attempt, and the stored transcript is never modified — only this projection changes.`
        : `The assumption replaces the latest ${label} attempt, so ${creditCount} count in the GPA denominator instead of the ${previousCredits == null ? 'recorded' : plural(previousCredits, 'credit')} the transcript had. A graded attempt is a counted attempt, and the stored transcript is never modified — only this projection changes.`,
    };
  }

  const displaced = previousGrade == null ? 'an uncounted record' : `a ${previousGrade} record`;
  return {
    mode: 'added',
    label: `Adds a new hypothetical attempt to ${label}`,
    text: `${label} carries ${displaced} and no counted attempt, so the assumption adds ${creditCount} as a new hypothetical attempt and those credits count because a graded attempt is a counted attempt. The stored transcript is never modified.`,
  };
}

export default {
  plural,
  dueWording,
  dueWordingBetween,
  windowStatusWords,
  windowStatusWording,
  enrollmentLabel,
  enrollmentCode,
  enrollmentName,
  assumptionEffectWording,
  UNKNOWN_COURSE_NAME,
};
