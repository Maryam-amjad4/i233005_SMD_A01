import test from 'node:test';
import assert from 'node:assert/strict';

import { createSeedState, createEmptyState, DEMO_DATE } from '../src/data/seed.js';
import { summarizeMarks } from '../src/domain/marks.js';
import { summarizeAttendance } from '../src/domain/attendance.js';

const state = () => createSeedState();

test('every seeded reference resolves to an existing record', () => {
  const s = state();
  const courseIds = new Set(s.courses.map((c) => c.id));
  const semesterIds = new Set(s.semesters.map((t) => t.id));
  const enrollmentIds = new Set(s.enrollments.map((e) => e.id));

  s.enrollments.forEach((e) => {
    assert.ok(courseIds.has(e.courseId), `unknown course ${e.courseId}`);
    assert.ok(semesterIds.has(e.semesterId), `unknown semester ${e.semesterId}`);
  });
  s.attendanceSessions.forEach((session) => {
    assert.ok(enrollmentIds.has(session.enrollmentId), `unknown enrollment ${session.enrollmentId}`);
    assert.ok(['present', 'absent', 'pending'].includes(session.presence));
  });
  s.assessments.forEach((a) => {
    assert.ok(enrollmentIds.has(a.enrollmentId), `unknown enrollment ${a.enrollmentId}`);
  });
  s.outcomes.forEach((o) => {
    assert.ok(courseIds.has(o.courseId), `unknown outcome course ${o.courseId}`);
  });
  s.fees.forEach((fee) => {
    assert.ok(semesterIds.has(fee.semesterId), `unknown fee semester ${fee.semesterId}`);
  });
  s.requests.forEach((r) => {
    r.enrollmentIds.forEach((id) => assert.ok(enrollmentIds.has(id), `request references ${id}`));
  });
  s.feedback.forEach((f) => {
    assert.ok(enrollmentIds.has(f.enrollmentId), `feedback references ${f.enrollmentId}`);
  });
  s.tasks.forEach((task) => {
    if (task.enrollmentId) assert.ok(enrollmentIds.has(task.enrollmentId), `task references ${task.enrollmentId}`);
  });
  s.plans.forEach((plan) => {
    Object.keys(plan.enrollmentScenarios).forEach((id) =>
      assert.ok(enrollmentIds.has(id), `plan references ${id}`),
    );
  });
});

test('all entity ids are unique inside their collection', () => {
  const s = state();
  const unique = (list, label) => {
    const ids = list.map((row) => row.id);
    assert.equal(new Set(ids).size, ids.length, `duplicate id in ${label}`);
  };
  unique(s.semesters, 'semesters');
  unique(s.courses, 'courses');
  unique(s.enrollments, 'enrollments');
  unique(s.attendanceSessions, 'attendanceSessions');
  unique(s.assessments, 'assessments');
  unique(s.outcomes, 'outcomes');
  unique(s.fees, 'fees');
  unique(s.tasks, 'tasks');
  unique(s.plans, 'plans');
  unique(s.requests, 'requests');
  unique(s.feedback, 'feedback');
});

test('prerequisites and linked labs point at real catalogue entries', () => {
  const s = state();
  const ids = new Set(s.courses.map((c) => c.id));
  s.courses.forEach((course) => {
    (course.prerequisites || []).forEach((id) => assert.ok(ids.has(id), `${course.code} prerequisite ${id}`));
    if (course.linkedLabId) assert.ok(ids.has(course.linkedLabId), `${course.code} lab ${course.linkedLabId}`);
  });
});

test('every published assessment scheme totals 100%', () => {
  const s = state();
  const byEnrollment = new Map();
  s.assessments.forEach((a) => {
    byEnrollment.set(a.enrollmentId, [...(byEnrollment.get(a.enrollmentId) || []), a]);
  });
  let schemes = 0;
  byEnrollment.forEach((list, enrollmentId) => {
    const summary = summarizeMarks(list);
    assert.equal(summary.schemeValid, true, `${enrollmentId} scheme totals ${summary.totalWeight}%`);
    assert.equal(summary.errors.length, 0, `${enrollmentId} has assessment errors`);
    schemes += 1;
  });
  assert.equal(schemes, 4);
});

test('assessment weight and marks are internally consistent', () => {
  const s = state();
  s.assessments.forEach((a) => {
    assert.ok(a.maxMarks > 0, `${a.id} maxMarks`);
    assert.ok(a.weightPercent >= 0 && a.weightPercent <= 100, `${a.id} weight`);
    if (a.obtainedMarks != null) {
      assert.ok(a.obtainedMarks >= 0 && a.obtainedMarks <= a.maxMarks, `${a.id} obtained marks`);
      assert.equal(a.status, 'published', `${a.id} has marks but is not published`);
    }
    if (a.status === 'published') assert.ok(a.obtainedMarks != null, `${a.id} published without marks`);
  });
});

test('fee components add up to the stated total and to the challans', () => {
  const s = state();
  s.fees.forEach((fee) => {
    const componentTotal = fee.components.reduce((sum, c) => sum + c.amount, 0);
    assert.equal(componentTotal, fee.totalAmount, `${fee.id} components`);
    const challanTotal = fee.challans.reduce((sum, c) => sum + c.amount, 0);
    assert.ok(challanTotal >= fee.totalAmount, `${fee.id} challans below the total`);
    fee.challans.forEach((challan) => {
      assert.ok(['paid', 'unpaid'].includes(challan.status));
      if (challan.status === 'paid') assert.ok(challan.paidDate, `${challan.id} paid without a date`);
    });
  });
});

test('the seed contains every attendance state the app must render', () => {
  const s = state();
  const current = s.enrollments.filter((e) => e.semesterId === 'sem-2026-fall');
  const byId = (id) => summarizeAttendance(s.attendanceSessions.filter((x) => x.enrollmentId === id), 80);

  assert.equal(byId('e-ds-2101-f26').status, 'above', 'comfortably above threshold');
  assert.equal(byId('e-math-2205-f26').status, 'at-threshold', 'exactly at threshold');
  assert.equal(byId('e-dl-2103-f26').status, 'below', 'below threshold but recoverable');
  assert.equal(byId('e-dl-2103-f26').recoverySessions, 5);
  assert.equal(byId('e-ee-2001-f26').status, 'no-data', 'no attendance at all');
  assert.equal(byId('e-se-2201-f26').pending, 2, 'pending attendance');
  assert.equal(current.length, 7);
});

test('the seed contains every marks state the app must render', () => {
  const s = state();
  const marks = (id) => summarizeMarks(s.assessments.filter((a) => a.enrollmentId === id));

  assert.equal(marks('e-ds-2101-f26').unresolvedWeight, 30, 'unpublished marks');
  assert.equal(marks('e-se-2201-f26').earnedPoints, 36, 'published marks');
  assert.equal(marks('e-dl-2103-f26').assessmentCount, 0, 'a course with no marks at all');
  assert.equal(marks('e-hm-2301-f26').missedCount, 1, 'a missed assessment');
});

test('the seed contains four distinct terms including one without records', () => {
  const s = state();
  assert.equal(s.semesters.length, 4);
  assert.equal(s.semesters.filter((t) => t.status === 'completed').length, 3);
  assert.equal(s.semesters.filter((t) => t.status === 'current').length, 1);

  const empty = s.semesters.find((t) => t.hasRecords === false);
  assert.ok(empty, 'a record-free term exists');
  assert.equal(s.enrollments.filter((e) => e.semesterId === empty.id).length, 0);
  assert.equal(s.assessments.filter((a) => s.enrollments.some((e) => e.id === a.enrollmentId && e.semesterId === empty.id)).length, 0);
});

test('the repeat course is identified by a stable course id, not by name', () => {
  const s = state();
  const attempts = s.enrollments.filter((e) => e.courseId === 'c-ds-1102');
  assert.equal(attempts.length, 2);
  assert.deepEqual(attempts.map((e) => e.finalGrade).sort(), ['A', 'B']);
  assert.equal(new Set(attempts.map((e) => e.semesterId)).size, 2, 'attempts are in different terms');
});

test('the dataset is deterministic and never shares references', () => {
  const a = state();
  const b = state();
  assert.deepEqual(a, b);
  a.courses[0].name = 'changed';
  a.tasks[0].title = 'changed';
  assert.notEqual(b.courses[0].name, 'changed');
  assert.notEqual(b.tasks[0].title, 'changed');
});

test('the demo date is explicit and drives date-sensitive states', () => {
  assert.equal(state().demoDate, DEMO_DATE);
  assert.match(DEMO_DATE, /^\d{4}-\d{2}-\d{2}$/);
});

test('the empty dataset keeps context but removes academic records', () => {
  const empty = createEmptyState();
  assert.equal(empty.enrollments.length, 0);
  assert.equal(empty.attendanceSessions.length, 0);
  assert.equal(empty.assessments.length, 0);
  assert.equal(empty.tasks.length, 0);
  assert.equal(empty.plans.length, 0);
  assert.ok(empty.courses.length > 0, 'the catalogue is kept');
  assert.ok(empty.semesters.length === 4);
  assert.equal(empty.revision, 2, 'the baseline revision moves when records change');
});

test('request history contains draft, submitted and decided examples', () => {
  const s = state();
  const statuses = new Set(s.requests.map((r) => r.status));
  assert.ok(statuses.has('draft'));
  assert.ok(statuses.has('submitted'));
  assert.ok(statuses.has('approved'));
  assert.ok(statuses.has('rejected'));
  s.requests.forEach((request) => {
    assert.ok(request.history.length >= 1, `${request.id} has no history`);
    assert.equal(request.history[request.history.length - 1].status, request.status);
  });
});

test('seeded attachment metadata never points at a real personal file', () => {
  const s = state();
  s.requests.forEach((request) => {
    if (!request.attachment) return;
    assert.equal(request.attachment.uri, null, 'no file URI is stored');
    assert.equal(request.attachment.synthetic, true);
    assert.match(request.attachment.name, /synthetic/i);
  });
});

test('no source file contains an identity document number', () => {
  const s = state();
  const serialised = JSON.stringify(s);
  // CNIC is a 13-digit Pakistani identity number; the dataset must not contain
  // anything shaped like one.
  assert.equal(serialised.match(/\b\d{13}\b/g), null);
  assert.ok(!serialised.includes('@fast.edu.pk'));
});
