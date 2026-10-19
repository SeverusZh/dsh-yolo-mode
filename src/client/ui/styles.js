/**
 * Shared presentation layer for the YOLO mode client UI: one token-only
 * stylesheet used by the configuration form, the conversation chip and the
 * overlay panel.
 *
 * Every colour, font, radius, elevation and focus ring comes from the official
 * `--dsw-*` theme variables, so light and dark themes both resolve correctly
 * without a media query or a duplicated palette. No hard-coded neutral colours
 * are allowed here; the few semantic data colours (the judge-ready dot, the
 * decision outcome text) are expressed with state tokens.
 *
 * The stylesheet is installed once per document from `apply()` inside a
 * fiber-scoped `ctx.effect`, mirroring the official client plugins. In a
 * non-browser context (unit tests run the bundle in Node) `installStyles` is a
 * no-op.
 */

/** Style tag identity: one tag per document, removed when the fiber unloads. */
const CSS_TAG_ID = 'dsh-yolo-mode/ui.css';

/** Class prefix kept unique enough to never collide with product CSS. */
const CSS = [
  // ── configuration section ────────────────────────────────────────────────
  '.ym-root{display:flex;flex-direction:column;gap:16px;color:var(--dsw-alias-label-primary);font:var(--dsw-font-xs-13);box-sizing:border-box}',
  '.ym-root *,.ym-popup *{box-sizing:border-box}',
  '.ym-head{display:flex;flex-direction:column;gap:4px;min-width:0}',
  '.ym-title{margin:0;font:var(--dsw-font-s-14);font-weight:600;color:var(--dsw-alias-label-primary)}',
  '.ym-desc{margin:0;font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-secondary)}',
  '.ym-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}',
  '.ym-card{display:flex;flex-direction:column;gap:12px;padding:14px 16px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);box-shadow:var(--dsw-elevation-soft)}',
  '.ym-card-head{display:flex;flex-direction:column;gap:2px;min-width:0}',
  '.ym-card-title{margin:0;font:var(--dsw-font-xs-strong-13);font-weight:600;color:var(--dsw-alias-label-primary)}',
  '.ym-card-hint{margin:0;font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-secondary)}',
  '.ym-field{display:flex;flex-direction:column;gap:6px;min-width:0}',
  '.ym-label{font:var(--dsw-font-xxs-strong-12);font-weight:500;color:var(--dsw-alias-label-primary)}',
  '.ym-hint{margin:0;font:var(--dsw-font-xxxs-11);color:var(--dsw-alias-label-secondary);line-height:16px}',
  '.ym-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;min-width:0}',
  '.ym-input,.ym-select,.ym-textarea{width:100%;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);font:var(--dsw-font-xs-13);transition:border-color .15s ease,background-color .15s ease,color .15s ease}',
  '.ym-input,.ym-select{height:30px;padding:0 10px}',
  '.ym-select{cursor:pointer;appearance:auto}',
  '.ym-textarea{min-height:88px;padding:8px 10px;line-height:20px;resize:vertical}',
  '.ym-textarea.ym-code{font:var(--dsw-font-markdown-code);line-height:19px}',
  '.ym-input:hover:not(:disabled),.ym-select:hover:not(:disabled),.ym-textarea:hover:not(:disabled){border-color:var(--dsw-alias-border-l3)}',
  '.ym-input:focus,.ym-select:focus,.ym-textarea:focus{outline:none;border-color:var(--dsw-alias-brand-primary)}',
  '.ym-input:focus-visible,.ym-select:focus-visible,.ym-textarea:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color);outline-offset:1px}',
  '.ym-input:disabled,.ym-select:disabled,.ym-textarea:disabled{opacity:.55;cursor:not-allowed}',
  '.ym-input::placeholder,.ym-textarea::placeholder{color:var(--dsw-alias-label-tertiary)}',
  '.ym-check-row{display:flex;flex-direction:column;gap:2px;min-width:0}',
  '.ym-check{display:inline-flex;align-items:center;gap:8px;padding:4px 8px;margin:0 -8px;border-radius:var(--dsw-radius-sm);font:var(--dsw-font-xs-13);color:var(--dsw-alias-label-primary);cursor:pointer;transition:background-color .15s ease}',
  '.ym-check:hover{background:var(--dsw-alias-interactive-bg-hover)}',
  '.ym-check input{flex:none;width:15px;height:15px;margin:0;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}',
  '.ym-check input:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color);outline-offset:2px}',
  '.ym-preset{display:flex;flex-direction:column;gap:8px;padding:12px;background:var(--dsw-alias-bg-module-platform);border-radius:var(--dsw-radius-sm);min-width:0}',
  '.ym-preset-block{display:flex;flex-direction:column;gap:4px;min-width:0}',
  '.ym-preset-label{font:var(--dsw-font-xxxs-strong-11);font-weight:500;color:var(--dsw-alias-label-secondary);letter-spacing:.02em}',
  '.ym-preset-rows{display:flex;flex-direction:column;gap:2px}',
  '.ym-preset-row{display:flex;align-items:baseline;justify-content:space-between;gap:12px;font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-secondary)}',
  '.ym-preset-value{font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;white-space:nowrap}',
  '.ym-preset-prompt{margin:0;font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-secondary);line-height:18px}',
  '.ym-actions{display:flex;align-items:center;justify-content:flex-end;gap:12px;flex-wrap:wrap;padding-top:4px}',
  '.ym-status{font:var(--dsw-font-xxs-12);margin-right:auto;min-width:0}',
  '.ym-status-ok{display:inline-flex;align-items:center;gap:6px;color:var(--dsw-alias-label-primary)}',
  '.ym-status-ok::before{content:"";flex:none;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-success-primary)}',
  '.ym-status-err{color:var(--dsw-alias-state-error-primary)}',
  '.ym-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;flex:none;height:30px;padding:0 12px;color:var(--dsw-alias-label-primary);background:transparent;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);font:var(--dsw-font-xxs-strong-12);font-weight:500;cursor:pointer;transition:background-color .15s ease,border-color .15s ease,color .15s ease,opacity .15s ease}',
  '.ym-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}',
  '.ym-btn:active:not(:disabled){background:var(--dsw-alias-interactive-bg-active)}',
  '.ym-btn:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color);outline-offset:2px}',
  '.ym-btn:disabled{opacity:.5;cursor:not-allowed}',
  '.ym-btn-primary{background:var(--dsw-alias-button-primary-fill);border-color:transparent;color:var(--dsw-alias-label-primary-foreground)}',
  '.ym-btn-primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}',
  '.ym-btn-primary:active:not(:disabled){background:var(--dsw-alias-button-primary-hover)}',
  '.ym-error{display:flex;flex-direction:column;align-items:flex-start;gap:8px;padding:14px 16px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);box-shadow:var(--dsw-elevation-soft)}',
  '.ym-error-text{margin:0;font:var(--dsw-font-xxs-12);color:var(--dsw-alias-state-error-primary);line-height:18px;word-break:break-word}',
  '.ym-loading{display:flex;flex-direction:column;gap:8px;padding:4px 0}',
  '.ym-loading-text{font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-secondary)}',
  '.ym-skeleton{height:12px;border-radius:var(--dsw-radius-xs);background:var(--dsw-alias-bg-skeleton)}',
  '.ym-skeleton.is-wide{width:60%}',
  '.ym-skeleton.is-full{width:100%}',

  // ── conversation chip ───────────────────────────────────────────────────
  '.ym-chip{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 10px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:999px;color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xxxs-strong-11);font-weight:500;white-space:nowrap;cursor:pointer;user-select:none;transition:background-color .15s ease,border-color .15s ease,color .15s ease}',
  '.ym-chip:hover{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l3);color:var(--dsw-alias-label-primary)}',
  '.ym-chip:active{background:var(--dsw-alias-interactive-bg-active)}',
  '.ym-chip:focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color);outline-offset:2px}',
  '.ym-chip-dot{flex:none;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-label-tertiary)}',
  '.ym-chip-dot[data-ready]{background:var(--dsw-alias-state-success-primary)}',
  '.ym-chip-dot[data-pending]{background:var(--dsw-alias-state-warn-primary)}',
  '.ym-chip-preset{color:var(--dsw-alias-label-primary);font-weight:500;max-width:12em;overflow:hidden;text-overflow:ellipsis}',

  // ── overlay panel ───────────────────────────────────────────────────────
  '.ym-popup{position:absolute;top:56px;right:16px;z-index:1000;display:flex;flex-direction:column;gap:12px;width:560px;max-width:92vw;max-height:70vh;padding:16px;overflow:auto;color:var(--dsw-alias-label-primary);background:color-mix(in srgb,var(--dsw-alias-bg-overlay) 30%,var(--dsw-alias-bg-layer-2));border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-lg);box-shadow:var(--dsw-elevation-panel);font:var(--dsw-font-xs-13);animation:ym-popup-in .12s ease-out}',
  '@keyframes ym-popup-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}',
  '.ym-popup-head{display:flex;align-items:center;justify-content:space-between;gap:12px;min-width:0}',
  '.ym-popup-title{margin:0;font:var(--dsw-font-s-14);font-weight:600;color:var(--dsw-alias-label-primary)}',
  '.ym-popup-actions{display:inline-flex;align-items:center;gap:8px;flex:none}',
  '.ym-btn-sm{height:26px;padding:0 10px;border-radius:var(--dsw-radius-sm)}',
  '.ym-caption{margin:0;font:var(--dsw-font-xxxs-11);color:var(--dsw-alias-label-tertiary);line-height:16px;word-break:break-all}',
  '.ym-caption-ok{display:inline-flex;align-items:center;gap:6px;color:var(--dsw-alias-label-primary)}',
  '.ym-caption-ok::before{content:"";flex:none;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-success-primary)}',
  '.ym-caption-err{color:var(--dsw-alias-state-error-primary)}',
  '.ym-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}',
  '.ym-stat{display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 6px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm);text-align:center;min-width:0}',
  '.ym-stat-value{font:var(--dsw-font-m-18);font-weight:600;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;line-height:24px}',
  '.ym-stat-label{font:var(--dsw-font-xxxs-11);color:var(--dsw-alias-label-secondary);white-space:nowrap}',
  '.ym-table-wrap{display:flex;flex-direction:column;min-width:0;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm);overflow:hidden}',
  '.ym-table{width:100%;border-collapse:collapse;font:var(--dsw-font-xxs-12)}',
  '.ym-table th{padding:6px 10px;text-align:left;font:var(--dsw-font-xxxs-strong-11);font-weight:500;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);border-bottom:1px solid var(--dsw-alias-border-l1);white-space:nowrap}',
  '.ym-table td{padding:6px 10px;color:var(--dsw-alias-label-primary);border-bottom:1px solid var(--dsw-alias-border-l1);vertical-align:top;line-height:18px}',
  '.ym-table tr:last-child td{border-bottom:none}',
  '.ym-table tbody tr{transition:background-color .15s ease}',
  '.ym-table tbody tr:hover{background:var(--dsw-alias-interactive-bg-hover)}',
  '.ym-table .ym-time{color:var(--dsw-alias-label-secondary);white-space:nowrap;font-variant-numeric:tabular-nums}',
  '.ym-table .ym-code{font:var(--dsw-font-markdown-code-block-small);color:var(--dsw-alias-label-secondary)}',
  '.ym-table .ym-reason{color:var(--dsw-alias-label-secondary);max-width:16em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
  '.ym-outcome{display:inline-flex;align-items:center;gap:6px;font-weight:500}',
  '.ym-outcome::before{content:"";flex:none;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-label-tertiary)}',
  '.ym-outcome[data-kind=ok]::before{background:var(--dsw-alias-state-success-primary)}',
  '.ym-outcome[data-kind=err]::before{background:var(--dsw-alias-state-error-primary)}',
  '.ym-outcome[data-kind=warn]::before{background:var(--dsw-alias-state-warn-primary)}',
  '.ym-empty{display:flex;flex-direction:column;align-items:center;gap:6px;padding:20px 12px;border:1px dashed var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xxs-12);text-align:center}',
  '.ym-pager{display:flex;align-items:center;justify-content:flex-end;gap:8px}',
  '.ym-page-text{font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}',
  '.ym-popup-foot{display:flex;justify-content:flex-end;gap:8px}',

  '@media (max-width:480px){.ym-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}',
  '@media (prefers-reduced-motion:reduce){.ym-popup{animation:none;transition:none}}',
].join('\n');

/**
 * Install the stylesheet once per document. Safe when called repeatedly (the
 * data attribute is the identity check) and a no-op outside the browser.
 *
 * @returns {() => void | undefined} a disposer removing the tag, or undefined
 *   when no stylesheet was installed (SSR / unit tests).
 */
export function installStyles() {
  if (typeof document === 'undefined' || document.head === undefined) return undefined;
  const existing = document.querySelector('style[data-plugin-css="' + CSS_TAG_ID + '"]');
  if (existing !== null) return undefined;
  const tag = document.createElement('style');
  tag.dataset.pluginCss = CSS_TAG_ID;
  tag.textContent = CSS;
  document.head.appendChild(tag);
  return () => {
    tag.remove();
  };
}

/** Stylesheet source (exported for tests and tooling). */
export { CSS };
