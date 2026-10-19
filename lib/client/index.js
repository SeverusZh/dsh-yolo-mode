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
			chip: "YOLO status",
			configTitle: "YOLO configuration",
			sectionIntro: "Configure how YOLO mode auto-judges sandbox escalation approval requests.",
			loading: "Loading…",
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
			chip: "YOLO 状态",
			configTitle: "YOLO 配置",
			sectionIntro: "配置 YOLO 模式如何自动裁决沙箱升权审批申请。",
			loading: "加载中…",
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
		/**
		* Join the live provider routes (`remote.llm.listProviders`, rows `{id, name}`)
		* with the declared configurable providers
		* (`remote.llm.listConfigurableProviders`, rows `{provider, displayName, …}`)
		* into one directory of `{ provider, displayName }` rows the select consumes.
		* Declared entries lead (so a configured-but-not-yet-registered provider still
		* appears), then any registered route the declaration does not name. Mirrors
		* the official settings-models `joinProviderDirectory`.
		*/
		function joinProviderDirectory(registered, declared) {
			const routes = Array.isArray(registered) ? registered : [];
			const directory = Array.isArray(declared) ? declared : [];
			const rows = [];
			const named = /* @__PURE__ */ new Set();
			for (const entry of directory) {
				if (entry === null || typeof entry !== "object") continue;
				if (typeof entry.provider !== "string" || entry.provider === "") continue;
				named.add(entry.provider);
				rows.push({
					provider: entry.provider,
					displayName: typeof entry.displayName === "string" && entry.displayName !== "" ? entry.displayName : void 0,
					active: routes.some((route) => route && route.id === entry.provider)
				});
			}
			for (const route of routes) {
				if (route === null || typeof route !== "object") continue;
				if (typeof route.id !== "string" || route.id === "") continue;
				if (named.has(route.id)) continue;
				rows.push({
					provider: route.id,
					displayName: typeof route.name === "string" && route.name !== "" ? route.name : void 0,
					active: true
				});
			}
			return rows;
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
				/** Provider directory: remote.llm joined rows, or legacy llm.providers. */
				providers: [],
				/** Model catalog groups: remote.session.modelCatalog, or legacy llm.models. */
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
		* @param {object|null} [options.llm] - optional legacy `connection.api.llm` face
		*   ({ providers(), models() } returning { result: { ok, value } }); when null
		*   the directory stays empty and the judge fields fall back to free text.
		* @param {object|null} [options.remote] - optional client Remote service; when
		*   it carries an `llm` namespace the directory comes from
		*   `llm.listProviders()` + `llm.listConfigurableProviders()` (0.1.7+) and the
		*   model catalog from `session.modelCatalog()`. Falls back to `llm` when the
		*   Remote namespace is absent.
		*/
		var YoloStore = class {
			constructor({ rpc, llm, remote }) {
				this.rpc = rpc;
				this.llm = llm == null ? null : llm;
				this.remote = remote == null ? null : remote;
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
			* Fetch the optional LLM directory (provider list + model catalog).
			*
			* 0.1.7+ exposes it through the client Remote service: the provider directory
			* is the join of `remote.llm.listProviders()` (registered routes) and
			* `remote.llm.listConfigurableProviders()` (declared providers), and the model
			* catalog is `remote.session.modelCatalog().value.groups` — the same sources
			* the official settings-models page reads. Older hosts without a Remote `llm`
			* namespace fall back to the legacy `connection.api.llm` face.
			*
			* Directory failures are NOT fatal: they leave the snapshot's providers/models
			* empty without flipping status to 'error' — only the settings/status bridge
			* calls can do that.
			*/
			async _fetchLlmDirectory() {
				const fromRemote = await this._fetchRemoteDirectory();
				if (fromRemote !== void 0) return fromRemote;
				return await this._fetchLegacyDirectory();
			}
			/**
			* Read the directory from the client Remote service. Returns undefined when
			* no `remote.llm` namespace is present, so the caller can fall back.
			*/
			async _fetchRemoteDirectory() {
				let llm = null;
				try {
					llm = this.remote ? this.remote.llm : null;
				} catch {
					llm = null;
				}
				if (llm === null || llm === void 0) return void 0;
				let providers = [];
				let models = [];
				try {
					const [registered, declared] = await Promise.all([typeof llm.listProviders === "function" ? llm.listProviders() : void 0, typeof llm.listConfigurableProviders === "function" ? llm.listConfigurableProviders() : void 0]);
					providers = joinProviderDirectory(registered && registered.ok === true && Array.isArray(registered.value) ? registered.value : [], declared && declared.ok === true && Array.isArray(declared.value) ? declared.value : []);
				} catch {
					providers = [];
				}
				let session = null;
				try {
					session = this.remote ? this.remote.session : null;
				} catch {
					session = null;
				}
				if (session && typeof session.modelCatalog === "function") try {
					const response = await session.modelCatalog();
					const value = response && response.ok === true ? response.value : void 0;
					if (value && Array.isArray(value.groups)) models = value.groups;
				} catch {
					models = [];
				}
				return {
					providers,
					models
				};
			}
			/** Legacy directory read for hosts whose transport still exposes `api.llm`. */
			async _fetchLegacyDirectory() {
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
				let viewResult;
				let statusResult;
				let directory;
				try {
					[viewResult, statusResult, directory] = await Promise.all([
						this._call(YOLO_RPC_VIEW, {}),
						this._call(YOLO_RPC_STATUS, {}),
						this._fetchLlmDirectory()
					]);
				} catch (error) {
					if (generation !== this._generation) return;
					this.set({
						status: "error",
						error: error !== null && typeof error === "object" && typeof error.message === "string" ? error.message : true,
						conflicted: false
					});
					return;
				}
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
		//#region src/client/ui/ConfigForm.js
		/**
		* YOLO mode configuration form. Rendered on this plugin's own page in the DSH
		* plugin manager (插件列表 → dsh-yolo-mode), via the `plugins.bundle.config`
		* slot keyed by the package name (see ../index.js) — between the package
		* description and the component rows. The `settings.section` page was retired,
		* so this form is the single configuration surface for the plugin. It renders
		* the resolved configuration (view.value) and saves via path ops through
		* store.mutate with an optimistic-revision lock.
		*
		* Presentation: React.createElement + class names from the shared token
		* stylesheet (./styles.js). No hard-coded colours, one font/space scale and the
		* same card structure as the official settings pages.
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
		/**
		* The YOLO configuration form.
		*
		* Hosted by this plugin's own page in the plugin manager: registered into
		* `plugins.bundle.config` under the package name (see ../index.js). The page
		* dispatches `view`; a bundle page only ever asks for `page`, and a bundle may
		* hold several configuration entries, so the page passes NO host `form` — this
		* component owns its draft, validation and save path (the /yolo-mode bridge).
		*
		* @param {object} props - slot props `{ view? }` merged with the inject face
		*   `{ store, useSnapshot, t }`; an optional `close()` adds a dismiss control.
		*/
		function ConfigForm(props) {
			const { view, store, useSnapshot, t, close } = props;
			if (store === void 0 || useSnapshot === void 0 || t === void 0) return null;
			if (view === "summary") return null;
			return ReactSection({
				store,
				useSnapshot,
				t,
				close
			});
		}
		/** Section header shared by the ready, loading and error states. */
		function sectionHead(t, description) {
			return (0, react.createElement)("div", { className: "ym-head" }, (0, react.createElement)("h3", { className: "ym-title" }, t("configTitle")), (0, react.createElement)("p", { className: "ym-desc" }, description));
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
			if (state.status === "error") return (0, react.createElement)("div", { className: "ym-root" }, sectionHead(t, t("sectionIntro")), (0, react.createElement)("div", {
				className: "ym-error",
				role: "alert"
			}, (0, react.createElement)("p", { className: "ym-error-text" }, t("loadError") + (typeof state.error === "string" ? ": " + state.error : "")), (0, react.createElement)("button", {
				type: "button",
				className: "ym-btn",
				onClick: () => void store.load()
			}, t("refresh"))));
			if (state.status !== "ready") return (0, react.createElement)("div", { className: "ym-root" }, sectionHead(t, t("sectionIntro")), (0, react.createElement)("div", {
				className: "ym-loading",
				role: "status",
				"aria-live": "polite"
			}, (0, react.createElement)("span", { className: "ym-loading-text" }, t("loading")), (0, react.createElement)("div", { className: "ym-skeleton is-wide" }), (0, react.createElement)("div", { className: "ym-skeleton is-full" })));
			const preset = presetInfo(draft.preset);
			const statusText = done ? t("saved") : failure !== void 0 ? failure : null;
			return (0, react.createElement)("div", { className: "ym-root" }, sectionHead(t, t("sectionIntro")), (0, react.createElement)("section", { className: "ym-card" }, (0, react.createElement)("div", { className: "ym-card-head" }, (0, react.createElement)("h4", { className: "ym-card-title" }, t("preset")), (0, react.createElement)("p", { className: "ym-card-hint" }, t("presetHint"))), (0, react.createElement)("div", { className: "ym-field" }, (0, react.createElement)("label", {
				className: "ym-sr-only",
				id: "ym-preset-label",
				htmlFor: "ym-preset-select"
			}, t("preset")), (0, react.createElement)("select", {
				id: "ym-preset-select",
				"aria-labelledby": "ym-preset-label",
				className: "ym-select",
				value: draft.preset,
				onChange: (e) => changePreset(e.target.value)
			}, PRESETS.map((p) => (0, react.createElement)("option", {
				key: p,
				value: p
			}, p)))), preset !== null ? presetInfoBlock(t, preset) : null), (0, react.createElement)("section", { className: "ym-card" }, (0, react.createElement)("div", { className: "ym-card-head" }, (0, react.createElement)("h4", { className: "ym-card-title" }, t("modes")), (0, react.createElement)("p", { className: "ym-card-hint" }, t("modesHint"))), (0, react.createElement)("div", { className: "ym-check-row" }, (0, react.createElement)("label", { className: "ym-sr-only" }, t("modes")), MODE_OPTIONS.map((m) => (0, react.createElement)("label", {
				key: m.id,
				className: "ym-check"
			}, (0, react.createElement)("input", {
				type: "checkbox",
				checked: draft.modes.includes(m.id),
				onChange: () => toggleMode(m.id)
			}), t(m.key))))), (0, react.createElement)("section", { className: "ym-card" }, (0, react.createElement)("div", { className: "ym-card-head" }, (0, react.createElement)("h4", { className: "ym-card-title" }, t("judge"))), (0, react.createElement)("div", { className: "ym-grid" }, fieldSelect(t, draft, setProvider, "judgeProvider", "provider", providerOptions, t("providerEmpty")), judgeModelField(t, draft, setField, modelOptions, t("modelEmpty")), fieldInput(t, draft, setField, "judgeTimeoutMs", "timeoutMs"), fieldInput(t, draft, setField, "judgeMaxTokens", "maxTokens"), fieldInput(t, draft, setField, "judgeConcurrency", "concurrency")), (0, react.createElement)("div", { className: "ym-field" }, (0, react.createElement)("label", { className: "ym-label" }, t("systemPrompt")), (0, react.createElement)("textarea", {
				className: "ym-textarea",
				value: draft.judgeSystemPrompt,
				onChange: (e) => setField("judgeSystemPrompt", e.target.value)
			})), (0, react.createElement)("div", { className: "ym-field" }, (0, react.createElement)("label", { className: "ym-label" }, t("levels") + " · " + t("levelsHint")), (0, react.createElement)("textarea", {
				className: "ym-textarea ym-code",
				spellCheck: false,
				value: draft.levels,
				onChange: (e) => setField("levels", e.target.value)
			}), levelsInvalid ? (0, react.createElement)("p", { className: "ym-hint ym-status-err" }, t("invalidLevelsJson")) : null)), (0, react.createElement)("div", { className: "ym-actions" }, statusText !== null ? (0, react.createElement)("span", {
				className: "ym-status " + (done ? "ym-status-ok" : "ym-status-err"),
				role: "status"
			}, statusText) : null, (0, react.createElement)("button", {
				type: "button",
				className: "ym-btn ym-btn-primary",
				disabled: !writable || busy || levelsInvalid,
				onClick: () => void save()
			}, t("save")), close !== void 0 ? (0, react.createElement)("button", {
				type: "button",
				className: "ym-btn",
				onClick: () => close()
			}, t("close")) : null));
		}
		function fieldInput(t, draft, setField, name, labelKey) {
			return (0, react.createElement)("div", { className: "ym-field" }, (0, react.createElement)("label", { className: "ym-label" }, t(labelKey)), (0, react.createElement)("input", {
				className: "ym-input",
				value: draft[name],
				onChange: (e) => setField(name, e.target.value)
			}));
		}
		/**
		* A labeled <select> whose first option is always the "unconfigured" empty
		* value, followed by the catalog options ({ id, label? }). The empty option
		* doubles as the "clear back to composition base" choice.
		*/
		function fieldSelect(t, draft, onChange, name, labelKey, options, emptyLabel) {
			return (0, react.createElement)("div", { className: "ym-field" }, (0, react.createElement)("label", { className: "ym-label" }, t(labelKey)), (0, react.createElement)("select", {
				className: "ym-select",
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
		function judgeModelField(t, draft, setField, modelOptions, emptyLabel) {
			if (modelOptions.length === 0) return fieldInput(t, draft, setField, "judgeModel", "model");
			if (!(draft.judgeModel === "" || modelOptions.some((o) => o.id === draft.judgeModel))) return fieldInput(t, draft, setField, "judgeModel", "model");
			return fieldSelect(t, draft, (v) => setField("judgeModel", v), "judgeModel", "model", modelOptions, emptyLabel);
		}
		/** Read-only per-preset hint block: level table + error/unsure fallbacks + prompt summary. */
		function presetInfoBlock(t, preset) {
			return (0, react.createElement)("div", { className: "ym-preset" }, (0, react.createElement)("div", { className: "ym-preset-block" }, (0, react.createElement)("label", { className: "ym-preset-label" }, t("presetLevels")), (0, react.createElement)("div", { className: "ym-preset-rows" }, presetRow(t, t("workspaceWrite"), preset.levels.workspaceWrite), presetRow(t, t("dangerFullAccess"), preset.levels.dangerFullAccess), presetRow(t, t("presetErrorFallback"), preset.fallbackError), presetRow(t, t("presetUnsureFallback"), preset.fallbackUnsure))), (0, react.createElement)("div", { className: "ym-preset-block" }, (0, react.createElement)("label", { className: "ym-preset-label" }, t("presetPrompt")), (0, react.createElement)("p", { className: "ym-preset-prompt" }, preset.prompt)));
		}
		/** One row of the preset level table; the 'custom' marker reads the user's levels table. */
		function presetRow(t, label, value) {
			return (0, react.createElement)("div", { className: "ym-preset-row" }, (0, react.createElement)("span", null, label), (0, react.createElement)("span", { className: "ym-preset-value" }, value === "custom" ? t("presetCustom") : value));
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
		*
		* Presentation only: the pill, the status dot colour and the focus/hover states
		* come from the token stylesheet installed by the client entry (`styles.js`).
		*/
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
			const state = useSnapshot((s) => s);
			const statusInfo = state.statusInfo;
			const preset = statusInfo && typeof statusInfo.preset === "string" ? statusInfo.preset : "…";
			const ready = !!(statusInfo && statusInfo.judgeConfigured);
			return (0, react.createElement)("button", {
				type: "button",
				className: "ym-chip",
				title: "YOLO",
				"aria-haspopup": "dialog",
				"aria-expanded": state.open === true,
				onClick: () => store.togglePopup()
			}, (0, react.createElement)("span", {
				className: "ym-chip-dot",
				"data-ready": ready || void 0,
				"data-pending": ready ? void 0 : true,
				"aria-hidden": true
			}), (0, react.createElement)("span", { className: "ym-chip-preset" }, "YOLO " + preset));
		}
		//#endregion
		//#region src/client/ui/Popup.js
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
		/** Rows per page of the recent-decisions table. */
		const PAGE_SIZE = 5;
		/** Truncate long reason text for display. */
		function truncate(text, max) {
			if (typeof text !== "string") return "";
			return text.length > max ? text.slice(0, max) + "…" : text;
		}
		/**
		* Semantic kind of a decision outcome, used only to colour the outcome cell
		* with state tokens. Unknown values stay neutral.
		*/
		function outcomeKind(value) {
			const text = typeof value === "string" ? value.toLowerCase() : "";
			if (text === "") return void 0;
			if (text.includes("allow")) return "ok";
			if (text.includes("reject") || text.includes("deny")) return "err";
			if (text.includes("delegat") || text.includes("unsure") || text.includes("error")) return "warn";
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
			return (0, react.createElement)("div", {
				className: "ym-popup",
				role: "dialog",
				"aria-label": t("chip")
			}, (0, react.createElement)("div", { className: "ym-popup-head" }, (0, react.createElement)("h3", { className: "ym-popup-title" }, t("chip")), (0, react.createElement)("div", { className: "ym-popup-actions" }, (0, react.createElement)("button", {
				type: "button",
				className: "ym-btn ym-btn-sm",
				disabled: logBusy,
				onClick: () => void openLog(),
				title: auditFile !== void 0 ? auditFile : void 0
			}, logBusy ? t("openLogBusy") : t("openLog")), (0, react.createElement)("button", {
				type: "button",
				className: "ym-btn ym-btn-sm ym-btn-primary",
				onClick: () => void store.load()
			}, t("refresh")))), logResult !== void 0 ? (0, react.createElement)("p", { className: "ym-caption " + (logResult.ok ? "ym-caption-ok" : "ym-caption-err") }, logResult.ok ? t("openLogOk") + (logResult.value && logResult.value.path ? ": " + logResult.value.path : "") : logMessage(t, logResult.error)) : auditFile !== void 0 ? (0, react.createElement)("p", { className: "ym-caption" }, t("logPath") + ": " + auditFile) : null, (0, react.createElement)("div", { className: "ym-stats" }, statCellOf(t, "statsTotal", stats.total), statCellOf(t, "statsAllowed", stats.allowed), statCellOf(t, "statsRejected", stats.rejected), statCellOf(t, "statsDelegated", stats.delegated)), recent.length === 0 ? (0, react.createElement)("div", { className: "ym-empty" }, t("recentEmpty")) : (0, react.createElement)("div", { className: "ym-table-wrap" }, (0, react.createElement)("table", { className: "ym-table" }, (0, react.createElement)("thead", {}, (0, react.createElement)("tr", {}, (0, react.createElement)("th", {}, t("tableTime")), (0, react.createElement)("th", {}, t("tableTool")), (0, react.createElement)("th", {}, t("tableTarget")), (0, react.createElement)("th", {}, t("tableDecision")), (0, react.createElement)("th", {}, t("tableOutcome")), (0, react.createElement)("th", {}, t("tableReason")))), (0, react.createElement)("tbody", {}, pageRows.map((row, idx) => tableRow(t, row, safePage * PAGE_SIZE + idx))))), totalPages > 1 ? (0, react.createElement)("div", { className: "ym-pager" }, (0, react.createElement)("button", {
				type: "button",
				className: "ym-btn ym-btn-sm",
				disabled: safePage === 0,
				onClick: () => setPage(safePage - 1)
			}, t("pagePrev")), (0, react.createElement)("span", { className: "ym-page-text" }, t("pageOf", {
				current: String(safePage + 1),
				total: String(totalPages)
			})), (0, react.createElement)("button", {
				type: "button",
				className: "ym-btn ym-btn-sm",
				disabled: safePage >= totalPages - 1,
				onClick: () => setPage(safePage + 1)
			}, t("pageNext"))) : null, (0, react.createElement)("div", { className: "ym-popup-foot" }, (0, react.createElement)("button", {
				type: "button",
				className: "ym-btn ym-btn-sm",
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
			return (0, react.createElement)("div", { className: "ym-stat" }, (0, react.createElement)("div", { className: "ym-stat-value" }, value === void 0 || value === null ? "–" : String(value)), (0, react.createElement)("div", { className: "ym-stat-label" }, t(key)));
		}
		function tableRow(t, row, idx) {
			const kind = outcomeKind(row.outcome);
			return (0, react.createElement)("tr", { key: idx }, (0, react.createElement)("td", { className: "ym-time" }, timeText(row.time)), (0, react.createElement)("td", {}, row.toolName || "–"), (0, react.createElement)("td", {}, (0, react.createElement)("span", { className: "ym-code" }, row.targetMode || "–")), (0, react.createElement)("td", {}, row.decision || "–"), (0, react.createElement)("td", {}, (0, react.createElement)("span", {
				className: "ym-outcome",
				"data-kind": kind
			}, row.outcome || "–")), (0, react.createElement)("td", {
				className: "ym-reason",
				title: truncate(row.reason, 48) || void 0
			}, truncate(row.reason, 48) || "–"));
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
		//#region src/client/ui/styles.js
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
		const CSS_TAG_ID = "dsh-yolo-mode/ui.css";
		/** Class prefix kept unique enough to never collide with product CSS. */
		const CSS = [
			".ym-root{display:flex;flex-direction:column;gap:16px;color:var(--dsw-alias-label-primary);font:var(--dsw-font-xs-13);box-sizing:border-box}",
			".ym-root *,.ym-popup *{box-sizing:border-box}",
			".ym-head{display:flex;flex-direction:column;gap:4px;min-width:0}",
			".ym-title{margin:0;font:var(--dsw-font-s-14);font-weight:600;color:var(--dsw-alias-label-primary)}",
			".ym-desc{margin:0;font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-secondary)}",
			".ym-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}",
			".ym-card{display:flex;flex-direction:column;gap:12px;padding:14px 16px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md)}",
			".ym-card-head{display:flex;flex-direction:column;gap:2px;min-width:0}",
			".ym-card-title{margin:0;font:var(--dsw-font-xs-strong-13);font-weight:600;color:var(--dsw-alias-label-primary)}",
			".ym-card-hint{margin:0;font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-secondary)}",
			".ym-field{display:flex;flex-direction:column;gap:6px;min-width:0}",
			".ym-label{font:var(--dsw-font-xxs-strong-12);font-weight:500;color:var(--dsw-alias-label-primary)}",
			".ym-hint{margin:0;font:var(--dsw-font-xxxs-11);color:var(--dsw-alias-label-secondary);line-height:16px}",
			".ym-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;min-width:0}",
			".ym-input,.ym-select,.ym-textarea{width:100%;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);font:var(--dsw-font-xs-13);transition:border-color .15s ease,background-color .15s ease,color .15s ease}",
			".ym-input,.ym-select{height:30px;padding:0 10px}",
			".ym-select{cursor:pointer;appearance:auto}",
			".ym-textarea{min-height:88px;padding:8px 10px;line-height:20px;resize:vertical}",
			".ym-textarea.ym-code{font:var(--dsw-font-markdown-code);line-height:19px}",
			".ym-input:hover:not(:disabled),.ym-select:hover:not(:disabled),.ym-textarea:hover:not(:disabled){border-color:var(--dsw-alias-border-l3)}",
			".ym-input:focus,.ym-select:focus,.ym-textarea:focus{outline:none;border-color:var(--dsw-alias-brand-primary)}",
			".ym-input:focus-visible,.ym-select:focus-visible,.ym-textarea:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:1px}",
			".ym-input:disabled,.ym-select:disabled,.ym-textarea:disabled{opacity:.55;cursor:not-allowed}",
			".ym-input::placeholder,.ym-textarea::placeholder{color:var(--dsw-alias-label-tertiary)}",
			".ym-check-row{display:flex;flex-direction:column;gap:2px;min-width:0}",
			".ym-check{display:inline-flex;align-items:center;gap:8px;padding:4px 8px;margin:0 -8px;border-radius:var(--dsw-radius-sm);font:var(--dsw-font-xs-13);color:var(--dsw-alias-label-primary);cursor:pointer;transition:background-color .15s ease}",
			".ym-check:hover{background:var(--dsw-alias-interactive-bg-hover)}",
			".ym-check input{flex:none;width:15px;height:15px;margin:0;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}",
			".ym-check input:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}",
			".ym-preset{display:flex;flex-direction:column;gap:8px;padding:12px;background:var(--dsw-alias-bg-module-platform);border-radius:var(--dsw-radius-sm);min-width:0}",
			".ym-preset-block{display:flex;flex-direction:column;gap:4px;min-width:0}",
			".ym-preset-label{font:var(--dsw-font-xxxs-strong-11);font-weight:500;color:var(--dsw-alias-label-secondary);letter-spacing:.02em}",
			".ym-preset-rows{display:flex;flex-direction:column;gap:2px}",
			".ym-preset-row{display:flex;align-items:baseline;justify-content:space-between;gap:12px;font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-secondary)}",
			".ym-preset-value{font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;white-space:nowrap}",
			".ym-preset-prompt{margin:0;font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-secondary);line-height:18px}",
			".ym-actions{display:flex;align-items:center;justify-content:flex-end;gap:12px;flex-wrap:wrap;padding-top:4px}",
			".ym-status{font:var(--dsw-font-xxs-12);margin-right:auto;min-width:0}",
			".ym-status-ok{display:inline-flex;align-items:center;gap:6px;color:var(--dsw-alias-label-primary)}",
			".ym-status-ok::before{content:\"\";flex:none;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-success-primary)}",
			".ym-status-err{color:var(--dsw-alias-state-error-primary)}",
			".ym-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;flex:none;height:30px;padding:0 12px;color:var(--dsw-alias-label-primary);background:transparent;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);font:var(--dsw-font-xxs-strong-12);font-weight:500;cursor:pointer;transition:background-color .15s ease,border-color .15s ease,color .15s ease,opacity .15s ease}",
			".ym-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}",
			".ym-btn:active:not(:disabled){background:var(--dsw-alias-interactive-bg-active)}",
			".ym-btn:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}",
			".ym-btn:disabled{opacity:.5;cursor:not-allowed}",
			".ym-btn-primary{background:var(--dsw-alias-button-primary-fill);border-color:transparent;color:var(--dsw-alias-label-primary-foreground)}",
			".ym-btn-primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}",
			".ym-btn-primary:active:not(:disabled){background:var(--dsw-alias-button-primary-hover)}",
			".ym-error{display:flex;flex-direction:column;align-items:flex-start;gap:8px;padding:14px 16px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-md);box-shadow:var(--dsw-elevation-soft)}",
			".ym-error-text{margin:0;font:var(--dsw-font-xxs-12);color:var(--dsw-alias-state-error-primary);line-height:18px;word-break:break-word}",
			".ym-loading{display:flex;flex-direction:column;gap:8px;padding:4px 0}",
			".ym-loading-text{font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-secondary)}",
			".ym-skeleton{height:12px;border-radius:var(--dsw-radius-xs);background:var(--dsw-alias-bg-skeleton)}",
			".ym-skeleton.is-wide{width:60%}",
			".ym-skeleton.is-full{width:100%}",
			".ym-chip{display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 10px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:999px;color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xxxs-strong-11);font-weight:500;white-space:nowrap;cursor:pointer;user-select:none;transition:background-color .15s ease,border-color .15s ease,color .15s ease}",
			".ym-chip:hover{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l3);color:var(--dsw-alias-label-primary)}",
			".ym-chip:active{background:var(--dsw-alias-interactive-bg-active)}",
			".ym-chip:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}",
			".ym-chip-dot{flex:none;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-label-tertiary)}",
			".ym-chip-dot[data-ready]{background:var(--dsw-alias-state-success-primary)}",
			".ym-chip-dot[data-pending]{background:var(--dsw-alias-state-warn-primary)}",
			".ym-chip-preset{color:var(--dsw-alias-label-primary);font-weight:500;max-width:12em;overflow:hidden;text-overflow:ellipsis}",
			".ym-popup{position:absolute;top:56px;right:16px;z-index:1000;display:flex;flex-direction:column;gap:12px;width:560px;max-width:92vw;max-height:70vh;padding:16px;overflow:auto;color:var(--dsw-alias-label-primary);background:color-mix(in srgb,var(--dsw-alias-bg-overlay) 30%,var(--dsw-alias-bg-layer-2));border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-lg);box-shadow:var(--dsw-elevation-panel);font:var(--dsw-font-xs-13);animation:ym-popup-in .12s ease-out}",
			"@keyframes ym-popup-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}",
			".ym-popup-head{display:flex;align-items:center;justify-content:space-between;gap:12px;min-width:0}",
			".ym-popup-title{margin:0;font:var(--dsw-font-s-14);font-weight:600;color:var(--dsw-alias-label-primary)}",
			".ym-popup-actions{display:inline-flex;align-items:center;gap:8px;flex:none}",
			".ym-btn-sm{height:26px;padding:0 10px;border-radius:var(--dsw-radius-sm)}",
			".ym-caption{margin:0;font:var(--dsw-font-xxxs-11);color:var(--dsw-alias-label-tertiary);line-height:16px;word-break:break-all}",
			".ym-caption-ok{display:inline-flex;align-items:center;gap:6px;color:var(--dsw-alias-label-primary)}",
			".ym-caption-ok::before{content:\"\";flex:none;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-success-primary)}",
			".ym-caption-err{color:var(--dsw-alias-state-error-primary)}",
			".ym-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}",
			".ym-stat{display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 6px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm);text-align:center;min-width:0}",
			".ym-stat-value{font:var(--dsw-font-m-18);font-weight:600;color:var(--dsw-alias-label-primary);font-variant-numeric:tabular-nums;line-height:24px}",
			".ym-stat-label{font:var(--dsw-font-xxxs-11);color:var(--dsw-alias-label-secondary);white-space:nowrap}",
			".ym-table-wrap{display:flex;flex-direction:column;min-width:0;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm);overflow:auto}",
			".ym-table{width:100%;border-collapse:collapse;font:var(--dsw-font-xxs-12)}",
			".ym-table th{padding:6px 10px;text-align:left;font:var(--dsw-font-xxxs-strong-11);font-weight:500;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-2);border-bottom:1px solid var(--dsw-alias-border-l1);white-space:nowrap}",
			".ym-table td{padding:6px 10px;color:var(--dsw-alias-label-primary);border-bottom:1px solid var(--dsw-alias-border-l1);vertical-align:top;line-height:18px}",
			".ym-table tr:last-child td{border-bottom:none}",
			".ym-table tbody tr{transition:background-color .15s ease}",
			".ym-table tbody tr:hover{background:var(--dsw-alias-interactive-bg-hover)}",
			".ym-table .ym-time{color:var(--dsw-alias-label-secondary);white-space:nowrap;font-variant-numeric:tabular-nums}",
			".ym-table .ym-code{font:var(--dsw-font-markdown-code-block-small);color:var(--dsw-alias-label-secondary)}",
			".ym-table .ym-reason{color:var(--dsw-alias-label-secondary);max-width:16em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			".ym-outcome{display:inline-flex;align-items:center;gap:6px;font-weight:500}",
			".ym-outcome::before{content:\"\";flex:none;width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-label-tertiary)}",
			".ym-outcome[data-kind=ok]::before{background:var(--dsw-alias-state-success-primary)}",
			".ym-outcome[data-kind=err]::before{background:var(--dsw-alias-state-error-primary)}",
			".ym-outcome[data-kind=warn]::before{background:var(--dsw-alias-state-warn-primary)}",
			".ym-empty{display:flex;flex-direction:column;align-items:center;gap:6px;padding:20px 12px;border:1px dashed var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);color:var(--dsw-alias-label-secondary);font:var(--dsw-font-xxs-12);text-align:center}",
			".ym-pager{display:flex;align-items:center;justify-content:flex-end;gap:8px}",
			".ym-page-text{font:var(--dsw-font-xxs-12);color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}",
			".ym-popup-foot{display:flex;justify-content:flex-end;gap:8px}",
			"@media (max-width:480px){.ym-stats{grid-template-columns:repeat(2,minmax(0,1fr))}}",
			"@media (prefers-reduced-motion:reduce){.ym-popup{animation:none;transition:none}}"
		].join("\n");
		/**
		* Install the stylesheet once per document. Safe when called repeatedly (the
		* data attribute is the identity check) and a no-op outside the browser.
		*
		* @returns {() => void | undefined} a disposer removing the tag, or undefined
		*   when no stylesheet was installed (SSR / unit tests).
		*/
		function installStyles() {
			if (typeof document === "undefined" || document.head === void 0) return void 0;
			if (document.querySelector("style[data-plugin-css=\"" + CSS_TAG_ID + "\"]") !== null) return void 0;
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-yolo-mode";
			tag.dataset.pluginCss = CSS_TAG_ID;
			tag.textContent = CSS;
			document.head.appendChild(tag);
			return () => {
				tag.remove();
			};
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
		/**
		* Services required by these slot registrations (dsh.client.inject is the same
		* short-name set): slots, locale, connection, remote, remote.llm, remote.session.
		* Both dotted Remote namespaces are REQUIRED, not optional: the client Remote
		* proxy is inject-gated and throws `cannot get property "remote.X" without
		* inject` on an undeclared read — it does not return undefined. The store reads
		* `remote.llm` for the provider directory and `remote.session` for the model
		* catalog, so both must be declared here (and in package.json's dsh.client.inject).
		*/
		const inject = [
			"slots",
			"locale",
			"connection",
			"remote",
			"remote.llm",
			"remote.session"
		];
		/**
		* Register the YOLO chip/panel once the slot declarations are on the ledger,
		* wire the store to the connection, and keep it fresh on every pushed
		* invalidation.
		*
		* @param {object} ctx - client cordis context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "yolo-mode: copy dictionaries");
			ctx.effect(() => installStyles(), "yolo-mode: styles");
			const connection = ctx.get("connection");
			if (connection === void 0 || connection === null) return;
			const t = ctx.locale.bind(NS);
			const store = new YoloStore({
				rpc: connection.rpc,
				remote: ctx.get("remote") ?? null,
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
			ctx.slots.inject("plugins.bundle.config", () => ctx.slots.register({
				name: "plugins.bundle.config",
				key: "dsh-yolo-mode",
				locale: NS,
				inject: injected
			}, ConfigForm));
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
