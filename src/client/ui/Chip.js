/**
 * YOLO mode status chip (slot `conversation.input.left`). Shows "YOLO <preset>"
 * and toggles the shared popup via store.togglePopup().
 */
import { useEffect, createElement as h } from 'react';

const chipStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 10px',
  borderRadius: 999,
  backgroundColor: '#ffffff',
  color: '#1d4ed8',
  border: '1px solid #93c5fd',
  fontSize: 12,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  userSelect: 'none',
};

/** Status colour for the leading dot based on judge readiness. */
function dotColor(statusInfo) {
  const configured = statusInfo && statusInfo.judgeConfigured;
  return configured ? '#16a34a' : '#d97706';
}

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
  return h('button', {
    style: chipStyle,
    title: 'YOLO',
    onClick: () => store.togglePopup(),
  },
    h('span', { style: {
      width: 8, height: 8, borderRadius: 4,
      backgroundColor: dotColor(statusInfo), display: 'inline-block',
    } }),
    'YOLO ' + preset,
  );
}
