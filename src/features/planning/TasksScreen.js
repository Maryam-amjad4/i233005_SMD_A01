/**
 * Tasks — the student's own private checklist.
 *
 * This screen owns: the task filter/sort controls, the inline add-or-edit form,
 * and how a due date is presented. The wording itself lives in
 * `domain/wording.js` so it cannot drift from the other screens. It deliberately
 * does NOT own any academic record. Completing a task is a personal checklist
 * action: it never touches attendance, marks, grades or any university status,
 * and that is stated on screen rather than implied.
 *
 * Date rule: every "overdue / due today / due in N days" comparison is computed
 * from `state.demoDate` plus `daysBetween`, never from the device clock, so the
 * screen is reproducible.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  Banner,
  Button,
  ButtonRow,
  Card,
  Chip,
  EmptyState,
  Field,
  Section,
  Status,
} from '../../ui/components.js';
import { colors, radius, spacing, type } from '../../ui/theme.js';
import { daysBetween, formatDate, validateDateInput, validateText } from '../../domain/validation.js';
import { dueWording, enrollmentCode, enrollmentName } from '../../domain/wording.js';

const MIN_TITLE_LENGTH = 3;

export const TASK_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'completed', label: 'Completed' },
  { id: 'linked', label: 'Linked to a plan' },
];

export const TASK_SORTS = [
  { id: 'dueDate', label: 'Due date' },
  { id: 'priority', label: 'Priority' },
  { id: 'course', label: 'Course' },
  { id: 'created', label: 'Created' },
];

const PRIORITIES = [
  { id: 'high', label: 'High', pill: 'High priority', tone: 'danger', weight: 0 },
  { id: 'medium', label: 'Medium', pill: 'Medium priority', tone: 'warn', weight: 1 },
  { id: 'low', label: 'Low', pill: 'Low priority', tone: 'neutral', weight: 2 },
];

const PRIORITY_BY_ID = new Map(PRIORITIES.map((p) => [p.id, p]));

function priorityOf(id) {
  return PRIORITY_BY_ID.get(id) || PRIORITY_BY_ID.get('medium');
}

/** Draft row → priority weight used by the Priority sort. */
function priorityWeight(id) {
  return priorityOf(id).weight;
}

/**
 * Due-date wording. The phrase and the tone are defined once in domain/wording.js
 * so an overdue task reads the same on Tasks, Calendar and the Home attention
 * list. The date is measured against the stored demo date, never the device
 * clock, and a missing date is "no data", never overdue.
 */
function dueWordingFor(dueDate, demoDate) {
  return dueWording(daysBetween(demoDate, dueDate));
}

/** `From plan plan-3001 · plan-preparation` style provenance chip. */
export function sourceLabel(source) {
  if (!source) return null;
  const planPart = source.planId ? `From plan ${source.planId}` : 'From a plan';
  return source.kind ? `${planPart} · ${source.kind}` : planPart;
}

function blankDraft(state, prefill) {
  const base = {
    id: null,
    title: '',
    dueDate: state.demoDate,
    enrollmentId: null,
    priority: 'medium',
    source: null,
  };
  if (!prefill) return base;
  return {
    id: prefill.id || null,
    title: typeof prefill.title === 'string' ? prefill.title : '',
    dueDate: prefill.dueDate || state.demoDate,
    enrollmentId: prefill.enrollmentId || null,
    priority: PRIORITY_BY_ID.has(prefill.priority) ? prefill.priority : 'medium',
    source: prefill.source || null,
  };
}

export function TasksScreen({ state, actions, openView, params }) {
  const prefill = params && params.prefill ? params.prefill : null;
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('dueDate');
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState(() => blankDraft(state, prefill));
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [saving, setSaving] = useState(false);

  // The ref is the real duplicate-tap guard; the flag only mirrors it visually.
  const savingRef = useRef(false);
  const savingTimer = useRef(null);

  useEffect(
    () => () => {
      if (savingTimer.current) clearTimeout(savingTimer.current);
    },
    [],
  );

  // A linked action from a saved plan re-opens this screen with a new prefill.
  const prefillKey = prefill ? JSON.stringify(prefill) : '';
  // The two values `blankDraft` reads from state, listed so the effect stays
  // honest about what it depends on instead of being suppressed.
  const demoDate = state.demoDate;
  const semesterId = state.preferences.selectedSemesterId;
  useEffect(() => {
    if (!prefill) return;
    setDraft(blankDraft({ demoDate, preferences: { selectedSemesterId: semesterId } }, prefill));
    setFieldErrors({});
    setFormError(null);
    setFormOpen(true);
  }, [prefillKey, prefill, demoDate, semesterId]);

  const courseById = useMemo(() => new Map((state.courses || []).map((c) => [c.id, c])), [state.courses]);

  /** Course chips are built from the selected semester's live enrollments. */
  const semesterCourses = useMemo(() => {
    const selectedSemesterId = state.preferences.selectedSemesterId;
    return (state.enrollments || [])
      .filter((e) => e.semesterId === selectedSemesterId && e.status !== 'withdrawn')
      .map((e) => {
        const course = courseById.get(e.courseId);
        return {
          enrollmentId: e.id,
          code: enrollmentCode(e, course),
          name: enrollmentName(e, course),
        };
      });
  }, [state.enrollments, state.preferences.selectedSemesterId, courseById]);

  const rows = useMemo(
    () =>
      (state.tasks || []).map((task, index) => {
        const course = task.enrollmentId
          ? courseById.get((state.enrollments || []).find((e) => e.id === task.enrollmentId)?.courseId)
          : null;
        const due = dueWordingFor(task.dueDate, state.demoDate);
        return { task, index, course, due };
      }),
    [state.tasks, state.enrollments, courseById, state.demoDate],
  );

  const visible = useMemo(() => {
    let list = rows.filter((row) => {
      const { task } = row;
      if (filter === 'open') return !task.completed;
      if (filter === 'completed') return !!task.completed;
      if (filter === 'overdue') return !task.completed && row.due.tone === 'danger';
      if (filter === 'linked') return !!(task.source && task.source.planId);
      return true;
    });

    // Tasks carry no stored creation timestamp, so "Created" uses the stored
    // array order (oldest first) and shows the newest entries first.
    list = [...list];
    if (sort === 'dueDate') {
      list.sort((a, b) => String(a.task.dueDate || '9999-12-31').localeCompare(String(b.task.dueDate || '9999-12-31')));
    }
    if (sort === 'priority') {
      list.sort((a, b) => priorityWeight(a.task.priority) - priorityWeight(b.task.priority));
    }
    if (sort === 'course') {
      list.sort((a, b) => String(a.course?.code || '~').localeCompare(String(b.course?.code || '~')));
    }
    if (sort === 'created') {
      list.sort((a, b) => b.index - a.index);
    }
    return list;
  }, [rows, filter, sort]);

  const linkedCount = rows.filter((row) => row.task.source && row.task.source.planId).length;
  const openCount = rows.filter((row) => !row.task.completed).length;
  const editingExisting = !!draft.id;

  function openBlankForm() {
    setDraft(blankDraft(state, null));
    setFieldErrors({});
    setFormError(null);
    setNotice(null);
    setFormOpen(true);
  }

  /**
   * Edit an existing task. The draft keeps the task's stable id and its source
   * metadata, so the same record is updated in place and a source-linked task
   * stays linked after the edit. The fields are the create form's fields and are
   * validated by the same `onSave`, so invalid input is never written.
   */
  function startEdit(task) {
    setDraft(blankDraft(state, task));
    setFieldErrors({});
    setFormError(null);
    setNotice(null);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setDraft(blankDraft(state, null));
    setFieldErrors({});
    setFormError(null);
    setSaving(false);
  }

  /**
   * Start a guarded save. Returns false when a save is already in flight, which
   * is what stops a double tap from creating two identical tasks.
   */
  function beginSave() {
    if (savingRef.current) return false;
    savingRef.current = true;
    setSaving(true);
    savingTimer.current = setTimeout(() => {
      savingRef.current = false;
      setSaving(false);
    }, 350);
    return true;
  }

  function onSave() {
    if (savingRef.current) return;

    const title = validateText(draft.title, { label: 'Task title', minLength: MIN_TITLE_LENGTH });
    const date = validateDateInput(draft.dueDate, { label: 'Due date' });
    const errors = {};
    if (!title.ok) errors.title = title.error;
    if (!date.ok) errors.dueDate = date.error;
    setFieldErrors(errors);
    if (!title.ok || !date.ok) {
      setFormError('Fix the highlighted fields before saving.');
      return;
    }

    if (!beginSave()) return;

    const result = actions.saveTask({
      id: draft.id || undefined,
      enrollmentId: draft.enrollmentId || null,
      title: title.value,
      dueDate: date.value,
      priority: draft.priority,
      source: draft.source || null,
    });

    if (result && result.ok) {
      const label = draft.id ? 'Task updated on this device' : 'Task saved on this device';
      setNotice({ tone: 'ok', text: `${label}. It stays on this device and is never sent anywhere.` });
      closeForm();
      return;
    }

    const returned = (result && result.errors) || {};
    setFieldErrors((previous) => ({ ...previous, ...returned }));
    setFormError('The task was not saved. Correct the message and try again.');
  }

  return (
    <View>
      <Banner
        label={`${openCount} open of ${rows.length} task${rows.length === 1 ? '' : 's'} on this device, measured against the stored demo date ${formatDate(state.demoDate)}.`}
        tone="info"
      />

      {notice ? <Banner label={notice.text} tone={notice.tone} /> : null}

      {linkedCount > 0 ? (
        <Banner
          label={`${linkedCount} task${linkedCount === 1 ? '' : 's'} came from a saved plan. Ticking one off only updates your own checklist — attendance, marks, grades and university status are never changed by a task.`}
          tone="info"
        />
      ) : null}

      {formOpen ? (
        <Section title={editingExisting ? 'Edit task' : 'Add a task'} subtitle="Saved on this device only.">
          <Card>
            <Field
              label="Task title"
              value={draft.title}
              onChangeText={(text) => setDraft((previous) => ({ ...previous, title: text }))}
              error={fieldErrors.title}
              placeholder={`At least ${MIN_TITLE_LENGTH} characters`}
              helper={editingExisting ? 'This saves over the existing task instead of adding a duplicate.' : undefined}
              maxLength={120}
              testID="task-title-field"
            />

            <Field
              label="Due date (YYYY-MM-DD)"
              value={draft.dueDate}
              onChangeText={(text) => setDraft((previous) => ({ ...previous, dueDate: text }))}
              error={fieldErrors.dueDate}
              helper={dateHint(draft.dueDate, state.demoDate)}
              placeholder="2026-10-10"
              testID="task-due-date-field"
            />

            <Text style={[type.label, { marginBottom: spacing.xs }]}>Link to a course (optional)</Text>
            <View style={styles.chipRow}>
              <Chip
                label="No course"
                selected={!draft.enrollmentId}
                onPress={() => setDraft((previous) => ({ ...previous, enrollmentId: null }))}
              />
              {semesterCourses.map((option) => (
                <Chip
                  key={option.enrollmentId}
                  label={option.code}
                  selected={draft.enrollmentId === option.enrollmentId}
                  onPress={() =>
                    setDraft((previous) => ({
                      ...previous,
                      enrollmentId:
                        previous.enrollmentId === option.enrollmentId ? null : option.enrollmentId,
                    }))
                  }
                />
              ))}
            </View>
            {semesterCourses.length === 0 ? (
              <Text style={[type.caption, { marginBottom: spacing.sm }]}>
                No enrolled courses in the selected semester, so this task cannot be linked to a course.
              </Text>
            ) : null}

            <Text style={[type.label, { marginBottom: spacing.xs }]}>Priority</Text>
            <View style={styles.chipRow}>
              {PRIORITIES.map((option) => (
                <Chip
                  key={option.id}
                  label={option.label}
                  selected={draft.priority === option.id}
                  onPress={() => setDraft((previous) => ({ ...previous, priority: option.id }))}
                />
              ))}
            </View>

            {draft.source ? (
              <View style={styles.sourceBox}>
                <Text style={type.label}>Linked from</Text>
                <Text style={type.bodyMuted}>{sourceLabel(draft.source)}</Text>
                <Text style={[type.caption, { marginTop: spacing.xs }]}>
                  Completing this task changes nothing about attendance, marks or university status.
                </Text>
              </View>
            ) : null}

            {formError ? <Banner label={formError} tone="danger" /> : null}

            <ButtonRow>
              <Button
                label={saving ? 'Saving...' : editingExisting ? 'Save changes' : 'Save task'}
                icon={saving ? undefined : 'checkmark-circle'}
                disabled={saving}
                onPress={onSave}
                style={styles.flexButton}
                testID="task-save-button"
              />
              <Button label="Cancel" variant="secondary" onPress={closeForm} style={styles.flexButton} />
            </ButtonRow>
          </Card>
        </Section>
      ) : (
        <Button
          label={rows.length === 0 ? 'Add your first task' : 'Add task'}
          icon="add-circle"
          onPress={openBlankForm}
          style={styles.addButton}
          testID="task-add-button"
        />
      )}

      <Section title="Filter">
        <View style={styles.chipRow}>
          {TASK_FILTERS.map((option) => (
            <Chip
              key={option.id}
              label={option.label}
              selected={filter === option.id}
              onPress={() => setFilter(option.id)}
            />
          ))}
        </View>
      </Section>

      <Section title="Sort by">
        <View style={styles.chipRow}>
          {TASK_SORTS.map((option) => (
            <Chip key={option.id} label={option.label} selected={sort === option.id} onPress={() => setSort(option.id)} />
          ))}
        </View>
      </Section>

      {rows.length === 0 ? (
        <EmptyState
          icon="clipboard-outline"
          title="No tasks yet"
          message="Tasks are your own checklist and never change an academic record. Add one to track a deadline you chose."
          actionLabel="Add task"
          onAction={openBlankForm}
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon="funnel-outline"
          title="Nothing matches this filter"
          message={`${rows.length} task${rows.length === 1 ? '' : 's'} stored, none of them in this filter.`}
          actionLabel="Show all tasks"
          onAction={() => {
            setFilter('all');
            setSort('dueDate');
          }}
        />
      ) : (
        visible.map(({ task, course, due }) => {
          const priority = priorityOf(task.priority);
          const provenance = sourceLabel(task.source);
          return (
            <Card
              key={task.id}
              tone={task.completed ? undefined : due.tone === 'danger' ? 'danger' : undefined}
              title={task.title}
              subtitle={[
                course ? course.code : 'Not linked to a course',
                task.dueDate ? formatDate(task.dueDate) : 'No due date',
              ].join(' · ')}
              right={<Status label={priority.pill} tone={priority.tone} />}
            >
              <View style={styles.metaRow}>
                <Status label={task.completed ? 'Completed' : 'Not done'} tone={task.completed ? 'ok' : 'neutral'} />
                <View style={styles.metaGap} />
                <Status label={due.text} tone={task.completed ? 'neutral' : due.tone} />
              </View>

              {task.source ? (
                <View style={styles.sourceRow}>
                  <Chip label={provenance} icon="link" />
                </View>
              ) : null}

              {task.source ? (
                <Text style={[type.caption, { marginTop: spacing.xs }]}>
                  This task came from a saved plan. Marking it done records your own progress only.
                </Text>
              ) : null}

              <ButtonRow style={styles.actionRow}>
                <Button
                  label={task.completed ? 'Not done' : 'Done'}
                  variant={task.completed ? 'secondary' : 'primary'}
                  icon={task.completed ? 'arrow-undo' : 'checkmark'}
                  onPress={() => actions.toggleTask(task.id)}
                  style={styles.flexButton}
                  testID={`task-toggle-${task.id}`}
                />
                <Button
                  label="Edit"
                  variant="secondary"
                  icon="create-outline"
                  onPress={() => startEdit(task)}
                  style={styles.flexButton}
                  testID={`task-edit-${task.id}`}
                />
                <Button
                  label="Delete"
                  variant="danger"
                  icon="trash"
                  onPress={() => actions.deleteTask(task.id)}
                  style={styles.flexButton}
                  testID={`task-delete-${task.id}`}
                />
              </ButtonRow>

              {course ? (
                <Button
                  label={`Open ${course.code}`}
                  variant="ghost"
                  icon="open-outline"
                  onPress={() => openView('course', { enrollmentId: task.enrollmentId })}
                />
              ) : null}
            </Card>
          );
        })
      )}
    </View>
  );
}

function dateHint(value, demoDate) {
  const due = dueWordingFor(value, demoDate);
  if (due.daysLeft == null) return 'YYYY-MM-DD, for example 2026-10-10.';
  return `${due.text} (demo date ${formatDate(demoDate)}).`;
}

const styles = StyleSheet.create({
  addButton: { marginBottom: spacing.lg },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.sm },
  flexButton: { flexGrow: 1, minWidth: 140 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginBottom: spacing.xs },
  metaGap: { width: spacing.sm },
  sourceRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.xs },
  sourceBox: {
    marginBottom: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionRow: { marginTop: spacing.sm, marginBottom: spacing.xs },
});

export default TasksScreen;