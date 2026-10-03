/**
 * Shared field, date and file validation (plan sections 4 and 5).
 *
 * Everything here is pure: validators take strings/numbers/objects and return a
 * small result object, so the same rules run inside React Native forms and inside
 * Node tests with no React involved.
 */

/* ------------------------------------------------------------------- dates */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parse `YYYY-MM-DD` into a local-midnight Date, or null when invalid. */
export function parseIsoDate(value) {
  if (typeof value !== 'string') return null;
  const match = ISO_DATE.exec(value.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  // Reject impossible dates such as 2026-02-31, which JS would roll over.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

export function toIsoDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

export function addDays(isoDate, days) {
  const date = parseIsoDate(isoDate);
  if (!date || !Number.isInteger(days)) return null;
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

/** Whole days from `fromIso` to `toIso` (positive when `toIso` is later). */
export function daysBetween(fromIso, toIso) {
  const from = parseIsoDate(fromIso);
  const to = parseIsoDate(toIso);
  if (!from || !to) return null;
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Display format `3 Oct 2026`. Returns the raw string for unparsable input. */
export function formatDate(isoDate) {
  const date = parseIsoDate(isoDate);
  if (!date) return typeof isoDate === 'string' && isoDate ? isoDate : '—';
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** Short format for dense chart labels, e.g. `Oct 26`. */
export function formatMonthYear(isoDate) {
  const date = parseIsoDate(isoDate);
  if (!date) return '—';
  return `${MONTHS[date.getMonth()]} ${String(date.getFullYear()).slice(2)}`;
}

/* -------------------------------------------------------------- text fields */

export function validateText(value, { label = 'This field', required = true, minLength = 0, maxLength } = {}) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return required ? { ok: false, value: '', error: `${label} is required.` } : { ok: true, value: '' };
  if (text.length < minLength) {
    return { ok: false, value: text, error: `${label} needs at least ${minLength} characters.` };
  }
  if (maxLength && text.length > maxLength) {
    return { ok: false, value: text, error: `${label} must be ${maxLength} characters or fewer.` };
  }
  return { ok: true, value: text };
}

/* ------------------------------------------------------------ numeric input */

/**
 * Non-negative whole number. Rejects blanks, decimals, negatives, NaN and any
 * text that is not a plain integer, so session counts stay countable.
 */
export function validateCount(value, { label = 'Value', max, allowBlank = false } = {}) {
  const raw = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!raw) return allowBlank ? { ok: true, value: null, blank: true } : { ok: false, value: null, error: `${label} is required.` };
  if (!/^\d+$/.test(raw)) {
    return { ok: false, value: null, error: `${label} must be a whole number (0 or more).` };
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return { ok: false, value: null, error: `${label} must be a finite number.` };
  if (max != null && parsed > max) return { ok: false, value: null, error: `${label} must be ${max} or less.` };
  return { ok: true, value: parsed };
}

/**
 * A value counts as a measurement only when it is a real finite number.
 *
 * The looser `Number.isFinite(Number(x))` is NOT equivalent: `Number(null)`
 * and `Number('')` are both 0, so that form treats a missing measurement as a
 * measured zero. Charts use this guard so that "no data" is never drawn as 0.
 */
export function isRealNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Finite decimal inside an inclusive range. */
export function validateNumber(value, { label = 'Value', min, max, allowBlank = false, integer = false } = {}) {
  const raw = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  if (!raw) return allowBlank ? { ok: true, value: null, blank: true } : { ok: false, value: null, error: `${label} is required.` };
  if (integer && !/^-?\d+$/.test(raw)) {
    return { ok: false, value: null, error: `${label} must be a whole number.` };
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return { ok: false, value: null, error: `${label} must be a finite number.` };
  if (min != null && parsed < min) return { ok: false, value: null, error: `${label} must be ${min} or more.` };
  if (max != null && parsed > max) return { ok: false, value: null, error: `${label} must be ${max} or less.` };
  return { ok: true, value: parsed };
}

/**
 * Attendance threshold. The published rule is a minimum percentage, so the
 * valid open interval is (0, 100]; 0 would disable the rule entirely.
 */
export function validateThresholdPercent(value, { label = 'Attendance threshold' } = {}) {
  const parsed = validateNumber(value, { label, min: 0.01, max: 100, integer: true });
  if (!parsed.ok) return { ...parsed, error: `${label} must be a whole number greater than 0 and at most 100.` };
  return parsed;
}

export function validateTargetPoints(value, { label = 'Target score (out of 100)', allowBlank = true } = {}) {
  return validateNumber(value, { label, min: 0, max: 100, allowBlank });
}

export function validateRawMarks(value, maxMarks, { label = 'Marks' } = {}) {
  const parsed = validateNumber(value, { label, min: 0, max: maxMarks });
  if (!parsed.ok && parsed.error && !parsed.error.includes('required')) {
    return { ...parsed, error: `${label} must be between 0 and ${maxMarks}.` };
  }
  return parsed;
}

/* --------------------------------------------------------------- date input */

export function validateDateInput(value, { label = 'Date', required = true, notBefore, notAfter } = {}) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return { ok: !required, value: null, error: required ? `${label} is required.` : undefined };
  const date = parseIsoDate(raw);
  if (!date) return { ok: false, value: null, error: `${label} must be a real date in YYYY-MM-DD format.` };
  if (notBefore && daysBetween(notBefore, raw) < 0) {
    return { ok: false, value: raw, error: `${label} cannot be earlier than ${formatDate(notBefore)}.` };
  }
  if (notAfter && daysBetween(raw, notAfter) < 0) {
    return { ok: false, value: raw, error: `${label} cannot be later than ${formatDate(notAfter)}.` };
  }
  return { ok: true, value: raw };
}

/* -------------------------------------------------------------- attachments */





/* ------------------------------------------------------ service definitions */





/* -------------------------------------------------------- commit-time rules
 *
 * The UI validators above answer "is this form filled in?" as the student
 * types. These commit validators answer the harder question the store must ask
 * before it writes a record: is every selected course inside the request type's
 * declared scope, does every assessment actually belong to a selected course,
 * and is a paired laboratory included with its theory course? A draft can be
 * incomplete and still be saved locally, but it must never be committed as a
 * submitted request or a feedback record while one of these is false.
 */




/* ------------------------------------------------------------ event windows */

/**
 * Window status from the stored demo date. End dates are inclusive, and closed
 * windows stay visible with their historical status.
 */
export function windowStatus(event, demoDate) {
  if (!event) return 'not configured';
  const today = parseIsoDate(demoDate);
  if (!today) return 'unknown';
  const start = parseIsoDate(event.startDate);
  const end = parseIsoDate(event.endDate);
  if (!start || !end) return 'unknown';
  // Compare epoch values: a bare string comparison against Date objects coerces
  // them with toString() and silently returns the wrong answer.
  const time = today.getTime();
  if (time > end.getTime()) return 'closed';
  if (time < start.getTime()) return 'upcoming';
  return 'open';
}

export function isWindowOpen(event, demoDate) {
  return windowStatus(event, demoDate) === 'open';
}

export function windowStatusTone(status) {
  if (status === 'open') return 'ok';
  if (status === 'upcoming') return 'info';
  if (status === 'closed') return 'neutral';
  return 'warn';
}

export default {
  parseIsoDate,
  toIsoDate,
  addDays,
  daysBetween,
  formatDate,
  formatMonthYear,
  validateText,
  validateCount,
  validateNumber,
  validateThresholdPercent,
  validateTargetPoints,
  validateRawMarks,
  validateDateInput,
  windowStatus,
  isWindowOpen,
  windowStatusTone,
};
