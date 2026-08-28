/**
 * dsh-yolo-mode —— 自发布设置桥（lib/remote.js）
 *
 * 镜像参考项目 dsh-subagents-options/src/envelope.ts + src/remote.ts：
 * 宿主在 webServer 上注册 `/yolo-mode` 前缀路由（kind:'prefix', path），绕过
 * apiproxy 的 exposedNamespaces() 白名单（树外插件无法往该名单加命名空间），
 * 直接用 cordis `inject` 拿到的 `settings` 读写自身 `yolo-mode` 命名空间。
 *
 * 线协议镜像 Connection RPC 通道（dsh-client-connection lib/index.js 275-328）：
 *   - 非 POST            → 404
 *   - content-type 非 json → 415
 *   - Host 非 loopback    → 403（轻量信任围栏）
 *   - body 非法 JSON      → 400
 *   - 信封非法            → 200 bad-request（固定 rpcId 'invalid-request'）
 *   - method 与端点不符   → 200 bad-request
 *   - dispatch 抛错       → 500（headersSent 则 destroy）
 * 响应一律 `RpcResult` 信封（{ rpcId, result: { ok, value|error } }）。
 *
 * 四个端点：
 *   settingsView   → { writable, view }
 *   settingsMutate → 应用带 expectedRevision 乐观锁的路径 op，返回新 redacted view；
 *                    冲突 → settings-conflict（含 expected/actual），其余拒绝 → settings-rejected。
 *   statusView     → getStatusPayload()（本插件扩展；不触碰 settings）。
 *   openLogFile    → 解析生效审计日志路径（view.value.auditFile || 默认 tmp 路径），
 *                    存在则用 OS 默认应用打开；不存在 → log-not-found。
 *                    （本插件扩展；打开实现可注入，缺省 lib/audit.js openFileWithDefaultApp）
 *
 * 纯映射 / 线信封辅助在顶部（无 cordis），可在普通 node 环境单测。
 *
 * @module lib/remote.js
 */
import {
  SettingsConflictError,
  settingsNamespace,
} from '@deepseek-ai/dsh-settings';
import { YOLO_SETTINGS_NAMESPACE } from './settings.js';
import { resolveAuditFile, auditFileExists, openFileWithDefaultApp } from './audit.js';

/** 桥接通道绝对前缀路由（design.md §12.4）。 */
export const YOLO_RPC_CHANNEL = '/yolo-mode';
/** settingsView 端点。 */
export const YOLO_RPC_VIEW = 'settingsView';
/** settingsMutate 端点。 */
export const YOLO_RPC_MUTATE = 'settingsMutate';
/** statusView 端点（本插件扩展）。 */
export const YOLO_RPC_STATUS = 'statusView';
/** openLogFile 端点（本插件扩展）：用 OS 默认应用打开审计 JSONL 日志。 */
export const YOLO_RPC_OPEN_LOG = 'openLogFile';

/** 顶层校验失败时宿主用的固定 rpcId（镜像 invalidEnvelopeResponse）。 */
export const INVALID_REQUEST_RPC_ID = 'invalid-request';

/* ------------------------------------------------------------------ *
 * 线信封辅助（纯函数，无 cordis；镜像 src/envelope.ts）
 * ------------------------------------------------------------------ */

/**
 * 解析并校验一个解码后的 JSON body 是否为 "client-request" 信封。
 * 仅接受 type 恰为 "client-request"、rpcId/method 为字符串的对象。
 * @param {unknown} body
 * @returns {{ok:true, envelope:{type:'client-request',rpcId:string,method:string,payload:unknown}}
 *          |{ok:false, issues:string[]}}
 */
export function parseClientRequestEnvelope(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, issues: ['body must be a JSON object'] };
  }
  const record = body;
  const issues = [];
  if (record.type !== 'client-request') issues.push('type must equal "client-request"');
  if (typeof record.rpcId !== 'string') issues.push('rpcId must be a string');
  if (typeof record.method !== 'string') issues.push('method must be a string');
  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    envelope: {
      type: 'client-request',
      rpcId: record.rpcId,
      method: record.method,
      payload: record.payload,
    },
  };
}

/**
 * 构造请求 rpcId 的 "server-response" 信封，携带一个 RpcResult。
 * @template T
 * @param {string} rpcId
 * @param {{ok:boolean, value?:T, error?:object}} result
 * @returns {{type:'server-response', rpcId:string, result:object}}
 */
export function buildServerResponse(rpcId, result) {
  return { type: 'server-response', rpcId, result };
}

/**
 * 构造坏请求 "server-response"：对非法 client-request 信封，宿主无法信任调用方
 * rpcId，故用固定 INVALID_REQUEST_RPC_ID（镜像 invalidEnvelopeResponse）。
 * @param {readonly string[]} issues
 * @returns {{type:'server-response', rpcId:string, result:object}}
 */
export function buildBadRequestResponse(issues) {
  const error = {
    code: 'bad-request',
    message: 'invalid client-request message',
    details: { issues: [] },
  };
  return buildServerResponse(INVALID_REQUEST_RPC_ID, { ok: false, error });
}

/**
 * 构造 method 与端点不符的 "server-response"（镜像 289-293）。
 * @param {string} rpcId
 * @param {unknown} method
 * @param {string} endpoint
 * @returns {{type:'server-response', rpcId:string, result:object}}
 */
export function buildMethodMismatchResponse(rpcId, method, endpoint) {
  const error = {
    code: 'bad-request',
    message: 'method ' + JSON.stringify(method) + ' does not match endpoint ' + JSON.stringify(endpoint),
    details: { issues: [] },
  };
  return buildServerResponse(rpcId, { ok: false, error });
}

const IPV4_OCTET = /^\d{1,3}$/;

/** 最小 127/8 IPv4 段常量。 */
const IPV4_LOOPBACK = '127';

/**
 * WHATWG URL hostname 是否命名本机回环权威。
 * 接受 "localhost"、"[::1]"（保留括号）或 127/8 任意 IPv4。
 * @param {string} hostname
 * @returns {boolean}
 */
export function isLoopbackHostname(hostname) {
  if (hostname === 'localhost' || hostname === '[::1]') return true;
  const parts = hostname.split('.');
  return (
    parts.length === 4 &&
    parts[0] === IPV4_LOOPBACK &&
    parts.every((part) => IPV4_OCTET.test(part) && Number(part) <= 255)
  );
}

/**
 * 将原始 Host 头分类为 loopback。剥离端口后缀并括号归一化权威后再判定。
 * 无端口时视为裸主机名。
 * @param {string} rawHost
 * @returns {boolean}
 */
export function isLoopbackHost(rawHost) {
  let host = typeof rawHost === 'string' ? rawHost.trim() : '';
  if (host.length === 0) return false;
  if (host.startsWith('[')) {
    const close = host.indexOf(']');
    if (close === -1) return false;
    host = host.slice(0, close + 1);
  } else {
    const colon = host.indexOf(':');
    if (colon !== -1) host = host.slice(0, colon);
  }
  return isLoopbackHostname(host);
}

/**
 * 从通道前缀下派生端点段。路径必须为 "<channel>/<单一合法段>"。
 * 合法端点=非空、不含 "/"、"."、".." 遍历段。
 * @param {string} channel 如 '/yolo-mode'
 * @param {string} pathname 如 '/yolo-mode/settingsView'
 * @returns {string|undefined}
 */
export function endpointFromPath(channel, pathname) {
  if (!pathname.startsWith(channel + '/')) return undefined;
  const endpoint = pathname.slice(channel.length + 1);
  if (endpoint.length === 0) return undefined;
  if (endpoint.split('/').some((segment) => segment.length === 0 || segment === '.' || segment === '..')) {
    return undefined;
  }
  return endpoint;
}

/* ------------------------------------------------------------------ *
 * 命名空间视图映射（镜像 src/remote.ts toDirectorNamespaceView / pick）
 * ------------------------------------------------------------------ */

/** 把 describe 的一个设置描述符映射为线视图。 */
function toNamespaceView(descriptor) {
  return {
    ns: String(descriptor.ns),
    schema: descriptor.schema,
    value: descriptor.value,
    ...(descriptor.base === undefined ? {} : { base: descriptor.base }),
    ...(descriptor.user === undefined ? {} : { user: descriptor.user }),
    applies: descriptor.applies,
    secrets: (descriptor.secrets ?? []).map((secret) => ({
      path: [...secret.path],
      set: secret.set,
    })),
    revision: descriptor.revision,
  };
}

/** 在 redacted describe 结果中挑出 yolo-mode 命名空间视图；未注册则 undefined。 */
export function pickYoloNamespaceView(descriptors) {
  for (const descriptor of descriptors) {
    if (descriptor.ns === YOLO_SETTINGS_NAMESPACE) {
      return toNamespaceView(descriptor);
    }
  }
  return undefined;
}

/* ------------------------------------------------------------------ *
 * settings 维度映射（镜像 src/remote.ts directorRejected / directorConflict / directorMutate）
 * ------------------------------------------------------------------ */

/** 构造 settings-rejected RPC 错误。 */
function yoloRejected(ns, error) {
  return {
    code: 'settings-rejected',
    message: error instanceof Error ? error.message : String(error),
    details: { ns },
  };
}

/** 构造 settings-conflict RPC 错误（镜像 apiproxy 映射）。 */
function yoloConflict(conflict) {
  const structural = conflict;
  const ns = structural.ns;
  return {
    code: 'settings-conflict',
    message: conflict.message,
    details: {
      ns: ns === undefined ? 'yolo-mode' : String(ns),
      expected: conflict.expected,
      actual: conflict.actual,
    },
  };
}

/**
 * 对 settings seam 执行一次路径 op 变更并映射为 RpcResult（携带新 redacted view，
 * 或 settings-conflict / settings-rejected 错误）。纯函数可注入 mutate/describe 测试。
 * @param {Function} mutate settings.mutate 绑定
 * @param {Function} describe settings.describe 绑定
 * @param {string} ns 命名空间字符串
 * @param {Array<{op:'set'|'unset', path:string[], value?:unknown}>} ops
 * @param {number|undefined} expectedRevision
 * @returns {Promise<{ok:boolean, value?:object, error?:object}>}
 */
export async function yoloMutate(mutate, describe, ns, ops, expectedRevision) {
  const branded = settingsNamespace(ns);
  try {
    await mutate(branded, ops, expectedRevision);
  } catch (error) {
    if (error instanceof SettingsConflictError) {
      return { ok: false, error: yoloConflict(error) };
    }
    return { ok: false, error: yoloRejected(ns, error) };
  }
  const descriptor = describe({ redactSecrets: true }).find(
    (candidate) => candidate.ns === branded,
  );
  if (descriptor === undefined) {
    return {
      ok: false,
      error: {
        code: 'internal',
        message: 'settings namespace "' + ns + '" was disposed after the mutate',
        details: {},
      },
    };
  }
  return { ok: true, value: toNamespaceView(descriptor) };
}

/* ------------------------------------------------------------------ *
 * 请求处理器（镜像 src/remote.ts handleDirectorBridgeRequest + dispatch）
 * ------------------------------------------------------------------ */

/** HTTP body 读取上限（design.md §11.1，64KB）。 */
const BODY_LIMIT = 64 * 1024;

/** 读 IncomingMessage body 至多 limit 字节；超出抛 {code:'LIMIT'}。 */
function readRequestBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let done = false;
    const fail = (err) => {
      if (done) return;
      done = true;
      reject(err);
    };
    req.on('data', (chunk) => {
      if (done) return;
      const buf = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(typeof chunk === 'string' ? chunk : String(chunk), 'utf8');
      size += buf.length;
      if (size > limit) {
        fail(Object.assign(new Error('request body too large'), { code: 'LIMIT' }));
        return;
      }
      chunks.push(buf);
    });
    req.on('end', () => {
      if (done) return;
      done = true;
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', (err) => fail(err));
  });
}

/** pathname 部分（安全传给 endpointFromPath）。 */
function pathnameOf(rawUrl) {
  try {
    return new URL(rawUrl, 'http://dsh.internal').pathname;
  } catch {
    return rawUrl;
  }
}

/** 纯文本响应。 */
function sendPlain(res, status, text) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end(text);
}

/** JSON 响应。 */
function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

/**
 * openLogFile 端点：从 settings 的 yolo-mode resolved view 解析生效审计日志路径
 * （resolveAuditFile 与主条目 audit() 同一规则），文件不存在 → log-not-found；
 * 存在则交给注入的 openFile（默认 OS 默认应用打开）。
 * @param {object} settings settings 服务对象
 * @param {(file: string) => Promise<{ok:boolean, value?:object, error?:object}>} openFile
 * @returns {Promise<{ok:boolean, value?:object, error?:object}>}
 */
async function openAuditLogEndpoint(settings, openFile) {
  const view = pickYoloNamespaceView(settings.describe({ redactSecrets: true }));
  const value = view && view.value && typeof view.value === 'object' ? view.value : {};
  const file = resolveAuditFile(value);
  if (!auditFileExists(file)) {
    return {
      ok: false,
      error: {
        code: 'log-not-found',
        message: 'audit log file does not exist yet: ' + file,
        details: { path: file },
      },
    };
  }
  return openFile(file);
}

/**
 * 分派一个已校验端点。未知端点抛错（由调用方兜底为 500）。
 * @param {object} settings settings 服务对象
 * @param {() => object} getStatusPayload statusView 载荷装配（由桥接条目注入）
 * @param {string} endpoint
 * @param {unknown} payload
 * @param {(file: string) => Promise<{ok:boolean, value?:object, error?:object}>} [openFile]
 *   openLogFile 端点的打开实现（测试注入 fake；缺省 OS 默认应用打开）
 * @returns {Promise<{ok:boolean, value?:unknown, error?:object}>}
 */
async function dispatchYoloEndpoint(settings, getStatusPayload, endpoint, payload, openFile) {
  if (endpoint === YOLO_RPC_VIEW) {
    return {
      ok: true,
      value: {
        writable: settings.writable,
        view: pickYoloNamespaceView(settings.describe({ redactSecrets: true })),
      },
    };
  }
  if (endpoint === YOLO_RPC_STATUS) {
    return { ok: true, value: getStatusPayload() };
  }
  if (endpoint === YOLO_RPC_OPEN_LOG) {
    return openAuditLogEndpoint(settings, openFile ?? openFileWithDefaultApp);
  }
  if (endpoint === YOLO_RPC_MUTATE) {
    const request = payload ?? null;
    if (request === null || typeof request !== 'object' || request.ns !== String(YOLO_SETTINGS_NAMESPACE)) {
      return {
        ok: false,
        error: {
          code: 'bad-request',
          message: 'settingsMutate: expected ns "' + String(YOLO_SETTINGS_NAMESPACE) + '"',
          details: { issues: [] },
        },
      };
    }
    const ops = Array.isArray(request.ops) ? request.ops : [];
    return yoloMutate(
      (n, o, r) => settings.mutate(n, o, r),
      (opts) => settings.describe(opts),
      String(YOLO_SETTINGS_NAMESPACE),
      ops,
      typeof request.expectedRevision === 'number' ? request.expectedRevision : undefined,
    );
  }
  throw new Error('unknown bridge endpoint ' + JSON.stringify(endpoint));
}

/**
 * `/yolo-mode` 前缀路由处理器（node:http 原语）。拥有完整响应生命周期。
 * @param {object} settings settings 服务对象（注入）
 * @param {() => object} getStatusPayload statusView 载荷装配（由桥接条目注入）
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {(file: string) => Promise<{ok:boolean, value?:object, error?:object}>} [openFile]
 *   openLogFile 端点的打开实现（测试注入 fake；缺省 OS 默认应用打开）
 * @returns {Promise<void>}
 */
export async function handleYoloBridgeRequest(settings, getStatusPayload, req, res, openFile) {
  const rawUrl = typeof req.url === 'string' ? req.url : '/';
  const hostHeader = req.headers.host;

  if (typeof req.method !== 'string') {
    sendPlain(res, 404, 'not found');
    return;
  }
  // 非 POST → 404。
  if (req.method !== 'POST') {
    sendPlain(res, 404, 'not found');
    return;
  }
  // content-type 必须 application/json → 415。
  const contentType = (req.headers['content-type'] ?? '').split(';', 1)[0].trim().toLowerCase();
  if (contentType !== 'application/json') {
    sendPlain(res, 415, 'content type must be application/json');
    return;
  }
  // Host 非 loopback → 403（轻量信任围栏）。
  if (hostHeader === undefined || !isLoopbackHost(hostHeader)) {
    sendPlain(res, 403, 'forbidden');
    return;
  }
  // 读 body → 400 非法 JSON / 413 超长。
  let raw;
  try {
    raw = await readRequestBody(req, BODY_LIMIT);
  } catch (err) {
    if (err && err.code === 'LIMIT') {
      sendPlain(res, 413, 'request body too large');
    } else {
      // body 读取错误 → 400。
      sendPlain(res, 400, 'body is not JSON');
    }
    return;
  }
  let body;
  try {
    body = raw.length === 0 ? {} : JSON.parse(raw);
  } catch {
    sendPlain(res, 400, 'body is not JSON');
    return;
  }
  // 信封校验 → 200 bad-request。
  const parsed = parseClientRequestEnvelope(body);
  if (!parsed.ok) {
    sendJson(res, 200, buildBadRequestResponse(parsed.issues));
    return;
  }
  const envelope = parsed.envelope;
  // method 必须匹配路径派生端点。
  const endpoint = endpointFromPath(YOLO_RPC_CHANNEL, pathnameOf(rawUrl));
  if (endpoint === undefined || envelope.method !== endpoint) {
    sendJson(
      res,
      200,
      buildMethodMismatchResponse(envelope.rpcId, envelope.method, endpoint ?? '(invalid path)'),
    );
    return;
  }
  // 分派。
  const result = await dispatchYoloEndpoint(settings, getStatusPayload, endpoint, envelope.payload, openFile);
  sendJson(res, 200, buildServerResponse(envelope.rpcId, result));
}

/**
 * 在宿主 webServer 上安装 `/yolo-mode` 前缀路由。惰性读取 webServer/settings；
 * 服务缺失时打 debug 日志并安装空操作（不抛错）。返回 disposer。
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {object} settings settings 服务对象（注入）
 * @param {() => object} getStatusPayload statusView 载荷装配（注入）
 * @returns {() => void} 卸载时反注册路由
 */
export function installYoloRemoteBridge(ctx, settings, getStatusPayload) {
  const webServer = ctx.get('webServer');
  if (settings === undefined || webServer === undefined) {
    ctx.logger.debug(
      '[yolo-mode] settings bridge not installed ' +
        '(settings:' + String(settings !== undefined) +
        ', webServer:' + String(webServer !== undefined) + ')',
    );
    return () => {};
  }

  const handler = (req, res) => {
    handleYoloBridgeRequest(settings, getStatusPayload, req, res).catch((error) => {
      // 分派抛错（未知端点或 settings seam 爆掉）→ 500；headersSent 则 destroy。
      if (res.headersSent) {
        res.destroy();
        return;
      }
      sendPlain(res, 500, 'handler failure: ' + String(error));
    });
  };

  return ctx.effect(
    () => webServer.register({ kind: 'prefix', path: YOLO_RPC_CHANNEL, handler }),
    'yolo-mode: settings bridge route',
  );
}
