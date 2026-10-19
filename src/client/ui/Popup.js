/**
 * YOLO mode status popup (slot `shell.overlay`). Renders null while the store's
 * open flag is false; otherwise a stats card plus the recent decisions table
 * (paged, PAGE_SIZE per page, newest first), an "open audit log" button, and a
 * refresh button.
 *
 * Presentation only: the panel, stat grid, table and controls are styled by the
 * token stylesheet installed by the client entry (`styles.js`). All copy keys,
 * click handlers, pagination semantics and the log-open flow are unchanged.
 *
 * Guard/hook split mirrors ConfigForm: the outer component validates the
 * slot inject face, the inner component owns all hooks unconditionally.
 */
import { useState, useEffect, createElement as h } from 'react';

/** Rows per page of the recent-decisions table. */
const PAGE_SIZE = 5;

/** Truncate long reason text for display. */
function truncate(text, max) {
  if (typeof text !== 'string') return '';
  return text.length > max ? text.slice(0, max) + '…' : text;
}

/**
 * Semantic kind of a decision outcome, used only to colour the outcome cell
 * with state tokens. Unknown values stay neutral.
 */
function outcomeKind(value) {
  const text = typeof value === 'string' ? value.toLowerCase() : '';
  if (text === '') return undefined;
  if (text.includes('allow')) return 'ok';
  if (text.includes('reject') || text.includes('deny')) return 'err';
  if (text.includes('delegat') || text.includes('unsure') || text.includes('error')) return 'warn';
  return undefined;
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

  return h('div', {
    className: 'ym-popup',
    role: 'dialog',
    'aria-label': t('chip'),
  },
    h('div', { className: 'ym-popup-head' },
      h('h3', { className: 'ym-popup-title' }, t('chip')),
      h('div', { className: 'ym-popup-actions' },
        h('button', {
          type: 'button',
          className: 'ym-btn ym-btn-sm',
          disabled: logBusy,
          onClick: () => void openLog(),
          title: auditFile !== undefined ? auditFile : undefined,
        }, logBusy ? t('openLogBusy') : t('openLog')),
        h('button', {
          type: 'button',
          className: 'ym-btn ym-btn-sm ym-btn-primary',
          onClick: () => void store.load(),
        }, t('refresh')),
      ),
    ),

    // Open-log feedback line.
    logResult !== undefined
      ? h('p', { className: 'ym-caption ' + (logResult.ok ? 'ym-caption-ok' : 'ym-caption-err') },
          logResult.ok
            ? t('openLogOk') + (logResult.value && logResult.value.path ? ': ' + logResult.value.path : '')
            : logMessage(t, logResult.error))
      : auditFile !== undefined
        ? h('p', { className: 'ym-caption' }, t('logPath') + ': ' + auditFile)
        : null,

    h('div', { className: 'ym-stats' },
      statCellOf(t, 'statsTotal', stats.total),
      statCellOf(t, 'statsAllowed', stats.allowed),
      statCellOf(t, 'statsRejected', stats.rejected),
      statCellOf(t, 'statsDelegated', stats.delegated),
    ),

    recent.length === 0
      ? h('div', { className: 'ym-empty' }, t('recentEmpty'))
      : h('div', { className: 'ym-table-wrap' },
          h('table', { className: 'ym-table' },
            h('thead', {},
              h('tr', {},
                h('th', {}, t('tableTime')),
                h('th', {}, t('tableTool')),
                h('th', {}, t('tableTarget')),
                h('th', {}, t('tableDecision')),
                h('th', {}, t('tableOutcome')),
                h('th', {}, t('tableReason')),
              )),
            h('tbody', {},
              pageRows.map((row, idx) => tableRow(t, row, safePage * PAGE_SIZE + idx)),
            ),
          ),
        ),

    // Pager (hidden when everything fits on one page).
    totalPages > 1
      ? h('div', { className: 'ym-pager' },
          h('button', {
            type: 'button',
            className: 'ym-btn ym-btn-sm',
            disabled: safePage === 0,
            onClick: () => setPage(safePage - 1),
          }, t('pagePrev')),
          h('span', { className: 'ym-page-text' },
            t('pageOf', { current: String(safePage + 1), total: String(totalPages) })),
          h('button', {
            type: 'button',
            className: 'ym-btn ym-btn-sm',
            disabled: safePage >= totalPages - 1,
            onClick: () => setPage(safePage + 1),
          }, t('pageNext')),
        )
      : null,

    h('div', { className: 'ym-popup-foot' },
      h('button', {
        type: 'button',
        className: 'ym-btn ym-btn-sm',
        onClick: () => store.togglePopup(),
      }, t('close')),
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
  return h('div', { className: 'ym-stat' },
    h('div', { className: 'ym-stat-value' }, text),
    h('div', { className: 'ym-stat-label' }, t(key)),
  );
}

function tableRow(t, row, idx) {
  const kind = outcomeKind(row.outcome);
  return h('tr', { key: idx },
    h('td', { className: 'ym-time' }, timeText(row.time)),
    h('td', {}, row.toolName || '–'),
    h('td', {},
      h('span', { className: 'ym-code' }, row.targetMode || '–')),
    h('td', {}, row.decision || '–'),
    h('td', {},
      h('span', { className: 'ym-outcome', 'data-kind': kind }, row.outcome || '–')),
    h('td', { className: 'ym-reason', title: truncate(row.reason, 48) || undefined }, truncate(row.reason, 48) || '–'),
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
