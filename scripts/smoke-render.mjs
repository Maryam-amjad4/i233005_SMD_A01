#!/usr/bin/env node
/**
 * Offline screen-render harness.
 *
 * What this proves: every screen mounts, runs its effects and produces its
 * text without throwing, for the shipped dataset, for an empty dataset, and for
 * a few adversarial inputs (invalid numbers, missing ids, closed windows).
 *
 * What this does NOT prove: native layout, fonts, gestures, or anything that
 * only appears on a device. This is not a visual render and produces no
 * screenshot. For that, run the app on a phone.
 *
 * It also asserts the product rules that are easy to break silently: no screen
 * may render a literal 0% or 0.0% for a course with no records, a service screen
 * must contain the word "simulation", and no screen may produce a non-finite
 * number in a status or value position.
 *
 * Usage: node scripts/smoke-render.mjs [--list]
 */
import { register } from 'node:module';

register('./render-harness/hooks.mjs', import.meta.url);

const { createElement } = await import('./render-harness/react-stub.mjs');
const { createSeedState, createEmptyState } = await import('../src/data/seed.js');
const { __mount, __renderNested, __beginTraversal } = await import('./render-harness/react-stub.mjs');

/** Recording action double: every call is logged, nothing mutates the dataset. */
function makeActions(state) {
  const calls = [];
  const actions = {};
  const names = [
    'setPreference', 'setSemester', 'togglePin', 'saveTask', 'toggleTask', 'deleteTask',
    'savePlan', 'renamePlan', 'duplicatePlan', 'deletePlan', 'saveRequestDraft',
    'submitLocalRequest', 'deleteRequest', 'saveFeedback', 'addSyntheticCourse',
    'updateSyntheticAttendance', 'updateSyntheticAssessment', 'loadEmptyDataset',
    'resetDemo', 'dismissStorageProblem', 'retrySave', 'setThreshold',
  ];
  names.forEach((name) => {
    actions[name] = (...args) => {
      calls.push({ name, args });
      if (name === 'setThreshold') return { ok: true, errors: {} };
      return { ok: true, errors: {}, id: `stub-${name}` };
    };
  });
  actions.__calls = calls;
  actions.__state = state;
  return actions;
}

function makeOpenView() {
  const opened = [];
  const openView = (name, params = {}) => {
    opened.push({ name, params });
    if (!VIEW_TITLES[name]) throw new Error(`openView called with unknown view "${name}"`);
    return true;
  };
  openView.__opened = opened;
  return openView;
}

/**
 * Walk an element tree and collect the strings a user would read.
 *
 * `path` is threaded through so every nested component gets a stable slot
 * namespace, which is what lets a test drive a field inside a child component
 * and then read the whole screen back.
 */
function collect(node, out = [], seen = new Set(), path = 'r') {
  if (node == null || typeof node === 'boolean') return out;
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    node.forEach((child, index) => collect(child, out, seen, `${path}a${index}`));
    return out;
  }
  if (typeof node !== 'object') return out;
  if (seen.has(node)) return out;
  seen.add(node);

  // A nested component is an element, not text: evaluate it inside the current
  // hook scope so its own output is inspected and its inputs stay addressable.
  if (typeof node.type === 'function') {
    collect(__renderNested(node.type, node.props || {}, path), out, seen, `${path}c`);
    return out;
  }

  const props = node.props || {};
  ['label', 'title', 'subtitle', 'value', 'message', 'helper', 'error', 'placeholder', 'accessibilityLabel', 'accessibilityHint'].forEach((key) => {
    if (typeof props[key] === 'string' || typeof props[key] === 'number') out.push(String(props[key]));
  });
  // Chart stubs receive their numbers as data; assert they are finite.
  if (node.type === 'BarChart' || node.type === 'LineChart') {
    const datasets = props.data?.datasets || [];
    datasets.forEach((dataset) => {
      (dataset.data || []).forEach((value) => {
        if (!Number.isFinite(value)) out.push('__NON_FINITE_CHART_VALUE__');
      });
    });
    (props.data?.labels || []).forEach((label) => {
      if (typeof label !== 'string') out.push('__NON_STRING_CHART_LABEL__');
    });
  }
  collect(props.children, out, seen, `${path}p`);
  collect(node.children, out, seen, `${path}n`);
  return out;
}

const failures = [];
const passes = [];

function mount(label, Screen, props, expectations = []) {
  try {
    const handle = __mount(Screen, props);
    __beginTraversal();
    const strings = collect(handle.tree);
    const text = strings.join(' | ');

    if (text.includes('__NON_FINITE_CHART_VALUE__')) {
      failures.push(`${label}: chart received a non-finite value`);
    }
    if (text.includes('__NON_STRING_CHART_LABEL__')) {
      failures.push(`${label}: chart received a non-string label`);
    }
    // A literal 0% (including the 0.0% / 0.00% form a progress bar prints) is
    // only honest next to wording that says the data is missing. Checked per
    // segment so that one "no data" sentence elsewhere on the screen cannot
    // excuse a bare 0% somewhere else.
    //
    // Two kinds of 0% are genuine measurements, not missing data, and are
    // exempt: a scheme weight that really is 0% (no unpublished assessment
    // exists), and an attendance figure that was published as 0%.
    strings.forEach((segment, index) => {
      if (!/(^|[^\d.])0(?:\.0+)?%([^0-9]|$)/.test(segment)) return;
      const around = strings.slice(Math.max(0, index - 4), index + 3).join(' ');
      // A 0% inside a weight context is a genuine measured quantity: unresolved
      // weight really is 0% when no unpublished assessment exists. Only a 0%
      // standing in for a missing measurement is dishonest.
      if (/weight|unresolved|scheduled|assessed|published|scheme/i.test(segment + ' ' + around)) return;
      if (/no data|missing data|no session|no records|no attendance records|not 0%|rather than 0%|range|no recorded|unknown|not available|not yet|absorbable|capacity/i.test(around)) return;
      failures.push(`${label}: rendered a bare 0% with no missing-data wording near it`);
    });
    expectations.forEach(([description, test]) => {
      const ok = test instanceof RegExp ? test.test(text) : text.includes(test);
      if (!ok) failures.push(`${label}: expected ${description}`);
    });
    handle.unmount();
    passes.push(`${label} (${strings.length} strings)`);
    return text;
  } catch (error) {
    failures.push(`${label}: threw ${error && error.message}`);
    return '';
  }
}

/**
 * Find the handler of the first TextInput / Chip / Button whose identifying prop
 * matches, so a test can drive a form without a device.
 */
function findControl(node, predicate, out = [], seen = new Set(), path = 'r') {
  if (node == null || typeof node === 'boolean') return out;
  if (Array.isArray(node)) {
    node.forEach((child, index) => findControl(child, predicate, out, seen, `${path}a${index}`));
    return out;
  }
  if (typeof node !== 'object' || seen.has(node)) return out;
  seen.add(node);

  // A component element's own props are checked before it is evaluated, so a
  // field inside a wrapper component can be driven through the wrapper's handler.
  if (typeof node.type === 'function' && predicate(node.props || {})) {
    out.push({ type: 'Component', props: node.props });
  }
  if (typeof node.type === 'function') {
    findControl(__renderNested(node.type, node.props || {}, path), predicate, out, seen, `${path}c`);
    return out;
  }
  const props = node.props || {};
  if ((node.type === 'TextInput' || node.type === 'Pressable' || node.type === 'Chip') && predicate(props)) {
    out.push({ type: node.type, props });
  }
  findControl(props.children, predicate, out, seen, `${path}p`);
  findControl(node.children, predicate, out, seen, `${path}n`);
  return out;
}

const matchesLabel = (needle) => (props) =>
  props.accessibilityLabel === needle || props.label === needle || props.placeholder === needle;

/**
 * Mount a screen, drive one text field, and return the strings afterwards.
 * Used to prove that an invalid value clears a previously valid result.
 */
function mountWithInput(label, Screen, props, { needle, values }, expectations = []) {
  try {
    const handle = __mount(Screen, props);
    __beginTraversal();
    let text = collect(handle.tree).join(' | ');
    values.forEach((value) => {
      __beginTraversal();
      const [control] = findControl(handle.tree, matchesLabel(needle));
      if (!control) throw new Error(`no input labelled "${needle}"`);
      if (typeof control.props.onChangeText === 'function') {
        control.props.onChangeText(value);
      } else if (typeof control.props.onPress === 'function') {
        control.props.onPress();
      } else {
        throw new Error(`input "${needle}" has no handler`);
      }
    });
    const rerendered = handle.rerender(props);
    __beginTraversal();
    text = collect(rerendered).join(' | ');
    expectations.forEach(([description, test]) => {
      const ok = test instanceof RegExp ? test.test(text) : text.includes(test);
      if (!ok) failures.push(`${label}: expected ${description}`);
    });
    handle.unmount();
    passes.push(`${label} (${text.split(' | ').length} strings)`);
    return text;
  } catch (error) {
    failures.push(`${label}: threw ${error && error.message}`);
    return '';
  }
}

/* ------------------------------------------------------------------ screens */

const { default: App, VIEW_TITLES } = await import('../App.js');
const HomeScreen = (await import('../src/features/home/HomeScreen.js')).default;
const CoursesScreen = (await import('../src/features/courses/CoursesScreen.js')).default;
const CourseScreen = (await import('../src/features/courses/CourseScreen.js')).default;
const AttendanceView = (await import('../src/features/attendance/AttendanceView.js')).default;
const MarksView = (await import('../src/features/marks/MarksView.js')).default;
const MarksPlanner = (await import('../src/features/marks/MarksPlanner.js')).default;
const HistoryScreen = (await import('../src/features/history/HistoryScreen.js')).default;
const GpaPlanner = (await import('../src/features/history/GpaPlanner.js')).default;
const TasksScreen = (await import('../src/features/planning/TasksScreen.js')).default;
const CalendarScreen = (await import('../src/features/planning/CalendarScreen.js')).default;
const ScenariosScreen = (await import('../src/features/scenarios/ScenariosScreen.js')).default;
const ScenarioEditor = (await import('../src/features/scenarios/ScenarioEditor.js')).default;
const FinanceScreen = (await import('../src/features/finance/FinanceScreen.js')).default;
const FeeDetailScreen = (await import('../src/features/finance/FeeDetailScreen.js')).default;
const ProfileScreen = (await import('../src/features/profile/ProfileScreen.js')).default;
const DemoDataScreen = (await import('../src/features/demo/DemoDataScreen.js')).default;

function context(state = createSeedState()) {
  const actions = makeActions(state);
  const openView = makeOpenView();
  return { state, actions, openView };
}

/* ------------------------------------------------------------- happy paths */

{
  const { state, actions, openView } = context();
  mount('App (hydration bypass)', App, {
    state,
    actions,
    openView,
    hydrated: true,
    saveStatus: 'idle',
    storageProblem: null,
  });
}

{
  const { state, actions, openView } = context();
  mount('HomeScreen', HomeScreen, { state, actions, openView }, [
    ['the demo date', '3 Oct 2026'],
    ['an urgent attention item', /Below threshold|below the 80/i],
    ['no-data wording for EE-2001', /No data|no recorded sessions/i],
    ['the synthetic-data disclaimer', /synthetic|demonstration/i],
  ]);
}

{
  const { state, actions, openView } = context();
  mount('CoursesScreen', CoursesScreen, { state, actions, openView }, [
    ['a course count sentence', /Showing \d+ of \d+/],
    ['DL-2103 as a below-threshold row', /DL-2103/],
  ]);
}

{
  const { state, actions, openView } = context();
  const text = mount('CourseScreen (attendance)', CourseScreen, {
    state, actions, openView, params: { enrollmentId: 'e-dl-2103-f26', section: 'attendance' },
  }, [
    ['the recovery count', /5 consecutive/i],
    ['the formula shown', /Recovery = smallest x/],
  ]);
  if (!/DL-2103/.test(text)) failures.push('CourseScreen: course code missing');

  mount('CourseScreen (marks, no scheme)', CourseScreen, {
    state, actions, openView, params: { enrollmentId: 'e-dl-2103-f26', section: 'marks' },
  }, [['the missing-scheme explanation', /No assessment scheme|no marks/i]]);

  mount('CourseScreen (unknown enrollment)', CourseScreen, {
    state, actions, openView, params: { enrollmentId: 'e-does-not-exist' },
  }, [['an explanatory state', /not in the dataset/i]]);

  mount('CourseScreen (tasks section)', CourseScreen, {
    state, actions, openView, params: { enrollmentId: 'e-ds-2101-f26', section: 'tasks' },
  });
}

{
  const { state, actions, openView } = context();
  mount('AttendanceView (below threshold)', AttendanceView, {
    state, actions, openView,
    enrollment: state.enrollments.find((e) => e.id === 'e-dl-2103-f26'),
    course: state.courses.find((c) => c.id === 'c-dl-2103'),
  }, [['70%', '70%'], ['absences absorbable', /Absences still absorbable/]]);

  mount('AttendanceView (pending bounds)', AttendanceView, {
    state, actions, openView,
    enrollment: state.enrollments.find((e) => e.id === 'e-se-2201-f26'),
    course: state.courses.find((c) => c.id === 'c-se-2201'),
  }, [['pending bounds', /Pending-record bounds/], ['the range wording', /range, not a probability/]]);

  mount('AttendanceView (no records)', AttendanceView, {
    state, actions, openView,
    enrollment: state.enrollments.find((e) => e.id === 'e-ee-2001-f26'),
    course: state.courses.find((c) => c.id === 'c-ee-2001'),
  }, [['no data, not 0%', /No data|no session records/i]]);
}

{
  const { state, actions, openView } = context();
  mount('MarksView (unpublished weight)', MarksView, {
    state, actions, openView,
    enrollment: state.enrollments.find((e) => e.id === 'e-ds-2101-f26'),
    course: state.courses.find((c) => c.id === 'c-ds-2101'),
  }, [
    ['unresolved is not zero', /Unresolved is not zero|unresolved/i],
    ['assessed performance is not a final score', /not a final course score/i],
  ]);

  mount('MarksPlanner (no target)', MarksPlanner, {
    state,
    enrollment: state.enrollments.find((e) => e.id === 'e-se-2201-f26'),
    course: state.courses.find((c) => c.id === 'c-se-2201'),
  }, [['a prompt to enter a target', /target/i]]);

  // Regression: the opt-in demonstration grade scale used to predict a letter
  // grade from partial weight - 8/10 on the only published assessment, with 80%
  // of the scheme unresolved, was reported as an F.
  const partial = mount('MarksView (grade scale, partial weight)', MarksView, {
    state,
    enrollment: state.enrollments.find((e) => e.id === 'e-ds-2101-f26'),
    course: state.courses.find((c) => c.id === 'c-ds-2101'),
    showDemoGrade: true,
  }, [['the refusal to predict', /not predictable/i]]);
  if (/would predict grade/i.test(partial)) {
    failures.push('MarksView: a letter grade was predicted from partial, mostly-unpublished marks');
  }

  // A fully resolved scheme may still be shown, and must actually predict.
  const resolved = mount('MarksView (grade scale, fully resolved)', MarksView, {
    state,
    enrollment: state.enrollments.find((e) => e.id === 'e-hm-2301-f26'),
    course: state.courses.find((c) => c.id === 'c-hm-2301'),
    showDemoGrade: true,
  }, [['a predicted grade', /would predict grade/i]]);
  if (!/would predict grade/i.test(resolved)) {
    failures.push('MarksView: no prediction even when the whole scheme is resolved');
  }
}

{
  const { state, actions, openView } = context();
  mount('HistoryScreen', HistoryScreen, { state, actions, openView }, [
    ['Spring 2025', /Spring 2025/],
    ['the repeat marker', /Repeat/i],
    ['a supersede reason', /Superseded|superseded/],
    ['a withdrawn reason', /Withdrawn/],
  ]);
  mount('GpaPlanner (no assumptions)', GpaPlanner, {
    state,
    attempts: (await import('../src/domain/gpa.js')).attemptsFromState(state),
    cutoffOrder: 4,
  }, [['the no-assumptions state', /No grade assumptions/i]]);
}

{
  const { state, actions, openView } = context();
  mount('TasksScreen', TasksScreen, { state, actions, openView, params: {} }, [
    ['the overdue wording', /Overdue by 5 days/],
  ]);
  mount('CalendarScreen', CalendarScreen, { state, actions, openView }, [
    ['the demo-date note', /demo date|device clock/i],
  ]);
}

{
  const { state, actions, openView } = context();
  mount('ScenariosScreen (comparison)', ScenariosScreen, { state, actions, openView }, [
    ['the stored-inputs banner', /stores your assumptions, not results|inputs/i],
    ['baseline vs scenario', /Baseline|Scenario/i],
  ]);
  mount('ScenarioEditor (existing plan)', ScenarioEditor, {
    state, actions, openView, params: { planId: state.plans[0].id },
  });
  mount('ScenarioEditor (new plan)', ScenarioEditor, { state, actions, openView, params: {} });
}

{
  const { state, actions, openView } = context();
  mount('FinanceScreen', FinanceScreen, { state, actions, openView }, [
    ['the no-payment statement', /never takes a payment|no payment/i],
  ]);
  mount('FeeDetailScreen', FeeDetailScreen, {
    state, actions, openView, params: { feeId: 'fee-2026-fall', challanId: 'ch-2026f-1' },
  });
  mount('FeeDetailScreen (unknown fee)', FeeDetailScreen, {
    state, actions, openView, params: { feeId: 'nope' },
  }, [['an explanatory state', /not|no longer/i]]);
}

{
  const { state, actions, openView } = context();
  mount('ProfileScreen', ProfileScreen, { state, actions, openView }, [
    ['the synthetic-profile banner', /synthetic/i],
    ['the absence of an identity number', /identity document/i],
  ]);

  mount('DemoDataScreen', DemoDataScreen, { state, actions, openView }, [
    ['the synthetic-only banner', /synthetic/i],
    ['the no-upload statement', /uploads, submits or contacts any university/i],
  ]);

  // The data-rich first course hides the no-data path. Mount the screen again
  // with the first course stripped of session records so a missing value that
  // leaks out as a literal 0.0% attendance bar is actually inspected.
  const noSessionsState = createSeedState();
  noSessionsState.attendanceSessions = noSessionsState.attendanceSessions.filter(
    (session) => session.enrollmentId !== 'e-ds-2101-f26',
  );
  const noSessionsContext = context(noSessionsState);
  mount('DemoDataScreen (first course has no session records)', DemoDataScreen, {
    state: noSessionsState,
    actions: noSessionsContext.actions,
    openView: noSessionsContext.openView,
  }, [
    ['the no-data wording', /No data|no recorded sessions/i],
    ['the explanation, not a zero', /no attendance records|empty state/i],
  ]);

  // A stripped module must produce no attendance percentage at all. The caller
  // used to pass `percent == null ? 0`, which turned missing records into a
  // literal 0.0% bar. Sentences that explicitly deny a zero ("not 0%",
  // "rather than 0%") are the honest wording this rule is protecting, so they
  // are excluded - the thing being forbidden is a rendered value, not a denial.
  const noSessionText = mount('DemoDataScreen (no records: no percentage)', DemoDataScreen, {
    state: noSessionsState,
    actions: noSessionsContext.actions,
    openView: noSessionsContext.openView,
  });
  const deniesZero = /not 0%|rather than 0%|instead of 0%|not zero/;
  noSessionText.split(' | ').forEach((segment) => {
    if (deniesZero.test(segment)) return;
    if (/(^|[^\d.])0(?:\.0+)?%/.test(segment)) {
      failures.push(`DemoDataScreen: a module with no session records rendered a percentage ("${segment.trim()}")`);
    }
  });
}

/* ------------------------------------------------- interactive state changes */

{
  // Regression: the new-plan editor used to append one plan record per
  // keystroke, because savePlan creates a record whenever `id` is absent and
  // the draft is persisted on every change. Every write must carry one id.
  const { state, openView } = context();
  const writes = [];
  const spy = {
    ...makeActions(state),
    savePlan: (plan) => {
      writes.push(plan);
      return { ok: true, errors: {}, id: 'plan-created-once' };
    },
  };
  const handle = __mount(ScenarioEditor, { state, actions: spy, openView, params: {} });
  __beginTraversal();
  const [nameField] = findControl(handle.tree, matchesLabel('Plan name'));
  if (!nameField) failures.push('ScenarioEditor (new plan): no plan-name field');
  else {
    'Balanced'.split('').forEach((_, index) => {
      __beginTraversal();
      const [field] = findControl(handle.tree, matchesLabel('Plan name'));
      field.props.onChangeText(`Balanced`.slice(0, index + 1));
    });
    const ids = new Set(writes.map((w) => w.id));
    if (writes.length !== 8) failures.push(`ScenarioEditor (new plan): expected 8 writes for 8 keystrokes, saw ${writes.length}`);
    if (ids.size !== 1) failures.push(`ScenarioEditor (new plan): ${ids.size} different plan ids - one record is being appended per keystroke`);
    if ([...ids][0] == null) failures.push('ScenarioEditor (new plan): a write carried no id');
  }
  handle.unmount();
  passes.push('ScenarioEditor (new plan): one stable id across every keystroke');
}

{
  // Regression: rename was rendered as a non-editable <Text>, so the screen
  // reported success while the name could never actually change. Press Rename
  // and require a real editable field bound to the draft.
  const { state, openView } = context();
  const renames = [];
  const spy = {
    ...makeActions(state),
    renamePlan: (id, name) => {
      renames.push({ id, name });
      return { ok: true, errors: {} };
    },
  };
  const handle = __mount(ScenariosScreen, { state, actions: spy, openView });
  __beginTraversal();
  const [renameButton] = findControl(handle.tree, (p) => p.label === 'Rename' && typeof p.onPress === 'function');
  if (!renameButton) {
    failures.push('ScenariosScreen (rename): no Rename control');
  } else {
    renameButton.props.onPress();
    // The press schedules a state update, so the root must actually re-render
    // before the new field exists. rerender() returns the new tree; the handle's
    // own `tree` property still points at the mount-time one.
    const afterPress = handle.rerender({ state, actions: spy, openView });
    __beginTraversal();
    const [nameField] = findControl(afterPress, matchesLabel('New name'));
    if (!nameField || typeof nameField.props.onChangeText !== 'function') {
      failures.push('ScenariosScreen (rename): pressing Rename produced no editable name field');
    } else {
      nameField.props.onChangeText('Renamed plan');
      // As in a real device, the typed value must be committed before Save is
      // pressed, otherwise the press would read the previous render's draft.
      const afterType = handle.rerender({ state, actions: spy, openView });
      __beginTraversal();
      const [save] = findControl(afterType, (p) => p.label === 'Save name' && typeof p.onPress === 'function');
      if (!save) failures.push('ScenariosScreen (rename): no Save name control');
      else {
        save.props.onPress();
        if (renames.length !== 1 || renames[0].name !== 'Renamed plan') {
          failures.push(`ScenariosScreen (rename): renamePlan received ${JSON.stringify(renames)}`);
        }
      }
    }
  }
  handle.unmount();
  passes.push('ScenariosScreen (rename): typed name reaches renamePlan');
}

{
  // Regression: a recovery goal built from missing records produced the task
  // title "attend null consecutive sessions".
  const { state, actions, openView } = context();
  const text = mount('ScenariosScreen (comparison)', ScenariosScreen, { state, actions, openView });
  if (/attend null/i.test(text)) failures.push('ScenariosScreen: a task title can contain the literal string "null"');
}

{
  const { state, actions, openView } = context();
  const plannerProps = {
    state,
    enrollment: state.enrollments.find((e) => e.id === 'e-ds-2101-f26'),
    course: state.courses.find((c) => c.id === 'c-ds-2101'),
  };
  // An entered target on a course with unpublished work must warn that the
  // requirement is not the required final-examination mark.
  const valid = mountWithInput('MarksPlanner (target 70, combined requirement)', MarksPlanner, plannerProps, {
    needle: 'Target score (out of 100)',
    values: ['70'],
  }, [['the combined-requirement warning', /NOT be described as the required final/i]]);

  // The same field with an out-of-range value must clear every number.
  const invalid = mountWithInput('MarksPlanner (target 140, invalid)', MarksPlanner, plannerProps, {
    needle: 'Target score (out of 100)',
    values: ['140'],
  });
  if (/68%/.test(invalid)) failures.push('MarksPlanner (target 140): a stale 68% survived an invalid target');

  // A non-numeric target must also produce no percentage.
  const garbage = mountWithInput('MarksPlanner (target "abc")', MarksPlanner, plannerProps, {
    needle: 'Target score (out of 100)',
    values: ['abc'],
  });
  if (/\d+\.\d+% across/.test(garbage)) failures.push('MarksPlanner (target "abc"): a result survived a non-numeric target');
  if (!valid) failures.push('MarksPlanner: the valid render produced no text');
}

/* ------------------------------------------------------------ empty dataset */

{
  const empty = createEmptyState();
  const { actions, openView } = context(empty);
  mount('HomeScreen (empty dataset)', HomeScreen, { state: empty, actions, openView }, [
    ['an empty-state explanation', /No modules enrolled|no data|empty/i],
  ]);
  mount('CoursesScreen (empty dataset)', CoursesScreen, { state: empty, actions, openView });
  mount('HistoryScreen (empty dataset)', HistoryScreen, { state: empty, actions, openView });
  mount('FinanceScreen (empty dataset)', FinanceScreen, { state: empty, actions, openView });
  mount('ScenariosScreen (empty dataset)', ScenariosScreen, { state: empty, actions, openView }, [
    ['the no-plans state', /No saved plans/i],
  ]);
  mount('TasksScreen (empty dataset)', TasksScreen, { state: empty, actions, openView, params: {} }, [
    ['the no-tasks state', /No tasks|nothing/i],
  ]);
}

/* --------------------------------------------------------- invalid settings */

{
  const broken = createSeedState();
  broken.preferences.attendanceThresholdPercent = 'not-a-number';
  broken.revision = 99;
  const { actions, openView } = context(broken);
  mount('HomeScreen (invalid threshold)', HomeScreen, { state: broken, actions, openView }, [
    ['the threshold warning', /Threshold not set|threshold/i],
  ]);
  mount('AttendanceView (invalid threshold)', AttendanceView, {
    state: broken, actions, openView,
    enrollment: broken.enrollments.find((e) => e.id === 'e-dl-2103-f26'),
    course: broken.courses.find((c) => c.id === 'c-dl-2103'),
  }, [['a threshold error rather than a number', /whole number|Threshold/i]]);

  const noRecords = createSeedState();
  noRecords.attendanceSessions = [];
  const ctx = context(noRecords);
  mount('AttendanceView (no session records at all)', AttendanceView, {
    state: noRecords, actions: ctx.actions, openView: ctx.openView,
    enrollment: noRecords.enrollments.find((e) => e.id === 'e-ds-2101-f26'),
    course: noRecords.courses.find((c) => c.id === 'c-ds-2101'),
  }, [['no data, not 0%', /No data|no session records/i]]);
}

/* ------------------------------------------------------------------ report */

if (process.argv.includes('--list')) {
  passes.forEach((line) => process.stdout.write(`${line}\n`));
}

process.stdout.write(`smoke-render: ${passes.length} screen renders, ${failures.length} problem(s)\n`);
process.stdout.write('smoke-render: this is a Node mount harness, not a visual render. No screenshot was produced.\n');
failures.forEach((failure) => process.stdout.write(`  FAIL ${failure}\n`));
process.exit(failures.length === 0 ? 0 : 1);