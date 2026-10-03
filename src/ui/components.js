/**
 * Reusable presentational components (assignment requirement I).
 *
 * Every interactive element here is at least 44–48 points tall, states are
 * communicated with a word or icon in addition to colour, and fields expose
 * their own validation message so forms can report errors in place.
 */
import React from 'react';
import { Pressable, Text, TextInput, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radius, spacing, type, HIT_TARGET } from './theme.js';

/* ------------------------------------------------------------------ Button */

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled = false,
  tone,
  style,
  testID,
  accessibilityLabel,
}) {
  const palette = buttonPalette[variant] || buttonPalette.primary;
  const labelColor = tone ? colors[tone] : palette.label;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: palette.background, borderColor: palette.border },
        tone ? { borderColor: colors[tone], backgroundColor: palette.background } : null,
        pressed && !disabled ? styles.buttonPressed : null,
        disabled ? styles.buttonDisabled : null,
        style,
      ]}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={17}
          color={disabled ? colors.inkFaint : labelColor}
          style={{ marginRight: spacing.sm }}
        />
      ) : null}
      <Text
        numberOfLines={2}
        style={[type.body, { color: disabled ? colors.inkFaint : labelColor, fontWeight: '600', textAlign: 'center' }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const buttonPalette = {
  primary: { background: colors.teal600, border: colors.teal600, label: colors.white },
  secondary: { background: colors.surface, border: colors.borderStrong, label: colors.navy900 },
  ghost: { background: 'transparent', border: 'transparent', label: colors.teal600 },
  danger: { background: colors.surface, border: colors.red500, label: colors.red700 },
};

/** Small horizontal group of Buttons that wraps on narrow screens. */
export function ButtonRow({ children, style }) {
  return <View style={[styles.buttonRow, style]}>{children}</View>;
}

/** Selectable pill used for filters, sorting and section switching. */
export function Chip({ label, selected, onPress, icon, testID }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected ? styles.chipSelected : styles.chipIdle,
        pressed ? styles.chipPressed : null,
      ]}
    >
      {icon ? (
        <Ionicons
          name={icon}
          size={14}
          color={selected ? colors.white : colors.inkMuted}
          style={{ marginRight: spacing.xs }}
        />
      ) : null}
      <Text style={[type.bodyMuted, { color: selected ? colors.white : colors.inkMuted, fontWeight: '600' }]}>
        {label}
      </Text>
    </Pressable>
  );
}

/* -------------------------------------------------------------------- Card */

export function Card({ children, title, subtitle, right, tone, style, onPress, testID }) {
  const body = (
    <View
      style={[
        styles.card,
        tone === 'danger' ? { borderColor: colors.red500 } : null,
        tone === 'warn' ? { borderColor: colors.amber500 } : null,
        tone === 'ok' ? { borderColor: colors.green500 } : null,
        style,
      ]}
    >
      {title || right ? (
        <View style={styles.cardHead}>
          <View style={{ flex: 1, paddingRight: spacing.sm }}>
            {title ? <Text style={type.cardTitle}>{title}</Text> : null}
            {subtitle ? <Text style={[type.caption, { marginTop: 2 }]}>{subtitle}</Text> : null}
          </View>
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => (pressed ? styles.cardPressed : null)}
    >
      {body}
    </Pressable>
  );
}

/** Bordered strip used to group related rows inside a screen. */
export function Section({ title, subtitle, children, style }) {
  return (
    <View style={[styles.section, style]}>
      {title ? <Text style={[type.sectionTitle, { marginBottom: spacing.xs }]}>{title}</Text> : null}
      {subtitle ? <Text style={[type.caption, { marginBottom: spacing.sm }]}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

export function SectionTitle({ children, style }) {
  return <Text style={[type.sectionTitle, style]}>{children}</Text>;
}

export function Divider({ style }) {
  return <View style={[styles.divider, style]} />;
}

/** Label/value row used by ledgers, ledgers of requests and profile cards. */
export function KeyValueRow({ label, value, tone, mono = false, style }) {
  return (
    <View style={[styles.kvRow, style]}>
      <Text style={[type.bodyMuted, { flex: 1, paddingRight: spacing.sm }]}>{label}</Text>
      <Text
        style={[
          mono ? type.mono : type.body,
          { fontWeight: '600', textAlign: 'right', flexShrink: 1 },
          tone ? { color: colors[tone] } : null,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------- Status */

const STATUS_TONES = {
  ok: { color: colors.green700, background: colors.green100, icon: 'checkmark-circle' },
  warn: { color: colors.amber700, background: colors.amber100, icon: 'alert-circle' },
  danger: { color: colors.red700, background: colors.red100, icon: 'close-circle' },
  info: { color: colors.navy700, background: colors.surfaceSunken, icon: 'information-circle' },
  neutral: { color: colors.inkMuted, background: colors.surfaceAlt, icon: 'ellipse-outline' },
};

/**
 * Status pill. The tone always ships with a word ("Below threshold"), so the
 * state never depends on colour alone.
 */
export function Status({ label, tone = 'neutral', style }) {
  const t = STATUS_TONES[tone] || STATUS_TONES.neutral;
  return (
    <View style={[styles.status, { backgroundColor: t.background }, style]}>
      <Ionicons name={t.icon} size={13} color={t.color} style={{ marginRight: spacing.xs }} />
      <Text style={[type.caption, { color: t.color, fontWeight: '700' }]}>{label}</Text>
    </View>
  );
}

/** Inline banner for explanations, policy provenance and demo disclaimers. */
export function Banner({ label, tone = 'info', style, children }) {
  const t = STATUS_TONES[tone] || STATUS_TONES.info;
  return (
    <View
      accessibilityRole="summary"
      style={[styles.banner, { backgroundColor: t.background, borderColor: t.color }, style]}
    >
      <View style={{ flexDirection: 'row' }}>
        <Ionicons name={t.icon} size={16} color={t.color} style={{ marginRight: spacing.sm, marginTop: 1 }} />
        <Text style={[type.bodyMuted, { flex: 1, color: t.color }]}>{label}</Text>
      </View>
      {children}
    </View>
  );
}

/* -------------------------------------------------------------------- Field */

export function Field({
  label,
  value,
  onChangeText,
  error,
  helper,
  placeholder,
  keyboardType = 'default',
  multiline = false,
  editable = true,
  autoCapitalize = 'sentences',
  maxLength,
  testID,
  returnKeyType,
  onSubmitEditing,
  suffix,
}) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      {label ? <Text style={[type.label, { marginBottom: spacing.xs }]}>{label}</Text> : null}
      <View style={[styles.inputWrap, error ? styles.inputWrapError : null]}>
        <TextInput
          testID={testID}
          style={[styles.input, multiline ? { minHeight: 92, textAlignVertical: 'top' } : null]}
          value={value == null ? '' : String(value)}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.inkFaint}
          keyboardType={keyboardType}
          multiline={multiline}
          editable={editable}
          autoCapitalize={autoCapitalize}
          maxLength={maxLength}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          accessibilityLabel={label}
          accessibilityState={{ disabled: !editable }}
        />
        {suffix ? <Text style={[type.bodyMuted, { marginLeft: spacing.sm }]}>{suffix}</Text> : null}
      </View>
      {error ? (
        <View style={styles.fieldMessageRow}>
          <Ionicons name="warning" size={13} color={colors.red700} style={{ marginRight: spacing.xs, marginTop: 1 }} />
          <Text style={[type.caption, { color: colors.red700, flex: 1 }]}>{error}</Text>
        </View>
      ) : helper ? (
        <Text style={[type.caption, { marginTop: spacing.xs }]}>{helper}</Text>
      ) : null}
    </View>
  );
}

/* --------------------------------------------------------------- EmptyState */

export function EmptyState({ title, message, actionLabel, onAction, icon = 'file-tray-outline' }) {
  return (
    <View style={styles.empty} accessibilityRole="summary">
      <Ionicons name={icon} size={34} color={colors.borderStrong} />
      <Text style={[type.cardTitle, { marginTop: spacing.md, textAlign: 'center' }]}>{title}</Text>
      {message ? (
        <Text style={[type.bodyMuted, { marginTop: spacing.xs, textAlign: 'center' }]}>{message}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} variant="secondary" style={{ marginTop: spacing.md }} />
      ) : null}
    </View>
  );
}

/** Small numeric tile used by the dashboard summary row. */
export function MetricTile({ label, value, caption, tone, style }) {
  return (
    <View style={[styles.metricTile, style]}>
      <Text style={[type.label, { color: tone ? colors[tone] : colors.inkMuted }]}>{label}</Text>
      <Text style={[type.metricSmall, tone ? { color: colors[tone] } : null]}>{value}</Text>
      {caption ? <Text style={type.caption}>{caption}</Text> : null}
    </View>
  );
}

/**
 * Clamp a measured percentage into 0–100, or return null when the input is not
 * a real number.
 *
 * A missing measurement (null, undefined, NaN, '') is NOT a zero. `Number(x) || 0`
 * would turn all of those into 0 and print a confident "0.0%"; returning null
 * instead lets the caller say "No data". A genuine 0 is a measurement and stays 0.
 */
export function measuredPercent(valuePercent) {
  if (typeof valuePercent !== 'number' || !Number.isFinite(valuePercent)) return null;
  return Math.max(0, Math.min(100, valuePercent));
}

/**
 * Progress bar with a text percentage, used for assessed weight and credits.
 * Missing input renders "No data" and an empty track rather than a 0.0% bar.
 */
export function ProgressBar({ label, valuePercent, tone = 'teal', caption }) {
  const percent = measuredPercent(valuePercent);
  const fill = { ok: colors.green500, warn: colors.amber500, danger: colors.red500, teal: colors.teal500 }[tone] || colors.teal500;
  return (
    <View style={{ marginBottom: spacing.sm }}>
      <View style={styles.progressHead}>
        <Text style={type.bodyMuted}>{label}</Text>
        <Text style={[type.bodyMuted, { fontWeight: '700' }]}>{percent == null ? 'No data' : `${percent.toFixed(1)}%`}</Text>
      </View>
      <View style={styles.progressTrack}>
        {percent == null ? null : <View style={[styles.progressFill, { width: `${percent}%`, backgroundColor: fill }]} />}
      </View>
      {caption ? <Text style={[type.caption, { marginTop: spacing.xs }]}>{caption}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: HIT_TARGET,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  buttonPressed: { opacity: 0.75 },
  buttonDisabled: { opacity: 0.55 },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    // Chips are primary navigation (section switcher, list filters), so they
    // must meet the same 46pt touch target as every other control.
    minHeight: HIT_TARGET,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  chipIdle: { backgroundColor: colors.surface, borderColor: colors.border },
  chipSelected: { backgroundColor: colors.teal600, borderColor: colors.teal600 },
  chipPressed: { opacity: 0.75 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.sm },
  cardPressed: { opacity: 0.85 },
  section: { marginBottom: spacing.lg },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  kvRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: spacing.xs },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  banner: {
    flexDirection: 'row',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: HIT_TARGET,
  },
  inputWrapError: { borderColor: colors.red500, backgroundColor: colors.red100 },
  input: { flex: 1, paddingVertical: spacing.sm, fontSize: 15, color: colors.ink },
  fieldMessageRow: { flexDirection: 'row', marginTop: spacing.xs },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  metricTile: {
    flex: 1,
    minWidth: 132,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
  progressTrack: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSunken,
    overflow: 'hidden',
  },
  progressFill: { height: 8, borderRadius: radius.pill },
});

export const componentStyles = styles;
