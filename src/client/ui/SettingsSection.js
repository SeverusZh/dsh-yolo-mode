/**
 * YOLO mode settings section (slot `settings.section`). Renders the resolved
 * configuration (view.value) into a form and saves via path ops through
 * store.mutate with an optimistic-revision lock. Everything is React.createElement
 * + inline styles (no JSX, no CSS modules).
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

/** Styles (inline). */
const styles = {
  root: { display: 'flex', flexDirection: 'column', gap: 12 },
  intro: { margin: 0, color: '#6b7280', fontSize: 13, lineHeight: '18px' },
  card: {
    border: '1px solid #e5e7eb', borderRadius: 10, padding: 12,
    display: 'flex', flexDirection: 'column', gap: 10, backgroundColor: '#f8fafc',
  },
  row: { display: 'flex', flexDirection: 'column', gap: 4 },
  fieldLabel: { color: '#374151', fontSize: 12 },
  select: {
    backgroundColor: '#ffffff', color: '#111827', border: '1px solid #cbd5e1',
    borderRadius: 6, padding: '6px 8px', fontSize: 13,
  },
  input: {
    backgroundColor: '#ffffff', color: '#111827', border: '1px solid #cbd5e1',
    borderRadius: 6, padding: '6px 8px', fontSize: 13, width: '100%', boxSizing: 'border-box',
  },
  textarea: {
    backgroundColor: '#ffffff', color: '#111827', border: '1px solid #cbd5e1',
    borderRadius: 6, padding: '6px 8px', fontSize: 13, width: '100%',
    boxSizing: 'border-box', minHeight: 90, fontFamily: 'monospace',
  },
  modesRow: { display: 'flex', flexDirection: 'column', gap: 6 },
  modeLabel: { display: 'flex', alignItems: 'center', gap: 6, color: '#374151', fontSize: 13 },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 },
  primaryButton: {
    backgroundColor: '#2563eb', color: '#ffffff', border: 'none', borderRadius: 6,
    padding: '6px 14px', fontSize: 13, cursor: 'pointer',
  },
  primaryDisabled: { opacity: 0.5, cursor: 'not-allowed' },
  hint: { margin: 0, color: '#6b7280', fontSize: 11 },
  result: { fontSize: 12, lineHeight: '16px' },
  resultOk: { color: '#16a34a' },
  resultErr: { color: '#dc2626' },
  presetInfo: {
    border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 10px',
    backgroundColor: '#f1f5f9', display: 'flex', flexDirection: 'column', gap: 6,
  },
  presetTable: { display: 'flex', flexDirection: 'column', gap: 2 },
  presetRow: { display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, color: '#374151' },
  presetValue: { color: '#6b7280', fontFamily: 'monospace' },
  presetPromptText: { margin: 0, color: '#6b7280', fontSize: 12, lineHeight: '16px' },
};

/**
 * The YOLO settings section.
 *
 * @param {object} props - slot-delivered inject face: { store, useSnapshot, t }
 *   plus optional ownerProps.close.
 */
export function SettingsSection(props) {
  const { store, useSnapshot, t, close } = props;
  if (store === undefined || useSnapshot === undefined || t === undefined) return null;
  return ReactSection({ store, useSnapshot, t, close });
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
    return h('div', { style: styles.root },
      h('p', { style: styles.intro },
        t('loadError') + (typeof state.error === 'string' ? ': ' + state.error : '')),
      h('button', { style: Object.assign({}, styles.primaryButton, styles.primaryDisabled), onClick: () => void store.load() }, t('refresh')),
    );
  }
  if (state.status !== 'ready') {
    return h('div', { style: styles.root }, h('p', { style: styles.intro }, t('sectionIntro')));
  }

  const preset = presetInfo(draft.preset);

  return h('div', { style: styles.root },
    h('p', { style: styles.intro }, t('sectionIntro')),
    h('div', { style: styles.card },
      h('div', { style: styles.row },
        h('label', { style: styles.fieldLabel }, t('preset')),
        h('select', {
          style: styles.select,
          value: draft.preset,
          onChange: (e) => changePreset(e.target.value),
        },
          PRESETS.map((p) => h('option', { key: p, value: p }, p))),
        h('p', { style: styles.hint }, t('presetHint'))),
      preset !== null ? presetInfoBlock(styles, t, preset) : null,

      h('div', { style: styles.modesRow },
        h('label', { style: styles.fieldLabel }, t('modes')),
        MODE_OPTIONS.map((m) => h('label', { key: m.id, style: styles.modeLabel },
          h('input', {
            type: 'checkbox',
            checked: draft.modes.includes(m.id),
            onChange: () => toggleMode(m.id),
          }),
          t(m.key))),
        h('p', { style: styles.hint }, t('modesHint'))),

      h('div', { style: styles.grid },
        fieldSelect(styles, t, draft, setProvider, 'judgeProvider', 'provider', providerOptions, t('providerEmpty')),
        judgeModelField(styles, t, draft, setField, modelOptions, t('modelEmpty')),
        fieldInput(styles, t, draft, setField, 'judgeTimeoutMs', 'timeoutMs'),
        fieldInput(styles, t, draft, setField, 'judgeMaxTokens', 'maxTokens'),
        fieldInput(styles, t, draft, setField, 'judgeConcurrency', 'concurrency'),
      ),
      h('div', { style: styles.row },
        h('label', { style: styles.fieldLabel }, t('systemPrompt')),
        h('textarea', {
          style: styles.textarea,
          value: draft.judgeSystemPrompt,
          onChange: (e) => setField('judgeSystemPrompt', e.target.value),
        })),

      h('div', { style: styles.row },
        h('label', { style: styles.fieldLabel }, t('levels') + ' · ' + t('levelsHint')),
        h('textarea', {
          style: styles.textarea,
          value: draft.levels,
          onChange: (e) => setField('levels', e.target.value),
        }),
        levelsInvalid
          ? h('p', { style: Object.assign({}, styles.result, styles.resultErr) }, t('invalidLevelsJson'))
          : null),

      h('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
        h('button', {
          style: Object.assign({}, styles.primaryButton, !writable || busy || levelsInvalid ? styles.primaryDisabled : {}),
          disabled: !writable || busy || levelsInvalid,
          onClick: () => void save(),
        }, t('save')),
        done
          ? h('span', { style: Object.assign({}, styles.result, styles.resultOk) }, t('saved'))
          : failure !== undefined
            ? h('span', { style: Object.assign({}, styles.result, styles.resultErr) }, failure)
            : null,
        close !== undefined
          ? h('button', { style: styles.primaryButton, onClick: () => close() }, t('close'))
          : null,
      ),
    ),
  );
}

function fieldInput(styles, t, draft, setField, name, labelKey) {
  return h('div', { style: styles.row },
    h('label', { style: styles.fieldLabel }, t(labelKey)),
    h('input', {
      style: styles.input,
      value: draft[name],
      onChange: (e) => setField(name, e.target.value),
    }));
}

/**
 * A labeled <select> whose first option is always the "unconfigured" empty
 * value, followed by the catalog options ({ id, label? }). The empty option
 * doubles as the "clear back to composition base" choice.
 */
function fieldSelect(styles, t, draft, onChange, name, labelKey, options, emptyLabel) {
  return h('div', { style: styles.row },
    h('label', { style: styles.fieldLabel }, t(labelKey)),
    h('select', {
      style: styles.select,
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
function judgeModelField(styles, t, draft, setField, modelOptions, emptyLabel) {
  if (modelOptions.length === 0) {
    return fieldInput(styles, t, draft, setField, 'judgeModel', 'model');
  }
  const known = draft.judgeModel === '' || modelOptions.some((o) => o.id === draft.judgeModel);
  if (!known) {
    return fieldInput(styles, t, draft, setField, 'judgeModel', 'model');
  }
  return fieldSelect(styles, t, draft, (v) => setField('judgeModel', v), 'judgeModel', 'model', modelOptions, emptyLabel);
}

/** Read-only per-preset hint block: level table + error/unsure fallbacks + prompt summary. */
function presetInfoBlock(styles, t, preset) {
  return h('div', { style: styles.presetInfo },
    h('div', { style: styles.row },
      h('label', { style: styles.fieldLabel }, t('presetLevels')),
      h('div', { style: styles.presetTable },
        presetRow(styles, t, t('workspaceWrite'), preset.levels.workspaceWrite),
        presetRow(styles, t, t('dangerFullAccess'), preset.levels.dangerFullAccess),
        presetRow(styles, t, t('presetErrorFallback'), preset.fallbackError),
        presetRow(styles, t, t('presetUnsureFallback'), preset.fallbackUnsure))),
    h('div', { style: styles.row },
      h('label', { style: styles.fieldLabel }, t('presetPrompt')),
      h('p', { style: styles.presetPromptText }, preset.prompt)));
}

/** One row of the preset level table; the 'custom' marker reads the user's levels table. */
function presetRow(styles, t, label, value) {
  return h('div', { style: styles.presetRow },
    h('span', null, label),
    h('span', { style: styles.presetValue }, value === 'custom' ? t('presetCustom') : value));
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
