/**
 * Attendance view — history, assumptions and recovery for one enrollment.
 *
 * All numbers come from the pure attendance module. Nothing here invents class
 * dates: recovery is expressed as a number of consecutive sessions the student
 * must attend, and the deadline is chosen by the student.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Banner, Button, Card, Chip, EmptyState, Field, KeyValueRow, Section, Status } from '../../ui/components.js';
import { colors, radius, spacing, type } from '../../ui/theme.js';
import { pendingBounds, statusLabel, summarizeAttendance } from '../../domain/attendance.js';
import { formatDate } from '../../domain/validation.js';
import AttendancePlanner from './AttendancePlanner.js';

const FILTERS = [
  { id: 'all', label: 'All sessions' },
  { id: 'present', label: 'Present' },
  { id: 'absent', label: 'Absent' },
  { id: 'pending', label: 'Pending' },
];

export function AttendanceView({ state, actions, enrollment, course, draft, onDraftChange, planTransferSlot }) {
  const [filter, setFilter] = useState('all');
  const [thresholdDraft, setThresholdDraft] = useState(String(state.preferences.attendanceThresholdPercent));
  const [thresholdError, setThresholdError] = useState(null);

  const sessions = useMemo(
    () =>
      state.attendanceSessions
        .filter((session) => session.enrollmentId === enrollment.id)
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date)),
    [state.attendanceSessions, enrollment.id],
  );

  const summary = useMemo(
    () => summarizeAttendance(sessions, state.preferences.attendanceThresholdPercent),
    [sessions, state.preferences.attendanceThresholdPercent],
  );
  const bounds = useMemo(() => pendingBounds(summary), [summary]);
  const status = statusLabel(summary);

  const filtered = sessions.filter((session) => filter === 'all' || session.presence === filter);

  const applyThreshold = () => {
    const result = actions.setThreshold(thresholdDraft);
    setThresholdError(result.ok ? null : result.errors.attendanceThresholdPercent);
  };

  return (
    <View>
      <Card tone={summary.status === 'below' ? 'danger' : summary.status === 'at-threshold' ? 'warn' : null}>
        <View style={styles.headRow}>
          <View style={{ flex: 1 }}>
            <Text style={type.metric}>{summary.percent == null ? 'No data' : `${summary.percent}%`}</Text>
            <Text style={type.caption}>
              {summary.present} present · {summary.absent} absent
              {summary.pending > 0 ? ` · ${summary.pending} pending` : ''} of ${summary.totalSessions} sessions
            </Text>
          </View>
          <Status label={status.label} tone={status.tone} />
        </View>

        {summary.held === 0 ? (
          <Banner
            label={
              summary.pending > 0
                ? 'Only pending entries exist, so no percentage can be calculated yet. The possible range is 0% to 100%.'
                : 'No session records have been published for this module. This is missing data, not 0% attendance.'
            }
            tone="info"
          />
        ) : (
          <View>
            <KeyValueRow label="Recorded sessions (H)" value={String(summary.held)} mono />
            <KeyValueRow label="Threshold setting" value={`${summary.thresholdPercent}%`} mono />
            <KeyValueRow
              label="Consecutive sessions to recover"
              value={summary.recoveryPossible ? String(summary.recoverySessions) : 'Not recoverable'}
              tone={summary.recoverySessions === 0 ? 'green700' : summary.recoverySessions > 0 ? 'red700' : undefined}
              mono
            />
            <KeyValueRow
              label="Absences still absorbable"
              value={summary.immediateAbsenceCapacity == null ? 'Unknown' : String(summary.immediateAbsenceCapacity)}
              mono
            />
            <Text style={[type.caption, { marginTop: spacing.xs }]}>
              {`Recovery = smallest x with (${summary.present}+x)/(${summary.held}+x) ≥ ${summary.thresholdPercent}%. Absence capacity = largest k with ${summary.present}/(${summary.held}+k) ≥ ${summary.thresholdPercent}% (comparisons are done in integers, so exact boundaries are not rounded away).`}
            </Text>
          </View>
        )}

        {summary.pending > 0 ? (
          <View style={styles.boundsBox}>
            <Text style={type.label}>Pending-record bounds</Text>
            <Text style={type.bodyMuted}>
              {`If every pending entry resolves as absent the result is ${bounds.lowerPercent}%; if all resolve as present it is ${bounds.upperPercent}%. This is a range, not a probability or an eligibility decision.`}
            </Text>
            <Text style={[type.caption, { marginTop: spacing.xs }]}>
              Future sessions never resolve an old pending entry.
            </Text>
          </View>
        ) : null}

        {summary.provisional && summary.held > 0 ? (
          <Status label="Provisional — pending records are excluded" tone="warn" style={{ marginTop: spacing.sm }} />
        ) : null}
      </Card>

      <Section title="Threshold setting" subtitle="Changes every attendance figure in the app and recalculates saved plans.">
        <Card>
          <View style={styles.thresholdRow}>
            <View style={{ flex: 1 }}>
              <Field
                label="Minimum attendance percent"
                value={thresholdDraft}
                onChangeText={setThresholdDraft}
                error={thresholdError}
                keyboardType="numeric"
                suffix="%"
                testID="threshold-input"
              />
            </View>
            <Button label="Apply" onPress={applyThreshold} style={{ marginTop: 20 }} />
          </View>
          <Text style={type.caption}>
            The 80% minimum comes from the 2025 prospectus extract. Weighting by session count is this project's stated convention.
          </Text>
        </Card>
      </Section>

      <AttendancePlanner
        state={state}
        actions={actions}
        enrollment={enrollment}
        course={course}
        summary={summary}
        sessions={sessions}
        draft={draft}
        onDraftChange={onDraftChange}
        planTransferSlot={planTransferSlot}
      />

      <Section title="Session history" subtitle="Synthetic records only.">
        <View style={styles.chipRow}>
          {FILTERS.map((option) => (
            <Chip key={option.id} label={option.label} selected={filter === option.id} onPress={() => setFilter(option.id)} />
          ))}
        </View>
        {filtered.length === 0 ? (
          <EmptyState
            icon="calendar-outline"
            title="No sessions in this filter"
            message="Try another filter, or load data from the Demo Data screen."
          />
        ) : (
          <Card>
            {filtered
              .slice()
              .reverse()
              .map((session, index) => (
                <View
                  key={session.id}
                  style={[styles.sessionRow, index > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={type.body}>{formatDate(session.date)}</Text>
                    <Text style={type.caption}>{`${session.durationHours}h${session.note ? ` · ${session.note}` : ''}`}</Text>
                  </View>
                  <Status
                    label={session.presence}
                    tone={session.presence === 'present' ? 'ok' : session.presence === 'absent' ? 'danger' : 'warn'}
                  />
                </View>
              ))}
          </Card>
        )}
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.sm },
  boundsBox: {
    marginTop: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.amber100,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.amber500,
  },
  thresholdRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.sm },
  sessionRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm },
});

export default AttendanceView;
