/**
 * Chart wrappers for the dashboard.
 *
 * Two required chart types are provided: a bar chart for per-course attendance
 * and a line chart for the GPA trend. Both wrappers take plain arrays and refuse
 * to render non-finite or empty data — a chart with NaN or an empty label set is
 * the classic failure mode of chart libraries, so the guard lives here rather
 * than at every call site.
 */
import React, { useMemo } from 'react';
import { ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { BarChart, LineChart } from 'react-native-chart-kit';

import { EmptyState, Status } from '../../ui/components.js';
import { isRealNumber } from '../../domain/validation.js';
import { colors, radius, spacing, type, chartPalette } from '../../ui/theme.js';

/** Chart width that fits a 360pt screen after card padding. */
export function useChartWidth() {
  // useWindowDimensions subscribes to size changes, so the chart re-measures
  // when the window changes instead of only reading the size once at import.
  const { width } = useWindowDimensions();
  return Math.max(220, Math.min(340, width - 2 * spacing.lg - 2 * spacing.lg));
}

const gridColor = (opacity = 1) => `rgba(216, 222, 230, ${opacity})`;
const labelColor = (opacity = 1) => `rgba(78, 92, 107, ${opacity})`;

/**
 * Attendance per course. `data` is `[{ label, value }]`; rows whose `value` is
 * not a real number are missing data, are excluded from the plot, and are
 * reported in the caption instead.
 */
export function AttendanceBarChart({ data, width, thresholdPercent }) {
  const measuredWidth = useChartWidth();
  const chartWidth = width || measuredWidth;
  // A row with no percentage is missing data, not a zero-height bar, so it is
  // left out of the plot and named in the caption instead.
  const usable = useMemo(() => data.filter((row) => isRealNumber(row.value)), [data]);
  const omitted = data.length - usable.length;
  const finite = useMemo(() => usable.map((row) => row.value), [usable]);

  if (!data.length) {
    return <EmptyState icon="stats-chart-outline" title="No attendance data yet" message="Add or publish session records to chart attendance." />;
  }
  if (!usable.length) {
    return (
      <EmptyState
        icon="help-circle-outline"
        title="Attendance not calculable"
        message="Recorded sessions exist but no course currently has a usable percentage."
      />
    );
  }

  return (
    <View
      accessible
      accessibilityLabel={`Attendance bar chart: recorded-session attendance for ${usable.length} course${usable.length === 1 ? '' : 's'} against the ${thresholdPercent}% threshold.${omitted > 0 ? ` ${omitted} module${omitted === 1 ? '' : 's'} without usable published sessions excluded.` : ''}`}
    >
      <BarChart
        data={{
          labels: usable.map((row) => row.label),
          datasets: [{ data: finite }],
        }}
        width={chartWidth}
        height={200}
        fromZero
        withInnerLines
        chartConfig={{
          backgroundColor: colors.surface,
          backgroundGradientFrom: colors.surface,
          backgroundGradientTo: colors.surface,
          color: (opacity = 1) => `rgba(20, 145, 155, ${opacity})`,
          labelColor,
          fillShadowGradient: colors.teal100,
          fillShadowGradientOpacity: 0.35,
          propsForDots: { r: '3', strokeWidth: '1', stroke: colors.teal600 },
          barPercentage: 0.7,
        }}
        yAxisSuffix="%"
        yAxisLabel=""
        segments={4}
        style={{ borderRadius: radius.md, marginLeft: -spacing.sm }}
        verticalLabelRotation={0}
      />
      <Text style={[type.caption, { marginTop: spacing.xs }]}>
        {`Recorded-session attendance per course. Bars use the ${thresholdPercent}% threshold setting; pending entries are excluded.${omitted > 0 ? ` ${omitted} module${omitted === 1 ? '' : 's'} without published sessions are not plotted.` : ''}`}
      </Text>
    </View>
  );
}

/**
 * GPA trend across terms: the cumulative GPA after each finalized term.
 *
 * `data` is `[{ label, value | null }]`. A null is a term with no computable
 * GPA and is drawn as a gap, not as zero. Per-term SGPA is available as a
 * figure on each transcript term rather than as a second plotted series, so
 * the chart makes exactly one claim and the caption states which claim.
 */
export function GpaTrendLineChart({ data, width }) {
  const measuredWidth = useChartWidth();
  const chartWidth = width || measuredWidth;
  const plotable = data.filter((row) => isRealNumber(row.value));
  const values = plotable.map((row) => row.value);
  const hasAny = plotable.length > 0;
  const omitted = data.filter((row) => !isRealNumber(row.value)).map((row) => row.label);

  if (!data.length) {
    return (
      <EmptyState
        icon="trending-up-outline"
        title="No GPA history yet"
        message="Completed terms with declared grades appear here."
      />
    );
  }
  if (!hasAny) {
    return (
      <EmptyState
        icon="help-circle-outline"
        title="GPA not available"
        message="No term has a computable GPA yet, so nothing is plotted."
      />
    );
  }

  return (
    <View
      accessible
      accessibilityLabel={`Cumulative GPA trend line chart across ${plotable.length} term${plotable.length === 1 ? '' : 's'} with a computable GPA.${omitted.length > 0 ? ` ${omitted.length} term${omitted.length === 1 ? '' : 's'} with no computable GPA excluded.` : ''}`}
    >
      <LineChart
        data={{
          labels: plotable.map((row) => row.label),
          datasets: [{ data: values, color: (opacity = 1) => `rgba(27, 58, 95, ${opacity})`, strokeWidth: 2 }],
          legend: ['CGPA per term'],
        }}
        width={chartWidth}
        height={200}
        fromZero={false}
        withDots
        segments={4}
        yAxisSuffix=""
        chartConfig={{
          backgroundColor: colors.surface,
          backgroundGradientFrom: colors.surface,
          backgroundGradientTo: colors.surface,
          decimalPlaces: 2,
          color: (opacity = 1) => `rgba(27, 58, 95, ${opacity})`,
          labelColor,
          propsForBackgroundLines: { stroke: gridColor(0.6), strokeDasharray: '4 4' },
          propsForDots: { r: '3', strokeWidth: '1', stroke: colors.navy700 },
        }}
        style={{ borderRadius: radius.md, marginLeft: -spacing.sm }}
        bezier={false}
      />
      <Text style={[type.caption, { marginTop: spacing.xs }]}>
        {`Cumulative GPA computed from finalized attempts only, using the same calculator as the transcript screen.${omitted.length > 0 ? ` ${omitted.join(', ')} omitted: no computable GPA yet, so nothing is plotted for ${omitted.length === 1 ? 'it' : 'them'} rather than plotting zero.` : ''}`}
      </Text>
    </View>
  );
}

/**
 * Compact distribution strip (one stacked bar) used on the course workspace to
 * show how much weight is scored, unpublished or still scheduled.
 */
export function WeightDistributionBar({ segments }) {
  const total = segments.reduce((sum, segment) => sum + Math.max(0, Number(segment.value) || 0), 0);
  if (total <= 0) {
    return <Status label="No assessment scheme published" tone="neutral" />;
  }
  return (
    <View>
      <View style={{ flexDirection: 'row', height: 14, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: colors.surfaceSunken }}>
        {segments.map((segment) =>
          Math.max(0, Number(segment.value) || 0) > 0 ? (
            <View key={segment.label} style={{ flex: Math.max(0, Number(segment.value)), backgroundColor: segment.color }} />
          ) : null,
        )}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: spacing.sm }}>
        {segments.map((segment) => (
          <View key={segment.label} style={{ flexDirection: 'row', alignItems: 'center', marginRight: spacing.md }}>
            <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: segment.color, marginRight: spacing.xs }} />
            <Text style={type.caption}>
              {isRealNumber(segment.value) ? `${segment.label} ${segment.value.toFixed(0)}%` : `${segment.label} —`}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

export default { useChartWidth, AttendanceBarChart, GpaTrendLineChart, WeightDistributionBar, chartPalette };
