# Viva guide — Flex++

Five minutes, five questions, one live change. Everything below points at a file
so you can open it while you talk.

---

## 1. Application structure (≈1 min)

> "The whole app is one dataset and pure functions over it. `App.js` owns the
> dataset and the view state; every screen receives the dataset, the actions and
> the current view through props, and re-renders when they change."

Show this order:

| Layer | File | Responsibility |
|---|---|---|
| Shell | `App.js` | Header, conditional view switch, hardware Back, save status |
| View state | `src/app/viewState.js` | `navigationReducer` — `{ view, history }` in one reducer |
| Data | `src/app/useAppData.js` | Hydration, versioned persistence, controlled actions |
| Dataset | `src/data/seed.js`, `src/data/policies.js` | Deterministic synthetic data, tagged policy rules |
| Pure logic | `src/domain/*.js` | attendance, marks, gpa, planning, scenarios, attention, validation, wording |
| UI kit | `src/ui/components.js`, `theme.js` | Reusable `Button/Card/Field/Status/EmptyState` |
| Screens | `src/features/*/` | home, courses, attendance, marks, history, planning, scenarios, finance, profile, demo — no navigation library |

**Why this shape:** the calculations are testable in Node without React, which
is why `npm test` can assert real arithmetic instead of snapshots.

---

## 2. React understanding (≈1 min)

> "State decides what is rendered; props carry data down; there is no router."

- **State:** `useReducer(navigationReducer, initialNavigation)` in `App.js`
  holds `{ view, history }`. `openView` dispatches `{type:'open'}` and pushes the
  previous view onto history. `Back` pops it.
- **Conditional rendering:** `renderView()` in `App.js` is a chain of
  `if (name === '...') return <Screen/>`. That is the technique from the class
  example, extended from one boolean to a named-view object.
- **Props:** screens receive `{ state, actions, openView, params }` and hold no
  global state. `CourseScreen` receives `params.enrollmentId` and `params.section`.
- **Local vs shared:** a form's typed text lives in `useState` inside the form;
  saved plans, tasks and preferences live in `useAppData`. The course workspace
  additionally lifts its planner draft above the section switch, so pressing a
  section button does not lose the inputs.
- **Android Back:** `BackHandler.addEventListener('hardwareBackPress')` returns
  `true` when there is history to pop and `false` at Home, so the OS closes the
  app normally.

---

## 3. JavaScript and data handling (≈1 min)

Pick **one** of these and be ready to talk for a minute.

**Option A — the recovery calculation** (`src/domain/attendance.js`)

```
x(100 − T) ≥ T·H − 100·P        (T = threshold percent, H = held, P = present)
x = ceil((T·H − 100·P) / (100 − T))
```

- Every comparison is done on integers (`100·(P+x) ≥ T·(H+x)`), so a boundary
  such as `12/15 == 80%` is exact and no floating-point rounding can gain or
  lose a session.
- The function returns `0` when no recovery is needed (every held session is
  already attended), and `null` when recovery is impossible at `T = 100`, where
  the coefficient vanishes. The UI says "not recoverable" rather than inventing a
  number.
- It returns `null` whenever there are no published sessions at all
  (`held === 0`), because there is no recorded base to recover from. The UI
  refuses to offer a recovery goal in that case instead of proposing a session
  count of zero.

**Option B — array work on the attention list** (`src/domain/attention.js`)

- `filter` to drop withdrawn enrollments and completed tasks,
- `map` to build one rule-driven item per course,
- `sort` with a three-key comparator: severity rank, then due date, then id,
  where a missing due date sorts last,
- every item carries `{ id, severity, reason, view, params }` so the list is
  navigable without any view-specific knowledge.

**Option C — objects and grouping** (`src/domain/gpa.js`)

- `Map` keyed by `courseId`, values sorted by `semesterOrder`, then the last
  counted attempt is chosen for CGPA. The earlier attempt becomes an exclusion
  with the reason "Superseded by a later attempt of the same course."

**Three rules worth being able to defend:**

- **F/FA count at 0 points and stay in the denominator.** The handbook grade
  table gives F/FA zero points, and the exclusion list covers only W, I, pending
  and non-credit coursework. Dropping a fail's credits would make the CGPA
  *improve* the more the student failed, which is the opposite of what a
  transcript is for. This is stated in the History grade legend, not left to be
  inferred from a number.
- **Missing is never zero.** A module with no session records returns
  `percent: null`, not `0`; an unpublished assessment is "unresolved weight", not
  zero; a pending attendance entry is excluded from the denominator and reported
  as a range. If you add a number, ask what happens when the underlying record
  does not exist.
- **A chart omits rather than plots zero.** `AttendanceBarChart` and
  `GpaTrendLineChart` filter out any value that is not a real finite number
  (`isRealNumber`, not `Number.isFinite(Number(x))`, which is `true` for `null`)
  and name what they omitted in the caption. A chart with a gap is honest; a
  zero-height bar for unmeasured data is a lie.

---

## 4. Live modification (≈1 min)

Changes you can do in under a minute, with the exact files:

1. **Change the attendance threshold.** Profile → Local settings → edit the
   threshold → Apply. Then open a course: recovery and absence capacity
   recompute, the Home attention list re-sorts, and every saved plan shows
   "Records changed; results recalculated".
   *Where it lives:* `setThreshold` in `src/app/useAppData.js` bumps
   `state.revision`, which is what makes plans stale.
2. **Add a course.** Demo data → Add a synthetic course. It appears in Courses,
   on Home, in the charts (as "no data", not 0%) and in the attention list.
3. **Show only low-attendance courses.** Courses → Filter → "Below threshold".
4. **Change one attendance number (the Demo data exercise).** Demo data →
   Edit attendance (synthetic) → pick **DL-2103**. The screen selects the first
   *absent* session for you; choose **Present** and tap **Save synthetic
   attendance**. The resulting attendance summary on that screen changes from
   **70%** to **80%**, the Baseline revision readout increments, and any saved
   plan that includes DL-2103 now reports *"Records changed; results
   recalculated"*. Nothing here is a real record, and nothing is sent anywhere.

If asked to change sort behaviour, `SORTS` in `src/features/courses/CoursesScreen.js`
is a plain array of `{ id, label }` and the comparator is one `if` chain.

---

## 5. Design and AI decision (≈1 min)

**Design decision I defend:** *inputs are stored, results are calculated.*

A saved plan could easily have stored "attendance 80%", but then editing an
attendance record would leave the plan contradicting the dashboard. So a plan
stores only assumptions, remembers the `baselineRevision` it was built on, and
`compareScenario()` recalculates from current records every time. When the
revision differs the UI says so out loud.

**Second decision:** *unknown is never zero* (see section 3). A pending
attendance entry is excluded from the denominator and reported as a range; an
unpublished assessment has "unresolved" weight, not zero; a course with no
records shows "No data". Silently treating missing as zero would punish a
student for data nobody has published.

**How AI contributed, and what was done about it:**

- An AI coding agent was used for requirements analysis, planning, the bulk of
  the code generation, most of the test execution and much of the review.
- Generated code was not accepted as correct on its own. Every arithmetic rule
  has a test in `tests/` with the boundary values spelled out, and checks were
  deliberately broken to confirm they actually fail (a test that passes with the
  bug is worthless).
- Real defects it introduced and that were found and fixed include: fractional
  thresholds were accepted; `windowStatus` compared an ISO string against `Date`
  objects so every calendar window read as "open"; `Back` skipped a screen; a
  chart guard treated `null` as a measured zero; and a letter grade was predicted
  from 20% assessed weight.
- Full record in `AI_USAGE_REPORT.md` and `docs/verification.md`.

---

## 6. Questions to expect

| Question | Answer |
|---|---|
| Why no navigation library? | The assignment explicitly penalises added navigation code; view switching is state plus conditional rendering. |
| Where is the data stored? | `useAppData` with `AsyncStorage` under a versioned key, after hydration, so a cold start cannot overwrite saved data. |
| What happens if stored data is corrupt? | The load is wrapped: a recoverable banner appears, the demonstration dataset loads, and nothing crashes. |
| Does it work offline? | Yes. No network client, no API key, no model call at runtime. |
| Is any of this real student data? | No. Everything is synthetic, named as synthetic in the record, and contains no identity number. |
| Why can a saved plan be unattainable? | It is an exploratory plan. It is saved, but the status word is never "achieved". |
| How would you test this? | Pure functions in Node (`npm test`), the screen-mount harness, the persistence and store-contract checks, plus manual state walks: empty semester, invalid input, changing data, restart persistence. |
