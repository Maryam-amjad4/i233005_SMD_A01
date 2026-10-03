/**
 * GPA planner — explicit grade assumptions and their effect on cumulative GPA.
 *
 * Guardrails implemented here:
 *   - A numeric assessment score can never establish a grade, so nothing in this
 *     planner is inferred from marks; every grade is chosen explicitly.
 *   - The projection is computed by domain/gpa.js on a clone, so no transcript
 *     record is ever modified.
 *   - Current, projected and the signed delta are always three separate numbers,
 *     never a single blended score.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Banner, Button, Card, Chip, EmptyState, KeyValueRow, MetricTile, Section, Status } from '../../ui/components.js';
import { colors, radius, spacing, type } from '../../ui/theme.js';
import { gradePoints, isCountedGrade, projectGPA } from '../../domain/gpa.js';
import { assumptionEffectWording } from '../../domain/wording.js';

/** Offered assumption grades, filtered at render through isCountedGrade. */
const OFFERED_GRADES = ['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'D'];
const ASSUMED_LABEL = 'assuming your selected grades';

const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;

/** Latest attempt of a course, used as the baseline for an assumption. */
function latestAttempt(attemptList) {
  return attemptList.reduce(
    (best, attempt) =>
      !best || attempt.semesterOrder > best.semesterOrder ? attempt : best,
    null,
  );
}

export function GpaPlanner({ state, attempts, cutoffOrder }) {
  const [assumptions, setAssumptions] = useState([]);

  const cutoff = Number.isFinite(Number(cutoffOrder)) ? Number(cutoffOrder) : Infinity;
  const catalog = useMemo(() => new Map((state.courses || []).map((c) => [c.id, c])), [state.courses]);

  /* One revisable row per course id: latest attempt, catalogue credits. */
  const revisable = useMemo(() => {
    const groups = new Map();
    (attempts || []).forEach((attempt) => {
      if (!attempt || !attempt.courseId) return;
      groups.set(attempt.courseId, [...(groups.get(attempt.courseId) || []), attempt]);
    });
    return [...groups.entries()]
      .map(([courseId, list]) => {
        const latest = latestAttempt(list);
        const course = catalog.get(courseId);
        return {
          courseId,
          credits: Number(course?.credits ?? latest.credits) || 0,
          courseCode: latest.courseCode || course?.code || courseId,
          courseName: course?.name || latest.courseName || 'Unknown course',
          latestGrade: latest.grade ?? null,
          semesterOrder: latest.semesterOrder,
          hasCountedAttempt: list.some((attempt) => !attempt.nonCredit && isCountedGrade(attempt.grade)),
        };
      })
      .sort((a, b) => a.semesterOrder - b.semesterOrder || String(a.courseCode).localeCompare(String(b.courseCode)));
  }, [attempts, catalog]);

  const projection = useMemo(() => projectGPA(attempts || [], assumptions, cutoff), [attempts, assumptions, cutoff]);

  /**
   * What the calculator actually did with each assumption, keyed by course.
   *
   * This is the only admissible source for the effect wording: `projectGPA`
   * either replaces that course's latest attempt (`mode: 'replaced'`, so the
   * credits are counted) or adds a new hypothetical attempt (`mode: 'added'`).
   * Describing the effect from anything else is how the previous copy ended up
   * claiming a W/I assumption would not enlarge the denominator while the
   * calculator was replacing the record and counting its credits.
   */
  const appliedByCourse = useMemo(
    () => new Map(projection.applied.map((entry) => [entry.courseId, entry])),
    [projection.applied],
  );

  /** The attempt an assumption replaced, so the credit change can be compared. */
  const attemptById = useMemo(
    () => new Map((attempts || []).filter(Boolean).map((attempt) => [attempt.id, attempt])),
    [attempts],
  );

  function effectWording(entry, course) {
    const applied = appliedByCourse.get(entry.courseId);
    const previous = applied && applied.attemptId ? attemptById.get(applied.attemptId) : null;
    return assumptionEffectWording(course.courseCode, {
      mode: applied ? applied.mode : 'added',
      assumed: entry,
      previous,
    });
  }

  const setAssumption = (course, grade) => {
    setAssumptions((previous) => {
      const rest = previous.filter((entry) => entry.courseId !== course.courseId);
      if (!grade) return rest;
      return [
        ...rest,
        {
          courseId: course.courseId,
          grade,
          credits: course.credits,
          semesterOrder: course.semesterOrder,
        },
      ];
    });
  };

  const removeAssumption = (courseId) =>
    setAssumptions((previous) => previous.filter((entry) => entry.courseId !== courseId));

  const offered = OFFERED_GRADES.filter((grade) => isCountedGrade(grade));
  const baseline = projection.baseline;
  const projected = projection.projected;
  const delta = projection.delta;

  const deltaTone = delta == null || delta === 0 ? null : delta > 0 ? 'green700' : 'red700';
  const deltaWord = delta == null ? 'no comparison available' : delta > 0 ? 'increase' : delta < 0 ? 'decrease' : 'no change';
  const fmt = (value) => (value == null ? 'Not available' : value.toFixed(2));

  return (
    <Section
      title="Grade planner"
      subtitle="Assumptions are local to this screen. Every grade below is entered by you."
    >
      <Banner
        label="A numeric assessment score can never establish a grade, so nothing here is inferred from marks. Transcript records are never modified: the projection is calculated on a copy."
        tone="info"
      />

      <Card title="Assumed grades">
        {revisable.length === 0 ? (
          <EmptyState
            icon="school-outline"
            title="No courses to revisit"
            message="The transcript has no course records, so there is nothing to assume a grade for."
          />
        ) : (
          revisable.map((course) => {
            const current = assumptions.find((entry) => entry.courseId === course.courseId) || null;
            return (
              <View key={course.courseId} style={styles.courseBlock}>
                <Text style={type.body}>
                  {`${course.courseCode} · ${course.courseName}`}
                </Text>
                <Text style={type.caption}>
                  {`${course.credits} credits · latest recorded grade ${course.latestGrade == null ? '— (no result yet)' : course.latestGrade} · term order ${course.semesterOrder}`}
                </Text>
                {!course.hasCountedAttempt ? (
                  <View style={styles.retakeNote}>
                    <Status
                      label="No counted attempt (retake assumption)"
                      tone="warn"
                    />
                    <Text style={[type.caption, { marginTop: spacing.xs }]}>
                      A W, I or FA record carries no grade points, so it has no counted attempt today. Assuming a grade for it replaces that course's latest attempt rather than editing the transcript, and the catalogue credits then count in the denominator because a graded attempt is a counted attempt. An earlier finalized result for the same course is unaffected — this projection never clears it.
                    </Text>
                  </View>
                ) : null}
                <View style={styles.chipRow}>
                  {offered.map((grade) => (
                    <Chip
                      key={grade}
                      label={grade}
                      selected={current ? current.grade === grade : false}
                      onPress={() => setAssumption(course, current && current.grade === grade ? null : grade)}
                      testID={`gpa-planner-${course.courseId}-${grade}`}
                    />
                  ))}
                  <Chip
                    label="No change"
                    selected={!current}
                    onPress={() => setAssumption(course, null)}
                    icon="close-circle-outline"
                    testID={`gpa-planner-${course.courseId}-none`}
                  />
                </View>
              </View>
            );
          })
        )}
      </Card>

      <Card title="Projection" subtitle={Number.isFinite(cutoff) ? `Up to term order ${cutoff}` : 'All terms'}>
        <View style={styles.tileRow}>
          <MetricTile
            label="Current CGPA"
            value={fmt(baseline.value)}
            caption={`${baseline.includedCredits} counted credits`}
          />
          <MetricTile
            label="Projected CGPA"
            value={fmt(projected.value)}
            caption={Number.isFinite(cutoff) ? `${projected.includedCredits} counted credits` : 'All terms'}
            tone="teal600"
          />
          <MetricTile
            label="Change"
            value={delta == null ? '—' : `${delta > 0 ? '+' : ''}${round4(delta)}`}
            caption={deltaWord}
            tone={deltaTone}
          />
        </View>

        <KeyValueRow label="Baseline" value={`${baseline.includedCredits} counted credits`} mono />
        <KeyValueRow
          label="Projected denominator"
          value={projected.includedCredits == null ? 'Not available' : `${projected.includedCredits} counted credits`}
          mono
        />
        <Text style={[type.caption, { marginTop: spacing.xs }]}>
          {`The three numbers above stay separate: ${fmt(baseline.value)} is what the stored transcript gives today, ${fmt(projected.value)} is what it would give ${ASSUMED_LABEL}, and the change is the signed difference. They are never averaged into one score.`}
        </Text>
      </Card>

      <Card title="Current assumptions">
        {assumptions.length === 0 ? (
          <EmptyState
            icon="options-outline"
            title="No grade assumptions yet"
            message="A projection appears only once a grade is entered explicitly here. Nothing is inferred from assessment marks."
          />
        ) : (
          <View>
            {assumptions.map((entry) => {
              const course = revisable.find((row) => row.courseId === entry.courseId);
              const effect = effectWording(entry, course || { courseCode: entry.courseId });
              return (
                <View key={entry.courseId} style={styles.assumptionRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={type.body}>
                      {`${course ? course.courseCode : entry.courseId} → ${entry.grade}`}
                    </Text>
                    <Text style={type.caption}>
                      {`${entry.credits} credits · term order ${entry.semesterOrder} · ${effect.label} · ${gradePoints(entry.grade)} points per credit`}
                    </Text>
                    <Text style={[type.caption, { marginTop: spacing.xs }]}>{effect.text}</Text>
                  </View>
                  <Button
                    label="Remove"
                    variant="danger"
                    icon="trash-outline"
                    onPress={() => removeAssumption(entry.courseId)}
                    testID={`gpa-planner-remove-${entry.courseId}`}
                  />
                </View>
              );
            })}
            <Text style={[type.caption, { marginTop: spacing.sm }]}>{projection.note}</Text>
          </View>
        )}
      </Card>
    </Section>
  );
}

const styles = StyleSheet.create({
  tileRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.sm },
  courseBlock: {
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  retakeNote: {
    marginTop: spacing.xs,
    padding: spacing.sm,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.sm,
  },
  assumptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});

export default GpaPlanner;