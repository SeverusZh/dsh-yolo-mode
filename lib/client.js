/**
 * dsh-yolo-mode —— 客户端半边（lib/client.js）
 *
 * 手写的 window.__ModuleLoader__.load 工厂 bundle（design.md §11.3）。
 * 零构建、零依赖；bundle 内仅 require('react')，其余均由模块级 store 与
 * 全局 fetch 实现。全部 UI 用 React.createElement + 内联 style。
 *
 * 三个 slot 贡献：
 *   - conversation.input.left   → 'yolo-mode-chip'   状态 chip，点击切换弹窗
 *   - shell.overlay             → 'yolo-mode-popup'  统计面板 + 最近决策表
 *   - settings.section          → 'yolo-mode' (order 25)  受控表单设置页
 *
 * chip / popup / 表单联动共享同一模块级 store（同一 bundle 单例），
 * 组件通过 useStore hook（React.useState + useEffect 订阅）读取。
 */
window.__ModuleLoader__.load({
	id: "dsh-yolo-mode",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		const React = require("react");

		// ---- 常量 ----
		var PRESETS = ["off", "strict", "balanced", "permissive", "yolo", "custom"];
		var MODES = ["read-only", "workspace-write", "danger-full-access"];
		var STATUS_URL = "/plugins/yolo-mode/status";
		var CONFIG_URL = "/plugins/yolo-mode/config";

		// ---- 模块级 store（单例，供 chip / popup / 设置页联动） ----
		var store = {
			open: false,
			status: null,
			error: null,
			listeners: new Set(),
			set(partial) {
				let changed = false;
				for (const key in partial) {
					if (!Object.prototype.hasOwnProperty.call(partial, key)) continue;
					if (store[key] === partial[key]) continue;
					store[key] = partial[key];
					changed = true;
				}
				if (changed) {
					for (const fn of Array.from(store.listeners)) {
						try { fn(); } catch (err) { /* 订阅者异常不阻断其余刷新 */ }
					}
				}
			},
			notify() { this.set({}); },
			subscribe(fn) {
				store.listeners.add(fn);
				return function dispose() { store.listeners.delete(fn); };
			}
		};

		// ---- 通用 fetch 封装：GET 状态 / POST 配置 ----
		function loadStatus(patchStore) {
			return fetch(STATUS_URL)
				.then(function (res) { return res.json(); })
				.then(function (json) {
					if (patchStore !== false) store.set({ status: json, error: null });
					return json;
				})
				.catch(function (err) {
					if (patchStore !== false) store.set({ error: err });
					return null;
				});
		}

		// ---- useStore hook：订阅模块级 store 并返回最新对象 ----
		function useStore() {
			var tick = React.useState(0)[1];
			React.useEffect(function () {
				return store.subscribe(function () { tick(function (n) { return n + 1; }); });
			}, []);
			return store;
		}

		function truncate(value, len) {
			if (value === undefined || value === null) return "";
			var text = String(value);
			return text.length > len ? text.slice(0, len) + "…" : text;
		}

		// ---- 状态 chip（conversation.input.left） ----
		// 显示 'YOLO <preset>'，点击切换弹窗开关；挂载时拉取一次状态。
		function Chip() {
			useStore();
			var status = store.status || {};
			var preset = status.preset !== undefined && status.preset !== null ? status.preset : "…";
			React.useEffect(function () {
				var cancelled = false;
				loadStatus()
					.then(function (json) {
						if (!cancelled && json) store.set({ status: json, error: null });
					})
					.catch(function () { if (!cancelled) store.set({ error: true }); });
				return function () { cancelled = true; };
			}, []);
			return React.createElement(
				"button",
				{
					title: "dsh-yolo-mode 状态（点击开关弹窗）",
					onClick: function () { store.set({ open: !store.open }); },
					style: {
						boxSizing: "border-box",
						cursor: "pointer",
						height: "28px",
						padding: "0 10px",
						border: "1px solid #3f4348",
						borderRadius: "14px",
						background: "#1a1d21",
						color: "#e6e6e6",
						fontFamily: "inherit",
						fontSize: "13px",
						fontWeight: 500,
						display: "inline-flex",
						alignItems: "center",
						whiteSpace: "nowrap"
					}
				},
				"YOLO " + preset
			);
		}

		// ---- 弹窗（shell.overlay） ----
		// store.open 为 false 渲染 null；否则渲染统计三行 + 最近决策表（≤20）。
		function Popup() {
			useStore();
			if (!store.open) return null;
			var status = store.status || {};
			var stats = status.stats || {};
			var recent = Array.isArray(status.recent) ? status.recent.slice(0, 20) : [];
			React.useEffect(function () {
				loadStatus().catch(function () { /* error 已写入 store */ });
			}, []);

			var statRow = [
				{ label: "总审批", value: stats.total || 0 },
				{ label: "放行", value: stats.allowed || 0 },
				{ label: "拒绝", value: stats.rejected || 0 },
				{ label: "转人工", value: stats.delegated || 0 }
			];

			var headers = ["时间", "工具", "目标模式", "决策", "结果", "理由"];
			var rows = recent.map(function (item, index) {
				return React.createElement(
					"tr",
					{ key: String(index) + "-" + String(item.time) },
					React.createElement("td", tdStyle, truncate(item.time, 24)),
					React.createElement("td", tdStyle, truncate(item.toolName, 60)),
					React.createElement("td", tdStyle, truncate(item.targetMode, 60)),
					React.createElement("td", tdStyle, truncate(item.decision, 60)),
					React.createElement("td", tdStyle, truncate(item.outcome, 60)),
					React.createElement("td", tdStyle, truncate(item.reason, 60))
				);
			});

			return React.createElement(
				"div",
				{ style: overlayStyle },
				React.createElement(
					"div",
					{ style: panelStyle },
					React.createElement(
						"div",
						{ style: headerStyle },
						"YOLO 模式运行状态"
					),
					React.createElement(
						"div",
						{ style: { display: "flex", gap: "16px", flexWrap: "wrap", padding: "12px 0" } },
						statRow.map(function (item) {
							return React.createElement(
								"div",
								{ key: item.label, style: statCardStyle },
								React.createElement("div", { style: statValueStyle }, String(item.value)),
								React.createElement("div", { style: statLabelStyle }, item.label)
							);
						})
					),
					React.createElement(
						"table",
						{ style: tableStyle },
						React.createElement(
							"thead",
							null,
							React.createElement(
								"tr",
								null,
								headers.map(function (h, i) {
									return React.createElement("th", { key: i, style: thStyle }, h);
								})
							)
						),
						React.createElement("tbody", null, rows)
					),
					React.createElement(
						"div",
						{ style: footerStyle },
						React.createElement(
							"button",
							{ style: buttonStyle, onClick: function () { loadStatus().catch(function () {}); } },
							"刷新"
						),
						React.createElement(
							"button",
							{ style: Object.assign({}, buttonStyle, { marginLeft: "8px" }), onClick: function () { store.set({ open: false }); } },
							"关闭"
						)
					)
				)
			);
		}

		// ---- 设置页（settings.section，order 25） ----
		// 受控表单；初始值来自 GET 状态；保存 POST config；非法 levels JSON 禁用保存。
		function SettingsSection(props) {
			useStore();

			var presetPair = React.useState("balanced");
			var preset = presetPair[0];
			var setPreset = presetPair[1];

			var modesPair = React.useState(["workspace-write"]);
			var modes = modesPair[0];
			var setModes = modesPair[1];

			var levelsPair = React.useState("{}");
			var levelsJson = levelsPair[0];
			var setLevelsJson = levelsPair[1];

			var providerPair = React.useState("");
			var provider = providerPair[0];
			var setProvider = providerPair[1];

			var modelPair = React.useState("");
			var model = modelPair[0];
			var setModel = modelPair[1];

			var systemPromptPair = React.useState("");
			var systemPrompt = systemPromptPair[0];
			var setSystemPrompt = systemPromptPair[1];

			var timeoutMsPair = React.useState(20000);
			var timeoutMs = timeoutMsPair[0];
			var setTimeoutMs = timeoutMsPair[1];

			var maxTokensPair = React.useState(256);
			var maxTokens = maxTokensPair[0];
			var setMaxTokens = maxTokensPair[1];

			var concurrencyPair = React.useState(2);
			var concurrency = concurrencyPair[0];
			var setConcurrency = concurrencyPair[1];

			var messagePair = React.useState(null);
			var message = messagePair[0];
			var setMessage = messagePair[1];

			// 初始化与刷新：从 GET 状态填充表单。
			function fillFromConfig(cfg) {
				var c = cfg || {};
				if (c.preset !== undefined) setPreset(c.preset);
				if (Array.isArray(c.modes)) setModes(c.modes.slice());
				if (c.levels !== undefined) setLevelsJson(JSON.stringify(c.levels, null, 2));
				var j = c.judge || {};
				setProvider(j.provider !== undefined ? j.provider : "");
				setModel(j.model !== undefined ? j.model : "");
				setSystemPrompt(j.systemPrompt !== undefined ? j.systemPrompt : "");
				setTimeoutMs(j.timeoutMs !== undefined ? j.timeoutMs : 20000);
				setMaxTokens(j.maxTokens !== undefined ? j.maxTokens : 256);
				setConcurrency(j.concurrency !== undefined ? j.concurrency : 2);
			}

			React.useEffect(function () {
				loadStatus().then(function (json) {
					if (json) fillFromConfig({ preset: json.preset, modes: json.modes, levels: json.levels, judge: json.judge });
				}).catch(function () { /* error 已写入 store */ });
			}, []);

			// levels JSON 校验（保存按钮据此禁用/提示）。
			var parsedLevels = {};
			var levelsInvalid = false;
			var levelsErrorText = null;
			try {
				parsedLevels = JSON.parse(levelsJson || "{}");
			} catch (err) {
				levelsInvalid = true;
				levelsErrorText = "levels 不是合法 JSON：" + (err && err.message ? err.message : String(err));
			}

			function toggleMode(mode, checked) {
				var next = modes.slice();
				if (checked) {
					if (next.indexOf(mode) < 0) next.push(mode);
				} else {
					next = next.filter(function (m) { return m !== mode; });
				}
				setModes(next);
			}

			function save() {
				if (levelsInvalid) return;
				var body = {
					preset: preset,
					modes: modes,
					levels: parsedLevels,
					judge: {
						provider: provider,
						model: model,
						systemPrompt: systemPrompt,
						timeoutMs: Number(timeoutMs),
						maxTokens: Number(maxTokens),
						concurrency: Number(concurrency)
					}
				};
				fetch(CONFIG_URL, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(body)
				})
					.then(function (res) {
						return res.json().then(function (json) { return { res: res, json: json }; });
					})
					.then(function (out) {
						if (out.json && out.json.ok) {
							fillFromConfig(out.json.config || {});
							store.set({ status: out.json.config || store.status });
							setMessage("已保存");
						} else {
							var detail = (out.json && out.json.error) ? out.json.error : ("HTTP " + out.res.status);
							setMessage("保存失败：" + detail);
						}
					})
					.catch(function (err) {
						setMessage("保存失败：" + (err && err.message ? err.message : String(err)));
					});
			}

			var closeButton = props && typeof props.close === "function"
				? React.createElement("button", { style: Object.assign({}, buttonStyle, { float: "right" }), onClick: props.close }, "关闭")
				: null;

			return React.createElement(
				"div",
				{ style: { fontFamily: "inherit", color: "#e0e0e0" } },
				closeButton,
				React.createElement("h3", { style: { margin: "0 0 12px" } }, "YOLO 审批配置"),
				React.createElement(
					"label",
					{ style: fieldLabelStyle },
					"预设（preset）",
					React.createElement(
						"select",
						{ style: inputStyle, value: preset, onChange: function (e) { setPreset(e.target.value); } },
						PRESETS.map(function (p) { return React.createElement("option", { key: p, value: p }, p); })
					)
				),
				React.createElement(
					"fieldset",
					{ style: { border: "1px solid #3f4348", borderRadius: "8px", margin: "0 0 12px", padding: "8px" } },
					React.createElement("legend", null, "生效沙箱模式（modes）"),
					MODES.map(function (m) {
						return React.createElement(
							"label",
							{ key: m, style: { display: "block", margin: "4px 0" } },
							React.createElement("input", {
								type: "checkbox",
								checked: modes.indexOf(m) >= 0,
								onChange: function (e) { toggleMode(m, e.target.checked); }
							}),
							"  " + m
						);
					})
				),
				React.createElement(
					"label",
					{ style: fieldLabelStyle },
					"Judge Provider",
					React.createElement("input", { style: inputStyle, value: provider, onChange: function (e) { setProvider(e.target.value); }, placeholder: "如 opencode-go/deepseek-v4-flash" })
				),
				React.createElement(
					"label",
					{ style: fieldLabelStyle },
					"Judge Model",
					React.createElement("input", { style: inputStyle, value: model, onChange: function (e) { setModel(e.target.value); } })
				),
				React.createElement(
					"label",
					{ style: fieldLabelStyle },
					"System Prompt（留空为内置裁判 prompt）",
					React.createElement("textarea", { style: Object.assign({}, inputStyle, { height: "64px", resize: "vertical" }), value: systemPrompt, onChange: function (e) { setSystemPrompt(e.target.value); } })
				),
				React.createElement(
					"div",
					{ style: { display: "flex", gap: "16px", flexWrap: "wrap" } },
					numberField("超时(ms)", timeoutMs, setTimeoutMs),
					numberField("maxTokens", maxTokens, setMaxTokens),
					numberField("并发", concurrency, setConcurrency)
				),
				React.createElement(
					"label",
					{ style: fieldLabelStyle },
					"权限层级（levels，JSON）",
					React.createElement("textarea", {
						style: Object.assign({}, inputStyle, { height: "80px", resize: "vertical", fontFamily: "monospace" }),
						value: levelsJson,
						onChange: function (e) { setLevelsJson(e.target.value); setMessage(null); }
					})
				),
				levelsInvalid && React.createElement("div", { style: { color: "#ff6b6b", margin: "0 0 8px", fontSize: "13px" } }, levelsErrorText),
				React.createElement(
					"div",
					{ style: { display: "flex", alignItems: "center", gap: "12px" } },
					React.createElement("button", { style: buttonStyle, disabled: levelsInvalid, onClick: save }, "保存"),
					message && React.createElement("span", { style: { color: message.indexOf("失败") >= 0 ? "#ff6b6b" : "#69c96e", fontSize: "13px" } }, String(message))
				)
			);
		}

		function numberField(labelText, value, setter) {
			return React.createElement(
				"label",
				{ key: labelText, style: fieldLabelStyle },
				labelText,
				React.createElement("input", {
					type: "number",
					style: inputStyle,
					value: value,
					onChange: function (e) { setter(e.target.value); }
				})
			);
		}

		// ---- 内联样式 ----
		var overlayStyle = {
			position: "fixed",
			inset: 0,
			zIndex: 1000,
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
			background: "rgba(0,0,0,0.45)"
		};
		var panelStyle = {
			boxSizing: "border-box",
			width: "min(860px, 92vw)",
			maxHeight: "80vh",
			overflow: "auto",
			background: "#131518",
			border: "1px solid #3f4348",
			borderRadius: "16px",
			padding: "18px 20px",
			color: "#e6e6e6",
			fontFamily: "inherit"
		};
		var headerStyle = { fontSize: "16px", fontWeight: 600, margin: "0 0 10px" };
		var statCardStyle = {
			flex: "1 1 120px",
			background: "#1a1d21",
			border: "1px solid #2b2f34",
			borderRadius: "10px",
			padding: "10px 12px",
			textAlign: "center"
		};
		var statValueStyle = { fontSize: "20px", fontWeight: 700 };
		var statLabelStyle = { fontSize: "12px", color: "#9aa0a6", marginTop: "2px" };
		var tableStyle = { width: "100%", borderCollapse: "collapse", fontSize: "12px", margin: "6px 0" };
		var thStyle = {
			textAlign: "left",
			padding: "6px 8px",
			borderBottom: "1px solid #3f4348",
			color: "#9aa0a6",
			fontWeight: 500,
			whiteSpace: "nowrap"
		};
		var tdStyle = { padding: "5px 8px", borderBottom: "1px solid #23262a", color: "#d8dce0", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis" };
		var footerStyle = { display: "flex", alignItems: "center", marginTop: "10px" };
		var buttonStyle = {
			cursor: "pointer",
			border: "1px solid #3f4348",
			borderRadius: "10px",
			background: "#23262a",
			color: "#e6e6e6",
			fontFamily: "inherit",
			fontSize: "13px",
			padding: "6px 14px"
		};
		var fieldLabelStyle = { display: "block", margin: "0 0 10px", fontSize: "13px", color: "#e0e0e0" };
		var inputStyle = {
			boxSizing: "border-box",
			display: "block",
			width: "100%",
			marginTop: "4px",
			padding: "6px 8px",
			border: "1px solid #3f4348",
			borderRadius: "8px",
			background: "#1a1d21",
			color: "#e6e6e6",
			fontFamily: "inherit",
			fontSize: "13px"
		};

		// ---- 应用入口 ----
		function apply(ctx) {
			var slots = ctx.get("slots");
			if (slots === undefined) return;

			slots.inject("conversation.input.left", function () {
				return slots.register(
					{ name: "conversation.input.left", id: "yolo-mode-chip", label: "dsh-yolo-mode 状态" },
					Chip
				);
			});

			slots.inject("shell.overlay", function () {
				return slots.register(
					{ name: "shell.overlay", id: "yolo-mode-popup", label: "dsh-yolo-mode 弹窗" },
					Popup
				);
			});

			slots.inject("settings.section", function () {
				return slots.register(
					{ name: "settings.section", id: "yolo-mode", order: 25, label: "YOLO 审批" },
					SettingsSection
				);
			});
		}

		exports.apply = apply;
		return module.exports;
	}
});
