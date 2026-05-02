/**
 * 用户管理 API 模块
 * @module api/users
 */

import { getJwtPayload, isStrictAdmin, sha256Hex, jsonResponse, errorResponse, getCachedJsonResponse, bumpApiCacheVersion } from './helpers.js';
import { initMockUsers, buildMockMailboxes, MOCK_DOMAINS } from './mock.js';
import {
  listUsersWithCounts,
  createUser,
  updateUser,
  deleteUser,
  assignMailboxToUser,
  getMailboxAssignments,
  replaceMailboxAssignments,
  unassignMailboxFromUser,
  getUserMailboxes
} from '../db/index.js';

const USERNAME_PATTERN = /^[a-z0-9._-]{1,64}$/;

function normalizeUsernameInput(username) {
  const normalized = String(username || '').trim().toLowerCase();
  if (!normalized) throw new Error('用户名不能为空');
  if (!USERNAME_PATTERN.test(normalized)) throw new Error('用户名格式无效');
  return normalized;
}

/**
 * 处理用户管理相关 API
 * @param {Request} request - HTTP 请求
 * @param {object} db - 数据库连接
 * @param {URL} url - 请求 URL
 * @param {string} path - 请求路径
 * @param {object} options - 选项
 * @returns {Promise<Response|null>} 响应或 null（未匹配）
 */
export async function handleUsersApi(request, db, url, path, options) {
  const isMock = !!options.mockOnly;
  const USERS_TTL = 15 * 1000;
  const USER_MAILBOXES_TTL = 15 * 1000;
  
  // 初始化演示模式用户数据
  if (isMock) {
    initMockUsers();
  }
  
  // =================== 用户管理（演示模式） ===================
  if (isMock && path === '/api/users' && request.method === 'GET') {
    return getCachedJsonResponse(request, options, 'users', USERS_TTL, async () => {
      const page = Math.max(parseInt(url.searchParams.get('page') || '1', 10), 1);
      const limit = Math.min(parseInt(url.searchParams.get('size') || url.searchParams.get('limit') || '50', 10), 100);
      const offset = Math.max(parseInt(url.searchParams.get('offset') || String((page - 1) * limit), 10), 0);
      const sort = url.searchParams.get('sort') || 'desc';
      let list = (globalThis.__MOCK_USERS__ || []).map(u => {
        const boxes = globalThis.__MOCK_USER_MAILBOXES__?.get(u.id) || [];
        return { ...u, mailbox_count: boxes.length };
      });
      list.sort((a, b) => {
        const dateA = new Date(a.created_at);
        const dateB = new Date(b.created_at);
        return sort === 'asc' ? dateA - dateB : dateB - dateA;
      });
      return { list: list.slice(offset, offset + limit), total: list.length };
    });
  }
  
  if (isMock && path === '/api/users' && request.method === 'POST') {
    try {
      const body = await request.json();
      const username = normalizeUsernameInput(body.username);
      const exists = (globalThis.__MOCK_USERS__ || []).some(u => u.username === username);
      if (exists) return errorResponse('用户名已存在', 400);
      const role = (body.role === 'admin') ? 'admin' : 'user';
      const mailbox_limit = Math.max(0, Number(body.mailboxLimit || 10));
      const id = ++globalThis.__MOCK_USER_LAST_ID__;
      const item = { id, username, role, can_send: 0, mailbox_limit, created_at: new Date().toISOString().replace('T', ' ').slice(0, 19) };
      globalThis.__MOCK_USERS__.unshift(item);
      bumpApiCacheVersion('users', 'userMailboxes', 'quota', 'mailboxes');
      return Response.json(item);
    } catch (e) { return errorResponse('创建失败', 500); }
  }
  
  if (isMock && request.method === 'PATCH' && path.startsWith('/api/users/')) {
    const id = Number(path.split('/')[3]);
    const list = globalThis.__MOCK_USERS__ || [];
    const idx = list.findIndex(u => u.id === id);
    if (idx < 0) return errorResponse('未找到用户', 404);
    try {
      const body = await request.json();
      if (typeof body.mailboxLimit !== 'undefined') list[idx].mailbox_limit = Math.max(0, Number(body.mailboxLimit));
      if (typeof body.role === 'string') list[idx].role = (body.role === 'admin' ? 'admin' : 'user');
      if (typeof body.can_send !== 'undefined') list[idx].can_send = body.can_send ? 1 : 0;
      bumpApiCacheVersion('users', 'quota');
      return Response.json({ success: true });
    } catch (_) { return errorResponse('更新失败', 500); }
  }
  
  if (isMock && request.method === 'DELETE' && path.startsWith('/api/users/')) {
    const id = Number(path.split('/')[3]);
    const list = globalThis.__MOCK_USERS__ || [];
    const idx = list.findIndex(u => u.id === id);
    if (idx < 0) return errorResponse('未找到用户', 404);
    list.splice(idx, 1);
    globalThis.__MOCK_USER_MAILBOXES__?.delete(id);
    bumpApiCacheVersion('users', 'userMailboxes', 'quota', 'mailboxes');
    return Response.json({ success: true });
  }
  
  if (isMock && path === '/api/users/assign' && request.method === 'POST') {
    try {
      const body = await request.json();
      const username = normalizeUsernameInput(body.username);
      const address = String(body.address || '').trim().toLowerCase();
      const u = (globalThis.__MOCK_USERS__ || []).find(x => x.username === username);
      if (!u) return errorResponse('用户不存在', 404);
      const boxes = globalThis.__MOCK_USER_MAILBOXES__?.get(u.id) || [];
      if (boxes.some(box => box.address === address)) {
        return Response.json({ success: true, already_assigned: true });
      }
      const mailboxPresent = (globalThis.__MOCK_MAILBOXES__ || []).some((box) => box.address === address);
      if (!mailboxPresent) return errorResponse('邮箱不存在', 404);
      if (boxes.length >= (u.mailbox_limit || 10)) return errorResponse('已达到邮箱上限', 400);
      const item = (globalThis.__MOCK_MAILBOXES__ || []).find((box) => box.address === address) || { address, created_at: new Date().toISOString().replace('T', ' ').slice(0, 19), is_pinned: 0 };
      boxes.unshift(item);
      globalThis.__MOCK_USER_MAILBOXES__?.set(u.id, boxes);
      bumpApiCacheVersion('users', 'userMailboxes', 'quota', 'mailboxes');
      return Response.json({ success: true });
    } catch (e) { return errorResponse(e?.message || '分配失败', 400); }
  }

  if (isMock && path === '/api/users/replace-assignments' && request.method === 'POST') {
    try {
      const body = await request.json();
      const address = String(body.address || '').trim().toLowerCase();
      const usernames = Array.isArray(body.usernames) ? body.usernames.map((item) => normalizeUsernameInput(item)) : [];
      if (!address) return errorResponse('缺少邮箱地址', 400);

      const mailbox = (globalThis.__MOCK_MAILBOXES__ || []).find((box) => box.address === address);
      if (!mailbox) return errorResponse('邮箱不存在', 404);

      const targetUsers = [];
      for (const username of Array.from(new Set(usernames))) {
        const user = (globalThis.__MOCK_USERS__ || []).find((item) => item.username === username);
        if (!user) return errorResponse(`用户不存在: ${username}`, 404);
        targetUsers.push(user);
      }

      for (const user of targetUsers) {
        const boxes = globalThis.__MOCK_USER_MAILBOXES__?.get(user.id) || [];
        const alreadyOwns = boxes.some((box) => box.address === address);
        const nextUsed = boxes.length + (alreadyOwns ? 0 : 1);
        if (nextUsed > Number(user.mailbox_limit || 0)) {
          return errorResponse(`用户 ${user.username} 已达到邮箱上限`, 400);
        }
      }

      for (const user of (globalThis.__MOCK_USERS__ || [])) {
        const boxes = globalThis.__MOCK_USER_MAILBOXES__?.get(user.id) || [];
        globalThis.__MOCK_USER_MAILBOXES__?.set(user.id, boxes.filter((box) => box.address !== address));
      }

      for (const user of targetUsers) {
        const boxes = globalThis.__MOCK_USER_MAILBOXES__?.get(user.id) || [];
        boxes.unshift(mailbox);
        globalThis.__MOCK_USER_MAILBOXES__?.set(user.id, boxes);
      }

      bumpApiCacheVersion('users', 'userMailboxes', 'quota', 'mailboxes', 'mailboxInfo');
      return Response.json({ success: true, address, assigned_count: targetUsers.length, assigned_users: targetUsers.map((user) => user.username) });
    } catch (e) {
      return errorResponse(e?.message || '更新分配失败', 400);
    }
  }

  if (isMock && path === '/api/users/by-mailbox' && request.method === 'GET') {
    const address = String(url.searchParams.get('address') || '').trim().toLowerCase();
    if (!address) return errorResponse('缺少邮箱地址', 400);

    const users = (globalThis.__MOCK_USERS__ || []).filter((user) => {
      const boxes = globalThis.__MOCK_USER_MAILBOXES__?.get(user.id) || [];
      return boxes.some((box) => box.address === address);
    }).map((user) => ({
      id: user.id,
      username: user.username,
      role: user.role,
      can_send: user.can_send,
      mailbox_limit: user.mailbox_limit
    }));

    return Response.json({
      address,
      mailbox_id: null,
      assigned_count: users.length,
      users
    });
  }
  
  if (isMock && path === '/api/users/unassign' && request.method === 'POST') {
    try {
      const body = await request.json();
      const username = String(body.username || '').trim().toLowerCase();
      const address = String(body.address || '').trim().toLowerCase();
      const u = (globalThis.__MOCK_USERS__ || []).find(x => x.username === username);
      if (!u) return errorResponse('用户不存在', 404);
      const boxes = globalThis.__MOCK_USER_MAILBOXES__?.get(u.id) || [];
      const index = boxes.findIndex(box => box.address === address);
      if (index === -1) return errorResponse('该邮箱未分配给该用户', 400);
      boxes.splice(index, 1);
      globalThis.__MOCK_USER_MAILBOXES__?.set(u.id, boxes);
      bumpApiCacheVersion('users', 'userMailboxes', 'quota', 'mailboxes');
      return Response.json({ success: true });
    } catch (_) { return errorResponse('取消分配失败', 500); }
  }
  
  if (isMock && request.method === 'GET' && path.startsWith('/api/users/') && path.endsWith('/mailboxes')) {
    return getCachedJsonResponse(request, options, 'userMailboxes', USER_MAILBOXES_TTL, async () => {
      const id = Number(path.split('/')[3]);
      const all = globalThis.__MOCK_USER_MAILBOXES__?.get(id) || [];
      const page = Math.max(parseInt(url.searchParams.get('page') || '1', 10), 1);
      const size = Math.min(Math.max(parseInt(url.searchParams.get('size') || '20', 10), 1), 200);
      const start = (page - 1) * size;
      return {
        list: all.slice(start, start + size),
        total: all.length
      };
    }, {
      keyParts: [String(path.split('/')[3] || '')]
    });
  }
  
  // ================= 用户管理接口（仅非演示模式） =================
  if (!isMock && path === '/api/users' && request.method === 'GET') {
    if (!isStrictAdmin(request, options)) return errorResponse('Forbidden', 403);
    return getCachedJsonResponse(request, options, 'users', USERS_TTL, async () => {
      const page = Math.max(parseInt(url.searchParams.get('page') || '1', 10), 1);
      const limit = Math.min(parseInt(url.searchParams.get('size') || url.searchParams.get('limit') || '50', 10), 100);
      const offset = Math.max(parseInt(url.searchParams.get('offset') || String((page - 1) * limit), 10), 0);
      const sort = url.searchParams.get('sort') || 'desc';
      const list = await listUsersWithCounts(db, { limit, offset, sort });
      const totalRow = await db.prepare('SELECT COUNT(1) AS total FROM users').first();
      return { list, total: Number(totalRow?.total || 0) };
    }).catch(() => errorResponse('查询失败', 500));
  }

  if (!isMock && path === '/api/users/by-mailbox' && request.method === 'GET') {
    if (!isStrictAdmin(request, options)) return errorResponse('Forbidden', 403);
    const address = String(url.searchParams.get('address') || '').trim().toLowerCase();
    if (!address) return errorResponse('缺少邮箱地址', 400);

    try {
      return await getCachedJsonResponse(request, options, 'userMailboxes', USER_MAILBOXES_TTL, async () => {
        return await getMailboxAssignments(db, address);
      }, {
        keyParts: [address]
      });
    } catch (e) {
      return errorResponse('查询失败', 500);
    }
  }

  if (!isMock && path === '/api/users/replace-assignments' && request.method === 'POST') {
    if (!isStrictAdmin(request, options)) return errorResponse('Forbidden', 403);
    try {
      const body = await request.json();
      const address = String(body.address || '').trim().toLowerCase();
      const usernames = Array.isArray(body.usernames) ? body.usernames : [];
      if (!address) return errorResponse('缺少邮箱地址', 400);
      const result = await replaceMailboxAssignments(db, { address, usernames });
      bumpApiCacheVersion('users', 'userMailboxes', 'quota', 'mailboxes', 'mailboxInfo');
      return Response.json(result);
    } catch (e) {
      const message = String(e?.message || e || '更新分配失败');
      const status = /不存在|无效/.test(message) ? 400 : (/达到邮箱上限/.test(message) ? 400 : 500);
      return errorResponse('更新分配失败: ' + message, status);
    }
  }
  
  if (!isMock && path === '/api/users' && request.method === 'POST') {
    if (!isStrictAdmin(request, options)) return errorResponse('Forbidden', 403);
    try {
      const body = await request.json();
      const username = normalizeUsernameInput(body.username);
      const role = (body.role || 'user') === 'admin' ? 'admin' : 'user';
      const mailboxLimit = Number(body.mailboxLimit || 10);
      const password = String(body.password || '').trim();
      let passwordHash = null;
      if (password) { passwordHash = await sha256Hex(password); }
      const user = await createUser(db, { username, passwordHash, role, mailboxLimit });
      bumpApiCacheVersion('users', 'userMailboxes', 'quota');
      return Response.json(user);
    } catch (e) { return errorResponse('创建失败: ' + (e?.message || e), 500); }
  }
  
  if (!isMock && request.method === 'PATCH' && path.startsWith('/api/users/')) {
    if (!isStrictAdmin(request, options)) return errorResponse('Forbidden', 403);
    const id = Number(path.split('/')[3]);
    if (!id) return errorResponse('无效ID', 400);
    try {
      const body = await request.json();
      const fields = {};
      if (typeof body.mailboxLimit !== 'undefined') fields.mailbox_limit = Math.max(0, Number(body.mailboxLimit));
      if (typeof body.role === 'string') fields.role = (body.role === 'admin' ? 'admin' : 'user');
      if (typeof body.can_send !== 'undefined') fields.can_send = body.can_send ? 1 : 0;
      if (typeof body.password === 'string' && body.password) { fields.password_hash = await sha256Hex(String(body.password)); }
      await updateUser(db, id, fields);
      bumpApiCacheVersion('users', 'quota');
      return Response.json({ success: true });
    } catch (e) { return errorResponse('更新失败: ' + (e?.message || e), 500); }
  }
  
  if (!isMock && request.method === 'DELETE' && path.startsWith('/api/users/')) {
    if (!isStrictAdmin(request, options)) return errorResponse('Forbidden', 403);
    const id = Number(path.split('/')[3]);
    if (!id) return errorResponse('无效ID', 400);
    try { await deleteUser(db, id); bumpApiCacheVersion('users', 'userMailboxes', 'quota', 'mailboxes'); return Response.json({ success: true }); }
    catch (e) { return errorResponse('删除失败: ' + (e?.message || e), 500); }
  }
  
  if (!isMock && path === '/api/users/assign' && request.method === 'POST') {
    if (!isStrictAdmin(request, options)) return errorResponse('Forbidden', 403);
    try {
      const body = await request.json();
      const username = normalizeUsernameInput(body.username);
      const address = String(body.address || '').trim().toLowerCase();
      if (!username || !address) return errorResponse('参数不完整', 400);
      const result = await assignMailboxToUser(db, { username, address });
      bumpApiCacheVersion('users', 'userMailboxes', 'quota', 'mailboxes', 'mailboxInfo');
      return Response.json(result);
    } catch (e) {
      const message = String(e?.message || e || '分配失败');
      const status = /不存在|无效|上限/.test(message) ? 400 : 500;
      return errorResponse('分配失败: ' + message, status);
    }
  }
  
  if (!isMock && path === '/api/users/unassign' && request.method === 'POST') {
    if (!isStrictAdmin(request, options)) return errorResponse('Forbidden', 403);
    try {
      const body = await request.json();
      const username = normalizeUsernameInput(body.username);
      const address = String(body.address || '').trim().toLowerCase();
      if (!username || !address) return errorResponse('参数不完整', 400);
      const result = await unassignMailboxFromUser(db, { username, address });
      bumpApiCacheVersion('users', 'userMailboxes', 'quota', 'mailboxes', 'mailboxInfo');
      return Response.json(result);
    } catch (e) {
      const message = String(e?.message || e || '取消分配失败');
      const status = /不存在|无效/.test(message) ? 400 : 500;
      return errorResponse('取消分配失败: ' + message, status);
    }
  }
  
  if (!isMock && request.method === 'GET' && path.startsWith('/api/users/') && path.endsWith('/mailboxes')) {
    const id = Number(path.split('/')[3]);
    if (!id) return errorResponse('无效ID', 400);
    const requesterId = Number(options?.authPayload?.userId || 0);
    const strictAdmin = isStrictAdmin(request, options);
    if (!strictAdmin && (!requesterId || requesterId !== id)) {
      return errorResponse('Forbidden', 403);
    }
    try {
      return await getCachedJsonResponse(request, options, 'userMailboxes', USER_MAILBOXES_TTL, async () => {
        const page = Math.max(parseInt(url.searchParams.get('page') || '1', 10), 1);
        const size = Math.min(Math.max(parseInt(url.searchParams.get('size') || '20', 10), 1), 200);
        const all = await getUserMailboxes(db, id, 200);
        const start = (page - 1) * size;
        return {
          list: all.slice(start, start + size),
          total: all.length
        };
      }, {
        keyParts: [String(id), String(url.searchParams.get('page') || '1'), String(url.searchParams.get('size') || '20')]
      });
    }
    catch (e) { return errorResponse('查询失败', 500); }
  }
  
  return null;
}
