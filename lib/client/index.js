window.__ModuleLoader__.load({
	id: "dsh-yolo-mode",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_web_react = require("@deepseek-ai/dsh-client-web-react");
		//#region src/client/locales.js
		/**
		* Bilingual dictionaries for the YOLO mode `settings.yoloMode` namespace.
		* Both locales must carry every key so a locale switch never leaves a blank
		* label.
		*/
		/** Dictionary namespace owned by YOLO mode (registered by src/client/index.js). */
		const NS = "settings.yoloMode";
		/** English dictionary. */
		const en = {
			nav: "YOLO Approval",
			chip: "YOLO status",
			sectionIntro: "Configure how YOLO mode auto-judges sandbox escalation approval requests.",
			loadError: "Could not load YOLO mode settings.",
			conflict: "The settings changed on the server. Reloading your edits — please review and retry.",
			rejected: "The change was rejected by the settings provider.",
			fatal: "Could not save: {message}",
			preset: "Preset",
			presetHint: "off | strict | balanced | permissive | yolo | custom",
			modes: "Modes",
			modesHint: "Valid sandbox modes YOLO judges (workspace-write, danger-full-access…)",
			workspaceWrite: "workspace-write",
			dangerFullAccess: "danger-full-access",
			judge: "Judge",
			provider: "Provider",
			model: "Model",
			systemPrompt: "System prompt",
			timeoutMs: "Timeout (ms)",
			maxTokens: "Max tokens",
			concurrency: "Concurrency",
			levels: "Levels (JSON)",
			levelsHint: "{\"tools\": {…}, \"<mode>\": \"allow|judge|delegate|deny\"}",
			invalidLevelsJson: "levels is not valid JSON",
			save: "Save",
			saved: "Saved",
			saveFailed: "Save failed",
			statsTotal: "Total",
			statsAllowed: "Allowed",
			statsRejected: "Rejected",
			statsDelegated: "Delegated",
			refresh: "Refresh",
			close: "Close",
			tableTime: "Time",
			tableTool: "Tool",
			tableTarget: "Target",
			tableDecision: "Decision",
			tableOutcome: "Outcome",
			tableReason: "Reason",
			recentEmpty: "No decisions yet."
		};
		/** Chinese dictionary. */
		const zh = {
			nav: "YOLO 审批",
			chip: "YOLO 状态",
			sectionIntro: "配置 YOLO 模式如何自动裁决沙箱升权审批申请。",
			loadError: "无法加载 YOLO 模式设置。",
			conflict: "服务端设置已变更。已重新加载你的编辑——请复核并重试。",
			rejected: "更改被设置提供方拒绝。",
			fatal: "无法保存：{message}",
			preset: "预设",
			presetHint: "off | strict | balanced | permissive | yolo | custom",
			modes: "模式",
			modesHint: "由 YOLO 裁决的有效沙箱模式（workspace-write、danger-full-access…）",
			workspaceWrite: "workspace-write",
			dangerFullAccess: "danger-full-access",
			judge: "裁判",
			provider: "供应商",
			model: "模型",
			systemPrompt: "系统提示词",
			timeoutMs: "超时（毫秒）",
			maxTokens: "最大令牌",
			concurrency: "并发",
			levels: "层级表（JSON）",
			levelsHint: "{\"tools\": {…}, \"<mode>\": \"allow|judge|delegate|deny\"}",
			invalidLevelsJson: "levels 不是合法 JSON",
			save: "保存",
			saved: "已保存",
			saveFailed: "保存失败",
			statsTotal: "总数",
			statsAllowed: "放行",
			statsRejected: "拒绝",
			statsDelegated: "转人工",
			refresh: "刷新",
			close: "关闭",
			tableTime: "时间",
			tableTool: "工具",
			tableTarget: "目标模式",
			tableDecision: "决策",
			tableOutcome: "结果",
			tableReason: "理由",
			recentEmpty: "暂无裁决记录。"
		};
		//#endregion
		//#region src/client/store-logic.js
		/**
		* Pure settings-write logic for the YOLO mode client (no React, no wire).
		* Everything here is a function of its inputs so the revision state machine,
		* path-op construction, and conflict handling are unit-testable in a plain
		* node environment.
		*
		* The persisted settings section mirrors the Host schema (lib/settings.js):
		*   {
		*     preset?, modes?, levels?, judge?: { provider?, model?, systemPrompt?,
		*     timeoutMs?, maxTokens?, concurrency? }, includeSubagents?, auditFile?
		*   }
		*/
		/**
		* Normalize an optional string: blank/whitespace becomes undefined (so an
		* empty field clears the user override back to the composition base).
		*/
		function optional(value) {
			if (value === void 0) return void 0;
			const trimmed = value.trim();
			return trimmed.length === 0 ? void 0 : trimmed;
		}
		/**
		* Build the path ops that (re)set one scalar configuration field. `set` writes
		* the value at the path, creating intermediate objects; `unset` removes the
		* user override so the field falls back to the composition base.
		*/
		function setFieldOps(path, value) {
			return [{
				op: "set",
				path: [...path],
				value
			}];
		}
		function unsetFieldOps(path) {
			return [{
				op: "unset",
				path: [...path]
			}];
		}
		/**
		* Ops to save the whole preset selection. Always writes the preset so a "save"
		* on an unmodified form is idempotent with the host.
		*/
		function presetOps(preset) {
			return setFieldOps(["preset"], preset);
		}
		/** Ops to save the modes list (workspace-write / danger-full-access …). */
		function modesOps(modes) {
			return setFieldOps(["modes"], modes);
		}
		/**
		* Ops to save the whole levels table. levels.tools can override any preset per
		* tool; levels[targetMode] only takes effect when preset === 'custom'. The
		* parsed object replaces the section wholesale at ['levels'].
		*/
		function levelsOps(levels) {
			return setFieldOps(["levels"], levels);
		}
		/**
		* Ops to save one judge field. An empty string (or undefined resolved value)
		* becomes an unset so the judge override is cleared back to defaults.
		*/
		function judgeFieldOps(stored, path, value) {
			const normalized = optional(value);
			if (normalized === stored) return [];
			if (normalized === void 0) return unsetFieldOps(path);
			return setFieldOps(path, normalized);
		}
		/**
		* The revision state machine. A successful mutate returns the next revision;
		* a conflict keeps the stale revision and marks `conflicted` so the store
		* reloads before the user retries.
		*/
		function advanceRevision(state, serverRevision) {
			return {
				revision: serverRevision,
				conflicted: false
			};
		}
		/** Mark a conflict: keep the stale revision (the editor must reload). */
		function markConflict(state) {
			return {
				revision: state.revision,
				conflicted: true
			};
		}
		/** Rebase after a reload picked up the fresh namespace view. */
		function adoptRevision(_state, freshRevision) {
			return {
				revision: freshRevision,
				conflicted: false
			};
		}
		/**
		* Classification of a settings.mutate failure for the UI's conflict handling.
		* `settings-conflict` → 'conflict' (reload and review); `settings-rejected` or
		* `schema-validation` → 'rejected' (show the message); everything else fatal.
		*/
		function classifyMutateError(code, _message) {
			if (code === "settings-conflict") return "conflict";
			if (code === "settings-rejected" || code === "schema-validation") return "rejected";
			return "fatal";
		}
		//#endregion
		//#region src/client/store.js
		/**
		* YOLO mode client page store: one snapshot joining the plugin's settings
		* namespace (`settingsView`, resolved `view`) and its live status view
		* (`statusView`: preset, judgeConfigured, stats, recent). The Host stays the
		* single fact source: every write travels as path ops through the bridge's
		* settingsMutate endpoint with an expectedRevision optimistic lock, and pushed
		* invalidations (settings/document-updated, connection/reset) refresh the page.
		*
		* The store is a bare observable (implements subscribe/getSnapshot) so it can
		* be bound directly by `bindSnapshotSelector` (dsh-client-web-react); the
		* popup open/closed flag is also held here so the chip and the overlay share
		* one source of truth.
		*/
		/** Channel + endpoints under the plugin's self-published bridge. */
		const YOLO_RPC_CHANNEL = "/yolo-mode";
		const YOLO_RPC_VIEW = "settingsView";
		const YOLO_RPC_STATUS = "statusView";
		const YOLO_RPC_MUTATE = "settingsMutate";
		/** Initial snapshot returned by a freshly constructed store. */
		function initialYoloState() {
			return {
				status: "idle",
				view: void 0,
				statusInfo: void 0,
				revision: 0,
				conflicted: false,
				writable: true,
				error: void 0,
				open: false
			};
		}
		/**
		* The settings/status page controller (one per client surface).
		*
		* @param {object} wire - { rpc } where rpc.call(channel, endpoint, payload)
		*   resolves to { ok: true, value } | { ok: false, error }.
		*/
		var YoloStore = class {
			/**
			* @param {object} options
			* @param {{ call: (channel: string, endpoint: string, payload: any) => Promise<any> }} options.rpc
			*/
			constructor({ rpc }) {
				this.rpc = rpc;
				this._state = initialYoloState();
				this._listeners = /* @__PURE__ */ new Set();
				this._generation = 0;
			}
			/** The current immutable snapshot (stable reference until the next change). */
			getSnapshot() {
				return this._state;
			}
			/** Subscribe to snapshot changes; returns an unsubscribe. */
			subscribe(listener) {
				this._listeners.add(listener);
				return () => {
					this._listeners.delete(listener);
				};
			}
			/** Apply a partial patch to the snapshot and synchronously notify listeners. */
			set(partial) {
				this._state = Object.assign({}, this._state, partial);
				for (const listener of [...this._listeners]) listener();
			}
			/** Toggle the popup open/closed flag (shared by chip and overlay). */
			togglePopup() {
				this.set({ open: !this._state.open });
			}
			/**
			* Call one bridge endpoint over the connection's generic RPC channel.
			* Returns the RpcResult ({ ok: true, value } | { ok: false, error }).
			*/
			async _call(endpoint, payload) {
				const result = await this.rpc.call(YOLO_RPC_CHANNEL, endpoint, payload);
				if (result === null || typeof result !== "object" || !("ok" in result)) return {
					ok: false,
					error: {
						code: "internal",
						message: "bridge returned a malformed result"
					}
				};
				return result;
			}
			/** Error code of an RPC error branch, when present. */
			_errorCode(error) {
				if (error !== null && typeof error === "object" && typeof error.code === "string") return error.code;
			}
			/**
			* Refresh the whole page snapshot: settings view + live status view. On a
			* success whose view is present, adopt its revision and go ready; any failure
			* flips status to 'error' recording the first error code.
			*/
			async load() {
				const generation = ++this._generation;
				this.set({
					status: "loading",
					error: void 0
				});
				const [viewResult, statusResult] = await Promise.all([this._call(YOLO_RPC_VIEW, {}), this._call(YOLO_RPC_STATUS, {})]);
				if (generation !== this._generation) return;
				if (!viewResult.ok || !statusResult.ok) {
					const code = this._errorCode(!viewResult.ok ? viewResult.error : statusResult.error);
					this.set({
						status: "error",
						error: code === void 0 ? true : code,
						conflicted: false
					});
					return;
				}
				const view = viewResult.value.view;
				const next = {
					status: "ready",
					view,
					statusInfo: statusResult.value,
					conflict: false,
					error: void 0
				};
				if (viewResult.value.writable !== void 0) next.writable = viewResult.value.writable;
				if (view !== void 0 && view !== null) next.revision = typeof view.revision === "number" ? view.revision : 0;
				this.set(Object.assign({ conflicted: false }, next));
			}
			/**
			* Run one mutate and update the snapshot's revision. Returns the failure
			* kind ('conflict' | 'rejected' | 'fatal') plus a message, or undefined on
			* success.
			*
			*   - ok            → advanceRevision + reload
			*   - conflict      → markConflict + reload (fresh view, user reviews)
			*   - rejected/fatal→ record error, do NOT reload
			*
			* @param {import('./store-logic.js').SettingsPathOpViewLike[]} ops
			* @returns {Promise<{ ok: true } | { ok: false, kind: string, code?: string }>}
			*/
			async mutate(ops) {
				const state = this._state;
				const result = await this._call(YOLO_RPC_MUTATE, {
					ns: "yolo-mode",
					ops,
					expectedRevision: state.revision
				});
				if (result.ok) {
					const value = result.value;
					const serverRevision = value && typeof value.revision === "number" ? value.revision : state.revision;
					this._state = Object.assign({}, this._state, advanceRevision({
						revision: state.revision,
						conflicted: state.conflicted
					}, serverRevision));
					for (const listener of [...this._listeners]) listener();
					await this.load();
					return { ok: true };
				}
				const code = this._errorCode(result.error);
				const kind = classifyMutateError(code, void 0);
				if (kind === "conflict") {
					this._state = Object.assign({}, this._state, markConflict({
						revision: state.revision,
						conflicted: state.conflicted
					}));
					for (const listener of [...this._listeners]) listener();
					await this.load();
				} else this.set({
					conflicted: false,
					error: code === void 0 ? "settings-rejected" : code
				});
				return {
					ok: false,
					kind,
					code
				};
			}
			/** Rebase the revision from a freshly loaded view without a full load. */
			adoptRevision(freshRevision) {
				this.set(adoptRevision({
					revision: this._state.revision,
					conflicted: this._state.conflicted
				}, freshRevision));
			}
		};
		//#endregion
		//#region src/client/ui/SettingsSection.js
		/**
		* YOLO mode settings section (slot `settings.section`). Renders the resolved
		* configuration (view.value) into a form and saves via path ops through
		* store.mutate with an optimistic-revision lock. Everything is React.createElement
		* + inline styles (no JSX, no CSS modules).
		*
		* Draft-sync pattern mirrors the reference DefaultModelRow
		* (dsh-subagents-options): the draft initializes once from the view and is
		* re-seeded only by a useEffect on the exact leaf values we edit, skipped while
		* a save is in flight. No render-time patching, so a mid-edit is never
		* clobbered and a save always reflects the server truth afterwards.
		*/
		const PRESETS = [
			"off",
			"strict",
			"balanced",
			"permissive",
			"yolo",
			"custom"
		];
		const MODE_OPTIONS = [{
			id: "workspace-write",
			key: "workspaceWrite"
		}, {
			id: "danger-full-access",
			key: "dangerFullAccess"
		}];
		/** Form draft: strings for text/number fields, array for modes, string for levels. */
		function draftFromView(view, t) {
			const value = view && view.value != null ? view.value : {};
			const judge = value.judge && typeof value.judge === "object" ? value.judge : {};
			return {
				preset: typeof value.preset === "string" ? value.preset : "balanced",
				modes: Array.isArray(value.modes) ? value.modes.slice() : [],
				judgeProvider: typeof judge.provider === "string" ? judge.provider : "",
				judgeModel: typeof judge.model === "string" ? judge.model : "",
				judgeSystemPrompt: typeof judge.systemPrompt === "string" ? judge.systemPrompt : "",
				judgeTimeoutMs: typeof judge.timeoutMs === "number" ? String(judge.timeoutMs) : "",
				judgeMaxTokens: typeof judge.maxTokens === "number" ? String(judge.maxTokens) : "",
				judgeConcurrency: typeof judge.concurrency === "number" ? String(judge.concurrency) : "",
				levels: serializeLevels(value.levels, t)
			};
		}
		/** Pretty-print the levels object, or '' when absent. */
		function serializeLevels(levels, t) {
			if (levels === void 0 || levels === null) return "";
			try {
				return JSON.stringify(levels, null, 2);
			} catch {
				return "";
			}
		}
		/** Styles (inline). */
		const styles = {
			root: {
				display: "flex",
				flexDirection: "column",
				gap: 12
			},
			intro: {
				margin: 0,
				color: "#6b7280",
				fontSize: 13,
				lineHeight: "18px"
			},
			card: {
				border: "1px solid #e5e7eb",
				borderRadius: 10,
				padding: 12,
				display: "flex",
				flexDirection: "column",
				gap: 10,
				backgroundColor: "#f8fafc"
			},
			row: {
				display: "flex",
				flexDirection: "column",
				gap: 4
			},
			fieldLabel: {
				color: "#374151",
				fontSize: 12
			},
			select: {
				backgroundColor: "#ffffff",
				color: "#111827",
				border: "1px solid #cbd5e1",
				borderRadius: 6,
				padding: "6px 8px",
				fontSize: 13
			},
			input: {
				backgroundColor: "#ffffff",
				color: "#111827",
				border: "1px solid #cbd5e1",
				borderRadius: 6,
				padding: "6px 8px",
				fontSize: 13,
				width: "100%",
				boxSizing: "border-box"
			},
			textarea: {
				backgroundColor: "#ffffff",
				color: "#111827",
				border: "1px solid #cbd5e1",
				borderRadius: 6,
				padding: "6px 8px",
				fontSize: 13,
				width: "100%",
				boxSizing: "border-box",
				minHeight: 90,
				fontFamily: "monospace"
			},
			modesRow: {
				display: "flex",
				flexDirection: "column",
				gap: 6
			},
			modeLabel: {
				display: "flex",
				alignItems: "center",
				gap: 6,
				color: "#374151",
				fontSize: 13
			},
			grid: {
				display: "grid",
				gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
				gap: 8
			},
			primaryButton: {
				backgroundColor: "#2563eb",
				color: "#ffffff",
				border: "none",
				borderRadius: 6,
				padding: "6px 14px",
				fontSize: 13,
				cursor: "pointer"
			},
			primaryDisabled: {
				opacity: .5,
				cursor: "not-allowed"
			},
			hint: {
				margin: 0,
				color: "#6b7280",
				fontSize: 11
			},
			result: {
				fontSize: 12,
				lineHeight: "16px"
			},
			resultOk: { color: "#16a34a" },
			resultErr: { color: "#dc2626" }
		};
		/**
		* The YOLO settings section.
		*
		* @param {object} props - slot-delivered inject face: { store, useSnapshot, t }
		*   plus optional ownerProps.close.
		*/
		function SettingsSection(props) {
			const { store, useSnapshot, t, close } = props;
			if (store === void 0 || useSnapshot === void 0 || t === void 0) return null;
			return ReactSection({
				store,
				useSnapshot,
				t,
				close
			});
		}
		function ReactSection({ store, useSnapshot, t, close }) {
			const state = useSnapshot((s) => s);
			(0, react.useEffect)(() => {
				store.load();
			}, [store]);
			const view = state.view;
			const writable = state.writable;
			const [draft, setDraft] = (0, react.useState)(() => draftFromView(view, t));
			const [busy, setBusy] = (0, react.useState)(false);
			const [failure, setFailure] = (0, react.useState)(void 0);
			const [done, setDone] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				if (busy) return;
				setDraft(draftFromView(view, t));
			}, [
				view?.value?.preset,
				view?.value?.modes,
				view?.value?.levels,
				view?.value?.judge?.provider,
				view?.value?.judge?.model,
				view?.value?.judge?.systemPrompt,
				view?.value?.judge?.timeoutMs,
				view?.value?.judge?.maxTokens,
				view?.value?.judge?.concurrency
			]);
			const levelsInvalid = !parseLevels(draft.levels).ok && trimToNull(draft.levels) != null;
			/** Map a store.mutate failure outcome to a user-facing message. */
			const kindMessage = (out) => {
				if (out.kind === "conflict") return t("conflict");
				if (out.kind === "rejected") return t("rejected");
				return t("fatal");
			};
			const save = async () => {
				setBusy(true);
				setFailure(void 0);
				setDone(false);
				try {
					const ops = buildOps(view, draft, t);
					const out = await store.mutate(ops);
					if (!out.ok) setFailure(kindMessage(out));
					else setDone(true);
				} finally {
					setBusy(false);
				}
			};
			const toggleMode = (id) => {
				const next = draft.modes.includes(id) ? draft.modes.filter((m) => m !== id) : draft.modes.concat([id]);
				setDraft(Object.assign({}, draft, { modes: next }));
				setDone(false);
				setFailure(void 0);
			};
			const setField = (name, value) => {
				setDraft(Object.assign({}, draft, { [name]: value }));
				setDone(false);
				setFailure(void 0);
			};
			if (state.status === "error") return (0, react.createElement)("div", { style: styles.root }, (0, react.createElement)("p", { style: styles.intro }, t("loadError") + (typeof state.error === "string" ? ": " + state.error : "")), (0, react.createElement)("button", {
				style: Object.assign({}, styles.primaryButton, styles.primaryDisabled),
				onClick: () => void store.load()
			}, t("refresh")));
			if (state.status !== "ready") return (0, react.createElement)("div", { style: styles.root }, (0, react.createElement)("p", { style: styles.intro }, t("sectionIntro")));
			return (0, react.createElement)("div", { style: styles.root }, (0, react.createElement)("p", { style: styles.intro }, t("sectionIntro")), (0, react.createElement)("div", { style: styles.card }, (0, react.createElement)("div", { style: styles.row }, (0, react.createElement)("label", { style: styles.fieldLabel }, t("preset")), (0, react.createElement)("select", {
				style: styles.select,
				value: draft.preset,
				onChange: (e) => setField("preset", e.target.value)
			}, PRESETS.map((p) => (0, react.createElement)("option", {
				key: p,
				value: p
			}, p))), (0, react.createElement)("p", { style: styles.hint }, t("presetHint"))), (0, react.createElement)("div", { style: styles.modesRow }, (0, react.createElement)("label", { style: styles.fieldLabel }, t("modes")), MODE_OPTIONS.map((m) => (0, react.createElement)("label", {
				key: m.id,
				style: styles.modeLabel
			}, (0, react.createElement)("input", {
				type: "checkbox",
				checked: draft.modes.includes(m.id),
				onChange: () => toggleMode(m.id)
			}), t(m.key))), (0, react.createElement)("p", { style: styles.hint }, t("modesHint"))), (0, react.createElement)("div", { style: styles.grid }, fieldInput(styles, t, draft, setField, "judgeProvider", "provider"), fieldInput(styles, t, draft, setField, "judgeModel", "model"), fieldInput(styles, t, draft, setField, "judgeTimeoutMs", "timeoutMs"), fieldInput(styles, t, draft, setField, "judgeMaxTokens", "maxTokens"), fieldInput(styles, t, draft, setField, "judgeConcurrency", "concurrency")), (0, react.createElement)("div", { style: styles.row }, (0, react.createElement)("label", { style: styles.fieldLabel }, t("systemPrompt")), (0, react.createElement)("textarea", {
				style: styles.textarea,
				value: draft.judgeSystemPrompt,
				onChange: (e) => setField("judgeSystemPrompt", e.target.value)
			})), (0, react.createElement)("div", { style: styles.row }, (0, react.createElement)("label", { style: styles.fieldLabel }, t("levels") + " · " + t("levelsHint")), (0, react.createElement)("textarea", {
				style: styles.textarea,
				value: draft.levels,
				onChange: (e) => setField("levels", e.target.value)
			}), levelsInvalid ? (0, react.createElement)("p", { style: Object.assign({}, styles.result, styles.resultErr) }, t("invalidLevelsJson")) : null), (0, react.createElement)("div", { style: {
				display: "flex",
				gap: 8,
				alignItems: "center"
			} }, (0, react.createElement)("button", {
				style: Object.assign({}, styles.primaryButton, !writable || busy || levelsInvalid ? styles.primaryDisabled : {}),
				disabled: !writable || busy || levelsInvalid,
				onClick: () => void save()
			}, t("save")), done ? (0, react.createElement)("span", { style: Object.assign({}, styles.result, styles.resultOk) }, t("saved")) : failure !== void 0 ? (0, react.createElement)("span", { style: Object.assign({}, styles.result, styles.resultErr) }, failure) : null, close !== void 0 ? (0, react.createElement)("button", {
				style: styles.primaryButton,
				onClick: () => close()
			}, t("close")) : null)));
		}
		function fieldInput(styles, t, draft, setField, name, labelKey) {
			return (0, react.createElement)("div", { style: styles.row }, (0, react.createElement)("label", { style: styles.fieldLabel }, t(labelKey)), (0, react.createElement)("input", {
				style: styles.input,
				value: draft[name],
				onChange: (e) => setField(name, e.target.value)
			}));
		}
		/** Parse the levels textarea, tolerating a blank/whitespace value (treated as none). */
		function parseLevels(text) {
			const trimmed = text == null ? "" : text.trim();
			if (trimmed.length === 0) return {
				ok: true,
				value: {}
			};
			try {
				return {
					ok: true,
					value: JSON.parse(trimmed)
				};
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
		function buildOps(view, draft, t) {
			const value = view && view.value != null ? view.value : {};
			const judge = value.judge && typeof value.judge === "object" ? value.judge : {};
			const ops = [];
			ops.push.apply(ops, presetOps(draft.preset));
			ops.push.apply(ops, modesOps(draft.modes));
			ops.push.apply(ops, judgeFieldOps(judge.provider, ["judge", "provider"], draft.judgeProvider));
			ops.push.apply(ops, judgeFieldOps(judge.model, ["judge", "model"], draft.judgeModel));
			ops.push.apply(ops, judgeFieldOps(judge.systemPrompt, ["judge", "systemPrompt"], draft.judgeSystemPrompt));
			const num = (raw, stored) => {
				const trimmed = trimToNull(raw);
				if (trimmed == null) return stored === void 0 ? void 0 : null;
				const n = Number(trimmed);
				return Number.isFinite(n) ? n : null;
			};
			const replaceField = (stored, path, valueOrNull) => {
				if (valueOrNull === null) {
					if (stored === void 0) return;
					ops.push.apply(ops, unsetFieldOps(path));
				} else if (valueOrNull !== void 0 && valueOrNull !== stored) ops.push.apply(ops, setFieldOps(path, valueOrNull));
			};
			replaceField(judge.timeoutMs, ["judge", "timeoutMs"], num(draft.judgeTimeoutMs, judge.timeoutMs));
			replaceField(judge.maxTokens, ["judge", "maxTokens"], num(draft.judgeMaxTokens, judge.maxTokens));
			replaceField(judge.concurrency, ["judge", "concurrency"], num(draft.judgeConcurrency, judge.concurrency));
			const levels = parseLevels(draft.levels).value;
			ops.push.apply(ops, levelsOps(levels));
			return ops;
		}
		//#endregion
		//#region src/client/ui/Chip.js
		/**
		* YOLO mode status chip (slot `conversation.input.left`). Shows "YOLO <preset>"
		* and toggles the shared popup via store.togglePopup().
		*/
		const chipStyle = {
			display: "inline-flex",
			alignItems: "center",
			gap: 6,
			padding: "4px 10px",
			borderRadius: 999,
			backgroundColor: "#ffffff",
			color: "#1d4ed8",
			border: "1px solid #93c5fd",
			fontSize: 12,
			cursor: "pointer",
			whiteSpace: "nowrap",
			userSelect: "none"
		};
		/** Status colour for the leading dot based on judge readiness. */
		function dotColor(statusInfo) {
			return statusInfo && statusInfo.judgeConfigured ? "#16a34a" : "#d97706";
		}
		/**
		* @param {object} props - slot-delivered { store, useSnapshot, t } (inject face).
		*/
		function Chip(props) {
			const store = props.store;
			const useSnapshot = props.useSnapshot;
			if (store === void 0 || useSnapshot === void 0) return null;
			return ChipLoaded({
				store,
				useSnapshot
			});
		}
		function ChipLoaded({ store, useSnapshot }) {
			(0, react.useEffect)(() => {
				store.load();
			}, [store]);
			const statusInfo = useSnapshot((s) => s).statusInfo;
			const preset = statusInfo && typeof statusInfo.preset === "string" ? statusInfo.preset : "…";
			return (0, react.createElement)("button", {
				style: chipStyle,
				title: "YOLO",
				onClick: () => store.togglePopup()
			}, (0, react.createElement)("span", { style: {
				width: 8,
				height: 8,
				borderRadius: 4,
				backgroundColor: dotColor(statusInfo),
				display: "inline-block"
			} }), "YOLO " + preset);
		}
		//#endregion
		//#region src/client/ui/Popup.js
		/**
		* YOLO mode status popup (slot `shell.overlay`). Renders null while the store's
		* open flag is false; otherwise a stats card plus the recent decisions table
		* (≤20, newest first) and a refresh button.
		*/
		const popupStyle = {
			position: "absolute",
			top: 56,
			right: 16,
			width: 520,
			maxWidth: "90vw",
			maxHeight: "70vh",
			overflow: "auto",
			backgroundColor: "#ffffff",
			color: "#111827",
			border: "1px solid #e5e7eb",
			borderRadius: 12,
			boxShadow: "0 12px 40px rgba(15,23,42,0.4)",
			padding: 14,
			display: "flex",
			flexDirection: "column",
			gap: 12,
			zIndex: 1e3
		};
		const headerStyle = {
			display: "flex",
			alignItems: "center",
			justifyContent: "space-between"
		};
		const statGrid = {
			display: "grid",
			gridTemplateColumns: "repeat(4, 1fr)",
			gap: 8
		};
		const statCell = {
			border: "1px solid #e5e7eb",
			borderRadius: 8,
			padding: "8px 6px",
			textAlign: "center",
			backgroundColor: "#f8fafc"
		};
		const statValue = {
			fontSize: 18,
			fontWeight: 600,
			color: "#111827"
		};
		const statLabel = {
			fontSize: 11,
			color: "#6b7280",
			marginTop: 2
		};
		const tableStyle = {
			width: "100%",
			borderCollapse: "collapse",
			fontSize: 12
		};
		const thStyle = {
			color: "#374151",
			textAlign: "left",
			padding: "4px 6px",
			borderBottom: "1px solid #e5e7eb",
			backgroundColor: "#f1f5f9",
			fontWeight: 500
		};
		const tdStyle = {
			padding: "4px 6px",
			borderBottom: "1px solid #e5e7eb",
			verticalAlign: "top"
		};
		const codeStyle = {
			fontFamily: "monospace",
			fontSize: 11,
			color: "#374151"
		};
		const primaryButton = {
			backgroundColor: "#2563eb",
			color: "#ffffff",
			border: "none",
			borderRadius: 6,
			padding: "5px 12px",
			fontSize: 12,
			cursor: "pointer"
		};
		/** Truncate long reason text for display. */
		function truncate(text, max) {
			if (typeof text !== "string") return "";
			return text.length > max ? text.slice(0, max) + "…" : text;
		}
		/**
		* @param {object} props - slot-delivered { store, useSnapshot, t }.
		*/
		function Popup(props) {
			const store = props.store;
			const useSnapshot = props.useSnapshot;
			const t = props.t;
			if (store === void 0 || useSnapshot === void 0 || t === void 0) return null;
			const state = useSnapshot((s) => s);
			if (!state.open) return null;
			const info = state.statusInfo;
			const stats = info && info.stats ? info.stats : {};
			const recent = info && Array.isArray(info.recent) ? info.recent.slice(0, 20) : [];
			return (0, react.createElement)("div", { style: popupStyle }, (0, react.createElement)("div", { style: headerStyle }, (0, react.createElement)("strong", {}, t("chip")), (0, react.createElement)("button", {
				style: primaryButton,
				onClick: () => void store.load()
			}, t("refresh"))), (0, react.createElement)("div", { style: statGrid }, statCellOf(t, "statsTotal", stats.total), statCellOf(t, "statsAllowed", stats.allowed), statCellOf(t, "statsRejected", stats.rejected), statCellOf(t, "statsDelegated", stats.delegated)), recent.length === 0 ? (0, react.createElement)("p", { style: {
				color: "#6b7280",
				fontSize: 12,
				margin: 0
			} }, t("recentEmpty")) : (0, react.createElement)("table", { style: tableStyle }, (0, react.createElement)("thead", {}, (0, react.createElement)("tr", {}, (0, react.createElement)("th", { style: thStyle }, t("tableTime")), (0, react.createElement)("th", { style: thStyle }, t("tableTool")), (0, react.createElement)("th", { style: thStyle }, t("tableTarget")), (0, react.createElement)("th", { style: thStyle }, t("tableDecision")), (0, react.createElement)("th", { style: thStyle }, t("tableOutcome")), (0, react.createElement)("th", { style: thStyle }, t("tableReason")))), (0, react.createElement)("tbody", {}, recent.map((row, idx) => tableRow(t, row, idx)))), (0, react.createElement)("div", { style: {
				display: "flex",
				justifyContent: "flex-end"
			} }, (0, react.createElement)("button", {
				style: primaryButton,
				onClick: () => store.togglePopup()
			}, t("close"))));
		}
		function statCellOf(t, key, value) {
			return (0, react.createElement)("div", { style: statCell }, (0, react.createElement)("div", { style: statValue }, value === void 0 || value === null ? "–" : String(value)), (0, react.createElement)("div", { style: statLabel }, t(key)));
		}
		function tableRow(t, row, idx) {
			return (0, react.createElement)("tr", { key: idx }, (0, react.createElement)("td", { style: tdStyle }, timeText(row.time)), (0, react.createElement)("td", { style: tdStyle }, row.toolName || "–"), (0, react.createElement)("td", { style: tdStyle }, (0, react.createElement)("span", { style: codeStyle }, row.targetMode || "–")), (0, react.createElement)("td", { style: tdStyle }, row.decision || "–"), (0, react.createElement)("td", { style: tdStyle }, row.outcome || "–"), (0, react.createElement)("td", { style: tdStyle }, truncate(row.reason, 48) || "–"));
		}
		function timeText(value) {
			if (typeof value === "string") return value;
			if (typeof value === "number") {
				const d = new Date(value);
				if (!Number.isNaN(d.getTime())) return d.toLocaleTimeString();
				return String(value);
			}
			return "–";
		}
		//#endregion
		//#region src/client/index.js
		/**
		* YOLO mode — browser half (DSH client plugin).
		*
		* Registers the `settings.section` page (id 'yolo-mode') that configures the
		* preset/modes/judge/levels, the `conversation.input.left` status chip, and the
		* `shell.overlay` stats/recent popup. Data flows through the connection's
		* generic RPC channel (/yolo-mode) into a snapshot store; writes travel as path
		* ops through settingsMutate with an optimistic-revision lock.
		*/
		/**
		* Services required by these slot registrations (dsh.client.inject is the same
		* short-name set): slots, locale, connection, remote.
		*/
		const inject = [
			"slots",
			"locale",
			"connection",
			"remote"
		];
		/**
		* Register the YOLO section/chip/popup once the slot declarations are on the
		* ledger, wire the store to the connection, and keep it fresh on every pushed
		* invalidation.
		*
		* @param {object} ctx - client cordis context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "yolo-mode: copy dictionaries");
			const connection = ctx.get("connection");
			if (connection === void 0 || connection === null) return;
			const t = ctx.locale.bind(NS);
			const store = new YoloStore({ rpc: connection.rpc });
			const useSnapshot = (0, _deepseek_ai_dsh_client_web_react.bindSnapshotSelector)(store);
			ctx.effect(() => {
				const refresh = (ns) => {
					if (ns !== void 0 && ns !== "yolo-mode") return;
					store.load();
				};
				const disposers = [ctx.remote == null ? () => {} : ctx.remote.$on("settings/document-updated", refresh), ctx.on("connection/reset", () => void store.load())];
				return () => {
					for (const dispose of disposers) if (dispose) dispose();
				};
			}, "yolo-mode: pushed invalidations");
			const injected = () => ({
				store,
				useSnapshot,
				t
			});
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "yolo-mode",
				order: 25,
				label: () => t("nav"),
				locale: NS,
				inject: injected
			}, SettingsSection));
			ctx.slots.inject("conversation.input.left", () => ctx.slots.register({
				name: "conversation.input.left",
				id: "yolo-mode-chip",
				order: 0,
				label: () => t("chip"),
				locale: NS,
				inject: injected
			}, Chip));
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "yolo-mode-popup",
				order: 0,
				label: () => t("chip"),
				locale: NS,
				inject: injected
			}, Popup));
		}
		//#endregion
		exports.NS = NS;
		exports.apply = apply;
		exports.en = en;
		exports.inject = inject;
		exports.zh = zh;
		
		return module.exports;
	}
});
