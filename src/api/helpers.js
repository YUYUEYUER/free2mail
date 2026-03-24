/**
 * API 辅助函数模块
 * @module api/helpers
 */

import { sha256Hex } from '../utils/common.js';

/**
 * 从请求中提取 JWT 载荷
 * @param {Request} request - HTTP 请求对象
 * @param {object} options - 选项对象
 * @returns {object|null} JWT 载荷或 null
 */
export function getJwtPayload(request, options = {}) {
  // 优先使用服务端传入的已解析身份（支持 __root__ 超管）
  if (options && options.authPayload) return options.authPayload;
  try {
    const cookie = request.headers.get('Cookie') || '';
    const token = (cookie.split(';').find(s => s.trim().startsWith('iding-session=')) || '').split('=')[1] || '';
    const parts = token.split('.');
    if (parts.length === 3) {
      const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
      return JSON.parse(json);
    }
  } catch (_) { }
  return null;
}

/**
 * 检查是否为严格管理员
 * @param {Request} request - HTTP 请求对象
 * @param {object} options - 选项对象
 * @returns {boolean} 是否为严格管理员
 */
export function isStrictAdmin(request, options = {}) {
  const p = getJwtPayload(request, options);
  if (!p) return false;
  if (p.role !== 'admin') return false;
  // __root__（根管理员）视为严格管理员
  if (String(p.username || '') === '__root__') return true;
  if (options?.adminName) {
    return String(p.username || '').toLowerCase() === String(options.adminName || '').toLowerCase();
  }
  return true;
}

/**
 * 创建标准 JSON 响应
 * @param {any} data - 响应数据
 * @param {number} status - HTTP 状态码
 * @returns {Response} HTTP 响应对象
 */
export function jsonResponse(data, status = 200) {
  return jsonResponseWithHeaders(data, status);
}

export function jsonResponseWithHeaders(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders
    }
  });
}

/**
 * 创建错误响应
 * @param {string} message - 错误消息
 * @param {number} status - HTTP 状态码
 * @returns {Response} HTTP 响应对象
 */
export function errorResponse(message, status = 400) {
  return new Response(message, { status });
}

function getApiResponseCacheStore() {
  if (!globalThis.__API_RESPONSE_CACHE__) {
    globalThis.__API_RESPONSE_CACHE__ = new Map();
  }
  return globalThis.__API_RESPONSE_CACHE__;
}

function getApiCacheVersionStore() {
  if (!globalThis.__API_CACHE_VERSIONS__) {
    globalThis.__API_CACHE_VERSIONS__ = new Map();
  }
  return globalThis.__API_CACHE_VERSIONS__;
}

function getApiCacheVersion(namespace) {
  return getApiCacheVersionStore().get(namespace) || 0;
}

function buildViewerScope(request, options = {}) {
  if (options?.mockOnly) return 'mock';
  const payload = getJwtPayload(request, options);
  if (payload?.mailboxId || payload?.mailboxAddress) {
    return `mailbox:${payload.mailboxId || String(payload.mailboxAddress || '').toLowerCase()}`;
  }
  if (payload?.userId) {
    return `user:${payload.userId}:${payload.role || 'user'}`;
  }
  if (payload?.username) {
    return `usern:${String(payload.username).toLowerCase()}:${payload.role || 'user'}`;
  }
  return `anon:${payload?.role || 'none'}`;
}

function defaultCacheControl(ttlMs, scope = 'private') {
  const seconds = Math.max(1, Math.floor(ttlMs / 1000));
  const staleSeconds = Math.max(seconds * 4, seconds + 30);
  return `${scope}, max-age=${seconds}, stale-while-revalidate=${staleSeconds}`;
}

export function bumpApiCacheVersion(...namespaces) {
  const store = getApiCacheVersionStore();
  for (const namespace of namespaces.flat().filter(Boolean)) {
    store.set(namespace, (store.get(namespace) || 0) + 1);
  }
}

export async function getCachedJsonResponse(request, options, namespace, ttlMs, producer, config = {}) {
  if (request.method !== 'GET' || ttlMs <= 0) {
    const data = await producer();
    return jsonResponseWithHeaders(data, 200, config.headers || {});
  }

  const url = new URL(request.url);
  const version = getApiCacheVersion(namespace);
  const keyParts = Array.isArray(config.keyParts) ? config.keyParts : [];
  const cacheKey = [
    namespace,
    `v${version}`,
    buildViewerScope(request, options),
    url.pathname,
    url.searchParams.toString(),
    ...keyParts
  ].join('::');

  const store = getApiResponseCacheStore();
  const now = Date.now();
  const cached = store.get(cacheKey);
  if (cached && cached.expiry > now) {
    return new Response(cached.body, {
      status: cached.status,
      headers: new Headers(cached.headers)
    });
  }

  const data = await producer();
  const headers = {
    'Cache-Control': config.cacheControl || defaultCacheControl(ttlMs, config.scope || 'private'),
    ...(config.headers || {})
  };
  const response = jsonResponseWithHeaders(data, 200, headers);
  const body = await response.clone().text();
  store.set(cacheKey, {
    body,
    status: response.status,
    headers: Array.from(response.headers.entries()),
    expiry: now + ttlMs
  });
  return response;
}

export { sha256Hex };
