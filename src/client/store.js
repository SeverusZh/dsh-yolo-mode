/**
 * YOLO mode client page store: one snapshot joining the plugin's settings
 * namespace (`settingsView`, resolved `view`) and its live status view
 * (`statusView`: preset, judgeConfigured, stats, recent). The Host stays the
 * single fact source: every write travels as path ops through the bridge's
 * settingsMutate endpoint with an expectedRevision optimistic lock, and pushed
 * invalidations (settings/document-updated, connection/reset) refresh the page.
 *
 * The store is a bare observable (implements subscribe/getSnapshot) so it can
 * be bound directly by `bindSnapshotSelector` (see ./bind.js); the popup
 * open/closed flag is also held here so the chip and the overlay share one
 * source of truth.
 */
import {
  advanceRevision,
  markConflict,
  adoptRevision,
  classifyMutateError,
} from './store-logic.js';

/** Channel + endpoints under the plugin's self-published bridge. */
export const YOLO_RPC_CHANNEL = '/yolo-mode';
export const YOLO_RPC_VIEW = 'settingsView';
export const YOLO_RPC_STATUS = 'statusView';
export const YOLO_RPC_MUTATE = 'settingsMutate';
export const YOLO_RPC_OPEN_LOG = 'openLogFile';

/** Initial snapshot returned by a freshly constructed store. */
export function initialYoloState() {
  return {
    status: 'idle',
    view: undefined,
    statusInfo: undefined,
    revision: 0,
    conflicted: false,
    writable: true,
    error: undefined,
    open: false,
    /** Configurable provider directory (llm.providers). */
    providers: [],
    /** Model catalog groups (llm.models). */
    models: [],
  };
}

/**
 * The settings/status page controller (one per client surface).
 *
 * @param {object} options
 * @param {{ call: (channel: string, endpoint: string, payload: any) => Promise<any> }} options.rpc
 *   rpc.call(channel, endpoint, payload) resolves to { ok: true, value } |
 *   { ok: false, error }.
 * @param {object|null} [options.llm] - optional `connection.api.llm` face
 *   ({ providers(), models() } returning { result: { ok, value } }); when null
 *   the directory stays empty and the judge fields fall back to free text.
 */
export class YoloStore {
  constructor({ rpc, llm }) {
    this.rpc = rpc;
    this.llm = llm == null ? null : llm;
    this._state = initialYoloState();
    this._listeners = new Set();
    this._generation = 0;
  }

  /** The current immutable snapshot (stable reference until the next change). */
  getSnapshot() {
    return this._state;
  }

  /** Subscribe to snapshot changes; returns an unsubscribe. */
  subscribe(listener) {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  /** Apply a partial patch to the snapshot and synchronously notify listeners. */
  set(partial) {
    this._state = Object.assign({}, this._state, partial);
    for (const listener of [...this._listeners]) listener();
  }

  /** Toggle the popup open/closed flag (shared by chip and overlay). */
  togglePopup() {
    this.set({ open: !this._state.open });
  }

  /**
   * Call one bridge endpoint over the connection's generic RPC channel.
   * Returns the RpcResult ({ ok: true, value } | { ok: false, error }).
   */
  async _call(endpoint, payload) {
    const result = await this.rpc.call(YOLO_RPC_CHANNEL, endpoint, payload);
    if (result === null || typeof result !== 'object' || !('ok' in result)) {
      return { ok: false, error: { code: 'internal', message: 'bridge returned a malformed result' } };
    }
    return result;
  }

  /** Error code of an RPC error branch, when present. */
  _errorCode(error) {
    if (error !== null && typeof error === 'object' && typeof error.code === 'string') {
      return error.code;
    }
    return undefined;
  }

  /**
   * Fetch the optional LLM directory (provider list + model catalog) when the
   * store was constructed with an llm face. Directory failures are NOT fatal:
   * they leave the snapshot's providers/models empty without flipping status
   * to 'error' — only the settings/status bridge calls can do that.
   */
  async _fetchLlmDirectory() {
    if (this.llm === null || this.llm === undefined) {
      return { providers: [], models: [] };
    }
    let providers = [];
    let models = [];
    try {
      const response = await this.llm.providers({});
      const value = response && response.result && response.result.ok ? response.result.value : undefined;
      if (value && Array.isArray(value.providers)) providers = value.providers;
    } catch {
      providers = [];
    }
    try {
      const response = await this.llm.models({});
      const value = response && response.result && response.result.ok ? response.result.value : undefined;
      if (value && Array.isArray(value.groups)) models = value.groups;
    } catch {
      models = [];
    }
    return { providers, models };
  }

  /**
   * Refresh the whole page snapshot: settings view + live status view + the
   * optional LLM provider/model directory. On a success whose view is present,
   * adopt its revision and go ready; a settings/status failure flips status to
   * 'error' recording the first error code (the directory never does).
   */
  async load() {
    const generation = ++this._generation;
    this.set({ status: 'loading', error: undefined });
    const [viewResult, statusResult, directory] = await Promise.all([
      this._call(YOLO_RPC_VIEW, {}),
      this._call(YOLO_RPC_STATUS, {}),
      this._fetchLlmDirectory(),
    ]);
    if (generation !== this._generation) return;

    if (!viewResult.ok || !statusResult.ok) {
      const code = this._errorCode(!viewResult.ok ? viewResult.error : statusResult.error);
      this.set({
        status: 'error',
        error: code === undefined ? true : code,
        conflicted: false,
        providers: directory.providers,
        models: directory.models,
      });
      return;
    }

    const view = viewResult.value.view;
    const next = {
      status: 'ready',
      view,
      statusInfo: statusResult.value,
      conflict: false,
      error: undefined,
      providers: directory.providers,
      models: directory.models,
    };
    // The host announces writability per view; keep the initial default when
    // the endpoint does not report it.
    if (viewResult.value.writable !== undefined) {
      next.writable = viewResult.value.writable;
    }
    if (view !== undefined && view !== null) {
      next.revision = typeof view.revision === 'number' ? view.revision : 0;
    }
    this.set(Object.assign({ conflicted: false }, next));
  }

  /**
   * Run one mutate and update the snapshot's revision. Returns the failure
   * kind ('conflict' | 'rejected' | 'fatal') plus a message, or undefined on
   * success.
   *
   *   - ok            → advanceRevision + reload
   *   - conflict      → markConflict + reload (fresh view, user reviews)
   *   - rejected/fatal→ record error, do NOT reload
   *
   * @param {import('./store-logic.js').SettingsPathOpViewLike[]} ops
   * @returns {Promise<{ ok: true } | { ok: false, kind: string, code?: string }>}
   */
  async mutate(ops) {
    const state = this._state;
    const result = await this._call(YOLO_RPC_MUTATE, {
      ns: 'yolo-mode',
      ops,
      expectedRevision: state.revision,
    });
    if (result.ok) {
      const value = result.value;
      const serverRevision = value && typeof value.revision === 'number' ? value.revision : state.revision;
      this._state = Object.assign({}, this._state, advanceRevision({ revision: state.revision, conflicted: state.conflicted }, serverRevision));
      for (const listener of [...this._listeners]) listener();
      await this.load();
      return { ok: true };
    }

    const code = this._errorCode(result.error);
    const kind = classifyMutateError(code, undefined);
    if (kind === 'conflict') {
      this._state = Object.assign({}, this._state, markConflict({ revision: state.revision, conflicted: state.conflicted }));
      for (const listener of [...this._listeners]) listener();
      await this.load();
    } else {
      this.set({ conflicted: false, error: code === undefined ? 'settings-rejected' : code });
    }
    return { ok: false, kind, code };
  }

  /**
   * Ask the host to open the audit JSONL log file with the OS default
   * application. The host resolves the effective path (view.value.auditFile or
   * the tmp default) and returns { ok: true, value: { path } } on success, or
   * { ok: false, error: { code: 'log-not-found' | 'open-failed', … } }.
   */
  async openLogFile() {
    return this._call(YOLO_RPC_OPEN_LOG, {});
  }

  /** Rebase the revision from a freshly loaded view without a full load. */
  adoptRevision(freshRevision) {
    this.set(adoptRevision({ revision: this._state.revision, conflicted: this._state.conflicted }, freshRevision));
  }
}
