import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeedState } from '../src/data/seed.js';
import {
  parseIsoDate,
  addDays,
  daysBetween,
  formatDate,
  windowStatus,
  isWindowOpen,
  validateText,
  validateCount,
  validateThresholdPercent,
  validateNumber,
  validateDateInput,
  validateTargetPoints,
  validateRawMarks,
} from '../src/domain/validation.js';

const state = () => createSeedState();

/* ------------------------------------------------------------------- dates */

test('ISO dates parse locally and impossible dates are rejected', () => {
  assert.equal(parseIsoDate('2026-02-31'), null);
  assert.equal(parseIsoDate('2026-13-01'), null);
  assert.equal(parseIsoDate('3 Oct 2026'), null);
  assert.equal(parseIsoDate(''), null);
  assert.equal(parseIsoDate('2026-10-03').getDate(), 3);
});

test('day arithmetic crosses month and year boundaries', () => {
  assert.equal(addDays('2026-10-03', 28), '2026-10-31');
  assert.equal(addDays('2026-10-03', 29), '2026-11-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(daysBetween('2026-10-03', '2026-10-20'), 17);
  assert.equal(daysBetween('2026-10-20', '2026-10-03'), -17);
  assert.equal(formatDate('2026-10-03'), '3 Oct 2026');
});

test('window status is inclusive of the end date', () => {
  const event = { startDate: '2026-10-01', endDate: '2026-10-20' };
  assert.equal(windowStatus(event, '2026-09-30'), 'upcoming');
  assert.equal(windowStatus(event, '2026-10-01'), 'open');
  assert.equal(windowStatus(event, '2026-10-20'), 'open');
  assert.equal(windowStatus(event, '2026-10-21'), 'closed');
  assert.equal(isWindowOpen(event, '2026-10-21'), false);
  assert.equal(windowStatus(null, '2026-10-01'), 'not configured');
});

/* ------------------------------------------------------------------ fields */

test('counts must be whole numbers', () => {
  assert.equal(validateCount('3', { label: 'Classes' }).value, 3);
  for (const bad of ['2.5', '-1', 'abc', '', '  ']) {
    const result = validateCount(bad, { label: 'Classes' });
    assert.equal(result.ok, false, `${bad} should be rejected`);
  }
  assert.equal(validateCount('', { label: 'Classes', allowBlank: true }).blank, true);
  assert.equal(validateCount('11', { label: 'Classes', max: 10 }).ok, false);
});

test('a threshold must be a whole percentage inside the open interval', () => {
  assert.equal(validateThresholdPercent('80').value, 80);
  for (const bad of ['0', '-5', '101', '80.5', '', 'eighty']) {
    assert.equal(validateThresholdPercent(bad).ok, false, `${bad} should be rejected`);
  }
});

test('numbers and dates validate with an explicit range', () => {
  assert.equal(validateNumber('70.5', { min: 0, max: 100 }).value, 70.5);
  assert.equal(validateNumber('-1', { min: 0 }).ok, false);
  assert.equal(validateNumber('1.5', { integer: true }).ok, false);
  assert.equal(validateDateInput('2026-10-03').ok, true);
  assert.equal(validateDateInput('03/10/2026').ok, false);
  assert.equal(validateDateInput('2026-09-01', { notBefore: '2026-10-01' }).ok, false);
  assert.equal(validateText('   ', { label: 'Remarks' }).ok, false);
  assert.equal(validateText('short', { label: 'Remarks', minLength: 20 }).ok, false);
});
