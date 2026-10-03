/**
 * Course workspace — the shared detail view for one enrollment.
 *
 * One enrollment keeps one context: the course identity stays on screen while the
 * inline section buttons switch between Attendance, Marks and Tasks.
 * Section switching is local state plus conditional rendering, exactly like the
 * class example, so no navigation code is involved.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Banner, Button, Card, Chip, EmptyState, Field, KeyValueRow, Section, Status } from '../../ui/components.js';
import { colors, spacing, type } from '../../ui/theme.js';
import { summarizeAttendance, statusLabel } from '../../domain/attendance.js';
import { summarizeMarks } from '../../domain/marks.js';
import { createEmptyScenario } from '../../domain/scenarios.js';
import { isCountedGrade } from '../../domain/gpa.js';
import { daysBetween, formatDate } from '../../domain/validation.js';
import AttendanceView from '../attendance/AttendanceView.js';
import MarksView from '../marks/MarksView.js';
import MarksPlanner from '../marks/MarksPlanner.js';

const SECTIONS = [
  { id: 'attendance', label: 'Attendance', icon: 'calendar' },
  { id: 'marks', label: 'Marks', icon: 'ribbon' },
  { id: 'tasks', label: 'Tasks', icon: 'checkbox' },
];

/**
 * Editable per-course assumption draft, owned by CourseScreen.
 *
 * Both planners read and write this object, so switching sections (which
 * unmounts the planner) no longer discards what the student typed. The draft is
 * keyed by enrollment, so two courses opened in the same session keep separate
 * inputs.
 */
export function createEmptyDraft() {
  return {
    futurePresent: '',
    futureAbsent: '',
    remainingSessions: '',
    targetPoints: '',
    hypotheticalRaw: {},
    grade: null, // null = not chosen yet; '' = explicitly no grade assumption
  };
}

/** The live inputs, keeping blank optional values blank (never coerced to 0). */
function draftScenarioFields(draft) {
  const source = draft || {};
  const hypotheticalRaw = {};
  Object.entries(source.hypotheticalRaw || {}).forEach(([id, value]) => {
    const text = String(value ?? '').trim();
    if (text !== '') hypotheticalRaw[id] = text;
  });
  return {
    futurePresent: source.futurePresent ?? '',
    futureAbsent: source.futureAbsent ?? '',
    remainingSessions: source.remainingSessions ?? '',
    targetPoints: source.targetPoints ?? '',
    hypotheticalRaw,
  };
}

/**
 * Merge one course's live draft into a plan, preserving every other course.
 *
 * A grade assumption is written ONLY when the student chose one explicitly:
 * a hypothetical mark never becomes a grade by itself, and an untouched grade
 * (null) leaves whatever the plan already held exactly as it was.
 */
export function mergeDraftIntoPlan(existingPlan, enrollmentId, draft) {
  const enrollmentScenarios = { ...(existingPlan?.enrollmentScenarios || {}) };
  enrollmentScenarios[enrollmentId] = {
    ...createEmptyScenario(),
    ...(enrollmentScenarios[enrollmentId] || {}),
    ...draftScenarioFields(draft),
  };
  const gradeAssumptions = { ...(existingPlan?.gradeAssumptions || {}) };
  const grade = draft?.grade;
  if (grade === null || grade === undefined) {
    // untouched — keep whatever the plan already had
  } else if (isCountedGrade(grade)) {
    gradeAssumptions[enrollmentId] = grade;
  } else {
    delete gradeAssumptions[enrollmentId];
  }
  return { enrollmentScenarios, gradeAssumptions };
}

export function CourseScreen({ state, actions, openView, params }) {
  const enrollment = useMemo(
    () => state.enrollments.find((e) => e.id === params?.enrollmentId) || null,
    [state.enrollments, params],
  );
  const initialSection = SECTIONS.some((s) => s.id === params?.section) ? params.section : 'attendance';
  const [section, setSection] = useState(initialSection);
  // The draft, the plan target and the transfer result are owned here, so they
  // survive a section switch (and the planner unmount that comes with it). A
  // stable id is minted once for a plan created from this screen, mirroring the
  // scenario editor, so repeated saves update the same plan instead of appending.
  const [drafts, setDrafts] = useState({});
  const [planTarget, setPlanTarget] = useState({ planId: '', newName: '' });
  const [transferResult, setTransferResult] = useState(null);
  const [draftPlanId] = useState(() => `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`);

  if (!enrollment) {
    return (
      <EmptyState
        icon="alert-circle-outline"
        title="This course is not in the dataset"
        message="It may have been removed by the Demo Data screen. Pick a course again."
        actionLabel="Open the course list"
        onAction={() => openView('courses')}
      />
    );
  }

  const course = state.courses.find((c) => c.id === enrollment.courseId) || null;
  const semester = state.semesters.find((s) => s.id === enrollment.semesterId) || null;
  const lab = course?.linkedLabId ? state.courses.find((c) => c.id === course.linkedLabId) : null;

  const enrollmentId = enrollment.id;
  const draft = drafts[enrollmentId] || createEmptyDraft();
  const updateDraft = (patch) =>
    setDrafts((previous) => ({
      ...previous,
      [enrollmentId]: { ...(previous[enrollmentId] || createEmptyDraft()), ...patch },
    }));

  /**
   * The transfer: write the exact current inputs into the chosen plan.
   *
   * `mergeDraftIntoPlan` preserves the plan's other courses and every other
   * field, and never turns a hypothetical mark into a grade.
   */
  const addDraftToPlan = () => {
    const existing = planTarget.planId
      ? state.plans.find((plan) => plan.id === planTarget.planId) || null
      : null;
    const id = existing?.id || planTarget.planId || draftPlanId;
    const name = existing ? existing.name : planTarget.newName;
    const { enrollmentScenarios, gradeAssumptions } = mergeDraftIntoPlan(existing, enrollmentId, draft);
    const result = actions.savePlan({
      id,
      name,
      enrollmentScenarios,
      gradeAssumptions,
      shortlistedCourseIds: existing?.shortlistedCourseIds || [],
    });
    if (!result.ok) {
      setTransferResult({ tone: 'danger', message: result.errors?.name || 'The plan could not be saved.' });
      return;
    }
    setTransferResult({ tone: 'ok', message: `Assumptions added to “${name}”. Open saved plans to compare them.` });
    setPlanTarget({ planId: id, newName: '' });
  };

  const planTransferSlot = (
    <Section
      title="Save to a plan"
      subtitle="Adds this course's current assumptions to a named multi-course plan."
    >
      <Card>
        {state.plans.length === 0 ? (
          <Text style={type.caption}>No saved plans yet. Name one below to create the first.</Text>
        ) : (
          <View style={styles.chipRow}>
            {state.plans.map((plan) => (
              <Chip
                key={plan.id}
                label={plan.name}
                selected={planTarget.planId === plan.id}
                onPress={() =>
                  setPlanTarget((previous) => ({
                    ...previous,
                    planId: previous.planId === plan.id ? '' : plan.id,
                  }))
                }
                testID={`plan-target-${plan.id}`}
              />
            ))}
          </View>
        )}
        {planTarget.planId ? null : (
          <Field
            label="New plan name"
            value={planTarget.newName}
            onChangeText={(value) => setPlanTarget((previous) => ({ ...previous, newName: value }))}
            maxLength={60}
            placeholder="e.g. Recovery semester"
            helper="Pick an existing plan above to add to it instead."
            testID="plan-target-name"
          />
        )}
        <Button label="Add to plan" icon="add-circle" onPress={addDraftToPlan} testID="plan-add" />
        {transferResult ? (
          <Banner label={transferResult.message} tone={transferResult.tone} style={{ marginTop: spacing.sm }} />
        ) : null}
        {transferResult?.tone === 'ok' ? (
          <Button
            label="Open saved plans"
            variant="secondary"
            onPress={() => openView('scenarios')}
            style={{ marginTop: spacing.sm }}
          />
        ) : null}
      </Card>
    </Section>
  );

  const attendance = summarizeAttendance(
    state.attendanceSessions.filter((s) => s.enrollmentId === enrollment.id),
    state.preferences.attendanceThresholdPercent,
  );
  const marks = summarizeMarks(state.assessments.filter((a) => a.enrollmentId === enrollment.id));
  const attendanceStatus = statusLabel(attendance);

  const tasks = state.tasks.filter((task) => task.enrollmentId === enrollment.id);

  return (
    <View>
      <Card>
        <Text style={type.screenTitle}>{course ? `${course.code}` : enrollment.courseId}</Text>
        <Text style={[type.body, { marginBottom: spacing.sm }]}>{course?.name || 'Unknown course'}</Text>
        <KeyValueRow label="Credits" value={String(course?.credits ?? 0)} mono />
        <KeyValueRow label="Section" value={enrollment.section} mono />
        <KeyValueRow label="Term" value={semester ? semester.label : enrollment.semesterId} mono />
        <KeyValueRow label="Enrollment status" value={enrollment.status} mono />
        {lab ? (
          <KeyValueRow
            label="Linked laboratory"
            value={`${lab.code} · ${lab.name}`}
            mono
          />
        ) : null}
        {course?.nonCredit ? (
          <Status label="Non-credit course — excluded from GPA" tone="info" style={{ marginTop: spacing.xs }} />
        ) : null}
        {course?.termNote ? <Text style={[type.caption, { marginTop: spacing.xs }]}>{course.termNote}</Text> : null}

        <View style={styles.summaryRow}>
          <View style={styles.summaryCell}>
            <Text style={type.label}>Attendance</Text>
            <Text style={type.metricSmall}>{attendance.percent == null ? '—' : `${attendance.percent}%`}</Text>
            <Status label={attendanceStatus.label} tone={attendanceStatus.tone} />
          </View>
          <View style={styles.summaryCell}>
            <Text style={type.label}>Earned points</Text>
            <Text style={type.metricSmall}>
              {marks.assessmentCount === 0 ? '—' : marks.earnedPoints.toFixed(2)}
            </Text>
            <Text style={type.caption}>
              {marks.assessmentCount === 0 ? 'No scheme' : `of 100 · ${marks.publishedWeight}% assessed`}
            </Text>
          </View>
        </View>
      </Card>

      <View style={styles.sectionBar}>
        {SECTIONS.map((item) => (
          <Chip
            key={item.id}
            label={item.label}
            icon={item.icon}
            selected={section === item.id}
            onPress={() => setSection(item.id)}
          />
        ))}
      </View>

      {section === 'attendance' ? (
        <AttendanceView
          state={state}
          actions={actions}
          enrollment={enrollment}
          course={course}
          draft={draft}
          onDraftChange={updateDraft}
          planTransferSlot={planTransferSlot}
        />
      ) : null}

      {section === 'marks' ? (
        <View>
          <MarksView
            state={state}
            enrollment={enrollment}
            course={course}
            showDemoGrade={state.preferences.showDemoGradeScale}
          />
          <MarksPlanner
            state={state}
            enrollment={enrollment}
            course={course}
            draft={draft}
            onDraftChange={updateDraft}
            planTransferSlot={planTransferSlot}
          />
        </View>
      ) : null}

      {section === 'tasks' ? (
        <Section title={`Tasks for ${course?.code || 'this course'}`} subtitle="Completing a task never changes any academic record.">
          {tasks.length === 0 ? (
            <EmptyState
              icon="checkbox-outline"
              title="No tasks for this course"
              message="Create one from the task list, or from an attendance recovery goal."
              actionLabel="Open the task list"
              onAction={() => openView('tasks', { prefill: { enrollmentId: enrollment.id, title: '', dueDate: state.demoDate, priority: 'medium', source: null } })}
            />
          ) : (
            <Card>
              {tasks.map((task, index) => {
                const daysLeft = daysBetween(state.demoDate, task.dueDate);
                return (
                  <View
                    key={task.id}
                    style={[styles.taskRow, index > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={type.body}>{task.title}</Text>
                      <Text style={type.caption}>
                        {`Due ${formatDate(task.dueDate)}${daysLeft == null ? '' : daysLeft < 0 ? ` · overdue by ${Math.abs(daysLeft)} day(s)` : daysLeft === 0 ? ' · due today' : ` · in ${daysLeft} day(s)`}`}
                      </Text>
                    </View>
                    <Button
                      label={task.completed ? 'Done' : 'Open'}
                      variant={task.completed ? 'secondary' : 'primary'}
                      onPress={() => actions.toggleTask(task.id)}
                    />
                    <View style={{ width: spacing.sm }} />
                    <Button label="Delete" variant="danger" onPress={() => actions.deleteTask(task.id)} />
                  </View>
                );
              })}
            </Card>
          )}
          <Button label="Open the full task list" variant="secondary" onPress={() => openView('tasks')} />
        </Section>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  summaryRow: { flexDirection: 'row', marginTop: spacing.md, gap: spacing.sm },
  summaryCell: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  sectionBar: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  taskRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, flexWrap: 'wrap', gap: spacing.xs },
});

export default CourseScreen;
