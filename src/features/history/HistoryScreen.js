/**
 * Academic history — transcript by term, cumulative GPA, exclusions and legend.
 *
 * Guardrails implemented here:
 *   - W and I rows are shown with their real grade and an explicit "excluded"
 *     word, never silently dropped. F/FA rows are shown as counted at 0 points,
 *     because hiding a fail would raise the GPA.
 *   - Repeat courses show which attempt feeds the CGPA instead of hiding the
 *     earlier attempt.
 *   - A term with no computable GPA reports "Not available" rather than 0.00.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  Banner,
  Card,
  Chip,
  Divider,
  EmptyState,
  Field,
  KeyValueRow,
  MetricTile,
  Section,
  Status,
} from '../../ui/components.js';
import { colors, spacing, type } from '../../ui/theme.js';
import {
  attemptsFromState,
  calculateCGPA,
  calculateSGPA,
  gradeLegend,
  isCountedGrade,
} from '../../domain/gpa.js';
import { GPA_POLICY } from '../../data/policies.js';
import { enrollmentName } from '../../domain/wording.js';
import { GpaTrendLineChart } from '../home/ChartSmoke.js';
import GpaPlanner from './GpaPlanner.js';

const CUTOFF_OPTIONS = [
  { label: 'Up to Spring 2025', termLabel: 'Spring 2025' },
  { label: 'Up to Fall 2025', termLabel: 'Fall 2025' },
  { label: 'Up to Fall 2026', termLabel: 'Fall 2026' },
];

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'counted', label: 'Counted only' },
  { id: 'excluded', label: 'Excluded only' },
  { id: 'repeats', label: 'Repeats' },
];

/** `Spring 2025` -> `Sp25`, for the dense chart axis. */
function shortTermLabel(label) {
  const match = /([A-Za-z]+)\s+(\d{4})/.exec(String(label || ''));
  return match ? `${match[1].slice(0, 2)}${match[2].slice(-2)}` : String(label || '');
}

function rowStatus(attempt) {
  const grade = attempt.grade == null ? null : String(attempt.grade).trim();
  if (attempt.nonCredit) return { label: 'Excluded (non-credit)', tone: 'neutral' };
  if (grade == null) return { label: 'No result yet', tone: 'info' };
  if (isCountedGrade(grade)) return { label: 'Counted', tone: 'ok' };
  if (grade === 'W') return { label: 'Withdrawn (W)', tone: 'warn' };
  if (grade === 'I') return { label: 'Incomplete (I)', tone: 'warn' };
  if (grade === 'FA' || grade === 'F') return { label: `Excluded (${grade})`, tone: 'danger' };
  if (grade === 'P') return { label: 'Excluded (P)', tone: 'neutral' };
  return { label: `Excluded (${grade})`, tone: 'neutral' };
}

export function HistoryScreen({ state, actions, openView }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');

  const semesters = useMemo(
    () => [...(state.semesters || [])].sort((a, b) => a.order - b.order),
    [state.semesters],
  );
  const attempts = useMemo(() => attemptsFromState(state), [state]);

  /* Cutoffs resolve against the stored term list so a renamed or missing term
     removes the option instead of pointing at the wrong term. */
  const cutoffs = useMemo(
    () =>
      CUTOFF_OPTIONS.map((option) => ({
        label: option.label,
        cutoffOrder: (semesters.find((s) => s.label === option.termLabel) || {}).order,
      })).filter((option) => Number.isFinite(option.cutoffOrder)),
    [semesters],
  );

  const defaultCutoff = cutoffs.length > 0 ? cutoffs[cutoffs.length - 1].cutoffOrder : semesters[semesters.length - 1]?.order ?? 0;
  const [cutoffChoice, setCutoffChoice] = useState(null);
  const cutoffOrder = cutoffChoice != null ? cutoffChoice : defaultCutoff;
  const cutoffLabel =
    (semesters.find((s) => s.order === cutoffOrder) || {}).label || `term order ${cutoffOrder}`;

  const cgpa = useMemo(() => calculateCGPA(attempts, cutoffOrder), [attempts, cutoffOrder]);
  const usedForCgpa = useMemo(() => new Set(cgpa.included.map((row) => row.attemptId)), [cgpa.included]);

  const repeatCourseIds = useMemo(() => {
    const termsPerCourse = new Map();
    attempts.forEach((attempt) => {
      if (!attempt.courseId) return;
      const orders = termsPerCourse.get(attempt.courseId) || new Set();
      orders.add(attempt.semesterOrder);
      termsPerCourse.set(attempt.courseId, orders);
    });
    return new Set([...termsPerCourse.entries()].filter(([, orders]) => orders.size > 1).map(([courseId]) => courseId));
  }, [attempts]);

  const courseById = useMemo(() => new Map((state.courses || []).map((c) => [c.id, c])), [state.courses]);

  /* Rows are built once, then filtered; every number is derived on render. */
  const rowsByTerm = useMemo(
    () =>
      semesters.map((semester) => {
        const termAttempts = attempts.filter((attempt) => attempt.semesterOrder === semester.order);
        const sgpa = calculateSGPA(termAttempts, { semesterOrder: semester.order });
        const cumulative = calculateCGPA(attempts, semester.order);
        return {
          semester,
          sgpa,
          cumulative,
          rows: termAttempts
            .slice()
            .sort((a, b) => String(a.courseCode).localeCompare(String(b.courseCode)))
            .map((attempt) => {
              const course = courseById.get(attempt.courseId);
              const status = rowStatus(attempt);
              return {
                attempt,
                id: attempt.id,
                code: attempt.courseCode || (course ? course.code : '—'),
                name: enrollmentName(attempt, course),
                credits: attempt.credits,
                gradeText: attempt.grade == null ? '—' : String(attempt.grade).trim(),
                status,
                isCounted: isCountedGrade(attempt.grade) && !attempt.nonCredit,
                isRepeat: repeatCourseIds.has(attempt.courseId),
                usedForCgpa: usedForCgpa.has(attempt.id),
              };
            }),
        };
      }),
    [semesters, attempts, repeatCourseIds, usedForCgpa, courseById],
  );

  const needle = String(query).trim().toLowerCase();
  const matches = (row) => {
    if (needle && !row.code.toLowerCase().includes(needle) && !row.name.toLowerCase().includes(needle)) return false;
    if (filter === 'counted') return row.isCounted;
    if (filter === 'excluded') return !row.isCounted;
    if (filter === 'repeats') return row.isRepeat;
    return true;
  };

  const labelMatches = (semester) => needle.length > 0 && String(semester.label).toLowerCase().includes(needle);
  const queryIsActive = needle.length > 0;

  /* A term with no rows at all is a fact about the dataset, not a row that a
     search filtered out, so it is shown - with its own empty state - in the
     default view and whenever the search text names the term. That keeps the
     record-free term in the transcript instead of silently dropping it, while
     a row filter still hides it exactly as it hides a term whose rows all fail
     the filter. */
  const visibleTerms = rowsByTerm
    .map((term) => {
      const visibleRows = term.rows.filter(matches);
      const recordFree = term.rows.length === 0;
      const show = recordFree
        ? labelMatches(term.semester) || (!queryIsActive && filter === 'all')
        : visibleRows.length > 0;
      return { ...term, visibleRows, show, recordFree };
    })
    .filter((term) => term.show);

  const trendTerms = useMemo(
    () => semesters.filter((semester) => attempts.some((attempt) => attempt.semesterOrder === semester.order)),
    [semesters, attempts],
  );

  /* Cumulative GPA per term. null is a gap, never 0. Per-term SGPA stays a
     figure on each transcript term rather than a second plotted series. */
  const trendPoints = useMemo(
    () =>
      trendTerms.map((semester) => {
        const cumulative = calculateCGPA(attempts, semester.order);
        return {
          label: shortTermLabel(semester.label),
          // null, never 0: a term with no computable cumulative GPA is a gap.
          value: cumulative.value == null ? null : cumulative.value,
          semesterLabel: semester.label,
        };
      }),
    [trendTerms, attempts],
  );

  const trendGaps = trendPoints.filter((point) => point.value == null);

  const legend = gradeLegend();

  return (
    <View>
      <Card>
        <Text style={type.metric}>{cgpa.value == null ? '—' : cgpa.value.toFixed(2)}</Text>
        <Text style={type.caption}>{`cumulative GPA up to ${cutoffLabel}`}</Text>
        <View style={styles.tileRow}>
          <MetricTile label="Counted credits" value={`${cgpa.includedCredits}`} caption="in the GPA denominator" />
          <MetricTile label="Counted attempts" value={`${cgpa.included.length}`} caption="latest attempt per course" />
        </View>
        <Text style={[type.caption, { marginTop: spacing.xs }]}>{GPA_POLICY.note}</Text>
      </Card>

      <Section title="Transcript" subtitle="One card per term, earliest first.">
        <Field
          label="Search by course code, course name or term"
          value={query}
          onChangeText={setQuery}
          placeholder="e.g. CS1102, Data Structures or Spring 2026"
          helper="Matches a course code or course name, and a term name so a term with no rows is still findable."
          testID="history-search"
        />
        <View style={styles.chipRow}>
          {FILTERS.map((entry) => (
            <Chip
              key={entry.id}
              label={entry.label}
              selected={filter === entry.id}
              onPress={() => setFilter(entry.id)}
              testID={`history-filter-${entry.id}`}
            />
          ))}
        </View>

        {visibleTerms.length === 0 ? (
          <EmptyState
            icon="search-outline"
            title="No transcript rows match"
            message={
              rowsByTerm.length === 0
                ? 'This dataset contains no terms to list, so the transcript is empty rather than zero.'
                : 'No term here has a row matching the current search or filter. Clear the search text or pick a different filter to see rows again.'
            }
          />
        ) : (
          visibleTerms.map(({ semester, sgpa, cumulative, visibleRows, recordFree }) => (
            <Card
              key={semester.id}
              title={semester.label}
              subtitle={`Term order ${semester.order} · ${semester.status}`}
            >
              {recordFree ? (
                <EmptyState
                  icon="file-tray-outline"
                  title="No results in this term"
                  message={`${semester.label} carries no enrollment records in this dataset, so there are no transcript rows to list. That is missing data, not a zero, and the term is shown rather than silently dropped.`}
                />
              ) : (
                visibleRows.map((row, index) => (
                  <View
                    key={row.id}
                    style={[styles.row, index > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}
                  >
                    <View style={styles.rowHead}>
                      <View style={{ flex: 1 }}>
                        <Text style={type.body}>{row.code}</Text>
                        <Text style={type.caption}>{row.name}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={type.metricSmall}>{row.gradeText}</Text>
                        <Text style={type.caption}>{`${row.credits} credits`}</Text>
                      </View>
                    </View>
                    <View style={styles.rowFoot}>
                      <Status label={row.status.label} tone={row.status.tone} />
                      {row.isRepeat ? (
                        <Chip
                          label="Repeat"
                          icon="repeat"
                          onPress={() => openView('course', { enrollmentId: row.id })}
                          testID={`history-repeat-${row.id}`}
                        />
                      ) : null}
                    </View>
                    {row.isRepeat ? (
                      <Text style={[type.caption, { marginTop: spacing.xs }]}>
                        {row.usedForCgpa
                          ? 'This is the attempt used for the CGPA up to the selected cutoff.'
                          : 'Not the attempt used for the CGPA at the selected cutoff.'}
                      </Text>
                    ) : null}
                  </View>
                ))
              )}

              <Divider />
              <KeyValueRow
                label="SGPA for this term"
                value={sgpa.value == null ? 'Not available' : sgpa.value.toFixed(2)}
                mono
              />
              <KeyValueRow label="Counted credits this term" value={`${sgpa.includedCredits}`} mono />
              <KeyValueRow
                label="Cumulative GPA through this term"
                value={cumulative.value == null ? 'Not available' : cumulative.value.toFixed(2)}
                mono
              />
              {sgpa.exclusions.length > 0 ? (
                <Text style={[type.caption, { marginTop: spacing.xs }]}>
                  {`${sgpa.exclusions.length} record(s) in this term are excluded from its SGPA. Reasons are listed under Exclusions below.`}
                </Text>
              ) : null}
            </Card>
          ))
        )}
      </Section>

      <Section title="CGPA cutoff" subtitle="Recomputed immediately; no value is stored.">
        {cutoffs.length === 0 ? (
          <Banner label="No term matches the demonstration cutoff options, so every term is included." tone="warn" />
        ) : (
          <>
            <View style={styles.chipRow}>
              {cutoffs.map((option) => (
                <Chip
                  key={option.label}
                  label={option.label}
                  selected={option.cutoffOrder === cutoffOrder}
                  onPress={() => setCutoffChoice(option.cutoffOrder)}
                  testID={`history-cutoff-${option.cutoffOrder}`}
                />
              ))}
            </View>
            <KeyValueRow label="Selected cutoff" value={cutoffLabel} />
            <KeyValueRow label="Counted attempts up to the cutoff" value={`${cgpa.included.length}`} mono />
            <KeyValueRow label="Counted credits up to the cutoff" value={`${cgpa.includedCredits}`} mono />
          </>
        )}
      </Section>

      <Section
        title="Cumulative GPA trend"
        subtitle="The GPA after each finalized term. Each term's own SGPA is listed in the transcript above."
      >
        <Card>
          <GpaTrendLineChart data={trendPoints} />
          {trendGaps.length > 0 ? (
            <View style={{ marginTop: spacing.sm }}>
              <Status
                label={`No cumulative GPA at: ${trendGaps.map((point) => point.semesterLabel).join(', ')}`}
                tone="warn"
              />
              <Text style={[type.caption, { marginTop: spacing.xs }]}>
                {'These terms carry no declared grade, so their cumulative GPA is reported as a gap rather than as a zero. The chart library plots an empty value at the axis origin, so read the plotted dip at these terms as "no data", not as a real drop.'}
              </Text>
            </View>
          ) : null}
        </Card>
      </Section>

      <Section title="Exclusions" subtitle="Why each record is outside the GPA.">
        {cgpa.exclusions.length === 0 ? (
          <EmptyState
            icon="checkmark-circle-outline"
            title="Nothing excluded"
            message="Every record up to the selected cutoff is counted toward the cumulative GPA."
          />
        ) : (
          <Card>
            {cgpa.exclusions.map((exclusion) => {
              const course = courseById.get(exclusion.courseId);
              return (
                <KeyValueRow
                  key={exclusion.id}
                  label={`${course ? course.code : exclusion.courseId || 'Unknown course'} · grade ${exclusion.grade == null ? '—' : exclusion.grade}`}
                  value={exclusion.reason}
                />
              );
            })}
          </Card>
        )}
      </Section>

      <Section title="Grade legend" subtitle="Counted grades carry points; the rest never enter the denominator.">
        <Card title="Counted toward GPA">
          {legend
            .filter((row) => row.counted)
            .map((row) => (
              <KeyValueRow key={`counted-${row.grade}`} label={row.grade} value={`${row.points} points per credit`} mono />
            ))}
        </Card>
        <Card title="Not counted">
          {legend
            .filter((row) => !row.counted)
            .map((row) => (
              <KeyValueRow key={`excluded-${row.grade}`} label={row.grade} value={row.note || 'Not counted'} />
            ))}
        </Card>
      </Section>

      <GpaPlanner state={state} attempts={attempts} cutoffOrder={cutoffOrder} />
    </View>
  );
}

const styles = StyleSheet.create({
  tileRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.sm },
  row: { paddingVertical: spacing.sm },
  rowHead: { flexDirection: 'row', alignItems: 'flex-start' },
  rowFoot: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: spacing.xs },
});

export default HistoryScreen;