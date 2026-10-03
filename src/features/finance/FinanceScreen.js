/**
 * Finance — semester fee records and challans.
 *
 * Owns: the list of synthetic fee cards, the All/Unpaid/Paid/Overdue filter and
 * the honest statement that this app has no payment destination. Every amount,
 * reference and due date comes from the dataset and every comparison is made
 * against `state.demoDate`, never the device clock. This screen cannot take,
 * mark or simulate a payment.
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
  KeyValueRow,
  MetricTile,
  Section,
  Status,
} from '../../ui/components.js';
import { colors, spacing, type } from '../../ui/theme.js';
import { daysBetween, formatDate } from '../../domain/validation.js';
import { dueWording, plural } from '../../domain/wording.js';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'unpaid', label: 'Unpaid' },
  { id: 'paid', label: 'Paid' },
  { id: 'overdue', label: 'Overdue' },
];

function pluralDays(count) {
  return plural(Math.abs(count), 'day');
}

/** Grouped thousands separator without depending on Intl support in the runtime. */
function formatMoney(amount, currency) {
  if (amount == null || amount === '') return 'No amount recorded';
  const value = Number(amount);
  if (!Number.isFinite(value)) return 'No amount recorded';
  const digits = String(Math.round(Math.abs(value)));
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${currency ? `${currency} ` : ''}${value < 0 ? '-' : ''}${grouped}`;
}

/** Challan-level state in words. Unknown dates stay unknown; they are never "on time". */
function challanState(challan, demoDate) {
  if (challan.status === 'paid') return { id: 'paid', label: 'Paid', tone: 'ok' };
  const remaining = daysBetween(demoDate, challan.dueDate);
  if (remaining == null) return { id: 'unpaid', label: 'Unpaid — due date not readable', tone: 'neutral' };
  if (remaining < 0) return { id: 'overdue', label: dueWording(remaining).text, tone: 'danger' };
  if (remaining === 0) return { id: 'unpaid', label: 'Unpaid — due today', tone: 'warn' };
  return { id: 'unpaid', label: `Unpaid — ${pluralDays(remaining)} left`, tone: 'warn' };
}

/** Fee-level status derived from its challans. */
function feeStatus(fee, demoDate) {
  const challans = fee.challans || [];
  if (challans.length === 0) return { id: 'none', label: 'No challan record', tone: 'neutral' };
  const unpaid = challans.filter((c) => c.status !== 'paid');
  if (unpaid.length === 0) return { id: 'paid', label: 'Paid — every challan settled', tone: 'ok' };
  const overdue = unpaid.filter((c) => {
    const remaining = daysBetween(demoDate, c.dueDate);
    return remaining != null && remaining < 0;
  });
  if (overdue.length > 0) {
    return { id: 'overdue', label: `Overdue — ${overdue.length} unpaid past the due date`, tone: 'danger' };
  }
  return { id: 'unpaid', label: 'Unpaid — nothing past its due date', tone: 'warn' };
}

function matchesFilter(challan, filter, demoDate) {
  if (filter === 'all') return true;
  return challanState(challan, demoDate).id === filter;
}

export function FinanceScreen({ state, actions, openView, params }) {
  const [filter, setFilter] = useState('all');
  const demoDate = state.demoDate;

  const semesterById = useMemo(
    () => new Map((state.semesters || []).map((s) => [s.id, s])),
    [state.semesters],
  );

  const fees = useMemo(() => state.fees || [], [state.fees]);

  const rows = useMemo(
    () =>
      fees.map((fee) => {
        const semester = semesterById.get(fee.semesterId) || null;
        const status = feeStatus(fee, demoDate);
        const all = fee.challans || [];
        const visible = all.filter((challan) => matchesFilter(challan, filter, demoDate));
        return { fee, semester, status, all, visible };
      }),
    [fees, semesterById, demoDate, filter],
  );

  const visibleRows = filter === 'all' ? rows : rows.filter((row) => row.visible.length > 0);

  const summary = useMemo(() => {
    const paid = rows.filter((r) => r.status.id === 'paid').length;
    const overdue = rows.filter((r) => r.status.id === 'overdue').length;
    const unpaid = rows.filter((r) => r.status.id === 'unpaid').length;
    return { paid, overdue, unpaid, total: rows.length };
  }, [rows]);

  return (
    <View>
      <Banner
        label="Every amount, due date and reference below is synthetic demonstration data. Flex++ has no payment destination, takes no payment, shows no bank details and cannot mark a challan paid."
        tone="warn"
      />

      <Section
        title="Fee records"
        subtitle={`Compared against the demo date ${formatDate(demoDate)}, not the device clock.`}
      >
        <View style={styles.metricRow}>
          <MetricTile label="Fee records" value={String(summary.total)} caption="Terms in this dataset" />
          <MetricTile label="Unpaid" value={String(summary.unpaid)} tone={summary.unpaid ? 'amber700' : undefined} caption="Nothing past due" />
          <MetricTile label="Overdue" value={String(summary.overdue)} tone={summary.overdue ? 'red700' : undefined} caption="Unpaid past due date" />
        </View>

        <View style={styles.chipRow}>
          {FILTERS.map((option) => (
            <Chip
              key={option.id}
              label={option.label}
              selected={filter === option.id}
              onPress={() => setFilter(option.id)}
              testID={`finance-filter-${option.id}`}
            />
          ))}
        </View>

        {visibleRows.length === 0 ? (
          <EmptyState
            icon="wallet-outline"
            title={`No challan matches "${FILTERS.find((f) => f.id === filter)?.label || filter}"`}
            message="The filter is applied to the synthetic challans in this dataset. Switch back to All to see every fee record, or load a different dataset from the Demo data screen."
            actionLabel="Show all challans"
            onAction={() => setFilter('all')}
          />
        ) : (
          visibleRows.map(({ fee, semester, status, all, visible }) => {
            const semesterLabel = semester ? semester.label : 'Unknown semester';
            const semesterNote = semester ? semester.status : 'No matching semester record';
            return (
              <Card
                key={fee.id}
                title={semesterLabel}
                subtitle={`${fee.currency || 'Amount'} · semester status: ${semesterNote}`}
                tone={status.id === 'overdue' ? 'danger' : status.id === 'paid' ? 'ok' : status.id === 'unpaid' ? 'warn' : undefined}
              >
                <View style={styles.headRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={type.metricSmall}>{formatMoney(fee.totalAmount, fee.currency)}</Text>
                    <Text style={type.caption}>{`Stated total for ${semesterLabel}`}</Text>
                  </View>
                  <Status label={status.label} tone={status.tone} />
                </View>

                <View style={styles.ledger}>
                  <KeyValueRow label="Fee components listed" value={String((fee.components || []).length)} mono />
                  <KeyValueRow label="Challans in this record" value={String(all.length)} mono />
                  {all.length > 0 && filter !== 'all' ? (
                    <KeyValueRow label="Challans matching this filter" value={String(visible.length)} mono />
                  ) : null}
                  {fee.note ? <KeyValueRow label="Record note" value={fee.note} /> : null}
                </View>

                <Divider />

                <Text style={[type.label, { marginBottom: spacing.xs }]}>
                  {visible.length > 0 ? 'Challans' : 'Challans in this filter'}
                </Text>

                {visible.length === 0 ? (
                  <Text style={type.bodyMuted}>
                    {all.length === 0
                      ? 'No challan record exists for this term. That is missing data, not a zero balance.'
                      : `No challan in this record matches the "${FILTERS.find((f) => f.id === filter)?.label}" filter.`}
                  </Text>
                ) : (
                  visible.map((challan, index) => {
                    const challanStatus = challanState(challan, demoDate);
                    return (
                      <View
                        key={challan.id}
                        style={[styles.challanRow, index > 0 ? styles.rowDivider : null]}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={type.body}>{challan.label || 'Unnamed challan'}</Text>
                          <Text style={[type.caption, { marginTop: 2 }]}>
                            {`${formatMoney(challan.amount, fee.currency)} · due ${formatDate(challan.dueDate)}`}
                          </Text>
                          <Text style={[type.mono, { marginTop: 2, color: colors.inkFaint }]}>
                            {`Reference ${challan.reference || 'not recorded'}`}
                          </Text>
                        </View>
                        <View style={styles.challanRight}>
                          <Status label={challanStatus.label} tone={challanStatus.tone} />
                          <Button
                            label="Details"
                            variant="secondary"
                            icon="open-outline"
                            onPress={() => openView('feeDetail', { feeId: fee.id, challanId: challan.id })}
                            testID={`fee-detail-${challan.id}`}
                          />
                        </View>
                      </View>
                    );
                  })
                )}

                <ButtonRow style={{ marginTop: spacing.md }}>
                  <Button
                    label="Open fee record"
                    variant="secondary"
                    icon="receipt-outline"
                    onPress={() => openView('feeDetail', { feeId: fee.id })}
                    testID={`fee-open-${fee.id}`}
                  />
                </ButtonRow>
              </Card>
            );
          })
        )}
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({
  metricRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.xs },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.sm, gap: spacing.sm },
  ledger: { marginTop: spacing.xs },
  challanRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  challanRight: { alignItems: 'flex-end', gap: spacing.sm, maxWidth: 200 },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.border },
});

export default FinanceScreen;
