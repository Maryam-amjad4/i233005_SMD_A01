/**
 * Profile — synthetic student identity, academic summary and local settings.
 *
 * Owns: the identity card, the derived academic summary (terms with enrolment
 * records, completed and in-progress credits, current CGPA), the local
 * attendance threshold, the demonstration grade-scale toggle, the pinned
 * shortcut list and the links to the history and demo views.
 * Nothing here is an official record: the dataset holds no identity document
 * number, no contact details and no credentials.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  Banner,
  Button,
  ButtonRow,
  Card,
  Chip,
  Divider,
  Field,
  KeyValueRow,
  MetricTile,
  Section,
  Status,
} from '../../ui/components.js';
import { spacing, type } from '../../ui/theme.js';
import { attemptsFromState, calculateCGPA } from '../../domain/gpa.js';
import { studyPlanSummary } from '../../domain/planning.js';
import { SHORTCUTS, PINNING_LOCATION_NOTE } from '../home/HomeScreen.js';

export function ProfileScreen({ state, actions, openView, params }) {
  const [thresholdDraft, setThresholdDraft] = useState(String(state.preferences.attendanceThresholdPercent));
  const [thresholdError, setThresholdError] = useState(null);

  const student = state.student || {};

  const currentSemesterOrder = useMemo(() => {
    const semesters = state.semesters || [];
    const current = semesters.find((s) => s.status === 'current');
    if (current) return current.order;
    const orders = semesters.map((s) => s.order).filter((o) => Number.isFinite(o));
    return orders.length ? Math.max(...orders) : 0;
  }, [state.semesters]);

  const summary = useMemo(() => studyPlanSummary(state), [state]);
  const cgpa = useMemo(
    () => calculateCGPA(attemptsFromState(state), currentSemesterOrder),
    [state, currentSemesterOrder],
  );

  const termsWithRecords = useMemo(() => {
    const ids = new Set(
      (state.enrollments || [])
        .filter((e) => e.status !== 'withdrawn')
        .map((e) => e.semesterId),
    );
    return ids.size;
  }, [state.enrollments]);

  const applyThreshold = () => {
    const result = actions.setThreshold(thresholdDraft);
    if (result && result.ok) {
      setThresholdError(null);
      return;
    }
    const errors = (result && result.errors) || {};
    const message =
      typeof errors === 'string'
        ? errors
        : errors.attendanceThresholdPercent || 'Enter a whole number greater than 0 and at most 100.';
    setThresholdError(message);
  };

  const pins = state.preferences?.pins || [];
  const showDemoGradeScale = !!state.preferences?.showDemoGradeScale;

  return (
    <View>
      <Banner
        label="This profile is synthetic. The dataset deliberately contains no identity document number, no contact details and no real credentials, so none can be shown or edited here."
        tone="warn"
      />

      <Section title="Student record" subtitle="Identity fields exactly as they appear in the dataset.">
        <Card>
          <KeyValueRow label="Name" value={student.name || 'Not recorded'} />
          <KeyValueRow label="Roll number" value={student.rollNumber || 'Not recorded'} mono />
          <KeyValueRow label="Degree" value={student.degree || 'Not recorded'} />
          <KeyValueRow label="Campus" value={student.campus || 'Not recorded'} />
          <KeyValueRow label="Batch" value={student.batch || 'Not recorded'} mono />
          <KeyValueRow label="Section" value={student.section || 'Not recorded'} mono />
          <KeyValueRow
            label="Semester number"
            value={student.semesterNumber == null || student.semesterNumber === '' ? 'Not recorded' : String(student.semesterNumber)}
            mono
          />
          <Divider />
          <KeyValueRow label="Identity document number" value="Not held in this dataset" />
          <KeyValueRow label="Contact details" value="Not held in this dataset" />
          <KeyValueRow label="Login credentials" value="Not stored anywhere in this app" />
        </Card>
      </Section>

      <Section
        title="Academic summary"
        subtitle="Derived on render from the stored records; nothing here is saved as a separate value."
      >
        <View style={styles.metricRow}>
          <MetricTile
            label="Terms with records"
            value={String(termsWithRecords)}
            caption="Semesters holding enrolments"
          />
          <MetricTile
            label="Credits completed"
            value={String(summary.creditsCompleted)}
            tone="green700"
            caption="Passed course records"
          />
          <MetricTile
            label="Credits in progress"
            value={String(summary.creditsInProgress)}
            tone="navy700"
            caption="Selected semester"
          />
        </View>

        <Card>
          <View style={styles.headRow}>
            <View style={{ flex: 1 }}>
              <Text style={type.metricSmall}>{cgpa.value == null ? 'No data' : cgpa.value.toFixed(2)}</Text>
              <Text style={type.caption}>Current CGPA, counted up to the current semester</Text>
            </View>
            <Status
              label={cgpa.value == null ? 'No GPA-countable record' : `CGPA ${cgpa.value.toFixed(2)}`}
              tone={cgpa.value == null ? 'neutral' : 'ok'}
            />
          </View>
          <KeyValueRow label="Counted courses" value={String(cgpa.included.length)} mono />
          <KeyValueRow label="Counted credits" value={String(cgpa.includedCredits ?? 0)} mono />
          <KeyValueRow label="Excluded attempts" value={String(cgpa.exclusions.length)} mono />
          {cgpa.repeated.length > 0 ? (
            <KeyValueRow label="Repeated courses" value={String(cgpa.repeated.length)} mono />
          ) : null}
          <Text style={[type.caption, { marginTop: spacing.xs }]}>
            Grade points and the formula come from the August 2023 undergraduate handbook extract. Excluded attempts keep
            their reason in the transcript view.
          </Text>
        </Card>
      </Section>

      <Section
        title="Local settings"
        subtitle="Stored on this device only and applied to the synthetic dataset."
      >
        <Card>
          <View style={styles.thresholdRow}>
            <View style={{ flex: 1 }}>
              <Field
                label="Minimum attendance percent"
                value={thresholdDraft}
                onChangeText={setThresholdDraft}
                error={thresholdError}
                keyboardType="numeric"
                maxLength={3}
                suffix="%"
                helper={`Currently ${state.preferences.attendanceThresholdPercent}% in this dataset. Changing it recalculates every attendance figure and saved plan.`}
                testID="profile-threshold-input"
              />
            </View>
            <Button label="Apply" onPress={applyThreshold} style={{ marginTop: 20 }} testID="profile-threshold-apply" />
          </View>
          <Divider />
          <Text style={[type.label, { marginBottom: spacing.sm }]}>Demonstration features</Text>
          <View style={styles.chipRow}>
            <Chip
              label={showDemoGradeScale ? 'Demonstration grade scale: shown' : 'Demonstration grade scale: hidden'}
              icon={showDemoGradeScale ? 'eye' : 'eye-off'}
              selected={showDemoGradeScale}
              onPress={() => actions.setPreference({ showDemoGradeScale: !showDemoGradeScale })}
              testID="profile-demo-grade-scale"
            />
          </View>
          <Text style={[type.caption, { marginBottom: spacing.md }]}>
            The demonstration scale is this project&apos;s own scale. It is not a university grade conversion and never
            turns a numeric score into an official grade on its own.
          </Text>
        </Card>

        <Card>
          <Text style={[type.label, { marginBottom: spacing.xs }]}>Shortcut pins</Text>
          <Text style={[type.caption, { marginBottom: spacing.sm }]}>{PINNING_LOCATION_NOTE}</Text>
          <Text style={[type.caption, { marginBottom: spacing.sm }]}>
            {`${pins.length} of ${SHORTCUTS.length} shortcuts pinned. Tapping a shortcut toggles its pin and changes nothing else.`}
          </Text>
          <View style={styles.chipRow}>
            {SHORTCUTS.map((shortcut) => {
              const pinned = pins.includes(shortcut.id);
              return (
                <Chip
                  key={shortcut.id}
                  label={pinned ? `Unpin ${shortcut.label}` : `Pin ${shortcut.label}`}
                  icon={pinned ? 'remove-circle-outline' : 'add-circle-outline'}
                  selected={pinned}
                  onPress={() => actions.togglePin(shortcut.id)}
                  testID={`profile-pin-${shortcut.id}`}
                />
              );
            })}
          </View>
        </Card>
      </Section>

      <Section title="Jump to">
        <ButtonRow>
          <Button
            label="Academic history"
            variant="secondary"
            icon="ribbon-outline"
            onPress={() => openView('history', {})}
            testID="profile-open-history"
          />
          <Button
            label="Demo data"
            variant="secondary"
            icon="flask-outline"
            onPress={() => openView('demo', {})}
            testID="profile-open-demo"
          />
        </ButtonRow>
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({
  metricRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.sm, gap: spacing.sm },
  thresholdRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.xs },
});

export default ProfileScreen;
