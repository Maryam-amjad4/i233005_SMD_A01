/**
 * Marks view — assessment scheme, weighted points and class comparison.
 *
 * Units are labelled everywhere: raw marks out of an assessment maximum,
 * weighted points out of 100, and "performance within assessed weight" which is
 * NOT a final course score.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Banner, Card, Chip, EmptyState, KeyValueRow, ProgressBar, Section, Status } from '../../ui/components.js';
import { colors, spacing, type } from '../../ui/theme.js';
import { classComparison, summarizeMarks } from '../../domain/marks.js';
import { DEMO_GRADE_SCALE, predictDemoGrade } from '../../data/policies.js';
import { WeightDistributionBar } from '../home/ChartSmoke.js';

const STATUS_TONE = {
  published: 'ok',
  submitted: 'warn',
  scheduled: 'info',
  missed: 'danger',
};

const STATUS_LABEL = {
  published: 'Published',
  submitted: 'Submitted, not published',
  scheduled: 'Scheduled',
  missed: 'Missed (counts as zero)',
};

const CATEGORY_ORDER = ['Quiz', 'Assignment', 'Midterm', 'Project', 'Final', 'Other'];

export function MarksView({ state, enrollment, course, showDemoGrade }) {
  const [expandedId, setExpandedId] = useState(null);

  const assessments = useMemo(
    () =>
      state.assessments
        .filter((assessment) => assessment.enrollmentId === enrollment.id)
        .slice()
        .sort((a, b) => a.weightPercent - b.weightPercent),
    [state.assessments, enrollment.id],
  );
  const summary = useMemo(() => summarizeMarks(assessments), [assessments]);
  const comparisons = useMemo(() => classComparison(assessments), [assessments]);

  const byCategory = useMemo(() => {
    const map = new Map();
    assessments.forEach((assessment) => {
      const key = assessment.category || 'Other';
      map.set(key, [...(map.get(key) || []), assessment]);
    });
    return [...map.entries()].sort(
      (a, b) => (CATEGORY_ORDER.indexOf(a[0]) + 1 || 99) - (CATEGORY_ORDER.indexOf(b[0]) + 1 || 99),
    );
  }, [assessments]);

  if (assessments.length === 0) {
    return (
      <View>
        <Banner
          label="No assessment scheme has been published for this module, so marks features stay disabled."
          tone="info"
        />
        <EmptyState
          icon="document-text-outline"
          title="No marks available"
          message="Marks appear once a scheme exists. This is missing data, not a zero score."
        />
      </View>
    );
  }

  const fullyResolved = summary.schemeValid && summary.unresolvedWeight === 0 && summary.futureWeight === 0;
  const predicted = showDemoGrade && fullyResolved ? predictDemoGrade(summary.earnedPoints) : null;

  return (
    <View>
      <Card tone={summary.schemeValid ? null : 'warn'}>
        <View style={styles.headRow}>
          <View style={{ flex: 1 }}>
            <Text style={type.metric}>{summary.earnedPoints.toFixed(2)}</Text>
            <Text style={type.caption}>earned points out of 100</Text>
          </View>
          <Status
            label={summary.schemeValid ? 'Complete scheme' : `Scheme totals ${summary.totalWeight}%`}
            tone={summary.schemeValid ? 'ok' : 'warn'}
          />
        </View>

        <ProgressBar
          label={`Assessed weight (${summary.publishedWeight}% of 100%)`}
          valuePercent={summary.publishedWeight}
          tone={summary.unpublishedWeight > 0 ? 'warn' : 'ok'}
          caption="Published and missed assessments. Missed work counts as zero inside this weight."
        />
        <ProgressBar
          label="Unresolved weight (submitted, not published)"
          valuePercent={summary.unresolvedWeight}
          tone="warn"
          caption="Unresolved is not zero — nobody has published these results yet."
        />
        <ProgressBar label="Scheduled weight (future work)" valuePercent={summary.futureWeight} tone="teal" />

        <KeyValueRow
          label="Performance within assessed weight"
          value={summary.assessedPerformance == null ? '—' : `${summary.assessedPerformance}%`}
          mono
        />
        <Text style={[type.caption, { marginTop: spacing.xs }]}>
          {`${summary.assessedPerformance ?? '—'}% is the result inside the ${summary.publishedWeight}% assessed weight. It is not a final course score; the course result is only meaningful once all ${summary.totalWeight}% of weight is resolved.`}
        </Text>

        {showDemoGrade ? (
          <View style={{ marginTop: spacing.sm }}>
            {predicted ? (
              <>
                <Status label={`Demonstration scale would predict grade ${predicted}`} tone="info" />
                <Text style={[type.caption, { marginTop: spacing.xs }]}>
                  {`${DEMO_GRADE_SCALE.label}. This scale is an opt-in demonstration setting and is never applied automatically. Every weight in the scheme is resolved, so the assessed result is the whole course result here.`}
                </Text>
              </>
            ) : (
              <>
                {/*
                  Predicting a grade from partial weight would turn missing data
                  into a confident result: 8/10 on the only published assessment,
                  with 80% of the scheme unresolved, must not be reported as an F.
                */}
                <Status label="Demonstration grade not predictable yet" tone="neutral" />
                <Text style={[type.caption, { marginTop: spacing.xs }]}>
                  {`${DEMO_GRADE_SCALE.label}. The scale is applied only when the whole scheme is resolved. Right now ${summary.unresolvedWeight}% of the weight is unresolved and ${summary.futureWeight}% is still scheduled, so a grade from these numbers would be a guess presented as a result.`}
                </Text>
              </>
            )}
          </View>
        ) : null}

        <View style={{ marginTop: spacing.md }}>
          <WeightDistributionBar
            segments={[
              { label: 'Assessed', value: summary.publishedWeight, color: colors.teal500 },
              { label: 'Unresolved', value: summary.unresolvedWeight, color: colors.amber500 },
              { label: 'Scheduled', value: summary.futureWeight, color: colors.borderStrong },
            ]}
          />
        </View>

        {summary.errors.length > 0 ? (
          <Banner label={summary.errors.join(' ')} tone="warn" style={{ marginTop: spacing.sm }} />
        ) : null}
      </Card>

      <Section title="Assessments by category">
        {byCategory.map(([category, items]) => (
          <Card key={category} title={`${category} · ${items.reduce((sum, item) => sum + item.weightPercent, 0)}% of the scheme`}>
            {items.map((assessment, index) => {
              const item = summary.items.find((entry) => entry.id === assessment.id);
              const expanded = expandedId === assessment.id;
              return (
                <View key={assessment.id} style={[styles.assessmentRow, index > 0 && { borderTopWidth: 1, borderTopColor: colors.border }]}>
                  <View style={styles.assessmentHead}>
                    <View style={{ flex: 1 }}>
                      <Text style={type.body}>{assessment.title}</Text>
                      <Text style={type.caption}>
                        {`${assessment.weightPercent}% of the final result · out of ${assessment.maxMarks}`}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={type.metricSmall}>
                        {item?.hasContribution ? `${item.contribution}` : '—'}
                      </Text>
                      <Text style={type.caption}>points</Text>
                    </View>
                  </View>
                  <View style={styles.assessmentFoot}>
                    <Status label={STATUS_LABEL[assessment.status] || assessment.status} tone={STATUS_TONE[assessment.status] || 'neutral'} />
                    <Chip
                      label={expanded ? 'Hide detail' : 'Detail'}
                      onPress={() => setExpandedId(expanded ? null : assessment.id)}
                    />
                  </View>
                  {expanded ? (
                    <View style={styles.detailBox}>
                      <KeyValueRow label="Raw marks" value={item?.hasContribution || assessment.status !== 'missed' ? `${assessment.obtainedMarks ?? '—'} / ${assessment.maxMarks}` : `0 / ${assessment.maxMarks}`} mono />
                      <KeyValueRow label="Weighted contribution" value={item?.hasContribution ? `${item.contribution} points` : 'Unresolved'} mono />
                      <KeyValueRow
                        label="Class mean (same component)"
                        value={assessment.classMeanRaw == null ? 'Not reported' : String(assessment.classMeanRaw)}
                        mono
                      />
                      <Text style={[type.caption, { marginTop: spacing.xs }]}>
                        {`Contribution = ${assessment.weightPercent}% × raw/${assessment.maxMarks}. A class mean only describes the same assessment unit; no rank or percentile is derived from it.`}
                      </Text>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </Card>
        ))}
      </Section>

      <Section title="Class comparison" subtitle="Matching assessment units only.">
        {comparisons.length === 0 ? (
          <EmptyState
            icon="people-outline"
            title="No comparable class data"
            message="The class mean is available only where the same assessment unit reported one."
          />
        ) : (
          <Card>
            {comparisons.map((row) => (
              <KeyValueRow
                key={row.id}
                label={row.title}
                value={`You ${row.obtainedMarks} / class mean ${row.classMeanRaw} (${row.difference >= 0 ? '+' : ''}${row.difference})`}
                mono
                tone={row.difference >= 0 ? 'green700' : 'red700'}
              />
            ))}
          </Card>
        )}
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.sm },
  assessmentRow: { paddingVertical: spacing.sm },
  assessmentHead: { flexDirection: 'row', alignItems: 'flex-start' },
  assessmentFoot: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xs, flexWrap: 'wrap' },
  detailBox: {
    marginTop: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 10,
  },
});

export default MarksView;
