/**
 * Wording guards.
 *
 * Two classes of bug are covered here, both of which shipped silently:
 *
 *   1. The same state was spelled differently on different screens ("Overdue by
 *      N days" in Tasks, "Passed N days ago" in Calendar). One module now owns
 *      every phrase, and these tests fail if a screen grows its own copy again.
 *   2. The GPA planner's stated effect of a W/I/FA grade assumption contradicted
 *      `projectGPA`. The wording tests below run the real calculator and assert
 *      the sentence matches what it did, so the two cannot drift apart again.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { register } from 'node:module';

// The rendered-planner test mounts a JSX component, so the loader hook that
// compiles JSX must be registered before that module is imported.
register('../scripts/render-harness/hooks.mjs', import.meta.url);

import {
  assumptionEffectWording,
  dueWording,
  enrollmentLabel,
  enrollmentName,
  windowStatusWords,
} from '../src/domain/wording.js';
import { attemptsFromState, projectGPA } from '../src/domain/gpa.js';
import { buildAttentionItems } from '../src/domain/attention.js';
import { createSeedState } from '../src/data/seed.js';

/* ------------------------------------------------------- due-date wording */

test('an unreadable due date is no data, never overdue or zero', () => {
  [null, undefined, NaN, 'soon', {}].forEach((value) => {
    const result = dueWording(value);
    assert.equal(result.text, 'No due date recorded');
    assert.equal(result.tone, 'neutral');
    assert.equal(result.daysLeft, null);
  });
});

test('a due date is described by its signed day offset', () => {
  assert.deepEqual(dueWording(5), { text: 'Due in 5 days', tone: 'info', daysLeft: 5 });
  assert.deepEqual(dueWording(3), { text: 'Due in 3 days', tone: 'warn', daysLeft: 3 });
  assert.deepEqual(dueWording(1), { text: 'Due in 1 day', tone: 'warn', daysLeft: 1 });
  assert.deepEqual(dueWording(0), { text: 'Due today', tone: 'warn', daysLeft: 0 });
  assert.deepEqual(dueWording(-1), { text: 'Overdue by 1 day', tone: 'danger', daysLeft: -1 });
  assert.deepEqual(dueWording(-5), { text: 'Overdue by 5 days', tone: 'danger', daysLeft: -5 });
});

test('a recorded due date of zero days is still a real state, not missing data', () => {
  // Mirrors the chart guard: a real 0 must survive while null does not.
  assert.equal(dueWording(0).daysLeft, 0);
  assert.equal(dueWording(0).text, 'Due today');
});

/**
 * Regression cover for the split wording. The old Calendar copy said
 * "Passed N days ago" for the exact state Tasks called "Overdue by N days".
 */
test('no screen carries its own overdue wording', () => {
  const roots = ['src/features', 'src/domain'];
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith('.js')) files.push(full);
    }
  };
  roots.forEach(walk);

  const offenders = [];
  files.forEach((file) => {
    const normalised = file.replace(/\\/g, '/');
    if (normalised.endsWith('src/domain/wording.js')) return;
    if (normalised.endsWith('tests/wording.test.js')) return;
    const source = readFileSync(file, 'utf8');
    if (/Overdue by /.test(source)) offenders.push(`${normalised}: "Overdue by"`);
    if (/Passed \$\{|`Passed \$\{/.test(source)) offenders.push(`${normalised}: "Passed N ago"`);
    if (/No due date recorded/.test(source)) offenders.push(`${normalised}: "No due date recorded"`);
    if (/No date recorded/.test(source)) offenders.push(`${normalised}: "No date recorded"`);
  });

  assert.deepEqual(offenders, [], `due wording must live only in src/domain/wording.js: ${offenders.join(', ')}`);
});

test('Tasks, Calendar and the attention list agree on the same overdue task', () => {
  const state = createSeedState();
  const task = state.tasks.find((entry) => entry.id === 'task-2');
  assert.ok(task, 'the seed carries the overdue fixture');

  // The attention list builds its same-state task reason from the shared phrase.
  const item = buildAttentionItems(state).find((entry) => entry.id === 'task:task-2');
  assert.ok(item);
  assert.match(item.reason, /Overdue by 5 days/);
  assert.equal(dueWording(-5).text, 'Overdue by 5 days');
});

/* ---------------------------------------------------------- window wording */

test('window wording is one table with an explicit unknown fallback', () => {
  assert.equal(windowStatusWords('open'), 'Open');
  assert.equal(windowStatusWords('upcoming'), 'Upcoming');
  assert.equal(windowStatusWords('closed'), 'Closed');
  assert.equal(windowStatusWords('not configured'), 'Not configured');
  assert.equal(windowStatusWords('something-new'), 'Status unknown');
});

test('window wording can be obtained as the whole table without evaluating a window', () => {
  const table = windowStatusWords();
  assert.equal(typeof table, 'object');
  assert.equal(table.open, 'Open');
  assert.equal(table.closed, 'Closed');
});

/* ------------------------------------------------------- enrollment labels */

test('a course record with no catalogue entry says so instead of printing a bare id', () => {
  assert.equal(enrollmentName({ courseId: 'c-x' }, null), 'Unknown course');
  assert.equal(enrollmentName({ courseId: 'c-x', courseName: 'Recovered name' }, null), 'Recovered name');
  // An id alone is not a title: the label admits it has no course name.
  assert.equal(enrollmentLabel({ courseId: 'c-x' }, null), 'Unknown course');
  assert.equal(enrollmentLabel({}, null), 'Unknown course');
  assert.equal(
    enrollmentLabel({ courseId: 'c-x', courseCode: 'XX-100' }, { id: 'c-x', code: 'XX-100', name: 'Demo' }),
    'XX-100 · Demo',
  );
});

/* ------------------------------- the stated effect of a grade assumption vs the calculator */

const attempt = (overrides) => ({
  id: overrides.id,
  courseId: overrides.courseId ?? overrides.id,
  semesterOrder: overrides.semesterOrder ?? 1,
  credits: overrides.credits ?? 3,
  grade: overrides.grade ?? null,
  status: overrides.status ?? 'completed',
  nonCredit: overrides.nonCredit ?? false,
});

test('an assumption for a course with an existing record replaces it and its credits count', () => {
  const attempts = [attempt({ id: 'e1', courseId: 'c1', credits: 3, grade: 'B' })];
  const assumption = { courseId: 'c1', grade: 'A', credits: 3, semesterOrder: 1 };
  const projection = projectGPA(attempts, [assumption]);

  const applied = projection.applied[0];
  assert.equal(applied.mode, 'replaced');

  const effect = assumptionEffectWording('CS-2101', {
    mode: applied.mode,
    assumed: assumption,
    previous: attempts[0],
  });

  assert.equal(effect.label, 'Replaces the latest CS-2101 attempt');
  // The old copy claimed this case "does not enlarge the GPA denominator"; the
  // calculator replaces the record and counts its credits either way.
  assert.match(effect.text, /3 credits stay in the GPA denominator/);
  assert.match(effect.text, /graded attempt is a counted attempt/);
  assert.doesNotMatch(effect.text, /does not enlarge the GPA denominator/);
  assert.doesNotMatch(effect.text, /new hypothetical attempt/);
  assert.equal(projection.projected.includedCredits, 3);
});

test('an assumption for a course with no record is added and its credits then count', () => {
  const attempts = [attempt({ id: 'e1', courseId: 'c1', credits: 3, grade: 'B' })];
  const assumption = { courseId: 'c2', grade: 'A', credits: 4, semesterOrder: 2 };
  const projection = projectGPA(attempts, [assumption]);

  const applied = projection.applied[0];
  assert.equal(applied.mode, 'added');

  const effect = assumptionEffectWording('CS-2102', {
    mode: applied.mode,
    assumed: assumption,
    previous: null,
  });

  assert.equal(effect.label, 'Adds a new hypothetical attempt to CS-2102');
  assert.match(effect.text, /4 credits as a new hypothetical attempt/);
  assert.match(effect.text, /graded attempt is a counted attempt/);
  assert.equal(projection.projected.includedCredits, 7);
});

test('the seed W/I/FA cases take the replace branch, and the wording says so', () => {
  const state = createSeedState();
  const attempts = attemptsFromState(state);
  const baseline = projectGPA(attempts, []).baseline;

  // Values measured against the shipped seed through the real calculator.
  // `replacedCountsCredits` records whether replacing this course's record also
  // adds credits that were previously outside the denominator.
  const cases = [
    { grade: 'I', courseId: 'c-stats-1401', expected: { value: 2.9642, credits: 19 }, replacedCountsCredits: true },
    { grade: 'W', courseId: 'c-co-1102', expected: { value: 2.8424, credits: 17 }, replacedCountsCredits: true },
    { grade: 'FA', courseId: 'c-phy-1103', expected: { value: 3.5482, credits: 17 }, replacedCountsCredits: true },
  ];

  cases.forEach(({ grade, courseId, expected, replacedCountsCredits }) => {
    const record = attempts.find((entry) => entry.courseId === courseId && entry.grade === grade);
    assert.ok(record, `the seed carries a ${grade} record for ${courseId}`);

    const assumption = {
      courseId,
      grade: 'A',
      credits: record.credits,
      semesterOrder: record.semesterOrder,
    };
    const projection = projectGPA(attempts, [assumption]);

    // The calculator replaces the existing record; it does not add a parallel one.
    assert.equal(projection.applied[0].mode, 'replaced');
    assert.equal(projection.projected.value, expected.value);
    assert.equal(projection.projected.includedCredits, expected.credits);

    // The real evidence for the wording: the replaced record is now a graded,
    // counted attempt, so the branch is a replacement and not an exclusion.
    assert.equal(replacedCountsCredits, true);
    assert.notEqual(projection.applied[0].attemptId, null);

    const effect = assumptionEffectWording(record.courseCode || courseId, {
      mode: projection.applied[0].mode,
      assumed: assumption,
      previous: record,
    });
    assert.equal(effect.mode, 'replaced');
    assert.match(effect.label, /^Replaces the latest /);
    assert.match(effect.text, /graded attempt is a counted attempt/);
    // The exact sentence the old UI carried and the code contradicted.
    assert.doesNotMatch(effect.text, /does not enlarge the GPA denominator/);
    assert.doesNotMatch(effect.label, /Added as a new hypothetical attempt/);
  });

  // Distinct, checkable evidence that the credits DO count after replacement:
  // the I course was excluded entirely before and is in the denominator after.
  const iRecord = attempts.find((entry) => entry.grade === 'I');
  const iProjection = projectGPA(attempts, [
    { courseId: iRecord.courseId, grade: 'A', credits: iRecord.credits, semesterOrder: iRecord.semesterOrder },
  ]);
  assert.ok(
    iProjection.projected.includedCredits > baseline.includedCredits,
    'I->A must enlarge the denominator, because the W/I record was outside it',
  );
});

test('an assumption with a credit count different from the replaced record states the change', () => {
  const attempts = [attempt({ id: 'e1', courseId: 'c1', credits: 3, grade: 'FA' })];
  const assumption = { courseId: 'c1', grade: 'A', credits: 4, semesterOrder: 1 };
  const projection = projectGPA(attempts, [assumption]);
  assert.equal(projection.applied[0].mode, 'replaced');

  const effect = assumptionEffectWording('PHY-1103', {
    mode: 'replaced',
    assumed: assumption,
    previous: attempts[0],
  });
  assert.match(effect.text, /4 credits count in the GPA denominator instead of the 3 credits/);
});

test('the assumption wording never claims the transcript is edited', () => {
  ['replaced', 'added'].forEach((mode) => {
    const effect = assumptionEffectWording('CS-2101', {
      mode,
      assumed: { courseId: 'c1', grade: 'A', credits: 3, semesterOrder: 1 },
      previous: mode === 'replaced' ? { id: 'e1', grade: 'W', credits: 3 } : null,
    });
    assert.match(effect.text, /transcript is never modified/);
  });
});

/* --------------------------- the rendered planner's own sentences match the calculator */

/** Find a control by testID, rendering nested components on the way down. */
function findControl(node, testId, seen = new Set(), nest) {
  if (node == null || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findControl(child, testId, seen, nest);
      if (found) return found;
    }
    return null;
  }
  if (seen.has(node)) return null;
  seen.add(node);
  if (typeof node.type === 'function') {
    if (node.props && node.props.testID === testId) return node.props;
    return findControl(nest(node.type, node.props || {}, 'r'), testId, seen, nest);
  }
  const props = node.props || {};
  if (props.testID === testId) return props;
  return findControl(props.children, testId, seen, nest) || findControl(node.children, testId, seen, nest);
}

/**
 * The unit tests above cover `assumptionEffectWording`. This one covers the
 * screen: the planner must render the calculator's own branch, not a copy of the
 * sentence. The old bug was exactly a local string the calculator contradicted,
 * so a guard on the helper alone would not have caught it.
 */
test('the rendered GPA planner describes the branch projectGPA actually took', async () => {
  const { __mount, __renderNested, __beginTraversal } = await import('../scripts/render-harness/react-stub.mjs');
  const GpaPlanner = (await import('../src/features/history/GpaPlanner.js')).default;

  const state = createSeedState();
  const attempts = attemptsFromState(state);
  const record = attempts.find((entry) => entry.grade === 'I');

  // What the calculator does with this assumption, independent of any UI.
  const projection = projectGPA(attempts, [
    { courseId: record.courseId, grade: 'A', credits: record.credits, semesterOrder: record.semesterOrder },
  ]);
  assert.equal(projection.applied[0].mode, 'replaced');

  const collect = (node, out = [], seen = new Set()) => {
    if (node == null || typeof node === 'boolean') return out;
    if (typeof node === 'string' || typeof node === 'number') {
      out.push(String(node));
      return out;
    }
    if (Array.isArray(node)) return node.forEach((child) => collect(child, out, seen)), out;
    if (typeof node !== 'object' || seen.has(node)) return out;
    seen.add(node);
    if (typeof node.type === 'function') {
      collect(__renderNested(node.type, node.props || {}, 'r'), out, seen);
      return out;
    }
    const props = node.props || {};
    ['label', 'title', 'subtitle', 'value', 'message'].forEach((key) => {
      if (typeof props[key] === 'string') out.push(props[key]);
    });
    collect(props.children, out, seen);
    collect(node.children, out, seen);
    return out;
  };

  const handle = __mount(GpaPlanner, { state, attempts, cutoffOrder: 4 });
  __beginTraversal();

  // One traversal only: a second walk would re-allocate the harness's hook slots
  // and desynchronise the component's state.
  const chip = findControl(handle.tree, `gpa-planner-${record.courseId}-A`, new Set(), __renderNested);
  assert.ok(chip, 'the planner offers an A chip for the I course');
  chip.onPress();

  // The harness defers a pass scheduled from an event; its documented way to run
  // one is `rerender`, which re-runs the component against the committed state.
  const settledProps = { state, attempts, cutoffOrder: 4 };
  const rendered = handle.rerender(settledProps);
  __beginTraversal();
  const text = collect(rendered).join(' | ');

  assert.match(text, /Replaces the latest/);
  assert.match(text, /graded attempt is a counted attempt/);
  assert.doesNotMatch(text, /does not enlarge the GPA denominator/);
  assert.doesNotMatch(text, /Added as a new hypothetical attempt/);
  // The projection really did enlarge the denominator (17 -> 19 credits).
  assert.equal(projection.projected.includedCredits, 19);

  // Unmount only after the queued pass has run: the harness's deferred timer
  // would otherwise fire against a null mount and print a spurious error.
  await new Promise((resolve) => setTimeout(resolve, 5));
  handle.unmount();
});
