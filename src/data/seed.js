/**
 * Deterministic synthetic dataset (plan section 3).
 *
 * Every record here is invented for this assignment. No personal FAST record,
 * screenshot or portal capture is reproduced. `createSeedState()` returns a fresh
 * deep copy so a reset always yields exactly the same starting point, and all
 * dates are explicit strings relative to the stored demo date so that
 * date-sensitive states stay reproducible.
 */
import { addDays } from '../domain/validation.js';

export const DATA_VERSION = 1;

/** Visible demo date. All "today"-relative states use this, not the device clock. */
export const DEMO_DATE = '2026-10-03';

export const SEMESTER_IDS = {
  spring2025: 'sem-2025-spring',
  fall2025: 'sem-2025-fall',
  spring2026: 'sem-2026-spring',
  fall2026: 'sem-2026-fall',
};

/**
 * Two sessions per week (Monday then Thursday) starting from `startIso`.
 * Returns ISO dates; deterministic, no Date arithmetic surprises.
 */
function sessionDates(count, startIso = '2026-08-24') {
  const dates = [];
  let cursor = startIso;
  for (let i = 0; i < count; i += 1) {
    dates.push(cursor);
    cursor = addDays(cursor, i % 2 === 0 ? 3 : 4);
  }
  return dates;
}

/**
 * Expand a presence pattern into attendance sessions.
 * `P` present, `A` absent, `U` pending (record not yet published).
 */
function buildSessions(prefix, enrollmentId, pattern, { startIso, noteEvery } = {}) {
  const letters = pattern.split('');
  const dates = sessionDates(letters.length, startIso);
  return letters.map((letter, index) => ({
    id: `${prefix}-${index + 1}`,
    enrollmentId,
    date: dates[index],
    durationHours: 1.25,
    presence: letter === 'P' ? 'present' : letter === 'A' ? 'absent' : 'pending',
    note: noteEvery && index % noteEvery === 0 ? 'Synthetic demonstration session' : null,
  }));
}

function baseSeed() {
  return {
    version: DATA_VERSION,
    demoDate: DEMO_DATE,
    /**
     * Bumped whenever baseline records or calculation settings change. Saved
     * plans remember the revision they were built on so the UI can say
     * "Records changed; results recalculated" instead of showing a stale result.
     */
    revision: 1,

    student: {
      name: 'Ayesha Siddiqui (synthetic)',
      rollNumber: '23I-0999',
      degree: 'BS Computer Science',
      campus: 'Lahore Campus (synthetic)',
      batch: '2023',
      section: 'A',
      semesterNumber: 7,
    },

    semesters: [
      {
        id: SEMESTER_IDS.spring2025,
        label: 'Spring 2025',
        order: 1,
        status: 'completed',
        startDate: '2025-01-20',
        endDate: '2025-06-04',
        hasRecords: true,
      },
      {
        id: SEMESTER_IDS.fall2025,
        label: 'Fall 2025',
        order: 2,
        status: 'completed',
        startDate: '2025-08-25',
        endDate: '2026-01-08',
        hasRecords: true,
      },
      {
        id: SEMESTER_IDS.spring2026,
        label: 'Spring 2026',
        order: 3,
        status: 'completed',
        startDate: '2026-01-19',
        endDate: '2026-06-03',
        // Deliberately record-free term: the empty-semester state used in testing.
        hasRecords: false,
      },
      {
        id: SEMESTER_IDS.fall2026,
        label: 'Fall 2026',
        order: 4,
        status: 'current',
        startDate: '2026-08-24',
        endDate: '2026-12-18',
        hasRecords: true,
      },
    ],

    courses: [
      // ---- current term catalogue
      {
        id: 'c-ds-2101',
        code: 'CS-2101',
        name: 'Data Structures and Algorithms',
        credits: 3,
        type: 'theory',
        prerequisites: ['c-prog-1101'],
        linkedLabId: null,
        nonCredit: false,
        offeredInSemesters: [SEMESTER_IDS.fall2026],
        termNote: 'Synthetic demonstration course record.',
      },
      {
        id: 'c-math-2205',
        code: 'MATH-2205',
        name: 'Discrete Mathematics',
        credits: 3,
        type: 'theory',
        prerequisites: ['c-math-1101'],
        linkedLabId: null,
        nonCredit: false,
        offeredInSemesters: [SEMESTER_IDS.fall2026],
        termNote: 'Synthetic demonstration course record.',
      },
      {
        id: 'c-dl-2103',
        code: 'DL-2103',
        name: 'Digital Logic Design',
        credits: 3,
        type: 'theory',
        prerequisites: [],
        linkedLabId: 'c-dl-2103l',
        nonCredit: false,
        offeredInSemesters: [SEMESTER_IDS.fall2026],
        termNote: 'Paired with a linked laboratory course.',
      },
      {
        id: 'c-dl-2103l',
        code: 'DL-2103L',
        name: 'Digital Logic Design Laboratory',
        credits: 1,
        type: 'lab',
        prerequisites: [],
        linkedLabId: null,
        nonCredit: false,
        offeredInSemesters: [SEMESTER_IDS.fall2026],
        termNote: 'Linked laboratory of DL-2103.',
      },
      {
        id: 'c-se-2201',
        code: 'SE-2201',
        name: 'Software Engineering',
        credits: 3,
        type: 'theory',
        prerequisites: ['c-prog-1101'],
        linkedLabId: null,
        nonCredit: false,
        offeredInSemesters: [SEMESTER_IDS.fall2026],
        termNote: 'Synthetic demonstration course record.',
      },
      {
        id: 'c-ee-2001',
        code: 'EE-2001',
        name: 'Introduction to Electrical Engineering',
        credits: 2,
        type: 'theory',
        prerequisites: [],
        linkedLabId: null,
        nonCredit: false,
        offeredInSemesters: [SEMESTER_IDS.fall2026],
        termNote: 'Sessions and marks are not published yet in this dataset.',
      },
      {
        id: 'c-hm-2301',
        code: 'HM-2301',
        name: 'Technical and Business Communication',
        credits: 2,
        type: 'theory',
        prerequisites: [],
        linkedLabId: null,
        // Non-credit coursework: excluded from the GPA denominator.
        nonCredit: true,
        offeredInSemesters: [SEMESTER_IDS.fall2026],
        termNote: 'Non-credit course; excluded from GPA.',
      },

      // ---- historical catalogue
      {
        id: 'c-prog-1101',
        code: 'CS-1101',
        name: 'Programming Fundamentals',
        credits: 3,
        type: 'theory',
        prerequisites: [],
        linkedLabId: null,
        nonCredit: false,
        offeredInSemesters: [SEMESTER_IDS.spring2025],
        termNote: 'Completed historical record.',
      },
      {
        id: 'c-math-1101',
        code: 'MATH-1101',
        name: 'Calculus I',
        credits: 3,
        type: 'theory',
        prerequisites: [],
        linkedLabId: null,
        nonCredit: false,
        offeredInSemesters: [SEMESTER_IDS.spring2025],
        termNote: 'Completed historical record.',
      },
      {
        id: 'c-co-1102',
        code: 'CO-1102',
        name: 'Computing Orientation',
        credits: 1,
        type: 'theory',
        prerequisites: [],
        linkedLabId: null,
        nonCredit: true,
        offeredInSemesters: [SEMESTER_IDS.spring2025],
        termNote: 'Non-credit course; excluded from GPA.',
      },
      {
        id: 'c-ds-1102',
        code: 'CS-1102',
        name: 'Object Oriented Programming',
        credits: 3,
        type: 'theory',
        prerequisites: ['c-prog-1101'],
        linkedLabId: null,
        nonCredit: false,
        offeredInSemesters: [SEMESTER_IDS.spring2025, SEMESTER_IDS.fall2025],
        termNote: 'Repeated in Fall 2025 — CGPA uses the latest attempt.',
      },
      {
        id: 'c-db-1301',
        code: 'DB-1301',
        name: 'Database Systems',
        credits: 3,
        type: 'theory',
        prerequisites: ['c-prog-1101'],
        linkedLabId: null,
        nonCredit: false,
        offeredInSemesters: [SEMESTER_IDS.fall2025],
        termNote: 'Completed historical record.',
      },
      {
        id: 'c-math-1201',
        code: 'MATH-1201',
        name: 'Linear Algebra',
        credits: 2,
        type: 'theory',
        prerequisites: ['c-math-1101'],
        linkedLabId: null,
        nonCredit: false,
        offeredInSemesters: [SEMESTER_IDS.fall2025],
        termNote: 'Completed historical record.',
      },
      {
        id: 'c-phy-1103',
        code: 'PHY-1103',
        name: 'Physics I',
        credits: 3,
        type: 'theory',
        prerequisites: [],
        linkedLabId: null,
        nonCredit: false,
        offeredInSemesters: [SEMESTER_IDS.fall2025],
        termNote: 'FA result: counted in the GPA denominator at 0 points, not excluded. Excluding a fail would hide it and raise the CGPA.',
      },
      {
        id: 'c-stats-1401',
        code: 'STATS-1401',
        name: 'Probability and Statistics',
        credits: 2,
        type: 'theory',
        prerequisites: [],
        linkedLabId: null,
        nonCredit: false,
        offeredInSemesters: [SEMESTER_IDS.fall2025],
        termNote: 'Incomplete (I) result: excluded, and it does not erase earlier results.',
      },

      // ---- offered next term (registration planner only; not enrolled)
      {
        id: 'c-os-2301',
        code: 'OS-2301',
        name: 'Operating Systems',
        credits: 3,
        type: 'theory',
        prerequisites: ['c-prog-1101'],
        linkedLabId: null,
        nonCredit: false,
        offeredInSemesters: [SEMESTER_IDS.fall2026],
        termNote: 'Shown as an offered demonstration course, not an enrollment.',
      },
      {
        id: 'c-cn-2302',
        code: 'CN-2302',
        name: 'Computer Networks',
        credits: 3,
        type: 'theory',
        prerequisites: ['c-math-1101'],
        linkedLabId: 'c-cn-2302l',
        nonCredit: false,
        offeredInSemesters: [SEMESTER_IDS.fall2026],
        termNote: 'Shown as an offered demonstration course, not an enrollment.',
      },
      {
        id: 'c-cn-2302l',
        code: 'CN-2302L',
        name: 'Computer Networks Laboratory',
        credits: 1,
        type: 'lab',
        prerequisites: [],
        linkedLabId: null,
        nonCredit: false,
        offeredInSemesters: [SEMESTER_IDS.fall2026],
        termNote: 'Linked laboratory of CN-2302.',
      },
      {
        id: 'c-ml-2401',
        code: 'ML-2401',
        name: 'Introduction to Machine Learning',
        credits: 3,
        type: 'theory',
        prerequisites: ['c-math-1101', 'c-db-1301'],
        linkedLabId: null,
        nonCredit: false,
        offeredInSemesters: [SEMESTER_IDS.fall2026],
        termNote: 'Shown as an offered demonstration course, not an enrollment.',
      },
    ],

    enrollments: [
      // ---- current term
      { id: 'e-ds-2101-f26', courseId: 'c-ds-2101', semesterId: SEMESTER_IDS.fall2026, section: 'A', status: 'enrolled', finalGrade: null },
      { id: 'e-math-2205-f26', courseId: 'c-math-2205', semesterId: SEMESTER_IDS.fall2026, section: 'A', status: 'enrolled', finalGrade: null },
      { id: 'e-dl-2103-f26', courseId: 'c-dl-2103', semesterId: SEMESTER_IDS.fall2026, section: 'A', status: 'enrolled', finalGrade: null },
      { id: 'e-dl-2103l-f26', courseId: 'c-dl-2103l', semesterId: SEMESTER_IDS.fall2026, section: 'L1', status: 'enrolled', finalGrade: null },
      { id: 'e-se-2201-f26', courseId: 'c-se-2201', semesterId: SEMESTER_IDS.fall2026, section: 'B', status: 'enrolled', finalGrade: null },
      { id: 'e-ee-2001-f26', courseId: 'c-ee-2001', semesterId: SEMESTER_IDS.fall2026, section: 'A', status: 'enrolled', finalGrade: null },
      { id: 'e-hm-2301-f26', courseId: 'c-hm-2301', semesterId: SEMESTER_IDS.fall2026, section: 'A', status: 'enrolled', finalGrade: null },

      // ---- Spring 2025 (SGPA fixture: A + B+ + A over 9 credits)
      { id: 'e-prog-1101-s25s', courseId: 'c-prog-1101', semesterId: SEMESTER_IDS.spring2025, section: 'A', status: 'completed', finalGrade: 'A' },
      { id: 'e-math-1101-s25s', courseId: 'c-math-1101', semesterId: SEMESTER_IDS.spring2025, section: 'A', status: 'completed', finalGrade: 'B+' },
      { id: 'e-co-1102-s25s', courseId: 'c-co-1102', semesterId: SEMESTER_IDS.spring2025, section: 'A', status: 'withdrawn', finalGrade: 'W' },
      { id: 'e-ds-1102-s25s', courseId: 'c-ds-1102', semesterId: SEMESTER_IDS.spring2025, section: 'A', status: 'completed', finalGrade: 'A' },

      // ---- Fall 2025 (repeat of CS-1102 with a lower grade; FA and I present)
      { id: 'e-ds-1102-s25f', courseId: 'c-ds-1102', semesterId: SEMESTER_IDS.fall2025, section: 'A', status: 'completed', finalGrade: 'B' },
      { id: 'e-db-1301-s25f', courseId: 'c-db-1301', semesterId: SEMESTER_IDS.fall2025, section: 'A', status: 'completed', finalGrade: 'B+' },
      { id: 'e-math-1201-s25f', courseId: 'c-math-1201', semesterId: SEMESTER_IDS.fall2025, section: 'A', status: 'completed', finalGrade: 'A-' },
      { id: 'e-phy-1103-s25f', courseId: 'c-phy-1103', semesterId: SEMESTER_IDS.fall2025, section: 'A', status: 'completed', finalGrade: 'FA' },
      { id: 'e-stats-1401-s25f', courseId: 'c-stats-1401', semesterId: SEMESTER_IDS.fall2025, section: 'A', status: 'incomplete', finalGrade: 'I' },
    ],

    attendanceSessions: [
      // Data Structures: 11 present / 12 recorded = comfortably above threshold.
      ...buildSessions('ses-ds', 'e-ds-2101-f26', 'PPPPPPPPPPPA', { noteEvery: 6 }),
      // Discrete Mathematics: exactly 8/10 = 80%.
      ...buildSessions('ses-ma', 'e-math-2205-f26', 'PPPPPPPPAA', { noteEvery: 5 }),
      // Digital Logic: 7/10 = 70%, below threshold but recoverable.
      ...buildSessions('ses-dl', 'e-dl-2103-f26', 'PPPPPPPAAA', { noteEvery: 5 }),
      // Linked lab: 4/5 = 80%.
      ...buildSessions('ses-dlb', 'e-dl-2103l-f26', 'PPPPA', { noteEvery: 5 }),
      // Software Engineering: 4 present, 1 absent recorded, 2 pending.
      ...buildSessions('ses-se', 'e-se-2201-f26', 'PPPPAUU', { noteEvery: 4 }),
      // Technical communication: 6/6 = 100%.
      ...buildSessions('ses-hm', 'e-hm-2301-f26', 'PPPPPP', { noteEvery: 6 }),
      // EE-2001 intentionally has zero session records.
    ],

    assessments: [
      // CS-2101: one published quiz, one submitted-but-unpublished assignment, one scheduled midterm.
      { id: 'as-ds-q1', enrollmentId: 'e-ds-2101-f26', category: 'Quiz', title: 'Quiz 1 — Complexity', weightPercent: 20, maxMarks: 10, obtainedMarks: 8, status: 'published', classMeanRaw: 7.1 },
      { id: 'as-ds-a1', enrollmentId: 'e-ds-2101-f26', category: 'Assignment', title: 'Assignment 1 — Linked lists', weightPercent: 30, maxMarks: 30, obtainedMarks: null, status: 'submitted', classMeanRaw: null },
      { id: 'as-ds-mid', enrollmentId: 'e-ds-2101-f26', category: 'Midterm', title: 'Midterm examination', weightPercent: 50, maxMarks: 50, obtainedMarks: null, status: 'scheduled', classMeanRaw: null },

      // SE-2201: published quiz + published assignment + scheduled midterm (target fixture).
      { id: 'as-se-q1', enrollmentId: 'e-se-2201-f26', category: 'Quiz', title: 'Quiz 1 — Requirements', weightPercent: 20, maxMarks: 10, obtainedMarks: 8, status: 'published', classMeanRaw: 7.4 },
      { id: 'as-se-a1', enrollmentId: 'e-se-2201-f26', category: 'Assignment', title: 'Assignment 1 — Use cases', weightPercent: 30, maxMarks: 30, obtainedMarks: 20, status: 'published', classMeanRaw: 22.5 },
      { id: 'as-se-mid', enrollmentId: 'e-se-2201-f26', category: 'Midterm', title: 'Midterm examination', weightPercent: 50, maxMarks: 50, obtainedMarks: null, status: 'scheduled', classMeanRaw: null },

      // MATH-2205: published midterm + published quiz + scheduled final.
      { id: 'as-ma-mid', enrollmentId: 'e-math-2205-f26', category: 'Midterm', title: 'Midterm examination', weightPercent: 50, maxMarks: 50, obtainedMarks: 32, status: 'published', classMeanRaw: 30.1 },
      { id: 'as-ma-qz', enrollmentId: 'e-math-2205-f26', category: 'Quiz', title: 'Quiz 1 — Logic', weightPercent: 20, maxMarks: 20, obtainedMarks: 15, status: 'published', classMeanRaw: 13.4 },
      { id: 'as-ma-fin', enrollmentId: 'e-math-2205-f26', category: 'Final', title: 'Final examination', weightPercent: 30, maxMarks: 30, obtainedMarks: null, status: 'scheduled', classMeanRaw: null },

      // HM-2301: a missed quiz counts as zero, plus a published midterm.
      { id: 'as-hm-qz', enrollmentId: 'e-hm-2301-f26', category: 'Quiz', title: 'Quiz 1 — presentation', weightPercent: 20, maxMarks: 10, obtainedMarks: null, status: 'missed', classMeanRaw: 6.2 },
      { id: 'as-hm-mid', enrollmentId: 'e-hm-2301-f26', category: 'Midterm', title: 'Midterm presentation', weightPercent: 80, maxMarks: 100, obtainedMarks: 74, status: 'published', classMeanRaw: 70.5 },

      // Digital Logic theory/lab and EE-2001 intentionally have no assessment scheme.
    ],

    outcomes: [
      // Supplied synthetic observations only. No attainment formula is applied and
      // no outcome is labelled passed/failed.
      { id: 'o-ds-1', courseId: 'c-ds-2101', code: 'PLO-1', definition: 'Analyse a problem and select an appropriate algorithm.', value: 3, scaleMax: 4, reportedBy: 'Synthetic course coordinator', interpretation: 'Demonstration observation only.' },
      { id: 'o-ds-2', courseId: 'c-ds-2101', code: 'PLO-2', definition: 'Implement core data structures in a programming language.', value: 2, scaleMax: 4, reportedBy: 'Synthetic course coordinator', interpretation: 'Demonstration observation only.' },
      { id: 'o-ds-3', courseId: 'c-ds-2101', code: 'PLO-3', definition: 'Reason about complexity trade-offs.', value: null, scaleMax: 4, reportedBy: null, interpretation: 'Not reported in the supplied demonstration records.' },
      { id: 'o-se-1', courseId: 'c-se-2201', code: 'PLO-1', definition: 'Model requirements for a software product.', value: 2, scaleMax: 4, reportedBy: 'Synthetic course coordinator', interpretation: 'Demonstration observation only.' },
      { id: 'o-ma-1', courseId: 'c-math-2205', code: 'PLO-2', definition: 'Formalise problems using discrete structures.', value: 3, scaleMax: 4, reportedBy: 'Synthetic course coordinator', interpretation: 'Demonstration observation only.' },
      // c-ee-2001 and the lab have no outcome rows at all (missing-data state).
    ],

    academicEvents: [
      { id: 'ev-feedback-current', type: 'window', title: 'Course feedback window (current term)', startDate: '2026-10-01', endDate: '2026-10-20', source: 'Synthetic demonstration setting', dateSemantics: 'Inclusive start and end dates.' },
      { id: 'ev-feedback-previous', type: 'window', title: 'Course feedback window (Fall 2025)', startDate: '2025-09-15', endDate: '2025-10-05', source: 'Synthetic demonstration setting', dateSemantics: 'Inclusive start and end dates; closed.' },
      { id: 'ev-withdraw-current', type: 'window', title: 'Course withdrawal window', startDate: '2026-09-20', endDate: '2026-11-15', source: 'Synthetic demonstration setting', dateSemantics: 'Inclusive start and end dates.' },
      { id: 'ev-retake-current', type: 'window', title: 'Retake request window', startDate: '2026-09-20', endDate: '2026-10-25', source: 'Synthetic demonstration setting', dateSemantics: 'Inclusive start and end dates.' },
      { id: 'ev-gradechange-current', type: 'window', title: 'Grade-change window (14 days, observed FLEX screen)', startDate: '2026-09-25', endDate: '2026-10-09', source: 'Observed FLEX screen, synthetic dates', dateSemantics: 'Inclusive start and end dates; kept separate from the recheck window.' },
      { id: 'ev-recheck-2025fall', type: 'window', title: 'Final exam recheck window (7 days, 2023 handbook)', startDate: '2025-09-05', endDate: '2025-09-12', source: 'August 2023 undergraduate handbook', dateSemantics: 'Inclusive start and end dates; closed.' },
      { id: 'ev-gradechange-2025fall', type: 'window', title: 'Grade-change window (Fall 2025, closed)', startDate: '2025-09-05', endDate: '2025-09-19', source: 'Observed FLEX screen, synthetic dates', dateSemantics: 'Inclusive start and end dates; closed.' },
      { id: 'ev-registration-next', type: 'window', title: 'Course registration window (next term)', startDate: '2026-11-02', endDate: '2026-11-20', source: 'Synthetic demonstration setting', dateSemantics: 'Inclusive start and end dates; upcoming.' },
      { id: 'ev-midterm-2026fall', type: 'event', title: 'Midterm examinations', startDate: '2026-11-09', endDate: '2026-11-13', source: 'Synthetic demonstration setting', dateSemantics: 'Inclusive start and end dates; future event.' },
      { id: 'ev-result-declaration-2025fall', type: 'event', title: 'Fall 2025 result declaration', startDate: '2025-09-05', endDate: '2025-09-05', source: 'Synthetic demonstration setting', dateSemantics: 'Single date; anchors the 7-day recheck window.' },
      { id: 'ev-add-drop-2026fall', type: 'window', title: 'Add/drop window', startDate: '2026-09-01', endDate: '2026-09-12', source: 'Synthetic demonstration setting', dateSemantics: 'Inclusive start and end dates; closed.' },
    ],

    fees: [
      {
        id: 'fee-2026-fall',
        semesterId: SEMESTER_IDS.fall2026,
        currency: 'PKR',
        components: [
          { label: 'Tuition fee', amount: 148000 },
          { label: 'Registration fee', amount: 15000 },
          { label: 'Library and laboratory', amount: 5000 },
          { label: 'Student fund', amount: 7000 },
          { label: 'Examination fee', amount: 5000 },
        ],
        totalAmount: 180000,
        note: 'Synthetic demonstration amounts. No real payment destination exists.',
        challans: [
          {
            id: 'ch-2026f-1',
            label: 'Semester fee challan (Fall 2026)',
            amount: 180000,
            status: 'unpaid',
            dueDate: '2026-10-14',
            paidDate: null,
            reference: 'SYN-2026F-00412',
            issuedDate: '2026-08-24',
          },
          {
            id: 'ch-2026f-2',
            label: 'Late registration fine (demonstration)',
            amount: 5000,
            status: 'paid',
            dueDate: '2026-09-12',
            paidDate: '2026-09-10',
            reference: 'SYN-2026F-00388',
            issuedDate: '2026-09-01',
          },
        ],
      },
      {
        id: 'fee-2025-fall',
        semesterId: SEMESTER_IDS.fall2025,
        currency: 'PKR',
        components: [
          { label: 'Tuition fee', amount: 124000 },
          { label: 'Registration fee', amount: 15000 },
          { label: 'Library and laboratory', amount: 5000 },
          { label: 'Student fund', amount: 6000 },
        ],
        totalAmount: 150000,
        note: 'Synthetic demonstration amounts. Fully cleared in the dataset.',
        challans: [
          {
            id: 'ch-2025f-1',
            label: 'Semester fee challan (Fall 2025)',
            amount: 150000,
            status: 'paid',
            dueDate: '2025-09-15',
            paidDate: '2025-09-10',
            reference: 'SYN-2025F-00277',
            issuedDate: '2025-08-25',
          },
        ],
      },
      {
        id: 'fee-2025-spring',
        semesterId: SEMESTER_IDS.spring2025,
        currency: 'PKR',
        components: [
          { label: 'Tuition fee', amount: 120000 },
          { label: 'Registration fee', amount: 15000 },
          { label: 'Library and laboratory', amount: 5000 },
          { label: 'Student fund', amount: 5000 },
        ],
        totalAmount: 145000,
        note: 'Synthetic demonstration amounts. Fully cleared in the dataset.',
        challans: [
          {
            id: 'ch-2025s-1',
            label: 'Semester fee challan (Spring 2025)',
            amount: 145000,
            status: 'paid',
            dueDate: '2025-02-10',
            paidDate: '2025-02-06',
            reference: 'SYN-2025S-00112',
            issuedDate: '2025-01-20',
          },
        ],
      },
      {
        id: 'fee-2026-spring',
        semesterId: SEMESTER_IDS.spring2026,
        currency: 'PKR',
        components: [],
        totalAmount: 0,
        note: 'No enrolment in this term, so no demonstration fee record exists.',
        challans: [],
      },
    ],

    requests: [
      {
        id: 'req-1001',
        type: 'withdrawal',
        enrollmentIds: ['e-math-2205-f26'],
        assessmentIds: [],
        reason: 'scheduleConflict',
        remarks: 'Synthetic history: withdrawn from the extra section after a timetable clash.',
        attachment: { name: 'synthetic-withdrawal-note.pdf', mimeType: 'application/pdf', sizeBytes: 182000, uri: null, synthetic: true },
        acknowledgement: true,
        status: 'rejected',
        createdAt: '2026-09-22T09:12:00.000Z',
        updatedAt: '2026-09-24T15:40:00.000Z',
        history: [
          { at: '2026-09-22T09:12:00.000Z', status: 'draft', note: 'Draft created locally.' },
          { at: '2026-09-22T10:02:00.000Z', status: 'submitted', note: 'Simulated local submission (no university transmission).' },
          { at: '2026-09-24T15:40:00.000Z', status: 'rejected', note: 'Synthetic demonstration outcome: prerequisites not satisfied.' },
        ],
      },
      {
        id: 'req-1002',
        type: 'retake',
        enrollmentIds: ['e-phy-1103-s25f'],
        assessmentIds: [],
        reason: 'assessmentError',
        remarks: 'Synthetic history: component result was posted against the wrong component code.',
        attachment: { name: 'synthetic-result-sheet.pdf', mimeType: 'application/pdf', sizeBytes: 240000, uri: null, synthetic: true },
        acknowledgement: true,
        status: 'approved',
        createdAt: '2025-09-18T11:00:00.000Z',
        updatedAt: '2025-09-30T08:20:00.000Z',
        history: [
          { at: '2025-09-18T11:00:00.000Z', status: 'draft', note: 'Draft created locally.' },
          { at: '2025-09-18T12:15:00.000Z', status: 'submitted', note: 'Simulated local submission (no university transmission).' },
          { at: '2025-09-30T08:20:00.000Z', status: 'approved', note: 'Synthetic demonstration outcome: record corrected.' },
        ],
      },
      {
        id: 'req-1003',
        type: 'gradeChange',
        enrollmentIds: ['e-math-1201-s25f'],
        assessmentIds: [],
        reason: 'finalExamRecheck',
        remarks: 'Synthetic draft kept for demonstration of the editable draft state.',
        attachment: null,
        acknowledgement: true,
        status: 'draft',
        createdAt: '2026-10-02T18:30:00.000Z',
        updatedAt: '2026-10-02T18:30:00.000Z',
        history: [{ at: '2026-10-02T18:30:00.000Z', status: 'draft', note: 'Draft saved locally.' }],
      },
      {
        id: 'req-1004',
        type: 'gradeChange',
        enrollmentIds: ['e-db-1301-s25f'],
        assessmentIds: [],
        reason: 'missingMarks',
        remarks: 'Synthetic request: component mark for the project was missing from the transcript.',
        attachment: null,
        acknowledgement: true,
        status: 'submitted',
        createdAt: '2026-09-27T07:45:00.000Z',
        updatedAt: '2026-09-27T08:05:00.000Z',
        history: [
          { at: '2026-09-27T07:45:00.000Z', status: 'draft', note: 'Draft created locally.' },
          { at: '2026-09-27T08:05:00.000Z', status: 'submitted', note: 'Simulated local submission (no university transmission).' },
        ],
      },
    ],

    feedback: [
      {
        id: 'fb-2001',
        enrollmentId: 'e-ds-2101-f26',
        windowEventId: 'ev-feedback-current',
        ratings: { teaching: 4, assessment: 4, resources: 3 },
        comment: 'Synthetic feedback: examples in class made the recursion topic click.',
        submittedAt: '2026-10-02T13:20:00.000Z',
      },
      {
        id: 'fb-1000',
        enrollmentId: 'e-ds-1102-s25f',
        windowEventId: 'ev-feedback-previous',
        ratings: { teaching: 3, assessment: 3, resources: 4 },
        comment: 'Synthetic feedback from the previous term window.',
        submittedAt: '2025-09-22T10:05:00.000Z',
      },
    ],

    tasks: [
      { id: 'task-1', enrollmentId: 'e-ds-2101-f26', title: 'Revise complexity analysis before the midterm', dueDate: '2026-10-08', priority: 'high', completed: false, source: null },
      { id: 'task-2', enrollmentId: 'e-se-2201-f26', title: 'Submit Software Engineering assignment (demonstration)', dueDate: '2026-09-28', priority: 'high', completed: false, source: null },
      { id: 'task-3', enrollmentId: null, title: 'Review the Fall 2026 fee challan due date', dueDate: '2026-10-20', priority: 'medium', completed: false, source: null },
      { id: 'task-4', enrollmentId: 'e-dl-2103l-f26', title: 'Collect the laboratory handout from section L1', dueDate: '2026-09-15', priority: 'low', completed: true, source: null },
      { id: 'task-5', enrollmentId: null, title: 'Clean up last term notes', dueDate: '2026-09-10', priority: 'low', completed: true, source: null },
    ],

    preferences: {
      selectedSemesterId: SEMESTER_IDS.fall2026,
      pins: ['courses', 'tasks', 'scenarios', 'finance'],
      attendanceThresholdPercent: 80,
      showDemoGradeScale: false,
    },

    plans: [
      {
        id: 'plan-3001',
        name: 'Balanced semester (demo)',
        enrollmentScenarios: {
          'e-dl-2103-f26': { futurePresent: 5, futureAbsent: 0, remainingSessions: 6, targetPoints: null, hypotheticalRaw: {} },
          'e-math-2205-f26': { futurePresent: 0, futureAbsent: 0, remainingSessions: null, targetPoints: 75, hypotheticalRaw: {} },
        },
        gradeAssumptions: {},
        shortlistedCourseIds: ['c-os-2301', 'c-cn-2302'],
        createdAt: '2026-10-01T09:00:00.000Z',
        updatedAt: '2026-10-01T09:00:00.000Z',
        baselineRevision: 1,
      },
    ],
  };
}

/** Deep clone helper — `createSeedState` must never hand out shared references. */
function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Create a fresh, mutable copy of the synthetic dataset.
 * Demo-only screens use this for reset and for the empty-dataset scenario.
 */
export function createSeedState() {
  return clone(baseSeed());
}

/**
 * Create a deliberately empty dataset that keeps identity and policy context but
 * carries no academic records. Used to demonstrate empty states live.
 */
export function createEmptyState() {
  const state = createSeedState();
  state.enrollments = [];
  state.attendanceSessions = [];
  state.assessments = [];
  state.outcomes = [];
  state.tasks = [];
  state.plans = [];
  state.requests = state.requests.filter((r) => r.status === 'draft');
  state.feedback = [];
  state.revision = state.revision + 1;
  return state;
}

export function currentSemester(state) {
  return state.semesters.find((s) => s.status === 'current') || state.semesters[state.semesters.length - 1] || null;
}

export default createSeedState;
