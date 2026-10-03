/**
 * Rendered-screen regression guards for the saved-plan comparison.
 *
 * These tests mount the real components through the offline render harness and
 * read the strings a user would actually see. They reproduce defects that are
 * invisible at the domain layer:
 *
 *  R1  the comparison rendered only `thresholdMet`, so an infeasible schedule
 *      showed a green success and the pending bounds were never displayed.
 *  R8  removing a course left its grade assumption stored, silently moving the
 *      hypothetical GPA while the controls disappeared.
 *  R9  one created recovery goal disabled the control on every other course and
 *      survived a plan switch; a double tap created two tasks.
 *  GAP the offered grade chips omitted the failure grades.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';

register('../scripts/render-harness/hooks.mjs', import.meta.url);

const { createSeedState } = await import('../src/data/seed.js');
const { createEmptyPlan, compareScenario } = await import('../src/domain/scenarios.js');
const { default: ScenariosScreen, PlanComparison } = await import('../src/features/scenarios/ScenariosScreen.js');
const { default: ScenarioEditor } = await import('../src/features/scenarios/ScenarioEditor.js');
const { __mount, __renderNested, __beginTraversal } = await import('../scripts/render-harness/react-stub.mjs');

/** Collect the strings a user would read, evaluating nested components. */
function collectStrings(node, out = [], seen = new Set()) {
  if (node == null || typeof node === 'boolean') return out;
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    node.forEach((child) => collectStrings(child, out, seen));
    return out;
  }
  if (typeof node !== 'object' || seen.has(node)) return out;
  seen.add(node);
  if (typeof node.type === 'function') {
    collectStrings(__renderNested(node.type, node.props || {}), out, seen);
    return out;
  }
  const props = node.props || {};
  ['label', 'title', 'value', 'message', 'caption', 'accessibilityLabel'].forEach((key) => {
    if (typeof props[key] === 'string' || typeof props[key] === 'number') out.push(String(props[key]));
  });
  collectStrings(props.children, out, seen);
  return out;
}

/** Collect every element node (host or component) so props can be asserted. */
function collectElements(node, out = [], seen = new Set()) {
  if (node == null || typeof node === 'boolean' || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    node.forEach((child) => collectElements(child, out, seen));
    return out;
  }
  if (seen.has(node)) return out;
  seen.add(node);
  if (typeof node.type === 'function') {
    out.push(node);
    collectElements(__renderNested(node.type, node.props || {}), out, seen);
    return out;
  }
  out.push(node);
  collectElements((node.props || {}).children, out, seen);
  return out;
}

const stringsOf = (tree) => collectStrings(tree).join(' | ');
const elementsOf = (tree) => {
  __beginTraversal();
  return collectElements(tree, [], new Set());
};
const buttons = (tree, label) =>
  elementsOf(tree).filter((node) => node.props && node.props.label === label && typeof node.props.onPress === 'function');

const scenario = (overrides = {}) => ({
  futurePresent: '',
  futureAbsent: '',
  remainingSessions: '',
  targetPoints: '',
  hypotheticalRaw: {},
  ...overrides,
});

const recordingActions = (overrides = {}) => ({
  saveTask: () => ({ ok: true, errors: {}, id: 'task-stub' }),
  savePlan: () => ({ ok: true, errors: {}, id: 'plan-stub' }),
  renamePlan: () => ({ ok: true, errors: {} }),
  duplicatePlan: () => ({ ok: true, id: 'plan-copy' }),
  deletePlan: () => ({ ok: true }),
  ...overrides,
});

const openView = () => {};

/* --------------------------------------------------------------------- R1 */

const infeasibleState = () => {
  const state = createSeedState();
  const plan = createEmptyPlan('plan-infeasible', 'Infeasible', state.revision, '2026-10-01T00:00:00.000Z');
  plan.enrollmentScenarios['e-dl-2103-f26'] = scenario({
    futurePresent: '5',
    futureAbsent: '0',
    remainingSessions: '3',
  });
  state.plans = [plan];
  return state;
};

test('R1: the comparison visibly warns that the scenario schedule cannot happen', () => {
  const state = infeasibleState();
  const { tree } = __mount(ScenariosScreen, { state, actions: recordingActions(), openView });
  const text = stringsOf(tree);

  assert.match(text, /cannot happen as described/i, 'the infeasible schedule must be stated in words');
  assert.match(text, /Schedule infeasible/i, 'feasibility is a claim separate from the arithmetic result');
  // The arithmetic result is still shown, but it is never the only claim.
  assert.match(text, /80% of 15 recorded/);
});

test('R1: the comparison renders the pending bounds for a course with pending records', () => {
  const state = createSeedState();
  const plan = createEmptyPlan('plan-pending', 'Pending', state.revision, '2026-10-01T00:00:00.000Z');
  plan.enrollmentScenarios['e-se-2201-f26'] = scenario();
  state.plans = [plan];

  const { tree } = __mount(ScenariosScreen, { state, actions: recordingActions(), openView });
  const text = stringsOf(tree);

  assert.match(text, /Pending-record bounds/i);
  assert.match(text, /57\.1/);
  assert.match(text, /85\.7/);
});

/* --------------------------------------------------------------------- R8 */

test('R8: removing a course removes its stored grade assumption', () => {
  const state = createSeedState();
  const plan = createEmptyPlan('plan-remove', 'Remove', state.revision, '2026-10-01T00:00:00.000Z');
  plan.enrollmentScenarios['e-dl-2103-f26'] = scenario();
  plan.gradeAssumptions['e-dl-2103-f26'] = 'A';
  state.plans = [plan];

  const writes = [];
  const actions = recordingActions({
    savePlan: (draft) => {
      writes.push(draft);
      return { ok: true, errors: {}, id: draft.id };
    },
  });

  const handle = __mount(ScenarioEditor, { state, actions, openView, params: { planId: 'plan-remove' } });
  const [remove] = buttons(handle.tree, 'Remove');
  assert.ok(remove, 'the chosen course offers a Remove control');
  remove.props.onPress();

  assert.equal(writes.length, 1, 'removing writes the draft once');
  assert.equal(
    writes[0].enrollmentScenarios['e-dl-2103-f26'],
    undefined,
    'the course scenario is removed',
  );
  assert.equal(
    writes[0].gradeAssumptions['e-dl-2103-f26'],
    undefined,
    'the grade assumption must not survive the course removal',
  );
});

/* --------------------------------------------------------------------- R9 */

const guardPlan = (state, id, name) => {
  const plan = createEmptyPlan(id, name, state.revision, '2026-10-01T00:00:00.000Z');
  plan.enrollmentScenarios['e-dl-2103-f26'] = scenario();
  plan.enrollmentScenarios['e-math-2205-f26'] = scenario();
  return plan;
};

const comparisonProps = (state, plan, tasks) => ({
  state,
  comparison: compareScenario(plan, state),
  courseById: new Map(state.courses.map((course) => [course.id, course])),
  actions: recordingActions({
    saveTask: (task) => {
      tasks.push(task);
      return { ok: true, errors: {}, id: `task-${tasks.length}` };
    },
  }),
  openView,
});

test('R9: a created goal does not disable the control on another course', () => {
  const state = createSeedState();
  const plan = guardPlan(state, 'plan-guard', 'Guard');
  const tasks = [];
  const props = comparisonProps(state, plan, tasks);

  const handle = __mount(PlanComparison, props);
  const addLabels = () => buttons(handle.tree, 'Add recovery goal');
  assert.equal(addLabels().length, 2, 'both recoverable courses offer the action');

  addLabels()[0].props.onPress(); // open the Digital Logic confirmation
  const afterOpen = handle.rerender(props);
  const create = buttons(afterOpen, 'Create goal')[0];
  assert.ok(create, 'the confirmation exposes a Create goal control');
  create.props.onPress();
  assert.equal(tasks.length, 1, 'one goal creates one task');
  assert.equal(tasks[0].source.planId, 'plan-guard');

  const afterCreate = handle.rerender(props);
  const createButtons = buttons(afterCreate, 'Create goal');
  const secondAdd = buttons(afterCreate, 'Add recovery goal')[1];
  assert.ok(secondAdd, 'the other course still offers its own recovery action');
  secondAdd.props.onPress();
  const secondOpen = handle.rerender(props);
  const secondCreate = buttons(secondOpen, 'Create goal')[0];
  assert.ok(secondCreate, 'the second course confirmation opens');
  assert.notEqual(
    secondCreate.props.disabled,
    true,
    'one created goal must not disable another course confirmation',
  );
});

test('R9: a double tap on the same confirmation creates at most one task', () => {
  const state = createSeedState();
  const plan = guardPlan(state, 'plan-double', 'Double');
  const tasks = [];
  const props = comparisonProps(state, plan, tasks);

  const handle = __mount(PlanComparison, props);
  buttons(handle.tree, 'Add recovery goal')[0].props.onPress();
  const opened = handle.rerender(props);
  const create = buttons(opened, 'Create goal')[0];
  assert.ok(create);

  // Two synchronous taps arrive before any re-render: the ref guard must catch
  // the second one.
  create.props.onPress();
  create.props.onPress();
  assert.equal(tasks.length, 1, 'a double tap must not create a second task');
});

test('R9: a goal created in one plan does not disable the same course in another plan', () => {
  const state = createSeedState();
  const planA = guardPlan(state, 'plan-a', 'Plan A');
  const planB = guardPlan(state, 'plan-b', 'Plan B');
  const tasks = [];
  const propsA = comparisonProps(state, planA, tasks);
  const propsB = comparisonProps(state, planB, tasks);

  const handle = __mount(PlanComparison, propsA);
  buttons(handle.tree, 'Add recovery goal')[0].props.onPress();
  const openedA = handle.rerender(propsA);
  buttons(openedA, 'Create goal')[0].props.onPress();
  assert.equal(tasks.length, 1);
  assert.equal(tasks[0].source.planId, 'plan-a');

  // Switch to plan B: the same course is present, but its confirmation must be
  // usable again because the guard is keyed by plan.
  const treeB = handle.rerender(propsB);
  buttons(treeB, 'Add recovery goal')[0].props.onPress();
  const openedB = handle.rerender(propsB);
  const createB = buttons(openedB, 'Create goal')[0];
  assert.ok(createB, 'plan B exposes its own confirmation');
  assert.notEqual(createB.props.disabled, true, 'a goal in plan A must not disable plan B');
});

/* -------------------------------------------------------------------- GAP */

test('GAP: the editor offers the failure grades and the full shared table', () => {
  const state = createSeedState();
  const plan = createEmptyPlan('plan-grades', 'Grades', state.revision, '2026-10-01T00:00:00.000Z');
  plan.enrollmentScenarios['e-dl-2103-f26'] = scenario();
  state.plans = [plan];

  const { tree } = __mount(ScenarioEditor, { state, actions: recordingActions(), openView, params: { planId: 'plan-grades' } });
  const labels = elementsOf(tree).map((node) => node.props && node.props.label);

  for (const grade of ['F', 'FA', 'C-', 'D+']) {
    assert.ok(labels.includes(grade), `${grade} must be offered as a grade assumption`);
  }
});
