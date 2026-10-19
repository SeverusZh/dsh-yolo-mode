/**
 * YOLO mode status chip (slot `conversation.input.left`). Shows "YOLO <preset>"
 * and toggles the shared popup via store.togglePopup().
 *
 * Presentation only: the pill, the status dot colour and the focus/hover states
 * come from the token stylesheet installed by the client entry (`styles.js`).
 */
import { useEffect, createElement as h } from 'react';

/**
 * @param {object} props - slot-delivered { store, useSnapshot, t } (inject face).
 */
export function Chip(props) {
  const store = props.store;
  const useSnapshot = props.useSnapshot;
  if (store === undefined || useSnapshot === undefined) return null;
  return ChipLoaded({ store, useSnapshot });
}

function ChipLoaded({ store, useSnapshot }) {
  // Kick the initial load once on mount: the store starts idle, so without
  // this the chip would stay on "YOLO …" until a pushed invalidation arrives.
  // load() is idempotent and generation-guarded, so later mounts are harmless.
  useEffect(() => {
    void store.load();
  }, [store]);
  const state = useSnapshot((s) => s);
  const statusInfo = state.statusInfo;
  const preset = statusInfo && typeof statusInfo.preset === 'string' ? statusInfo.preset : '…';
  // Judge readiness is the only state the dot carries: ready (green) versus
  // not configured / unknown (amber). Both colours are state tokens; the dot
  // itself is styled through `data-ready` / `data-pending`.
  const ready = !!(statusInfo && statusInfo.judgeConfigured);
  return h('button', {
    type: 'button',
    className: 'ym-chip',
    title: 'YOLO',
    'aria-haspopup': 'dialog',
    'aria-expanded': state.open === true,
    onClick: () => store.togglePopup(),
  },
    h('span', {
      className: 'ym-chip-dot',
      'data-ready': ready || undefined,
      'data-pending': ready ? undefined : true,
      'aria-hidden': true,
    }),
    h('span', { className: 'ym-chip-preset' }, 'YOLO ' + preset),
  );
}
