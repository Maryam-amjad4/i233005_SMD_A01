/**
 * Scenario editor — builds a named plan out of inputs only.
 *
 * Two design decisions worth defending in the viva:
 *  1. Form inputs are written into the plan record on every change, so pressing
 *     Back (or the Android hardware Back) never loses what was typed. There is no
 *     global state framework: the plan in useAppData is the single source.
 *  2. A plan never stores a derived result. When the records change, the saved
 *     plan is re-evaluated from the current baseline on the comparison screen.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Banner, Button, Card, Chip, Field, Section, Status } from '../../ui/components.js';
import { colors, spacing, type } from '../../ui/theme.js';
import { createEmptyScenario, gradeChoices } from '../../domain/scenarios.js';
import { isCountedGrade } from '../../domain/gpa.js';

// Derived from the shared grade-point table so the offered grades cannot drift
// from the table the GPA module uses. This includes the failure grades (F/FA)
// and the C-/D+ bands the hardcoded list used to omit.
const GRADE_CHOICES = gradeChoices();

export function ScenarioEditor({ state, actions, openView, params }) {
  const existing = useMemo(
    () => state.plans.find((plan) => plan.id === params?.planId) || null,
    [state.plans, params],
  );

  const [name, setName] = useState(existing?.name || 'New plan');
  const [nameError, setNameError] = useState(null);
  const [enrollmentScenarios, setEnrollmentScenarios] = useState(existing?.enrollmentScenarios || {});
  const [gradeAssumptions, setGradeAssumptions] = useState(existing?.gradeAssumptions || {});
  const [saved, setSaved] = useState(null);

  /**
   * A new plan needs a stable id from its very first keystroke.
   *
   * savePlan appends a fresh record whenever `id` is absent, and the draft is
   * persisted on every change so Back cannot lose typed input. Without a stable
   * id, typing a twelve-character name would write twelve plans named "N", "Ne",
   * "New"... The id is minted once here and reused for every subsequent write, so
   * the second save updates the first instead of appending.
   */
  const [draftPlanId] = useState(
    () => `plan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
  );
  const planId = existing?.id || draftPlanId;

  const courseById = useMemo(() => new Map(state.courses.map((c) => [c.id, c])), [state.courses]);
  const enrollments = useMemo(
    () => state.enrollments.filter((e) => e.semesterId === state.preferences.selectedSemesterId && e.status !== 'withdrawn'),
    [state.enrollments, state.preferences.selectedSemesterId],
  );

  /**
   * Persist the draft immediately so Back never loses typed input.
   *
   * `shortlistedCourseIds` is a retired feature: it has no editor control any
   * more, but saved plans may still carry the field. The draft passes the
   * existing value straight through so editing a plan never wipes it.
   */
  const persistDraft = (overrides = {}) => {
    if (!String(overrides.name ?? name).trim()) return;
    actions.savePlan({
      id: planId,
      name: overrides.name ?? name,
      enrollmentScenarios: overrides.enrollmentScenarios ?? enrollmentScenarios,
      gradeAssumptions: overrides.gradeAssumptions ?? gradeAssumptions,
      shortlistedCourseIds: existing?.shortlistedCourseIds || [],
    });
  };

  const toggleCourse = (enrollmentId) => {
    const removing = !!enrollmentScenarios[enrollmentId];
    const nextScenarios = removing
      ? Object.fromEntries(Object.entries(enrollmentScenarios).filter(([key]) => key !== enrollmentId))
      : { ...enrollmentScenarios, [enrollmentId]: createEmptyScenario() };
    // Removing a course must remove its grade assumption too. Otherwise the
    // stored grade keeps moving the hypothetical GPA while its controls vanish,
    // and re-adding the course silently restores it.
    const nextGrades = removing
      ? Object.fromEntries(Object.entries(gradeAssumptions).filter(([key]) => key !== enrollmentId))
      : gradeAssumptions;
    setEnrollmentScenarios(nextScenarios);
    setGradeAssumptions(nextGrades);
    persistDraft({ enrollmentScenarios: nextScenarios, gradeAssumptions: nextGrades });
  };

  const updateScenario = (enrollmentId, patch) => {
    const next = {
      ...enrollmentScenarios,
      [enrollmentId]: { ...createEmptyScenario(), ...enrollmentScenarios[enrollmentId], ...patch },
    };
    setEnrollmentScenarios(next);
    persistDraft({ enrollmentScenarios: next });
  };

  const updateHypothetical = (enrollmentId, assessmentId, value) => {
    const scenario = { ...createEmptyScenario(), ...enrollmentScenarios[enrollmentId] };
    const hypotheticalRaw = { ...(scenario.hypotheticalRaw || {}) };
    if (value === '' || value == null) delete hypotheticalRaw[assessmentId];
    else hypotheticalRaw[assessmentId] = value;
    updateScenario(enrollmentId, { hypotheticalRaw });
  };

  const toggleGrade = (enrollmentId, grade) => {
    const next = { ...gradeAssumptions };
    if (grade === null || next[enrollmentId] === grade) delete next[enrollmentId];
    else next[enrollmentId] = grade;
    setGradeAssumptions(next);
    persistDraft({ gradeAssumptions: next });
  };

  const save = () => {
    const result = actions.savePlan({
      id: planId,
      name,
      enrollmentScenarios,
      gradeAssumptions,
      shortlistedCourseIds: existing?.shortlistedCourseIds || [],
    });
    setNameError(result.ok ? null : result.errors.name);
    setSaved(result.ok ? 'Plan saved on this device. Open Saved plans to compare it against the current records.' : null);
  };

  const chosenIds = Object.keys(enrollmentScenarios);

  return (
    <View>
      <Banner
        label="This editor stores assumptions only. Nothing here is a result, and a score is never converted into a grade automatically."
        tone="info"
      />

      <Section title="Plan">
        <Card>
          <Field
            label="Plan name"
            value={name}
            onChangeText={(value) => {
              setName(value);
              persistDraft({ name: value });
            }}
            error={nameError}
            maxLength={60}
            helper="Shown in the saved plan list."
          />
          <Text style={type.caption}>{`Baseline revision at the last save: ${state.revision}. Changing it makes older plans recalculate.`}</Text>
        </Card>
      </Section>

      <Section title="Courses in this plan" subtitle="Pick the current-term modules you want to model together.">
        <Card>
          {enrollments.length === 0 ? (
            <Text style={type.caption}>No modules are enrolled in the selected term, so there is nothing to plan yet.</Text>
          ) : (
            <View style={styles.chipRow}>
              {enrollments.map((enrollment) => {
                const course = courseById.get(enrollment.courseId);
                return (
                  <Chip
                    key={enrollment.id}
                    label={`${course?.code || enrollment.courseId}`}
                    selected={!!enrollmentScenarios[enrollment.id]}
                    onPress={() => toggleCourse(enrollment.id)}
                  />
                );
              })}
            </View>
          )}
        </Card>
      </Section>

      {chosenIds.map((enrollmentId) => {
        const enrollment = state.enrollments.find((e) => e.id === enrollmentId);
        const course = enrollment ? courseById.get(enrollment.courseId) : null;
        const scenario = { ...createEmptyScenario(), ...enrollmentScenarios[enrollmentId] };
        const assessments = state.assessments.filter((a) => a.enrollmentId === enrollmentId);
        const open = assessments.filter((a) => a.status === 'submitted' || a.status === 'scheduled');

        return (
          <Card
            key={enrollmentId}
            title={`${course?.code || enrollmentId} · ${course?.name || 'Unknown course'}`}
            subtitle="Scenario inputs"
            right={<Button label="Remove" variant="danger" onPress={() => toggleCourse(enrollmentId)} />}
          >
            <Field
              label="Future classes you expect to attend"
              value={scenario.futurePresent}
              onChangeText={(value) => updateScenario(enrollmentId, { futurePresent: value })}
              keyboardType="numeric"
              placeholder="0"
              helper="Blank means zero."
            />
            <Field
              label="Future classes you expect to miss"
              value={scenario.futureAbsent}
              onChangeText={(value) => updateScenario(enrollmentId, { futureAbsent: value })}
              keyboardType="numeric"
              placeholder="0"
            />
            <Field
              label="Classes left this term (optional)"
              value={scenario.remainingSessions}
              onChangeText={(value) => updateScenario(enrollmentId, { remainingSessions: value })}
              keyboardType="numeric"
              placeholder="unknown"
              helper="Used only to report whether the scenario fits the remaining schedule."
            />
            <Field
              label="Weighted-points target (out of 100, optional)"
              value={scenario.targetPoints}
              onChangeText={(value) => updateScenario(enrollmentId, { targetPoints: value })}
              keyboardType="numeric"
              placeholder="e.g. 70"
              helper="An unattainable target is still saved; it is simply never labelled achieved."
            />

            <Text style={[type.label, { marginTop: spacing.sm }]}>Hypothetical assessment marks (raw, not weighted)</Text>
            {open.length === 0 ? (
              <Text style={type.caption}>This course has no unpublished or scheduled assessment to model.</Text>
            ) : (
              open.map((assessment) => (
                <Field
                  key={assessment.id}
                  label={`${assessment.title} (out of ${assessment.maxMarks})`}
                  value={(scenario.hypotheticalRaw || {})[assessment.id] ?? ''}
                  onChangeText={(value) => updateHypothetical(enrollmentId, assessment.id, value)}
                  keyboardType="numeric"
                  placeholder="not modelled"
                />
              ))
            )}

            <Text style={[type.label, { marginTop: spacing.sm }]}>Grade assumption for the GPA card</Text>
            <Text style={[type.caption, { marginBottom: spacing.xs }]}>
              Optional and separate from the marks scenario above. With no grade chosen, no GPA projection appears.
            </Text>
            <View style={styles.chipRow}>
              <Chip
                label="No assumption"
                selected={!gradeAssumptions[enrollmentId]}
                onPress={() => toggleGrade(enrollmentId, null)}
              />
              {GRADE_CHOICES.filter(isCountedGrade).map((grade) => (
                <Chip
                  key={grade}
                  label={grade}
                  selected={gradeAssumptions[enrollmentId] === grade}
                  onPress={() => toggleGrade(enrollmentId, grade)}
                />
              ))}
            </View>
            {gradeAssumptions[enrollmentId] ? (
              <Status label={`Grade assumption: ${gradeAssumptions[enrollmentId]} (entered by you)`} tone="info" />
            ) : null}
          </Card>
        );
      })}

      <Section title="Save">
        <Card>
          <View style={styles.row}>
            <Button label="Save plan" onPress={save} style={{ flex: 1 }} />
            <Button label="Compare" variant="secondary" onPress={() => openView('scenarios')} style={{ flex: 1 }} />
          </View>
          {saved ? <Banner label={saved} tone="ok" style={{ marginTop: spacing.sm }} /> : null}
          <Text style={[type.caption, { marginTop: spacing.sm }]}>
            Inputs are already written to this device as you type, so Back never loses them.
          </Text>
        </Card>
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  row: { flexDirection: 'row', gap: spacing.sm },
});

export default ScenarioEditor;
