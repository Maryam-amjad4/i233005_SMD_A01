/**
 * react-native-chart-kit replacement for the render harness.
 *
 * Charts are third-party and native-only, so they render as tags here. The
 * harness still exercises the data plumbing that feeds them: which means a
 * NaN or an empty label set would still be visible in the caller's props.
 */
export const BarChart = 'BarChart';
export const LineChart = 'LineChart';
export const PieChart = 'PieChart';
export const ProgressChart = 'ProgressChart';
export const ContributionGraph = 'ContributionGraph';
export const StackedBarChart = 'StackedBarChart';
export const AbstractChart = 'AbstractChart';
export default { BarChart, LineChart, PieChart };
