/**
 * Plain view/history state helpers (plan section 2).
 *
 * There is no navigation library in this project. A single reducer owns
 * `{ view, history }`, which keeps Back behaviour, semester resets and
 * hardware-Back handling consistent, and avoids the stale-closure bug that a
 * pair of independent `useState` calls would introduce.
 */

export const HOME_VIEW = 'home';

export function createView(name = HOME_VIEW, params = {}) {
  return { name, params: params || {} };
}

export const initialNavigation = { view: createView(HOME_VIEW), history: [] };

/**
 * Actions:
 *   { type: 'open', name, params, replace? }  push onto history unless replace
 *   { type: 'back' }                          pop the last history entry
 *   { type: 'home' }                          clear history and go Home
 *   { type: 'reset', view? }                  clear history and force a view
 */
export function navigationReducer(state, action) {
  switch (action.type) {
    case 'open': {
      const next = createView(action.name, action.params);
      if (action.replace) return { view: next, history: state.history };
      return { view: next, history: [...state.history, state.view] };
    }
    case 'back': {
      if (!state.history.length) return state;
      const previous = state.history[state.history.length - 1];
      return { view: previous, history: state.history.slice(0, -1) };
    }
    case 'home':
      return initialNavigation;
    case 'reset':
      return { view: action.view ? createView(action.view.name, action.view.params) : createView(HOME_VIEW), history: [] };
    default:
      return state;
  }
}

export function canGoBack(state) {
  return state.history.length > 0;
}

/**
 * Keep a view valid after the selected semester changes.
 * A course that is not offered in the selected semester produces an explanatory
 * state instead of a broken screen, so the view is preserved but flagged.
 */
export function checkViewValidity(view, state) {
  if (view.name !== 'course' || !view.params) return { valid: true, reason: null };
  const enrollment = (state.enrollments || []).find((e) => e.id === view.params.enrollmentId);
  if (!enrollment) {
    return {
      valid: false,
      reason: 'That course is no longer in the dataset. Pick it again from Courses.',
    };
  }
  const selected = (state.semesters || []).find((s) => s.id === state.preferences?.selectedSemesterId);
  if (selected && enrollment.semesterId !== selected.id) {
    // Show the course code the student reads everywhere else, not the internal id.
    const course = (state.courses || []).find((c) => c.id === enrollment.courseId);
    const label = course ? course.code : enrollment.courseId;
    return {
      valid: false,
      reason: `${label} belongs to another semester. Switch the semester selector or reopen the course.`,
    };
  }
  return { valid: true, reason: null };
}

export default { HOME_VIEW, createView, initialNavigation, navigationReducer, canGoBack, checkViewValidity };
