/**
 * Central visual tokens for Flex++.
 *
 * Visual direction (plan section 2): light academic interface, navy text and
 * header accents, teal primary actions, soft neutral surfaces, amber/red
 * warnings. Colour is never the only status signal, so every semantic colour is
 * paired with a word or icon at the call site.
 */

export const colors = {
  navy900: '#0F2A47',
  navy700: '#1B3A5F',
  navy500: '#2E5382',
  teal600: '#0E7C7B',
  teal500: '#14919B',
  teal100: '#E2F2F2',
  amber700: '#8A5A00',
  amber500: '#D08700',
  amber100: '#FDF1DC',
  red700: '#96261F',
  red500: '#C6402F',
  red100: '#FBE7E4',
  green700: '#1F6B3B',
  green500: '#2E8B4F',
  green100: '#E4F2E9',
  ink: '#15202B',
  inkMuted: '#4E5C6B',
  inkFaint: '#7B8794',
  surface: '#FFFFFF',
  surfaceAlt: '#F4F6F9',
  surfaceSunken: '#EDF1F6',
  border: '#D8DEE6',
  borderStrong: '#B9C3CE',
  white: '#FFFFFF',
  overlay: 'rgba(15, 42, 71, 0.45)',
};

/** 4-point spacing scale. */
export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  pill: 999,
};

/**
 * Type scale. Body text stays at 15–16 so long course names remain readable on
 * narrow Android devices, and every interactive target is at least 44pt tall.
 */
export const type = {
  screenTitle: { fontSize: 20, fontWeight: '700', color: colors.navy900, lineHeight: 26 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.navy900, lineHeight: 22 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.navy900, lineHeight: 21 },
  body: { fontSize: 15, color: colors.ink, lineHeight: 22 },
  bodyMuted: { fontSize: 14, color: colors.inkMuted, lineHeight: 20 },
  caption: { fontSize: 12.5, color: colors.inkFaint, lineHeight: 18 },
  label: { fontSize: 13, fontWeight: '600', color: colors.inkMuted, lineHeight: 18 },
  metric: { fontSize: 26, fontWeight: '700', color: colors.navy900, lineHeight: 32 },
  metricSmall: { fontSize: 18, fontWeight: '700', color: colors.navy900, lineHeight: 24 },
  mono: { fontSize: 13.5, color: colors.ink, fontVariant: ['tabular-nums'] },
};

/** Minimum comfortable touch target on Android. */
export const HIT_TARGET = 46;

export const chartPalette = {
  bar: colors.teal500,
  barMuted: colors.navy500,
  line: colors.navy700,
  grid: colors.border,
};

export default { colors, spacing, radius, type, HIT_TARGET, chartPalette };
