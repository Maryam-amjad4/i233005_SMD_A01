/**
 * Store contract regressions for the retained product (review R5, R12, R13).
 *
 * These drive the real persistence hook against controllable storage, because
 * the original green suite could not reach any of them: it never mounted the
 * hook with a delayed write or a failing device.
 *
 * The previous behaviour, for the record:
 *   - every write reported success on completion, so a slow older write could
 *     declare the newest edit saved while it was still unwritten;
 *   - the unmount/persist side effect lived inside a setState updater;
 *   - isUsableState admitted courses: [null] and a missing requests array;
 *   - the attendance editor could only ever change the FIRST session.
 *
 * The request and feedback lifecycle checks (a submitted request being written
 * back as a draft, commit-time validation of a withdrawal) were removed with the
 * service-simulation family, which no longer has store actions to exercise.
 *
 * Usage: node scripts/store-contract-check.mjs
 */
import { register } from 'node:module';

register('./render-harness/hooks.mjs', import.meta.url);

const { __mount } = await import('./render-harness/react-stub.mjs');
const { __store: storage, __storage: control } = await import('./render-harness/storage-stub.mjs');
const { useAppData, STORAGE_KEY, isUsableState } = await import('../src/app/useAppData.js');
const { createSeedState } = await import('../src/data/seed.js');

const failures = [];
const passes = [];
const check = (label, condition, detail = '') => {
  if (condition) passes.push(label);
  else failures.push(`${label}${detail ? ` -> ${detail}` : ''}`);
};

/** Drain real macrotasks: a state update schedules one, a write resolves in another. */
async function settle() {
  for (let round = 0; round < 8; round += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  }
}

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
    close: handle.unmount,
  };
}

/* ------------------------------------------- R5: only the newest write may win */

{
  control.reset();
  const app = await mountApp();
  // Hold BOTH writes open. Then edit twice: write 1 is already gated, and the
  // second gate catches write 2 when it starts. Releasing only the first lets an
  // older write finish while the newest one is still genuinely pending - which
  // is exactly the condition that used to report a false success.
  const first = control.holdWrites(1);
  app.actions.setPreference({ attendanceThresholdPercent: 85 });
  await settle();
  check('R5: an in-flight write is reported as saving, not saved', app.saveStatus === 'saving', app.saveStatus);

  const second = control.holdWrites(1);
  app.actions.setPreference({ attendanceThresholdPercent: 90 });
  await settle();

  first.release();
  await settle();
  check(
    'R5: a completed older write must NOT report the newest edit as saved',
    app.saveStatus !== 'saved',
    `saveStatus=${app.saveStatus} while the newest edit is unwritten`,
  );

  second.release();
  await settle();
  check('R5: once the newest write lands, success is reported', app.saveStatus === 'saved', app.saveStatus);
  check('R5: the newest value is the one on disk',
    JSON.parse(storage.get(STORAGE_KEY)).preferences.attendanceThresholdPercent === 90,
    String(JSON.parse(storage.get(STORAGE_KEY)).preferences.attendanceThresholdPercent));
  app.close();
}

/* --------------------------------------------- R5: a failed write stays failed */

{
  control.reset();
  const app = await mountApp();
  control.failWrites(1);
  app.actions.setPreference({ attendanceThresholdPercent: 70 });
  await settle();
  check('R5: a failed write reports error', app.saveStatus === 'error', app.saveStatus);
  check('R5: a failed write explains itself', !!app.storageProblem, 'no problem reported');
  check('R5: the problem is a write failure, not a read recovery', app.storageProblem?.source === 'write',
    String(app.storageProblem?.source));
  check('R5: no contradictory success is left on screen', app.saveStatus !== 'saved');

  // Retry must save the CURRENT state, not replay the failure.
  app.actions.retrySave();
  await settle();
  check('R5: retry recovers and clears the problem', app.saveStatus === 'saved', app.saveStatus);
  check('R5: retry leaves no stale problem', app.storageProblem === null);
  const persisted = JSON.parse(storage.get(STORAGE_KEY));
  check('R5: retry persisted the latest value', persisted.preferences.attendanceThresholdPercent === 70,
    String(persisted.preferences.attendanceThresholdPercent));
  app.close();
}

/* ---------------------------------- R5: a read-recovery notice survives a write */

{
  control.reset();
  storage.set(STORAGE_KEY, '{ corrupt');
  const app = await mountApp();
  check('R12: corrupt JSON raises a stated problem', !!app.storageProblem, 'none');
  const messageBefore = app.storageProblem?.message;
  check('R12: the recovery notice is marked as coming from a read', app.storageProblem?.source === 'read',
    String(app.storageProblem?.source));
  app.actions.setPreference({ attendanceThresholdPercent: 83 });
  await settle();
  check('R5/R12: replacing bad data does NOT silently clear the recovery notice',
    app.storageProblem?.message === messageBefore, String(app.storageProblem?.message));
  app.close();
}

/* ------------------------------------------------------ R12: schema validation */

// The validator itself must be TOTAL. It used to iterate a possibly-missing
// array, so a saved state without `requests` produced a thrown TypeError that
// the caller's try/catch happened to absorb - correct outcome by luck, not by
// design, and a different caller would have crashed.
{
  const noRequests = createSeedState();
  delete noRequests.requests;
  let threw = null;
  let verdict = null;
  try {
    verdict = isUsableState(noRequests);
  } catch (error) {
    threw = error;
  }
  check('R12: the validator does not throw on a missing array', threw === null, threw ? String(threw.message) : '');
  check('R12: the validator returns false for a missing array', verdict === false, String(verdict));

  const nullRow = createSeedState();
  nullRow.courses = [null];
  check('R12: the validator rejects a null row', isUsableState(nullRow) === false);

  const noIdentity = createSeedState();
  noIdentity.tasks = [{ title: 'no id' }];
  check('R12: the validator rejects a row with no identity', isUsableState(noIdentity) === false);

  const noDemoDate = createSeedState();
  delete noDemoDate.demoDate;
  check('R12: the validator rejects a state with no demo date', isUsableState(noDemoDate) === false);

  check('R12: a genuine saved state is accepted', isUsableState(createSeedState()) === true);

  for (const junk of [null, undefined, 0, '', 'state', [], {}, { version: 1 }]) {
    let junkThrew = false;
    try { isUsableState(junk); } catch { junkThrew = true; }
    check(`R12: junk input ${JSON.stringify(junk) ?? 'undefined'} is rejected without throwing`,
      junkThrew === false && isUsableState(junk) === false);
  }
}

{
  control.reset();
  const broken = createSeedState();
  broken.courses = [null];
  storage.set(STORAGE_KEY, JSON.stringify(broken));
  const app = await mountApp();
  check('R12: a null row is rejected on hydration', !!app.storageProblem, 'accepted silently');
  check('R12: recovery loaded the demonstration dataset', app.state.courses.length > 0);
  check('R12: the fallback dataset has no null rows', app.state.courses.every(Boolean));
  // The original defect: an action on recovered state threw because the stored
  // records were unusable. Any retained action proves the same point.
  let threw = null;
  try {
    app.actions.saveTask({ title: 'Recovered state probe', dueDate: '2026-10-20', source: 'manual' });
  } catch (error) {
    threw = error;
  }
  check('R12: an action on recovered state does not throw', threw === null, threw ? String(threw.message) : '');
  app.close();
}

{
  control.reset();
  const noRequests = createSeedState();
  delete noRequests.requests;
  storage.set(STORAGE_KEY, JSON.stringify(noRequests));
  const app = await mountApp();
  check('R12: a missing requests array is rejected', !!app.storageProblem, 'accepted silently');
  check('R12: recovery supplied a requests array', Array.isArray(app.state.requests));
  app.close();
}

/* ------------------------------------------- R13: attendance edits one session */

{
  control.reset();
  const app = await mountApp();
  const dl = app.state.enrollments.find((e) => e.courseId === 'c-dl-2103');
  const sessions = app.state.attendanceSessions.filter((s) => s.enrollmentId === dl.id);
  const absent = sessions.find((s) => s.presence === 'absent');
  const others = sessions.filter((s) => s.id !== absent.id).map((s) => `${s.id}:${s.presence}`);
  check('R13: the seed has an absent session to flip', !!absent, 'none found');

  app.actions.updateSyntheticAttendance({ sessionId: absent.id, presence: 'present' });
  await settle();
  const after = app.state.attendanceSessions.filter((s) => s.enrollmentId === dl.id);
  const flipped = after.find((s) => s.id === absent.id);
  check('R13: the chosen session became present', flipped?.presence === 'present', String(flipped?.presence));
  const othersAfter = after.filter((s) => s.id !== absent.id).map((s) => `${s.id}:${s.presence}`);
  check('R13: every other session was untouched',
    JSON.stringify(others) === JSON.stringify(othersAfter), `${others} vs ${othersAfter}`);

  // An unknown session id must be a no-op, never a silent edit of another one.
  const before = JSON.stringify(app.state.attendanceSessions);
  app.actions.updateSyntheticAttendance({ sessionId: 'ses-does-not-exist', presence: 'absent' });
  await settle();
  check('R13: an unknown session id changes nothing', JSON.stringify(app.state.attendanceSessions) === before);
  app.close();
}

control.reset();
process.stdout.write(`store-contract-check: ${passes.length} checks passed, ${failures.length} failed\n`);
failures.forEach((line) => process.stdout.write(`  FAIL ${line}\n`));
process.exit(failures.length === 0 ? 0 : 1);