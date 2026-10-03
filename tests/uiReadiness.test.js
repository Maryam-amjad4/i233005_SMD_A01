/**
 * UI boundary guards for the "missing is never a confident number" rule.
 *
 * These components live in JSX modules, which plain Node cannot parse, so the
 * test loads them through the same offline render harness the smoke script uses
 * (react/react-native stubs plus a JSX transform). It mounts the real component
 * and reads the strings and element props a user would actually get.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';

register('../scripts/render-harness/hooks.mjs', import.meta.url);

const { ProgressBar, measuredPercent, componentStyles } = await import('../src/ui/components.js');
const { WeightDistributionBar, AttendanceBarChart, GpaTrendLineChart, useChartWidth } = await import(
  '../src/features/home/ChartSmoke.js'
);
const { default: AttendancePlanner } = await import('../src/features/attendance/AttendancePlanner.js');
const { HIT_TARGET } = await import('../src/ui/theme.js');
const { summarizeAttendance } = await import('../src/domain/attendance.js');
const { __mount, __renderNested, __beginTraversal } = await import(
  '../scripts/render-harness/react-stub.mjs'
);

/** Collect the strings a user would read, evaluating nested components. */
function collectStrings(node, out = [], seen = new Set()) {
  if (node == null || typeof node === 'boolean') return out;
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node));
    return out;
  }
  if (Array.isArray(node)) {
    node.forEach((child) => collectStrings(child, out, seen));
    return out;
  }
  if (typeof node !== 'object' || seen.has(node)) return out;
  seen.add(node);
  if (typeof node.type === 'function') {
    collectStrings(__renderNested(node.type, node.props || {}), out, seen);
    return out;
  }
  const props = node.props || {};
  ['label', 'title', 'value', 'message', 'caption', 'accessibilityLabel'].forEach((key) => {
    if (typeof props[key] === 'string' || typeof props[key] === 'number') out.push(String(props[key]));
  });
  collectStrings(props.children, out, seen);
  return out;
}

/** Collect every element node (host or component) so props can be asserted. */
function collectElements(node, out = [], seen = new Set()) {
  if (node == null || typeof node === 'boolean' || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    node.forEach((child) => collectElements(child, out, seen));
    return out;
  }
  if (seen.has(node)) return out;
  seen.add(node);
  if (typeof node.type === 'function') {
    out.push(node);
    collectElements(__renderNested(node.type, node.props || {}), out, seen);
    return out;
  }
  out.push(node);
  collectElements((node.props || {}).children, out, seen);
  return out;
}

/** Mount one component and return its readable strings plus its element tree. */
function inspect(Component, props) {
  const handle = __mount(Component, props);
  __beginTraversal();
  const strings = collectStrings(handle.tree);
  __beginTraversal();
  const elements = collectElements(handle.tree);
  handle.unmount();
  return { strings, text: strings.join(' | '), elements };
}

/* --------------------------------------------------------- (1) ProgressBar */

test('measuredPercent never coerces a missing measurement to zero', () => {
  [null, undefined, NaN, '', ' ', Infinity, -Infinity, {}, [], true].forEach((value) => {
    assert.equal(measuredPercent(value), null, `${JSON.stringify(value)} must not be a measured percent`);
  });
});

test('measuredPercent keeps a genuine zero and clamps real values', () => {
  assert.equal(measuredPercent(0), 0);
  assert.equal(measuredPercent(72.5), 72.5);
  assert.equal(measuredPercent(140), 100);
  assert.equal(measuredPercent(-20), 0);
});

test('ProgressBar renders "No data" and no percentage for missing input', () => {
  [null, undefined, NaN, ''].forEach((value) => {
    const text = inspect(ProgressBar, { label: 'Assessed weight', valuePercent: value }).text;
    assert.ok(text.includes('No data'), `${String(value)} must render "No data"`);
    assert.doesNotMatch(text, /\d+(\.\d+)?%/, `${String(value)} must not render a percentage`);
  });
});

test('ProgressBar still renders a genuine zero as 0.0%', () => {
  const text = inspect(ProgressBar, { label: 'Unresolved weight', valuePercent: 0 }).text;
  assert.match(text, /0\.0%/);
  assert.doesNotMatch(text, /No data/);
});

test('ProgressBar renders a real value with one decimal', () => {
  const text = inspect(ProgressBar, { label: 'Scheduled weight', valuePercent: 42.5 }).text;
  assert.match(text, /42\.5%/);
});

/* ------------------------------------------------------------- (2) Chip */

test('Chip is at least the 44pt minimum touch target', () => {
  assert.ok(HIT_TARGET >= 44, 'HIT_TARGET must itself meet the 44pt minimum');
  assert.equal(componentStyles.chip.minHeight, HIT_TARGET);
});

/* ---------------------------------------------- (3) WeightDistributionBar */

test('WeightDistributionBar never prints NaN% for an unmeasured segment', () => {
  const { text } = inspect(WeightDistributionBar, {
    segments: [
      { label: 'Assessed', value: 50, color: '#14919B' },
      { label: 'Unresolved', value: null, color: '#D08700' },
      { label: 'Scheduled', value: undefined, color: '#B9C3CE' },
    ],
  });
  assert.ok(text.includes('Assessed 50%'), 'a real segment still prints its percentage');
  assert.match(text, /Unresolved —/);
  assert.match(text, /Scheduled —/);
  assert.doesNotMatch(text, /NaN/);
});

/* ------------------------------------------------- (4) Chart accessibility */

test('attendance bar chart exposes a screen-reader summary of plot and exclusions', () => {
  const { text } = inspect(AttendanceBarChart, {
    data: [
      { label: 'DL-2103', value: 70 },
      { label: 'EE-2001' },
    ],
    thresholdPercent: 80,
    width: 300,
  });
  assert.match(text, /Attendance bar chart:/);
  assert.match(text, /1 course against the 80% threshold/);
  assert.match(text, /1 module without usable published sessions excluded/);
});

test('GPA trend line chart exposes a screen-reader summary of plot and exclusions', () => {
  const { text } = inspect(GpaTrendLineChart, {
    data: [
      { label: 'S1', value: 3.2 },
      { label: 'S2', value: null },
    ],
    width: 300,
  });
  assert.match(text, /Cumulative GPA trend line chart/);
  assert.match(text, /1 term with a computable GPA/);
  assert.match(text, /1 term with no computable GPA excluded/);
});

test('useChartWidth still returns a sane width', () => {
  const width = useChartWidth();
  assert.ok(Number.isFinite(width) && width >= 220 && width <= 340);
});

/* --------------------------------------------- (5) AttendancePlanner goal */

const plannerProps = (sessions) => ({
  state: { demoDate: '2026-10-03' },
  actions: { saveTask: () => ({ ok: true }) },
  enrollment: { id: 'e-test' },
  course: { code: 'CS101' },
  summary: summarizeAttendance(sessions, 80),
  sessions,
});

test('a pending-only module offers no recovery goal and no 0-consecutive task', () => {
  const sessions = [{ presence: 'pending', durationHours: 1, date: '2026-09-01' }];
  const props = plannerProps(sessions);
  assert.equal(props.summary.held, 0);
  assert.equal(props.summary.recoveryPossible, true, 'the raw summary still reports this as possible');

  const { text, elements } = inspect(AttendancePlanner, props);
  assert.doesNotMatch(text, /Attend 0 consecutive/);
  assert.match(text, /No recorded sessions exist for this module, so no recovery goal can be computed\./);

  const button = elements.find((node) => node.props && node.props.label === 'Add recovery goal');
  assert.ok(button, 'the recovery button is rendered');
  assert.equal(button.props.disabled, true, 'the recovery button must be disabled with no recorded base');
});

test('a module with recorded sessions still offers its concrete recovery goal', () => {
  const sessions = [
    ...Array.from({ length: 7 }, () => ({ presence: 'present', durationHours: 1, date: '2026-09-01' })),
    ...Array.from({ length: 3 }, () => ({ presence: 'absent', durationHours: 1, date: '2026-09-02' })),
  ];
  const props = plannerProps(sessions);
  assert.equal(props.summary.held, 10);
  assert.equal(props.summary.recoverySessions, 5);

  const { text, elements } = inspect(AttendancePlanner, props);
  assert.doesNotMatch(text, /so no recovery goal can be computed/);

  const button = elements.find((node) => node.props && node.props.label === 'Add recovery goal');
  assert.ok(button, 'the recovery button is rendered');
  assert.equal(button.props.disabled, false, 'the recovery button is enabled when a goal is computable');
});
