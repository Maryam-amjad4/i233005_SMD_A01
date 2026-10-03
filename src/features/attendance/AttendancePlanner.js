/**
 * Attendance planner — a what-if scenario over future sessions, plus the
 * source-linked "recovery goal" action.
 *
 * Guardrails implemented here:
 *   - A valid result never stays on screen after its inputs become invalid,
 *     because the projection is recomputed on every keystroke and an invalid
 *     projection carries no numbers.
 *   - Repeated taps on an action cannot create duplicates: the action first asks
 *     for confirmation and then reports the created task.
 *   - The created task is linked back to this course and never changes
 *     attendance, marks or any university status.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Banner, Button, Card, Field, Section, Status } from '../../ui/components.js';
import { colors, radius, spacing, type } from '../../ui/theme.js';
import { projectAttendance } from '../../domain/attendance.js';
import { formatDate, validateDateInput } from '../../domain/validation.js';

/** Fallback used when the planner is mounted without a CourseScreen-owned draft. */
const EMPTY_DRAFT = { futurePresent: '', futureAbsent: '', remainingSessions: '' };

export function AttendancePlanner({ state, actions, enrollment, course, summary, sessions, draft, onDraftChange, planTransferSlot }) {
  const [confirming, setConfirming] = useState(false);
  const [created, setCreated] = useState(null);
  const [deadline, setDeadline] = useState(state.demoDate);
  const [deadlineError, setDeadlineError] = useState(null);
  // Standalone fallback: when no CourseScreen owner supplies a draft, the planner
  // keeps its own inputs. In the app CourseScreen always passes the draft, so the
  // inputs survive a section switch; this only serves direct mounts/tests.
  const [localDraft, setLocalDraft] = useState(() => ({ futurePresent: '', futureAbsent: '', remainingSessions: '' }));

  const controlled = typeof onDraftChange === 'function';
  const inputs = controlled ? draft || EMPTY_DRAFT : localDraft;
  const update = controlled ? onDraftChange : (patch) => setLocalDraft((previous) => ({ ...previous, ...patch }));
  const futurePresent = inputs.futurePresent ?? '';
  const futureAbsent = inputs.futureAbsent ?? '';
  const remaining = inputs.remainingSessions ?? '';

  const projection = useMemo(
    () => projectAttendance(summary, { futurePresent, futureAbsent, remainingSessions: remaining }),
    [summary, futurePresent, futureAbsent, remaining],
  );

  // A recovery goal is only a concrete number when there is a recorded base to
  // recover from. With held === 0 the summary reports recoverySessions 0 for
  // pending-only data, and `recoveryPossible` is true, which would otherwise
  // enable a task titled "Attend 0 consecutive sessions". Recovery also needs a
  // non-null recoverySessions (a 100% threshold with a prior absence is null).
  const hasRecordedBase = summary.held > 0;
  const recoveryGoal = hasRecordedBase && summary.recoverySessions != null ? summary.recoverySessions : null;
  const recoveryUnavailableReason =
    summary.held === 0
      ? 'No recorded sessions exist for this module, so no recovery goal can be computed.'
      : 'Recovery is not possible at this threshold, so no recovery goal can be created.';

  const commitRecoveryGoal = () => {
    const check = validateDateInput(deadline, { label: 'Goal deadline', notBefore: state.demoDate });
    setDeadlineError(check.ok ? null : check.error);
    if (!check.ok) return;
    const result = actions.saveTask({
      enrollmentId: enrollment.id,
      title: `Attend ${recoveryGoal} consecutive ${course?.code || 'course'} sessions to reach ${summary.thresholdPercent}%`,
      dueDate: check.value,
      priority: 'high',
      source: { planId: null, enrollmentId: enrollment.id, kind: 'attendance-recovery' },
    });
    if (result.ok) {
      setCreated({ deadline: check.value });
      setConfirming(false);
    }
  };

  return (
    <View>
      <Section title="Future scenario planner" subtitle="Conditional on recorded entries only.">
        <Card>
          <Field
            label="Classes you expect to attend"
            value={futurePresent}
            onChangeText={(value) => update({ futurePresent: value })}
            error={projection.errors.futurePresent}
            keyboardType="numeric"
            placeholder="0"
            helper="Leave blank to treat it as zero."
            testID="attendance-planner-future-present"
          />
          <Field
            label="Classes you expect to miss"
            value={futureAbsent}
            onChangeText={(value) => update({ futureAbsent: value })}
            error={projection.errors.futureAbsent}
            keyboardType="numeric"
            placeholder="0"
            testID="attendance-planner-future-absent"
          />
          <Field
            label="Classes left this term (optional)"
            value={remaining}
            onChangeText={(value) => update({ remainingSessions: value })}
            error={projection.errors.remainingSessions}
            keyboardType="numeric"
            placeholder="unknown"
            helper="Leave blank if the remaining schedule is unknown — recovery is then not guaranteed."
            testID="attendance-planner-remaining"
          />

        {!projection.valid ? (
          <Banner label="Fix the highlighted fields to see a projected result." tone="warn" />
        ) : (
          <View style={styles.resultBox}>
            <Text style={type.metricSmall}>
              {`${projection.percent}% after ${projection.projectedHeld} recorded sessions`}
            </Text>
            <Status
              label={projection.thresholdMet ? `Would meet ${summary.thresholdPercent}%` : `Below ${summary.thresholdPercent}%`}
              tone={projection.thresholdMet ? 'ok' : 'danger'}
              style={{ marginTop: spacing.xs }}
            />
            {projection.scheduleFeasible === false ? (
              <Text style={[type.caption, { marginTop: spacing.sm, color: colors.red700 }]}>
                The scenario uses more classes than remain in the term, so it cannot happen as described.
              </Text>
            ) : null}
            {projection.recoveryFeasible === false ? (
              <Text style={[type.caption, { marginTop: spacing.xs, color: colors.red700 }]}>
                {`Recovery needs ${projection.recoveryNeeded} consecutive sessions, which is more than the remaining classes you entered.`}
              </Text>
            ) : null}
            {projection.recoveryFeasible === null && recoveryGoal > 0 ? (
              <Text style={[type.caption, { marginTop: spacing.xs }]}>
                {`Recovery needs ${recoveryGoal} consecutive attended sessions. Enter the remaining classes to check whether that fits this term.`}
              </Text>
            ) : null}
          </View>
        )}

        <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
          {confirming ? (
            <View>
              <Banner
                label={`Create the recovery task now? This demo records a session count only — it never invents class dates.`}
                tone="info"
              />
              <Field
                label="Goal deadline (you choose the date)"
                value={deadline}
                onChangeText={setDeadline}
                error={deadlineError}
                helper={formatDate(deadline)}
              />
              <View style={styles.row}>
                <Button label="Confirm task" onPress={commitRecoveryGoal} style={{ flex: 1 }} />
                <Button label="Cancel" variant="secondary" onPress={() => setConfirming(false)} style={{ flex: 1 }} />
              </View>
            </View>
          ) : (
            <Button
              label={created ? 'Recovery goal added to tasks' : 'Add recovery goal'}
              icon={created ? 'checkmark-circle' : 'add-circle'}
              disabled={recoveryGoal == null || !!created}
              onPress={() => setConfirming(true)}
            />
          )}
          {recoveryGoal == null ? (
            <Text style={type.caption}>{recoveryUnavailableReason}</Text>
          ) : null}
          {created ? (
            <Banner
              label={`Task created with deadline ${formatDate(created.deadline)}. It appears in Tasks and on Home, and it does not change any attendance record.`}
              tone="ok"
            />
          ) : null}
          {sessions.length === 0 ? (
            <Text style={type.caption}>There are no recorded sessions for this module, so the scenario starts from no data.</Text>
          ) : null}
        </View>
      </Card>
    </Section>
      {planTransferSlot}
    </View>
  );
}

const styles = StyleSheet.create({
  resultBox: {
    marginTop: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: { flexDirection: 'row', gap: spacing.sm },
});

export default AttendancePlanner;
