#!/usr/bin/env node
/**
 * Print the figures the demo script and the verification report quote.
 *
 * The point of this script is that no number in the documentation is typed by
 * hand: every value below is recomputed from `createSeedState()` through the
 * same pure functions the app uses, so a seed change shows up here immediately.
 *
 * Usage: node scripts/report-fixtures.mjs
 */
import { createSeedState, createEmptyState } from '../src/data/seed.js';
import { summarizeAttendance, pendingBounds, projectAttendance } from '../src/domain/attendance.js';
import { summarizeMarks, calculateTarget, projectMarks } from '../src/domain/marks.js';
import { attemptsFromState, calculateSGPA, calculateCGPA } from '../src/domain/gpa.js';
import { studyPlanSummary } from '../src/domain/planning.js';
import { buildAttentionItems } from '../src/domain/attention.js';
import { compareScenario } from '../src/domain/scenarios.js';
import { formatDate } from '../src/domain/validation.js';

const state = createSeedState();
const out = [];
const line = (text = '') => out.push(text);

line('Flex++ fixture report');
line('=======================');
line(`demo date: ${state.demoDate}   revision: ${state.revision}   data version: ${state.version}`);
line('');

line('-- Attendance (threshold ' + state.preferences.attendanceThresholdPercent + '%) --');
line('code        P  A  U   H   pct   status          recovery  capacity');
for (const enrollment of state.enrollments.filter((e) => e.semesterId === 'sem-2026-fall')) {
  const course = state.courses.find((c) => c.id === enrollment.courseId);
  const summary = summarizeAttendance(
    state.attendanceSessions.filter((s) => s.enrollmentId === enrollment.id),
    state.preferences.attendanceThresholdPercent,
  );
  const pad = (value, width) => String(value ?? '—').padEnd(width);
  line(
    `${pad(course.code, 12)} ${pad(summary.present, 2)} ${pad(summary.absent, 2)} ${pad(summary.pending, 2)} ` +
      `${pad(summary.held, 3)} ${pad(summary.percent === null ? 'n/a' : summary.percent, 6)} ` +
      `${pad(summary.status, 15)} ${pad(summary.recoverySessions, 8)}  ${summary.immediateAbsenceCapacity ?? 'n/a'}`,
  );
  if (summary.pending > 0) {
    const bounds = pendingBounds(summary);
    line(`             pending bounds: ${bounds.lowerPercent}% – ${bounds.upperPercent}%`);
  }
}

const dl = summarizeAttendance(
  state.attendanceSessions.filter((s) => s.enrollmentId === 'e-dl-2103-f26'),
  80,
);
const five = projectAttendance(dl, { futurePresent: '5', futureAbsent: '0' });
line('');
line(`DL-2103 scenario 7/10 + 5 attended -> ${five.projectedPresent}/${five.projectedHeld} = ${five.fraction} (meets threshold: ${five.thresholdMet})`);
line('');

line('-- Marks --');
for (const enrollment of state.enrollments.filter((e) => e.semesterId === 'sem-2026-fall')) {
  const course = state.courses.find((c) => c.id === enrollment.courseId);
  const assessments = state.assessments.filter((a) => a.enrollmentId === enrollment.id);
  const summary = summarizeMarks(assessments);
  if (summary.assessmentCount === 0) {
    line(`${course.code.padEnd(12)} no assessment scheme`);
    continue;
  }
  line(
    `${course.code.padEnd(12)} earned ${String(summary.earnedPoints).padEnd(7)} published ${String(summary.publishedWeight).padEnd(6)} ` +
      `unresolved ${String(summary.unresolvedWeight).padEnd(6)} scheduled ${String(summary.futureWeight).padEnd(6)} schemeValid ${summary.schemeValid}`,
  );
}
const se = summarizeMarks(state.assessments.filter((a) => a.enrollmentId === 'e-se-2201-f26'));
const seTarget = calculateTarget(se, 70);
line('');
line(`SE-2201 target 70 from ${se.earnedPoints} earned with ${se.futureWeight} remaining -> ${seTarget.status}, ${seTarget.requiredPercent}% needed`);
line(seTarget.message);
const seProjection = projectMarks(state.assessments.filter((a) => a.enrollmentId === 'e-se-2201-f26'), { 'as-se-mid': 40 });
line(`SE-2201 with a hypothetical 40/50 midterm -> ${seProjection.projectedPoints} points`);
line('');

line('-- GPA --');
const attempts = attemptsFromState(state);
for (const semester of state.semesters) {
  const sgpa = calculateSGPA(attempts, { semesterOrder: semester.order });
  const cgpa = calculateCGPA(attempts, semester.order);
  line(
    `${semester.label.padEnd(13)} SGPA ${(sgpa.value === null ? 'n/a' : sgpa.value.toFixed(4)).padEnd(8)} ` +
      `credits ${String(sgpa.includedCredits).padEnd(4)} CGPA ${(cgpa.value === null ? 'n/a' : cgpa.value.toFixed(4)).padEnd(8)} ` +
      `counted attempts ${cgpa.countedAttemptIds.length}`,
  );
}
const repeats = calculateCGPA(attempts, 2).repeated;
line(`repeated courses: ${repeats.map((r) => `${r.courseId} x${r.attempts.length} (${r.attempts.map((a) => a.grade).join(' then ')})`).join(', ') || 'none'}`);
line('');

line('-- Planning --');
const summaryPlan = studyPlanSummary(state);
line(`completed ${summaryPlan.completed.length} (${summaryPlan.creditsCompleted} cr) · in progress ${summaryPlan.inProgress.length} (${summaryPlan.creditsInProgress} cr) · planned ${summaryPlan.planned.length} (${summaryPlan.creditsPlanned} cr)`);
line('');

line('-- Attention list (selected semester) --');
for (const item of buildAttentionItems(state)) {
  line(`${item.severity.padEnd(8)} ${item.id.padEnd(34)} ${item.reason}`);
}
line('');

line('-- Saved plan comparison --');
const comparison = compareScenario(state.plans[0], state);
line(`plan "${comparison.planName}" staleBaseline=${comparison.staleBaseline}`);
for (const row of comparison.rows) {
  line(
    `${row.courseCode}: attendance ${row.baseline.attendance.percent}% -> ${row.projected.attendance.percent}% ` +
      `(feasible ${row.projected.attendance.scheduleFeasible}), marks ${row.baseline.marks.earnedPoints} -> ${row.projected.marks.valid ? row.projected.marks.projectedPoints : 'n/a'}`,
  );
}
line(`GPA baseline ${comparison.gpa.baseline.value} projected ${comparison.gpa.projected.value} delta ${comparison.gpa.delta} (assumptions: ${comparison.gpa.assumptions.length})`);
line('');

line('-- Tasks --');
for (const task of state.tasks) {
  line(`${task.completed ? '[x]' : '[ ]'} ${task.dueDate} ${task.priority.padEnd(7)} ${task.title}`);
}
line('');

line('-- Fees --');
for (const fee of state.fees) {
  const semester = state.semesters.find((s) => s.id === fee.semesterId);
  line(`${semester.label.padEnd(13)} total ${fee.totalAmount} ${fee.currency}`);
  for (const challan of fee.challans) {
    line(`   ${challan.status.padEnd(7)} ${String(challan.amount).padEnd(8)} due ${challan.dueDate} ref ${challan.reference}`);
  }
}
line('');

line('-- Empty dataset --');
const empty = createEmptyState();
line(`enrollments ${empty.enrollments.length}, attendance ${empty.attendanceSessions.length}, assessments ${empty.assessments.length}, tasks ${empty.tasks.length}, revision ${empty.revision}`);
line(`attention items in the empty dataset: ${buildAttentionItems(empty).length}`);

process.stdout.write(`${out.join('\n')}\n`);
