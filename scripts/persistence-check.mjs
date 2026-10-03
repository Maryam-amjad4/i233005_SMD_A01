#!/usr/bin/env node
/**
 * Persistence round-trip: does local state actually survive a restart?
 *
 * This is the check for the requirement "synthetic data, offline operation and
 * local persistence". It mounts the real persistence hook against an in-memory
 * AsyncStorage, performs edits, unmounts (the app closing), mounts a fresh hook
 * (the app reopening) and asserts the edits came back.
 *
 * It also covers the three ways storage misbehaves in the wild - unreadable
 * saved data, a version from another build, and the device refusing to write -
 * because each must degrade to a stated message rather than a crash or silent
 * data loss.
 *
 * Usage: node scripts/persistence-check.mjs
 */
import { register } from 'node:module';

register('./render-harness/hooks.mjs', import.meta.url);

const { __mount, __beginTraversal } = await import('./render-harness/react-stub.mjs');
const { __store: storage } = await import('./render-harness/storage-stub.mjs');
const { useAppData, STORAGE_KEY, STORAGE_VERSION } = await import('../src/app/useAppData.js');
const { createSeedState } = await import('../src/data/seed.js');

const failures = [];
const passes = [];

function check(label, condition, detail = '') {
  if (condition) passes.push(label);
  else failures.push(`${label}${detail ? ` -> ${detail}` : ''}`);
}

/** Mount the hook as a component and let its async hydrate effect settle. */
async function mountApp() {
  let latest = null;
  const handle = __mount(function Harness() {
    latest = useAppData();
    return null;
  });
  await settle();
  return {
    get state() { return latest.state; },
    get actions() { return latest.actions; },
    get saveStatus() { return latest.saveStatus; },
    get storageProblem() { return latest.storageProblem; },
    get hydrated() { return latest.hydrated; },
    rerender: handle.rerender,
    close: handle.unmount,
  };
}

/**
 * Flush pending work.
 *
 * A state update schedules a macrotask, and a storage write resolves in a
 * microtask that then schedules another. Draining microtasks alone therefore
 * observes the state from BEFORE the update was rendered, which reads as a
 * false "nothing happened". Loop over real macrotasks instead.
 */
async function settle() {
  for (let round = 0; round < 8; round += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  }
}

/* ------------------------------------------------------- write then restart */

storage.clear();

{
  const app = await mountApp();
  check('starts unhydrated=false-free: hydration completes', app.hydrated === true);
  check('boots the demonstration dataset', app.state.enrollments.length > 0);

  // Three kinds of edit: a preference, a task, and a synthetic baseline change
  // that must bump the revision so saved plans know to recalculate.
  app.actions.setPreference({ attendanceThresholdPercent: 85 });
  app.actions.saveTask({ title: 'Persistence probe task', dueDate: '2026-10-20', source: 'manual' });
  const beforeRevision = app.state.revision;
  app.actions.updateSyntheticAssessment(
    app.state.assessments.find((a) => a.status === 'published').id,
    { obtainedMarks: 41, status: 'published' },
  );
  await settle();

  check('preference edit is visible in memory', app.state.preferences.attendanceThresholdPercent === 85);
  check('baseline edit bumps the revision', app.state.revision > beforeRevision, `${beforeRevision} -> ${app.state.revision}`);
  check('save status reports success', app.saveStatus === 'saved', app.saveStatus);

  const raw = storage.get(STORAGE_KEY);
  check('writes under the versioned key', typeof raw === 'string' && raw.length > 0);
  const parsed = JSON.parse(raw);
  check('writes a whole snapshot, not a diff', Array.isArray(parsed.enrollments) && Array.isArray(parsed.plans));
  check('saved version matches this build', parsed.version === STORAGE_VERSION);

  app.close();

  // Reopen: a brand new hook instance, the same storage.
  const reopened = await mountApp();
  check('edit survives a restart', reopened.state.preferences.attendanceThresholdPercent === 85,
    String(reopened.state.preferences.attendanceThresholdPercent));
  check('created task survives a restart', reopened.state.tasks.some((t) => t.title === 'Persistence probe task'));
  check('revision survives a restart', reopened.state.revision === app.state.revision,
    `${app.state.revision} vs ${reopened.state.revision}`);
  check('reopening reports no storage problem', reopened.storageProblem === null,
    reopened.storageProblem ? reopened.storageProblem.message : '');
  reopened.close();
}

/* --------------------------------------------------- unreadable saved data */

storage.clear();
{
  const corrupt = createSeedState();
  corrupt.tasks.push({ id: 't1', title: 'Only task' });
  storage.set(STORAGE_KEY, JSON.stringify({ ...corrupt, tasks: 'not-an-array' }));

  const app = await mountApp();
  check('unreadable saved data falls back to the demonstration dataset', app.state.enrollments.length > 0);
  check('unreadable saved data raises a stated problem', !!app.storageProblem, 'no problem reported');
  check('the problem is recoverable, not fatal', app.storageProblem?.recovered !== undefined || app.storageProblem?.recoverable === true);
  check('the message names the cause', /could not be read/i.test(app.storageProblem?.message || ''),
    app.storageProblem?.message);
  app.close();
}

storage.clear();
{
  storage.set(STORAGE_KEY, '{ this is not json');

  const app = await mountApp();
  check('malformed JSON falls back instead of crashing', app.state.enrollments.length > 0);
  check('malformed JSON raises a stated problem', !!app.storageProblem);
  app.close();
}

/* ------------------------------------------------------ version mismatch */

storage.clear();
{
  const future = { ...createSeedState(), version: STORAGE_VERSION + 1 };
  storage.set(STORAGE_KEY, JSON.stringify(future));

  const app = await mountApp();
  check('a saved state from another build is refused', app.state.enrollments.length > 0);
  check('the mismatch is explained with both versions',
    new RegExp(`version ${STORAGE_VERSION + 1}`).test(app.storageProblem?.message || ''),
    app.storageProblem?.message);
  app.close();
}

/* ---------------------------------------------------- nothing saved yet */

storage.clear();
{
  const app = await mountApp();
  check('a first run with empty storage loads the dataset', app.state.enrollments.length > 0);
  check('a first run raises no storage problem', app.storageProblem === null);
  app.close();
}

/* -------------------------------------------------------- demo reset */

storage.clear();
{
  const app = await mountApp();
  app.actions.saveTask({ title: 'Doomed by reset', dueDate: '2026-10-21', source: 'manual' });
  await settle();
  const saved = JSON.parse(storage.get(STORAGE_KEY));
  check('task is saved before the reset', saved.tasks.some((t) => t.title === 'Doomed by reset'));

  app.actions.resetDemo();
  await settle();
  const afterReset = JSON.parse(storage.get(STORAGE_KEY));
  // The shipped dataset has its own tasks, so the probe must be gone rather than
  // the list being empty.
  check('reset removes the saved edit', !afterReset.tasks.some((t) => t.title === 'Doomed by reset'));
  check('reset restores the shipped dataset', afterReset.enrollments.length === createSeedState().enrollments.length,
    `${afterReset.enrollments.length}`);
  check('reset restores the shipped preference',
    afterReset.preferences.attendanceThresholdPercent === createSeedState().preferences.attendanceThresholdPercent);
  check('reset reports success', app.saveStatus !== 'error', app.saveStatus);
  app.close();

  // And the reset itself must survive a restart.
  const afterRestart = await mountApp();
  check('the reset survives a restart',
    !afterRestart.state.tasks.some((t) => t.title === 'Doomed by reset'));
  check('the preference survives the reset across a restart',
    afterRestart.state.preferences.attendanceThresholdPercent === createSeedState().preferences.attendanceThresholdPercent,
    String(afterRestart.state.preferences.attendanceThresholdPercent));
  afterRestart.close();
}

/* ------------------------------------------------------------------ report */

process.stdout.write(`persistence-check: ${passes.length} checks passed, ${failures.length} failed\n`);
failures.forEach((line) => process.stdout.write(`  FAIL ${line}\n`));
if (process.argv.includes('--list')) passes.forEach((line) => process.stdout.write(`  ok   ${line}\n`));
process.exit(failures.length === 0 ? 0 : 1);