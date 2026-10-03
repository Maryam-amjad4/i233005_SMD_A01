/**
 * Study-plan summary (plan section 6, task 6).
 *
 * The registration/study-plan planning screens were retired from the release,
 * and the prerequisite, linked-laboratory and credit-total evaluation they
 * owned (`evaluateCoursePlan`) went with them. What remains is the derived
 * completed / in-progress / planned bucket summary the Profile screen reads.
 *
 * `studyPlanSummary` reads the persisted `shortlistedCourseIds` field when a
 * saved plan carries one and simply ignores it when it does not, so stored plans
 * that predate the retirement keep loading unchanged.
 */
import { GRADE_POINTS } from '../data/policies.js';

/** Grades that count as having passed a course. */
function hasPassed(attempt) {
  if (!attempt || attempt.nonCredit) return false;
  const grade = attempt.grade == null ? null : String(attempt.grade).trim();
  if (!grade || !(grade in GRADE_POINTS)) return false;
  return GRADE_POINTS[grade] > 0;
}

/**
 * Study plan buckets: completed courses, courses in progress and shortlist
 * courses, derived from records rather than stored.
 */
export function studyPlanSummary(state) {
  const courseById = new Map((state.courses || []).map((c) => [c.id, c]));
  const semesterById = new Map((state.semesters || []).map((s) => [s.id, s]));
  const selectedSemesterId = state.preferences?.selectedSemesterId;
  const enrolled = (state.enrollments || []).filter((e) => e.status !== 'withdrawn');

  // A course passed more than once is credited once. Keep the latest attempt,
  // mirroring gpa.js, so completed credits cannot double-count a repeat.
  const latestPassedByCourse = new Map();
  enrolled
    .filter((e) => hasPassed({ grade: e.finalGrade }))
    .forEach((e) => {
      const order = semesterById.get(e.semesterId)?.order ?? 0;
      const current = latestPassedByCourse.get(e.courseId);
      if (
        !current ||
        order > current.order ||
        (order === current.order && String(e.id).localeCompare(String(current.enrollment.id)) > 0)
      ) {
        latestPassedByCourse.set(e.courseId, { enrollment: e, order });
      }
    });

  const completed = [...latestPassedByCourse.values()].map(({ enrollment: e }) => ({
    enrollmentId: e.id,
    courseId: e.courseId,
    code: courseById.get(e.courseId)?.code || e.courseId,
    name: courseById.get(e.courseId)?.name || 'Unknown course',
    credits: courseById.get(e.courseId)?.credits || 0,
    grade: e.finalGrade,
    semesterLabel: semesterById.get(e.semesterId)?.label || e.semesterId,
  }));

  const inProgress = enrolled
    .filter((e) => e.semesterId === selectedSemesterId)
    .map((e) => ({
      enrollmentId: e.id,
      courseId: e.courseId,
      code: courseById.get(e.courseId)?.code || e.courseId,
      name: courseById.get(e.courseId)?.name || 'Unknown course',
      credits: courseById.get(e.courseId)?.credits || 0,
    }));

  const completedCourseIds = new Set(completed.map((row) => row.courseId));
  const shortlist = (state.plans || []).flatMap((plan) => plan.shortlistedCourseIds || []);
  const planned = shortlist
    .filter((courseId, index) => shortlist.indexOf(courseId) === index && !completedCourseIds.has(courseId))
    .map((courseId) => {
      const course = courseById.get(courseId);
      return {
        courseId,
        code: course?.code || courseId,
        name: course?.name || 'Unknown course',
        credits: course?.credits || 0,
      };
    });

  return {
    completed,
    inProgress,
    planned,
    creditsCompleted: completed.reduce((sum, row) => sum + row.credits, 0),
    creditsInProgress: inProgress.reduce((sum, row) => sum + row.credits, 0),
    creditsPlanned: planned.reduce((sum, row) => sum + row.credits, 0),
  };
}

export default { studyPlanSummary };
