/**
 * YOLO mode configuration form. Rendered on this plugin's own page in the DSH
 * plugin manager (插件列表 → dsh-yolo-mode), via the `plugins.bundle.config`
 * slot keyed by the package name (see ../index.js) — between the package
 * description and the component rows. The `settings.section` page was retired,
 * so this form is the single configuration surface for the plugin. It renders
 * the resolved configuration (view.value) and saves via path ops through
 * store.mutate with an optimistic-revision lock.
 *
 * Presentation: React.createElement + class names from the shared token
 * stylesheet (./styles.js). No hard-coded colours, one font/space scale and the
 * same card structure as the official settings pages.
 *
 * Draft-sync pattern mirrors the reference DefaultModelRow
 * (dsh-subagents-options): the draft initializes once from the view and is
 * re-seeded only by a useEffect on the exact leaf values we edit, skipped while
 * a save is in flight. No render-time patching, so a mid-edit is never
 * clobbered and a save always reflects the server truth afterwards.
 */
import { useEffect, useState, createElement as h } from 'react';
import {
  presetOps,
  modesOps,
  levelsOps,
  judgeFieldOps,
  setFieldOps,
  unsetFieldOps,
} from '../store-logic.js';
import { presetInfo } from '../presets.js';

const PRESETS = ['off', 'strict', 'balanced', 'permissive', 'yolo', 'custom'];
const MODE_OPTIONS = [
  { id: 'workspace-write', key: 'workspaceWrite' },
  { id: 'danger-full-access', key: 'dangerFullAccess' },
];

/** Form draft: strings for text/number fields, array for modes, string for levels. */
function draftFromView(view, t) {
  const value = view && view.value != null ? view.value : {};
  const judge = value.judge && typeof value.judge === 'object' ? value.judge : {};
  return {
    preset: typeof value.preset === 'string' ? value.preset : 'balanced',
    modes: Array.isArray(value.modes) ? value.modes.slice() : [],
    judgeProvider: typeof judge.provider === 'string' ? judge.provider : '',
    judgeModel: typeof judge.model === 'string' ? judge.model : '',
    judgeSystemPrompt: typeof judge.systemPrompt === 'string' ? judge.systemPrompt : '',
    judgeTimeoutMs: typeof judge.timeoutMs === 'number' ? String(judge.timeoutMs) : '',
    judgeMaxTokens: typeof judge.maxTokens === 'number' ? String(judge.maxTokens) : '',
    judgeConcurrency: typeof judge.concurrency === 'number' ? String(judge.concurrency) : '',
    levels: serializeLevels(value.levels, t),
  };
}

/** Pretty-print the levels object, or '' when absent. */
function serializeLevels(levels, t) {
  if (levels === undefined || levels === null) return '';
  try {
    return JSON.stringify(levels, null, 2);
  } catch {
    return '';
  }
}

/**
 * The YOLO configuration form.
 *
 * Hosted by this plugin's own page in the plugin manager: registered into
 * `plugins.bundle.config` under the package name (see ../index.js). The page
 * dispatches `view`; a bundle page only ever asks for `page`, and a bundle may
 * hold several configuration entries, so the page passes NO host `form` — this
 * component owns its draft, validation and save path (the /yolo-mode bridge).
 *
 * @param {object} props - slot props `{ view? }` merged with the inject face
 *   `{ store, useSnapshot, t }`; an optional `close()` adds a dismiss control.
 */
export function ConfigForm(props) {
  const { view, store, useSnapshot, t, close } = props;
  if (store === undefined || useSnapshot === undefined || t === undefined) return null;
  // `summary` is reserved for official cards and row fallbacks; a bundle page
  // never asks for it, so there is nothing meaningful to render one-liner-wise.
  if (view === 'summary') return null;
  return ReactSection({ store, useSnapshot, t, close });
}

/** Section header shared by the ready, loading and error states. */
function sectionHead(t, description) {
  return h('div', { className: 'ym-head' },
    h('h3', { className: 'ym-title' }, t('configTitle')),
    h('p', { className: 'ym-desc' }, description),
  );
}

function ReactSection({ store, useSnapshot, t, close }) {
  const state = useSnapshot((s) => s);
  // Preset defaults served in statusView (id → { systemPrompt, levels }) used to
  // pre-fill the system prompt / levels fields when the user picks a preset;
  // statusInfo may omit them → {} fallback.
  const statusInfo = state.statusInfo && typeof state.statusInfo === 'object' ? state.statusInfo : {};
  const presetDefaults = statusInfo.presetDefaults && typeof statusInfo.presetDefaults === 'object' ? statusInfo.presetDefaults : {};
  // Kick the first load once when the settings page mounts: the store starts
  // idle, so without this the page would stay stuck on the intro text until a
  // pushed invalidation arrives. load() is idempotent/generation-guarded.
  useEffect(() => {
    void store.load();
  }, [store]);
  const view = state.view;
  const writable = state.writable;

  const [draft, setDraft] = useState(() => draftFromView(view, t));
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(undefined);
  const [done, setDone] = useState(false);

  // Provider/model options from the live LLM directory (empty when the llm
  // face is absent or the fetch failed — the model field then falls back to a
  // free-text input).
  const providerOptions = (Array.isArray(state.providers) ? state.providers : [])
    .filter((p) => p && typeof p.provider === 'string' && p.provider !== '')
    .map((p) => ({
      id: p.provider,
      label: p.displayName && typeof p.displayName === 'string' && p.displayName !== '' ? p.displayName : undefined,
    }));
  const providerGroup = (Array.isArray(state.models) ? state.models : [])
    .find((g) => g && g.id === draft.judgeProvider);
  const modelOptions = providerGroup && Array.isArray(providerGroup.models)
    ? providerGroup.models
        .filter((m) => m && typeof m.id === 'string' && m.id !== '')
        .map((m) => ({
          id: m.id,
          label: m.name && typeof m.name === 'string' && m.name !== '' ? m.name : undefined,
        }))
    : [];

  /** Pick a provider; clear the model when it no longer belongs to it. */
  const setProvider = (value) => {
    const next = Object.assign({}, draft, { judgeProvider: value });
    const model = draft.judgeModel;
    if (model !== '' && !modelBelongsTo(value, model, state.models)) {
      next.judgeModel = '';
    }
    setDraft(next);
    setDone(false);
    setFailure(undefined);
  };

  // Reflect a fresh server snapshot into the draft (a reload or pushed
  // invalidation). Re-seed only from the leaf values we edit, and skip while a
  // save is in flight so a mid-edit is never clobbered.
  useEffect(() => {
    if (busy) return;
    setDraft(draftFromView(view, t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    view?.value?.preset,
    view?.value?.modes,
    view?.value?.levels,
    view?.value?.judge?.provider,
    view?.value?.judge?.model,
    view?.value?.judge?.systemPrompt,
    view?.value?.judge?.timeoutMs,
    view?.value?.judge?.maxTokens,
    view?.value?.judge?.concurrency,
  ]);

  const levelsParse = parseLevels(draft.levels);
  const levelsInvalid = !levelsParse.ok && trimToNull(draft.levels) != null;

  /** Map a store.mutate failure outcome to a user-facing message. */
  const kindMessage = (out) => {
    if (out.kind === 'conflict') return t('conflict');
    if (out.kind === 'rejected') return t('rejected');
    return t('fatal');
  };

  const save = async () => {
    setBusy(true);
    setFailure(undefined);
    setDone(false);
    try {
      const ops = buildOps(view, draft, t);
      const out = await store.mutate(ops);
      if (!out.ok) setFailure(kindMessage(out));
      else setDone(true);
    } finally {
      setBusy(false);
    }
  };

  const toggleMode = (id) => {
    const next = draft.modes.includes(id)
      ? draft.modes.filter((m) => m !== id)
      : draft.modes.concat([id]);
    setDraft(Object.assign({}, draft, { modes: next }));
    setDone(false);
    setFailure(undefined);
  };

  const setField = (name, value) => {
    setDraft(Object.assign({}, draft, { [name]: value }));
    setDone(false);
    setFailure(undefined);
  };

  /**
   * Preset change: switch the preset and pre-fill the judge system prompt and
   * the levels from the preset's defaults served in statusInfo (custom → clear
   * both so the user writes their own). Implemented as one combined draft
   * update: several setField calls computed from the same stale closure would
   * clobber each other under React's batched state updates.
   */
  const changePreset = (value) => {
    const next = Object.assign({}, draft, { preset: value });
    if (value === 'custom') {
      next.judgeSystemPrompt = '';
      next.levels = '';
    } else {
      const pd = presetDefaults[value];
      if (pd && typeof pd === 'object') {
        next.judgeSystemPrompt = typeof pd.systemPrompt === 'string' ? pd.systemPrompt : '';
        next.levels = pd.levels === undefined || pd.levels === null ? '' : JSON.stringify(pd.levels, null, 2);
      }
    }
    setDraft(next);
    setDone(false);
    setFailure(undefined);
  };

  if (state.status === 'error') {
    return h('div', { className: 'ym-root' },
      sectionHead(t, t('sectionIntro')),
      h('div', { className: 'ym-error', role: 'alert' },
        h('p', { className: 'ym-error-text' },
          t('loadError') + (typeof state.error === 'string' ? ': ' + state.error : '')),
        h('button', {
          type: 'button',
          className: 'ym-btn',
          onClick: () => void store.load(),
        }, t('refresh')),
      ),
    );
  }
  if (state.status !== 'ready') {
    return h('div', { className: 'ym-root' },
      sectionHead(t, t('sectionIntro')),
      h('div', { className: 'ym-loading', role: 'status', 'aria-live': 'polite' },
        h('span', { className: 'ym-loading-text' }, t('loading')),
        h('div', { className: 'ym-skeleton is-wide' }),
        h('div', { className: 'ym-skeleton is-full' }),
      ),
    );
  }

  const preset = presetInfo(draft.preset);
  const statusText = done ? t('saved') : failure !== undefined ? failure : null;

  return h('div', { className: 'ym-root' },
    sectionHead(t, t('sectionIntro')),

    // ── preset ────────────────────────────────────────────────────────────
    h('section', { className: 'ym-card' },
      h('div', { className: 'ym-card-head' },
        h('h4', { className: 'ym-card-title' }, t('preset')),
        h('p', { className: 'ym-card-hint' }, t('presetHint')),
      ),
      h('div', { className: 'ym-field' },
        h('label', { className: 'ym-sr-only' }, t('preset')),
        h('select', {
          className: 'ym-select',
          value: draft.preset,
          onChange: (e) => changePreset(e.target.value),
        },
          PRESETS.map((p) => h('option', { key: p, value: p }, p))),
      ),
      preset !== null ? presetInfoBlock(t, preset) : null,
    ),

    // ── sandbox modes ─────────────────────────────────────────────────────
    h('section', { className: 'ym-card' },
      h('div', { className: 'ym-card-head' },
        h('h4', { className: 'ym-card-title' }, t('modes')),
        h('p', { className: 'ym-card-hint' }, t('modesHint')),
      ),
      h('div', { className: 'ym-check-row' },
        h('label', { className: 'ym-sr-only' }, t('modes')),
        MODE_OPTIONS.map((m) => h('label', { key: m.id, className: 'ym-check' },
          h('input', {
            type: 'checkbox',
            checked: draft.modes.includes(m.id),
            onChange: () => toggleMode(m.id),
          }),
          t(m.key))),
      ),
    ),

    // ── judge ─────────────────────────────────────────────────────────────
    h('section', { className: 'ym-card' },
      h('div', { className: 'ym-card-head' },
        h('h4', { className: 'ym-card-title' }, t('judge')),
      ),
      h('div', { className: 'ym-grid' },
        fieldSelect(t, draft, setProvider, 'judgeProvider', 'provider', providerOptions, t('providerEmpty')),
        judgeModelField(t, draft, setField, modelOptions, t('modelEmpty')),
        fieldInput(t, draft, setField, 'judgeTimeoutMs', 'timeoutMs'),
        fieldInput(t, draft, setField, 'judgeMaxTokens', 'maxTokens'),
        fieldInput(t, draft, setField, 'judgeConcurrency', 'concurrency'),
      ),
      h('div', { className: 'ym-field' },
        h('label', { className: 'ym-label' }, t('systemPrompt')),
        h('textarea', {
          className: 'ym-textarea',
          value: draft.judgeSystemPrompt,
          onChange: (e) => setField('judgeSystemPrompt', e.target.value),
        })),
      h('div', { className: 'ym-field' },
        h('label', { className: 'ym-label' }, t('levels') + ' · ' + t('levelsHint')),
        h('textarea', {
          className: 'ym-textarea ym-code',
          spellCheck: false,
          value: draft.levels,
          onChange: (e) => setField('levels', e.target.value),
        }),
        levelsInvalid
          ? h('p', { className: 'ym-hint ym-status-err' }, t('invalidLevelsJson'))
          : null),
    ),

    // ── bottom actions ────────────────────────────────────────────────────
    h('div', { className: 'ym-actions' },
      statusText !== null
        ? h('span', {
            className: 'ym-status ' + (done ? 'ym-status-ok' : 'ym-status-err'),
            role: 'status',
          }, statusText)
        : null,
      h('button', {
        type: 'button',
        className: 'ym-btn ym-btn-primary',
        disabled: !writable || busy || levelsInvalid,
        onClick: () => void save(),
      }, t('save')),
      close !== undefined
        ? h('button', { type: 'button', className: 'ym-btn', onClick: () => close() }, t('close'))
        : null,
    ),
  );
}

function fieldInput(t, draft, setField, name, labelKey) {
  return h('div', { className: 'ym-field' },
    h('label', { className: 'ym-label' }, t(labelKey)),
    h('input', {
      className: 'ym-input',
      value: draft[name],
      onChange: (e) => setField(name, e.target.value),
    }));
}

/**
 * A labeled <select> whose first option is always the "unconfigured" empty
 * value, followed by the catalog options ({ id, label? }). The empty option
 * doubles as the "clear back to composition base" choice.
 */
function fieldSelect(t, draft, onChange, name, labelKey, options, emptyLabel) {
  return h('div', { className: 'ym-field' },
    h('label', { className: 'ym-label' }, t(labelKey)),
    h('select', {
      className: 'ym-select',
      value: draft[name],
      onChange: (e) => onChange(e.target.value),
    },
      h('option', { key: 'empty', value: '' }, emptyLabel),
      options.map((o) => h('option', { key: o.id, value: o.id }, o.label != null && o.label !== '' ? o.label : o.id))));
}

/**
 * Judge model field: a catalog-driven <select> when the selected provider's
 * group lists models (and the draft value is one of them, or empty); a plain
 * text input when there is no directory (llm face absent / fetch failed /
 * unknown provider) or the stored value is unknown.
 */
function judgeModelField(t, draft, setField, modelOptions, emptyLabel) {
  if (modelOptions.length === 0) {
    return fieldInput(t, draft, setField, 'judgeModel', 'model');
  }
  const known = draft.judgeModel === '' || modelOptions.some((o) => o.id === draft.judgeModel);
  if (!known) {
    return fieldInput(t, draft, setField, 'judgeModel', 'model');
  }
  return fieldSelect(t, draft, (v) => setField('judgeModel', v), 'judgeModel', 'model', modelOptions, emptyLabel);
}

/** Read-only per-preset hint block: level table + error/unsure fallbacks + prompt summary. */
function presetInfoBlock(t, preset) {
  return h('div', { className: 'ym-preset' },
    h('div', { className: 'ym-preset-block' },
      h('label', { className: 'ym-preset-label' }, t('presetLevels')),
      h('div', { className: 'ym-preset-rows' },
        presetRow(t, t('workspaceWrite'), preset.levels.workspaceWrite),
        presetRow(t, t('dangerFullAccess'), preset.levels.dangerFullAccess),
        presetRow(t, t('presetErrorFallback'), preset.fallbackError),
        presetRow(t, t('presetUnsureFallback'), preset.fallbackUnsure))),
    h('div', { className: 'ym-preset-block' },
      h('label', { className: 'ym-preset-label' }, t('presetPrompt')),
      h('p', { className: 'ym-preset-prompt' }, preset.prompt)));
}

/** One row of the preset level table; the 'custom' marker reads the user's levels table. */
function presetRow(t, label, value) {
  return h('div', { className: 'ym-preset-row' },
    h('span', null, label),
    h('span', { className: 'ym-preset-value' }, value === 'custom' ? t('presetCustom') : value));
}

/**
 * True when modelId belongs to the provider's catalog group. When the provider
 * has no catalog group (unknown provider / directory missing) membership
 * cannot be judged — keep the value rather than clobbering a typed model.
 */
function modelBelongsTo(providerId, modelId, groups) {
  if (!providerId || !modelId) return true;
  const group = (Array.isArray(groups) ? groups : []).find((g) => g && g.id === providerId);
  if (!group || !Array.isArray(group.models)) return true;
  return group.models.some((m) => m && m.id === modelId);
}

/** Parse the levels textarea, tolerating a blank/whitespace value (treated as none). */
function parseLevels(text) {
  const trimmed = text == null ? '' : text.trim();
  if (trimmed.length === 0) return { ok: true, value: {} };
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch {
    return { ok: false };
  }
}

function trimToNull(text) {
  if (text == null) return null;
  const trimmed = text.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Build path ops for the whole form. Numerical judge fields are parsed to
 * numbers (blank → unset); text judge fields judgeField-shaped; modes/levels
 * set whole.
 */
function buildOps(view, draft, t) {
  const value = view && view.value != null ? view.value : {};
  const judge = value.judge && typeof value.judge === 'object' ? value.judge : {};
  const ops = [];

  ops.push.apply(ops, presetOps(draft.preset));
  ops.push.apply(ops, modesOps(draft.modes));

  ops.push.apply(ops, judgeFieldOps(judge.provider, ['judge', 'provider'], draft.judgeProvider));
  ops.push.apply(ops, judgeFieldOps(judge.model, ['judge', 'model'], draft.judgeModel));
  ops.push.apply(ops, judgeFieldOps(judge.systemPrompt, ['judge', 'systemPrompt'], draft.judgeSystemPrompt));

  const num = (raw, stored) => {
    const trimmed = trimToNull(raw);
    if (trimmed == null) return stored === undefined ? undefined : null; // clear
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  };
  const replaceField = (stored, path, valueOrNull) => {
    if (valueOrNull === null) {
      if (stored === undefined) return;
      ops.push.apply(ops, unsetFieldOps(path));
    } else if (valueOrNull !== undefined && valueOrNull !== stored) {
      ops.push.apply(ops, setFieldOps(path, valueOrNull));
    }
  };

  replaceField(judge.timeoutMs, ['judge', 'timeoutMs'], num(draft.judgeTimeoutMs, judge.timeoutMs));
  replaceField(judge.maxTokens, ['judge', 'maxTokens'], num(draft.judgeMaxTokens, judge.maxTokens));
  replaceField(judge.concurrency, ['judge', 'concurrency'], num(draft.judgeConcurrency, judge.concurrency));

  const levels = parseLevels(draft.levels).value;
  ops.push.apply(ops, levelsOps(levels));

  return ops;
}
