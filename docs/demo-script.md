# Demo script — Flex++ (about 6 minutes)

Every figure below is produced by the app's own calculations from the shipped
synthetic dataset. Run `npm run fixtures` to print the same numbers from that
dataset.

**Before you start:** `npm install && npm start`, then open the app on a phone
or emulator. Note the demo date shown on Home: **3 Oct 2026**. All dates in the
app come from that stored date, not from the phone clock, so the demonstration
is reproducible on any day.

---

## 1 · Home — dashboard and charts (45 s)

1. Land on Home. Point at the **term selector** and say the whole screen is
   scoped to the selected term; the demo date is printed under it.
2. **Needs attention**: the list is ordered by severity, then by due date. The
   top item is the overdue task *"Submit Software Engineering assignment
   (demonstration)"* — "Overdue by 5 days." Directly below it is the urgent
   attendance item for **DL-2103 · Digital Logic Design**: *"7 of 10 recorded
   sessions attended (70%), below the 80% threshold."* with the action *"5
   consecutive attended sessions would reach the threshold."* Tap it.
3. Before leaving, scroll to the two charts: an **attendance bar chart**
   (`react-native-chart-kit` `BarChart`) and a **GPA trend line chart**
   (`LineChart`). The bar chart plots the six modules that have published
   sessions and says that the one module without them is not plotted; the line
   chart plots the cumulative GPA after each recorded term. Say they come from
   the same records as every other screen.
4. Mention that **EE-2001** shows **No data**, not 0% — missing data is never
   treated as absence or a zero score.

## 2 · Course workspace — recovery scenario (60 s)

You are now in **DL-2103**.

1. The Attendance section shows **70%**, **5 consecutive sessions to recover**,
   **0 further absences absorbable**, and the formulas used next to the numbers.
2. In the **Future scenario planner**, enter `5` attended, `0` missed, `6`
   remaining → the projection reads **80% after 15 recorded sessions**, status
   *"Would meet 80%"*.
3. Change `5` to `4` → the result immediately updates to **78.6% after 14
   recorded sessions**, status *"Below 80%"*. Nothing stale is left on screen.
4. Set remaining classes to `3` → the app says the scenario uses more classes
   than remain in the term, so it cannot happen as described, and that recovery
   needs 5 consecutive sessions — more than the remaining classes entered.
5. Tap **Add recovery goal** → pick a deadline → **Confirm task**. Say: the goal
   records a session count; the app never invents class dates.

## 3 · Marks — target and hypotheticals (75 s)

Open **SE-2201** → Marks.

1. Header: **36.00 earned points out of 100**, assessed weight 50%, unresolved
   0%, scheduled 50%, and *performance within assessed weight 72%* — explicitly
   **not** a final course score.
2. Target `70` → **"You need an average of 68% across the remaining 50% of
   weight."**
3. Under **What-if scores**, enter `40` for *Midterm examination (50% of the
   scheme)* → the projection reads **76 / 100** points.
4. Now open **CS-2101** → Marks: 16.00 earned, published 20%, **30%
   unresolved** (submitted, not published), scheduled 50%. Target `70` → the
   message says the requirement spans unpublished **and** scheduled work, and a
   warning banner says it must not be described as the required final-exam mark.
5. Enter a hypothetical `25` for *Assignment 1 — Linked lists (30% of the
   scheme)*. The unresolved weight drops out and the banner changes to *"Every
   unpublished result now has a hypothetical score, so the requirement can be
   expressed as future work only."* with a future-only requirement of **58%**.
6. Try an out-of-range value (e.g. `31` in a field that is out of 30) → inline
   error, and the projection disappears.

## 4 · A named multi-course plan, built from the calculators (90 s)

1. Back in **DL-2103 → Attendance**, scroll to **Save to a plan**. With no plan
   chip selected, type a **New plan name** such as `Recovery semester`, then tap
   **Add to plan**. The banner confirms the assumptions were added.
2. Open **MATH-2205 → Marks**, set the target to `75`, scroll to **Save to a
   plan**, select the `Recovery semester` chip and tap **Add to plan**. The plan
   now holds two courses — the "multi-course" part.
3. Open **Saved plans** → select **Recovery semester**. Each course card shows
   attendance and marks as **separate** rows — there is no blended score:
   - **DL-2103**: attendance current **70% of 10 recorded**, scenario **80% of
     15 recorded**; arithmetic result *would meet 80%*; **Schedule feasible**.
   - **MATH-2205**: attendance current **80% of 10 recorded**, scenario **80% of
     10 recorded**; *schedule feasibility not checked* (no remaining classes were
     entered). Marks baseline **47 of 100 from 70% assessed weight**; target 75
     needs an average of **93.33%** across the remaining 30% of weight, and the
     banner notes it applies only to scheduled work — not a final-exam mark.
4. The **GPA projection** card is a third, independent card. It currently shows
   *no change*, because no grade was assumed — say that a score is never
   converted into a grade.
5. Tap **Edit** → in the plan editor select **MATH-2205** and choose the grade
   chip `A` → **Save plan** → return to the comparison: CGPA moves from
   **2.8424** to **3.0160**, delta **+0.1736**.
6. On the DL-2103 card tap **Add recovery goal** → **Create goal**. Now open
   **Tasks**: the recovery task is there, linked to the course.

## 5 · The linked task on Home (30 s)

1. Go **Home**. The attention list now includes the recovery task you just
   created (*"Recover attendance in DL-2103: attend 5 consecutive sessions"*),
   shown as **Due today** because its deadline is the demo date.
2. Say: a task is your own checklist. Completing it changes **no** attendance,
   marks or university status.

## 6 · Academic history and GPA planner (45 s)

1. **Academic history**: header CGPA **2.84** up to Fall 2026, on **17 counted
   credits** from **6 counted attempts**. Spring 2025 SGPA **3.78** (9 counted
   credits), Fall 2025 **2.39** (11 credits). The drop in Fall 2025 is the F/FA:
   under this project's convention a failed attempt keeps its credits in the
   denominator at zero points rather than being hidden, so the term GPA falls
   instead of quietly disappearing.
2. **CS-1102 appears twice** — A in Spring 2025, B in Fall 2025. It is marked as
   a repeat, the later attempt is labelled *"used for CGPA"*, and the exclusions
   list says why the earlier one was superseded.
3. Point at the excluded records: a **W** course and an **I** (incomplete)
   result, each with its reason. Say a W course does not enlarge the denominator,
   and that F/FA does the opposite.
4. In the **Grade planner**, change an assumed grade → watch current / projected
   and the signed change move together, as three separate numbers.

## 7 · Live change: one attendance session (45 s)

1. **Demo data → Edit attendance (synthetic)**. Pick **DL-2103**; the screen
   selects the first *absent* session for you. Choose **Present** and tap **Save
   synthetic attendance**. The notice names the exact session that changed.
2. Still on Demo data, note the **Baseline revision** readout has incremented.
3. Go back to **Saved plans → Recovery semester**: a banner now reads *"Records
   changed; results recalculated"*, and DL-2103's attendance baseline is
   recomputed from the new records. Say: *a plan stores inputs, never results.*

## 8 · Persistence (30 s)

1. **Force-close the app and relaunch.** Your plan, the linked tasks and the
   threshold are still there — the dataset is persisted to this device after
   hydration.
2. Finish with **Demo data → Reset the demonstration** (confirmed) to return to
   the shipped synthetic dataset.

---

## Closing statement (15 s)

> "Every calculation is plain JavaScript with the formula shown next to it, every
> rule is tagged with its source, and no AI runs at runtime. The 193 automated
> unit tests, 43 screen mounts, 29 persistence checks and 38 store-contract
> checks cover the arithmetic, the state transitions, the storage failure modes
> and the missing-data cases; the demo date makes every date-dependent state
> reproducible."

---

## If the examiner asks for a quick live change

| Ask | Where | What happens |
|---|---|---|
| "Change the attendance threshold" | Profile → Local settings (or Course → Attendance) | Recovery, absence capacity, the attention list and every saved plan recompute; old plans are flagged as recalculated |
| "Add a new course" | Demo data → Add a synthetic course | Appears in Courses, Home, charts and the attention list |
| "Show only low-attendance courses" | Courses → Filter → Below threshold | List filters without touching the data |
| "Change the sort" | Courses → Sort by | Sorting is one comparator over the joined records |
| "Handle an empty list" | Demo data → Load the empty dataset | Empty states everywhere, never zeros |
| "Flip one attendance session" | Demo data → Edit attendance (synthetic) | Pick a course, pick a session, set Present/Absent/Pending; saved plans flag a changed baseline |

## Screens worth capturing

1. Home with both charts visible and the attention list.
2. Attendance planner showing 80% after 15 sessions.
3. Marks target showing "68% across the remaining 50% of weight".
4. Saved plan comparison with the per-course baseline/scenario rows.
5. Linked task creation confirmation.
6. GPA planner with a grade assumption and a signed change.
7. Demo data attendance edit with its resulting attendance summary.
8. Empty dataset state.
9. Persistence after a relaunch.
