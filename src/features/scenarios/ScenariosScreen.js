/**
 * Saved plans list.
 *
 * A plan stores inputs only. Opening one shows the comparison built from the
 * CURRENT records, so a saved plan can never contradict the dashboard. When the
 * baseline revision has moved, the screen says so instead of showing a stale
 * snapshot.
 */
import React, { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Banner, Button, Card, Chip, EmptyState, Field, KeyValueRow, Section, Status } from '../../ui/components.js';
import { colors, spacing, type } from '../../ui/theme.js';
import { compareScenario, summarizePlan } from '../../domain/scenarios.js';
import { formatDate, validateDateInput } from '../../domain/validation.js';

export function ScenariosScreen({ state, actions, openView }) {
  const [selectedId, setSelectedId] = useState(state.plans[0]?.id || null);
  const [renaming, setRenaming] = useState(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [renameError, setRenameError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const plans = useMemo(() => state.plans.map(summarizePlan), [state.plans]);
  const plan = state.plans.find((p) => p.id === selectedId) || null;
  const comparison = useMemo(() => (plan ? compareScenario(plan, state) : null), [plan, state]);

  const courseById = useMemo(() => new Map(state.courses.map((c) => [c.id, c])), [state.courses]);

  return (
    <View>
      <Banner
        label="A saved plan stores your assumptions, not results. Every figure below is recalculated from the current records each time this screen opens."
        tone="info"
      />

      <Section title="Plans" subtitle="Save, rename, duplicate or delete a scenario plan.">
        {plans.length === 0 ? (
          <EmptyState
            icon="git-compare-outline"
            title="No saved plans yet"
            message="Open a course, model a scenario in the attendance or marks planner, then save it here as a named plan."
            actionLabel="Open the course list"
            onAction={() => openView('courses')}
          />
        ) : (
          plans.map((summary) => (
            <Card
              key={summary.id}
              onPress={() => setSelectedId(summary.id === selectedId ? null : summary.id)}
              title={summary.name}
              subtitle={`${summary.courseCount} course${summary.courseCount === 1 ? '' : 's'} · ${summary.assumptionCount} grade assumption${summary.assumptionCount === 1 ? '' : 's'}`}
              right={
                <Status
                  label={summary.id === selectedId ? 'Comparing' : 'Collapsed'}
                  tone={summary.id === selectedId ? 'ok' : 'neutral'}
                />
              }
            >
              <Text style={type.caption}>{`Updated ${formatDate((summary.updatedAt || '').slice(0, 10))}`}</Text>
            </Card>
          ))
        )}

        <View style={styles.row}>
          <Button label="New plan" icon="add" onPress={() => openView('planEditor', {})} style={{ flex: 1 }} />
          {plan ? (
            <>
              <Button
                label="Edit"
                variant="secondary"
                onPress={() => openView('planEditor', { planId: plan.id })}
              />
              <View style={{ width: spacing.sm }} />
              <Button label="Duplicate" variant="secondary" onPress={() => actions.duplicatePlan(plan.id)} />
            </>
          ) : null}
        </View>

        {plan ? (
          <Card>
            <Text style={[type.label, { marginBottom: spacing.xs }]}>Rename</Text>
            {renaming === plan.id ? (
              <View>
                <Field
                  label="New name"
                  value={renameDraft}
                  onChangeText={setRenameDraft}
                  error={renameError}
                  maxLength={60}
                  autoCapitalize="words"
                  helper="The plan stores assumptions, not results - renaming does not change any number."
                />
                <View style={styles.row}>
                  <Button
                    label="Save name"
                    style={{ flex: 1 }}
                    onPress={() => {
                      const result = actions.renamePlan(plan.id, renameDraft);
                      setRenameError(result.ok ? null : result.errors.name);
                      if (result.ok) setRenaming(null);
                    }}
                  />
                  <Button label="Cancel" variant="secondary" onPress={() => setRenaming(null)} style={{ flex: 1 }} />
                </View>
              </View>
            ) : (
              <View style={styles.row}>
                <Button
                  label="Rename"
                  variant="secondary"
                  onPress={() => {
                    setRenaming(plan.id);
                    setRenameDraft(plan.name);
                    setRenameError(null);
                  }}
                  style={{ flex: 1 }}
                />
                {confirmDelete === plan.id ? (
                  <>
                    <Button
                      label="Confirm delete"
                      variant="danger"
                      onPress={() => {
                        actions.deletePlan(plan.id);
                        setConfirmDelete(null);
                        setSelectedId(null);
                      }}
                      style={{ flex: 1 }}
                    />
                    <Button label="Keep" variant="secondary" onPress={() => setConfirmDelete(null)} />
                  </>
                ) : (
                  <Button label="Delete" variant="danger" onPress={() => setConfirmDelete(plan.id)} style={{ flex: 1 }} />
                )}
              </View>
            )}
          </Card>
        ) : null}
      </Section>

      {plan && comparison ? (
        <PlanComparison
          state={state}
          comparison={comparison}
          courseById={courseById}
          actions={actions}
          openView={openView}
        />
      ) : null}
    </View>
  );
}

/**
 * Comparison view: baseline and scenario are shown as separate cards per course,
 * and the GPA projection is a third, independent card. Nothing is blended into a
 * single academic score.
 */
export function PlanComparison({ state, comparison, courseById, actions, openView }) {
  const [actionCourse, setActionCourse] = useState(null);
  const [deadline, setDeadline] = useState(state.demoDate);
  const [deadlineError, setDeadlineError] = useState(null);
  // A created/in-flight recovery goal is keyed by plan + course + action. A
  // single shared flag used to disable the control on every other course and
  // survived a plan switch; the ref is the synchronous guard for a double tap
  // that arrives before any re-render.
  const createdRef = useRef(new Set());
  const [createdKeys, setCreatedKeys] = useState(() => new Set());

  return (
    <Section title={`Comparison — ${comparison.planName}`}>
      {comparison.staleBaseline ? (
        <Banner
          label={`Records changed; results recalculated. This plan was built on baseline revision ${comparison.baselineRevision} and the current records are at revision ${comparison.currentRevision}.`}
          tone="warn"
        />
      ) : null}

      {comparison.rows.length === 0 ? (
        <EmptyState
          icon="documents-outline"
          title="This plan has no course scenarios"
          message="Add at least one course so the plan can compare baseline and scenario results."
          actionLabel="Edit the plan"
          onAction={() => openView('planEditor', { planId: comparison.planId })}
        />
      ) : (
        comparison.rows.map((row) => {
          if (row.missing) {
            return (
              <Card key={row.enrollmentId} tone="warn" title="Missing course" subtitle={row.error}>
                <Button
                  label="Repair the plan"
                  variant="secondary"
                  onPress={() => openView('planEditor', { planId: comparison.planId })}
                />
              </Card>
            );
          }
          const baseline = row.baseline;
          const projected = row.projected;
          const createdKey = `${comparison.planId}:${row.enrollmentId}:attendance-recovery`;
          const created = createdKeys.has(createdKey);
          const metLabel = {
            achievable: 'Reachable',
            unattainable: 'Out of reach',
            'already-secured': 'Already secured',
            'not-achieved': 'Not reached',
            'scheme-invalid': 'Target unavailable',
            'invalid-target': 'Invalid target',
            'invalid-assumption': 'Target unavailable — fix the hypothetical scores',
          }[projected.target?.status];
          const baselineMetLabel = {
            achievable: 'Reachable',
            unattainable: 'Out of reach',
            'already-secured': 'Already secured',
            'not-achieved': 'Not reached',
            'scheme-invalid': 'Target unavailable',
            'invalid-target': 'Invalid target',
          }[row.baseline.target?.status];

          return (
            <Card
              key={row.enrollmentId}
              title={`${row.courseCode} · ${row.courseName}`}
              subtitle={row.semesterLabel}
              onPress={() => openView('course', { enrollmentId: row.enrollmentId, section: 'attendance' })}
            >
              <Text style={[type.label, { marginTop: spacing.xs }]}>Attendance</Text>
              <KeyValueRow
                label="Current"
                value={
                  baseline.attendance.percent == null
                    ? 'No recorded sessions'
                    : `${baseline.attendance.percent}% of ${baseline.attendance.held} recorded`
                }
                mono
              />
              <KeyValueRow
                label="Scenario"
                value={
                  projected.attendance.valid
                    ? `${projected.attendance.percent}% of ${projected.attendance.projectedHeld} recorded`
                    : 'Not calculated — fix the inputs'
                }
                tone={projected.attendance.valid ? undefined : 'red700'}
                mono
              />
              {projected.attendance.valid ? (
                <>
                  {/*
                    Arithmetic and schedule feasibility are separate claims.
                    A percentage that would meet the threshold is never shown as
                    a success when the schedule it needs cannot happen.
                  */}
                  <Status
                    label={
                      projected.attendance.thresholdMet
                        ? `Arithmetic result: would meet ${projected.attendance.thresholdPercent}%`
                        : `Arithmetic result: below ${projected.attendance.thresholdPercent}%`
                    }
                    tone={
                      projected.attendance.thresholdMet
                        ? projected.attendance.scheduleFeasible === false
                          ? 'warn'
                          : 'ok'
                        : 'danger'
                    }
                    style={{ marginTop: spacing.xs }}
                  />
                  <Status
                    label={
                      projected.attendance.scheduleFeasible === false
                        ? 'Schedule infeasible'
                        : projected.attendance.scheduleFeasible === true
                          ? 'Schedule feasible'
                          : 'Schedule feasibility not checked'
                    }
                    tone={
                      projected.attendance.scheduleFeasible === false
                        ? 'danger'
                        : projected.attendance.scheduleFeasible === true
                          ? 'ok'
                          : 'warn'
                    }
                    style={{ marginTop: spacing.xs }}
                  />
                  {projected.attendance.scheduleFeasible === false ? (
                    <Text style={[type.caption, { marginTop: spacing.xs, color: colors.red700 }]}>
                      The scenario uses more classes than remain in the term, so it cannot happen as described.
                    </Text>
                  ) : null}
                  {projected.attendance.scheduleFeasible == null ? (
                    <Text style={[type.caption, { marginTop: spacing.xs }]}>
                      Enter the classes left this term to check whether the scenario fits the remaining schedule.
                    </Text>
                  ) : null}
                  {projected.attendance.recoveryFeasible === false ? (
                    <Text style={[type.caption, { marginTop: spacing.xs, color: colors.red700 }]}>
                      {`Recovery needs ${projected.attendance.recoveryNeeded} consecutive sessions, which is more than the remaining classes you entered.`}
                    </Text>
                  ) : null}
                  {projected.attendance.recoveryFeasible === null && projected.attendance.recoveryNeeded > 0 ? (
                    <Text style={[type.caption, { marginTop: spacing.xs }]}>
                      {`Recovery needs ${projected.attendance.recoveryNeeded} consecutive attended sessions. Enter the remaining classes to check whether that fits this term.`}
                    </Text>
                  ) : null}
                </>
              ) : null}
              {row.pending.count > 0 ? (
                <>
                  <KeyValueRow
                    label="Pending sessions"
                    value={`${row.pending.count} not yet resolved — provisional`}
                    tone="amber700"
                    mono
                  />
                  {row.pending.bounds.lowerPercent != null ? (
                    <Text style={[type.caption, { marginTop: spacing.xs }]}>
                      {`Pending-record bounds: ${row.pending.bounds.lowerPercent}% to ${row.pending.bounds.upperPercent}% if every pending session resolved as absent or as present. This is a range, not a probability or an eligibility verdict.`}
                    </Text>
                  ) : null}
                </>
              ) : null}
              {Object.keys(projected.attendance.errors || {}).length > 0 ? (
                <Text style={[type.caption, { color: colors.red700, marginTop: spacing.xs }]}>
                  {Object.values(projected.attendance.errors).join(' ')}
                </Text>
              ) : null}

              <Text style={[type.label, { marginTop: spacing.md }]}>Weighted marks</Text>
              <KeyValueRow
                label="Baseline earned points"
                value={
                  baseline.marks.assessmentCount === 0
                    ? 'No assessment scheme'
                    : `${baseline.marks.earnedPoints} of 100 from ${baseline.marks.publishedWeight}% assessed weight`
                }
                mono
              />
              <KeyValueRow
                label="Scenario projection"
                value={
                  projected.marks.valid
                    ? `${projected.marks.projectedPoints} points with your hypothetical scores`
                    : 'Not calculated — fix the inputs'
                }
                mono
              />
              {projected.target ? (
                <>
                  <KeyValueRow
                    label={`Target ${projected.target.errors?.targetPoints ? '(invalid)' : 'set by you'} — scenario-conditioned`}
                    value={
                      projected.target.requiredPercent == null
                        ? metLabel
                        : `${projected.target.requiredPercent}% average needed`
                    }
                    tone={projected.target.status === 'achievable' ? 'green700' : projected.target.status === 'unattainable' ? 'red700' : undefined}
                    mono
                  />
                  <Status
                    label={metLabel}
                    tone={projected.target.status === 'achievable' || projected.target.status === 'already-secured' ? 'ok' : 'warn'}
                    style={{ marginTop: spacing.xs }}
                  />
                  <Text style={[type.caption, { marginTop: spacing.xs }]}>{projected.target.message}</Text>
                  {row.baseline.target && row.baseline.target.status !== projected.target.status ? (
                    <Text style={[type.caption, { marginTop: spacing.xs }]}>
                      {`Baseline only, before your hypothetical scores: ${
                        row.baseline.target.requiredPercent == null
                          ? baselineMetLabel
                          : `${row.baseline.target.requiredPercent}% average needed`
                      }. ${row.baseline.target.message}`}
                    </Text>
                  ) : null}
                </>
              ) : null}
              {projected.marks.notes.map((note) => (
                <Text key={note} style={[type.caption, { marginTop: spacing.xs }]}>
                  {note}
                </Text>
              ))}
              {row.uncertainty ? (
                <Text style={[type.caption, { marginTop: spacing.xs }]}>
                  {`${row.uncertainty.label} Between ${row.uncertainty.lower} and ${row.uncertainty.upper} points.`}
                </Text>
              ) : null}

              <View style={styles.row}>
                <Button
                  label="Add recovery goal"
                  variant="secondary"
                  onPress={() => {
                    setDeadlineError(null);
                    setActionCourse(actionCourse === row.enrollmentId ? null : row.enrollmentId);
                  }}
                />
                <View style={{ width: spacing.sm }} />
                <Button
                  label="Create preparation task"
                  variant="secondary"
                  onPress={() => openView('tasks', { prefill: buildPrepPrefill(comparison.planId, row, state) })}
                />
              </View>

              {actionCourse === row.enrollmentId ? (
                <View style={styles.actionBox}>
                  <Text style={type.label}>Recovery goal</Text>
                  {/*
                    A recovery goal needs a recorded base. With no published
                    sessions there is nothing to recover from, so the count is
                    unknown rather than zero - saying "attend 0 sessions" would
                    turn missing data into a confident number.
                  */}
                  {row.baseline.attendance.recoverySessions == null ? (
                    <Banner
                      label="No published session records for this module, so no recovery target can be calculated. Add or publish session records first."
                      tone="warn"
                    />
                  ) : (
                    <>
                      <Text style={[type.caption, { marginBottom: spacing.sm }]}>
                        {`This demo records a session count only and never invents class dates. Attend ${row.baseline.attendance.recoverySessions} consecutive session${row.baseline.attendance.recoverySessions === 1 ? '' : 's'} to reach the threshold.`}
                      </Text>
                      <Field
                        label="Deadline (YYYY-MM-DD)"
                        value={deadline}
                        onChangeText={setDeadline}
                        keyboardType="numbers-and-punctuation"
                        maxLength={10}
                        error={deadlineError}
                        helper="You choose the deadline; this app never invents one."
                      />
                      <View style={styles.row}>
                        <Button
                          label="Create goal"
                          style={{ flex: 1 }}
                          disabled={created}
                          onPress={() => {
                            const check = validateDateInput(deadline, {
                              label: 'Deadline',
                              notBefore: state.demoDate,
                            });
                            if (!check.ok) {
                              setDeadlineError(check.error);
                              return;
                            }
                            setDeadlineError(null);
                            // Two taps can arrive before the re-render clears the
                            // button, so the ref is the synchronous guard.
                            if (createdRef.current.has(createdKey)) return;
                            createdRef.current.add(createdKey);
                            const needed = row.baseline.attendance.recoverySessions;
                            const result = actions.saveTask({
                              enrollmentId: row.enrollmentId,
                              title: `Recover attendance in ${row.courseCode}: attend ${needed} consecutive session${needed === 1 ? '' : 's'}`,
                              dueDate: deadline,
                              priority: 'high',
                              source: { planId: comparison.planId, enrollmentId: row.enrollmentId, kind: 'attendance-recovery' },
                            });
                            if (result.ok) {
                              setCreatedKeys((previous) => new Set(previous).add(createdKey));
                              setActionCourse(null);
                            } else {
                              createdRef.current.delete(createdKey);
                            }
                          }}
                        />
                        <Button label="Cancel" variant="secondary" onPress={() => setActionCourse(null)} style={{ flex: 1 }} />
                      </View>
                    </>
                  )}
                </View>
              ) : null}
            </Card>
          );
        })
      )}

      <Card title="GPA projection" subtitle="Independent of the marks scenarios above.">
        <KeyValueRow
          label="Current CGPA (finalized attempts)"
          value={comparison.gpa.baseline.value == null ? 'Not available' : comparison.gpa.baseline.value.toFixed(4)}
          mono
        />
        <KeyValueRow
          label="Projected CGPA with your assumed grades"
          value={comparison.gpa.projected.value == null ? 'Not calculated' : comparison.gpa.projected.value.toFixed(4)}
          mono
        />
        <KeyValueRow
          label="Change"
          value={
            comparison.gpa.delta == null
              ? 'No change'
              : `${comparison.gpa.delta > 0 ? '+' : ''}${comparison.gpa.delta} (${comparison.gpa.delta > 0 ? 'increase' : comparison.gpa.delta < 0 ? 'decrease' : 'no change'})`
          }
          tone={comparison.gpa.delta == null || comparison.gpa.delta === 0 ? undefined : comparison.gpa.delta > 0 ? 'green700' : 'red700'}
          mono
        />
        <KeyValueRow label="Counted credits in the baseline" value={String(comparison.gpa.baseline.includedCredits)} mono />
        <Text style={[type.caption, { marginTop: spacing.sm }]}>{comparison.gpa.note}</Text>
        {comparison.gpa.assumptions.length > 0 ? (
          <View style={{ marginTop: spacing.sm }}>
            {comparison.gpa.assumptions.map((assumption) => (
              <KeyValueRow
                key={assumption.courseId}
                label={`${courseById.get(assumption.courseId)?.code || assumption.courseId} assumed`}
                value={assumption.grade}
                mono
              />
            ))}
          </View>
        ) : null}
      </Card>
    </Section>
  );
}

/** Prefill for the "create preparation task" action. */
function buildPrepPrefill(planId, row, state) {
  return {
    title: `Prepare ${row.courseCode} for the scenario in this plan`,
    dueDate: state.demoDate,
    enrollmentId: row.enrollmentId,
    priority: 'medium',
    source: { planId, enrollmentId: row.enrollmentId, kind: 'plan-preparation' },
  };
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: spacing.sm },
  actionBox: {
    marginTop: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
});

export default ScenariosScreen;
