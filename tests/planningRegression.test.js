/**
 * Regression tests for the Tasks / Home / Profile fixes.
 *
 *   R14a — a task row exposes Edit; an edited task keeps its stable id and its
 *          source metadata, and the edit is validated like the create form.
 *   R14b — Profile offers a pin control for every allowed shortcut, Home and
 *          Profile state the same true pinning location, and pinning changes
 *          nothing but the pins list.
 *   GAP  — the Home attention list has a real expand/collapse control instead of
 *          non-interactive "+N more" text.
 *
 * The screens are mounted through the offline render harness, so these assert
 * the strings and controls a user would actually get.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('../scripts/render-harness/hooks.mjs', import.meta.url);

const { __mount, __renderNested, __beginTraversal } = await import('../scripts/render-harness/react-stub.mjs');
const { createSeedState } = await import('../src/data/seed.js');
const { buildAttentionItems } = await import('../src/domain/attention.js');
const TasksScreen = (await import('../src/features/planning/TasksScreen.js')).default;
const HomeScreen = (await import('../src/features/home/HomeScreen.js')).default;
const ProfileScreen = (await import('../src/features/profile/ProfileScreen.js')).default;
const CalendarScreen = (await import('../src/features/planning/CalendarScreen.js')).default;
const { SHORTCUTS, PINNING_LOCATION_NOTE, ATTENTION_PREVIEW_COUNT } = await import(
  '../src/features/home/HomeScreen.js'
);

/* ------------------------------------------------------------ harness utils */

/** Collect the strings a user would read, evaluating nested components. */
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
  if (typeof node !== 'object' || seen.has(node)) return out;
  seen.add(node);
  if (typeof node.type === 'function') {
    collect(__renderNested(node.type, node.props || {}, path), out, seen, `${path}c`);
    return out;
  }
  const props = node.props || {};
  ['label', 'title', 'subtitle', 'value', 'message', 'helper', 'error', 'placeholder'].forEach((key) => {
    if (typeof props[key] === 'string' || typeof props[key] === 'number') out.push(String(props[key]));
  });
  collect(props.children, out, seen, `${path}p`);
  collect(node.children, out, seen, `${path}n`);
  return out;
}

/** Find the first element (component or host) whose props satisfy `matcher`. */
function findControl(node, matcher, seen = new Set(), path = 'r') {
  if (node == null || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (let index = 0; index < node.length; index += 1) {
      const found = findControl(node[index], matcher, seen, `${path}a${index}`);
      if (found) return found;
    }
    return null;
  }
  if (seen.has(node)) return null;
  seen.add(node);
  if (typeof node.type === 'function') {
    if (node.props && matcher(node.props)) return node.props;
    return findControl(__renderNested(node.type, node.props || {}, path), matcher, seen, `${path}c`);
  }
  const props = node.props || {};
  if (matcher(props)) return props;
  return (
    findControl(props.children, matcher, seen, `${path}p`) ||
    findControl(node.children, matcher, seen, `${path}n`)
  );
}

/** Unique testIDs starting with `prefix`. */
function testIdsWithPrefix(node, prefix, out = new Set(), seen = new Set(), path = 'r') {
  if (node == null || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    node.forEach((child, index) => testIdsWithPrefix(child, prefix, out, seen, `${path}a${index}`));
    return out;
  }
  if (seen.has(node)) return out;
  seen.add(node);
  const props = node.props || {};
  if (typeof props.testID === 'string' && props.testID.startsWith(prefix)) out.add(props.testID);
  if (typeof node.type === 'function') {
    testIdsWithPrefix(__renderNested(node.type, props, path), prefix, out, seen, `${path}c`);
    return out;
  }
  testIdsWithPrefix(props.children, prefix, out, seen, `${path}p`);
  testIdsWithPrefix(node.children, prefix, out, seen, `${path}n`);
  return out;
}

const byTestId = (id) => (props) => props.testID === id;

function textOf(tree) {
  return collect(tree).join(' | ');
}

/** Let the harness's deferred render pass run before unmounting. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

/* --------------------------------------------------------------- R14a UI */

test('R14a: a task can be edited and keeps its id and source link', async () => {
  const ref = { state: createSeedState() };
  ref.state.tasks.push({
    id: 'task-src',
    enrollmentId: 'e-ds-2101-f26',
    title: 'Old source task title',
    dueDate: '2026-10-30',
    priority: 'low',
    completed: false,
    source: { planId: 'plan-3001', enrollmentId: 'e-ds-2101-f26', kind: 'plan-preparation' },
  });
  const before = JSON.parse(JSON.stringify(ref.state));

  const saved = [];
  const actions = {
    saveTask: (draft) => {
      saved.push(draft);
      const tasks = ref.state.tasks.slice();
      const index = draft.id ? tasks.findIndex((t) => t.id === draft.id) : -1;
      const existing = index >= 0 ? tasks[index] : null;
      const record = {
        id: draft.id || 'task-new',
        enrollmentId: draft.enrollmentId || null,
        title: draft.title,
        dueDate: draft.dueDate,
        priority: draft.priority || 'medium',
        completed: existing ? existing.completed : false,
        source: draft.source || null,
      };
      if (existing) tasks[index] = record;
      else tasks.push(record);
      ref.state = { ...ref.state, tasks };
      return { ok: true, errors: {} };
    },
    toggleTask: () => ({ ok: true }),
    deleteTask: () => ({ ok: true }),
  };
  const props = { state: ref.state, actions, openView: () => true, params: {} };

  const handle = __mount(TasksScreen, props);
  __beginTraversal();

  const editControl = findControl(handle.tree, byTestId('task-edit-task-src'));
  assert.ok(editControl, 'the task row must expose an Edit control');
  editControl.onPress();

  let tree = handle.rerender({ ...props, state: ref.state });
  __beginTraversal();
  const titleField = findControl(tree, byTestId('task-title-field'));
  const dateField = findControl(tree, byTestId('task-due-date-field'));
  assert.equal(titleField.value, 'Old source task title', 'the edit form must prefill the existing title');
  assert.equal(dateField.value, '2026-10-30', 'the edit form must prefill the existing deadline');
  const lowChip = findControl(tree, (p) => p.label === 'Low' && typeof p.onPress === 'function');
  assert.equal(lowChip.selected, true, 'the existing priority must be preselected');

  // Change the title, the deadline and the priority, then save.
  titleField.onChangeText('Updated source task title');
  dateField.onChangeText('2026-10-05');
  const highChip = findControl(tree, (p) => p.label === 'High' && typeof p.onPress === 'function');
  highChip.onPress();

  tree = handle.rerender({ ...props, state: ref.state });
  __beginTraversal();
  const saveControl = findControl(tree, byTestId('task-save-button'));
  saveControl.onPress();

  assert.equal(saved.length, 1, 'exactly one save must be issued');
  assert.equal(saved[0].id, 'task-src', 'the edit must keep the stable task id');
  assert.deepEqual(saved[0].source, before.tasks.find((t) => t.id === 'task-src').source, 'the source link must survive the edit');
  assert.equal(saved[0].title, 'Updated source task title');
  assert.equal(saved[0].dueDate, '2026-10-05');
  assert.equal(saved[0].priority, 'high');
  assert.equal(ref.state.tasks.filter((t) => t.id === 'task-src').length, 1, 'no duplicate task is created');
  assert.equal(ref.state.tasks.length, before.tasks.length, 'editing changes no other task');

  await settle();
  handle.unmount();

  // "Restart": mount again against the persisted state and confirm the edit.
  const restarted = __mount(TasksScreen, { ...props, state: ref.state });
  __beginTraversal();
  const restartedText = textOf(restarted.tree);
  restarted.unmount();
  assert.match(restartedText, /Updated source task title/);
  assert.match(restartedText, /5 Oct 2026/);
  assert.doesNotMatch(restartedText, /Old source task title/);

  // The attention list reflects the new deadline...
  const attentionItem = buildAttentionItems(ref.state).find((item) => item.id === 'task:task-src');
  assert.ok(attentionItem, 'the edited task must appear in the attention list');
  assert.equal(attentionItem.title, 'Updated source task title');
  // ...and so does the calendar.
  const calendar = __mount(CalendarScreen, { state: ref.state, actions, openView: () => true, params: {} });
  __beginTraversal();
  const calendarText = textOf(calendar.tree);
  calendar.unmount();
  assert.match(calendarText, /Updated source task title/);
  assert.match(calendarText, /5 Oct 2026/);
  assert.match(calendarText, /high priority/);
});

test('R14a: an invalid edit is not written', async () => {
  const ref = { state: createSeedState() };
  ref.state.tasks.push({
    id: 'task-invalid',
    enrollmentId: null,
    title: 'Valid original title',
    dueDate: '2026-10-30',
    priority: 'medium',
    completed: false,
    source: null,
  });
  const saved = [];
  const actions = {
    saveTask: (draft) => {
      saved.push(draft);
      return { ok: true, errors: {} };
    },
    toggleTask: () => ({ ok: true }),
    deleteTask: () => ({ ok: true }),
  };
  const props = { state: ref.state, actions, openView: () => true, params: {} };

  const handle = __mount(TasksScreen, props);
  __beginTraversal();
  findControl(handle.tree, byTestId('task-edit-task-invalid')).onPress();
  let tree = handle.rerender(props);
  __beginTraversal();
  const titleField = findControl(tree, byTestId('task-title-field'));
  titleField.onChangeText('x'); // below the create form's minimum title length
  const dateField = findControl(tree, byTestId('task-due-date-field'));
  dateField.onChangeText('not-a-date');
  tree = handle.rerender(props);
  __beginTraversal();
  findControl(tree, byTestId('task-save-button')).onPress();

  assert.equal(saved.length, 0, 'invalid title and date must never reach the save action');
  const after = handle.rerender(props);
  __beginTraversal();
  assert.match(textOf(after), /Fix the highlighted fields before saving/);
  await settle();
  handle.unmount();
});

/* --------------------------------------------------------------- R14b UI */

test('R14b: Profile offers a pin control for every shortcut, and pinning changes nothing else', async () => {
  const ref = { state: createSeedState() };
  const toggles = [];
  const actions = {
    togglePin: (id) => {
      toggles.push(id);
      const pins = ref.state.preferences.pins;
      const next = pins.includes(id) ? pins.filter((p) => p !== id) : [...pins, id];
      ref.state = { ...ref.state, preferences: { ...ref.state.preferences, pins: next } };
    },
  };
  const props = { state: ref.state, actions, openView: () => true, params: {} };

  const before = JSON.parse(JSON.stringify({ state: ref.state }));
  const handle = __mount(ProfileScreen, props);
  __beginTraversal();

  SHORTCUTS.forEach((shortcut) => {
    const control = findControl(handle.tree, byTestId(`profile-pin-${shortcut.id}`));
    assert.ok(control, `Profile must offer a pin control for "${shortcut.id}"`);
  });

  // The old screen only offered Unpin for already-pinned shortcuts, so the
  // four seed pins were the only controls. Every shortcut must be reachable now.
  const controls = testIdsWithPrefix(handle.tree, 'profile-pin-');
  assert.equal(controls.size, SHORTCUTS.length, 'every allowed shortcut must have a pin control');

  SHORTCUTS.forEach((shortcut) => {
    const control = findControl(handle.tree, byTestId(`profile-pin-${shortcut.id}`));
    if (ref.state.preferences.pins.includes(shortcut.id)) control.onPress(); // unpin first
    control.onPress(); // then re-pin
  });

  assert.ok(toggles.length > 0, 'the pin controls must call togglePin');
  toggles.forEach((id) => assert.ok(SHORTCUTS.some((s) => s.id === id), `unexpected pin toggle "${id}"`));
  assert.deepEqual(
    [...ref.state.preferences.pins].sort(),
    SHORTCUTS.map((s) => s.id).sort(),
    'every shortcut is pinned after unpin-then-repin',
  );

  // Nothing but the pins list may change.
  assert.deepEqual(
    { ...ref.state, preferences: { ...ref.state.preferences, pins: before.state.preferences.pins } },
    before.state,
    'pinning must change no other data',
  );
  await settle();
  handle.unmount();
});

test('R14b: Home and Profile state the same pinning location', async () => {
  const state = createSeedState();
  const actions = { togglePin: () => {}, setPreference: () => ({ ok: true, errors: {} }), setThreshold: () => ({ ok: true }) };

  const home = __mount(HomeScreen, { state, actions, openView: () => true });
  __beginTraversal();
  const homeText = textOf(home.tree);
  home.unmount();

  const profile = __mount(ProfileScreen, { state, actions, openView: () => true, params: {} });
  __beginTraversal();
  const profileText = textOf(profile.tree);
  profile.unmount();

  assert.ok(homeText.includes(PINNING_LOCATION_NOTE), 'Home must state the shared pinning location');
  assert.ok(profileText.includes(PINNING_LOCATION_NOTE), 'Profile must state the same pinning location');
  // The two stale, mutually wrong instructions must be gone.
  assert.doesNotMatch(homeText, /any area's own screen/);
  assert.doesNotMatch(profileText, /changed from the Home shortcut grid/);
});

/* ----------------------------------------------------------------- GAP UI */

test('GAP: the Home attention list expands and collapses with a real control', async () => {
  const state = createSeedState();
  for (let i = 0; i < 12; i += 1) {
    state.tasks.push({
      id: `gap-task-${i}`,
      enrollmentId: null,
      title: `Overdue gap task ${i}`,
      dueDate: '2026-09-01',
      priority: 'high',
      completed: false,
      source: null,
    });
  }
  const total = buildAttentionItems(state).length;
  assert.ok(total > ATTENTION_PREVIEW_COUNT, `the fixture must produce more than ${ATTENTION_PREVIEW_COUNT} items`);

  const props = { state, actions: { setSemester: () => {} }, openView: () => true };
  const handle = __mount(HomeScreen, props);
  __beginTraversal();

  assert.equal(
    testIdsWithPrefix(handle.tree, 'attention-item-').size,
    ATTENTION_PREVIEW_COUNT,
    'only the preview count is shown by default',
  );
  const collapsedText = textOf(handle.tree);
  assert.doesNotMatch(collapsedText, /\+\s*\d+\s*more item/, 'the fake "+N more" text must be gone');
  assert.ok(findControl(handle.tree, byTestId('attention-expand-toggle')), 'an expand control must exist');

  findControl(handle.tree, byTestId('attention-expand-toggle')).onPress();
  let tree = handle.rerender(props);
  __beginTraversal();
  assert.equal(
    testIdsWithPrefix(tree, 'attention-item-').size,
    total,
    'expanding reveals every attention item',
  );

  findControl(tree, byTestId('attention-expand-toggle')).onPress();
  tree = handle.rerender(props);
  __beginTraversal();
  assert.equal(
    testIdsWithPrefix(tree, 'attention-item-').size,
    ATTENTION_PREVIEW_COUNT,
    'collapsing hides the extra items again',
  );

  await settle();
  handle.unmount();
});
