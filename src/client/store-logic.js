/**
 * Pure settings-write logic for the YOLO mode client (no React, no wire).
 * Everything here is a function of its inputs so the revision state machine,
 * path-op construction, and conflict handling are unit-testable in a plain
 * node environment.
 *
 * The persisted settings section mirrors the Host schema (lib/settings.js):
 *   {
 *     preset?, modes?, levels?, judge?: { provider?, model?, systemPrompt?,
 *     timeoutMs?, maxTokens?, concurrency? }, includeSubagents?, auditFile?
 *   }
 */

/**
 * Normalize an optional string: blank/whitespace becomes undefined (so an
 * empty field clears the user override back to the composition base).
 */
export function optional(value) {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

/** Blank/whitespace-only check used to decide "clear to undefined". */
export function isBlank(value) {
  return value === undefined || value === null || value.trim().length === 0;
}

/**
 * Build the path ops that (re)set one scalar configuration field. `set` writes
 * the value at the path, creating intermediate objects; `unset` removes the
 * user override so the field falls back to the composition base.
 */
export function setFieldOps(path, value) {
  return [{ op: 'set', path: [...path], value }];
}

export function unsetFieldOps(path) {
  return [{ op: 'unset', path: [...path] }];
}

/**
 * Ops to save the whole preset selection. Always writes the preset so a "save"
 * on an unmodified form is idempotent with the host.
 */
export function presetOps(preset) {
  return setFieldOps(['preset'], preset);
}

/** Ops to save the modes list (workspace-write / danger-full-access …). */
export function modesOps(modes) {
  return setFieldOps(['modes'], modes);
}

/**
 * Ops to save the whole levels table. levels.tools can override any preset per
 * tool; levels[targetMode] only takes effect when preset === 'custom'. The
 * parsed object replaces the section wholesale at ['levels'].
 */
export function levelsOps(levels) {
  return setFieldOps(['levels'], levels);
}

/**
 * Ops to save one judge field. An empty string (or undefined resolved value)
 * becomes an unset so the judge override is cleared back to defaults.
 */
export function judgeFieldOps(stored, path, value) {
  const normalized = optional(value);
  if (normalized === stored) return [];
  if (normalized === undefined) return unsetFieldOps(path);
  return setFieldOps(path, normalized);
}

/**
 * The revision state machine. A successful mutate returns the next revision;
 * a conflict keeps the stale revision and marks `conflicted` so the store
 * reloads before the user retries.
 */
export function advanceRevision(state, serverRevision) {
  return { revision: serverRevision, conflicted: false };
}

/** Mark a conflict: keep the stale revision (the editor must reload). */
export function markConflict(state) {
  return { revision: state.revision, conflicted: true };
}

/** Rebase after a reload picked up the fresh namespace view. */
export function adoptRevision(_state, freshRevision) {
  return { revision: freshRevision, conflicted: false };
}

/**
 * Classification of a settings.mutate failure for the UI's conflict handling.
 * `settings-conflict` → 'conflict' (reload and review); `settings-rejected` or
 * `schema-validation` → 'rejected' (show the message); everything else fatal.
 */
export function classifyMutateError(code, _message) {
  if (code === 'settings-conflict') return 'conflict';
  if (code === 'settings-rejected' || code === 'schema-validation') return 'rejected';
  return 'fatal';
}
