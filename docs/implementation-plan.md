# Flex++ Implementation Plan

> **Release scope:** this document is the original specification; four feature families were retired from the release — see [the release-scope amendment](implementation-plan-amendment.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking. Execute inline; user review follows the complete build, rather than individual tasks.

**Status:** Finalized for implementation after assignment, policy, arithmetic and scope review on 2026-10-03. This is plan validation; runtime and device checks occur during implementation.

**Goal:** Build a complete JavaScript React Native assignment app that combines a redesigned academic portal with practical attendance, marks, GPA, task and study planners.

**Architecture:** One synthetic academic dataset supplies all modules. Pure calculation functions and selectors derive results; React state owns editable local plans and service simulations. Conditional rendering switches views without a navigation library, sidebar or bottom bar.

**Tech Stack:** Expo, React Native, JavaScript, react-native-chart-kit, react-native-svg, AsyncStorage, Expo vector icons, Expo document picker for local demonstration attachments. Node's test runner verifies pure domain functions.

**Spec:** The product specification in sections 1–9 of this document is canonical. Task instructions in section 10 implement it.

## Global Constraints

- React Native mobile application, JavaScript source, Expo-compatible delivery.
- No sidebar, bottom bar, Expo Router or React Navigation.
- Use state and conditional JSX for view switching, as in the supplied class example.
- Dashboard uses react-native-chart-kit and contains at least two different chart types.
- Synthetic FAST-style records only; do not copy personal records or screenshots into the submitted application.
- Session-based attendance; 80% default threshold; unknown attendance is not absence.
- Calculations expose assumptions; university policies and demonstration settings retain distinct provenance.
- Forms provide specific validation, feedback and empty/changing states.
- Local service submission never implies submission to the university.
- Complete build first, followed by user review, phone testing and viva preparation.
- No runtime LLM, chatbot, model API, AI inference, API key, generated recommendation or model dependency is permitted. All app calculations and prioritization use explicit JavaScript rules.
- The application works offline after installation; no live FLEX scraping, backend, payment processing or authentication service. AI assistance is confined to development and its usage report.

## 1. Product purpose and boundaries

Problem: FLEX distributes attendance, assessment results, academic history, calendar windows and service statuses across separate pages. Students have to combine these manually to decide what needs attention. Flex++ brings related information together and allows bounded what-if planning.

The product is a synthetic-data university assignment application. Its main value is an actionable academic overview and course workspace, supported by readable portal services. Its signature interaction is a saved named plan that compares attendance, assessment and separately entered grade scenarios with current records, then creates linked actions. It does not claim to access live university records.

All eight areas below belong in the build. Depth is concentrated in the academic planners and meaningful service forms; other reference pages must remain usable and populated without inventing official mechanisms.

| Area | Views and concrete interactions |
|---|---|
| Home | Semester selector, summary cards, attention list, attendance bar chart, GPA trend line chart, pinned shortcuts, search by module/course. |
| Courses | Search/filter/sort list and unified detail workspace with Attendance, Marks, Tasks and Outcomes sections. |
| Attendance | Per-session history, present/absent/pending filters, threshold setting, recovery calculation, immediate absence capacity, future scenario planner. |
| Marks | Assessment categories and breakdowns, weighted earned score, published versus unresolved weight, numeric target calculator, score scenarios and available class-average comparison. |
| Academic history | Transcript, grade legend, semester detail, repeat markers, SGPA/CGPA trend and hypothetical grade/retake planner. |
| Planning | Study-plan completion status, next-semester shortlist, credits and prerequisite reasons, linked theory/lab handling, personal tasks and academic-calendar windows. |
| Finance | Challan and semester fee cards, ledger details, synthetic due/paid status, payment instructions, no payment-completion action. |
| Services/profile | Feedback form, withdrawal/retake/grade-change demonstration requests, checklist and history, profile, admit-card information, registration availability and private plan. |

PLO information is accessible through course Outcomes and a searchable report; it displays supplied synthetic outcome observations and missing-data states. It does not calculate a made-up university attainment formula or label an outcome passed/failed without a stated demonstration threshold.

## 2. Information architecture and mobile behavior

Home is an academic dashboard, not a wall of profile fields. A small header provides title, Back when applicable, and Home through ordinary buttons. Home contains a shortcut grid grouped by academic, planning and services functions. These are page content, not a persistent navigation bar.

Selecting a course opens its shared workspace. Inline section buttons change the course's active section; selection retains course and semester context. Other areas use vertical cards and selectors instead of desktop-width tables. Search returns labeled course and module results. Back restores the prior view/context; Android hardware Back follows the same behavior and allows normal app exit at Home.

Route state is deliberately simple:

```js
const [view, setView] = useState({ name: 'home', params: {} });
const [history, setHistory] = useState([]);
function openView(name, params = {}) {
  setHistory(previous => [...previous, view]);
  setView({ name, params });
}
// Render explicit branches: view.name === 'home' && <HomeScreen ... />.
```

Production implementation keeps route updates together and uses functional state updates to avoid stale history. No URL routing is necessary. Route validity is checked after reset or semester switching; a course unavailable in a selected semester produces an explanatory state rather than a broken screen.

Visual direction: light academic interface, navy text/header accents, teal primary actions, soft neutral surfaces, amber/red warnings with words/icons. Minimum 44–48-point targets, readable body text, generous card spacing, concise labels, and numeric input keyboards. Color is never the sole status signal. Avoid decorative graphs, fake login, gradients everywhere, excessive motion and unneeded theme settings.

Forms remain visible above the keyboard, use scrollable layouts and show field-level errors. A valid result never remains on screen after its inputs become invalid. Portrait Android is the principal acceptance target; web preview supports inspection but does not certify native behavior.

## 3. Data model and state ownership

Seed at least three terms: two completed historical terms and a current term, plus one no-record term (four distinct terms in total). Current courses include comfortably above threshold, exactly at threshold, below threshold but recoverable, no attendance, pending attendance, published marks, unpublished marks and a course with no marks. Include completed, overdue and future tasks; paid and unpaid fee examples; active and inactive service windows; submitted feedback; and draft/pending/completed synthetic requests. Use deterministic dates and a visible demo date so date-sensitive states remain reproducible.

Entities:

- `student`: synthetic name, degree, campus, batch, section; no CNIC/family identity needed.
- `semesters`: stable ID, label, chronological order, status and dates.
- `courses`: stable catalog ID, code, name, credits, type, prerequisites, optional linkedLabId.
- `enrollments`: unique attempt ID, courseId, semesterId, section, status and finalGrade.
- `attendanceSessions`: unique ID, enrollmentId, date, durationHours, presence (`present`, `absent`, `pending`), optional note.
- `assessments`: ID, enrollmentId, category, title, weightPercent, maxMarks, obtainedMarks or null, status (`scheduled`, `submitted`, `published`, `missed`), optional classMeanRaw.
- `outcomes`: courseId, outcome code/definition and nullable reported value, demonstration interpretation metadata.
- `academicEvents`: window/event type, start/end, exact source label and date semantics.
- `fees`: semesterId, original synthetic totals and collection records, challans, status and dueDate.
- `requests`: local ID, type, enrollment IDs, reason, remarks, attachment metadata, status, timestamps and history.
- `feedback`: enrollmentId, ratings, comment and local submission timestamp.
- `tasks`: ID, optional enrollmentId, title, due date, priority and completed state.
- `preferences`: selectedSemesterId, pins, attendance threshold and calculator assumptions.
- `plans`: named scenario records `{id, name, enrollmentScenarios, gradeAssumptions, shortlistedCourseIds, createdAt, updatedAt, baselineRevision}`. Each enrollment scenario stores future attended/missed counts, optional remaining-session limit, raw assessment assumptions and numeric target. Store inputs only; calculate results on demand.
- `revision`: incremented when baseline records or relevant calculation settings change. Tasks can contain optional `{planId, enrollmentId, kind}` source links.

Official-style seed records are read-only in ordinary screens. Students edit tasks, settings, planning scenarios, drafts and feedback. A clearly labeled Demo Data screen permits adding a synthetic course, changing attendance/marks and loading an empty dataset for live adaptation. These controls do not appear as edits to actual university records.

Keep derived results out of stored state: calculate them from raw records and preferences. Course edits automatically affect Home, details and relevant charts. All enrollment-scoped data uses enrollment IDs so repeated courses do not collide.

Persist local edits with AsyncStorage under a versioned key. Wait for hydration before writing; seed only when no prior data exists. Invalid/corrupt stored JSON shows a recoverable message and offers reset without crashing. Save failures show a retryable notice; never claim an edit is saved when it is not. Reset requires confirmation and clears drafts, plans and preferences to the seed state. Attachment URI accessibility can expire; reselect unavailable files rather than claiming upload persistence.

## 4. Calculation contracts

### Attendance

Let P be present sessions, A absent, U pending, H=P+A and t threshold as a fraction. Pending sessions are excluded from H and shown explicitly. When U>0, report the percentage as based on recorded sessions and results as provisional. H=0 returns no-data, not 0%.

- Current fraction: P/H.
- Recovery by consecutive attended sessions: smallest integer x>=0 satisfying `(P+x)/(H+x)>=t`. For 0<t<1: `max(0, ceil((t*H-P)/(1-t)))`, adjusted by an exact inequality check to avoid floating-point boundary errors.
- Immediate absence capacity: largest integer k>=0 satisfying `P/(H+k)>=t`, conventionally `floor(P/t-H)` followed by boundary verification. If already below threshold, return zero with below-threshold status, not a negative capacity.
- Future scenario: add nonnegative integer futurePresent and futureAbsent; projected fraction `(P+futurePresent)/(H+futurePresent+futureAbsent)`.
- If available remaining classes are supplied, identify when recovery needs more than remain. Unspecified remaining schedule never implies assured end-of-term recovery.
- Reject thresholds outside (0,100], fractional/negative session counts, non-finite values and blank required input. At 100%, a prior absence makes consecutive-attendance recovery impossible; a fully present course has zero immediate absence capacity.

Required fixtures at t=.8: P=7,H=10 recovery=5; P=8,H=10 capacity=0; P=9,H=10 capacity=1; P=0,H=0 no-data. P=7,H=10 plus 5 attended reaches exactly 80%; plus 4 remains below.

### Pending-attendance bounds

When H+U>0, show the recorded-entry result plus the conservative bounds `P/(H+U)` and `(P+U)/(H+U)`. These assume all pending entries eventually resolve as absent or present; the range is not a probability or university eligibility verdict. If H=0 and U>0, display no recorded percentage and 0–100% possible bounds. New future sessions do not resolve old pending sessions. Clearly label scenario results conditional on recorded entries, or include both bounds if pending entries are modeled.

### Marks

Each assessment's contribution is `weightPercent*obtainedMarks/maxMarks`. Published marks and explicitly missed assessments with zero count toward earned contribution. Unpublished submitted assessments have unresolved contribution, not a zero score. Scheduled assessment weights represent future work.

Validate positive maxMarks, finite scores in [0,maxMarks], nonnegative weights, unique IDs, and total scheme weight exactly 100 within a small arithmetic tolerance. An incomplete scheme permits display of published data but disables a whole-course target result with an explanation.

Show earned course points out of 100, assessed weight and performance within assessed weight as different values. Example: 12 earned points from 20 assessed weight is 60% on assessed work, not a final course score of 60%.

Target T with earned E and all unresolved/future weight R requires `(T-E)/R*100` average across unscored weight. If any of R is already submitted but unpublished, explicitly describe this as a combined requirement across unpublished and future results; do not call it the required final-exam mark. Allow a hypothetical score for unpublished work before producing a future-only requirement. Rates >100 are unattainable under the stated assumptions; rates <=0 mean already secured if scores cannot be revised; R=0 produces achieved/not-achieved rather than divide by zero.

An individual scenario accepts raw marks bounded by its maxMarks and recalculates weighted points. Letter-grade prediction appears only for an explicitly labeled configurable demonstration scale. Class comparison uses matching assessment units; no percentile/rank is inferred from a mean and standard deviation.

Fixture: weights 20+30+50; published first assessment 8/10 earns 16; published second 20/30 earns 20; remaining 50; target 70 requires 68% on the remaining assessment. An unposted second score must not use that 20-point contribution.

### GPA

Grade points: A+/A=4, A-=3.67, B+=3.33, B=3, B-=2.67, C+=2.33, C=2, C-=1.67, D+=1.33, D=1, F/FA=0. Exclude W, I, pending grades and non-credit coursework from GPA denominator. Treat zero denominator as unavailable.

Historical SGPA uses grades in that term, including repeat attempts actually taken in that term. CGPA selects the latest finalized GPA-counting attempt of each repeated course up to the requested cutoff. Pending/I/W attempts do not silently erase the last finalized result; disclose excluded records. This handling of unfinished repeats is an explicit demonstration convention, not a claim that the supplied policies specify every pending-repeat edge case. Keep replacement-course cases separate and exclude them from the synthetic dataset unless a specific replacement rule is implemented and explained.

Hypothetical planner clones finalized records and adds/replaces assumed finalized outcomes; it never overwrites transcript data. Example: 3-credit A plus 1-credit B => 3.75; old 3-credit A repeated with B => CGPA contribution becomes 3.00, not 4.00 and not an average of attempts. A W course does not enlarge GPA denominator.

### Saved plans and action creation

A plan may span selected current courses. Compare baseline and scenario attendance, weighted points and explicitly assumed GPA in separate cards; there is no blended academic score. Scores never automatically become letter grades. The GPA projection requires explicit grade assumptions or a selected, labeled demonstration grade scale. For marks uncertainty, hold scheduled-work assumptions fixed and show lower/upper outcomes only for submitted unpublished weights; if future work is also unknown, label the wider range accordingly.

Save, rename, duplicate and delete plans; preserve form inputs on Back. When baselineRevision differs from state revision, show “Records changed; results recalculated” and recalculate from the current baseline. Do not present a stale snapshot as a current result. A missing referenced course/assessment disables the affected result with a repair action. An unattainable result is saveable as an exploratory plan but never marked achieved.

“Add recovery goal” and “Create preparation task” open a prefilled task form linked to plan/course. A recovery goal may record a session count without assigning invented class dates. Student selects the deadline; repeatedly tapping the same action must not create duplicates before confirmation. Completing a task does not change attendance, marks or university status.

### Attention and dates

Use deterministic explicit rules: below attendance threshold, small absence margin, pending records, overdue unfinished task, approaching fee date and open service window. Every attention item has a reason and destination. Separate informational missing-data notices from urgent items. Sort by severity, then deadline, then stable ID. No opaque numeric academic risk score.

Use local calendar dates for deadlines and inclusive end dates when windows use dates. Store a demo date, avoid locale-dependent string parsing, and distinguish event dates from timestamps. Completed tasks disappear from urgent lists. Closed windows remain visible with explanation and historical statuses.

## 5. Service workflow depth

All simulations have an inline demonstration label and local IDs. Request transition: editable draft -> review -> simulated submitted/pending. Seed history can include approved/rejected examples, but application approval is not automatic. Saved drafts can be edited/deleted; submitted simulations become read-only and use history for updates.

- Feedback: course/window selection, required 1–5 ratings and optional comment, review, local confirmation. Inactive window blocks new feedback while retaining old submitted status.
- Withdrawal: linked course selection, acknowledgement of no-refund/approval requirements, remarks, required demonstration attachment checklist, review and simulated request.
- Retake: course + assessment selection, reason, required PDF metadata validated below 3 MB, remarks and rules checklist. Avoid computing official eligibility from a selected reason alone.
- Grade change: eligible historical course list, reason (assessment error, missing marks, final-exam recheck), remarks and distinct date guidance; no hardcoded conflation of seven-day recheck and two-week grade-change windows.
- Registration: window status, course shortlist, credits, prerequisite and linked-lab reasons; saving is private planning only.
- Admit card: show availability/information, no invented official document or forged card.
- Fees: fee ledger and status, concise payment guidance with synthetic references; no pretend payment button or invented real destination.
- Attachment picker reads filename/type/size locally; files are not uploaded. No unnecessary access to personal documents is required for the demo. Provide synthetic attachment fixtures as an explicitly labeled demonstration option.

## 6. Policy provenance

80% minimum comes from supplied 2025 prospectus pages 171–173; session weighting is the user's clarification. GPA and repeat rules are in both documents; explicit formula in 2023 section 2. Exclusions for I/W and FA points are explicit in the 2025 extract. Assessment normal split is a default with exceptions, not a universal class scheme.

2023 final-exam recheck window and observed FLEX grade-change window remain separate. FYP, summer, financial-support and award edge cases with source discrepancies receive informational source-specific notes, not definitive app eligibility. Course prerequisites, offerings, deadlines and assessment weights in seed data are synthetic demonstration settings.

Sources for documentation: supplied SMD Assignment 1; exported conditional-rendering class example; FLEX_REFERENCE.md and FLEX_OPPORTUNITIES.md with 45 desktop captures; 2025 prospectus extract; August 2023 undergraduate handbook. Do not bundle personal reference screenshots into a public repository.

## 7. Dependency and runtime gate

The exported class example uses Expo SDK 54, but this does not guarantee compatibility with the user's installed Expo Go. Choose a compatible stable blank JavaScript template at execution, record exact resolved versions and preserve the lockfile. Install Expo-bound dependencies via expo install. Do not add a router to accommodate a default template.

Official guidance: https://docs.expo.dev/workflow/upgrading-expo-sdk-walkthrough/ and https://docs.expo.dev/troubleshooting/expo-go-version-mismatch/ explain Expo Go/SDK matching and Android-specific compatible client options. Chart package upstream: https://github.com/chart-kit/react-native-chart-kit. Use the public package required by the assignment, not a paid add-on.

Before full UI, mount a line and bar chart with native SVG, save/read a sample local record, run dependency diagnostics and export a bundle. Compatibility is verified by those results, not by version numbers alone. Phone smoke test remains necessary. An environment unable to reach package registries must report that constraint and deliver source honestly without claiming a passing build.

## 8. Code organization

```text
App.js                         explicit view switch and top-level state
src/app/useAppData.js           hydration, persistence, controlled actions
src/app/viewState.js            plain view/history state helpers
src/data/seed.js                deterministic synthetic dataset
src/data/policies.js            source-tagged rules and demo assumptions
src/domain/attendance.js        pure session calculations
src/domain/marks.js             weighted marks and targets
src/domain/gpa.js               grades, attempts and hypothetical GPA
src/domain/planning.js          prerequisites, linked labs and credits
src/domain/scenarios.js         named plan validation and comparisons
src/domain/attention.js         explainable priority items
src/domain/validation.js        common field/date/file validation
src/ui/theme.js                palette, spacing and text styles
src/ui/components.js           Button, Card, Field, Status, EmptyState
src/features/home/             HomeScreen and chart wrappers
src/features/courses/          list and shared course workspace
src/features/attendance/       history and attendance planner
src/features/marks/            assessments and target/scenario views
src/features/history/          transcript and GPA planner
src/features/planning/         study plan, registration plan, calendar/tasks
src/features/scenarios/        named plans, comparisons and action creation
src/features/finance/          fees/challans/details
src/features/services/         forms, review, request history, feedback
src/features/profile/          profile and document information
src/features/demo/             synthetic data adaptation controls
tests/                         domain behavior tests
docs/                          demo script, viva guide, source/policy notes
README.md                      purpose, features, setup and limitations
AI_USAGE_REPORT.md             truthful assistance/review/testing record
```

Pure GPA helpers accept normalized attempt records `{courseId, semesterOrder, credits, grade, status}`; selectors map enrollment `finalGrade` to `grade` and catalog credits to `credits`. Assessment helpers consume the exact assessment fields in section 3. Use named exports for pure helpers and clear component exports. Components receive records, computed summaries and callbacks through props. Local transient input state stays in the form; shared plans and persisted records stay in useAppData. No global state framework, generic form-builder engine, networking abstraction or separate database.

## 9. Acceptance and submission

Required demonstration: Home chart and attention -> below-threshold course -> recovery scenario -> course marks target -> save named multi-course plan -> compare separate outcomes -> create linked task -> task appears on Home -> hypothetical repeat-grade comparison -> service form invalid/valid review -> local submitted history -> empty semester -> demo data edit -> charts update -> restart persistence.

Verify all specified boundary fixtures, unknown versus zero, threshold rounding, impossible recovery, unreachable marks target, repeat CGPA, exclusions, pending-record bounds, scenario refresh after data changes, source-linked task creation, date boundaries and closed windows. Verify UI at approximately 360 and 390-point widths with large text where feasible, keyboard access, chart labels, long course names and hardware Back on Android.

Submission: complete source ZIP with lockfile and no node_modules; README; policy/source notes; screenshots or short video; AI usage report; viva guide and live-change exercises. GitHub repository should be private until the applicable deadline has passed; user has not provided current submission arrangement, so do not publish publicly or submit to GCR autonomously. AI report template is outstanding; use an honest provisional report that can be mapped to the template. Do not fabricate screenshots, phone tests, build success or submission status.

## 10. Executable task sequence

### Task 1: Establish runtime, shared shell and representative data

**Files:** App.js, package.json, lockfile, app.json, src/data/seed.js, src/ui/theme.js, src/ui/components.js, src/features/home/ChartSmoke.js.

**Interfaces:** seed exports `createSeedState()` returning a fresh serializable dataset; UI exports Button/Card/Field/Status/EmptyState; chart smoke consumes finite numeric arrays.

- [ ] Create blank JavaScript Expo project and install chart-kit, Expo-compatible SVG, AsyncStorage, icons and document picker. Preserve exact dependency versions. Configure `package.json` with `"type": "module"` and `"scripts": {"test": "node --test"}` alongside Expo run scripts so pure JavaScript imports work in Node tests.
- [ ] Build the header and explicit conditional view switch; use `const [activeView, setActiveView] = useState('home')` before expanding to named view objects.
- [ ] Populate seed entities defined in section 3; validate IDs and references, and expose the fixed demo date.
- [ ] Mount both required chart types and perform a storage round trip; run `npx expo-doctor` and `npx expo export --platform android`. Record actual output.
- [ ] Commit runtime shell only after the available smoke checks pass. If native client matching is unresolved, record the needed phone check.

### Task 2: Implement attendance mathematics and interaction

**Files:** src/domain/attendance.js, tests/attendance.test.js, src/features/attendance/AttendanceView.js, AttendancePlanner.js.

**Interfaces:** `summarizeAttendance(sessions, thresholdPercent)` returns status, present, absent, pending, held, percent, recoverySessions, immediateAbsenceCapacity; `projectAttendance(summary, futurePresent, futureAbsent, remainingSessions)` returns fraction, thresholdMet, scheduleFeasible and validation errors.

- [ ] Write the boundary fixtures from section 4 before implementing calculations. Representative test:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeAttendance } from '../src/domain/attendance.js';
test('seven present out of ten needs five consecutive classes', () => {
  const sessions = Array.from({length: 10}, (_, i) => ({presence: i < 7 ? 'present' : 'absent'}));
  assert.equal(summarizeAttendance(sessions, 80).recoverySessions, 5);
});
```

- [ ] Run `node --test tests/attendance.test.js`, verify intended failure, then implement the exact inequalities and no-data/100% branches.
- [ ] Bind history filters and validated numeric fields to the functions. Show recorded/pending counts and assumptions with each result.
- [ ] Run tests and verify the 7/10 -> 12/15 interaction plus empty data manually.

### Task 3: Implement marks and target scenarios

**Files:** src/domain/marks.js, tests/marks.test.js, src/features/marks/MarksView.js, MarksPlanner.js.

**Interfaces:** `summarizeMarks(assessments)` returns earnedPoints, publishedWeight, unresolvedWeight, futureWeight, schemeValid and errors; `calculateTarget(summary, targetPoints)` returns requiredPercent/status; `projectMarks(assessments, hypotheticalRawScores)` returns projected points and assumption notes.

- [ ] Add tests for 16+20 earned points, target 70 requiring 68%, unpublished versus zero, missing 100-weight scheme, impossible target and zero remainder.

```js
assert.equal(calculateTarget({earnedPoints:36, unresolvedWeight:0, futureWeight:50, schemeValid:true}, 70).requiredPercent, 68);
```

- [ ] Implement assessment statuses and whole-course validation; preserve raw versus weighted units.
- [ ] Build category cards, expanded assessment detail and target/scenario form. Require explicit hypothetical treatment before a final-exam-only result with unresolved marks.
- [ ] Run domain tests and verify invalid input clears prior results.

### Task 4: Implement history and GPA planning

**Files:** src/domain/gpa.js, tests/gpa.test.js, src/features/history/HistoryScreen.js, GpaPlanner.js.

**Interfaces:** `calculateSGPA(attempts)` returns value/includedCredits/exclusions; `calculateCGPA(attempts, semesterOrder)` returns value, countedAttemptIds and exclusions; `projectGPA(attempts, scenarios)` returns separate hypothetical summary.

- [ ] Test 3-credit A+1-credit B=3.75, lower latest repeat, historical cutoff, W/I/FA and non-credit courses, and empty denominator.

```js
assert.equal(calculateSGPA([{credits:3, grade:'A'}, {credits:1, grade:'B'}]).value, 3.75);
```

- [ ] Implement grouping by stable course ID and finalized applicable attempt, retaining semester results independently.
- [ ] Build transcript search/filter, grade legend, excluded-grade explanations and hypothetical grades; never mutate transcript from a scenario.
- [ ] Verify trend data comes from the same calculator used in semester detail.

### Task 5: Wire shared course context, tasks, attention and persistent edits

**Files:** src/app/useAppData.js, src/app/viewState.js, src/domain/scenarios.js, tests/scenarios.test.js, src/features/scenarios/ScenariosScreen.js, ScenarioEditor.js, src/domain/attention.js, src/domain/validation.js, src/features/courses/CoursesScreen.js, CourseScreen.js, src/features/planning/TasksScreen.js, CalendarScreen.js, src/features/home/HomeScreen.js.

**Interfaces:** hook returns `{state, hydrated, saveStatus, actions}`; actions include `saveTask`, `toggleTask`, `deleteTask`, `savePlan`, `duplicatePlan`, `deletePlan`, `setPreference`, `resetDemo`; `compareScenario(plan, state)` returns per-enrollment baseline/projected attendance and marks, independently assumed GPA, staleBaseline and field errors; `buildAttentionItems(state)` returns stable `{id,severity,reason,view,params,dueDate}` items.

- [ ] Create serialized versioned-state load/save with hydration guard, corrupt-state recovery and write-failure feedback.
- [ ] Implement enrollment-aware course list and detail section switching using plain props/callbacks.
- [ ] Implement task form: trimmed nonempty title, valid due date, optional course, priority; toggle/delete and overdue filters.
- [ ] Build saved plan list/editor/comparison, rename/duplicate/delete, baseline-revision refresh and prefilled source-linked task creation. Test that score assumptions never silently alter grade assumptions, a baseline change recalculates results, and plan/task operations leave academic records unchanged.
- [ ] Generate attention reasons and charts from shared records; test completed-task removal and threshold change affecting priority.

```js
const completedTaskState = createSeedState();
completedTaskState.tasks = completedTaskState.tasks.map(task => ({...task, completed:true}));
assert.equal(buildAttentionItems(completedTaskState).some(item => item.id.startsWith('task:')), false);
```

- [ ] Manually restart and verify edits persist, reset is confirmed, and Home/course/marks views agree.

### Task 6: Implement study and registration planning

**Files:** src/domain/planning.js, tests/planning.test.js, src/features/planning/StudyPlanScreen.js, RegistrationPlanScreen.js.

**Interfaces:** `evaluateCoursePlan(courseIds, state)` returns credits, missingPrerequisites, missingLinkedCourses and sourceTaggedNotices.

- [ ] Test credit totals, passed prerequisite versus current enrollment, missing prerequisite and linked-lab dependency.

```js
const planState = createSeedState();
planState.courses.push({id:'course-a', code:'DEMO2', name:'Demo Advanced', credits:3, prerequisites:['missing-course']});
assert.equal(evaluateCoursePlan(['course-a'], planState).missingPrerequisites.length, 1);
```

- [ ] Build completed/current/planned filters and checklist-backed shortlist saving.
- [ ] Display offerings and prerequisites as demo data, approval exceptions as informational; avoid official enrollment language.
- [ ] Verify plan edits remain separate from current enrollment and completed credits are not double-counted for repeats.

### Task 7: Implement finance, profile, outcomes and document information

**Files:** src/features/finance/FinanceScreen.js, FeeDetailScreen.js, src/features/profile/ProfileScreen.js, DocumentScreen.js, src/features/courses/OutcomesView.js.

**Interfaces:** read shared seed fee/profile/outcome data; use `openView` for drill-downs; do not modify balances or trigger external payments.

- [ ] Build readable semester/challan cards, due/paid filters and detailed ledger; keep amounts and statuses synthetic and internally consistent.
- [ ] Add concise payment guidance without a fabricated payment destination or payment success flow.
- [ ] Build course/outcome search and missing-value explanations; use provided values only, no invented attainment formula.
- [ ] Build minimal profile and admit-card availability explanation; verify unavailable and populated states.

### Task 8: Implement service forms and local history

**Files:** src/features/services/ServicesScreen.js, RequestForm.js, RequestReview.js, RequestHistory.js, FeedbackForm.js, src/domain/validation.js, tests/validation.test.js.

**Interfaces:** `validateRequest(type, draft, state)` returns field errors; `submitLocalRequest(draft)` adds local pending record/history; `saveFeedback(record)` records local feedback. Both actions enforce availability and validation again at commit.

- [ ] Test empty selection, missing reason/remarks requirements, wrong file type, size boundary, duplicate feedback, closed windows and linked course selection.

```js
const requestState = createSeedState();
const invalidDraft = {enrollmentIds:[], reason:'illness', remarks:'Demo request', attachment:{name:'scan.jpg', mimeType:'image/jpeg', sizeBytes:100}};
assert.ok(validateRequest('retake', invalidDraft, requestState).attachment);
```

- [ ] Build draft -> review -> confirmation interactions; preserve draft after Back and make submitted records read-only.
- [ ] Add local document selection and explicitly labeled synthetic attachment option; show file name/size without claiming upload.
- [ ] Keep feedback availability separate from past submission status; show date guidance by request type.
- [ ] Verify invalid submission never creates history and valid simulation creates one record only.

### Task 9: Add live adaptation controls and complete regression checks

**Files:** src/features/demo/DemoDataScreen.js, tests/seed.test.js, docs/verification.md.

**Interfaces:** demo-only actions edit validated seed-style records and drive normal selectors; `resetDemo()` returns a fresh baseline.

- [ ] Add course, attendance and assessment updates with validation; implement empty dataset scenario and reset.
- [ ] Test referential integrity, 100-weight schemes, repeat identity, and no accidental personal information in source/assets.
- [ ] Run `node --test`, Expo diagnostics and Android bundle export. Inspect all eight areas through the full demo path.
- [ ] Check small-width layout, chart finite/empty data, field focus/keyboard, duplicate taps and Android hardware Back on actual device when available.
- [ ] Record pass/fail/unverified distinctly; fix observed failures before claiming completion.

### Task 10: Package submission and prepare viva

**Files:** README.md, AI_USAGE_REPORT.md, docs/policy-sources.md, docs/demo-script.md, docs/viva-guide.md, screenshot/video artifacts, source ZIP.

- [ ] Document run commands, resolved SDK/client guidance, synthetic data, simulation boundaries and app purpose.
- [ ] Write truthful AI report with decisions, reviewed generated code, discovered failures and actual checks; mark the missing instructor template as an external dependency.
- [ ] Capture actual app screenshots: Home with two chart types, attendance scenario, marks target, saved plan comparison, linked action, GPA planner, service validation/review and empty state.
- [ ] Prepare five-minute viva walkthrough: component/props structure; state/events; array methods/calculations; change threshold/course/filter; explain design and AI review.
- [ ] Package source and documents without dependencies, caches, private reference screenshots or unrelated files. Include package lock and exact setup.
- [ ] Produce final verification summary. Repository creation/push and GCR submission need the user's destination/account details; do not claim those are complete from a ZIP alone.

## Self-review disposition

Every assignment core requirement has a concrete home: problem/Home; mobile/runtime; React/JS shared state and domain functions; interaction/planners/services; data-driven lists/charts; input/task and request forms; alternative states/seed and demo controls; reusable UI; usability/mobile checks; two chart types/Task 1 and 5; documentation and viva/Task 10. All fifteen observed portal modules are represented or deliberately consolidated in the eight-area specification. Calculations and services have separate verification gates. No UI-only mirror tests are required; tests target arithmetic, data identity and workflow failures.

Remaining external dependencies: instructor AI-report template, actual phone/client verification, GitHub destination and current submission arrangement. None prevents implementation of the specified app. No unresolved product-choice questionnaire is required.

## Final review and scope lock

| Review gate | Finding and final decision | Verification during build |
|---|---|---|
| Assignment fit | All A–J requirements, two required chart types, source/docs/evidence and viva are mapped to tasks. | Task 9 integration walkthrough; Task 10 deliverable inventory. |
| Runtime AI | Previous “not required” wording was too weak. Runtime AI is expressly prohibited. | Check source/dependencies for inference clients, API calls and secrets; inspect offline behavior. |
| Creativity | Isolated calculators were useful but not a coherent signature. Saved plans and linked actions are committed scope. | Save/duplicate/compare plan, create task, change baseline and verify refresh. |
| Scope coherence | Broad portal coverage retained; overlapping grade/history pages consolidated. No invented official document/payment workflow. | Every module has a meaningful view or clearly explained state. |
| Calculation correctness | Attendance/marks/GPA examples checked; pending bounds and unknown results specified. | Pure-function fixtures and data identity tests before UI completion. |
| Grade prediction | Numeric assessment outcomes cannot establish relative grades. | Require explicit grade assumptions; no hidden score-to-grade conversion. |
| Repeat records | Historical term results differ from current cumulative latest-attempt calculation. | Lower repeat grade and historical cutoff fixtures. |
| Data changes | Stored derived results and stale plans could contradict current records. Store inputs and recompute. | Edit baseline; verify dashboard, plan and course summaries agree. |
| Persistence | Hydration/write races and damaged saved data require explicit behavior. | Load, edit, restart, corrupt-state and failed-save checks. |
| Policy uncertainty | Supplied editions do not establish every current campus rule. | Versioned notes and demonstration assumptions; no false eligibility guarantees. |
| Delivery honesty | Source/bundle checks do not prove actual-device success. | Report code, bundle, preview, phone and submission status separately. |

Arithmetic review fixtures: recovery 7/10 -> 12/15=80%; immediate absence capacity 9/10 -> 9/11>=80%, 9/12<80%; earned marks 16+20=36, remaining target contribution 34/50=68%; 3-credit A plus 1-credit B yields (12+3)/4=3.75. These are checks of the specification, not executed application tests.

Frozen build boundaries: eight portal areas plus the named-plan workflow; session-count attendance; numeric marks targets; explicit-grade GPA projections; source-aware policy notes; offline local persistence; selected local service simulations; no runtime LLM. New features require a concrete improvement to the agreed workflow and must not displace verification or increase viva complexity without benefit.
