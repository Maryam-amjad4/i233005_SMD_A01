# Architecture and maintenance notes

For whoever picks this up next. `docs/implementation-plan.md` is the original
specification and `docs/implementation-plan-amendment.md` is the release-scope
amendment that retires four feature families; `docs/verification.md` is the
evidence. This file is the part that is only knowable from having built it: how
the pieces fit, which decisions were judgement calls, what was deliberately
retired, and what will bite you.

## 1. Orient in 60 seconds

```bash
npm install
npm run verify      # tests + static checks + screen mounts + persistence + store contracts
npm start           # Expo dev server, scan the QR with Expo Go
```

The demo date is **3 Oct 2026** and is fixed in `src/data/seed.js`. Every
date-dependent state is computed from it, so the demo is reproducible on any
day. Change that constant and the whole dataset shifts; several tests assert
figures derived from it.

## 2. How a change flows

```
seed.js  ──▶  domain/*.js  ──▶  useAppData  ──▶  features/*/  ──▶  App.js
 (records)   (pure maths)      (the only      (render only)      (which view)
                              mutable state)
```

The load-bearing rule: **`src/domain/` never imports React and never mutates
anything.** Every function takes records and returns a new value plus the
numbers needed to explain it. This is what makes the app testable in plain Node
and what keeps a screen from quietly inventing a result.

The second rule, and the one most likely to be broken by accident: **store
inputs, calculate on render.** A saved plan holds only assumptions — never a
derived grade, never a computed percentage. That is why editing a mark on the
Demo data screen changes what a saved plan *displays* instead of leaving a stale
snapshot. `compareScenario()` in `src/domain/scenarios.js` recomputes on every
render and compares `baselineRevision` against the live revision to decide
whether to warn.

Third rule: **missing is never zero.** A module with no session records returns
`percent: null`, not `0`. An unpublished assessment is "unresolved weight", not
zero and not earned. Pending attendance appears in both bounds and is never
counted as an absence. If you add a number to this app, ask what happens when
the underlying record does not exist — that is the question the whole test suite
is built around.

## 3. Where things live

| Concern | File | Notes |
|---|---|---|
| Dataset | `src/data/seed.js` | ~700 lines of literals. All synthetic. `createEmptyState()` returns the same shape with no records. |
| Policy provenance | `src/data/policies.js` | Every rule carries its source. The GPA convention note is rendered to the user, not just a comment. |
| Attendance maths | `src/domain/attendance.js` | `summarizeAttendance`, `projectAttendance`, `recoveryByConsecutiveAttendance`, `pendingBounds`. |
| Marks maths | `src/domain/marks.js` | `summarizeMarks`, `projectMarks`, `calculateTarget`. |
| Grades | `src/domain/gpa.js` | `attemptsFromState`, `calculateSGPA`, `calculateCGPA`, `projectGPA`. |
| Saved plans | `src/domain/scenarios.js` | `compareScenario`, `summarizePlan`, `createEmptyScenario`. Inputs only; no stored results. |
| Study summary | `src/domain/planning.js` | Only `studyPlanSummary` remains (completed / in-progress / planned buckets, read by Profile). The registration/prerequisite evaluator was removed with the retired family. |
| Attention list | `src/domain/attention.js` | `buildAttentionItems` — every item states a reason and a destination. |
| Validation | `src/domain/validation.js` | `isRealNumber`, `windowStatus`, every field validator, `formatDate`. |
| Shared wording | `src/domain/wording.js` | Due dates, window states, course labels. **Use this rather than writing another copy** — four screens used to disagree about the same overdue task. |
| View state | `src/app/viewState.js` | `navigationReducer`, `canGoBack`, `checkViewValidity`. Pure, tested. |
| Storage | `src/app/useAppData.js` | The only place state changes. Versioned key `flexpp:state:v1`. |
| Shared UI | `src/ui/components.js` | `Button`, `Card`, `Field`, `Status`, `Banner`, `EmptyState`, `ProgressBar`, `Chip`, … |
| Theme | `src/ui/theme.js` | `HIT_TARGET = 46`. Interactive elements should use it. |
| Charts | `src/features/home/ChartSmoke.js` | Bar + line wrappers. The filename is the plan's, not a description; rename it if you like. |

Screens are grouped by feature under `src/features/`: `home`, `courses`,
`attendance`, `marks`, `history`, `planning`, `scenarios`, `finance`, `profile`,
`demo`. Each screen takes `{ state, actions, openView, params }` and renders.
There is no navigation library by requirement: `App.js` holds a view name in
state and an `if` chain renders the screen.

## 4. Traceability: plan section → what exists → how it is checked

Four feature families were retired from the release (see section 5), so the
original plan's tasks 6 and 8 have no delivered product, and task 7 is split.

| Original plan task | Status | Delivered in | Checked by |
|---|---|---|---|
| 1 · runtime, shell, representative data | implemented | `App.js`, `src/ui/**`, `src/data/seed.js` | `tests/seed.test.js`, `npx expo export` |
| 2 · attendance mathematics and interaction | implemented | `src/domain/attendance.js`, `src/features/attendance/**` | `tests/attendance.test.js`, screen mounts |
| 3 · marks and target scenarios | implemented | `src/domain/marks.js`, `src/features/marks/**` | `tests/marks.test.js`, driven target field |
| 4 · history and GPA planning | implemented | `src/domain/gpa.js`, `src/features/history/**` | `tests/gpa.test.js`, `tests/historyTrend.test.js`, screen mounts |
| 5 · course context, tasks, attention, persistence | implemented | `src/domain/attention.js`, `src/app/useAppData.js`, `src/features/courses/**`, `src/features/planning/**` | `tests/attention.test.js`, `npm run persistence`, `npm run store` |
| 6 · study and registration planning | **retired** | — | removed with its tests |
| 7 · finance and profile | implemented | `src/features/finance/**`, `src/features/profile/**` | screen mounts |
| 7 · outcomes and documents | **retired** | — | removed with its tests |
| 8 · service forms and local history | **retired** | — | removed with its tests |
| 9 · live adaptation controls, regression | implemented | `src/features/demo/**`, `scripts/**` | `npm run verify` |
| 10 · package and viva | implemented | `scripts/package-submission.mjs`, `scripts/verify-archive.mjs`, `docs/` | `npm run package`, `npm run verify:archive` |

Saved-plan and course-workspace regressions are covered by
`tests/scenarios.test.js`, `tests/scenariosRegression.test.js`,
`tests/scenariosView.test.js`, `tests/coursePlanFlow.test.js` and
`tests/planningRegression.test.js`.

## 5. Retired scope

Four families from the original plan were **deliberately removed** from this
release:

- **Service simulations** — withdrawal, retake, grade change, request forms,
  review/history, attachments and course feedback.
- **Registration and study-plan planning** — the registration shortlist and
  prerequisite / linked-course planning (with the `evaluateCoursePlan`
  evaluator).
- **PLO / outcomes reporting.**
- **Official-document information** (admit card).

Their screens, view names, attention items, store actions and validators were
removed, and the tests that asserted them were removed (test count fell from 251
to 193). What remains deliberately:

- The persisted fields `requests`, `feedback`, `outcomes` and
  `shortlistedCourseIds` are still **tolerated** in the storage schema, so data
  saved by an earlier build hydrates without a schema error. Nothing in the
  release reads them as active features. `src/domain/planning.js`'s
  `studyPlanSummary` reads `shortlistedCourseIds` when present and ignores it
  when absent.
- The academic calendar still lists synthetic windows (including request-window
  names) as read-only `state.academicEvents` entries with demonstration dates.
  They are calendar data, not workflows: nothing books, submits or decides
  anything.

## 6. Decisions that were judgement calls

These are the places the plan did not fully determine the answer. Each is
recorded in the product itself, not only here.

**F/FA count toward the GPA at 0 points.** The plan's grade table assigns
F/FA zero points and its exclusion list names only W, I, pending grades and
non-credit coursework — but it also lists F/FA among the GPA test fixtures, so
the plan contradicts itself. Counting a fail is the honest reading: dropping the
credits would make the CGPA *improve* the more a student failed. Stated in the
History screen and in `docs/policy-sources.md`. Effect: CGPA 2.8424 over 17
credits, not 3.4514 over 14.

**"Recovery sessions" is `null`, not `0`, when there are no records.** A module
with zero published sessions has nothing to recover from. Returning `0` invited
a task titled "attend 0 consecutive sessions". The UI refuses to offer a
recovery goal in that case.

**A grade is predicted only from a fully resolved scheme.** The opt-in
demonstration grade scale maps assessed performance onto letter bands. Running
it on 20% assessed weight told a student with 8/10 that the scale "would predict
grade F" while 80% of the scheme was unpublished. The prediction now requires
`schemeValid && unresolvedWeight === 0 && futureWeight === 0` and otherwise
refuses, stating the unresolved and scheduled weight.

**`isRealNumber`, not `Number.isFinite(Number(x))`.** The looser form is `true`
for `null`, `''` and `NaN`, which is precisely the bug class this app must not
have. It lives in `src/domain/validation.js` and is used at every boundary where
a measurement enters a chart or a status line.

**Charts omit unmeasurable points rather than plotting zero,** and name what
they omitted in the caption. A chart with a gap is honest; a zero-height bar is
a lie.

**The plan asks for an "SGPA/CGPA trend"; the line chart plots cumulative GPA.**
Per-term SGPA is available on the History screen. Adding an SGPA series is a
small, contained change if you want it.

**Four terms in the dataset, three carrying records.** The plan describes two
completed terms plus a record-free term. The extra term keeps the demo-date
arithmetic meaningful; the record-free term is reachable from the semester
selector.

## 7. Adding things safely

**A new screen.** Create it under `src/features/<area>/`, accept
`{ state, actions, openView, params }`, add its name to `VIEW_TITLES` in
`App.js`, and add a branch to the view switch. Add a mount to
`scripts/smoke-render.mjs` with at least one expectation about what the user
must read. Use `EmptyState` for the no-data case and `Banner`/`Status` to
explain rather than to decorate.

**A new calculation.** Put it in `src/domain/`, take records, return the value
*and* the inputs it was derived from so the screen can show its working. Never
compute a GPA, percentage or grade inside a component.

**A new piece of user-facing wording.** Use `src/domain/wording.js`. If two
screens can describe the same state, they must use the same function; a
divergent copy is how "Overdue by 3 days" and "Passed 3 days ago" ended up on
two screens for the same task.

**A new check.** `node --test tests/<name>.test.js` for pure logic;
`scripts/smoke-render.mjs` for anything that renders. Before trusting a new
check, break the thing it guards and confirm it fails. A check that passes
before and after a change proves nothing — that mistake shipped five defects
past a green suite once already.

### The screen harness, and its two sharp edges

`scripts/smoke-render.mjs` mounts real screens in Node with React Native
stubbed. It is not a device render and draws nothing. Two behaviours will waste
your time if you do not know them:

- **`handle.tree` is captured at mount time and never updated.** `rerender()`
  *returns* the new tree; the handle's own property still points at the old one.
  Searching `handle.tree` after a state change silently inspects a stale render.
- **Pressing a control does not re-render.** A press schedules a state update;
  call `handle.rerender(props)` yourself before looking for what the press
  produced. And after typing, re-render before pressing Save, or the save
  handler reads the previous render's draft — exactly as a stale closure would.

The stub honours `useEffect` dependency arrays and refuses to run more than 200
render passes, turning an effect loop into a reported failure instead of a hang.

## 8. Open items, in the order they will matter

1. **Nothing has run on a real device.** Layout, scrolling, the keyboard,
   chart animation and the Android hardware Back button are unverified. The
   back path is wired and unit-checked at the reducer level only.
2. **No screenshots or demonstration video exist.** The submission wants one or
   the other. They require a device or a browser.
3. **The record-free term is only visible through the semester selector.**
   `HistoryScreen` shows a term with no rows as an empty term (rather than
   dropping it), but the transcript still filters by the semester selector, so
   the term is not obvious unless you switch to it.
4. **`actions` is memoised on `[mutate, persist, state]`,** so it gets a new
   identity on every state change and the `useMemo` buys nothing. Harmless at
   this size; it will matter if the app grows.
5. **`persist` runs inside a `setState` updater.** React may invoke an updater
   more than once, which would mean a duplicate disk write and some save-status
   churn. Moving the write into an effect keyed on state would be cleaner.
6. **The screen harness stubs the charts**, so chart-kit's own rendering is not
   exercised anywhere in Node. Only the data handed to it is checked.

## 9. The checks, and what each is for

| Command | Purpose | Needs a device? |
|---|---|---|
| `npm test` | 193 unit tests over the pure domain and validation | no |
| `npm run check` | import resolution, dead modules, hook-rule violations | no |
| `npm run smoke` | 43 screen mounts, honesty rules, driven form fields | no |
| `npm run persistence` | write → close → reopen, plus three storage failure modes | no |
| `npm run store` | 38 store-contract checks: write ordering, failure modes, schema | no |
| `npm run fixtures` | prints every figure quoted in the docs | no |
| `npm run figures` | recomputes the GPA figures the demo script quotes | no |
| `npm run package` | builds the submission ZIP | no |
| `npm run verify:archive` | asserts the ZIP has what it must and none of what it must not | no |
| `npx expo-doctor` | dependency compatibility | network for one check |
| `npx expo export --platform android` | proves the bundle compiles | no |

`npm run verify` runs the first five. Regenerate the document figures with
`npm run fixtures` after any change to the domain or the seed, and update
`docs/demo-script.md` if the output moved.
