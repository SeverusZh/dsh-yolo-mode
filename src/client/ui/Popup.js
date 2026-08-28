/**
 * YOLO mode status popup (slot `shell.overlay`). Renders null while the store's
 * open flag is false; otherwise a stats card plus the recent decisions table
 * (paged, PAGE_SIZE per page, newest first), an "open audit log" button, and a
 * refresh button.
 *
 * Guard/hook split mirrors SettingsSection: the outer component validates the
 * slot inject face, the inner component owns all hooks unconditionally.
 */
import { useState, useEffect, createElement as h } from 'react';

/** Rows per page of the recent-decisions table. */
const PAGE_SIZE = 5;

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

const headerButtons = { display: 'flex', alignItems: 'center', gap: 8 };

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

const secondaryButton = {
  backgroundColor: '#ffffff', color: '#374151', border: '1px solid #cbd5e1',
  borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer',
};

const pagerButton = {
  backgroundColor: '#ffffff', color: '#2563eb', border: '1px solid #cbd5e1',
  borderRadius: 6, padding: '3px 10px', fontSize: 12, cursor: 'pointer',
};

const pagerButtonDisabled = { opacity: 0.4, cursor: 'not-allowed' };

const captionStyle = { margin: 0, color: '#6b7280', fontSize: 11, lineHeight: '16px' };
const logResultOk = { color: '#16a34a' };
const logResultErr = { color: '#dc2626' };

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
  return ReactPopup({ store, useSnapshot, t });
}

function ReactPopup({ store, useSnapshot, t }) {
  const state = useSnapshot((s) => s);

  // ---- paging state (hooks before any conditional return) ----
  const [page, setPage] = useState(0);
  // ---- open-log feedback state ----
  const [logResult, setLogResult] = useState(undefined); // {ok:true,value} | {ok:false,error}
  const [logBusy, setLogBusy] = useState(false);

  const statusInfo = state.statusInfo && typeof state.statusInfo === 'object' ? state.statusInfo : {};
  const recent = Array.isArray(statusInfo.recent) ? statusInfo.recent : [];
  const totalPages = Math.max(1, Math.ceil(recent.length / PAGE_SIZE));

  // Reset to the first page when the list size crosses a page boundary (a
  // refresh changed the page count); otherwise keep the reader's position.
  useEffect(() => {
    setPage(0);
  }, [totalPages]);

  // Auto-clear a successful "log opened" notice after a few seconds.
  useEffect(() => {
    if (!logResult || !logResult.ok) return;
    const timer = setTimeout(() => setLogResult(undefined), 4000);
    return () => clearTimeout(timer);
  }, [logResult]);

  if (!state.open) return null;

  const info = state.statusInfo;
  const stats = info && info.stats ? info.stats : {};
  const auditFile = typeof statusInfo.auditFile === 'string' && statusInfo.auditFile !== '' ? statusInfo.auditFile : undefined;
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = recent.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const openLog = async () => {
    setLogBusy(true);
    setLogResult(undefined);
    try {
      setLogResult(await store.openLogFile());
    } catch (err) {
      setLogResult({
        ok: false,
        error: { code: 'internal', message: err && err.message ? String(err.message) : String(err) },
      });
    } finally {
      setLogBusy(false);
    }
  };

  return h('div', { style: popupStyle },
    h('div', { style: headerStyle },
      h('strong', {}, t('chip')),
      h('div', { style: headerButtons },
        h('button', {
          style: logBusy ? Object.assign({}, secondaryButton, { opacity: 0.6 }) : secondaryButton,
          onClick: () => void openLog(),
          title: auditFile !== undefined ? auditFile : undefined,
        }, logBusy ? t('openLogBusy') : t('openLog')),
        h('button', { style: primaryButton, onClick: () => void store.load() }, t('refresh')),
      ),
    ),

    // Open-log feedback line.
    logResult !== undefined
      ? h('p', { style: Object.assign({}, captionStyle, logResult.ok ? logResultOk : logResultErr) },
          logResult.ok
            ? t('openLogOk') + (logResult.value && logResult.value.path ? ': ' + logResult.value.path : '')
            : logMessage(t, logResult.error))
      : auditFile !== undefined
        ? h('p', { style: captionStyle }, t('logPath') + ': ' + auditFile)
        : null,

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
            pageRows.map((row, idx) => tableRow(t, row, safePage * PAGE_SIZE + idx)),
          ),
        ),

    // Pager (hidden when everything fits on one page).
    totalPages > 1
      ? h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 } },
          h('button', {
            style: Object.assign({}, pagerButton, safePage === 0 ? pagerButtonDisabled : {}),
            disabled: safePage === 0,
            onClick: () => setPage(safePage - 1),
          }, t('pagePrev')),
          h('span', { style: { fontSize: 12, color: '#374151' } },
            t('pageOf', { current: String(safePage + 1), total: String(totalPages) })),
          h('button', {
            style: Object.assign({}, pagerButton, safePage >= totalPages - 1 ? pagerButtonDisabled : {}),
            disabled: safePage >= totalPages - 1,
            onClick: () => setPage(safePage + 1),
          }, t('pageNext')),
        )
      : null,

    h('div', { style: { display: 'flex', justifyContent: 'flex-end' } },
      h('button', { style: primaryButton, onClick: () => store.togglePopup() }, t('close')),
    ),
  );
}

/** User-facing message for a failed open-log attempt (by error code). */
function logMessage(t, error) {
  const code = error && typeof error === 'object' && typeof error.code === 'string' ? error.code : undefined;
  const detail = error && typeof error === 'object' && typeof error.message === 'string' ? error.message : undefined;
  if (code === 'log-not-found') {
    return t('logNotFound') + (detail ? ': ' + detail : '');
  }
  return t('openLogFail') + (detail ? ': ' + detail : '');
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
