/**
 * Application state, hydration and controlled persistence (plan section 3, task 5).
 *
 * Rules this hook enforces:
 *   - Nothing is written before hydration finishes, so a cold start cannot
 *     overwrite saved data with the seed dataset.
 *   - Stored data is versioned and validated against the full schema; corrupt
 *     or structurally wrong data produces a recoverable message, never a crash.
 *   - State updaters are pure. Persistence runs from an effect on committed
 *     state, writes are coalesced and serialised, and only the newest snapshot
 *     may report success.
 *   - An action returning ok:true means "accepted into state", NOT "written to
 *     this device". The device claim comes only from saveStatus.
 *   - Only raw records are stored. Every derived number is recomputed on demand.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { createSeedState, createEmptyState } from '../data/seed.js';
import { validateThresholdPercent, validateText } from '../domain/validation.js';

export const STORAGE_KEY = 'flexpp:state:v1';
export const STORAGE_VERSION = 1;

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Structural check: enough to catch truncated or unrelated JSON. */
/**
 * Structural check for hydrated state.
 *
 * The previous check looked at seven array containers and stopped there, so a
 * saved state with `courses: [null]` or a missing `requests` array passed
 * validation and then crashed a screen the moment it dereferenced a field.
 * Every container the screens read is now required, and every row must have the
 * identity field its consumers rely on.
 */
const REQUIRED_ARRAYS = [
  'semesters', 'courses', 'enrollments', 'attendanceSessions', 'assessments',
  'outcomes', 'academicEvents', 'fees', 'requests', 'feedback', 'tasks', 'plans',
];

/** [arrayName, identityField] - a row without its identity cannot be rendered. */
const ROW_IDENTITIES = [
  ['semesters', 'id'],
  ['courses', 'id'],
  ['enrollments', 'id'],
  ['attendanceSessions', 'id'],
  ['assessments', 'id'],
  ['academicEvents', 'id'],
  ['fees', 'id'],
  ['tasks', 'id'],
  ['plans', 'id'],
];

function isUsableState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  // Total, not partial: this function is called inside a try/catch, but a
  // validator that throws on malformed input is relying on the caller's
  // exception handling to be correct, which is how a null row reaches a screen.
  if (!REQUIRED_ARRAYS.every((key) => Array.isArray(value[key]))) return false;
  for (const [arrayName, identity] of ROW_IDENTITIES) {
    const rows = value[arrayName];
    if (!Array.isArray(rows)) return false;
    for (const row of rows) {
      if (!row || typeof row !== 'object') return false;
      if (typeof row[identity] !== 'string' || row[identity] === '') return false;
    }
  }
  if (!Array.isArray(value.requests) || !Array.isArray(value.feedback) || !Array.isArray(value.outcomes)) return false;
  for (const row of value.requests) {
    if (!row || typeof row !== 'object' || typeof row.id !== 'string' || row.id === '') return false;
  }
  for (const row of value.feedback) {
    if (!row || typeof row !== 'object' || typeof row.id !== 'string' || row.id === '') return false;
  }
  for (const row of value.outcomes) {
    if (!row || typeof row !== 'object') return false;
  }
  if (!value.preferences || typeof value.preferences !== 'object') return false;
  if (typeof value.revision !== 'number' || !Number.isFinite(value.revision)) return false;
  if (typeof value.demoDate !== 'string' || value.demoDate === '') return false;
  return true;
}

export function useAppData() {
  const [state, setState] = useState(() => createSeedState());
  const [hydrated, setHydrated] = useState(false);
  const [saveStatus, setSaveStatus] = useState('idle'); // idle | saving | saved | error
  const [storageProblem, setStorageProblem] = useState(null); // { message, recoverable }
  const hydratedRef = useRef(false);

  /* --------------------------------------------------------------- hydrate */
  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (cancelled) return;
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (!isUsableState(parsed)) throw new Error('Unexpected structure');
            if (parsed.version !== STORAGE_VERSION) {
              throw new Error(`Saved data uses version ${parsed.version}, this build expects ${STORAGE_VERSION}`);
            }
            setState(parsed);
            // The hydrated snapshot is what was already on disk; writing it
            // straight back would be a pointless write, and could mask a real
            // storage failure behind a successful no-op.
            skipPersistRef.current = true;
          } catch (error) {
            setStorageProblem({
              message: `Saved local data could not be read (${error.message}). The demonstration dataset has been loaded instead.`,
              recoverable: true,
              source: 'read',
            });
            // Deliberately NOT skipped: replacing unreadable data on disk is a
            // real write, and its success or failure is worth reporting.
            setState(createSeedState());
          }
        } else {
          setState(createSeedState());
          // Nothing was stored, so there is nothing to write back and nothing
          // to report: a fresh install must not flash a "saved" banner.
          skipPersistRef.current = true;
        }
      } catch (error) {
        setStorageProblem({
          message: `Local storage is unavailable (${error.message}). Changes will last only for this session.`,
          recoverable: true,
          source: 'read',
        });
      } finally {
        if (!cancelled) {
          hydratedRef.current = true;
          setHydrated(true);
        }
      }
    }
    hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ----------------------------------------------------------------- save */
  /**
   * Persistence contract.
   *
   * Four rules, each fixing a defect that made the app lie about saving:
   *
   *  1. A state updater must be PURE. Persistence used to run inside the
   *     setState updater, so React's replay (StrictMode double-invocation, or an
   *     interrupted render) could perform the same disk write twice.
   *     Writes are now driven from an effect on committed state.
   *
   *  2. Only the LATEST snapshot may report success. Every completion used to
   *     set saveStatus to 'saved' unconditionally, so a slow older write could
   *     declare success while a newer edit was still unwritten. Each committed
   *     state gets a sequence number; 'saved' is only reported when the sequence
   *     that was just written is still the newest one.
   *
   *  3. Writes are coalesced and serialised. If a write is in flight, the newest
   *     snapshot is held and written when the current one finishes, so rapid
   *     edits cannot interleave out of order.
   *
   *  4. In-memory acceptance is not device persistence. Actions return
   *     { ok: true } meaning "accepted into state"; the device claim comes only
   *     from saveStatus, which reaches 'saved' after AsyncStorage resolves.
   */
  const seqRef = useRef(0);
  const lastPersistedSeqRef = useRef(0);
  const pendingRef = useRef(null);
  const writingRef = useRef(false);
  const skipPersistRef = useRef(false);
  // The newest committed state, readable from callbacks that must not close
  // over a stale render's `state`.
  const stateRef = useRef(state);
  stateRef.current = state;

  const writeSnapshot = useCallback(async () => {
    if (writingRef.current) return; // the in-flight write will pick this up
    const job = pendingRef.current;
    if (!job) return;
    pendingRef.current = null;
    writingRef.current = true;
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(job.snapshot));
      lastPersistedSeqRef.current = job.seq;
      // Only claim success if nothing newer arrived while this write was open.
      if (lastPersistedSeqRef.current === seqRef.current) {
        setSaveStatus('saved');
        // A successful write clears a previous WRITE failure only. A recovery
        // notice from reading unreadable data stays until the user dismisses
        // it, because the write that replaced the bad data does not undo the
        // fact that it was bad.
        setStorageProblem((current) => (current && current.source === 'write' ? null : current));
      }
    } catch (error) {
      lastPersistedSeqRef.current = 0;
      setSaveStatus('error');
      setStorageProblem({
        message: `Could not save to this device (${error.message}). Your change is only in memory — retry or reset the demo data.`,
        recoverable: true,
        source: 'write',
      });
    } finally {
      writingRef.current = false;
      if (pendingRef.current) writeSnapshot();
    }
  }, []);

  /** Never write the hydrated snapshot straight back to storage. */
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (skipPersistRef.current) {
      skipPersistRef.current = false;
      return;
    }
    seqRef.current += 1;
    pendingRef.current = { snapshot: state, seq: seqRef.current };
    setSaveStatus('saving');
    writeSnapshot();
  }, [state, writeSnapshot]);

  /**
   * Apply a functional update. The updater is pure and runs at most twice per
   * commit, so anything with a side effect (persistence) or an identity that
   * must be stable (record ids) must not live inside it.
   */
  const mutate = useCallback((updater, { bumpRevision = false } = {}) => {
    setState((previous) => {
      const draft = updater(previous);
      if (!draft || draft === previous) return previous;
      return bumpRevision ? { ...draft, revision: previous.revision + 1 } : draft;
    });
  }, []);

  /* -------------------------------------------------------------- actions */

  const actions = useMemo(
    () => ({
      /* preferences */
      setPreference(patch, options = {}) {
        mutate((previous) => ({ ...previous, preferences: { ...previous.preferences, ...patch } }), {
          bumpRevision: !!options.bumpRevision,
        });
      },

      setSemester(semesterId) {
        mutate((previous) => ({ ...previous, preferences: { ...previous.preferences, selectedSemesterId: semesterId } }));
      },

      togglePin(pinId) {
        mutate((previous) => {
          const pins = previous.preferences.pins || [];
          const next = pins.includes(pinId) ? pins.filter((p) => p !== pinId) : [...pins, pinId];
          return { ...previous, preferences: { ...previous.preferences, pins: next } };
        });
      },

      /* tasks */
      saveTask(draft) {
        const title = validateText(draft.title, { label: 'Task title' });
        if (!title.ok) return { ok: false, errors: { title: title.error } };
        mutate((previous) => {
          const existing = draft.id ? previous.tasks.find((t) => t.id === draft.id) : null;
          const task = {
            id: draft.id || makeId('task'),
            enrollmentId: draft.enrollmentId || null,
            title: title.value,
            dueDate: draft.dueDate,
            priority: draft.priority || 'medium',
            completed: existing ? existing.completed : false,
            source: draft.source || null,
          };
          const tasks = existing
            ? previous.tasks.map((t) => (t.id === existing.id ? task : t))
            : [...previous.tasks, task];
          return { ...previous, tasks };
        });
        return { ok: true, errors: {} };
      },

      toggleTask(taskId) {
        mutate((previous) => ({
          ...previous,
          tasks: previous.tasks.map((task) =>
            task.id === taskId
              ? { ...task, completed: !task.completed, completedAt: !task.completed ? nowIso() : null }
              : task,
          ),
        }));
      },

      deleteTask(taskId) {
        mutate((previous) => ({ ...previous, tasks: previous.tasks.filter((task) => task.id !== taskId) }));
      },

      /* plans */
      savePlan(plan) {
        const name = validateText(plan.name, { label: 'Plan name', maxLength: 60 });
        if (!name.ok) return { ok: false, errors: { name: name.error } };
        mutate((previous) => {
          const existing = plan.id ? previous.plans.find((p) => p.id === plan.id) : null;
          const record = {
            id: plan.id || makeId('plan'),
            name: name.value,
            enrollmentScenarios: plan.enrollmentScenarios || {},
            gradeAssumptions: plan.gradeAssumptions || {},
            shortlistedCourseIds: plan.shortlistedCourseIds || [],
            createdAt: existing ? existing.createdAt : nowIso(),
            updatedAt: nowIso(),
            baselineRevision: previous.revision,
          };
          const plans = existing
            ? previous.plans.map((p) => (p.id === existing.id ? record : p))
            : [...previous.plans, record];
          return { ...previous, plans };
        });
        return { ok: true, errors: {} };
      },

      renamePlan(planId, name) {
        const validated = validateText(name, { label: 'Plan name', maxLength: 60 });
        if (!validated.ok) return { ok: false, errors: { name: validated.error } };
        mutate((previous) => ({
          ...previous,
          plans: previous.plans.map((plan) =>
            plan.id === planId ? { ...plan, name: validated.value, updatedAt: nowIso() } : plan,
          ),
        }));
        return { ok: true, errors: {} };
      },

      duplicatePlan(planId) {
        const newId = makeId('plan');
        let copied = false;
        mutate((previous) => {
          const source = previous.plans.find((plan) => plan.id === planId);
          if (!source) return previous;
          copied = true;
          const copy = {
            ...source,
            id: newId,
            name: `${source.name} (copy)`,
            createdAt: nowIso(),
            updatedAt: nowIso(),
            baselineRevision: previous.revision,
          };
          return { ...previous, plans: [...previous.plans, copy] };
        });
        return copied ? { ok: true, id: newId } : { ok: false, id: null, errors: { plan: 'That plan no longer exists.' } };
      },

      deletePlan(planId) {
        mutate((previous) => ({ ...previous, plans: previous.plans.filter((plan) => plan.id !== planId) }));
      },

      /*
       * Requests and feedback are retired from this release. Their records are
       * still accepted on hydration and still round-tripped untouched, so
       * previously saved data is never lost or mangled; there is simply no way
       * to create or modify one any more.
       */

      /* demo-only controls (never presented as edits to university records) */
      addSyntheticCourse(course) {
        mutate((previous) => {
          const id = course.id || makeId('course');
          const record = {
            id,
            code: course.code,
            name: course.name,
            credits: Number(course.credits) || 3,
            type: course.type || 'theory',
            prerequisites: course.prerequisites || [],
            linkedLabId: null,
            nonCredit: false,
            offeredInSemesters: [previous.preferences.selectedSemesterId],
            termNote: 'Added from the Demo Data screen (synthetic).',
          };
          const enrollment = {
            id: `e-${id}-${previous.preferences.selectedSemesterId}`,
            courseId: id,
            semesterId: previous.preferences.selectedSemesterId,
            section: 'D1',
            status: 'enrolled',
            finalGrade: null,
          };
          return {
            ...previous,
            courses: [...previous.courses, record],
            enrollments: [...previous.enrollments, enrollment],
          };
        }, { bumpRevision: true });
      },

      updateSyntheticAttendance(edit) {
        /**
         * R13: this used to target the FIRST session for an enrollment, with no
         * way to choose. Digital Logic's first session is already present while
         * its absences sit later, so the documented "flip one absence to
         * present" could not actually be performed.
         *
         * Accepts either { sessionId, presence } to edit an existing session, or
         * { enrollmentId, presence } to append a new one. The session is located
         * by id, so unrelated sessions are never touched.
         */
        mutate((previous) => {
          const presence = ['present', 'absent', 'pending'].includes(edit.presence) ? edit.presence : null;
          if (!presence) return previous;

          const target = edit.sessionId
            ? previous.attendanceSessions.find((s) => s.id === edit.sessionId)
            : previous.attendanceSessions.find((s) => s.enrollmentId === edit.enrollmentId);
          // An explicit sessionId that does not exist is a no-op, never a
          // silent edit of some other session.
          if (edit.sessionId && !target) return previous;

          const record = {
            id: target?.id || makeId('ses'),
            enrollmentId: target?.enrollmentId || edit.enrollmentId,
            date: edit.date || target?.date || previous.demoDate,
            durationHours: target?.durationHours || 1.25,
            presence,
            note: 'Edited from the Demo Data screen (synthetic).',
          };
          if (!record.enrollmentId) return previous;
          const sessions = target
            ? previous.attendanceSessions.map((s) => (s.id === target.id ? record : s))
            : [...previous.attendanceSessions, record];
          return { ...previous, attendanceSessions: sessions };
        }, { bumpRevision: true });
      },

      updateSyntheticAssessment(assessmentId, patch) {
        mutate((previous) => ({
          ...previous,
          assessments: previous.assessments.map((assessment) =>
            assessment.id === assessmentId
              ? {
                  ...assessment,
                  ...patch,
                  obtainedMarks:
                    patch.obtainedMarks === undefined ? assessment.obtainedMarks : patch.obtainedMarks,
                }
              : assessment,
          ),
        }), { bumpRevision: true });
      },

      loadEmptyDataset() {
        mutate(() => createEmptyState(), { bumpRevision: false });
        setStorageProblem(null);
      },

      async resetDemo() {
        const fresh = createSeedState();
        hydratedRef.current = true;
        setStorageProblem(null);
        // Route through the same coalesced write path as every other change so
        // a reset can never report success for a snapshot it did not write.
        setState(fresh);
      },

      dismissStorageProblem() {
        setStorageProblem(null);
      },

      async retrySave() {
        // Re-queue whatever is newest, not whatever failed first.
        seqRef.current += 1;
        pendingRef.current = { snapshot: stateRef.current, seq: seqRef.current };
        setSaveStatus('saving');
        await writeSnapshot();
      },

      setThreshold(percent) {
        const validated = validateThresholdPercent(percent);
        if (!validated.ok) return { ok: false, errors: { attendanceThresholdPercent: validated.error } };
        mutate(
          (previous) => ({
            ...previous,
            preferences: { ...previous.preferences, attendanceThresholdPercent: validated.value },
          }),
          // The threshold changes every attendance result, so the baseline moves.
          { bumpRevision: true },
        );
        return { ok: true, errors: {} };
      },
    }),
    [mutate, writeSnapshot, state],
  );

  return { state, hydrated, saveStatus, storageProblem, actions };
}

export { isUsableState };
export default useAppData;
