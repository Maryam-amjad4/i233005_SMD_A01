/**
 * Shared tree-walking helpers for the stub-based render tests.
 *
 * These exist so every test that mounts a screen through the render harness
 * reads the same thing: the strings a user would see and the controls they could
 * press, with nested components evaluated so a field inside a wrapper is
 * reachable.
 *
 * Import this AFTER registering scripts/render-harness/hooks.mjs.
 */
const { __renderNested } = await import('../scripts/render-harness/react-stub.mjs');

/** Readable strings a user would get, evaluating nested components. */
export function collectStrings(node, out = [], seen = new Set()) {
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
  ['label', 'title', 'subtitle', 'value', 'message', 'caption', 'accessibilityLabel'].forEach((key) => {
    if (typeof props[key] === 'string' || typeof props[key] === 'number') out.push(String(props[key]));
  });
  collectStrings(props.children, out, seen);
  return out;
}

/** Every element node (host or component), evaluating nested components. */
export function collectElements(node, out = [], seen = new Set()) {
  if (node == null || typeof node === 'boolean' || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    node.forEach((child) => collectElements(child, out, seen));
    return out;
  }
  if (seen.has(node)) return out;
  seen.add(node);
  out.push(node);
  if (typeof node.type === 'function') {
    collectElements(__renderNested(node.type, node.props || {}), out, seen);
    return out;
  }
  collectElements((node.props || {}).children, out, seen);
  return out;
}

/** Find the handler of the first control whose identifying props match. */
export function findControl(node, predicate, out = [], seen = new Set()) {
  if (node == null || typeof node === 'boolean') return out;
  if (Array.isArray(node)) {
    node.forEach((child) => findControl(child, predicate, out, seen));
    return out;
  }
  if (typeof node !== 'object' || seen.has(node)) return out;
  seen.add(node);
  if (typeof node.type === 'function' && predicate(node.props || {})) {
    out.push({ type: 'Component', props: node.props });
  }
  if (typeof node.type === 'function') {
    findControl(__renderNested(node.type, node.props || {}), predicate, out, seen);
    return out;
  }
  const props = node.props || {};
  if (predicate(props)) out.push({ type: node.type, props });
  findControl(props.children, predicate, out, seen);
  return out;
}
