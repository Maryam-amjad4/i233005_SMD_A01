/**
 * Demo data screen — the clearly labelled live-adaptation surface.
 *
 * Everything on this screen changes the SYNTHETIC demonstration dataset only.
 * It is never an edit to a real university record and never claims to be one.
 * Owns: adding a synthetic course, editing synthetic attendance presence and
 * synthetic marks, the two destructive scenario switches, and the baseline
 * revision readout. No other screen writes to the dataset outside the
 * demo-only actions exported by the app store.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  Banner,
  Button,
  ButtonRow,
  Card,
  Chip,
  Divider,
  EmptyState,
  Field,
  KeyValueRow,
  ProgressBar,
  Section,
  Status,
} from '../../ui/components.js';
import { colors, spacing, type } from '../../ui/theme.js';
import { summarizeAttendance, statusLabel } from '../../domain/attendance.js';
import { formatDate, validateCount, validateRawMarks, validateText } from '../../domain/validation.js';

const PRESENCE_CHOICES = [
  { id: 'present', label: 'Present', tone: 'ok' },
  { id: 'absent', label: 'Absent', tone: 'danger' },
  { id: 'pending', label: 'Pending', tone: 'warn' },
];

const ASSESSMENT_STATUS_TONE = {
  published: 'ok',
  missed: 'danger',
  submitted: 'warn',
  scheduled: 'info',
};

const ASSESSMENT_STATUS_LABEL = {
  published: 'Published (counts toward the result)',
  missed: 'Missed (a recorded zero)',
  submitted: 'Submitted, not published (unresolved)',
  scheduled: 'Scheduled (future work)',
};

const EMPTY_COURSE_FORM = { code: '', name: '', credits: '' };

function presenceFor(sessions) {
  const first = sessions[0];
  return first ? first.presence : null;
}

function describeAttendance(summary) {
  if (summary.status === 'no-data') {
    return 'No attendance records exist for this course, so the attendance chart shows an empty state rather than 0%.';
  }
  const base = `${summary.percent}% of recorded sessions were marked present (${summary.present} present, ${summary.absent} absent out of ${summary.held} recorded).`;
  const withPending = summary.pending > 0
    ? ` ${summary.pending} further session${summary.pending === 1 ? ' is' : 's are'} pending; pending records are held outside the percentage and are never counted as an absence.`
    : ' No sessions are pending, so this percentage is not provisional.';
  return `${base}${withPending}`;
}

export function DemoDataScreen({ state, actions, openView }) {
  const [courseForm, setCourseForm] = useState(EMPTY_COURSE_FORM);
  const [courseErrors, setCourseErrors] = useState({});
  const [createdCourse, setCreatedCourse] = useState(null);

  const [attendanceEnrollmentId, setAttendanceEnrollmentId] = useState(null);
  const [presence, setPresence] = useState(null);
  // Which recorded session the presence choice applies to. null means
  // "append a new session" rather than "edit an existing one".
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [attendanceNotice, setAttendanceNotice] = useState(null);

  const [marksEnrollmentId, setMarksEnrollmentId] = useState(null);
  const [markDrafts, setMarkDrafts] = useState({});
  const [markErrors, setMarkErrors] = useState({});
  const [markNotice, setMarkNotice] = useState(null);

  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [emptyLoaded, setEmptyLoaded] = useState(false);

  const selectedSemesterId = state.preferences.selectedSemesterId;
  const selectedSemester = state.semesters.find((s) => s.id === selectedSemesterId) || null;

  const courseById = useMemo(() => new Map(state.courses.map((c) => [c.id, c])), [state.courses]);

  const semesterEnrollments = useMemo(
    () =>
      state.enrollments
        .filter((e) => e.semesterId === selectedSemesterId && e.status !== 'withdrawn')
        .map((enrollment) => ({ enrollment, course: courseById.get(enrollment.courseId) || null })),
    [state.enrollments, selectedSemesterId, courseById],
  );

  const attendanceEnrollment =
    semesterEnrollments.find((row) => row.enrollment.id === attendanceEnrollmentId) || semesterEnrollments[0] || null;

  const attendanceSessions = useMemo(
    () =>
      attendanceEnrollment
        ? state.attendanceSessions.filter((s) => s.enrollmentId === attendanceEnrollment.enrollment.id)
        : [],
    [state.attendanceSessions, attendanceEnrollment],
  );

  const attendanceSummary = useMemo(
    () => summarizeAttendance(attendanceSessions, state.preferences.attendanceThresholdPercent),
    [attendanceSessions, state.preferences.attendanceThresholdPercent],
  );

  const marksEnrollment =
    semesterEnrollments.find((row) => row.enrollment.id === marksEnrollmentId) || semesterEnrollments[0] || null;

  const marksAssessments = useMemo(
    () =>
      marksEnrollment
        ? state.assessments.filter((a) => a.enrollmentId === marksEnrollment.enrollment.id)
        : [],
    [state.assessments, marksEnrollment],
  );

  // createEmptyState() keeps the catalogue, semesters and identity but removes
  // every academic record, so "empty" is judged on enrollments, not courses.
  const datasetIsEmpty = state.enrollments.length === 0;

  /* ------------------------------------------------- 1. add a synthetic course */

  function setCourseField(field, value) {
    setCourseForm((previous) => ({ ...previous, [field]: value }));
    setCourseErrors((previous) => ({ ...previous, [field]: undefined }));
  }

  function handleAddCourse() {
    const code = validateText(courseForm.code, { label: 'Course code', maxLength: 24 });
    const name = validateText(courseForm.name, { label: 'Course name', maxLength: 120 });
    const credits = validateCount(courseForm.credits, { label: 'Credits', max: 6 });
    const errors = {};
    if (!code.ok) errors.code = code.error;
    if (!name.ok) errors.name = name.error;
    if (!credits.ok) errors.credits = credits.error;
    if (credits.ok && (credits.value < 1 || credits.value > 6)) {
      errors.credits = 'Credits must be between 1 and 6.';
    }

    setCourseErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const nextCode = code.value.toUpperCase();
    actions.addSyntheticCourse({
      code: nextCode,
      name: name.value,
      credits: credits.value,
      type: 'theory',
    });
    setCourseForm(EMPTY_COURSE_FORM);
    setCreatedCourse({ code: nextCode, name: name.value, credits: credits.value });
  }

  /* ----------------------------------------------- 2. edit attendance (synthetic) */

  function selectAttendanceEnrollment(enrollmentId) {
    setAttendanceEnrollmentId(enrollmentId);
    setAttendanceNotice(null);
    const sessions = state.attendanceSessions.filter((s) => s.enrollmentId === enrollmentId);
    setPresence(presenceFor(sessions));
    // Default to a session the demonstration actually needs changed, so the
    // documented "flip an absence to present" is performable.
    const absent = sessions.find((s) => s.presence === 'absent');
    setSelectedSessionId(absent ? absent.id : (sessions[0]?.id ?? null));
  }

  function handleSaveAttendance() {
    if (!attendanceEnrollment || !presence) return;
    const course = attendanceEnrollment.course;
    // Target a specific session. Without this the action edited the FIRST
    // session for the course, which for DL-2103 is already present, so the
    // documented demo change silently did nothing.
    actions.updateSyntheticAttendance({
      sessionId: selectedSessionId,
      enrollmentId: attendanceEnrollment.enrollment.id,
      presence,
      date: state.demoDate,
    });
    const session = attendanceSessions.find((s) => s.id === selectedSessionId);
    setAttendanceNotice(
      session
        ? `${course?.code || 'This course'}: session ${formatDate(session.date)} set to ${
            PRESENCE_CHOICES.find((choice) => choice.id === presence)?.label || presence
          }. Every other session was left untouched.`
        : `A new ${presence} session dated ${formatDate(state.demoDate)} was appended to ${course?.code || 'this course'}.`,
    );
  }

  /* ------------------------------------------------------ 3. edit marks (synthetic) */

  function selectMarksEnrollment(enrollmentId) {
    setMarksEnrollmentId(enrollmentId);
    setMarkNotice(null);
    setMarkErrors({});
  }

  function setMarkDraft(id, value) {
    setMarkDrafts((previous) => ({ ...previous, [id]: value }));
    setMarkErrors((previous) => ({ ...previous, [id]: undefined }));
  }

  function draftValueFor(assessment) {
    const draft = markDrafts[assessment.id];
    return draft === undefined ? (assessment.obtainedMarks == null ? '' : String(assessment.obtainedMarks)) : draft;
  }

  function handleSaveAssessment(assessment) {
    const raw = String(draftValueFor(assessment) ?? '').trim();
    if (!raw) {
      // Publishing a blank score would silently read as zero earned points, so
      // the screen refuses it and points at the explicit unresolved action.
      setMarkErrors((previous) => ({
        ...previous,
        [assessment.id]:
          'A published result needs a number. Leave it unknown instead by using "Unpublish (mark unresolved)", which moves the weight to the unresolved bucket instead of zero.',
      }));
      return;
    }
    const parsed = validateRawMarks(raw, assessment.maxMarks, { label: 'Obtained marks' });
    if (!parsed.ok) {
      setMarkErrors((previous) => ({ ...previous, [assessment.id]: parsed.error }));
      return;
    }
    actions.updateSyntheticAssessment(assessment.id, { obtainedMarks: parsed.value, status: 'published' });
    setMarkErrors((previous) => ({ ...previous, [assessment.id]: undefined }));
    setMarkNotice(
      `${assessment.title} was published with ${parsed.value} of ${assessment.maxMarks} raw marks in the synthetic dataset.`,
    );
  }

  function handleUnpublish(assessment) {
    actions.updateSyntheticAssessment(assessment.id, { obtainedMarks: null, status: 'submitted' });
    setMarkErrors((previous) => ({ ...previous, [assessment.id]: undefined }));
    setMarkNotice(
      `${assessment.title} was moved back to submitted and not published. Its ${assessment.weightPercent}% weight now sits in the unresolved bucket, which is not zero.`,
    );
  }

  /* -------------------------------------------------------- 4. scenario switches */

  function handleLoadEmpty() {
    actions.loadEmptyDataset();
    setConfirmEmpty(false);
    setEmptyLoaded(true);
    setAttendanceEnrollmentId(null);
    setMarksEnrollmentId(null);
    setMarkDrafts({});
    setPresence(null);
  }

  function handleReset() {
    actions.resetDemo();
    setConfirmReset(false);
    setEmptyLoaded(false);
    setCreatedCourse(null);
    setAttendanceNotice(null);
    setMarkNotice(null);
    setMarkDrafts({});
    setAttendanceEnrollmentId(null);
    setMarksEnrollmentId(null);
    setPresence(null);
  }

  return (
    <View>
      <Banner
        tone="warn"
        label="These controls change the SYNTHETIC demonstration dataset only. Nothing here edits a real university record, and nothing here claims to."
      >
        <Text style={[type.caption, { marginTop: spacing.xs, color: colors.amber700 }]}>
          {`The demonstration date is ${formatDate(state.demoDate)} and the baseline revision is ${state.revision}. Every value on this screen is derived from the local synthetic dataset on this device.`}
        </Text>
      </Banner>

      {/* ------------------------------------------------ 1. add a synthetic course */}
      <Section
        title="Add a synthetic course"
        subtitle="Creates a new catalogue entry and a matching enrollment in the selected semester, so it appears across the app."
      >
        <Card>
          <Field
            label="Course code"
            value={courseForm.code}
            onChangeText={(value) => setCourseField('code', value)}
            error={courseErrors.code}
            placeholder="e.g. CS-499"
            autoCapitalize="characters"
            maxLength={24}
            testID="demo-course-code"
          />
          <Field
            label="Course name"
            value={courseForm.name}
            onChangeText={(value) => setCourseField('name', value)}
            error={courseErrors.name}
            placeholder="e.g. Software Engineering Studio"
            maxLength={120}
            testID="demo-course-name"
          />
          <Field
            label="Credits"
            value={courseForm.credits}
            onChangeText={(value) => setCourseField('credits', value)}
            error={courseErrors.credits}
            helper="Whole number from 1 to 6."
            placeholder="3"
            keyboardType="numeric"
            maxLength={1}
            testID="demo-course-credits"
          />
          <Button label="Add synthetic course" icon="add-circle-outline" onPress={handleAddCourse} testID="demo-add-course" />
          <Text style={[type.caption, { marginTop: spacing.sm }]}>
            The course is created as a theory course. No real registration is attempted and nothing is sent anywhere.
          </Text>
        </Card>

        {createdCourse ? (
          <Card tone="ok" title={`Synthetic course ${createdCourse.code} was created`}>
            <KeyValueRow label="Code" value={createdCourse.code} mono />
            <KeyValueRow label="Name" value={createdCourse.name} />
            <KeyValueRow label="Credits" value={String(createdCourse.credits)} mono />
            <KeyValueRow label="Type" value="Theory" />
            <Text style={[type.caption, { marginTop: spacing.sm }]}>
              {`The new enrollment is attached to ${selectedSemester ? selectedSemester.label : 'the selected semester'}.`}
            </Text>
            <ButtonRow style={{ marginTop: spacing.md }}>
              <Button label="Open the courses list" icon="list-outline" onPress={() => openView('courses')} />
            </ButtonRow>
          </Card>
        ) : null}
      </Section>

      <Divider />

      {/* ------------------------------------------------- 2. edit attendance (synthetic) */}
      <Section
        title="Edit attendance (synthetic)"
        subtitle="Rewrites one synthetic attendance record per course. A pending record is never treated as an absence."
      >
        {semesterEnrollments.length === 0 ? (
          <EmptyState
            icon="calendar-outline"
            title="No courses in the selected semester"
            message="Add a synthetic course above, or pick another semester from the Home screen."
          />
        ) : (
          <Card>
            <Text style={[type.label, { marginBottom: spacing.xs }]}>Course</Text>
            <View style={styles.chipRow}>
              {semesterEnrollments.map(({ enrollment, course }) => (
                <Chip
                  key={enrollment.id}
                  label={course?.code || 'Unknown course'}
                  selected={attendanceEnrollment?.enrollment.id === enrollment.id}
                  onPress={() => selectAttendanceEnrollment(enrollment.id)}
                />
              ))}
            </View>

            <Text style={[type.label, { marginBottom: spacing.xs }]}>Presence</Text>
            {/*
              R13: a session must be selectable. Previously the action always
              edited the first session for the course, and DL-2103's first
              session is already present while its absences come later, so the
              documented change could not be made at all.
            */}
            {attendanceSessions.length > 0 ? (
              <>
                <Text style={[type.label, { marginBottom: spacing.xs }]}>
                  {`Session to change (${attendanceSessions.length} recorded)`}
                </Text>
                <View style={styles.chipRow}>
                  {attendanceSessions.map((session, index) => (
                    <Chip
                      key={session.id}
                      label={`#${index + 1} · ${session.presence} · ${formatDate(session.date)}`}
                      icon={session.presence === 'present' ? 'checkmark-circle-outline' : session.presence === 'absent' ? 'close-circle-outline' : 'time-outline'}
                      selected={selectedSessionId === session.id}
                      onPress={() => {
                        setSelectedSessionId(session.id);
                        setPresence(session.presence);
                      }}
                    />
                  ))}
                </View>
                <Button
                  label="Append a new session instead"
                  variant="secondary"
                  onPress={() => {
                    setSelectedSessionId(null);
                    setPresence('present');
                  }}
                  style={{ marginBottom: spacing.sm }}
                />
              </>
            ) : (
              <Text style={[type.caption, { marginBottom: spacing.sm }]}>
                This module has no session records, so saving appends the first one. It is still missing data until then.
              </Text>
            )}
            <View style={styles.chipRow}>
              {PRESENCE_CHOICES.map((choice) => (
                <Chip
                  key={choice.id}
                  label={choice.label}
                  icon={choice.id === 'present' ? 'checkmark-circle-outline' : choice.id === 'absent' ? 'close-circle-outline' : 'time-outline'}
                  selected={presence === choice.id}
                  onPress={() => setPresence(choice.id)}
                />
              ))}
            </View>
            <Text style={[type.caption, { marginBottom: spacing.sm }]}>
              Choosing Pending leaves the record unresolved: it is excluded from the percentage and the summary is flagged as
              provisional, instead of being counted as an absence.
            </Text>

            <Button
              label="Save synthetic attendance"
              icon="save-outline"
              onPress={handleSaveAttendance}
              disabled={!attendanceEnrollment || !presence}
              testID="demo-save-attendance"
            />

            <Divider />

            <View style={styles.summaryHead}>
              <Text style={type.label}>Resulting attendance</Text>
              <Status
                label={
                  attendanceSummary.percent == null
                    ? 'No data'
                    : `${attendanceSummary.percent}% — ${statusLabel(attendanceSummary).label}`
                }
                tone={attendanceSummary.percent == null ? 'info' : statusLabel(attendanceSummary).tone}
              />
            </View>
            <ProgressBar
              label={`Attendance against the ${attendanceSummary.thresholdPercent ?? '—'}% threshold`}
              valuePercent={attendanceSummary.percent}
              tone={attendanceSummary.status === 'below' ? 'danger' : attendanceSummary.status === 'no-data' ? 'warn' : 'ok'}
              caption="An empty bar with no recorded sessions means no data, not 0%."
            />
            <KeyValueRow label="Present" value={String(attendanceSummary.present)} mono />
            <KeyValueRow label="Absent" value={String(attendanceSummary.absent)} mono />
            <KeyValueRow label="Pending (unresolved)" value={String(attendanceSummary.pending)} mono />
            <Text style={[type.caption, { marginTop: spacing.sm }]}>{describeAttendance(attendanceSummary)}</Text>
            {attendanceSummary.errors.length > 0 ? (
              <Banner label={attendanceSummary.errors.join(' ')} tone="warn" style={{ marginTop: spacing.sm }} />
            ) : null}
          </Card>
        )}

        {attendanceNotice ? <Banner label={attendanceNotice} tone="ok" /> : null}
      </Section>

      <Divider />

      {/* ----------------------------------------------------- 3. edit marks (synthetic) */}
      <Section
        title="Edit marks (synthetic)"
        subtitle="Rewrites raw marks on the synthetic assessment scheme for one course."
      >
        {semesterEnrollments.length === 0 ? (
          <EmptyState
            icon="document-text-outline"
            title="No courses to edit marks for"
            message="Add a synthetic course above first."
          />
        ) : (
          <Card>
            <Text style={[type.label, { marginBottom: spacing.xs }]}>Course</Text>
            <View style={styles.chipRow}>
              {semesterEnrollments.map(({ enrollment, course }) => (
                <Chip
                  key={enrollment.id}
                  label={course?.code || 'Unknown course'}
                  selected={marksEnrollment?.enrollment.id === enrollment.id}
                  onPress={() => selectMarksEnrollment(enrollment.id)}
                />
              ))}
            </View>

            {marksAssessments.length === 0 ? (
              <EmptyState
                icon="document-outline"
                title="No assessment scheme on this course"
                message="There is nothing to edit. Missing scheme is missing data, not a zero score."
              />
            ) : (
              marksAssessments.map((assessment, index) => (
                <View key={assessment.id}>
                  {index > 0 ? <Divider /> : null}
                  <View style={styles.assessmentHead}>
                    <View style={{ flex: 1, paddingRight: spacing.sm }}>
                      <Text style={type.body}>{assessment.title}</Text>
                      <Text style={type.caption}>
                        {`${assessment.weightPercent}% of the result · out of ${assessment.maxMarks}`}
                      </Text>
                    </View>
                    <Status
                      label={ASSESSMENT_STATUS_LABEL[assessment.status] || assessment.status}
                      tone={ASSESSMENT_STATUS_TONE[assessment.status] || 'neutral'}
                    />
                  </View>

                  <Field
                    label="Obtained marks"
                    value={draftValueFor(assessment)}
                    onChangeText={(value) => setMarkDraft(assessment.id, value)}
                    error={markErrors[assessment.id]}
                    placeholder="leave blank if unknown"
                    keyboardType="numeric"
                    maxLength={8}
                    testID={`demo-marks-${assessment.id}`}
                  />

                  <ButtonRow>
                    <Button
                      label="Save as published"
                      icon="save-outline"
                      variant="secondary"
                      onPress={() => handleSaveAssessment(assessment)}
                      testID={`demo-save-marks-${assessment.id}`}
                    />
                    <Button
                      label="Unpublish (mark unresolved)"
                      icon="eye-off-outline"
                      variant="ghost"
                      onPress={() => handleUnpublish(assessment)}
                    />
                  </ButtonRow>
                </View>
              ))
            )}

            <Divider />
            <Text style={[type.caption, { marginTop: spacing.xs }]}>
              Blanking the score and unpublishing moves this assessment&apos;s weight into the unresolved bucket, not into zero.
              A zero score is only recorded when the raw marks field actually contains 0.
            </Text>
          </Card>
        )}

        {markNotice ? <Banner label={markNotice} tone="info" /> : null}
      </Section>

      <Divider />

      {/* ------------------------------------------------------- 4. scenario switches */}
      <Section
        title="Scenario switches"
        subtitle="Both switches replace the whole local dataset, so each needs its own confirmation step."
      >
        <Card tone="danger" title="Load the empty dataset">
          <Text style={type.bodyMuted}>
            Removes every synthetic enrollment, attendance session, assessment, task and plan from this device while keeping
            the catalogue and semesters. Use it to see how the app renders missing data.
          </Text>
          <Text style={[type.label, { marginTop: spacing.md, marginBottom: spacing.xs }]}>Step 1 — acknowledge</Text>
          <View style={styles.chipRow}>
            <Chip
              label="I understand this removes the synthetic records"
              icon="warning-outline"
              selected={confirmEmpty}
              onPress={() => setConfirmEmpty(!confirmEmpty)}
            />
          </View>
          <ButtonRow>
            <Button
              label="Load the empty dataset"
              variant="danger"
              icon="trash-outline"
              disabled={!confirmEmpty}
              onPress={handleLoadEmpty}
              testID="demo-load-empty"
            />
            <Button label="Cancel" variant="ghost" onPress={() => setConfirmEmpty(false)} />
          </ButtonRow>
          {confirmEmpty ? (
            <Text style={[type.caption, { marginTop: spacing.xs }]}>
              Confirmed. The next press replaces the synthetic dataset with an empty one; the shipped dataset is not lost
              permanently because Reset restores it.
            </Text>
          ) : null}
        </Card>

        <Card tone="danger" title="Reset the demonstration">
          <Text style={type.bodyMuted}>
            Restores the shipped synthetic dataset and discards every course you added and every attendance or marks edit
            made on this screen.
          </Text>
          <Text style={[type.label, { marginTop: spacing.md, marginBottom: spacing.xs }]}>Step 1 — acknowledge</Text>
          <View style={styles.chipRow}>
            <Chip
              label="I understand this discards every local edit"
              icon="warning-outline"
              selected={confirmReset}
              onPress={() => setConfirmReset(!confirmReset)}
            />
          </View>
          <ButtonRow>
            <Button
              label="Reset the demo"
              variant="danger"
              icon="refresh-outline"
              disabled={!confirmReset}
              onPress={handleReset}
              testID="demo-reset"
            />
            <Button label="Cancel" variant="ghost" onPress={() => setConfirmReset(false)} />
          </ButtonRow>
          {confirmReset ? (
            <Text style={[type.caption, { marginTop: spacing.xs }]}>
              Confirmed. The next press reloads the shipped synthetic dataset on this device only.
            </Text>
          ) : null}
        </Card>

        {datasetIsEmpty ? (
          <Banner
            tone="warn"
            label={`The synthetic dataset is empty${emptyLoaded ? '' : ' (loaded earlier on this device)'}. Charts, transcripts and attention lists now show empty states rather than zeros, because unknown data is never rendered as zero.`}
          >
            <ButtonRow style={{ marginTop: spacing.md }}>
              <Button label="Back to Home" icon="home-outline" onPress={() => openView('home')} />
              <Button label="Reset to the shipped dataset" variant="secondary" onPress={() => setConfirmReset(true)} />
            </ButtonRow>
          </Banner>
        ) : null}
      </Section>

      <Divider />

      {/* -------------------------------------------------------- 5. baseline revision */}
      <Section
        title="Baseline revision"
        subtitle="A counter for the synthetic baseline records that plans and projections are computed from."
      >
        <Card>
          <MetricRevision revision={state.revision} />
          <Text style={[type.caption, { marginTop: spacing.sm }]}>
            Saved study plans remember the revision they were built on. When this number changes, each saved plan reports
            that it was recalculated against the new baseline rather than silently reusing its old assumptions.
          </Text>
        </Card>
      </Section>

      <Banner
        tone="info"
        label="Nothing on this screen uploads, submits or contacts any university system. Every change stays in the local synthetic dataset on this device, and Reset returns the app to the shipped synthetic dataset."
      >
        <ButtonRow style={{ marginTop: spacing.md }}>
          <Button label="Back to Home" icon="home-outline" variant="secondary" onPress={() => openView('home')} />
        </ButtonRow>
      </Banner>
    </View>
  );
}

/** Revision readout kept in words so the number is never the only signal. */
function MetricRevision({ revision }) {
  return (
    <View>
      <Text style={type.metric}>Revision {Number(revision) || 0}</Text>
      <Text style={type.caption}>
        {`This baseline is revision ${Number(revision) || 0}. Saving a synthetic course, attendance or marks change bumps it.`}
      </Text>
    </View>
  );
}



const styles = StyleSheet.create({
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.sm },
  assessmentHead: { flexDirection: 'row', alignItems: 'flex-start', paddingTop: spacing.sm },
  summaryHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
});

export default DemoDataScreen;