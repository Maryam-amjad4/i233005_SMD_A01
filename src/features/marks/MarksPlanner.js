/**
 * Marks planner — target calculator and individual hypothetical score entry.
 *
 * Guardrails implemented here:
 *   - Every number on screen is derived from the current inputs on each render.
 *     An invalid entry therefore clears a previously valid result instead of
 *     leaving a stale projection visible.
 *   - A combined requirement (unpublished AND future weight) is never described
 *     as a required final-examination mark.
 *   - Hypothetical marks are validated against that assessment's own maxMarks,
 *     and the projection lists exactly what was applied.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Banner, Card, Chip, Divider, EmptyState, Field, KeyValueRow, Section, Status } from '../../ui/components.js';
import { colors, radius, spacing, type } from '../../ui/theme.js';
import { calculateTarget, projectMarks, summarizeMarks } from '../../domain/marks.js';
import { isCountedGrade } from '../../domain/gpa.js';
import { validateRawMarks, validateTargetPoints } from '../../domain/validation.js';

/** Fallback used when the planner is mounted without a CourseScreen-owned draft. */
const EMPTY_DRAFT = {
  targetPoints: '',
  hypotheticalRaw: {},
  grade: null,
};

/** Grades a student would realistically enter as an assumption (F/FA are not goals). */
const GRADE_CHOICES = ['A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'D'];

const TARGET_LABEL = {
  achievable: { label: 'Reachable', tone: 'ok' },
  unattainable: { label: 'Out of reach', tone: 'danger' },
  'already-secured': { label: 'Already secured', tone: 'ok' },
  'not-achieved': { label: 'Not reached', tone: 'warn' },
  'scheme-invalid': { label: 'Target unavailable', tone: 'warn' },
  'invalid-target': { label: 'Invalid target', tone: 'danger' },
};

const TARGET_TONE_FALLBACK = { label: 'No status', tone: 'neutral' };

/** Word + tone for a `calculateTarget` status, exported for reuse in tests and views. */
export function marksTargetLabel(status) {
  return TARGET_LABEL[status] || TARGET_TONE_FALLBACK;
}

const OPEN_STATUSES = ['submitted', 'scheduled'];
const STATUS_LABEL = {
  submitted: 'Submitted, not published',
  scheduled: 'Scheduled',
};

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

export function MarksPlanner({ state, enrollment, course, draft, onDraftChange, planTransferSlot }) {
  // Standalone fallback: when no CourseScreen owner supplies a draft, the planner
  // keeps its own inputs. In the app CourseScreen always passes the draft, so the
  // target and what-if inputs survive a section switch; this only serves direct
  // mounts/tests. The explicit grade assumption is a separate field.
  const [localDraft, setLocalDraft] = useState(() => ({ targetPoints: '', hypotheticalRaw: {}, grade: null }));
  const controlled = typeof onDraftChange === 'function';
  const inputs = controlled ? draft || EMPTY_DRAFT : localDraft;
  const update = controlled ? onDraftChange : (patch) => setLocalDraft((previous) => ({ ...previous, ...patch }));
  const targetInput = inputs.targetPoints ?? '';
  const hypothetical = inputs.hypotheticalRaw || {};
  const grade = inputs.grade;

  const assessments = useMemo(
    () =>
      state.assessments
        .filter((assessment) => assessment.enrollmentId === enrollment.id)
        .slice()
        .sort((a, b) => a.weightPercent - b.weightPercent),
    [state.assessments, enrollment.id],
  );
  const summary = useMemo(() => summarizeMarks(assessments), [assessments]);

  /* Only unresolved (submitted) and future (scheduled) work can be assumed. */
  const open = useMemo(
    () => assessments.filter((assessment) => OPEN_STATUSES.includes(assessment.status)),
    [assessments],
  );

  const hypotheticalRaw = useMemo(() => {
    const map = {};
    open.forEach((assessment) => {
      const value = String(hypothetical[assessment.id] ?? '').trim();
      if (value) map[assessment.id] = value;
    });
    return map;
  }, [open, hypothetical]);

  const projection = useMemo(() => projectMarks(assessments, hypotheticalRaw), [assessments, hypotheticalRaw]);

  const targetBlank = String(targetInput).trim() === '';
  /* calculateTarget validates the raw string itself, so bad input is reported by status. */
  const target = targetBlank ? null : calculateTarget(summary, targetInput);
  const targetCheck = targetBlank ? null : validateTargetPoints(targetInput, { label: 'Target score (out of 100)' });
  const targetValue = targetCheck && targetCheck.ok ? targetCheck.value : null;

  /* Per-field errors. A non-empty value must satisfy validateRawMarks. */
  const fieldErrors = {};
  open.forEach((assessment) => {
    const value = String(hypothetical[assessment.id] ?? '').trim();
    if (!value) return;
    const check = validateRawMarks(value, Number(assessment.maxMarks), { label: `${assessment.title} marks` });
    if (!check.ok) fieldErrors[assessment.id] = check.error;
    else if (projection.errors[assessment.id]) fieldErrors[assessment.id] = projection.errors[assessment.id];
  });
  const anyFieldError = Object.keys(fieldErrors).length > 0;

  const submittedIds = useMemo(
    () => new Set(assessments.filter((assessment) => assessment.status === 'submitted').map((assessment) => assessment.id)),
    [assessments],
  );
  const anyApplied = projection.applied.length > 0;
  const clearedUnresolved =
    projection.valid && anyApplied && summary.unresolvedWeight > 0 && (projection.unresolvedWeight ?? 0) === 0;

  /* Honest future-only requirement: the real current summary with the assumed
     contributions of previously unresolved assessments added in. */
  const assumedSummary = useMemo(() => {
    if (!clearedUnresolved) return null;
    const addedUnpublished = projection.applied
      .filter((entry) => submittedIds.has(entry.id))
      .reduce((sum, entry) => sum + (Number(entry.contribution) || 0), 0);
    return {
      ...summary,
      unresolvedWeight: 0,
      earnedPoints: round2(summary.earnedPoints + addedUnpublished),
    };
  }, [clearedUnresolved, projection.applied, submittedIds, summary]);

  const assumedTarget = assumedSummary && targetValue != null ? calculateTarget(assumedSummary, targetValue) : null;
  const assumedPill = assumedTarget ? marksTargetLabel(assumedTarget.status) : null;

  if (assessments.length === 0) {
    return (
      <View>
        <Section title="Marks planner" subtitle="Target calculator and hypothetical score entry.">
          <EmptyState
            icon="calculator-outline"
            title="No assessment scheme to plan against"
            message="A target cannot be calculated until an assessment scheme exists for this module. Missing data is never treated as a zero."
          />
        </Section>
        {planTransferSlot}
      </View>
    );
  }

  return (
    <View>
      <Section
      title="Marks planner"
      subtitle={`Conditional on recorded results only${course?.code ? ` for ${course.code}` : ''}.`}
    >
      {/* ------------------------------------------------------- target calculator */}
      <Card title="Target score" subtitle="What is still needed to reach a score out of 100?">
        <Field
          label="Target score (out of 100)"
          value={targetInput}
          onChangeText={(value) => update({ targetPoints: value })}
          keyboardType="numeric"
          placeholder="e.g. 70"
          maxLength={6}
          error={targetBlank ? null : targetCheck && !targetCheck.ok ? targetCheck.error : null}
          helper="Leave blank for no target. An entry outside 0 to 100 removes every number below."
          testID="marks-planner-target"
        />

        {targetBlank ? (
          <Banner label="Enter a target to see what the remaining work requires." tone="info" />
        ) : (
          <View style={styles.resultBox}>
            <View style={styles.headRow}>
              <View style={{ flex: 1 }}>
                <Text style={type.metricSmall}>
                  {target.requiredPercent == null ? '—' : `${target.requiredPercent}%`}
                </Text>
                <Text style={type.caption}>required across the weight that is not yet resolved</Text>
              </View>
              <Status label={marksTargetLabel(target.status).label} tone={marksTargetLabel(target.status).tone} />
            </View>
            <Text style={[type.bodyMuted, { marginTop: spacing.sm }]}>{target.message}</Text>
          </View>
        )}

        {target && target.combined ? (
          <Banner
            label={`This requirement spans ${target.unresolvedWeight}% unpublished results AND ${target.futureWeight}% scheduled future work. It is a combined average across both, and it must NOT be described as the required final-examination mark.`}
            tone="warn"
          />
        ) : null}

        {target && target.combined === false && (target.unresolvedWeight ?? 0) === 0 && (target.futureWeight ?? 0) > 0 ? (
          <Banner
            label={`No weight is unpublished, so this requirement applies only to the ${target.futureWeight}% of work that is still scheduled. It is not a final-exam mark.`}
            tone="info"
          />
        ) : null}
      </Card>

      {/* ----------------------------------------------------- hypothetical scores */}
      <Card
        title="What-if scores"
        subtitle="Enter one hypothetical score per assessment. Nothing here is saved to the record."
      >
        {open.length === 0 ? (
          <Banner
            label="Every assessment in this module is already published or recorded as missed, so there is nothing to assume."
            tone="info"
          />
        ) : (
          open.map((assessment) => {
            const value = hypothetical[assessment.id] ?? '';
            return (
              <View key={assessment.id} style={styles.assumptionBlock}>
                <Field
                  label={`${assessment.title} (${assessment.weightPercent}% of the scheme)`}
                  value={value}
                  onChangeText={(next) =>
                    update({ hypotheticalRaw: { ...hypothetical, [assessment.id]: next } })
                  }
                  keyboardType="numeric"
                  placeholder={`0 to ${assessment.maxMarks}`}
                  maxLength={8}
                  error={fieldErrors[assessment.id] || null}
                  helper={`Raw marks out of ${assessment.maxMarks}. ${STATUS_LABEL[assessment.status] || assessment.status}. Blank is treated as unassumed, not as zero.`}
                  suffix={`/ ${assessment.maxMarks}`}
                  testID={`marks-planner-hypo-${assessment.id}`}
                />
                <Status
                  label={STATUS_LABEL[assessment.status] || assessment.status}
                  tone={assessment.status === 'submitted' ? 'warn' : 'info'}
                />
              </View>
            );
          })
        )}

        {anyFieldError ? (
          <Banner label="Fix the highlighted score. No projection is shown while an entry is invalid." tone="danger" />
        ) : null}

        {!projection.valid ? (
          <Banner label="No projection is available: a hypothetical score is outside its assessment maximum." tone="warn" />
        ) : anyApplied ? (
          <View style={styles.resultBox}>
            <Text style={type.metricSmall}>{`${projection.projectedPoints} / 100`}</Text>
            <Text style={type.caption}>
              projected weighted points if the hypothetical scores above were the real results
            </Text>
            <Divider style={{ marginVertical: spacing.sm }} />
            {projection.applied.map((entry) => (
              <KeyValueRow
                key={entry.id}
                label={`${entry.title} · ${entry.weightPercent}% weight`}
                value={`${entry.rawMarks} / ${entry.maxMarks} raw → ${entry.contribution} points`}
                mono
              />
            ))}
            {projection.notes.length > 0 ? (
              <View style={{ marginTop: spacing.sm }}>
                {projection.notes.map((note) => (
                  <Text key={note} style={[type.caption, { marginBottom: spacing.xs }]}>
                    {note}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
        ) : (
          <EmptyState
            icon="help-circle-outline"
            title="No hypothetical score entered"
            message="The projection appears once a score is typed, and it lists exactly what was applied."
          />
        )}
      </Card>

      {/* --------------------------------------------- explicit grade assumption */}
      <Card
        title="Grade assumption"
        subtitle="Separate from the what-if scores above. A mark is never converted into a grade."
      >
        <View style={styles.chipRow}>
          <Chip
            label="No assumption"
            selected={grade === ''}
            onPress={() => update({ grade: '' })}
            testID="marks-grade-none"
          />
          {GRADE_CHOICES.filter(isCountedGrade).map((option) => (
            <Chip
              key={option}
              label={option}
              selected={grade === option}
              onPress={() => update({ grade: option })}
              testID={`marks-grade-${option}`}
            />
          ))}
        </View>
        {isCountedGrade(grade) ? (
          <Status
            label={`Grade assumption: ${grade} (entered by you)`}
            tone="info"
            style={{ marginTop: spacing.sm }}
          />
        ) : (
          <Text style={[type.caption, { marginTop: spacing.sm }]}>
            No grade assumption is set. The what-if scores above never become a grade — choose one here only if the plan's GPA projection should include it.
          </Text>
        )}
      </Card>

      {/* -------------------------------------------------- future-only requirement */}
      {clearedUnresolved && assumedSummary ? (
        <Card tone="ok">
          <Banner
            label="Every unpublished result now has a hypothetical score, so the requirement can be expressed as future work only."
            tone="ok"
          />
          <KeyValueRow
            label="Points carried in from the assumed unpublished results"
            value={`${round2(assumedSummary.earnedPoints - summary.earnedPoints)}`}
            mono
          />
          <KeyValueRow label="Points earned including those assumptions" value={`${assumedSummary.earnedPoints}`} mono />

          {assumedTarget ? (
            <View style={styles.resultBox}>
              <View style={styles.headRow}>
                <View style={{ flex: 1 }}>
                  <Text style={type.metricSmall}>
                    {assumedTarget.requiredPercent == null ? '—' : `${assumedTarget.requiredPercent}%`}
                  </Text>
                  <Text style={type.caption}>
                    required across the remaining scheduled weight, assuming your hypothetical scores
                  </Text>
                </View>
                {assumedPill ? <Status label={assumedPill.label} tone={assumedPill.tone} /> : null}
              </View>
              <Text style={[type.bodyMuted, { marginTop: spacing.sm }]}>
                {`${assumedTarget.message} This figure assumes your hypothetical scores exactly as entered; it is not a recorded result.`}
              </Text>
            </View>
          ) : (
            <Banner
              label="Enter a valid target above to see the future-only requirement under these assumptions."
              tone="info"
            />
          )}

          {(projection.futureWeight ?? 0) === 0 ? (
            <Text style={type.caption}>
              No scheduled weight remains either, so every component of the scheme is now assumed and this is no longer a future-work requirement.
            </Text>
          ) : null}
        </Card>
      ) : null}

      {/* ------------------------------------------------------------ assumptions */}
      <Banner
        label="Weights in this dataset are synthetic demonstration values, not a published scheme. Performance within assessed weight is not a final course score, and a class mean is not a rank."
        tone="neutral"
      />
      </Section>
      {planTransferSlot}
    </View>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'flex-start' },
  assumptionBlock: { marginBottom: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  resultBox: {
    marginTop: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
});

export default MarksPlanner;