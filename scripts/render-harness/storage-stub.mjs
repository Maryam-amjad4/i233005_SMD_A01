/**
 * In-memory stand-in for @react-native-async-storage/async-storage.
 *
 * The harness swaps the native module for this so the persistence hook can be
 * driven in Node. The backing map is exported so a test can pre-seed saved data,
 * inspect what was written, or simulate a failing device.
 *
 * It also exposes a controllable test handle (`__storage`) because the old stub
 * resolved every call immediately and never failed, which made two classes of
 * bug invisible:
 *   - a write held open by the device, so the UI must show "saving" rather than
 *     a premature "saved";
 *   - a device that refuses to write or read, so the error path is reachable.
 */
const store = new Map();

/** Deterministic test controls. Reset by `__storage.reset()`. */
const control = {
  /** Number of upcoming writes to hold open (resolved by `release`). */
  writeGates: 0,
  /** Resolvers for the currently held writes. */
  held: [],
  /** Queued write-failure messages, consumed one per write. */
  writeFailures: [],
  /** Queued read-failure messages, consumed one per read. */
  readFailures: [],
};

/** Wait on a gate if the next write is being held; returns null otherwise. */
function writeGate() {
  if (control.writeGates <= 0) return null;
  control.writeGates -= 1;
  return new Promise((resolve) => control.held.push(resolve));
}

/** Consume one queued failure for `kind`, throwing it if present. */
function takeFailure(kind) {
  const queue = kind === 'write' ? control.writeFailures : control.readFailures;
  const message = queue.shift();
  if (message) throw new Error(message);
}

const AsyncStorage = {
  async getItem(key) {
    takeFailure('read');
    return store.has(key) ? store.get(key) : null;
  },
  async setItem(key, value) {
    const gate = writeGate();
    if (gate) await gate;
    takeFailure('write');
    store.set(key, String(value));
  },
  async removeItem(key) {
    const gate = writeGate();
    if (gate) await gate;
    takeFailure('write');
    store.delete(key);
  },
  async clear() {
    store.clear();
  },
};

export default AsyncStorage;

/** The raw backing map: `get`, `has`, `set`, `delete`, `clear`, iteration. */
export { store as __store };

/**
 * Controllable handle for tests.
 *
 *   const held = __storage.holdWrites();   // next write stays pending
 *   ... action triggers a save ...
 *   assert(saveStatus === 'saving');
 *   held.release();
 *
 *   __storage.failWrites(1);               // next write rejects
 *   __storage.failReads(1);                // next read rejects
 */
export const __storage = {
  /** The backing map, for pre-seeding and inspection. */
  get store() {
    return store;
  },

  /** Clear data and every held gate / queued failure. */
  reset() {
    store.clear();
    control.held.splice(0).forEach((release) => release());
    control.writeGates = 0;
    control.writeFailures.length = 0;
    control.readFailures.length = 0;
  },

  /**
   * Hold the next `count` writes open. Returns `{ release, pending }`; each held
   * write stays pending until `release()` runs. Tests can assert the in-flight
   * state, then release and assert it settled.
   */
  holdWrites(count = 1) {
    control.writeGates += count;
    return {
      get pending() {
        return control.held.length;
      },
      release() {
        control.held.splice(0).forEach((resolve) => resolve());
      },
    };
  },

  /** Make the next `count` writes reject with `message`. */
  failWrites(count = 1, message = 'The device refused to write the saved data.') {
    for (let index = 0; index < count; index += 1) control.writeFailures.push(message);
  },

  /** Make the next `count` reads reject with `message`. */
  failReads(count = 1, message = 'The saved data could not be read.') {
    for (let index = 0; index < count; index += 1) control.readFailures.push(message);
  },
};
