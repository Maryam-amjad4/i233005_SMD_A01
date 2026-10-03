/**
 * Courses — searchable, filterable, sortable list of enrolled modules.
 *
 * The list is generated from the dataset (enrollments joined to the catalogue),
 * which is the "data-driven UI" requirement: adding a course in the Demo Data
 * screen adds a row here automatically.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Banner, Button, Card, Chip, EmptyState, Status } from '../../ui/components.js';
import { colors, spacing, type } from '../../ui/theme.js';
import { summarizeAttendance, statusLabel } from '../../domain/attendance.js';
import { summarizeMarks } from '../../domain/marks.js';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'below', label: 'Below threshold' },
  { id: 'attention', label: 'Needs attention' },
  { id: 'marks', label: 'Has marks' },
  { id: 'empty', label: 'No data' },
];

const SORTS = [
  { id: 'code', label: 'Code' },
  { id: 'attendance', label: 'Attendance (low first)' },
  { id: 'marks', label: 'Earned points (low first)' },
  { id: 'name', label: 'Name' },
];

export function CoursesScreen({ state, actions, openView }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('code');

  const selectedSemesterId = state.preferences.selectedSemesterId;
  const courseById = useMemo(() => new Map(state.courses.map((c) => [c.id, c])), [state.courses]);

  const rows = useMemo(() => {
    const threshold = state.preferences.attendanceThresholdPercent;
    return state.enrollments
      .filter((e) => e.semesterId === selectedSemesterId && e.status !== 'withdrawn')
      .map((enrollment) => {
        const course = courseById.get(enrollment.courseId);
        const attendance = summarizeAttendance(
          state.attendanceSessions.filter((s) => s.enrollmentId === enrollment.id),
          threshold,
        );
        const marks = summarizeMarks(state.assessments.filter((a) => a.enrollmentId === enrollment.id));
        const lab = course?.linkedLabId ? courseById.get(course.linkedLabId) : null;
        return { enrollment, course, attendance, marks, lab };
      });
  }, [state.enrollments, state.attendanceSessions, state.assessments, courseById, selectedSemesterId, state.preferences.attendanceThresholdPercent]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    let list = rows.filter((row) => {
      const haystack = `${row.course?.code || ''} ${row.course?.name || ''}`.toLowerCase();
      if (term && !haystack.includes(term)) return false;
      if (filter === 'below') return row.attendance.status === 'below';
      if (filter === 'attention') {
        return row.attendance.status === 'below' || row.attendance.pending > 0 || row.marks.missedCount > 0;
      }
      if (filter === 'marks') return row.marks.assessmentCount > 0;
      if (filter === 'empty') return row.attendance.status === 'no-data' || row.marks.assessmentCount === 0;
      return true;
    });

    list = [...list];
    if (sort === 'code') list.sort((a, b) => String(a.course?.code || '').localeCompare(String(b.course?.code || '')));
    if (sort === 'name') list.sort((a, b) => String(a.course?.name || '').localeCompare(String(b.course?.name || '')));
    if (sort === 'attendance') list.sort((a, b) => (a.attendance.percent ?? 101) - (b.attendance.percent ?? 101));
    if (sort === 'marks') list.sort((a, b) => a.marks.earnedPoints - b.marks.earnedPoints);
    return list;
  }, [rows, query, filter, sort]);

  return (
    <View>
      <Banner
        label={`Showing ${filtered.length} of ${rows.length} enrolled modules in the selected term. Tap a module to open its workspace.`}
        tone="info"
      />

      <View style={styles.searchWrap}>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search by code or name…"
          placeholderTextColor={colors.inkFaint}
          accessibilityLabel="Search modules"
          autoCapitalize="none"
        />
        {query ? <Button label="Clear" variant="ghost" onPress={() => setQuery('')} /> : null}
      </View>

      <Text style={[type.label, { marginBottom: spacing.xs }]}>Filter</Text>
      <View style={styles.chipRow}>
        {FILTERS.map((option) => (
          <Chip key={option.id} label={option.label} selected={filter === option.id} onPress={() => setFilter(option.id)} />
        ))}
      </View>

      <Text style={[type.label, { marginBottom: spacing.xs }]}>Sort by</Text>
      <View style={styles.chipRow}>
        {SORTS.map((option) => (
          <Chip key={option.id} label={option.label} selected={sort === option.id} onPress={() => setSort(option.id)} />
        ))}
      </View>

      {filtered.length === 0 ? (
        <EmptyState
          icon="search-outline"
          title="No modules match"
          message="Change the search text or the filter, or add a course from the Demo Data screen."
          actionLabel="Reset filters"
          onAction={() => {
            setQuery('');
            setFilter('all');
          }}
        />
      ) : (
        filtered.map((row) => {
          const status = statusLabel(row.attendance);
          return (
            <Card
              key={row.enrollment.id}
              onPress={() => openView('course', { enrollmentId: row.enrollment.id, section: 'attendance' })}
              title={`${row.course?.code || '—'} · ${row.course?.name || 'Unknown course'}`}
              subtitle={`${row.course?.credits ?? 0} credits · section ${row.enrollment.section}${row.lab ? ` · lab ${row.lab.code}` : ''}`}
              right={
                <Status
                  label={row.attendance.percent == null ? 'No data' : `${row.attendance.percent}%`}
                  tone={status.tone}
                />
              }
            >
              <Text style={type.caption}>
                {row.marks.assessmentCount === 0
                  ? 'No assessment scheme published for this module.'
                  : `Earned ${row.marks.earnedPoints} of 100 points from ${row.marks.publishedWeight}% assessed weight.`}
              </Text>
            </Card>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.sm },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md },
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
});

export default CoursesScreen;
