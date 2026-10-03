# Implementation Plan — Release-Scope Amendment

`docs/implementation-plan.md` is the **original specification** and is retained
unchanged. Read it as a historical specification, not as a list of implemented
requirements: four feature families in it were retired from the release.

## Retired from the release

- **Service simulations.** Withdrawal, retake and grade-change requests, request
  forms, review and request history, demonstration attachments, and course
  feedback. `src/features/services/` does not exist in the release.
- **Registration and study-plan planning.** The registration shortlist, and
  prerequisite and linked-course planning. `RegistrationPlanScreen` and the
  `evaluateCoursePlan` helper do not exist in the release.
- **PLO / outcomes reporting.** There is no Outcomes section in the course
  workspace and no outcomes report.
- **Official-document information.** The admit-card information is not shown.

## Retained scope (what was actually built)

- Home dashboard: summary tiles, an explainable attention list, an attendance
  **bar chart** and a cumulative-GPA **line chart** (`src/features/home/`).
- Course list, and the shared course workspace with **Attendance / Marks / Tasks**
  sections (`src/features/courses/`).
- Attendance records with per-session history, recovery calculation and future
  scenarios (`src/features/attendance/`).
- Marks breakdown with numeric targets and hypothetical scores
  (`src/features/marks/`).
- Academic history with per-term SGPA and cumulative CGPA, and a hypothetical
  grade/retake planner (`src/features/history/`).
- Saved academic scenarios with linked tasks (`src/features/scenarios/`), the
  task list and the academic calendar (`src/features/planning/`).
- Finance with synthetic fees (`src/features/finance/`).
- Profile with local settings and the attendance threshold
  (`src/features/profile/`).
- Demo-data controls (`src/features/demo/`).

## Deviations in force

- **F/FA count at zero points in the GPA denominator.** A fail is not excluded;
  it contributes 0 grade points and its credits stay in the denominator
  (`src/domain/gpa.js`, `src/data/policies.js`).
- **One cumulative-GPA chart series.** The Home GPA trend is a single cumulative
  line. Per-term SGPA is shown as a figure on each transcript term; a separate
  SGPA plotted series was built and then withdrawn as out of scope.
- **No replacement-course handling.** Replacement-course rules are not
  implemented, and no replacement-course record exists in the dataset
  (`src/data/policies.js`, `docs/policy-sources.md`).

## Persisted-data compatibility

Persisted `requests`, `feedback`, `outcomes` and plan `shortlistedCourseIds`
fields are still accepted on hydration and round-tripped unchanged, so data saved
before the scale-down continues to load without loss. Hydration requires these
containers to be present (`src/app/useAppData.js`). The released app has no way to
create or modify a request, feedback or outcome record.
