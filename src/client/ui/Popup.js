/**
 * YOLO mode status popup (slot `shell.overlay`). Renders null while the store's
 * open flag is false; otherwise a stats card plus the recent decisions table
 * (≤20, newest first) and a refresh button.
 */
import { createElement as h } from 'react';

const popupStyle = {
  position: 'absolute',
  top: 56,
  right: 16,
  width: 520,
  maxWidth: '90vw',
  maxHeight: '70vh',
  overflow: 'auto',
  backgroundColor: '#ffffff',
  color: '#111827',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  boxShadow: '0 12px 40px rgba(15,23,42,0.4)',
  padding: 14,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  zIndex: 1000,
};

const headerStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
};

const statGrid = { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 };

const statCell = {
  border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 6px',
  textAlign: 'center', backgroundColor: '#f8fafc',
};

const statValue = { fontSize: 18, fontWeight: 600, color: '#111827' };
const statLabel = { fontSize: 11, color: '#6b7280', marginTop: 2 };

const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 12 };
const thStyle = { color: '#374151', textAlign: 'left', padding: '4px 6px', borderBottom: '1px solid #e5e7eb', backgroundColor: '#f1f5f9', fontWeight: 500 };
const tdStyle = { padding: '4px 6px', borderBottom: '1px solid #e5e7eb', verticalAlign: 'top' };
const codeStyle = { fontFamily: 'monospace', fontSize: 11, color: '#374151' };

const primaryButton = {
  backgroundColor: '#2563eb', color: '#ffffff', border: 'none', borderRadius: 6,
  padding: '5px 12px', fontSize: 12, cursor: 'pointer',
};

/** Truncate long reason text for display. */
function truncate(text, max) {
  if (typeof text !== 'string') return '';
  return text.length > max ? text.slice(0, max) + '…' : text;
}

/**
 * @param {object} props - slot-delivered { store, useSnapshot, t }.
 */
export function Popup(props) {
  const store = props.store;
  const useSnapshot = props.useSnapshot;
  const t = props.t;
  if (store === undefined || useSnapshot === undefined || t === undefined) return null;
  const state = useSnapshot((s) => s);
  if (!state.open) return null;

  const info = state.statusInfo;
  const stats = info && info.stats ? info.stats : {};
  const recent = info && Array.isArray(info.recent) ? info.recent.slice(0, 20) : [];

  return h('div', { style: popupStyle },
    h('div', { style: headerStyle },
      h('strong', {}, t('chip')),
      h('button', { style: primaryButton, onClick: () => void store.load() }, t('refresh')),
    ),

    h('div', { style: statGrid },
      statCellOf(t, 'statsTotal', stats.total),
      statCellOf(t, 'statsAllowed', stats.allowed),
      statCellOf(t, 'statsRejected', stats.rejected),
      statCellOf(t, 'statsDelegated', stats.delegated),
    ),

    recent.length === 0
      ? h('p', { style: { color: '#6b7280', fontSize: 12, margin: 0 } }, t('recentEmpty'))
      : h('table', { style: tableStyle },
          h('thead', {},
            h('tr', {},
              h('th', { style: thStyle }, t('tableTime')),
              h('th', { style: thStyle }, t('tableTool')),
              h('th', { style: thStyle }, t('tableTarget')),
              h('th', { style: thStyle }, t('tableDecision')),
              h('th', { style: thStyle }, t('tableOutcome')),
              h('th', { style: thStyle }, t('tableReason')),
            )),
          h('tbody', {},
            recent.map((row, idx) => tableRow(t, row, idx)),
          ),
        ),

    h('div', { style: { display: 'flex', justifyContent: 'flex-end' } },
      h('button', { style: primaryButton, onClick: () => store.togglePopup() }, t('close')),
    ),
  );
}

function statCellOf(t, key, value) {
  const text = value === undefined || value === null ? '–' : String(value);
  return h('div', { style: statCell },
    h('div', { style: statValue }, text),
    h('div', { style: statLabel }, t(key)),
  );
}

function tableRow(t, row, idx) {
  return h('tr', { key: idx },
    h('td', { style: tdStyle }, timeText(row.time)),
    h('td', { style: tdStyle }, row.toolName || '–'),
    h('td', { style: tdStyle },
      h('span', { style: codeStyle }, row.targetMode || '–')),
    h('td', { style: tdStyle }, row.decision || '–'),
    h('td', { style: tdStyle }, row.outcome || '–'),
    h('td', { style: tdStyle }, truncate(row.reason, 48) || '–'),
  );
}

function timeText(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toLocaleTimeString();
    return String(value);
  }
  return '–';
}
