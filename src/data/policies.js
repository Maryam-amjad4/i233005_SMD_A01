/**
 * Policy provenance (plan section 6).
 *
 * Every rule used by the app is tagged with where it came from, so a reader can
 * tell a university-published rule apart from a demonstration assumption of
 * this synthetic dataset. Nothing here claims to be an official university
 * system, and none of these values are fetched at runtime.
 *
 * Sources referenced by the assignment material:
 *   - Supplied SMD Assignment 1 (open-ended React Native assignment).
 *   - 2025 undergraduate prospectus extract, pages 171–173 (attendance).
 *   - August 2023 undergraduate handbook, section 2 (explicit GPA formula,
 *     recheck window).
 *   - Observed FLEX portal screens captured by the student (grade-change window).
 *   - The project's own clarification (from the user) that attendance is counted
 *     by session count, recorded here as a project convention.
 */

export const SOURCES = {
  assignment: 'Supplied SMD Assignment 1 brief',
  prospectus2025: '2025 undergraduate prospectus extract, pp. 171–173',
  handbook2023: 'August 2023 undergraduate handbook, section 2',
  flexObservation: 'Observed FLEX portal screens (student reference material)',
  projectConvention: 'User clarification recorded during the project (session-count attendance convention)',
  demoSetting: 'Demonstration setting of this synthetic dataset',
};

export const ATTENDANCE_POLICY = {
  source: SOURCES.prospectus2025,
  defaultThresholdPercent: 80,
  basis: 'session',
  basisSource: SOURCES.projectConvention,
  note:
    'Minimum 80% attendance is published in the 2025 prospectus extract. Counting attendance by session ' +
    'count is a project convention established through user clarification during the project, not a ' +
    'published weighting table.',
};

export const GPA_POLICY = {
  source: SOURCES.handbook2023,
  formulaSource: SOURCES.handbook2023,
  note:
    'Grade points and the GPA formula are taken from the 2023 handbook. CGPA uses the latest finalized ' +
    'attempt of a repeated course; unfinished attempts (W, I, pending) do not erase an earlier result. ' +
    'F and FA are finalized results worth 0 points and are counted in the denominator (the plan ' +
    'grade-point table gives F/FA=0); dropping them would hide a fail and inflate the CGPA.',
  demonstrationConvention:
    'F/FA are counted in the GPA denominator at 0 points, not excluded. This follows the plan ' +
    'grade-point table (F/FA=0) and its exclusion list (W, I, pending and non-credit coursework only). ' +
    'This is a labelled demonstration convention for synthetic data: excluding a fail would remove it ' +
    'from the denominator entirely and show a higher, misleading GPA, so the 0-point rule is stated ' +
    'explicitly here and shown to the student in the grade legend.',
};

export const REPEAT_POLICY = {
  source: `${SOURCES.handbook2023}; ${SOURCES.flexObservation}`,
  note:
    'CGPA counts the latest finalized GPA-counting attempt of a repeated course up to the selected cutoff. ' +
    'Historical SGPA for a term keeps the grade earned in that term.',
  replacementCourses:
    'Replacement-course rules are not implemented. No replacement-course records exist in the dataset so the ' +
    'unimplemented rule cannot distort the GPA fixtures.',
};

export const EXAM_RECHECK_POLICY = {
  windowSource: SOURCES.handbook2023,
  windowDays: 7,
  windowLabel: 'Final exam recheck window (2023 handbook)',
  note: 'Seven days from result declaration, per the 2023 handbook extract. Kept separate from grade change.',
};

export const GRADE_CHANGE_POLICY = {
  windowSource: SOURCES.flexObservation,
  windowDays: 14,
  windowLabel: 'Grade-change window (observed FLEX screen)',
  note:
    'Fourteen days was observed on the FLEX grade-change screen. It is deliberately NOT merged with the ' +
    'seven-day final-exam recheck window; each request type shows its own guidance.',
};

export const SERVICE_POLICY = {
  source: SOURCES.flexObservation,
  note:
    'Withdrawal, retake and grade-change rules are demonstrated locally. The app never computes official ' +
    'eligibility and never transmits a request to a university system.',
  caveat:
    'FYP, summer, financial-support and award cases have source discrepancies in the supplied material. They ' +
    'receive informational, source-specific notes rather than a definitive eligibility answer.',
};

export const ASSESSMENT_POLICY = {
  source: SOURCES.demoSetting,
  note:
    'Assessment categories and the normal split are a demonstration default with exceptions, not a universal ' +
    'class scheme. Weight percentages in this dataset are synthetic.',
};

/** Demonstration grade scale. Never presented as an official grade conversion. */
export const DEMO_GRADE_SCALE = {
  id: 'demo-scale-standard',
  label: 'Demonstration scale (not official)',
  source: SOURCES.demoSetting,
  bands: [
    { grade: 'A', minPercent: 85, points: 4 },
    { grade: 'A-', minPercent: 80, points: 3.67 },
    { grade: 'B+', minPercent: 77, points: 3.33 },
    { grade: 'B', minPercent: 73, points: 3 },
    { grade: 'B-', minPercent: 70, points: 2.67 },
    { grade: 'C+', minPercent: 67, points: 2.33 },
    { grade: 'C', minPercent: 63, points: 2 },
    { grade: 'C-', minPercent: 60, points: 1.67 },
    { grade: 'D', minPercent: 50, points: 1 },
    { grade: 'F', minPercent: 0, points: 0 },
  ],
};

/**
 * Map a numeric percentage onto the demonstration scale only.
 * Returns null when the percentage is missing so callers never show a grade for
 * no data. This is opt-in, explicitly labelled, and never feeds a saved plan.
 */
export function predictDemoGrade(percent, scale = DEMO_GRADE_SCALE) {
  if (percent == null || !Number.isFinite(percent)) return null;
  const band = scale.bands.find((b) => percent >= b.minPercent);
  return band ? band.grade : null;
}

/** Grade points table used by the GPA module (mirrors the 2023 handbook). */
export const GRADE_POINTS = {
  'A+': 4,
  A: 4,
  'A-': 3.67,
  'B+': 3.33,
  B: 3,
  'B-': 2.67,
  'C+': 2.33,
  C: 2,
  'C-': 1.67,
  'D+': 1.33,
  D: 1,
  F: 0,
  FA: 0,
};

export const GRADE_LEGEND_NOTES = {
  W: 'Withdrawn — excluded from the GPA denominator',
  I: 'Incomplete — excluded from the GPA denominator',
  P: 'Pass without grade points — excluded from the GPA denominator',
  '-': 'Result not declared in the supplied records',
};

export default {
  SOURCES,
  ATTENDANCE_POLICY,
  GPA_POLICY,
  REPEAT_POLICY,
  EXAM_RECHECK_POLICY,
  GRADE_CHANGE_POLICY,
  SERVICE_POLICY,
  ASSESSMENT_POLICY,
  DEMO_GRADE_SCALE,
  predictDemoGrade,
  GRADE_POINTS,
  GRADE_LEGEND_NOTES,
};
