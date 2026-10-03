import test from 'node:test';
import assert from 'node:assert/strict';

import { createSeedState, createEmptyState } from '../src/data/seed.js';
import { buildAttentionItems } from '../src/domain/attention.js';

const ids = (state) => buildAttentionItems(state).map((item) => item.id);
const item = (state, id) => buildAttentionItems(state).find((entry) => entry.id === id);

test('a course below the threshold produces an urgent item with a reason', () => {
  const state = createSeedState();
  const entry = item(state, 'attendance-below:e-dl-2103-f26');
  assert.ok(entry);
  assert.equal(entry.severity, 'urgent');
  assert.match(entry.reason, /7 of 10 recorded sessions attended \(70%\)/);
  assert.match(entry.action, /5 consecutive attended/);
  assert.equal(entry.view, 'course');
  assert.equal(entry.params.section, 'attendance');
});

test('completed tasks disappear from the attention list', () => {
  const state = createSeedState();
  assert.ok(ids(state).some((id) => id.startsWith('task:')), 'unfinished tasks are listed');

  const completedTaskState = createSeedState();
  completedTaskState.tasks = completedTaskState.tasks.map((task) => ({ ...task, completed: true }));
  assert.equal(buildAttentionItems(completedTaskState).some((entry) => entry.id.startsWith('task:')), false);
});

test('an overdue task is reported with the number of days', () => {
  const state = createSeedState();
  const entry = item(state, 'task:task-2');
  assert.equal(entry.severity, 'urgent');
  assert.match(entry.reason, /Overdue by 5 days/);
  assert.equal(entry.dueDate, '2026-09-28');
});

test('an overdue task is urgent and sorts above a task that is merely due soon', () => {
  const state = createSeedState();
  state.tasks.push({
    id: 'task-duesoon',
    enrollmentId: null,
    title: 'Due soon task (synthetic)',
    dueDate: '2026-10-05',
    priority: 'medium',
    completed: false,
    source: null,
  });
  const list = buildAttentionItems(state);
  const overdue = list.find((entry) => entry.id === 'task:task-2');
  const dueSoon = list.find((entry) => entry.id === 'task:task-duesoon');
  assert.equal(overdue.severity, 'urgent');
  assert.equal(dueSoon.severity, 'warning');
  assert.ok(list.indexOf(overdue) < list.indexOf(dueSoon), 'overdue sorts above due soon');
});

test('raising the threshold changes which courses are urgent', () => {
  const state = createSeedState();
  state.preferences.attendanceThresholdPercent = 95;
  const list = ids(state);
  assert.ok(list.includes('attendance-below:e-ds-2101-f26'), '91.7% is now below 95%');
  assert.ok(list.includes('attendance-below:e-se-2201-f26'));
  assert.equal(list.includes('attendance-margin:e-ds-2101-f26'), false, 'below-threshold replaces the margin warning');
});

test('lowering the threshold clears the urgent item', () => {
  const state = createSeedState();
  state.preferences.attendanceThresholdPercent = 65;
  assert.equal(ids(state).includes('attendance-below:e-dl-2103-f26'), false);
});

test('a small absence margin is a warning, not an urgent item', () => {
  const state = createSeedState();
  const entry = item(state, 'attendance-margin:e-math-2205-f26');
  assert.ok(entry);
  assert.equal(entry.severity, 'warning');
  assert.match(entry.reason, /0 more absences/);
});

test('pending records and missing data are informational and flagged', () => {
  const state = createSeedState();
  const pending = item(state, 'attendance-pending:e-se-2201-f26');
  assert.equal(pending.severity, 'info');
  assert.match(pending.reason, /2 attendance entries are still pending/);

  const noAttendance = item(state, 'missing-attendance:e-ee-2001-f26');
  assert.equal(noAttendance.missingData, true);
  assert.match(noAttendance.reason, /No session records/);

  const noMarks = item(state, 'missing-marks:e-dl-2103-f26');
  assert.equal(noMarks.missingData, true);
});

test('unpublished marks are informational while a missed assessment is a warning', () => {
  const state = createSeedState();
  assert.equal(item(state, 'marks-unpublished:e-ds-2101-f26').severity, 'info');
  assert.equal(item(state, 'marks-missed:e-hm-2301-f26').severity, 'warning');
});

test('an unpaid challan close to its due date is reported', () => {
  const state = createSeedState();
  const entry = item(state, 'fee:ch-2026f-1');
  assert.equal(entry.severity, 'warning');
  assert.match(entry.reason, /due in 11 days/);
  assert.match(entry.action, /synthetic/i);
});

test('a paid challan and a far-future challan are not reported', () => {
  const state = createSeedState();
  assert.equal(ids(state).includes('fee:ch-2026f-2'), false);
  state.fees[0].challans[0].dueDate = '2027-06-01';
  assert.equal(ids(state).includes('fee:ch-2026f-1'), false);
});

test('no attention item targets a retired view', () => {
  const RETIRED = new Set(['services', 'requestForm', 'requestReview', 'requestHistory', 'feedback', 'registration', 'studyPlan', 'outcomes', 'document']);
  const state = createSeedState();
  const offenders = buildAttentionItems(state).filter((entry) => RETIRED.has(entry.view));
  assert.deepEqual(offenders.map((entry) => entry.id), [], 'attention items must never link to a retired view');
});

test('items are sorted by severity, then due date, then id', () => {
  const state = createSeedState();
  const list = buildAttentionItems(state);
  const ranks = list.map((entry) => ({ urgent: 0, warning: 1, info: 2 }[entry.severity]));
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), 'severity order holds');

  const warningDates = list.filter((e) => e.severity === 'warning' && e.dueDate).map((e) => e.dueDate);
  assert.deepEqual(warningDates, [...warningDates].sort(), 'warning deadlines are in date order');
});

test('every item carries a reason, a destination and a stable id', () => {
  const state = createSeedState();
  const list = buildAttentionItems(state);
  assert.ok(list.length > 0);
  list.forEach((entry) => {
    assert.ok(entry.id && typeof entry.id === 'string');
    assert.ok(entry.reason && entry.reason.length > 5, `weak reason: ${entry.reason}`);
    assert.ok(entry.view && typeof entry.view === 'string');
  });
  const unique = new Set(list.map((entry) => entry.id));
  assert.equal(unique.size, list.length, 'ids are unique');
});

test('an empty dataset produces no academic attention items', () => {
  const state = createEmptyState();
  const list = buildAttentionItems(state);
  assert.equal(list.filter((entry) => entry.kind === 'attendance' || entry.kind === 'marks').length, 0);
});

test('the list reacts to a data edit rather than to a stored flag', () => {
  const state = createSeedState();
  assert.ok(ids(state).includes('attendance-below:e-dl-2103-f26'));
  state.attendanceSessions = state.attendanceSessions.map((session) =>
    session.enrollmentId === 'e-dl-2103-f26' && session.presence === 'absent'
      ? { ...session, presence: 'present' }
      : session,
  );
  assert.equal(ids(state).includes('attendance-below:e-dl-2103-f26'), false);
});
