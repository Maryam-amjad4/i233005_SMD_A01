/**
 * Grade points, SGPA, CGPA and hypothetical GPA (plan section 4).
 *
 * Attempts arrive in a normalised shape so this module stays pure:
 *   { id, courseId, semesterOrder, credits, grade, status, nonCredit }
 * Selectors map enrollment records and the course catalogue onto that shape.
 *
 * Counting conventions (documented as demonstration conventions, not claims about
 * every published edge case):
 *   - W, I, pending and non-credit coursework are excluded from the denominator.
 *   - F and FA are finalized results worth 0 grade points and they COUNT in the
 *     denominator at 0 points, exactly as the plan grade-point table states
 *     (F/FA=0). Excluding them would drop a fail from the denominator and show a
 *     higher, misleading CGPA. This labelled demonstration convention is surfaced
 *     to the user in the History grade legend and the policy note.
 *   - CGPA counts the latest finalized GPA-counting attempt of a repeated course
 *     up to the requested cutoff; an unfinished attempt never erases an earlier
 *     finalized result.
 */
import { GRADE_POINTS, GRADE_LEGEND_NOTES } from '../data/policies.js';

/** Grades that carry grade points and count toward a GPA. F/FA count at 0. */
export const COUNTED_GRADES = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'F', 'FA'];

/** Grades shown in the legend but never counted. */
export const NON_COUNTED_GRADES = ['W', 'I', 'P', '-', null];

export function gradePoints(grade) {
  if (grade == null) return null;
  const key = String(grade).trim();
  if (!(key in GRADE_POINTS)) return null;
  return GRADE_POINTS[key];
}

export function isCountedGrade(grade) {
  return grade != null && COUNTED_GRADES.includes(String(grade).trim());
}

function exclusionReason(attempt) {
  if (!attempt) return 'Unknown record.';
  if (attempt.nonCredit) return 'Non-credit course.';
  const grade = attempt.grade == null ? null : String(attempt.grade).trim();
  if (grade == null) return 'No result declared in the supplied records.';
  if (grade === 'W') return GRADE_LEGEND_NOTES.W;
  if (grade === 'I') return GRADE_LEGEND_NOTES.I;
  if (grade === 'P') return GRADE_LEGEND_NOTES.P;
  return `Grade "${grade}" is not in the grade-points table.`;
}

function average(totalPoints, credits) {
  if (!credits) return { value: null, totalPoints: 0, includedCredits: 0 };
  return { value: Math.round((totalPoints / credits) * 10000) / 10000, totalPoints: Math.round(totalPoints * 100) / 100, includedCredits: credits };
}

const normalise = (attempts) =>
  (Array.isArray(attempts) ? attempts : []).filter(Boolean).map((attempt, index) => ({
    id: attempt.id || `${attempt.courseId || 'course'}-${index}`,
    courseId: attempt.courseId || null,
    semesterOrder: Number.isFinite(attempt.semesterOrder) ? attempt.semesterOrder : 0,
    semesterId: attempt.semesterId || null,
    credits: Number.isFinite(Number(attempt.credits)) ? Number(attempt.credits) : 0,
    grade: attempt.grade == null ? null : String(attempt.grade).trim(),
    status: attempt.status || null,
    nonCredit: !!attempt.nonCredit,
  }));

/**
 * Semester GPA. `attempts` should already be scoped to one term; pass
 * `{ semesterOrder }` to filter defensively.
 */
export function calculateSGPA(attempts, { semesterOrder } = {}) {
  const scoped = normalise(attempts).filter(
    (a) => (semesterOrder == null ? true : a.semesterOrder === semesterOrder),
  );
  let points = 0;
  let credits = 0;
  const included = [];
  const exclusions = [];

  scoped.forEach((attempt) => {
    if (!attempt.nonCredit && isCountedGrade(attempt.grade)) {
      points += gradePoints(attempt.grade) * attempt.credits;
      credits += attempt.credits;
      included.push(attempt.id);
    } else {
      exclusions.push({ id: attempt.id, courseId: attempt.courseId, grade: attempt.grade, reason: exclusionReason(attempt) });
    }
  });

  const { value, totalPoints } = average(points, credits);
  return { value, totalPoints, includedCredits: credits, included, exclusions, attemptCount: scoped.length };
}

/**
 * Cumulative GPA up to `cutoffSemesterOrder`, using the latest finalized
 * GPA-counting attempt of each repeated course.
 */
export function calculateCGPA(attempts, cutoffSemesterOrder = Infinity) {
  const scoped = normalise(attempts).filter((a) => a.semesterOrder <= cutoffSemesterOrder);
  const byCourse = new Map();

  scoped.forEach((attempt) => {
    if (!attempt.courseId) return;
    const group = byCourse.get(attempt.courseId) || [];
    group.push(attempt);
    byCourse.set(attempt.courseId, group);
  });

  let points = 0;
  let credits = 0;
  const countedAttemptIds = [];
  const included = [];
  const exclusions = [];
  const repeated = [];

  byCourse.forEach((group, courseId) => {
    const sorted = [...group].sort((a, b) => a.semesterOrder - b.semesterOrder || String(a.id).localeCompare(String(b.id)));
    const countable = sorted.filter((a) => !a.nonCredit && isCountedGrade(a.grade));
    if (countable.length === 0) {
      sorted.forEach((a) => exclusions.push({ id: a.id, courseId, grade: a.grade, reason: exclusionReason(a) }));
      return;
    }
    const chosen = countable[countable.length - 1];
    points += gradePoints(chosen.grade) * chosen.credits;
    credits += chosen.credits;
    countedAttemptIds.push(chosen.id);
    included.push({ attemptId: chosen.id, courseId, grade: chosen.grade, credits: chosen.credits, semesterOrder: chosen.semesterOrder });
    if (countable.length > 1) {
      repeated.push({ courseId, attempts: countable.map((a) => ({ id: a.id, grade: a.grade, semesterOrder: a.semesterOrder })) });
    }
    countable
      .filter((a) => a.id !== chosen.id)
      .forEach((a) => exclusions.push({ id: a.id, courseId, grade: a.grade, reason: 'Superseded by a later attempt of the same course.' }));
    sorted
      .filter((a) => !isCountedGrade(a.grade) || a.nonCredit)
      .forEach((a) => exclusions.push({ id: a.id, courseId, grade: a.grade, reason: exclusionReason(a) }));
  });

  const { value, totalPoints } = average(points, credits);
  return { value, totalPoints, includedCredits: credits, countedAttemptIds, included, exclusions, repeated };
}

/**
 * Hypothetical GPA. Never mutates transcript data: attempts are cloned, assumed
 * grades are applied to the clone, and the baseline is recalculated unchanged.
 *
 * `assumptions` entries look like
 *   { courseId, grade, credits, semesterOrder, nonCredit }
 */
export function projectGPA(attempts, assumptions = [], cutoffSemesterOrder = Infinity) {
  const base = normalise(attempts);
  const baseline = calculateCGPA(base, cutoffSemesterOrder);
  const clone = base.map((attempt) => ({ ...attempt }));
  const applied = [];

  (Array.isArray(assumptions) ? assumptions : []).forEach((assumption) => {
    if (!assumption || !assumption.courseId || !isCountedGrade(assumption.grade)) return;
    const targets = clone.filter((a) => a.courseId === assumption.courseId);
    if (targets.length > 0) {
      const latest = targets.reduce((best, a) => (a.semesterOrder >= best.semesterOrder ? a : best), targets[0]);
      latest.grade = String(assumption.grade).trim();
      applied.push({ courseId: assumption.courseId, mode: 'replaced', attemptId: latest.id, grade: latest.grade });
    } else {
      clone.push({
        id: `hypothetical-${assumption.courseId}`,
        courseId: assumption.courseId,
        semesterOrder: Number.isFinite(assumption.semesterOrder) ? assumption.semesterOrder : 0,
        semesterId: assumption.semesterId || null,
        credits: Number.isFinite(Number(assumption.credits)) ? Number(assumption.credits) : 0,
        grade: String(assumption.grade).trim(),
        status: 'hypothetical',
        nonCredit: !!assumption.nonCredit,
      });
      applied.push({ courseId: assumption.courseId, mode: 'added', attemptId: `hypothetical-${assumption.courseId}`, grade: assumption.grade });
    }
  });

  const projected = calculateCGPA(clone, cutoffSemesterOrder);
  const delta =
    baseline.value != null && projected.value != null
      ? Math.round((projected.value - baseline.value) * 10000) / 10000
      : null;

  return {
    baseline,
    projected,
    applied,
    delta,
    hasAssumptions: applied.length > 0,
    note: applied.length === 0
      ? 'No grade assumptions were entered, so no projected GPA is shown. Numeric scores are never converted into grades automatically.'
      : 'Projection uses only the grades entered as assumptions. Everything else comes from the stored transcript.',
  };
}

/**
 * Selector: map dataset records onto normalised attempts.
 * Catalog credits and non-credit flags come from the course catalogue.
 */
export function attemptsFromState(state, { includeCurrentTerm = true } = {}) {
  const courseById = new Map((state.courses || []).map((c) => [c.id, c]));
  const semesterById = new Map((state.semesters || []).map((s) => [s.id, s]));
  return (state.enrollments || [])
    .map((enrollment) => {
      const course = courseById.get(enrollment.courseId);
      const semester = semesterById.get(enrollment.semesterId);
      return {
        id: enrollment.id,
        courseId: enrollment.courseId,
        courseCode: course?.code || null,
        courseName: course?.name || 'Unknown course',
        semesterId: enrollment.semesterId,
        semesterOrder: semester?.order ?? 0,
        credits: course?.credits ?? 0,
        nonCredit: !!course?.nonCredit,
        grade: enrollment.finalGrade ?? null,
        status: enrollment.status,
      };
    })
    .filter((attempt) => (includeCurrentTerm ? true : attempt.semesterOrder < (state.semesters || []).find((s) => s.status === 'current')?.order));
}

/** Grade legend rows for the transcript screen. */
export function gradeLegend() {
  return [
    ...COUNTED_GRADES.map((grade) => ({ grade, points: GRADE_POINTS[grade], counted: true, note: null })),
    ...Object.keys(GRADE_LEGEND_NOTES).map((grade) => ({
      grade,
      points: gradePoints(grade),
      counted: false,
      note: GRADE_LEGEND_NOTES[grade],
    })),
  ];
}

export default {
  COUNTED_GRADES,
  NON_COUNTED_GRADES,
  gradePoints,
  isCountedGrade,
  calculateSGPA,
  calculateCGPA,
  projectGPA,
  attemptsFromState,
  gradeLegend,
};
