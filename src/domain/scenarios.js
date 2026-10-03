/**
 * Named scenario plans (plan section 4).
 *
 * A plan stores INPUTS ONLY. Every result is recalculated from the current
 * records each time it is displayed, so a saved plan can never contradict the
 * dashboard. Baseline attendance, weighted points and the assumed GPA are shown
 * as separate cards: there is no blended academic score.
 */
import { summarizeAttendance, projectAttendance, pendingBounds } from './attendance.js';
import { summarizeMarks, calculateTarget, projectMarks } from './marks.js';
import { attemptsFromState, projectGPA, isCountedGrade } from './gpa.js';
import { GRADE_POINTS } from '../data/policies.js';

export function createEmptyScenario() {
  return {
    futurePresent: '',
    futureAbsent: '',
    remainingSessions: '',
    targetPoints: '',
    hypotheticalRaw: {},
  };
}

export function createEmptyPlan(id, name = 'New plan', baselineRevision = 1, timestamp) {
  return {
    id,
    name,
    enrollmentScenarios: {},
    gradeAssumptions: {},
    shortlistedCourseIds: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    baselineRevision,
  };
}

/**
 * Lower/upper outcome range from uncertainty alone.
 * Scheduled work is held at its current assumption; the range only spans weight
 * whose result is genuinely unresolved. If future work is also outstanding the
 * range is widened and explicitly labelled as such.
 */
export function uncertaintyRange(summary) {
  const earned = Number(summary.earnedPoints) || 0;
  const unresolved = Number(summary.unresolvedWeight) || 0;
  const future = Number(summary.futureWeight) || 0;
  if (unresolved <= 0) return null;
  return {
    lower: earned,
    upper: Math.min(100, Math.round((earned + unresolved + future) * 100) / 100),
    includesFutureWork: future > 0,
    label:
      future > 0
        ? 'Widest range: unpublished weight plus all still-scheduled work.'
        : 'Range across the unpublished weight only, with scheduled work excluded.',
  };
}

/**
 * Grade choices for a plan's grade assumption.
 *
 * Derived from the shared grade-point table so the offered list cannot drift
 * from the table the GPA module uses. Includes the failure grades (F/FA) and the
 * D+/C- bands the editor previously omitted, so a zero-point fail is modellable.
 */
export function gradeChoices() {
  return Object.keys(GRADE_POINTS).filter(isCountedGrade);
}

/**
 * Requirement summary AFTER the saved hypothetical scores are applied.
 *
 * `calculateTarget` and `uncertaintyRange` must see the scenario-conditioned
 * earned points and the weight that is STILL unresolved or scheduled, not the
 * baseline. A weight with a hypothetical score is treated as resolved and is
 * removed from the remaining requirement. Returns null when a hypothetical is
 * invalid, because an invalid assumption must never become a usable result.
 */
function scenarioMarksSummary(baselineMarks, marksProjection) {
  if (!marksProjection || !marksProjection.valid) return null;
  return {
    schemeValid: baselineMarks.schemeValid,
    earnedPoints: marksProjection.projectedPoints,
    unresolvedWeight: marksProjection.unresolvedWeight,
    futureWeight: marksProjection.futureWeight,
  };
}

/**
 * Pending disclosure for a comparison row: the unresolved count and the
 * conservative bounds `P/(H+U)` to `(P+U)/(H+U)` for the scenario. Pending work
 * is never treated as resolved, so it is always labelled provisional. When no
 * recorded sessions exist the bounds are 0% to 100%, never a confident zero.
 */
function pendingDisclosure(summary, projection) {
  const source =
    projection && projection.valid
      ? { present: projection.projectedPresent, held: projection.projectedHeld, pending: summary.pending }
      : { present: summary.present, held: summary.held, pending: summary.pending };
  return {
    count: summary.pending,
    provisional: summary.pending > 0,
    bounds: pendingBounds(source),
  };
}

/**
 * Compare a saved plan against the current records.
 *
 * Returns per-enrollment baseline/projected attendance and marks, an
 * independently assumed GPA, a `staleBaseline` flag and field errors. A plan can
 * be saved even when a result is unattainable; it is simply never labelled
 * achieved.
 */
export function compareScenario(plan, state) {
  const threshold = state.preferences?.attendanceThresholdPercent;
  const courseById = new Map((state.courses || []).map((c) => [c.id, c]));
  const enrollmentById = new Map((state.enrollments || []).map((e) => [e.id, e]));
  const semesterById = new Map((state.semesters || []).map((s) => [s.id, s]));

  const rows = [];
  const errors = {};

  Object.entries(plan?.enrollmentScenarios || {}).forEach(([enrollmentId, scenario]) => {
    const enrollment = enrollmentById.get(enrollmentId);
    if (!enrollment) {
      errors[enrollmentId] = {
        enrollment: 'This course is no longer in the dataset. Remove it from the plan or restore the record.',
        repairable: true,
      };
      rows.push({ enrollmentId, missing: true, error: errors[enrollmentId].enrollment });
      return;
    }
    const course = courseById.get(enrollment.courseId);
    const label = `${course?.code || enrollment.courseId} · ${course?.name || 'Unknown course'}`;

    const sessions = (state.attendanceSessions || []).filter((s) => s.enrollmentId === enrollmentId);
    const baselineAttendance = summarizeAttendance(sessions, threshold);
    const attendanceProjection = projectAttendance(baselineAttendance, {
      futurePresent: scenario.futurePresent,
      futureAbsent: scenario.futureAbsent,
      remainingSessions: scenario.remainingSessions,
    });

    const assessments = (state.assessments || []).filter((a) => a.enrollmentId === enrollmentId);
    const baselineMarks = summarizeMarks(assessments);
    const marksProjection = projectMarks(assessments, scenario.hypotheticalRaw || {});
    const scenarioMarks = scenarioMarksSummary(baselineMarks, marksProjection);
    const targetBlank = scenario.targetPoints === '' || scenario.targetPoints == null;
    const target = targetBlank
      ? null
      : scenarioMarks == null
        ? {
            status: 'invalid-assumption',
            requiredPercent: null,
            message: 'A hypothetical score is outside its assessment maximum, so no target is shown until it is corrected.',
            errors: {},
          }
        : calculateTarget(scenarioMarks, scenario.targetPoints);
    // The baseline figure is kept for comparison but is labelled as baseline at
    // the call site; the scenario-conditioned result is `projected.target`.
    const baselineTarget = targetBlank ? null : calculateTarget(baselineMarks, scenario.targetPoints);

    rows.push({
      enrollmentId,
      courseId: enrollment.courseId,
      courseCode: course?.code || enrollment.courseId,
      courseName: course?.name || 'Unknown course',
      semesterLabel: semesterById.get(enrollment.semesterId)?.label || enrollment.semesterId,
      baseline: {
        attendance: baselineAttendance,
        marks: baselineMarks,
        target: baselineTarget,
      },
      projected: {
        attendance: attendanceProjection,
        marks: marksProjection,
        target,
      },
      uncertainty: scenarioMarks ? uncertaintyRange(scenarioMarks) : null,
      pending: pendingDisclosure(baselineAttendance, attendanceProjection),
      errors: attendanceProjection.errors,
    });
  });

  // ---- GPA projection: only from explicitly entered grade assumptions.
  const attempts = attemptsFromState(state);
  const currentSemester = (state.semesters || []).find((s) => s.id === state.preferences?.selectedSemesterId);
  const cutoff = currentSemester?.order ?? Number.POSITIVE_INFINITY;
  const assumptions = [];
  Object.entries(plan?.gradeAssumptions || {}).forEach(([enrollmentId, grade]) => {
    if (!isCountedGrade(grade)) return;
    const enrollment = enrollmentById.get(enrollmentId);
    if (!enrollment) return;
    const course = courseById.get(enrollment.courseId);
    const semester = semesterById.get(enrollment.semesterId);
    assumptions.push({
      courseId: enrollment.courseId,
      grade,
      credits: course?.credits || 0,
      semesterOrder: semester?.order || 0,
      nonCredit: !!course?.nonCredit,
    });
  });
  const gpaProjection = projectGPA(attempts, assumptions, cutoff);

  return {
    planId: plan?.id || null,
    planName: plan?.name || 'Untitled plan',
    staleBaseline: (plan?.baselineRevision ?? state.revision) !== state.revision,
    baselineRevision: plan?.baselineRevision ?? null,
    currentRevision: state.revision,
    rows,
    gpa: {
      baseline: gpaProjection.baseline,
      projected: gpaProjection.projected,
      delta: gpaProjection.delta,
      hasAssumptions: gpaProjection.hasAssumptions,
      note: gpaProjection.note,
      assumptions,
    },
    errors,
    courseCount: rows.length,
  };
}

/** Lightweight plan summary for list rows; never stores derived numbers. */
export function summarizePlan(plan) {
  const ids = Object.keys(plan?.enrollmentScenarios || {});
  return {
    id: plan?.id,
    name: plan?.name || 'Untitled plan',
    courseCount: ids.length,
    assumptionCount: Object.keys(plan?.gradeAssumptions || {}).length,
    updatedAt: plan?.updatedAt || plan?.createdAt || null,
  };
}

export default { compareScenario, createEmptyPlan, createEmptyScenario, summarizePlan, uncertaintyRange, gradeChoices };
