window.__ModuleLoader__.load({
	id: "dsh-yolo-mode",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
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
			providerEmpty: "Not configured",
			modelEmpty: "Not configured",
			presetLevels: "Levels table",
			presetPrompt: "Default prompt",
			presetErrorFallback: "Error fallback",
			presetUnsureFallback: "Unsure fallback",
			presetCustom: "per your levels table",
			save: "Save",
			saved: "Saved",
			saveFailed: "Save failed",
			statsTotal: "Total",
			statsAllowed: "Allowed",
			statsRejected: "Rejected",
			statsDelegated: "Delegated",
			refresh: "Refresh",
			close: "Close",
			openLog: "Open log",
			openLogBusy: "Opening…",
			openLogOk: "Log opened",
			openLogFail: "Could not open log",
			logNotFound: "The log file does not exist yet (no decisions recorded).",
			logPath: "Log file",
			pagePrev: "‹ Prev",
			pageNext: "Next ›",
			pageOf: "Page {current} / {total}",
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
			providerEmpty: "未配置",
			modelEmpty: "未配置",
			presetLevels: "层级表",
			presetPrompt: "默认提示词",
			presetErrorFallback: "错误回退",
			presetUnsureFallback: "不确定回退",
			presetCustom: "按你的层级表",
			save: "保存",
			saved: "已保存",
			saveFailed: "保存失败",
			statsTotal: "总数",
			statsAllowed: "放行",
			statsRejected: "拒绝",
			statsDelegated: "转人工",
			refresh: "刷新",
			close: "关闭",
			openLog: "打开日志",
			openLogBusy: "打开中…",
			openLogOk: "日志已打开",
			openLogFail: "无法打开日志",
			logNotFound: "日志文件尚不存在（还没有裁决记录）。",
			logPath: "日志文件",
			pagePrev: "‹ 上一页",
			pageNext: "下一页 ›",
			pageOf: "第 {current} / {total} 页",
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
		/** Ops to save the whole preset selection. Always writes the preset so a "save" on an unmodified form is idempotent. */
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
		* be bound directly by `bindSnapshotSelector` (see ./bind.js); the popup
		* open/closed flag is also held here so the chip and the overlay share one
		* source of truth.
		*/
		/** Channel + endpoints under the plugin's self-published bridge. */
		const YOLO_RPC_CHANNEL = "/yolo-mode";
		const YOLO_RPC_VIEW = "settingsView";
		const YOLO_RPC_STATUS = "statusView";
		const YOLO_RPC_MUTATE = "settingsMutate";
		const YOLO_RPC_OPEN_LOG = "openLogFile";
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
				open: false,
				/** Configurable provider directory (llm.providers). */
				providers: [],
				/** Model catalog groups (llm.models). */
				models: []
			};
		}
		/**
		* The settings/status page controller (one per client surface).
		*
		* @param {object} options
		* @param {{ call: (channel: string, endpoint: string, payload: any) => Promise<any> }} options.rpc
		*   rpc.call(channel, endpoint, payload) resolves to { ok: true, value } |
		*   { ok: false, error }.
		* @param {object|null} [options.llm] - optional `connection.api.llm` face
		*   ({ providers(), models() } returning { result: { ok, value } }); when null
		*   the directory stays empty and the judge fields fall back to free text.
		*/
		var YoloStore = class {
			constructor({ rpc, llm }) {
				this.rpc = rpc;
				this.llm = llm == null ? null : llm;
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
			* Fetch the optional LLM directory (provider list + model catalog) when the
			* store was constructed with an llm face. Directory failures are NOT fatal:
			* they leave the snapshot's providers/models empty without flipping status
			* to 'error' — only the settings/status bridge calls can do that.
			*/
			async _fetchLlmDirectory() {
				if (this.llm === null || this.llm === void 0) return {
					providers: [],
					models: []
				};
				let providers = [];
				let models = [];
				try {
					const response = await this.llm.providers({});
					const value = response && response.result && response.result.ok ? response.result.value : void 0;
					if (value && Array.isArray(value.providers)) providers = value.providers;
				} catch {
					providers = [];
				}
				try {
					const response = await this.llm.models({});
					const value = response && response.result && response.result.ok ? response.result.value : void 0;
					if (value && Array.isArray(value.groups)) models = value.groups;
				} catch {
					models = [];
				}
				return {
					providers,
					models
				};
			}
			/**
			* Refresh the whole page snapshot: settings view + live status view + the
			* optional LLM provider/model directory. On a success whose view is present,
			* adopt its revision and go ready; a settings/status failure flips status to
			* 'error' recording the first error code (the directory never does).
			*/
			async load() {
				const generation = ++this._generation;
				this.set({
					status: "loading",
					error: void 0
				});
				const [viewResult, statusResult, directory] = await Promise.all([
					this._call(YOLO_RPC_VIEW, {}),
					this._call(YOLO_RPC_STATUS, {}),
					this._fetchLlmDirectory()
				]);
				if (generation !== this._generation) return;
				if (!viewResult.ok || !statusResult.ok) {
					const code = this._errorCode(!viewResult.ok ? viewResult.error : statusResult.error);
					this.set({
						status: "error",
						error: code === void 0 ? true : code,
						conflicted: false,
						providers: directory.providers,
						models: directory.models
					});
					return;
				}
				const view = viewResult.value.view;
				const next = {
					status: "ready",
					view,
					statusInfo: statusResult.value,
					conflict: false,
					error: void 0,
					providers: directory.providers,
					models: directory.models
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
			/**
			* Ask the host to open the audit JSONL log file with the OS default
			* application. The host resolves the effective path (view.value.auditFile or
			* the tmp default) and returns { ok: true, value: { path } } on success, or
			* { ok: false, error: { code: 'log-not-found' | 'open-failed', … } }.
			*/
			async openLogFile() {
				return this._call(YOLO_RPC_OPEN_LOG, {});
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
		//#region src/client/presets.js
		/**
		* Static per-preset display data for the YOLO settings page: the level table
		* (workspace-write / danger-full-access policies), the judge error/unsure
		* fallbacks, and a one-sentence summary of the preset's default judge prompt.
		*
		* The level/fallback numbers mirror the Host policy table (docs/design.md §4
		* and lib/policy.js): only the non-custom presets carry fixed policies, while
		* `custom` reads everything from the user's levels table (marker 'custom'
		* tells the UI to render "per your levels table").
		*
		* This module is pure display data — nothing here participates in saving.
		*/
		/** Six presets in directory order, with their level table + prompt summary. */
		const PRESETS_INFO = [
			{
				id: "off",
				levels: {
					workspaceWrite: "delegate",
					dangerFullAccess: "delegate"
				},
				fallbackError: "delegate",
				fallbackUnsure: "delegate",
				prompt: "关闭：不自动裁决，所有升权申请转人工。"
			},
			{
				id: "strict",
				levels: {
					workspaceWrite: "judge",
					dangerFullAccess: "delegate"
				},
				fallbackError: "rejected",
				fallbackUnsure: "delegate",
				prompt: "最保守审计：workspace-write 从严裁决、danger-full-access 转人工，裁判出错一律拒绝。"
			},
			{
				id: "balanced",
				levels: {
					workspaceWrite: "judge",
					dangerFullAccess: "judge"
				},
				fallbackError: "delegate",
				fallbackUnsure: "delegate",
				prompt: "平衡（默认）：两档模式均由裁判依据事实裁决，存疑或出错转人工。"
			},
			{
				id: "permissive",
				levels: {
					workspaceWrite: "judge",
					dangerFullAccess: "judge"
				},
				fallbackError: "delegate",
				fallbackUnsure: "allowed-once",
				prompt: "宽松审计：理由合理且范围可接受即倾向放行，仅明显破坏性/供应链风险拒绝；不确定时放行。"
			},
			{
				id: "yolo",
				levels: {
					workspaceWrite: "allow",
					dangerFullAccess: "allow"
				},
				fallbackError: "delegate",
				fallbackUnsure: "delegate",
				prompt: "全力放行：所有升权申请自动允许。"
			},
			{
				id: "custom",
				levels: {
					workspaceWrite: "custom",
					dangerFullAccess: "custom"
				},
				fallbackError: "custom",
				fallbackUnsure: "custom",
				prompt: "自定义：按你的层级表裁决该工具+目标模式的策略，存疑按层级表回退。"
			}
		];
		/**
		* Look up one preset's display info.
		*
		* @param {string} id - preset id ('off' | 'strict' | 'balanced' | 'permissive' |
		*   'yolo' | 'custom').
		* @returns {object|null} the PRESETS_INFO entry, or null when unknown.
		*/
		function presetInfo(id) {
			return PRESETS_INFO.find((preset) => preset.id === id) || null;
		}
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
			resultErr: { color: "#dc2626" },
			presetInfo: {
				border: "1px solid #e5e7eb",
				borderRadius: 8,
				padding: "8px 10px",
				backgroundColor: "#f1f5f9",
				display: "flex",
				flexDirection: "column",
				gap: 6
			},
			presetTable: {
				display: "flex",
				flexDirection: "column",
				gap: 2
			},
			presetRow: {
				display: "flex",
				justifyContent: "space-between",
				gap: 8,
				fontSize: 12,
				color: "#374151"
			},
			presetValue: {
				color: "#6b7280",
				fontFamily: "monospace"
			},
			presetPromptText: {
				margin: 0,
				color: "#6b7280",
				fontSize: 12,
				lineHeight: "16px"
			}
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
			const statusInfo = state.statusInfo && typeof state.statusInfo === "object" ? state.statusInfo : {};
			const presetDefaults = statusInfo.presetDefaults && typeof statusInfo.presetDefaults === "object" ? statusInfo.presetDefaults : {};
			(0, react.useEffect)(() => {
				store.load();
			}, [store]);
			const view = state.view;
			const writable = state.writable;
			const [draft, setDraft] = (0, react.useState)(() => draftFromView(view, t));
			const [busy, setBusy] = (0, react.useState)(false);
			const [failure, setFailure] = (0, react.useState)(void 0);
			const [done, setDone] = (0, react.useState)(false);
			const providerOptions = (Array.isArray(state.providers) ? state.providers : []).filter((p) => p && typeof p.provider === "string" && p.provider !== "").map((p) => ({
				id: p.provider,
				label: p.displayName && typeof p.displayName === "string" && p.displayName !== "" ? p.displayName : void 0
			}));
			const providerGroup = (Array.isArray(state.models) ? state.models : []).find((g) => g && g.id === draft.judgeProvider);
			const modelOptions = providerGroup && Array.isArray(providerGroup.models) ? providerGroup.models.filter((m) => m && typeof m.id === "string" && m.id !== "").map((m) => ({
				id: m.id,
				label: m.name && typeof m.name === "string" && m.name !== "" ? m.name : void 0
			})) : [];
			/** Pick a provider; clear the model when it no longer belongs to it. */
			const setProvider = (value) => {
				const next = Object.assign({}, draft, { judgeProvider: value });
				const model = draft.judgeModel;
				if (model !== "" && !modelBelongsTo(value, model, state.models)) next.judgeModel = "";
				setDraft(next);
				setDone(false);
				setFailure(void 0);
			};
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
			/**
			* Preset change: switch the preset and pre-fill the judge system prompt and
			* the levels from the preset's defaults served in statusInfo (custom → clear
			* both so the user writes their own). Implemented as one combined draft
			* update: several setField calls computed from the same stale closure would
			* clobber each other under React's batched state updates.
			*/
			const changePreset = (value) => {
				const next = Object.assign({}, draft, { preset: value });
				if (value === "custom") {
					next.judgeSystemPrompt = "";
					next.levels = "";
				} else {
					const pd = presetDefaults[value];
					if (pd && typeof pd === "object") {
						next.judgeSystemPrompt = typeof pd.systemPrompt === "string" ? pd.systemPrompt : "";
						next.levels = pd.levels === void 0 || pd.levels === null ? "" : JSON.stringify(pd.levels, null, 2);
					}
				}
				setDraft(next);
				setDone(false);
				setFailure(void 0);
			};
			if (state.status === "error") return (0, react.createElement)("div", { style: styles.root }, (0, react.createElement)("p", { style: styles.intro }, t("loadError") + (typeof state.error === "string" ? ": " + state.error : "")), (0, react.createElement)("button", {
				style: Object.assign({}, styles.primaryButton, styles.primaryDisabled),
				onClick: () => void store.load()
			}, t("refresh")));
			if (state.status !== "ready") return (0, react.createElement)("div", { style: styles.root }, (0, react.createElement)("p", { style: styles.intro }, t("sectionIntro")));
			const preset = presetInfo(draft.preset);
			return (0, react.createElement)("div", { style: styles.root }, (0, react.createElement)("p", { style: styles.intro }, t("sectionIntro")), (0, react.createElement)("div", { style: styles.card }, (0, react.createElement)("div", { style: styles.row }, (0, react.createElement)("label", { style: styles.fieldLabel }, t("preset")), (0, react.createElement)("select", {
				style: styles.select,
				value: draft.preset,
				onChange: (e) => changePreset(e.target.value)
			}, PRESETS.map((p) => (0, react.createElement)("option", {
				key: p,
				value: p
			}, p))), (0, react.createElement)("p", { style: styles.hint }, t("presetHint"))), preset !== null ? presetInfoBlock(styles, t, preset) : null, (0, react.createElement)("div", { style: styles.modesRow }, (0, react.createElement)("label", { style: styles.fieldLabel }, t("modes")), MODE_OPTIONS.map((m) => (0, react.createElement)("label", {
				key: m.id,
				style: styles.modeLabel
			}, (0, react.createElement)("input", {
				type: "checkbox",
				checked: draft.modes.includes(m.id),
				onChange: () => toggleMode(m.id)
			}), t(m.key))), (0, react.createElement)("p", { style: styles.hint }, t("modesHint"))), (0, react.createElement)("div", { style: styles.grid }, fieldSelect(styles, t, draft, setProvider, "judgeProvider", "provider", providerOptions, t("providerEmpty")), judgeModelField(styles, t, draft, setField, modelOptions, t("modelEmpty")), fieldInput(styles, t, draft, setField, "judgeTimeoutMs", "timeoutMs"), fieldInput(styles, t, draft, setField, "judgeMaxTokens", "maxTokens"), fieldInput(styles, t, draft, setField, "judgeConcurrency", "concurrency")), (0, react.createElement)("div", { style: styles.row }, (0, react.createElement)("label", { style: styles.fieldLabel }, t("systemPrompt")), (0, react.createElement)("textarea", {
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
		/**
		* A labeled <select> whose first option is always the "unconfigured" empty
		* value, followed by the catalog options ({ id, label? }). The empty option
		* doubles as the "clear back to composition base" choice.
		*/
		function fieldSelect(styles, t, draft, onChange, name, labelKey, options, emptyLabel) {
			return (0, react.createElement)("div", { style: styles.row }, (0, react.createElement)("label", { style: styles.fieldLabel }, t(labelKey)), (0, react.createElement)("select", {
				style: styles.select,
				value: draft[name],
				onChange: (e) => onChange(e.target.value)
			}, (0, react.createElement)("option", {
				key: "empty",
				value: ""
			}, emptyLabel), options.map((o) => (0, react.createElement)("option", {
				key: o.id,
				value: o.id
			}, o.label != null && o.label !== "" ? o.label : o.id))));
		}
		/**
		* Judge model field: a catalog-driven <select> when the selected provider's
		* group lists models (and the draft value is one of them, or empty); a plain
		* text input when there is no directory (llm face absent / fetch failed /
		* unknown provider) or the stored value is unknown.
		*/
		function judgeModelField(styles, t, draft, setField, modelOptions, emptyLabel) {
			if (modelOptions.length === 0) return fieldInput(styles, t, draft, setField, "judgeModel", "model");
			if (!(draft.judgeModel === "" || modelOptions.some((o) => o.id === draft.judgeModel))) return fieldInput(styles, t, draft, setField, "judgeModel", "model");
			return fieldSelect(styles, t, draft, (v) => setField("judgeModel", v), "judgeModel", "model", modelOptions, emptyLabel);
		}
		/** Read-only per-preset hint block: level table + error/unsure fallbacks + prompt summary. */
		function presetInfoBlock(styles, t, preset) {
			return (0, react.createElement)("div", { style: styles.presetInfo }, (0, react.createElement)("div", { style: styles.row }, (0, react.createElement)("label", { style: styles.fieldLabel }, t("presetLevels")), (0, react.createElement)("div", { style: styles.presetTable }, presetRow(styles, t, t("workspaceWrite"), preset.levels.workspaceWrite), presetRow(styles, t, t("dangerFullAccess"), preset.levels.dangerFullAccess), presetRow(styles, t, t("presetErrorFallback"), preset.fallbackError), presetRow(styles, t, t("presetUnsureFallback"), preset.fallbackUnsure))), (0, react.createElement)("div", { style: styles.row }, (0, react.createElement)("label", { style: styles.fieldLabel }, t("presetPrompt")), (0, react.createElement)("p", { style: styles.presetPromptText }, preset.prompt)));
		}
		/** One row of the preset level table; the 'custom' marker reads the user's levels table. */
		function presetRow(styles, t, label, value) {
			return (0, react.createElement)("div", { style: styles.presetRow }, (0, react.createElement)("span", null, label), (0, react.createElement)("span", { style: styles.presetValue }, value === "custom" ? t("presetCustom") : value));
		}
		/**
		* True when modelId belongs to the provider's catalog group. When the provider
		* has no catalog group (unknown provider / directory missing) membership
		* cannot be judged — keep the value rather than clobbering a typed model.
		*/
		function modelBelongsTo(providerId, modelId, groups) {
			if (!providerId || !modelId) return true;
			const group = (Array.isArray(groups) ? groups : []).find((g) => g && g.id === providerId);
			if (!group || !Array.isArray(group.models)) return true;
			return group.models.some((m) => m && m.id === modelId);
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
		* (paged, PAGE_SIZE per page, newest first), an "open audit log" button, and a
		* refresh button.
		*
		* Guard/hook split mirrors SettingsSection: the outer component validates the
		* slot inject face, the inner component owns all hooks unconditionally.
		*/
		/** Rows per page of the recent-decisions table. */
		const PAGE_SIZE = 5;
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
		const headerButtons = {
			display: "flex",
			alignItems: "center",
			gap: 8
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
		const secondaryButton = {
			backgroundColor: "#ffffff",
			color: "#374151",
			border: "1px solid #cbd5e1",
			borderRadius: 6,
			padding: "5px 12px",
			fontSize: 12,
			cursor: "pointer"
		};
		const pagerButton = {
			backgroundColor: "#ffffff",
			color: "#2563eb",
			border: "1px solid #cbd5e1",
			borderRadius: 6,
			padding: "3px 10px",
			fontSize: 12,
			cursor: "pointer"
		};
		const pagerButtonDisabled = {
			opacity: .4,
			cursor: "not-allowed"
		};
		const captionStyle = {
			margin: 0,
			color: "#6b7280",
			fontSize: 11,
			lineHeight: "16px"
		};
		const logResultOk = { color: "#16a34a" };
		const logResultErr = { color: "#dc2626" };
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
			return ReactPopup({
				store,
				useSnapshot,
				t
			});
		}
		function ReactPopup({ store, useSnapshot, t }) {
			const state = useSnapshot((s) => s);
			const [page, setPage] = (0, react.useState)(0);
			const [logResult, setLogResult] = (0, react.useState)(void 0);
			const [logBusy, setLogBusy] = (0, react.useState)(false);
			const statusInfo = state.statusInfo && typeof state.statusInfo === "object" ? state.statusInfo : {};
			const recent = Array.isArray(statusInfo.recent) ? statusInfo.recent : [];
			const totalPages = Math.max(1, Math.ceil(recent.length / PAGE_SIZE));
			(0, react.useEffect)(() => {
				setPage(0);
			}, [totalPages]);
			(0, react.useEffect)(() => {
				if (!logResult || !logResult.ok) return;
				const timer = setTimeout(() => setLogResult(void 0), 4e3);
				return () => clearTimeout(timer);
			}, [logResult]);
			if (!state.open) return null;
			const info = state.statusInfo;
			const stats = info && info.stats ? info.stats : {};
			const auditFile = typeof statusInfo.auditFile === "string" && statusInfo.auditFile !== "" ? statusInfo.auditFile : void 0;
			const safePage = Math.min(page, totalPages - 1);
			const pageRows = recent.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
			const openLog = async () => {
				setLogBusy(true);
				setLogResult(void 0);
				try {
					setLogResult(await store.openLogFile());
				} catch (err) {
					setLogResult({
						ok: false,
						error: {
							code: "internal",
							message: err && err.message ? String(err.message) : String(err)
						}
					});
				} finally {
					setLogBusy(false);
				}
			};
			return (0, react.createElement)("div", { style: popupStyle }, (0, react.createElement)("div", { style: headerStyle }, (0, react.createElement)("strong", {}, t("chip")), (0, react.createElement)("div", { style: headerButtons }, (0, react.createElement)("button", {
				style: logBusy ? Object.assign({}, secondaryButton, { opacity: .6 }) : secondaryButton,
				onClick: () => void openLog(),
				title: auditFile !== void 0 ? auditFile : void 0
			}, logBusy ? t("openLogBusy") : t("openLog")), (0, react.createElement)("button", {
				style: primaryButton,
				onClick: () => void store.load()
			}, t("refresh")))), logResult !== void 0 ? (0, react.createElement)("p", { style: Object.assign({}, captionStyle, logResult.ok ? logResultOk : logResultErr) }, logResult.ok ? t("openLogOk") + (logResult.value && logResult.value.path ? ": " + logResult.value.path : "") : logMessage(t, logResult.error)) : auditFile !== void 0 ? (0, react.createElement)("p", { style: captionStyle }, t("logPath") + ": " + auditFile) : null, (0, react.createElement)("div", { style: statGrid }, statCellOf(t, "statsTotal", stats.total), statCellOf(t, "statsAllowed", stats.allowed), statCellOf(t, "statsRejected", stats.rejected), statCellOf(t, "statsDelegated", stats.delegated)), recent.length === 0 ? (0, react.createElement)("p", { style: {
				color: "#6b7280",
				fontSize: 12,
				margin: 0
			} }, t("recentEmpty")) : (0, react.createElement)("table", { style: tableStyle }, (0, react.createElement)("thead", {}, (0, react.createElement)("tr", {}, (0, react.createElement)("th", { style: thStyle }, t("tableTime")), (0, react.createElement)("th", { style: thStyle }, t("tableTool")), (0, react.createElement)("th", { style: thStyle }, t("tableTarget")), (0, react.createElement)("th", { style: thStyle }, t("tableDecision")), (0, react.createElement)("th", { style: thStyle }, t("tableOutcome")), (0, react.createElement)("th", { style: thStyle }, t("tableReason")))), (0, react.createElement)("tbody", {}, pageRows.map((row, idx) => tableRow(t, row, safePage * PAGE_SIZE + idx)))), totalPages > 1 ? (0, react.createElement)("div", { style: {
				display: "flex",
				alignItems: "center",
				justifyContent: "flex-end",
				gap: 8
			} }, (0, react.createElement)("button", {
				style: Object.assign({}, pagerButton, safePage === 0 ? pagerButtonDisabled : {}),
				disabled: safePage === 0,
				onClick: () => setPage(safePage - 1)
			}, t("pagePrev")), (0, react.createElement)("span", { style: {
				fontSize: 12,
				color: "#374151"
			} }, t("pageOf", {
				current: String(safePage + 1),
				total: String(totalPages)
			})), (0, react.createElement)("button", {
				style: Object.assign({}, pagerButton, safePage >= totalPages - 1 ? pagerButtonDisabled : {}),
				disabled: safePage >= totalPages - 1,
				onClick: () => setPage(safePage + 1)
			}, t("pageNext"))) : null, (0, react.createElement)("div", { style: {
				display: "flex",
				justifyContent: "flex-end"
			} }, (0, react.createElement)("button", {
				style: primaryButton,
				onClick: () => store.togglePopup()
			}, t("close"))));
		}
		/** User-facing message for a failed open-log attempt (by error code). */
		function logMessage(t, error) {
			const code = error && typeof error === "object" && typeof error.code === "string" ? error.code : void 0;
			const detail = error && typeof error === "object" && typeof error.message === "string" ? error.message : void 0;
			if (code === "log-not-found") return t("logNotFound") + (detail ? ": " + detail : "");
			return t("openLogFail") + (detail ? ": " + detail : "");
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
		//#region src/client/bind.js
		/**
		* uSES bridge: turns any bare observable snapshot source into a selector hook.
		*
		* DSH rc8 removed the `@deepseek-ai/dsh-client-web-react` package (its client
		* store-binding helpers were folded into the core slot kit). This is a local
		* copy of the same `bindSnapshotSelector` contract, implemented against the
		* `react` seed provided by the DSH client module table, so the plugin keeps
		* working on rc8+ without an extra runtime dependency.
		*/
		/**
		* Bind a bare observable source (subscribe/getSnapshot) to a selector hook.
		* The selector is applied to the snapshot on every render; identity stores can
		* simply pass `(s) => s`.
		*
		* @param store - snapshot source (must implement subscribe/getSnapshot).
		* @returns the selector hook.
		*/
		function bindSnapshotSelector(store) {
			const subscribe = (listener) => store.subscribe(listener);
			const getSnapshot = () => store.getSnapshot();
			return function useSelector(selector) {
				const select = selector ?? ((state) => state);
				return (0, react.useSyncExternalStore)(subscribe, () => select(getSnapshot()));
			};
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
		/** Services required by these slot registrations (dsh.client.inject). */
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
			const store = new YoloStore({
				rpc: connection.rpc,
				llm: connection.api ? connection.api.llm : null
			});
			const useSnapshot = bindSnapshotSelector(store);
			ctx.effect(() => {
				const refresh = (ns) => {
					if (ns !== void 0 && ns !== "yolo-mode") return;
					store.load();
				};
				const disposers = [
					ctx.remote == null ? () => {} : ctx.remote.$on("settings/document-updated", refresh),
					ctx.remote == null ? () => {} : ctx.remote.$on("llm/adapters-updated", () => void store.load()),
					ctx.on("connection/reset", () => void store.load())
				];
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
