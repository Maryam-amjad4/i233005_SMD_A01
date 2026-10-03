/**
 * Fee detail — one synthetic fee record, its component ledger and one challan.
 *
 * Owns: the component/total consistency check, the per-challan detail (amount,
 * issued date, due date, reference, status, paid date and a days-until-due
 * statement computed from `state.demoDate`) and the payment guidance text. The
 * screen is read-only: there is no payment action, no bank detail and no way to
 * mark a challan paid.
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
  Section,
  Status,
} from '../../ui/components.js';
import { colors, radius, spacing, type } from '../../ui/theme.js';
import { daysBetween, formatDate } from '../../domain/validation.js';
import { dueWording, plural } from '../../domain/wording.js';

function pluralDays(count) {
  return plural(Math.abs(count), 'day');
}

function formatMoney(amount, currency) {
  if (amount == null || amount === '') return 'No amount recorded';
  const value = Number(amount);
  if (!Number.isFinite(value)) return 'No amount recorded';
  const digits = String(Math.round(Math.abs(value)));
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${currency ? `${currency} ` : ''}${value < 0 ? '-' : ''}${grouped}`;
}

function challanState(challan, demoDate) {
  if (challan.status === 'paid') return { id: 'paid', label: 'Paid', tone: 'ok' };
  const remaining = daysBetween(demoDate, challan.dueDate);
  if (remaining == null) return { id: 'unpaid', label: 'Unpaid — due date not readable', tone: 'neutral' };
  if (remaining < 0) return { id: 'overdue', label: dueWording(remaining).text, tone: 'danger' };
  if (remaining === 0) return { id: 'unpaid', label: 'Unpaid — due today', tone: 'warn' };
  return { id: 'unpaid', label: `Unpaid — ${pluralDays(remaining)} left`, tone: 'warn' };
}

function dueStatement(challan, demoDate) {
  const remaining = daysBetween(demoDate, challan.dueDate);
  if (challan.status === 'paid') {
    return `This challan is recorded as paid${challan.paidDate ? ` on ${formatDate(challan.paidDate)}` : ''}. The due date is kept for the record only.`;
  }
  if (remaining == null) return 'The due date in this record could not be read, so no days-until-due figure can be given.';
  if (remaining < 0) return `${pluralDays(remaining)} past the due date of ${formatDate(challan.dueDate)}.`;
  if (remaining === 0) return `Due today (${formatDate(challan.dueDate)}) — the last day of the demonstration window.`;
  return `${pluralDays(remaining)} until the due date of ${formatDate(challan.dueDate)}.`;
}

export function FeeDetailScreen({ state, actions, openView, params }) {
  const feeId = params?.feeId;
  const demoDate = state.demoDate;

  const fee = useMemo(() => (state.fees || []).find((f) => f.id === feeId) || null, [state.fees, feeId]);

  const semester = useMemo(
    () => (fee ? (state.semesters || []).find((s) => s.id === fee.semesterId) || null : null),
    [state.semesters, fee],
  );

  const components = (fee?.components || []).filter((c) => c != null);
  const componentSum = components.reduce((sum, c) => {
    if (c.amount == null || c.amount === '') return sum;
    const amount = Number(c.amount);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);
  const statedTotal = Number(fee?.totalAmount);
  // An unparsable stated total is also a disagreement: unknown is never treated as zero.
  const totalsAgree = Number.isFinite(statedTotal) && Math.abs(componentSum - statedTotal) < 0.005;

  const challans = fee?.challans || [];
  const requested = params?.challanId ? challans.find((c) => c.id === params.challanId) || null : null;
  const [selectedChallanId, setSelectedChallanId] = useState(null);

  const activeChallan = requested || challans.find((c) => c.id === selectedChallanId) || challans[0] || null;

  if (!fee) {
    return (
      <View>
        <EmptyState
          icon="receipt-outline"
          title="That fee record is not in this dataset"
          message={
            feeId
              ? `No synthetic fee record with the id "${feeId}" exists in the loaded dataset. Nothing is inferred and no amount is guessed.`
              : 'This screen was opened without a fee id, so there is no record to show.'
          }
          actionLabel="Back to finance"
          onAction={() => openView('finance', {})}
        />
      </View>
    );
  }

  const currency = fee.currency;

  return (
    <View>
      <Banner
        label="This is a synthetic demonstration record. Flex++ cannot take a payment, shows no bank details and marks nothing as paid."
        tone="warn"
      />

      <Section
        title="Fee record"
        subtitle={semester ? `${semester.label} · semester status: ${semester.status}` : 'No matching semester record in the dataset.'}
      >
        <Card>
          <KeyValueRow label="Fee record id" value={fee.id} mono />
          <KeyValueRow label="Semester" value={semester ? semester.label : 'Unknown semester'} />
          <KeyValueRow label="Currency" value={currency || 'Not recorded'} />
          <Divider />
          <Text style={[type.label, { marginBottom: spacing.xs }]}>Component ledger</Text>
          {components.length === 0 ? (
            <Text style={type.bodyMuted}>
              No fee components are recorded for this term. That is missing data, not a zero charge.
            </Text>
          ) : (
            components.map((component, index) => (
              <KeyValueRow
                key={`${component.label}-${index}`}
                label={component.label || 'Unnamed component'}
                value={formatMoney(component.amount, currency)}
                mono
              />
            ))
          )}
          <Divider />
          <KeyValueRow label="Stated total on this record" value={formatMoney(fee.totalAmount, currency)} mono />
          <KeyValueRow
            label="Sum of listed components"
            value={formatMoney(componentSum, currency)}
            tone={totalsAgree ? undefined : 'red700'}
            mono
          />
          {fee.note ? <KeyValueRow label="Record note" value={fee.note} /> : null}
        </Card>

        {!totalsAgree ? (
          <Banner
            label={`The listed components add up to ${formatMoney(componentSum, currency)} but this synthetic record states a total of ${formatMoney(fee.totalAmount, currency)}. The synthetic record is internally inconsistent; no amount has been corrected or inferred.`}
            tone="danger"
          />
        ) : null}
      </Section>

      <Section title="Challan detail" subtitle="Synthetic challans held in this fee record.">
        {challans.length === 0 ? (
          <EmptyState
            icon="document-text-outline"
            title="No challan recorded for this term"
            message="The dataset carries no challan for this fee record, so there is no amount, reference or due date to show. Missing data is never treated as zero."
            actionLabel="Back to finance"
            onAction={() => openView('finance', {})}
          />
        ) : (
          <View>
            {challans.length > 1 ? (
              <View style={styles.chipRow}>
                {challans.map((challan) => (
                  <Chip
                    key={challan.id}
                    label={challan.label || challan.id}
                    selected={activeChallan && challan.id === activeChallan.id}
                    onPress={() => setSelectedChallanId(challan.id)}
                    testID={`fee-challan-${challan.id}`}
                  />
                ))}
              </View>
            ) : null}

            {requested === null && params?.challanId ? (
              <Banner
                label={`Challan "${params.challanId}" is not part of this fee record, so the first recorded challan is shown instead.`}
                tone="warn"
              />
            ) : null}

            {activeChallan ? (
              <Card
                tone={
                  challanState(activeChallan, demoDate).id === 'overdue'
                    ? 'danger'
                    : challanState(activeChallan, demoDate).id === 'paid'
                      ? 'ok'
                      : undefined
                }
              >
                <View style={styles.headRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={type.metricSmall}>{formatMoney(activeChallan.amount, currency)}</Text>
                    <Text style={type.caption}>{activeChallan.label || 'Unnamed challan'}</Text>
                  </View>
                  <Status
                    label={challanState(activeChallan, demoDate).label}
                    tone={challanState(activeChallan, demoDate).tone}
                  />
                </View>

                <KeyValueRow label="Amount" value={formatMoney(activeChallan.amount, currency)} mono />
                <KeyValueRow label="Issued date" value={formatDate(activeChallan.issuedDate)} />
                <KeyValueRow label="Due date" value={formatDate(activeChallan.dueDate)} />
                <KeyValueRow label="Reference" value={activeChallan.reference || 'Not recorded'} mono />
                <KeyValueRow
                  label="Status"
                  value={activeChallan.status === 'paid' ? 'Paid' : 'Unpaid'}
                />
                {activeChallan.status === 'paid' ? (
                  <KeyValueRow label="Paid date" value={formatDate(activeChallan.paidDate)} />
                ) : (
                  <KeyValueRow label="Paid date" value="Not paid in this dataset" />
                )}

                <View style={styles.noteBox}>
                  <Text style={[type.label, { marginBottom: spacing.xs }]}>Days until due</Text>
                  <Text style={type.bodyMuted}>{dueStatement(activeChallan, demoDate)}</Text>
                  <Text style={[type.caption, { marginTop: spacing.xs }]}>
                    {`Measured from the demo date ${formatDate(demoDate)}, not the device clock.`}
                  </Text>
                </View>
              </Card>
            ) : null}
          </View>
        )}
      </Section>

      <Section title="Payment guidance">
        <Card>
          <Text style={type.bodyMuted}>
            Visit the official finance office and consult the published fee notice for the amounts, the due date and the
            reference your university issued. Flex++ cannot take a payment, shows no bank or account details, and marks
            nothing as paid. The status above is a synthetic record, not a receipt.
          </Text>
          <ButtonRow style={{ marginTop: spacing.md }}>
            <Button
              label="Back to finance"
              variant="secondary"
              icon="arrow-back"
              onPress={() => openView('finance', {})}
              testID="fee-detail-back"
            />
          </ButtonRow>
        </Card>
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.xs },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.sm, gap: spacing.sm },
  noteBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
});

export default FeeDetailScreen;
