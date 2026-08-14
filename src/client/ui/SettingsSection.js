/**
 * YOLO mode settings section (slot `settings.section`). Renders the resolved
 * configuration (view.value) into a form and saves via path ops through
 * store.mutate with an optimistic-revision lock. Everything is React.createElement
 * + inline styles (no JSX, no CSS modules).
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
  // Kick the first load once when the settings page mounts: the store starts
  // idle, so without this the page would stay stuck on the intro text until a
  // pushed invalidation arrives. load() is idempotent/generation-guarded.
  useEffect(() => {
    void store.load();
  }, [store]);
  const view = state.view;
  const draft = draftFromView(view, t);
  const [local, setLocal] = useState(draft);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);

  // Reflect a fresh server snapshot into the draft (a reload or pushed
  // invalidation). Rebuilt from the CURRENT view each render; we only push it
  // into local state when not busy so a mid-edit is not clobbered.
  // (Kept intentionally simple: the section re-inits from the snapshot on load.)
  if (!busy && !pending && !draftsEqual(draftFromView(view, t), local)) {
    setLocal(draftFromView(view, t));
  }

  const levelsParse = parseLevels(local.levels);

  const canSave =
    state.status === 'ready' &&
    !busy &&
    (levelsParse.ok || trimToNull(local.levels) == null);

  const onSave = async () => {
    setBusy(true);
    setPending(false);
    try {
      const ops = buildOps(view, local, t);
      const outcome = await store.mutate(ops);
      if (!outcome.ok) {
        setPending('error:' + (outcome.kind || 'fatal'));
      } else {
        setPending('ok');
      }
    } finally {
      setBusy(false);
    }
  };

  const toggleMode = (id) => {
    const next = local.modes.includes(id)
      ? local.modes.filter((m) => m !== id)
      : local.modes.concat([id]);
    setLocal(Object.assign({}, local, { modes: next }));
  };

  const setField = (name, value) => setLocal(Object.assign({}, local, { [name]: value }));

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

  return h('div', { style: styles.root },
    h('p', { style: styles.intro }, t('sectionIntro')),
    h('div', { style: styles.card },
      h('div', { style: styles.row },
        h('label', { style: styles.fieldLabel }, t('preset')),
        h('select', {
          style: styles.select,
          value: local.preset,
          onChange: (e) => setField('preset', e.target.value),
        },
          PRESETS.map((p) => h('option', { key: p, value: p }, p))),
        h('p', { style: styles.hint }, t('presetHint'))),

      h('div', { style: styles.modesRow },
        h('label', { style: styles.fieldLabel }, t('modes')),
        MODE_OPTIONS.map((m) => h('label', { key: m.id, style: styles.modeLabel },
          h('input', {
            type: 'checkbox',
            checked: local.modes.includes(m.id),
            onChange: () => toggleMode(m.id),
          }),
          t(m.key))),
        h('p', { style: styles.hint }, t('modesHint'))),

      h('div', { style: styles.grid },
        fieldInput(styles, t, local, setField, 'judgeProvider', 'provider'),
        fieldInput(styles, t, local, setField, 'judgeModel', 'model'),
        fieldInput(styles, t, local, setField, 'judgeTimeoutMs', 'timeoutMs'),
        fieldInput(styles, t, local, setField, 'judgeMaxTokens', 'maxTokens'),
        fieldInput(styles, t, local, setField, 'judgeConcurrency', 'concurrency'),
      ),
      h('div', { style: styles.row },
        h('label', { style: styles.fieldLabel }, t('systemPrompt')),
        h('textarea', {
          style: styles.textarea,
          value: local.judgeSystemPrompt,
          onChange: (e) => setField('judgeSystemPrompt', e.target.value),
        })),

      h('div', { style: styles.row },
        h('label', { style: styles.fieldLabel }, t('levels') + ' · ' + t('levelsHint')),
        h('textarea', {
          style: styles.textarea,
          value: local.levels,
          onChange: (e) => setField('levels', e.target.value),
        }),
        parseLevels(local.levels).ok || trimToNull(local.levels) == null
          ? null
          : h('p', { style: Object.assign({}, styles.result, styles.resultErr) }, t('invalidLevelsJson'))),

      pending === 'ok'
        ? h('p', { style: Object.assign({}, styles.result, styles.resultOk) }, t('saved'))
        : pending !== null && pending === 'error:conflict'
          ? h('p', { style: Object.assign({}, styles.result, styles.resultErr) }, t('conflict'))
          : pending !== null && pending === 'error:rejected'
            ? h('p', { style: Object.assign({}, styles.result, styles.resultErr) }, t('rejected'))
            : pending === 'error:fatal'
              ? h('p', { style: Object.assign({}, styles.result, styles.resultErr) }, t('fatal'))
              : null,

      h('div', { style: { display: 'flex', gap: 8 } },
        h('button', {
          style: Object.assign({}, styles.primaryButton, canSave ? {} : styles.primaryDisabled),
          disabled: !canSave,
          onClick: () => void onSave(),
        }, t('save')),
        close !== undefined
          ? h('button', { style: styles.primaryButton, onClick: () => close() }, t('close'))
          : null,
      ),
    ),
  );
}

function draftsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function fieldInput(styles, t, local, setField, name, labelKey) {
  return h('div', { style: styles.row },
    h('label', { style: styles.fieldLabel }, t(labelKey)),
    h('input', {
      style: styles.input,
      value: local[name],
      onChange: (e) => setField(name, e.target.value),
    }));
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
function buildOps(view, local, t) {
  const value = view && view.value != null ? view.value : {};
  const judge = value.judge && typeof value.judge === 'object' ? value.judge : {};
  const ops = [];

  ops.push.apply(ops, presetOps(local.preset));
  ops.push.apply(ops, modesOps(local.modes));

  ops.push.apply(ops, judgeFieldOps(judge.provider, ['judge', 'provider'], local.judgeProvider));
  ops.push.apply(ops, judgeFieldOps(judge.model, ['judge', 'model'], local.judgeModel));
  ops.push.apply(ops, judgeFieldOps(judge.systemPrompt, ['judge', 'systemPrompt'], local.judgeSystemPrompt));

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

  replaceField(judge.timeoutMs, ['judge', 'timeoutMs'], num(local.judgeTimeoutMs, judge.timeoutMs));
  replaceField(judge.maxTokens, ['judge', 'maxTokens'], num(local.judgeMaxTokens, judge.maxTokens));
  replaceField(judge.concurrency, ['judge', 'concurrency'], num(local.judgeConcurrency, judge.concurrency));

  const levels = parseLevels(local.levels).value;
  ops.push.apply(ops, levelsOps(levels));

  return ops;
}
