# Flex++

A redesigned student academic portal for Android, built as a **synthetic-data
demonstration app** for the Software for Mobile Devices assignment.

FLEX spreads attendance, assessment results, transcript history and calendar
windows across separate pages, so a student has to combine them by hand to
decide what needs attention. Flex++ brings the related information together and
adds one signature workflow: a **saved, named plan** that compares attendance
and assessment scenarios against the current records, then creates linked
actions.

> **Nothing in this app is real.** Every student, course, mark and fee is
> synthetic. There is no login, no university connection, no payment and no AI
> at runtime.

---

## What it does

| Area | What you can actually do |
|---|---|
| **Home** | Term selector, summary tiles, an explainable attention list, an **attendance bar chart** and a **GPA trend line chart** (two chart-kit types), pinned shortcuts and search across courses and modules. |
| **Courses** | Search, filter and sort the enrolled modules; open a shared workspace with **Attendance / Marks / Tasks** sections. |
| **Attendance** | Per-session history with filters, a threshold you can change, consecutive-session recovery, immediate absence capacity, and a future-session planner with a remaining-schedule feasibility check. |
| **Marks** | Assessment categories, weighted earned points, published vs unresolved vs scheduled weight, a numeric target calculator, hypothetical scores, and class-average comparison on matching units only. |
| **Academic history** | Transcript with repeat markers, SGPA per term, cumulative CGPA with a selectable cutoff, an exclusion list with reasons, and a hypothetical grade planner. |
| **Planning** | Personal tasks (a private checklist, including source-linked recovery and preparation tasks) and an academic calendar of synthetic windows, events and deadlines. |
| **Saved plans** | Save, rename, duplicate and delete scenario plans; compare baseline vs scenario per course; create source-linked recovery goals and preparation tasks. |
| **Finance** | Synthetic semester fee cards, a component ledger, challan due/paid status and payment guidance — with no payment action. |
| **Demo data** | Add a synthetic course, edit attendance and marks, load an empty dataset, or reset — clearly separated from real records. |

## The rules it refuses to break

- **Unknown is never zero.** No attendance records → "No data", not 0%. A pending
  session is excluded from the denominator and reported as a range. An unpublished
  assessment has *unresolved* weight, not zero.
- **Attendance arithmetic uses exact integer inequalities**, so 12/15 is exactly
  80% and a boundary case never gains or loses a session to floating point.
- **A score never becomes a grade.** Grade projections require an explicitly
  entered grade; the demonstration scale is opt-in and labelled.
- **Plans store inputs, never results.** Every figure is recalculated from the
  current records, and a plan that was built on an older baseline says so.
- **Offline.** No network client, no model API, no API key. Works after install.

## Run it

```bash
npm ci               # install the locked dependency versions
npm start            # scan the QR code with compatible Expo Go
npm run android      # open on a connected Android device or emulator
npm test             # Node test runner over the pure domain logic
npm run verify       # tests + static checks + screen renders + persistence + store
npm run fixtures     # prints every figure quoted in the docs
```

**Requirements:** Node 20+ (developed on Node 22.23) and the Expo Go app or an
Android emulator.

### Expo SDK and client compatibility

| Item | Value |
|---|---|
| Expo SDK | **57** (`expo ~57.0.26`) |
| React Native | 0.86.3 |
| React | 19.2.3 |
| Node used | v22.23.1 |

Expo Go on a phone must support SDK 57. If your installed Expo Go is older, use
a development build (`npx expo run:android`) or update Expo Go — see
<https://docs.expo.dev/troubleshooting/expo-go-version-mismatch/>. A successful
`npx expo export` proves the JavaScript bundles; only running it on a device
proves native behaviour.

## Verification status

| Check | Status |
|---|---|
| `npm test` — 193 unit tests over the pure domain and validation layer | passing |
| `npm run check` — import/export resolution, dead modules, hook-rule violations | passing (52 files, 33 hook-checked files) |
| `npm run smoke` — 43 screen mounts in Node (shipped, empty and corrupted datasets) | passing |
| `npm run persistence` — 29 checks: write/close/reopen plus storage failure modes | passing |
| `npm run store` — 38 store-contract checks: write ordering, failures and schema | passing |
| `npx expo-doctor` — 21 dependency checks against the installed SDK | 21/21 passed |
| `npx expo export --platform android` — production Hermes bundle | passed |
| `npm run verify` — all five of the above (test, check, smoke, persistence, store) in one command | passing |
| Physical Android phone | Launched through Expo Go via QR scanning; supplied Home screenshots reviewed |
| Screenshots / demonstration video | Six phone screenshots included in `screenshots/`; no video claimed |

`docs/verification.md` records exactly what was run, what passed, what failed and
what remains unverified. No screenshot or phone result is claimed unless it was
actually produced.

## Project layout

```text
App.js                     explicit conditional view switch + header + hardware Back
index.js                   Expo entry point
scripts/                   verification and packaging scripts (see below)
src/app/useAppData.js      hydration, versioned persistence, controlled actions
src/app/viewState.js       view/history reducer
src/data/seed.js           deterministic synthetic dataset
src/data/policies.js       source-tagged rules and demonstration assumptions
src/domain/                attendance, marks, gpa, planning, scenarios, attention, validation, wording
src/ui/                    theme + reusable components
src/features/              home, courses, attendance, marks, history, planning,
                           scenarios, finance, profile, demo
tests/                     Node tests for the pure domain modules
docs/                      policy notes, demo script, viva guide, verification report
release/                   generated submission archive (not tracked by git)
```

### Verification and packaging scripts

| Script | What it does |
|---|---|
| `npm test` | 193 unit tests, no dependencies needed |
| `npm run check` | import resolution, dead modules, hook-rule violations |
| `npm run smoke` | mounts all 43 screens in Node and asserts the honesty rules |
| `npm run persistence` | drives the persistence hook through a restart |
| `npm run store` | store-contract checks: write ordering, failure modes and schema |
| `npm run verify` | all five in sequence |
| `npm run fixtures` | prints the reference arithmetic used by the tests and quoted by the docs |
| `npm run package` | builds `release/flexpp-source.zip` for submission |

## Deliberate omissions

Four feature families that the original plan described were **deliberately
retired from this release** and are not present in the code, the data or the UI:

- **Service simulations** — withdrawal, retake, grade change, request forms,
  review/history, attachments and course feedback.
- **Registration and study-plan planning** — the registration shortlist and
  prerequisite / linked-course planning.
- **PLO / outcomes reporting.**
- **Official-document information** (admit card).

Also deliberately absent:

- **No navigation library, router, sidebar or bottom bar** — the assignment
  penalises navigation code, and view switching is state plus conditional
  rendering, as taught in class.
- **No replacement-course handling** — not implemented, so no such record exists
  in the dataset and the unimplemented rule cannot distort a GPA figure.
- **No payment flow** — the app describes synthetic fees, it does not take a
  payment.
- **No AI, chatbot or model dependency at runtime.**

Persisted `requests`, `feedback`, `outcomes` and `shortlistedCourseIds` fields
are still tolerated in the storage schema so previously saved data hydrates
unchanged, but nothing in the release reads them as active features.

## Documentation

| File | Contents |
|---|---|
| `docs/implementation-plan.md` | The original specification (retained as a historical document) |
| `docs/implementation-plan-amendment.md` | The release-scope amendment: what was retired and what was kept |
| `docs/maintenance-notes.md` | Architecture, decision log, retired scope, and how to extend it safely |
| `docs/policy-sources.md` | Where each rule comes from, and what is a documented convention |
| `docs/verification.md` | Every check run, with pass / fail / unverified |
| `docs/demo-script.md` | The demonstration walkthrough |
| `docs/viva-guide.md` | Five-minute viva walkthrough and live-change exercises |
| `AI_USAGE_REPORT.pdf` | Completed official AI Usage Report template; student fields unsigned |
| `AI_USAGE_REPORT.md` | Link to the official report |
| `screenshots/` | Six original Android phone screenshots |

## Submission evidence and current limitations

Phone evidence is provided in [screenshots/README.md](screenshots/README.md). The official AI report is [AI_USAGE_REPORT.pdf](AI_USAGE_REPORT.pdf). Application code is the supplied release snapshot. The phone captures cover Home, not a complete interaction walkthrough. Visible limitations include status-bar/header overlap and crowded attendance-chart labels. Saved-plan creation from the same mounted course can reuse the earlier plan ID, and a partial course-to-plan update can replace untouched assumptions. Invalid nested persisted containers are not fully guarded. These limitations were identified in review and remain in this snapshot.
