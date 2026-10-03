/**
 * Weighted marks arithmetic (plan section 4).
 *
 * Units are kept explicit throughout:
 *   raw marks      — what the student scored out of an assessment's maxMarks
 *   weighted points— weightPercent * obtainedMarks / maxMarks
 *   course points  — the sum of weighted points, which is out of 100
 *
 * An assessment that is submitted but not yet published has UNRESOLVED
 * contribution. It is never treated as zero: reporting it as zero would quietly
 * penalise the student for a result nobody has seen.
 */
import { validateNumber } from './validation.js';

export const SCORED_STATUSES = ['published', 'missed'];
export const FUTURE_STATUSES = ['scheduled'];
export const UNRESOLVED_STATUSES = ['submitted'];
export const SCHEME_TOLERANCE = 0.5;

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Summarise one enrollment's assessment scheme.
 * Derived values only — nothing here is stored in app state.
 */
export function summarizeMarks(assessments) {
  const list = Array.isArray(assessments) ? assessments : [];
  const errors = [];
  const items = [];
  const seenIds = new Set();

  let earnedPoints = 0;
  let publishedWeight = 0;
  let unresolvedWeight = 0;
  let futureWeight = 0;
  let totalWeight = 0;
  let missedCount = 0;
  let unpublishedCount = 0;
  let scheduledCount = 0;

  list.forEach((assessment, index) => {
    const label = assessment?.title || `Assessment ${index + 1}`;
    if (!assessment || !assessment.id) {
      errors.push(`${label} has no id and was ignored.`);
      return;
    }
    if (seenIds.has(assessment.id)) {
      errors.push(`${label} repeats the id ${assessment.id} and was ignored.`);
      return;
    }
    seenIds.add(assessment.id);

    const maxMarks = Number(assessment.maxMarks);
    const weight = Number(assessment.weightPercent);
    const obtained = assessment.obtainedMarks == null ? null : Number(assessment.obtainedMarks);

    if (!Number.isFinite(maxMarks) || maxMarks <= 0) {
      errors.push(`${label} has an invalid maximum marks value.`);
      return;
    }
    if (!Number.isFinite(weight) || weight < 0) {
      errors.push(`${label} has an invalid weight percentage.`);
      return;
    }
    totalWeight += weight;

    if (obtained != null && (!Number.isFinite(obtained) || obtained < 0 || obtained > maxMarks)) {
      errors.push(`${label} has marks outside 0 to ${maxMarks}.`);
      return;
    }

    const status = assessment.status;
    if (![...SCORED_STATUSES, ...FUTURE_STATUSES, ...UNRESOLVED_STATUSES].includes(status)) {
      errors.push(`${label} has an unknown status "${status}".`);
      return;
    }

    let contribution = null;
    if (SCORED_STATUSES.includes(status)) {
      publishedWeight += weight;
      // A missed assessment is a recorded zero; it is not "unknown".
      contribution = status === 'missed' ? 0 : round2((weight * (obtained || 0)) / maxMarks);
      earnedPoints += contribution;
      if (status === 'missed') missedCount += 1;
    } else if (UNRESOLVED_STATUSES.includes(status)) {
      unresolvedWeight += weight;
      contribution = null;
      unpublishedCount += 1;
    } else {
      futureWeight += weight;
      contribution = null;
      scheduledCount += 1;
    }

    items.push({
      id: assessment.id,
      title: label,
      category: assessment.category || 'Assessment',
      weightPercent: weight,
      maxMarks,
      obtainedMarks: status === 'missed' ? 0 : obtained,
      status,
      contribution,
      hasContribution: contribution != null,
      classMeanRaw: assessment.classMeanRaw == null ? null : Number(assessment.classMeanRaw),
      hypothetical: false,
    });
  });

  const schemeValid = Math.abs(totalWeight - 100) <= SCHEME_TOLERANCE;
  if (!schemeValid && list.length > 0) {
    errors.push(
      `Assessment weights total ${round2(totalWeight)}% instead of 100%. A whole-course target is disabled until the scheme is complete.`,
    );
  }

  return {
    assessmentCount: list.length,
    items,
    earnedPoints: round2(earnedPoints),
    publishedWeight: round2(publishedWeight),
    unresolvedWeight: round2(unresolvedWeight),
    futureWeight: round2(futureWeight),
    totalWeight: round2(totalWeight),
    schemeValid,
    /** Percentage within assessed work only — never a final course score. */
    assessedPerformance: publishedWeight > 0 ? round2((earnedPoints / publishedWeight) * 100) : null,
    missedCount,
    unpublishedCount,
    scheduledCount,
    errors,
  };
}

/**
 * Required average across the weight that is still unresolved or in the future.
 *
 * `unresolvedWeight` present alongside future work means the result describes a
 * COMBINED requirement across unpublished and future results, so it must not be
 * described as the required final-exam mark.
 */
export function calculateTarget(summary, targetPoints) {
  const target = validateNumber(targetPoints, { label: 'Target score (out of 100)', min: 0, max: 100 });
  if (!target.ok) {
    return { status: 'invalid-target', requiredPercent: null, message: target.error, errors: { targetPoints: target.error } };
  }
  if (!summary || !summary.schemeValid) {
    return {
      status: 'scheme-invalid',
      requiredPercent: null,
      message:
        'The assessment scheme does not total 100%, so a whole-course target cannot be calculated. Published results are still shown.',
      errors: {},
    };
  }

  const earned = Number(summary.earnedPoints) || 0;
  const remainingWeight = (Number(summary.unresolvedWeight) || 0) + (Number(summary.futureWeight) || 0);
  const unresolved = Number(summary.unresolvedWeight) || 0;
  const targetValue = target.value;

  if (remainingWeight === 0) {
    const achieved = earned >= targetValue;
    return {
      status: achieved ? 'already-secured' : 'not-achieved',
      requiredPercent: achieved ? 0 : null,
      message: achieved
        ? `Every assessment is resolved and ${round2(earned)} points already reach the ${targetValue} target.`
        : `Every assessment is resolved and ${round2(earned)} points fall short of the ${targetValue} target.`,
      combined: false,
      unresolvedWeight: unresolved,
      futureWeight: Number(summary.futureWeight) || 0,
      errors: {},
    };
  }

  if (earned >= targetValue) {
    return {
      status: 'already-secured',
      requiredPercent: 0,
      message: `With ${round2(earned)} points already earned, the ${targetValue} target is secured if scores cannot be revised.`,
      combined: unresolved > 0,
      unresolvedWeight: unresolved,
      futureWeight: Number(summary.futureWeight) || 0,
      errors: {},
    };
  }

  const requiredPercent = round2(((targetValue - earned) / remainingWeight) * 100);
  const combined = unresolved > 0;
  const baseMessage = combined
    ? `You need an average of ${requiredPercent}% across the ${round2(remainingWeight)}% of weight that is unpublished or still scheduled (${round2(unresolved)}% unpublished + ${round2(summary.futureWeight)}% scheduled).`
    : `You need an average of ${requiredPercent}% across the remaining ${round2(remainingWeight)}% of weight.`;

  if (requiredPercent > 100) {
    return {
      status: 'unattainable',
      requiredPercent,
      message: `${baseMessage} That is above 100%, so the target cannot be reached under the stated assumptions.`,
      combined,
      unresolvedWeight: unresolved,
      futureWeight: Number(summary.futureWeight) || 0,
      errors: {},
    };
  }

  return {
    status: 'achievable',
    requiredPercent,
    message: baseMessage,
    combined,
    unresolvedWeight: unresolved,
    futureWeight: Number(summary.futureWeight) || 0,
    errors: {},
  };
}

/**
 * Recalculate weighted points after hypothetical raw marks are supplied.
 * Hypothetical marks are validated against that assessment's own maxMarks.
 */
export function projectMarks(assessments, hypotheticalRawScores = {}) {
  const list = Array.isArray(assessments) ? assessments : [];
  const errors = {};
  const applied = [];
  const hypothetical = hypotheticalRawScores || {};

  list.forEach((assessment) => {
    if (!assessment || !(assessment.id in hypothetical)) return;
    const raw = hypothetical[assessment.id];
    if (raw === '' || raw == null) return;
    const parsed = validateNumber(raw, { label: `${assessment.title || assessment.id} marks`, min: 0, max: Number(assessment.maxMarks) });
    if (!parsed.ok) {
      errors[assessment.id] = parsed.error || `${assessment.title || assessment.id} marks must be between 0 and ${assessment.maxMarks}.`;
      return;
    }
    applied.push({
      id: assessment.id,
      title: assessment.title,
      rawMarks: parsed.value,
      maxMarks: Number(assessment.maxMarks),
      weightPercent: Number(assessment.weightPercent),
      contribution: round2((Number(assessment.weightPercent) * parsed.value) / Number(assessment.maxMarks)),
    });
  });

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors, applied, projectedPoints: null, notes: [], unresolvedWeight: null };
  }

  const summary = summarizeMarks(list);
  const baseForProjection = summary.items
    .filter((item) => item.status === 'published' || item.status === 'missed')
    .filter((item) => !applied.some((a) => a.id === item.id))
    .reduce((sum, item) => sum + (item.contribution || 0), 0);

  const projectedPoints = round2(baseForProjection + applied.reduce((sum, item) => sum + item.contribution, 0));

  const stillUnresolved = list
    .filter((a) => UNRESOLVED_STATUSES.includes(a.status) && !applied.some((x) => x.id === a.id))
    .reduce((sum, a) => sum + Number(a.weightPercent), 0);
  const stillFuture = list
    .filter((a) => FUTURE_STATUSES.includes(a.status) && !applied.some((x) => x.id === a.id))
    .reduce((sum, a) => sum + Number(a.weightPercent), 0);

  const notes = [];
  if (applied.length === 0) notes.push('No hypothetical marks entered, so the projection equals the current earned points.');
  if (stillUnresolved > 0) notes.push(`${round2(stillUnresolved)}% of weight is still unpublished and is NOT included in this projection.`);
  if (stillFuture > 0) notes.push(`${round2(stillFuture)}% of weight is still scheduled and is NOT included in this projection.`);

  return {
    valid: true,
    errors: {},
    applied,
    projectedPoints,
    assessedWeight: round2(summary.publishedWeight + applied.reduce((sum, a) => sum + a.weightPercent, 0)),
    unresolvedWeight: round2(stillUnresolved),
    futureWeight: round2(stillFuture),
    notes,
  };
}

/**
 * Class-average comparison for matching assessment units only.
 * No percentile, rank or distribution is inferred from a mean.
 */
export function classComparison(assessments) {
  const list = Array.isArray(assessments) ? assessments : [];
  return list
    .filter((a) => a && a.classMeanRaw != null && a.obtainedMarks != null)
    .map((a) => ({
      id: a.id,
      title: a.title,
      obtainedMarks: Number(a.obtainedMarks),
      maxMarks: Number(a.maxMarks),
      classMeanRaw: Number(a.classMeanRaw),
      difference: round2(Number(a.obtainedMarks) - Number(a.classMeanRaw)),
    }));
}

export default {
  summarizeMarks,
  calculateTarget,
  projectMarks,
  classComparison,
  SCHEME_TOLERANCE,
};
