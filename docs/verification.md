> **Final packaging update — 3 October 2026:** The user subsequently launched the application on an Android phone through Expo Go via QR scanning and supplied screenshots. Six Home screenshots are included in `screenshots/`; both required chart types render. Statements below about missing native evidence describe the earlier build environment. The supplied images do not verify other screens, keyboard behavior, hardware Back or restart persistence. Application source is unchanged from the audited snapshot; the README records the remaining limitations.

# Verification report

Every check below was actually run on Windows 11, Node v22.23, Expo SDK 57.
Anything not run is listed as **not performed**, never as passing.

This file is the evidence. For how the app is put together see
`docs/maintenance-notes.md`; for what is and is not in the release see
`docs/implementation-plan-amendment.md`.

## 1. Results

| # | Check | Command | Result |
|---|---|---|---|
| 1 | Unit tests, pure domain and validation | `npm test` | **193 / 193 passed** |
| 2 | Import resolution, dead modules, hook rules | `npm run check` | **OK** — 52 files, 33 files |
| 3 | Screen mounts and honesty rules | `npm run smoke` | **43 renders, 0 problems** |
| 4 | Persistence round trip and failure modes | `npm run persistence` | **29 / 29 passed** |
| 5 | Store contracts: write ordering, failures, schema | `npm run store` | **38 / 38 passed** |
| 6 | Dependency compatibility | `npx expo-doctor` | **21 / 21 passed** |
| 7 | Production bundle | `npx expo export --platform android` | **passed** |
| 8 | Submission archive | `npm run package`, `npm run verify:archive` | **passed**, inspected |

`npm run verify` runs checks 1–5 in sequence and exits non-zero on any failure.

Checks 1–5 need no network. Check 6 reaches the Expo API for one of its 21
checks; on one run that check failed with a connection timeout and passed on an
immediate re-run. That is a network dependency of the tool, not a finding about
the project.

## 2. What each check actually proves

**Unit tests** cover the arithmetic and the rules that are easy to get subtly
wrong: the attendance denominator with pending entries, the exact-integer
recovery formula at the threshold boundary, marks contribution and target
maths, SGPA/CGPA with repeats and exclusions, the empty-denominator case, and
the field validators.

**Static checks** parse every module and confirm each named import resolves to a
real export, that no module is unreachable, and that no hook runs after a
top-level return or inside a conditional.

**Screen mounts** run every screen in Node with React Native stubbed, against
the shipped, empty and corrupted datasets. Not a device render; produces no
screenshot. Asserts the rules that break silently: no literal `0%` or `0.0%` for
missing data, no non-finite number reaching a chart, no non-string chart label.

**Persistence** drives the real storage hook: edit, close, reopen, and the edit
must come back. Then corrupt the saved data, truncate the JSON and lie about the
storage version, requiring a stated message and the demonstration dataset each
time rather than a crash or a silent reset.

**Store contracts** drive the same hook against controllable storage — writes
that can be held open and writes that can be forced to fail. This is the only
lane that can observe the defects listed in section 4, because the old suite
never mounted the hook with a delayed or failing device.

A separate **real-React lane** (`tests/reactLifecycle.test.js`) uses
`react-test-renderer` with the real React to check mount/unmount cleanup
ordering, dependency-change cleanup, and StrictMode double-invocation. The
custom stub cannot model those, and its limits are stated in the harness header.

## 3. Mutation verification, including what did not isolate

A check that cannot fail is not evidence. Each defect below was reintroduced and
the suite re-run.

| Reintroduced defect | Caught by | Isolated? |
|---|---|---|
| Plan editor appends one record per keystroke | screen mount | yes |
| Rename reverted to a non-editable `Text` | screen mount | yes |
| Grade predicted from partial weight | screen mount | yes |
| Missing attendance rendered as `0.0%` | screen mount | yes |
| Chart guard back to `Number.isFinite(Number(x))` | unit test | yes |
| Completed credits counting a repeat twice | unit test | yes |
| Overdue task not marked urgent | unit test | yes |
| F/FA excluded from the GPA denominator | unit test | yes |
| Recovery goal offered with no recorded sessions | unit test | yes |
| Any completed write reporting success (R5) | store contract | yes |
| Read-recovery notice cleared by a later write | store contract | yes |
| Attendance edits the first session, not the chosen one | store contract | yes |
| `.mjs` dropped from the submission archive | packager self-check | yes |
| **Duplicate-feedback guard removed from the store** | — | **no** |
| **Schema validation reduced to the old shallow check** | — | **no** |

The two that did not isolate are recorded rather than hidden:

1. The duplicate-feedback guard was masked because the domain validator already
   rejects a duplicate before the store's own check runs. That is defence in
   depth, not a bug — but the check does not isolate the store layer on its own.
2. The schema-validation mutation was masked because the row-identity loop
   independently rejects `courses: [null]`, which is the case the mutation
   targeted. Removing the stricter array check alone still leaves the null-row
   check doing the work.

Both were later removed with the service-simulation family, so neither guard is
in the release any more.

## 4. Defects found and fixed

Found by review and by the checks, not by inspection.

1. **Charts plotted missing data as zero.** The guard used
   `Number.isFinite(Number(x))`, and `Number(null)` is `0`.
2. **Plan editor wrote one plan record per keystroke.**
3. **Rename could never work** — a `Text`, not an input, and Save reported success.
4. **A letter grade was predicted from partial weight** — 8/10 on the only
   published assessment, 80% of the scheme unresolved, shown as "would predict F".
5. **Missing attendance rendered as `0.0%`** on the demo-data screen.
6. **Completed credits double-counted a repeat** — 17 against 14.
7. **An overdue task tied with a due-soon task**; the severity ternary had two
   identical branches.
8. **"Attend 0 consecutive sessions"** was creatable with no recorded sessions.
9. **F/FA were excluded from the GPA denominator**, contradicting the plan's
   grade table and inflating the CGPA by hiding a fail.
10. **The submission archive dropped every script** and was stale.
11. **Two internal process documents leaked** into files that ship.
12. **The real document picker was imported as a default export** that the
    installed package does not provide; a stub had invented it, so the harness
    validated an interface the dependency does not have.
13. **Persistence reported success prematurely** — an older write could mark a
    newer pending edit as saved, writes ran inside a replayable state updater,
    and a failed write still let the screen claim a saved device copy.
14. **Persisted-state validation was shallow** and admitted rows that crashed
    screens; it also *threw* on a missing array, relying on the caller's catch.
15. **The attendance demo editor could not perform its own documented change.**
16. **Course calculator inputs were disconnected from saved plans**, and were
    lost on any section switch.

## 5. Release scope

Four feature families are deliberately **not** in this release: service
simulations, registration and study-plan planning, PLO/outcomes reporting, and
official-document information. Their screens, entry points, attention items,
store actions, validators and exclusive dependency were removed. Persisted
`requests`, `feedback`, `outcomes` and `shortlistedCourseIds` fields remain in
the storage schema so previously saved data still hydrates unchanged.

Test counts fell from 251 to 193 because tests asserting retired features were
removed. They were removed, not weakened.

## 6. Deviations from the original plan still in force

| Plan | This build | Why |
|---|---|---|
| Grade points F/FA = 0, excluded: W, I, pending, non-credit | F/FA counted at 0 points | The plan's grade table and its exclusion list agree; excluding a fail would make the CGPA improve the more a student failed. |
| "SGPA/CGPA trend" | One cumulative-GPA line chart | A per-term SGPA series was built and then withdrawn as outside the release scope. Per-term SGPA is listed on each transcript term. |
| Replacement-course handling | Not implemented, and no such record exists | Deliberate: the unimplemented rule cannot distort a GPA figure. |
| Full service, planning, outcome and document scope | Retired | Deliberate scope reduction; see the amendment. |

## 7. Not performed

These are **not** claims of success.

- **No physical device or emulator run.** Layout, scrolling, the on-screen
  keyboard, chart animation, gesture handling and the Android hardware Back
  button are unverified on hardware.
- **No screenshot or demonstration video.** Rendering the real interface needs a
  browser or a device; neither is available in the environment this was built
  in. The Node harness mounts screens but draws nothing.
- **No accessibility audit with a screen reader.** Labels, roles and hit
  targets are present and checked in source; nothing was measured with TalkBack.
- **No submission or publication.** Nothing was pushed, published or submitted.

The one capability missing is a running Android client or emulator. Everything
else in this table follows from that.

## 8. Source discrepancy found during the build

The brief supplied two PDFs. `Assignment No 01- MBR.pdf` is a
research-proposal assignment for a different course and has no relationship to
this project. `SMD - Assignment 1.pdf` is the matching brief. The build followed
that file, and the finalized plan agrees with it on every hard constraint.