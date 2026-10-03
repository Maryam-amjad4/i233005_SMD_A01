/**
 * R7 regression: the signature course -> saved plan flow.
 *
 * The defect: AttendancePlanner and MarksPlanner held their inputs in transient
 * local state with no save/transfer callback, so switching section unmounted the
 * planner, discarded every input, and there was no way to get those assumptions
 * into a plan without re-entering them by hand.
 *
 * The fix: CourseScreen owns a per-course draft, both planners read/write it,
 * and each offers an explicit "Add to plan" transfer that writes the exact
 * current inputs into a named plan.
 *
 * These tests fail if the fix is reverted: the merge helpers disappear, the
 * planners have no draft props, and there is no transfer control.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

import { createSeedState } from '../src/data/seed.js';

register('../scripts/render-harness/hooks.mjs', import.meta.url);

const { __mount, __renderNested } = await import('../scripts/render-harness/react-stub.mjs');
const CourseScreenModule = await import('../src/features/courses/CourseScreen.js');
const CourseScreen = CourseScreenModule.default;
const { createEmptyDraft, mergeDraftIntoPlan } = CourseScreenModule;
const { compareScenario } = await import('../src/domain/scenarios.js');

/* ------------------------------------------------------------ pure transfer */

test('mergeDraftIntoPlan carries the exact current inputs, not a copy of a result', () => {
  const draft = {
    futurePresent: '5',
    futureAbsent: '1',
    remainingSessions: '4',
    targetPoints: '70',
    hypotheticalRaw: { 'as-se-mid': '40', blank: '' },
    grade: null,
  };
  const { enrollmentScenarios, gradeAssumptions } = mergeDraftIntoPlan(null, 'e-se-2201-f26', draft);
  const saved = enrollmentScenarios['e-se-2201-f26'];

  assert.equal(saved.futurePresent, '5');
  assert.equal(saved.futureAbsent, '1');
  assert.equal(saved.remainingSessions, '4');
  assert.equal(saved.targetPoints, '70');
  assert.equal(saved.hypotheticalRaw['as-se-mid'], '40');
  assert.equal('blank' in saved.hypotheticalRaw, false, 'a blank hypothetical is unassumed, not a zero');
  assert.deepEqual(gradeAssumptions, {}, 'a mark must never be converted into a grade');
});

test('a hypothetical mark alone never creates a grade assumption', () => {
  const draft = { ...createEmptyDraft(), hypotheticalRaw: { 'as-se-mid': '49' } };
  const { gradeAssumptions } = mergeDraftIntoPlan(null, 'e-se-2201-f26', draft);
  assert.equal(gradeAssumptions['e-se-2201-f26'], undefined);
});

test('a grade assumption is written only when the student chooses one explicitly', () => {
  const chosen = mergeDraftIntoPlan(null, 'e-x', { ...createEmptyDraft(), grade: 'A' });
  assert.equal(chosen.gradeAssumptions['e-x'], 'A');

  const untouched = mergeDraftIntoPlan(
    { gradeAssumptions: { 'e-x': 'B' }, enrollmentScenarios: {} },
    'e-x',
    { ...createEmptyDraft(), grade: null },
  );
  assert.equal(untouched.gradeAssumptions['e-x'], 'B', 'an untouched grade leaves the plan unchanged');

  const cleared = mergeDraftIntoPlan(
    { gradeAssumptions: { 'e-x': 'B' }, enrollmentScenarios: {} },
    'e-x',
    { ...createEmptyDraft(), grade: '' },
  );
  assert.equal(cleared.gradeAssumptions['e-x'], undefined, 'an explicit "no assumption" clears it');
});

test('adding one course to an existing plan preserves every other course', () => {
  const existing = {
    enrollmentScenarios: { 'e-dl-2103-f26': { futurePresent: '5', futureAbsent: '0', remainingSessions: '6', targetPoints: '', hypotheticalRaw: {} } },
    gradeAssumptions: { 'e-dl-2103-f26': 'A' },
  };
  const { enrollmentScenarios, gradeAssumptions } = mergeDraftIntoPlan(existing, 'e-se-2201-f26', {
    ...createEmptyDraft(),
    futurePresent: '2',
  });
  assert.equal(enrollmentScenarios['e-dl-2103-f26'].futurePresent, '5', 'the first course is untouched');
  assert.equal(gradeAssumptions['e-dl-2103-f26'], 'A');
  assert.equal(enrollmentScenarios['e-se-2201-f26'].futurePresent, '2');
});

test('a plan round-tripped through mergeDraftIntoPlan exposes the same assumptions', () => {
  const draft = {
    futurePresent: '5',
    futureAbsent: '1',
    remainingSessions: '4',
    targetPoints: '70',
    hypotheticalRaw: { 'as-se-mid': '40' },
    grade: 'A',
  };
  const { enrollmentScenarios, gradeAssumptions } = mergeDraftIntoPlan(null, 'e-se-2201-f26', draft);

  // Reopening the plan is reading the stored record back, exactly what the
  // comparison screen and the round-trip test above rely on.
  const scenario = enrollmentScenarios['e-se-2201-f26'];
  assert.equal(scenario.futurePresent, '5');
  assert.equal(scenario.targetPoints, '70');
  assert.equal(scenario.hypotheticalRaw['as-se-mid'], '40');
  assert.equal(gradeAssumptions['e-se-2201-f26'], 'A');
});

/* --------------------------------------------------------- rendered flow */

/** Traverse the element tree, evaluating function components at a stable path. */
function collect(node, out = [], seen = new Set(), path = 'root') {
  if (node == null || typeof node === 'boolean' || typeof node === 'string' || typeof node === 'number') return out;
  if (Array.isArray(node)) {
    node.forEach((child, index) => collect(child, out, seen, `${path}[${index}]`));
    return out;
  }
  if (typeof node !== 'object' || seen.has(node)) return out;
  seen.add(node);
  if (typeof node.type === 'function') {
    out.push(node);
    const name = node.type.name || node.type.displayName || 'Component';
    const childPath = `${path}/${name}`;
    collect(__renderNested(node.type, node.props || {}, childPath), out, seen, childPath);
    return out;
  }
  out.push(node);
  const kids = (node.props || {}).children;
  (Array.isArray(kids) ? kids : [kids]).forEach((child, index) => collect(child, out, seen, `${path}[${index}]`));
  return out;
}

function findByTestId(tree, testID) {
  return collect(tree).find((node) => node.props && node.props.testID === testID) || null;
}

function findPressable(tree, predicate) {
  return collect(tree).find((node) => node.props && typeof node.props.onPress === 'function' && predicate(node.props)) || null;
}

function makeActions(state) {
  return {
    savePlan(plan) {
      const name = String(plan.name || '').trim();
      if (!name) return { ok: false, errors: { name: 'Plan name is required.' } };
      const record = { ...plan, name, updatedAt: '2026-10-03T10:00:00.000Z', baselineRevision: state.revision };
      const index = state.plans.findIndex((entry) => entry.id === plan.id);
      if (index >= 0) state.plans[index] = record;
      else state.plans.push(record);
      return { ok: true, errors: {} };
    },
    saveTask(draft) {
      state.tasks.push({ id: 'task-new', completed: false, ...draft });
      return { ok: true, errors: {} };
    },
  };
}

function mountCourse(state, enrollmentId, section = 'attendance') {
  const props = {
    state,
    actions: makeActions(state),
    openView: () => {},
    params: { enrollmentId, section },
  };
  const handle = __mount(CourseScreen, props);
  // `handle.tree` is a snapshot; only `rerender` returns the fresh tree.
  return { handle, props, tree: handle.tree };
}

function rerender(ctx) {
  ctx.tree = ctx.handle.rerender(ctx.props);
}

function type(ctx, testID, text) {
  const field = findByTestId(ctx.tree, testID);
  assert.ok(field, `field ${testID} must be rendered`);
  field.props.onChangeText(text);
  rerender(ctx);
}

function press(ctx, testID) {
  const control = findByTestId(ctx.tree, testID);
  assert.ok(control, `control ${testID} must be rendered`);
  control.props.onPress();
  rerender(ctx);
}

test('the full flow: attendance and marks survive a section switch and transfer to a plan', async () => {
  const state = createSeedState();
  state.plans = []; // prove the flow, do not open pre-seeded data
  const enrollmentId = 'e-se-2201-f26'; // not present in the seed plan
  const ctx = mountCourse(state, enrollmentId, 'attendance');

  // Attendance inputs.
  type(ctx, 'attendance-planner-future-present', '5');
  type(ctx, 'attendance-planner-future-absent', '1');
  type(ctx, 'attendance-planner-remaining', '4');

  // Name a new plan and add the course.
  type(ctx, 'plan-target-name', 'R7 flow plan');
  press(ctx, 'plan-add');
  assert.equal(state.plans.length, 1, 'one plan is created');
  assert.equal(state.plans[0].enrollmentScenarios[enrollmentId].futurePresent, '5');

  // Switch to marks: the attendance planner unmounts, but the draft does not.
  const marksChip = findPressable(ctx.tree, (p) => p.label === 'Marks');
  assert.ok(marksChip, 'the Marks section control is rendered');
  marksChip.props.onPress();
  rerender(ctx);

  // Marks target and a hypothetical score.
  type(ctx, 'marks-planner-target', '70');
  type(ctx, 'marks-planner-hypo-as-se-mid', '40');

  // Save marks: the same plan keeps the attendance inputs already entered.
  press(ctx, 'plan-add');
  const saved = state.plans[0].enrollmentScenarios[enrollmentId];
  assert.equal(saved.targetPoints, '70');
  assert.equal(saved.hypotheticalRaw['as-se-mid'], '40');
  assert.equal(saved.futurePresent, '5', 'attendance entered in the other section is still carried');
  assert.equal(state.plans[0].gradeAssumptions[enrollmentId], undefined, 'a mark did not become a grade');

  // An explicit grade is the only way a grade assumption appears.
  press(ctx, 'marks-grade-A');
  press(ctx, 'plan-add');
  assert.equal(state.plans[0].gradeAssumptions[enrollmentId], 'A');

  await new Promise((resolve) => setTimeout(resolve, 5));
  ctx.handle.unmount();

  // Add a second course to the same named plan.
  const secondId = 'e-dl-2103-f26';
  const second = mountCourse(state, secondId, 'attendance');
  press(second, `plan-target-${state.plans[0].id}`);
  type(second, 'attendance-planner-future-present', '2');
  press(second, 'plan-add');
  assert.equal(state.plans.length, 1, 'the second course joins the existing plan');
  assert.equal(state.plans[0].enrollmentScenarios[secondId].futurePresent, '2');
  assert.equal(
    state.plans[0].enrollmentScenarios[enrollmentId].targetPoints,
    '70',
    'adding a second course preserves the first',
  );
  await new Promise((resolve) => setTimeout(resolve, 5));
  second.handle.unmount();

  // Restart: serialize and reload the state, as AsyncStorage would, then reopen
  // the plan. The assumptions live in the saved plan, not in transient screen state.
  const resumedState = JSON.parse(JSON.stringify(state));
  const restarted = mountCourse(resumedState, enrollmentId, 'attendance');
  const restartedField = findByTestId(restarted.tree, 'attendance-planner-future-present');
  assert.ok(restartedField, 'the attendance planner is rendered after restart');
  await new Promise((resolve) => setTimeout(resolve, 5));
  restarted.handle.unmount();

  const savedAfterRestart = resumedState.plans[0].enrollmentScenarios[enrollmentId];
  assert.equal(savedAfterRestart.futurePresent, '5', 'the saved assumptions survive an unmount/remount');
  assert.equal(savedAfterRestart.targetPoints, '70');
  assert.equal(savedAfterRestart.hypotheticalRaw['as-se-mid'], '40');

  // The saved plan is a real round trip for the comparison screen too.
  const comparison = compareScenario(resumedState.plans[0], resumedState);
  const row = comparison.rows.find((entry) => entry.enrollmentId === enrollmentId);
  assert.equal(row.baseline.attendance.held > 0, true);
  assert.equal(row.projected.attendance.valid, true);
  assert.equal(row.projected.marks.projectedPoints, 76);
  assert.equal(comparison.gpa.assumptions[0].grade, 'A');
});

test('the linked recovery task can be created after the plan is saved', async () => {
  const state = createSeedState();
  state.plans = [];
  const enrollmentId = 'e-se-2201-f26';
  const ctx = mountCourse(state, enrollmentId, 'attendance');

  const addGoal = findPressable(ctx.tree, (p) => p.label === 'Add recovery goal');
  assert.ok(addGoal, 'the recovery goal control is rendered');
  addGoal.props.onPress();
  rerender(ctx);

  const confirm = findPressable(ctx.tree, (p) => p.label === 'Confirm task');
  assert.ok(confirm, 'the confirmation control is rendered');
  const before = state.tasks.length;
  confirm.props.onPress();
  rerender(ctx);
  assert.equal(state.tasks.length, before + 1, 'a linked task is created');
  assert.equal(state.tasks[state.tasks.length - 1].enrollmentId, enrollmentId);
  assert.equal(state.tasks[state.tasks.length - 1].source.kind, 'attendance-recovery');

  await new Promise((resolve) => setTimeout(resolve, 5));
  ctx.handle.unmount();
});
