/**
 * Home — academic dashboard.
 *
 * Everything on this screen is derived from the shared dataset, so a change in
 * attendance, marks or a task is reflected here immediately. The screen renders
 * two different chart-kit chart types (bar for attendance, line for the GPA
 * trend), the explainable attention list, the semester selector, search and the
 * shortcut grid.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import {
  Banner,
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  KeyValueRow,
  MetricTile,
  Section,
  SectionTitle,
  Status,
} from '../../ui/components.js';
import { colors, spacing, type } from '../../ui/theme.js';
import { summarizeAttendance, statusLabel } from '../../domain/attendance.js';
import { summarizeMarks } from '../../domain/marks.js';
import { attemptsFromState, calculateCGPA } from '../../domain/gpa.js';
import { buildAttentionItems } from '../../domain/attention.js';
import { formatDate } from '../../domain/validation.js';
import { AttendanceBarChart, GpaTrendLineChart } from './ChartSmoke.js';

/**
 * Shortcut grid definition. `pinned` items are listed first. This is the single
 * source of truth for the shortcuts a student may pin: the Profile screen
 * imports it so the two screens cannot drift apart.
 */
export const SHORTCUTS = [
  { id: 'courses', label: 'Courses', icon: 'albums', view: 'courses', group: 'Academic' },
  { id: 'history', label: 'Academic history', icon: 'ribbon', view: 'history', group: 'Academic' },
  { id: 'tasks', label: 'Tasks', icon: 'checkbox', view: 'tasks', group: 'Planning' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar', view: 'calendar', group: 'Planning' },
  { id: 'scenarios', label: 'Saved plans', icon: 'git-compare', view: 'scenarios', group: 'Planning' },
  { id: 'finance', label: 'Finance', icon: 'wallet', view: 'finance', group: 'Services' },
  { id: 'profile', label: 'Profile', icon: 'person', view: 'profile', group: 'Services' },
  { id: 'demo', label: 'Demo data', icon: 'flask', view: 'demo', group: 'Services' },
];

const ATTENTION_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'urgent', label: 'Urgent' },
  { id: 'warning', label: 'Warnings' },
  { id: 'missing', label: 'Missing data' },
];

/**
 * The one true statement about where pinning lives. Home and Profile both render
 * this exact string, so neither can give the other's instruction the lie.
 */
export const PINNING_LOCATION_NOTE =
  'Pinning is a local preference managed on the Profile screen. Pinned areas are listed first within their group on the Home shortcut grid.';

/** How many attention items are shown before the user expands the list. */
export const ATTENTION_PREVIEW_COUNT = 8;

export function HomeScreen({ state, actions, openView }) {
  const [attentionFilter, setAttentionFilter] = useState('all');
  const [attentionExpanded, setAttentionExpanded] = useState(false);
  const [query, setQuery] = useState('');

  const selectedSemester = state.semesters.find((s) => s.id === state.preferences.selectedSemesterId) || state.semesters[0];
  const courseById = useMemo(() => new Map(state.courses.map((c) => [c.id, c])), [state.courses]);

  const enrollments = useMemo(
    () => state.enrollments.filter((e) => e.semesterId === selectedSemester.id && e.status !== 'withdrawn'),
    [state.enrollments, selectedSemester.id],
  );

  /* ---- per-course summaries shared by the cards and the charts */
  const rows = useMemo(
    () =>
      enrollments.map((enrollment) => {
        const course = courseById.get(enrollment.courseId);
        const attendance = summarizeAttendance(
          state.attendanceSessions.filter((s) => s.enrollmentId === enrollment.id),
          state.preferences.attendanceThresholdPercent,
        );
        const marks = summarizeMarks(state.assessments.filter((a) => a.enrollmentId === enrollment.id));
        return {
          enrollment,
          course,
          attendance,
          marks,
          label: course ? course.code : enrollment.courseId,
        };
      }),
    [enrollments, courseById, state.attendanceSessions, state.assessments, state.preferences.attendanceThresholdPercent],
  );

  /* ---- summary metrics */
  const credits = rows.reduce((sum, row) => sum + (row.course?.credits || 0), 0);
  const belowThreshold = rows.filter((row) => row.attendance.status === 'below');
  const provisional = rows.filter((row) => row.attendance.provisional);
  const earnedPoints = rows.reduce((sum, row) => sum + row.marks.earnedPoints, 0);

  const attempts = useMemo(() => attemptsFromState(state), [state]);
  const currentOrder = state.semesters.find((s) => s.status === 'current')?.order ?? 0;
  const cgpa = useMemo(() => calculateCGPA(attempts, currentOrder), [attempts, currentOrder]);

  const attention = useMemo(() => buildAttentionItems(state), [state]);
  const filteredAttention = attention.filter((item) => {
    if (attentionFilter === 'urgent') return item.severity === 'urgent';
    if (attentionFilter === 'warning') return item.severity === 'warning';
    if (attentionFilter === 'missing') return !!item.missingData;
    return true;
  });

  const overdueTasks = state.tasks.filter((task) => !task.completed && task.dueDate < state.demoDate).length;
  const unpaid = state.fees.flatMap((fee) => fee.challans.filter((c) => c.status === 'unpaid'));

  /* ---- search results are labelled by record kind */
  const searchResults = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return [];
    const courses = state.courses
      .filter((course) => `${course.code} ${course.name}`.toLowerCase().includes(term))
      .map((course) => ({ id: course.id, kind: 'Course', label: `${course.code} · ${course.name}`, view: 'courses' }));
    const modules = rows
      .filter((row) => `${row.label} ${row.course?.name || ''}`.toLowerCase().includes(term))
      .map((row) => ({
        id: row.enrollment.id,
        kind: 'Module',
        label: `${row.label} · ${row.course?.name || 'Unknown course'}`,
        view: 'course',
        params: { enrollmentId: row.enrollment.id, section: 'attendance' },
      }));
    return [...courses, ...modules];
  }, [query, state.courses, rows]);

  const barData = rows
    .filter((row) => row.attendance.percent != null)
    .map((row) => ({ label: row.label, value: row.attendance.percent }));

  const gpaTrend = state.semesters
    .filter((semester) => semester.hasRecords)
    .map((semester) => {
      const value = calculateCGPA(attempts, semester.order);
      return { label: semester.label.replace(/\s\d{4}$/, ` '${semester.label.slice(-2)}`), value: value.value };
    });

  const pins = state.preferences.pins || [];
  /**
   * Grouped so the grid reads as academic / planning / services rather than as
   * one flat list. Pinned items float to the top of their own group, and groups
   * keep a fixed order so the layout does not jump when a pin is toggled.
   */
  const SHORTCUT_GROUPS = ['Academic', 'Planning', 'Services'];
  const groupedShortcuts = SHORTCUT_GROUPS.map((group) => ({
    group,
    items: [
      ...SHORTCUTS.filter((s) => s.group === group && pins.includes(s.id)),
      ...SHORTCUTS.filter((s) => s.group === group && !pins.includes(s.id)),
    ],
  })).filter((entry) => entry.items.length > 0);

  return (
    <View>
      <Card>
        <SectionTitle>Term selector</SectionTitle>
        <Text style={[type.caption, { marginBottom: spacing.sm }]}>
          {`All figures below belong to the selected term. Demo date: ${formatDate(state.demoDate)}.`}
        </Text>
        <View style={styles.chipRow}>
          {state.semesters.map((semester) => (
            <Chip
              key={semester.id}
              label={semester.label}
              selected={semester.id === selectedSemester.id}
              onPress={() => actions.setSemester(semester.id)}
            />
          ))}
        </View>
        <Status
          label={selectedSemester.status === 'current' ? 'Current term' : selectedSemester.status}
          tone={selectedSemester.status === 'current' ? 'ok' : 'neutral'}
        />
      </Card>

      {enrollments.length === 0 ? (
        <EmptyState
          icon="albums-outline"
          title={`No modules enrolled in ${selectedSemester.label}`}
          message="This term has no enrollment records in the dataset, so attendance, marks and charts are empty rather than zero."
          actionLabel="Switch to the current term"
          onAction={() => actions.setSemester(state.semesters.find((s) => s.status === 'current').id)}
        />
      ) : (
        <>
          <Section title="Term summary">
            <View style={styles.tileRow}>
              <MetricTile label="Modules" value={String(enrollments.length)} caption={`${credits} credits`} />
              <MetricTile
                label="Below threshold"
                value={String(belowThreshold.length)}
                caption={`at ${state.preferences.attendanceThresholdPercent}%`}
                tone={belowThreshold.length ? 'red700' : 'green700'}
              />
            </View>
            <View style={[styles.tileRow, { marginTop: spacing.sm }]}>
              <MetricTile label="Earned points" value={earnedPoints.toFixed(1)} caption="out of 100 per course" />
              <MetricTile
                label="Provisional"
                value={String(provisional.length)}
                caption="courses with pending records"
                tone={provisional.length ? 'amber700' : undefined}
              />
            </View>
            <View style={[styles.tileRow, { marginTop: spacing.sm }]}>
              <MetricTile
                label="CGPA"
                value={cgpa.value == null ? 'n/a' : cgpa.value.toFixed(2)}
                caption="finalized attempts only"
              />
              <MetricTile
                label="Open items"
                value={`${belowThreshold.length + overdueTasks}`}
                caption={`${overdueTasks} overdue task${overdueTasks === 1 ? '' : 's'}`}
              />
            </View>
          </Section>

          <Section title="Needs attention" subtitle="Each item states its reason and opens the place it came from.">
            <View style={styles.chipRow}>
              {ATTENTION_FILTERS.map((filter) => (
                <Chip
                  key={filter.id}
                  label={filter.label}
                  selected={attentionFilter === filter.id}
                  onPress={() => setAttentionFilter(filter.id)}
                />
              ))}
            </View>
            {filteredAttention.length === 0 ? (
              <EmptyState
                icon="checkmark-done-outline"
                title="Nothing in this filter"
                message="Change the filter or the demo data to see items appear again."
              />
            ) : (
              (attentionExpanded ? filteredAttention : filteredAttention.slice(0, ATTENTION_PREVIEW_COUNT)).map((item) => (
                <Card
                  key={item.id}
                  testID={`attention-item-${item.id}`}
                  tone={item.severity === 'urgent' ? 'danger' : item.severity === 'warning' ? 'warn' : null}
                  onPress={() => openView(item.view, item.params || {})}
                  title={item.title}
                  subtitle={item.reason}
                  right={<Status label={item.severity} tone={item.severity === 'urgent' ? 'danger' : item.severity === 'warning' ? 'warn' : 'info'} />}
                >
                  <Text style={[type.caption, { marginTop: -spacing.xs }]}>{item.action}</Text>
                </Card>
              ))
            )}
            {filteredAttention.length > ATTENTION_PREVIEW_COUNT ? (
              <Button
                label={
                  attentionExpanded
                    ? `Show fewer (${ATTENTION_PREVIEW_COUNT} of ${filteredAttention.length})`
                    : `Show all ${filteredAttention.length} items`
                }
                variant="secondary"
                icon={attentionExpanded ? 'chevron-up' : 'chevron-down'}
                testID="attention-expand-toggle"
                onPress={() => setAttentionExpanded((previous) => !previous)}
              />
            ) : null}
          </Section>

          <Section title="Attendance by module" subtitle="Chart type 1 of 2 — bar chart (react-native-chart-kit).">
            <Card>
              <AttendanceBarChart
                data={barData}
                thresholdPercent={state.preferences.attendanceThresholdPercent}
              />
            </Card>
          </Section>

          <Section title="GPA trend" subtitle="Chart type 2 of 2 — line chart (react-native-chart-kit).">
            <Card>
              <GpaTrendLineChart data={gpaTrend} />
            </Card>
          </Section>

          <Section title="Module standings">
            <Card>
              {rows.map((row) => {
                const status = statusLabel(row.attendance);
                return (
                  <View key={row.enrollment.id}>
                    <View style={styles.standingsRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={type.cardTitle}>{row.label}</Text>
                        <Text style={type.caption}>{row.course?.name || 'Unknown course'}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={type.metricSmall}>
                          {row.attendance.percent == null ? '—' : `${row.attendance.percent}%`}
                        </Text>
                        <Status label={status.label} tone={status.tone} />
                      </View>
                    </View>
                    <KeyValueRow
                      label="Earned points"
                      value={
                        row.marks.assessmentCount === 0
                          ? 'No scheme'
                          : `${row.marks.earnedPoints} / 100 assessed on ${row.marks.publishedWeight}%`
                      }
                    />
                    <Divider style={{ marginVertical: spacing.sm }} />
                  </View>
                );
              })}
            </Card>
          </Section>
        </>
      )}

      <Section title="Search" subtitle="Finds catalogue courses and modules in the selected term.">
        <View style={styles.searchWrap}>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search by code or name…"
            placeholderTextColor={colors.inkFaint}
            accessibilityLabel="Search courses and modules"
            autoCapitalize="none"
          />
          {query ? <Button label="Clear" variant="ghost" onPress={() => setQuery('')} /> : null}
        </View>
        {query && searchResults.length === 0 ? (
          <Text style={type.caption}>No course or module matches “{query}”.</Text>
        ) : null}
        {searchResults.slice(0, 8).map((result) => (
          <Card
            key={`${result.kind}-${result.id}`}
            onPress={() => openView(result.view, result.params || {})}
            title={result.label}
            subtitle={result.kind}
            right={<Button label="Open" variant="secondary" onPress={() => openView(result.view, result.params || {})} />}
          />
        ))}
      </Section>

      <Section title="My shortcuts" subtitle={PINNING_LOCATION_NOTE}>
        {groupedShortcuts.map((entry) => (
          <View key={entry.group} style={styles.shortcutGroup}>
            <Text style={styles.shortcutGroupLabel}>{entry.group}</Text>
            <View style={styles.shortcutGrid}>
              {entry.items.map((shortcut) => (
                <View key={shortcut.id} style={styles.shortcutCell}>
                  <Button
                    label={shortcut.label}
                    icon={shortcut.icon}
                    variant={pins.includes(shortcut.id) ? 'primary' : 'secondary'}
                    onPress={() => openView(shortcut.view)}
                    style={{ width: '100%' }}
                  />
                </View>
              ))}
            </View>
          </View>
        ))}
      </Section>

      {unpaid.length > 0 ? (
        <Banner
          label={`${unpaid.length} synthetic challan${unpaid.length === 1 ? '' : 's'} unpaid. Flex++ never takes a payment.`}
          tone="warn"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  tileRow: { flexDirection: 'row', gap: spacing.sm },
  standingsRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  searchInput: {
    flex: 1,
    minHeight: 46,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
  shortcutGroup: { marginBottom: spacing.md },
  shortcutGroupLabel: { ...type.label, color: colors.inkMuted, marginBottom: spacing.xs },
  shortcutGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  shortcutCell: { width: '48%', flexGrow: 1 },
});

export default HomeScreen;
