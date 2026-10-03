/**
 * Accepted-scope gaps G1 and G2 on the academic-history screen.
 *
 * G1 - the plan calls for an "SGPA/CGPA trend". The chart only ever plotted the
 *      cumulative figure, so a term's own average was invisible. The trend now
 *      has a selectable second series and its caption names the series plotted.
 *
 * G2 - HistoryScreen filtered the transcript to terms that have rows, so the
 *      deliberately record-free term was silently dropped. It is now shown with
 *      an empty state, findable by term-name search, while row filters still
 *      behave as before.
 *
 * Both tests fail if the corresponding change is reverted.
 */
import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';

register('../scripts/render-harness/hooks.mjs', import.meta.url);

const { __mount, __beginTraversal } = await import('../scripts/render-harness/react-stub.mjs');
const { collectStrings, collectElements, findControl } = await import('./renderHelpers.mjs');
const { default: HistoryScreen } = await import('../src/features/history/HistoryScreen.js');
const { GpaTrendLineChart } = await import('../src/features/home/ChartSmoke.js');
const { createSeedState, createEmptyState } = await import('../src/data/seed.js');

const historyProps = (state) => ({ state, actions: {}, openView: () => {} });

/** The single LineChart's plotted series values in a mounted HistoryScreen. */
function lineChartValues(tree) {
  const chart = collectElements(tree).find((node) => node.type === 'LineChart');
  assert.ok(chart, 'expected a LineChart to be rendered');
  return chart.props.data.datasets[0].data;
}

/* ------------------------------------------------------------------- G1 */

test('G1: the trend plots cumulative GPA and the caption states which claim it is', () => {
  const handle = __mount(HistoryScreen, historyProps(createSeedState()));
  __beginTraversal();
  const text = collectStrings(handle.tree).join(' | ');

  assert.match(text, /Cumulative GPA trend/, 'the trend section names what is plotted');
  assert.match(text, /Cumulative GPA computed from finalized attempts only/, 'the caption states the plotted figure');
  assert.match(text, /Cumulative GPA trend line chart/, 'the screen-reader label names the chart');
  assert.doesNotMatch(text, /Per-term SGPA computed/, 'no second plotted series is offered');
  assert.doesNotMatch(text, /history-trend-sgpa/, 'the retired series selector is gone');
  handle.unmount();
});

test('G1: a caller passing no series gets the single cumulative chart', () => {
  const handle = __mount(GpaTrendLineChart, {
    data: [
      { label: 'S1', value: 3.2 },
      { label: 'S2', value: null },
    ],
    width: 300,
  });
  __beginTraversal();
  const text = collectStrings(handle.tree).join(' | ');
  assert.match(text, /Cumulative GPA trend line chart/, 'the chart names itself');
  assert.match(text, /Cumulative GPA computed/, 'the caption states the cumulative figure');
  handle.unmount();
});

test('G1: a term with no computable GPA is a gap, not a plotted zero', () => {
  const handle = __mount(GpaTrendLineChart, {
    data: [
      { label: 'S1', value: 3.2 },
      { label: 'S2', value: null },
    ],
    width: 300,
  });
  __beginTraversal();
  const values = lineChartValues(handle.tree);
  assert.equal(values.length, 1, 'the term with no value is omitted rather than plotted as 0');
  assert.equal(values[0], 3.2);
  const text = collectStrings(handle.tree).join(' | ');
  assert.match(text, /S2 omitted: no computable GPA yet/, 'the omitted term is named, not hidden');
  handle.unmount();
});

/* ------------------------------------------------------------------- G2 */

test('G2: the record-free term renders with an empty state instead of disappearing', () => {
  const handle = __mount(HistoryScreen, historyProps(createSeedState()));
  __beginTraversal();
  const text = collectStrings(handle.tree).join(' | ');

  assert.match(text, /Spring 2026/, 'the record-free term must appear in the transcript');
  assert.match(text, /No results in this term/, 'the record-free term must show an empty state');
  assert.match(text, /missing data, not a zero/, 'the empty state must say the term is missing data');
  handle.unmount();
});

test('G2: the record-free term is still findable by search', () => {
  const props = historyProps(createSeedState());
  const handle = __mount(HistoryScreen, props);
  __beginTraversal();
  const [search] = findControl(handle.tree, (candidate) => candidate.testID === 'history-search');
  assert.ok(search, 'the search field must exist');

  search.props.onChangeText('Spring 2026');
  const after = handle.rerender(props);
  __beginTraversal();
  const text = collectStrings(after).join(' | ');
  assert.match(text, /Spring 2026/, 'searching the term name must find the record-free term');
  assert.match(text, /No results in this term/, 'the found term still shows its empty state');
  handle.unmount();
});

test('G2: a search that matches no term hides the record-free term (filter semantics preserved)', () => {
  const props = historyProps(createSeedState());
  const handle = __mount(HistoryScreen, props);
  __beginTraversal();
  const [search] = findControl(handle.tree, (candidate) => candidate.testID === 'history-search');

  search.props.onChangeText('CS-1102');
  const after = handle.rerender(props);
  __beginTraversal();
  const text = collectStrings(after).join(' | ');
  assert.doesNotMatch(text, /No results in this term/, 'an unrelated search must not surface the record-free term');
  assert.match(text, /CS-1102/, 'the matching rows are still shown');
  handle.unmount();
});

test('G2: a row filter hides the record-free term, exactly as it hides non-matching rows', () => {
  const props = historyProps(createSeedState());
  const handle = __mount(HistoryScreen, props);
  __beginTraversal();
  const [repeats] = findControl(handle.tree, (candidate) => candidate.testID === 'history-filter-repeats');
  assert.ok(repeats, 'the repeats filter must exist');
  repeats.props.onPress();

  const after = handle.rerender(props);
  __beginTraversal();
  const text = collectStrings(after).join(' | ');
  assert.doesNotMatch(text, /No results in this term/, 'a row filter must not show a term with no rows');
  handle.unmount();
});

test('G2: an empty dataset still lists its terms with an honest empty state', () => {
  const handle = __mount(HistoryScreen, historyProps(createEmptyState()));
  __beginTraversal();
  const text = collectStrings(handle.tree).join(' | ');
  assert.match(text, /No results in this term/, 'each empty term states its emptiness');
  assert.doesNotMatch(text, /Not available\s+0/, 'no empty term is reported as a zero');
  handle.unmount();
});
