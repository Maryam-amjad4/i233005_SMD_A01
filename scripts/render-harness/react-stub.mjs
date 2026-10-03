/**
 * Minimal React replacement for the offline render harness.
 *
 * The hard part of testing components without a renderer is hook identity: a
 * `useState` must resolve to the same slot on every render of the same
 * component, and must NOT collide with a different component that happens to
 * run at the same point in a traversal. Slots here are therefore keyed by
 * `path#hookIndex`, where path is the component's position in the rendered
 * tree, rather than by a running counter.
 *
 * `__renderNested` evaluates a child component inside the tree its parent
 * returned, sharing that tree's slot map, so a test can type into a field in a
 * child and then read the whole screen back.
 *
 * This is a test double, not a React clone.
 */

const slots = new Map();

let cursor = 0;
let currentPath = 'root';
let effects = [];
let pendingCleanups = [];
let mounted = null;
let lastTree = null;
let dirty = false;
let renders = 0;
/**
 * An effect that threw during a scheduled (post-commit) pass cannot propagate
 * to whoever scheduled it, so it is parked here and re-thrown from the next
 * handle operation. It is never dropped: a screen whose effect throws must not
 * pass the suite.
 */
let deferredError = null;

/** Guard against an effect loop so a bug fails loudly instead of hanging. */
const MAX_PASSES = 200;

function depsChanged(previous, next) {
  if (previous === undefined || next === undefined) return true;
  if (previous === null || next === null) return true;
  if (previous.length !== next.length) return true;
  return next.some((value, index) => !Object.is(value, previous[index]));
}

/** The name a test can recognise in an effect failure. */
function componentName(component) {
  const target = component || (mounted && mounted.component);
  return (target && (target.displayName || target.name)) || 'AnonymousComponent';
}

/**
 * Wrap an effect exception in an error that names the component, so a silent
 * throw becomes a loud, attributable failure instead of a green suite.
 */
function effectFailure(error, component, phase) {
  const name = componentName(component);
  const detail = error && error.message ? error.message : String(error);
  const wrapped = new Error(`effect threw in ${name} (${phase}): ${detail}`);
  wrapped.cause = error;
  return wrapped;
}

export const createElement = (type, props, ...children) => ({
  type,
  props: { ...(props || {}), children: children.length <= 1 ? children[0] : children },
  children,
});

function schedule() {
  if (dirty || !mounted) return;
  dirty = true;
  const timer = setTimeout(() => {
    dirty = false;
    try {
      runPass();
    } catch (error) {
      // Surface the failure instead of dying silently inside a timer. It is
      // parked as well, so the next handle operation throws it too.
      deferredError = deferredError || error;
      process.stderr.write(`harness: ${error.message}\n`);
    }
  }, 0);
  if (typeof timer.unref === 'function') timer.unref();
}

function runPass() {
  if (renders >= MAX_PASSES) {
    throw new Error(`harness: render loop did not settle after ${MAX_PASSES} passes`);
  }
  cursor = 0;
  currentPath = 'root';
  renders += 1;
  const next = mounted.component(mounted.props);
  lastTree = next;
  // Effects registered during THIS render run once it completes, matching React.
  // An effect that throws fails the mount: swallowing it is exactly the lie that
  // let a broken screen pass the suite.
  const due = effects;
  effects = [];
  due.forEach((effect) => {
    let cleanup;
    try {
      cleanup = effect();
    } catch (error) {
      throw effectFailure(error, mounted.component, 'mount/commit');
    }
    if (typeof cleanup === 'function') pendingCleanups.push(cleanup);
  });
  if (dirty) schedule();
}

function slot(key) {
  if (!slots.has(key)) slots.set(key, { value: undefined, init: false });
  return slots.get(key);
}

export function useState(initial) {
  const key = `${currentPath}#${cursor++}`;
  const entry = slot(key);
  if (!entry.init) {
    entry.init = true;
    entry.value = typeof initial === 'function' ? initial() : initial;
  }
  const set = (next) => {
    const value = typeof next === 'function' ? next(entry.value) : next;
    if (!Object.is(value, entry.value)) {
      entry.value = value;
      schedule();
    }
  };
  return [entry.value, set];
}

export function useReducer(reducer, initial) {
  const [state, setState] = useState(initial);
  return [state, (action) => setState((previous) => reducer(previous, action))];
}

export function useMemo(factory, deps) {
  // Dependency arrays are honoured for the same reason useEffect honours them:
  // evaluating the factory on every render hides a stale-memo bug. Without deps
  // React recomputes every render, which is what `depsChanged(undefined, ...)`
  // returns true for.
  const key = `${currentPath}#m${cursor++}`;
  const entry = slot(key);
  if (!entry.init || depsChanged(entry.deps, deps)) {
    entry.init = true;
    entry.deps = deps;
    entry.value = factory();
  }
  return entry.value;
}

export function useCallback(fn, deps) {
  const key = `${currentPath}#c${cursor++}`;
  const entry = slot(key);
  if (!entry.init || depsChanged(entry.deps, deps)) {
    entry.init = true;
    entry.deps = deps;
    entry.value = fn;
  }
  return entry.value;
}

export function useRef(initial) {
  const key = `${currentPath}#r${cursor++}`;
  const entry = slot(key);
  if (!entry.init) {
    entry.init = true;
    entry.value = { current: initial };
  }
  return entry.value;
}

export function useEffect(effect, deps) {
  // Dependency arrays are honoured: without this every effect re-runs on every
  // render, which turns a mount-once effect into an infinite loop and makes the
  // harness lie about how often real code runs.
  const key = `${currentPath}#e${cursor++}`;
  const entry = slot(key);
  if (deps === undefined) {
    effects.push(effect);
    return;
  }
  if (!entry.init || depsChanged(entry.value, deps)) {
    entry.init = true;
    entry.value = deps;
    effects.push(effect);
  }
}

export function useLayoutEffect(effect, deps) {
  useEffect(effect, deps);
}

export function useContext() {
  cursor += 1;
  return null;
}

export function useId() {
  cursor += 1;
  return `id-${cursor}`;
}

export const Fragment = 'Fragment';

/** Reset traversal position so a second walk allocates the same slots. */
export function __beginTraversal() {
  cursor = 0;
  currentPath = 'root';
}

/**
 * Evaluate a child component at `path`, running its effects immediately and
 * restoring the caller's traversal position afterwards.
 */
export function __renderNested(component, props, path) {
  const savedCursor = cursor;
  const savedPath = currentPath;
  const savedEffects = effects;
  cursor = 0;
  currentPath = path;
  effects = [];
  let tree;
  try {
    tree = component(props);
  } finally {
    const due = effects;
    effects = savedEffects;
    cursor = savedCursor;
    currentPath = savedPath;
    due.forEach((effect) => {
      let cleanup;
      try {
        cleanup = effect();
      } catch (error) {
        throw effectFailure(error, component, `nested render at ${path}`);
      }
      if (typeof cleanup === 'function') pendingCleanups.push(cleanup);
    });
  }
  return tree;
}

/** Mount a screen from scratch: fresh slots, one render pass plus effects. */
export function __mount(component, props) {
  slots.clear();
  cursor = 0;
  currentPath = 'root';
  effects = [];
  pendingCleanups = [];
  renders = 0;
  dirty = false;
  deferredError = null;
  mounted = { component, props };
  runPass();
  const tree = lastTree;
  /** Re-throw an effect failure parked by a scheduled pass. */
  const rethrowDeferred = () => {
    if (deferredError) {
      const error = deferredError;
      deferredError = null;
      throw error;
    }
  };
  return {
    tree,
    renderCount: renders,
    rerender(nextProps) {
      rethrowDeferred();
      mounted = { component, props: nextProps };
      dirty = false;
      runPass();
      rethrowDeferred();
      return lastTree;
    },
    unmount() {
      rethrowDeferred();
      [...pendingCleanups].forEach((cleanup) => {
        cleanup();
      });
      pendingCleanups = [];
      mounted = null;
    },
  };
}

export default {
  createElement,
  Fragment,
  useState,
  useReducer,
  useMemo,
  useCallback,
  useRef,
  useEffect,
  useLayoutEffect,
  useContext,
  useId,
};