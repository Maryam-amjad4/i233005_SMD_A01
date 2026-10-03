/**
 * Attention list (plan section 4).
 *
 * Every item carries a stated reason and a destination, and is built from
 * explicit rules — never from an opaque "academic risk" score. Informational
 * missing-data notices are flagged separately from urgent items so a student is
 * not warned about something that simply has not been published yet.
 */
import { summarizeAttendance } from './attendance.js';
import { summarizeMarks } from './marks.js';
import { daysBetween } from './validation.js';
import { dueWording } from './wording.js';

export const SEVERITY_ORDER = { urgent: 0, warning: 1, info: 2 };

/** Fee reminders start inside this window. */
export const FEE_WARNING_DAYS = 14;

/**
 * Build the attention items for the selected semester.
 * Returns `[{ id, severity, reason, title, view, params, dueDate, kind }]`.
 */
export function buildAttentionItems(state) {
  const semesterId = state.preferences?.selectedSemesterId;
  const demoDate = state.demoDate;
  const threshold = state.preferences?.attendanceThresholdPercent;
  const items = [];

  const courseById = new Map((state.courses || []).map((c) => [c.id, c]));
  const enrollments = (state.enrollments || []).filter((e) => e.semesterId === semesterId && e.status !== 'withdrawn');

  // ---- attendance and marks per enrolled course
  enrollments.forEach((enrollment) => {
    const course = courseById.get(enrollment.courseId);
    const label = `${course?.code || enrollment.courseId} · ${course?.name || 'Unknown course'}`;
    const params = { enrollmentId: enrollment.id };

    const sessions = (state.attendanceSessions || []).filter((s) => s.enrollmentId === enrollment.id);
    const attendance = summarizeAttendance(sessions, threshold);

    if (attendance.status === 'below') {
      items.push({
        id: `attendance-below:${enrollment.id}`,
        severity: 'urgent',
        kind: 'attendance',
        title: label,
        reason: `${attendance.present} of ${attendance.held} recorded sessions attended (${attendance.percent}%), below the ${threshold}% threshold.`,
        action: attendance.recoveryPossible
          ? `${attendance.recoverySessions} consecutive attended session${attendance.recoverySessions === 1 ? '' : 's'} would reach the threshold.`
          : 'Recovery by consecutive attendance is not possible at this threshold.',
        view: 'course',
        params: { ...params, section: 'attendance' },
        dueDate: null,
      });
    } else if (!attendance.belowThreshold && attendance.immediateAbsenceCapacity != null && attendance.immediateAbsenceCapacity <= 1 && attendance.status !== 'no-data') {
      items.push({
        id: `attendance-margin:${enrollment.id}`,
        severity: 'warning',
        kind: 'attendance',
        title: label,
        reason: `Only ${attendance.immediateAbsenceCapacity} more absence${attendance.immediateAbsenceCapacity === 1 ? '' : 's'} can be absorbed before dropping below ${threshold}%.`,
        action: 'Open the attendance planner to model a scenario.',
        view: 'course',
        params: { ...params, section: 'attendance' },
        dueDate: null,
      });
    }

    if (attendance.pending > 0) {
      items.push({
        id: `attendance-pending:${enrollment.id}`,
        severity: 'info',
        kind: 'attendance',
        title: label,
        reason: `${attendance.pending} attendance entr${attendance.pending === 1 ? 'y is' : 'ies are'} still pending, so the ${attendance.percent ?? '—'}% figure is provisional.`,
        action: 'Possible range is shown in the attendance view.',
        view: 'course',
        params: { ...params, section: 'attendance' },
        dueDate: null,
      });
    }

    if (attendance.status === 'no-data') {
      items.push({
        id: `missing-attendance:${enrollment.id}`,
        severity: 'info',
        missingData: true,
        kind: 'attendance',
        title: label,
        reason: 'No session records have been published for this course yet.',
        action: 'Nothing to act on — this is missing data, not zero attendance.',
        view: 'course',
        params: { ...params, section: 'attendance' },
        dueDate: null,
      });
    }

    const assessments = (state.assessments || []).filter((a) => a.enrollmentId === enrollment.id);
    const marks = summarizeMarks(assessments);

    if (marks.assessmentCount === 0) {
      items.push({
        id: `missing-marks:${enrollment.id}`,
        severity: 'info',
        missingData: true,
        kind: 'marks',
        title: label,
        reason: 'No assessment scheme has been published for this course.',
        action: 'Marks features stay disabled until a scheme exists.',
        view: 'course',
        params: { ...params, section: 'marks' },
        dueDate: null,
      });
    } else {
      if (marks.unresolvedWeight > 0) {
        items.push({
          id: `marks-unpublished:${enrollment.id}`,
          severity: 'info',
          kind: 'marks',
          title: label,
          reason: `${marks.unresolvedWeight}% of the weight is submitted but not published, so it is unresolved rather than zero.`,
          action: 'Enter a hypothetical score to see a future-only requirement.',
          view: 'course',
          params: { ...params, section: 'marks' },
          dueDate: null,
        });
      }
      if (marks.missedCount > 0) {
        items.push({
          id: `marks-missed:${enrollment.id}`,
          severity: 'warning',
          kind: 'marks',
          title: label,
          reason: `${marks.missedCount} assessment${marks.missedCount === 1 ? ' was' : 's were'} missed and ${marks.missedCount === 1 ? 'counts' : 'count'} as zero in the assessed weight.`,
          action: 'Check the assessment list for the exact component.',
          view: 'course',
          params: { ...params, section: 'marks' },
          dueDate: null,
        });
      }
      if (!marks.schemeValid) {
        items.push({
          id: `marks-scheme:${enrollment.id}`,
          severity: 'info',
          missingData: true,
          kind: 'marks',
          title: label,
          reason: `Assessment weights total ${marks.totalWeight}% instead of 100%.`,
          action: 'Whole-course targets are disabled for this course.',
          view: 'course',
          params: { ...params, section: 'marks' },
          dueDate: null,
        });
      }
    }
  });

  // ---- personal tasks (completed tasks never appear)
  (state.tasks || [])
    .filter((task) => !task.completed)
    .forEach((task) => {
      const daysLeft = daysBetween(demoDate, task.dueDate);
      if (daysLeft == null) return;
      const overdue = daysLeft < 0;
      const dueSoon = daysLeft >= 0 && daysLeft <= 2;
      if (!overdue && !dueSoon) return;
      items.push({
        id: `task:${task.id}`,
        severity: overdue ? 'urgent' : 'warning',
        kind: 'task',
        title: task.title,
        // Shared wording, so an overdue task reads identically here and on the
        // Tasks and Calendar screens.
        reason: `${dueWording(daysLeft).text}.`,
        action: 'Open the task list.',
        view: 'tasks',
        params: {},
        dueDate: task.dueDate,
      });
    });

  // ---- synthetic fees
  (state.fees || []).forEach((fee) => {
    const semester = (state.semesters || []).find((s) => s.id === fee.semesterId);
    (fee.challans || []).forEach((challan) => {
      if (challan.status === 'paid') return;
      const daysLeft = daysBetween(demoDate, challan.dueDate);
      if (daysLeft == null || daysLeft > FEE_WARNING_DAYS) return;
      items.push({
        id: `fee:${challan.id}`,
        severity: daysLeft < 0 ? 'urgent' : 'warning',
        kind: 'fee',
        title: `${challan.label}${semester ? ` · ${semester.label}` : ''}`,
        reason:
          daysLeft < 0
            ? `Synthetic challan ${challan.reference} passed its due date by ${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? '' : 's'}.`
            : `Synthetic challan ${challan.reference} is due in ${daysLeft} day${daysLeft === 1 ? '' : 's'} (${challan.amount.toLocaleString('en-US')} ${fee.currency}).`,
        action: 'Amounts and references are synthetic; no payment is processed here.',
        view: 'finance',
        params: { feeId: fee.id, challanId: challan.id },
        dueDate: challan.dueDate,
      });
    });
  });

  return items.sort((a, b) => {
    const bySeverity = (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9);
    if (bySeverity !== 0) return bySeverity;
    if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
    if (a.dueDate && !b.dueDate) return -1;
    if (!a.dueDate && b.dueDate) return 1;
    return a.id.localeCompare(b.id);
  });
}

export default { buildAttentionItems, SEVERITY_ORDER, FEE_WARNING_DAYS };
