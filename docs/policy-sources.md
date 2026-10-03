# Policy and source notes — Flex++

Every rule the app applies is tagged with where it came from. This file is the
written counterpart of `src/data/policies.js`.

---

## 1. Sources

| Short label used in the app | Source |
|---|---|
| Supplied SMD Assignment 1 brief | The assignment document itself (open-ended React Native assignment, 100 marks, A–J core requirements). |
| 2025 undergraduate prospectus extract, pp. 171–173 | Attendance minimum requirement. |
| August 2023 undergraduate handbook, section 2 | Grade points and the explicit GPA formula. |
| Project clarification (user, during the project) | Attendance is counted **by session count**. This is a project convention recorded through user clarification; it is **not** a published weighting table, and no lecturer confirmation is claimed anywhere. |
| Demonstration setting of this synthetic dataset | Assessment weights, offerings, deadlines, fees and every student record. |

## 2. Attendance

| Rule used | Value | Source |
|---|---|---|
| Minimum attendance | 80% | 2025 prospectus extract, pp. 171–173 |
| Weighting basis | one held session = one unit | Project convention, established through user clarification (not published) |
| Pending entries | excluded from the denominator, never counted as absence | Explicit project convention |
| Default threshold in the app | 80% (user-editable, whole numbers 1–100) | 2025 prospectus extract |

**Uncertainty.** The prospectus extract states the minimum but does not, in the
supplied pages, define how pending entries are treated. The app therefore
publishes both a recorded-session figure and a conservative pending bound
(lowest possible / highest possible), and labels the range as a range.

**100% threshold.** At 100% a prior absence cannot be recovered by consecutive
attendance. The app reports "not recoverable" instead of a number.

## 3. Marks

| Rule used | Value | Source |
|---|---|---|
| Weighted contribution | `weightPercent × obtainedMarks / maxMarks` | Standard scheme arithmetic; the specific weights are demonstration settings |
| Unpublished submitted work | **unresolved**, not zero | Explicit project convention |
| Missed assessment | counted as a recorded zero inside assessed weight | Explicit project convention |
| Normal category split | demonstration default with exceptions | Demonstration setting — **not** a universal class scheme |
| Letter-grade prediction | disabled unless the student turns on the labelled demonstration scale | Demonstration setting |

## 4. GPA, repeats and exclusions

| Rule used | Value | Source |
|---|---|---|
| Grade points | A+/A 4, A- 3.67, B+ 3.33, B 3, B- 2.67, C+ 2.33, C 2, C- 1.67, D+ 1.33, D 1, F/FA 0 | 2023 handbook |
| Historical SGPA | uses the grade earned in that term, including repeat attempts actually taken | 2023 handbook |
| CGPA | latest finalized GPA-counting attempt of a repeated course, up to the selected cutoff | 2023 handbook |
| W, I, pending | excluded from the denominator | 2023 handbook + prospectus extract |
| F / FA | **counted at 0 points**, credits stay in the denominator | 2023 handbook grade table |
| Non-credit coursework | excluded | Demonstration setting |
| Empty denominator | "not available", never 0 | Explicit project rule |
| Replacement courses | not implemented, and no such record exists in the dataset | Deliberate omission |

**Honest statement of the demonstration convention.** The supplied editions do
not settle every edge case the app encounters. One choice is therefore a project
decision, stated here and in the UI, rather than a claim about policy:

1. **F/FA keep their credits in the GPA denominator at 0 points.** The handbook
   grade table assigns F/FA zero points, and the exclusion list covers only W, I,
   pending grades and non-credit coursework — so a failed attempt is counted, not
   hidden. The alternative (dropping the credits) would make every CGPA look
   better the more the student failed, which is the opposite of what a
   transcript is for. The app states this rule in the History screen rather than
   leaving it to be inferred from a number.

The unfinished-repeat convention is not a policy choice: the handbook is explicit
that a W or I in a repeated course does not erase the earlier finalized result.
That attempt is still listed as an exclusion with its reason.

The dataset deliberately contains **no replacement-course record**, so the
unimplemented replacement rule cannot distort any GPA figure.

## 5. Data provenance

`src/data/seed.js` creates the entire dataset from literals. No personal record,
portal capture or screenshot is reproduced in the source tree or in the build
output. Any private reference material supplied alongside the brief is kept
outside the repository and excluded from the submission archive; the packager
refuses to include it. The student's identity document number, contact details
and credentials are intentionally absent. The synthetic student is named as such
in the record itself.
