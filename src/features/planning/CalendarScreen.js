/**
 * Calendar — academic windows, events and the student's own deadlines.
 *
 * This screen owns: the ordered list of `state.academicEvents`, the window
 * status of each entry, and the merged deadline list (tasks plus unpaid
 * synthetic challans). It is read-only apart from navigation.
 *
 * Two rules shape everything here:
 *   1. Every "open / upcoming / closed" and "overdue" comparison runs against the
 *      stored `state.demoDate` via `windowStatus` / `daysBetween`, never the
 *      device clock, so the calendar is reproducible on any day it is opened.
 *   2. Every phrase a deadline or a window reads as comes from
 *      `domain/wording.js`. The same overdue task must not read differently here
 *      and on the Tasks screen.
 *
 * Nothing here books, pays or submits anything. Tapping a challan only
 * navigates to the read-only fee detail.
 */
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Banner, Card, Chip, EmptyState, Section, Status } from '../../ui/components.js';
import { colors, spacing, type } from '../../ui/theme.js';
import { daysBetween, formatDate, windowStatus, windowStatusTone } from '../../domain/validation.js';
import { dueWording, windowStatusWords } from '../../domain/wording.js';

export const CALENDAR_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'closed', label: 'Closed' },
];

/**
 * Inclusive date range. A single-day event is called out explicitly rather than
 * being printed as a range that starts and ends on the same day.
 */
export function rangeText(event) {
  const start = formatDate(event.startDate);
  const end = formatDate(event.endDate);
  if (event.startDate === event.endDate) return `${start} (single date)`;
  return `${start} to ${end}, both dates included`;
}

/**
 * Deadline wording. A deadline carries the same due-date state as a task, so it
 * uses the shared phrase rather than a screen-local one: the same date must not
 * read differently depending on which screen shows it.
 */
function deadlineWording(dueDate, demoDate) {
  return dueWording(daysBetween(demoDate, dueDate));
}

export function CalendarScreen({ state, actions, openView, params }) {
  // `actions` and `params` are part of the shared screen signature; this screen
  // is read-only apart from navigation, so neither is used here.
  void actions;
  void params;

  const [filter, setFilter] = useState('all');

  const events = useMemo(
    () =>
      [...(state.academicEvents || [])]
        .map((event) => ({ event, status: windowStatus(event, state.demoDate) }))
        .sort((a, b) => String(a.event.startDate).localeCompare(String(b.event.startDate))),
    [state.academicEvents, state.demoDate],
  );

  const visibleEvents = useMemo(
    () => (filter === 'all' ? events : events.filter((row) => row.status === filter)),
    [events, filter],
  );

  /** Tasks and unpaid challans merged into one date-ordered deadline list. */
  const deadlines = useMemo(() => {
    const courseById = new Map((state.courses || []).map((c) => [c.id, c]));
    const rows = [];

    (state.tasks || []).forEach((task) => {
      const enrollment = (state.enrollments || []).find((e) => e.id === task.enrollmentId);
      const course = enrollment ? courseById.get(enrollment.courseId) : null;
      rows.push({
        key: `task-${task.id}`,
        date: task.dueDate,
        kind: 'Task',
        title: task.title,
        detail: [
          task.completed ? 'Completed' : 'Not done',
          course ? course.code : 'Not linked to a course',
          task.priority ? `${task.priority} priority` : null,
        ]
          .filter(Boolean)
          .join(' · '),
        statusLabel: task.completed ? 'Completed' : 'Open',
        statusTone: task.completed ? 'ok' : 'neutral',
        onPress: () => openView('tasks'),
      });
    });

    (state.fees || []).forEach((fee) => {
      (fee.challans || []).forEach((challan) => {
        if (challan.status === 'paid') return;
        rows.push({
          key: `challan-${fee.id}-${challan.id}`,
          date: challan.dueDate,
          kind: 'Synthetic challan',
          title: challan.label,
          detail: `${fee.currency} ${Number(challan.amount) || 0} · ${challan.status}`,
          statusLabel: 'Unpaid (demonstration)',
          statusTone: 'warn',
          onPress: () => openView('feeDetail', { feeId: fee.id, challanId: challan.id }),
        });
      });
    });

    return rows.sort((a, b) => {
      const left = String(a.date || '9999-12-31').localeCompare(String(b.date || '9999-12-31'));
      if (left !== 0) return left;
      return a.kind.localeCompare(b.kind);
    });
  }, [state.tasks, state.enrollments, state.courses, state.fees, openView]);

  return (
    <View>
      <Banner
        label={`Every date on this screen is measured against the stored demonstration date ${formatDate(state.demoDate)}, not the device clock. The calendar therefore looks identical whenever it is opened.`}
        tone="info"
      />

      <Banner
        label="Windows, challans and events below are synthetic demonstration settings. Opening a challan only shows its details — no payment is taken, simulated or recorded."
        tone="warn"
      />

      <Section title="Filter windows">
        <View style={styles.chipRow}>
          {CALENDAR_FILTERS.map((option) => (
            <Chip
              key={option.id}
              label={option.label}
              selected={filter === option.id}
              onPress={() => setFilter(option.id)}
            />
          ))}
        </View>
      </Section>

      <Section
        title="Academic windows and events"
        subtitle={`${visibleEvents.length} of ${events.length} entries, ordered by start date.`}
      >
        {visibleEvents.length === 0 ? (
          <EmptyState
            icon="calendar-outline"
            title={events.length === 0 ? 'No academic windows recorded' : 'Nothing matches this filter'}
            message={
              events.length === 0
                ? 'The dataset carries no windows or events, so there is nothing to order by date.'
                : `None of the ${events.length} recorded windows is ${filter}. Closed windows stay in the list so their history is still visible.`
            }
            actionLabel={events.length === 0 ? undefined : 'Show all windows'}
            onAction={events.length === 0 ? undefined : () => setFilter('all')}
          />
        ) : (
          visibleEvents.map(({ event, status }) => (
            <Card
              key={event.id}
              title={event.title}
              subtitle={rangeText(event)}
              right={<Status label={windowStatusWords(status)} tone={windowStatusTone(status)} />}
            >
              <Text style={[type.caption, { marginBottom: spacing.xs }]}>
                {`Source: ${event.source || 'Not recorded'}`}
              </Text>
              <Text style={type.caption}>{`Date semantics: ${event.dateSemantics || 'Not recorded'}`}</Text>
              <View style={styles.tagRow}>
                <Chip label={event.type === 'window' ? 'Window' : 'Event'} icon={event.type === 'window' ? 'business' : 'flag'} />
                <Chip label={`Starts ${formatDate(event.startDate)}`} />
              </View>
            </Card>
          ))
        )}
      </Section>

      <Section
        title="My deadlines"
        subtitle="Tasks and unpaid synthetic challans, earliest first. Tap a row to open it."
      >
        {deadlines.length === 0 ? (
          <EmptyState
            icon="alarm-outline"
            title="No deadlines recorded"
            message="Add a task in Tasks, or load the demonstration dataset to see a synthetic unpaid challan here."
          />
        ) : (
          deadlines.map((row) => {
            const due = deadlineWording(row.date, state.demoDate);
            return (
              <Card
                key={row.key}
                onPress={row.onPress}
                title={row.title}
                subtitle={`${row.kind} · ${row.date ? formatDate(row.date) : 'No date'}`}
                right={<Status label={row.statusLabel} tone={row.statusTone} />}
              >
                <View style={styles.tagRow}>
                  <Status label={due.text} tone={due.tone} />
                </View>
                <Text style={[type.caption, { marginTop: spacing.xs }]}>{row.detail}</Text>
              </Card>
            );
          })
        )}
      </Section>

      <Text style={[type.caption, { marginTop: spacing.sm }]}>
        Dates shown as a single date mean the window opens and closes on that day. Windows with
        inclusive end dates stay open through the final day.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.sm },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});

export default CalendarScreen;