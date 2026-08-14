/**
 * YOLO mode — browser half (DSH client plugin).
 *
 * Registers the `settings.section` page (id 'yolo-mode') that configures the
 * preset/modes/judge/levels, the `conversation.input.left` status chip, and the
 * `shell.overlay` stats/recent popup. Data flows through the connection's
 * generic RPC channel (/yolo-mode) into a snapshot store; writes travel as path
 * ops through settingsMutate with an optimistic-revision lock.
 */
import { en, zh, NS } from './locales.js';
import { YoloStore } from './store.js';
import { SettingsSection } from './ui/SettingsSection.js';
import { Chip } from './ui/Chip.js';
import { Popup } from './ui/Popup.js';
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react';

/**
 * Services required by these slot registrations (dsh.client.inject is the same
 * short-name set): slots, locale, connection, remote.
 */
export const inject = ['slots', 'locale', 'connection', 'remote'];

/**
 * Register the YOLO section/chip/popup once the slot declarations are on the
 * ledger, wire the store to the connection, and keep it fresh on every pushed
 * invalidation.
 *
 * @param {object} ctx - client cordis context.
 */
export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'yolo-mode: copy dictionaries');

  const connection = ctx.get('connection');
  // No connection transport → nothing to talk to; leave the slots unregistered.
  if (connection === undefined || connection === null) return;

  const t = ctx.locale.bind(NS);
  const store = new YoloStore({ rpc: connection.rpc });
  // The store is a bare observable (subscribe/getSnapshot) → bind it directly.
  const useSnapshot = bindSnapshotSelector(store);

  ctx.effect(() => {
    const refresh = (ns) => {
      if (ns !== undefined && ns !== 'yolo-mode') return;
      void store.load();
    };
    const disposers = [
      ctx.remote == null ? () => {} : ctx.remote.$on('settings/document-updated', refresh),
      ctx.on('connection/reset', () => void store.load()),
    ];
    return () => {
      for (const dispose of disposers) {
        if (dispose) dispose();
      }
    };
  }, 'yolo-mode: pushed invalidations');

  const injected = () => ({ store, useSnapshot, t });

  ctx.slots.inject('settings.section', () =>
    ctx.slots.register(
      {
        name: 'settings.section',
        id: 'yolo-mode',
        order: 25,
        label: () => t('nav'),
        locale: NS,
        inject: injected,
      },
      SettingsSection,
    ),
  );

  ctx.slots.inject('conversation.input.left', () =>
    ctx.slots.register(
      {
        name: 'conversation.input.left',
        id: 'yolo-mode-chip',
        order: 0,
        label: () => t('chip'),
        locale: NS,
        inject: injected,
      },
      Chip,
    ),
  );

  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register(
      {
        name: 'shell.overlay',
        id: 'yolo-mode-popup',
        order: 0,
        label: () => t('chip'),
        locale: NS,
        inject: injected,
      },
      Popup,
    ),
  );
}

export { en, zh, NS };
