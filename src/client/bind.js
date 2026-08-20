/**
 * uSES bridge: turns any bare observable snapshot source into a selector hook.
 *
 * DSH rc8 removed the `@deepseek-ai/dsh-client-web-react` package (its client
 * store-binding helpers were folded into the core slot kit). This is a local
 * copy of the same `bindSnapshotSelector` contract, implemented against the
 * `react` seed provided by the DSH client module table, so the plugin keeps
 * working on rc8+ without an extra runtime dependency.
 */
import { useSyncExternalStore } from 'react';

/**
 * Bind a bare observable source (subscribe/getSnapshot) to a selector hook.
 * The selector is applied to the snapshot on every render; identity stores can
 * simply pass `(s) => s`.
 *
 * @param store - snapshot source (must implement subscribe/getSnapshot).
 * @returns the selector hook.
 */
export function bindSnapshotSelector(store) {
  const subscribe = (listener) => store.subscribe(listener);
  const getSnapshot = () => store.getSnapshot();
  return function useSelector(selector) {
    const select = selector ?? ((state) => state);
    return useSyncExternalStore(subscribe, () => select(getSnapshot()));
  };
}
