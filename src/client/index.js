/**
 * YOLO mode — browser half (DSH client plugin).
 *
 * Registers three slots:
 *  - `plugins.bundle.config` (key `dsh-yolo-mode`): ALL configuration, rendered
 *    on this plugin's own page in the plugin manager (插件列表 → dsh-yolo-mode),
 *    between the package description and the component rows;
 *  - `conversation.input.left`: the `YOLO <preset>` status chip;
 *  - `shell.overlay`: the stats / recent-decisions panel that chip opens.
 *
 * The `settings.section` page stays retired: nothing is configured from the DSH
 * Settings surface any more. Data flows through the connection's generic RPC
 * channel (/yolo-mode) into a snapshot store; writes travel as path ops through
 * settingsMutate with an optimistic-revision lock.
 */
import { en, zh, NS } from './locales.js';
import { YoloStore } from './store.js';
import { ConfigForm } from './ui/ConfigForm.js';
import { Chip } from './ui/Chip.js';
import { Popup } from './ui/Popup.js';
import { bindSnapshotSelector } from './bind.js';

/**
 * Services required by these slot registrations (dsh.client.inject is the same
 * short-name set): slots, locale, connection, remote, remote.llm, remote.session.
 * Both dotted Remote namespaces are REQUIRED, not optional: the client Remote
 * proxy is inject-gated and throws `cannot get property "remote.X" without
 * inject` on an undeclared read — it does not return undefined. The store reads
 * `remote.llm` for the provider directory and `remote.session` for the model
 * catalog, so both must be declared here (and in package.json's dsh.client.inject).
 */
export const inject = ['slots', 'locale', 'connection', 'remote', 'remote.llm', 'remote.session'];

/**
 * Register the YOLO chip/panel once the slot declarations are on the ledger,
 * wire the store to the connection, and keep it fresh on every pushed
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
  const store = new YoloStore({
    rpc: connection.rpc,
    // 0.1.7+ reads the provider/model directory from the client Remote service
    // (remote.llm / remote.session); `connection.api.llm` is the legacy face for
    // older transports and only used when the Remote namespace is absent.
    remote: ctx.get('remote') ?? null,
    llm: connection.api ? connection.api.llm : null,
  });
  // The store is a bare observable (subscribe/getSnapshot) → bind it directly.
  const useSnapshot = bindSnapshotSelector(store);

  ctx.effect(() => {
    const refresh = (ns) => {
      if (ns !== undefined && ns !== 'yolo-mode') return;
      void store.load();
    };
    const disposers = [
      ctx.remote == null ? () => {} : ctx.remote.$on('settings/document-updated', refresh),
      // Provider topology changed → refresh so the provider/model selects
      // reflect the live adapter registry.
      ctx.remote == null ? () => {} : ctx.remote.$on('llm/adapters-updated', () => void store.load()),
      ctx.on('connection/reset', () => void store.load()),
    ];
    return () => {
      for (const dispose of disposers) {
        if (dispose) dispose();
      }
    };
  }, 'yolo-mode: pushed invalidations');

  const injected = () => ({ store, useSnapshot, t });

  // Configuration lives on THIS plugin's page in the plugin manager (插件列表 →
  // dsh-yolo-mode), between the package description and the component rows.
  // `plugins.bundle.config` is keyed by the npm package name; the page renders
  // the section only while that key is registered (`configured` =
  // ledger.bundles.has(pkg.name) in dsh-client-ui-plugin-manager), which is why
  // the section simply did not exist before. A bundle page may hold several
  // entries, so the page passes NO `form` — the registrant owns its own draft,
  // validation and save path (here: the /yolo-mode settings bridge).
  ctx.slots.inject('plugins.bundle.config', () =>
    ctx.slots.register(
      {
        name: 'plugins.bundle.config',
        key: 'dsh-yolo-mode',
        locale: NS,
        inject: injected,
      },
      ConfigForm,
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
