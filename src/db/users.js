/**
 * 用户数据库操作模块
 * @module db/users
 */

import {
  getCachedUserQuota,
  invalidateUserQuotaCache,
  invalidateSystemStatCache
} from '../utils/cache.js';
import { getMailboxIdByAddress } from './mailboxes.js';

const USERNAME_PATTERN = /^[a-z0-9._-]{1,64}$/;

function normalizeUsername(username) {
  const uname = String(username || '').trim().toLowerCase();
  if (!uname) throw new Error('用户名不能为空');
  if (!USERNAME_PATTERN.test(uname)) throw new Error('用户名格式无效');
  return uname;
}

/**
 * 创建新用户
 * @param {object} db - 数据库连接对象
 * @param {object} params - 用户参数对象
 * @param {string} params.username - 用户名
 * @param {string} params.passwordHash - 密码哈希值，默认为null
 * @param {string} params.role - 用户角色，默认为'user'
 * @param {number} params.mailboxLimit - 邮箱数量限制，默认为10
 * @returns {Promise<object>} 创建的用户信息对象
 * @throws {Error} 当用户名为空时抛出异常
 */
export async function createUser(db, { username, passwordHash = null, role = 'user', mailboxLimit = 10 }) {
  const uname = normalizeUsername(username);
  const r = await db.prepare('INSERT INTO users (username, password_hash, role, mailbox_limit) VALUES (?, ?, ?, ?)')
    .bind(uname, passwordHash, role, Math.max(0, Number(mailboxLimit || 10))).run();
  const res = await db.prepare('SELECT id, username, role, mailbox_limit, created_at FROM users WHERE username = ? LIMIT 1')
    .bind(uname).all();
  return res?.results?.[0];
}

/**
 * 更新用户信息
 * @param {object} db - 数据库连接对象
 * @param {number} userId - 用户ID
 * @param {object} fields - 需要更新的字段对象
 * @returns {Promise<void>} 更新完成后无返回值
 */
export async function updateUser(db, userId, fields) {
  const allowed = ['role', 'mailbox_limit', 'password_hash', 'can_send'];
  const setClauses = [];
  const values = [];
  for (const key of allowed) {
    if (key in (fields || {})) {
      setClauses.push(`${key} = ?`);
      values.push(fields[key]);
    }
  }
  if (!setClauses.length) return;
  const sql = `UPDATE users SET ${setClauses.join(', ')} WHERE id = ?`;
  values.push(userId);
  await db.prepare(sql).bind(...values).run();
  
  // 使相关缓存失效
  if ('mailbox_limit' in fields) {
    invalidateUserQuotaCache(userId);
  }
  if ('can_send' in fields) {
    invalidateSystemStatCache(`user_can_send_${userId}`);
  }
}

/**
 * 删除用户，关联表会自动级联删除
 * @param {object} db - 数据库连接对象
 * @param {number} userId - 用户ID
 * @returns {Promise<void>} 删除完成后无返回值
 */
export async function deleteUser(db, userId) {
  // 关联表启用 ON DELETE CASCADE
  await db.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();
}

/**
 * 列出用户及其邮箱数量统计
 * @param {object} db - 数据库连接对象
 * @param {object} options - 查询选项
 * @param {number} options.limit - 每页数量限制，默认50
 * @param {number} options.offset - 偏移量，默认0
 * @param {string} options.sort - 排序方向，'asc' 或 'desc'，默认'desc'
 * @returns {Promise<Array<object>>} 用户列表数组
 */
export async function listUsersWithCounts(db, { limit = 50, offset = 0, sort = 'desc' } = {}) {
  const orderDirection = (sort === 'asc') ? 'ASC' : 'DESC';
  const actualLimit = Math.max(1, Math.min(100, Number(limit) || 50));
  const actualOffset = Math.max(0, Number(offset) || 0);
  
  // 优化：先获取用户列表，再单独查询邮箱数量，避免子查询扫描全表
  const usersSql = `
    SELECT u.id, u.username, u.role, u.mailbox_limit, u.can_send, u.created_at
    FROM users u
    ORDER BY datetime(u.created_at) ${orderDirection}
    LIMIT ? OFFSET ?
  `;
  const { results: users } = await db.prepare(usersSql).bind(actualLimit, actualOffset).all();
  
  if (!users || users.length === 0) {
    return [];
  }
  
  // 批量查询这些用户的邮箱数量
  const userIds = users.map(u => u.id);
  const placeholders = userIds.map(() => '?').join(',');
  const countSql = `
    SELECT user_id, COUNT(1) AS c 
    FROM user_mailboxes 
    WHERE user_id IN (${placeholders})
    GROUP BY user_id
  `;
  const { results: counts } = await db.prepare(countSql).bind(...userIds).all();
  
  // 构建计数映射
  const countMap = new Map();
  for (const row of (counts || [])) {
    countMap.set(row.user_id, row.c);
  }
  
  // 合并结果
  return users.map(u => ({
    ...u,
    mailbox_count: countMap.get(u.id) || 0
  }));
}

async function resolveUserId(db, userId, username) {
  let uid = Number(userId || 0);
  if (uid > 0) return uid;

  const uname = normalizeUsername(username);

  const row = await db.prepare('SELECT id FROM users WHERE username = ? LIMIT 1')
    .bind(uname)
    .first();

  if (!row?.id) throw new Error('用户不存在');
  return Number(row.id);
}

/**
 * 分配邮箱给用户
 * @param {object} db - 数据库连接对象
 * @param {object} params - 分配参数对象
 * @param {number} params.userId - 用户ID，可选
 * @param {string} params.username - 用户名，可选（userId和username至少提供一个）
 * @param {string} params.address - 邮箱地址
 * @returns {Promise<object>} 分配结果对象
 * @throws {Error} 当邮箱地址无效、用户不存在或达到邮箱上限时抛出异常
 */
export async function assignMailboxToUser(db, { userId = null, username = null, address }) {
  const normalized = String(address || '').trim().toLowerCase();
  if (!normalized) throw new Error('邮箱地址无效');
  const mailboxId = await getMailboxIdByAddress(db, normalized);
  if (!mailboxId) throw new Error('邮箱不存在');

  // 获取用户 ID
  const uid = await resolveUserId(db, userId, username);

  const existingBinding = await db.prepare(
    'SELECT id FROM user_mailboxes WHERE user_id = ? AND mailbox_id = ? LIMIT 1'
  ).bind(uid, mailboxId).first();

  if (existingBinding?.id) {
    return { success: true, already_assigned: true };
  }

  // 使用缓存校验上限
  const quota = await getCachedUserQuota(db, uid);
  if (quota.used >= quota.limit) throw new Error('已达到邮箱上限');

  // 绑定（唯一约束避免重复）
  await db.prepare('INSERT OR IGNORE INTO user_mailboxes (user_id, mailbox_id) VALUES (?, ?)').bind(uid, mailboxId).run();
  
  // 使缓存失效，下次查询时会重新获取
  invalidateUserQuotaCache(uid);
  
  return { success: true };
}

/**
 * 获取用户的所有邮箱列表
 * @param {object} db - 数据库连接对象
 * @param {number} userId - 用户ID
 * @param {number} limit - 查询数量限制，默认100
 * @returns {Promise<Array<object>>} 用户邮箱列表数组，包含地址、创建时间和置顶状态
 */
export async function getUserMailboxes(db, userId, limit = 100) {
  const sql = `
    SELECT m.address, m.created_at, um.is_pinned,
           COALESCE(m.can_login, 0) AS can_login
    FROM user_mailboxes um
    JOIN mailboxes m ON m.id = um.mailbox_id
    WHERE um.user_id = ?
    ORDER BY um.is_pinned DESC, datetime(m.created_at) DESC
    LIMIT ?
  `;
  const { results } = await db.prepare(sql).bind(userId, Math.min(limit, 200)).all();
  return results || [];
}

export async function getMailboxAssignments(db, address) {
  const normalized = String(address || '').trim().toLowerCase();
  if (!normalized) throw new Error('邮箱地址无效');

  const mailbox = await db.prepare('SELECT id, address FROM mailboxes WHERE address = ? LIMIT 1')
    .bind(normalized)
    .first();

  if (!mailbox?.id) {
    return {
      address: normalized,
      mailbox_id: null,
      assigned_count: 0,
      users: []
    };
  }

  const { results } = await db.prepare(`
    SELECT u.id, u.username, u.role, u.can_send, u.mailbox_limit, um.created_at, um.is_pinned
    FROM user_mailboxes um
    JOIN users u ON u.id = um.user_id
    WHERE um.mailbox_id = ?
    ORDER BY LOWER(u.username) ASC
  `).bind(mailbox.id).all();

  const users = (results || []).map((row) => ({
    id: row.id,
    username: row.username,
    role: row.role,
    can_send: row.can_send,
    mailbox_limit: row.mailbox_limit,
    created_at: row.created_at,
    is_pinned: row.is_pinned
  }));

  return {
    address: mailbox.address,
    mailbox_id: mailbox.id,
    assigned_count: users.length,
    users
  };
}

export async function replaceMailboxAssignments(db, { address, usernames = [] }) {
  const normalizedAddress = String(address || '').trim().toLowerCase();
  if (!normalizedAddress) throw new Error('邮箱地址无效');

  const mailboxId = await getMailboxIdByAddress(db, normalizedAddress);
  if (!mailboxId) throw new Error('邮箱不存在');

  const normalizedUsernames = Array.from(new Set((Array.isArray(usernames) ? usernames : [])
    .map((username) => normalizeUsername(username))));

  const currentAssignments = await getMailboxAssignments(db, normalizedAddress);
  const currentUsernames = new Set((currentAssignments.users || []).map((user) => String(user.username || '').toLowerCase()));
  const currentAssignmentMap = new Map((currentAssignments.users || []).map((user) => [
    String(user.username || '').toLowerCase(),
    {
      created_at: user.created_at,
      is_pinned: Number(user.is_pinned || 0)
    }
  ]));

  if (!normalizedUsernames.length) {
    await db.prepare('DELETE FROM user_mailboxes WHERE mailbox_id = ?').bind(mailboxId).run();
    for (const user of currentAssignments.users || []) {
      invalidateUserQuotaCache(Number(user.id || 0));
    }
    return {
      success: true,
      address: normalizedAddress,
      assigned_count: 0,
      assigned_users: []
    };
  }

  const placeholders = normalizedUsernames.map(() => '?').join(',');
  const { results: matchedUsers } = await db.prepare(
    `SELECT id, username, mailbox_limit FROM users WHERE username IN (${placeholders})`
  ).bind(...normalizedUsernames).all();

  const users = matchedUsers || [];
  if (users.length !== normalizedUsernames.length) {
    const found = new Set(users.map((user) => String(user.username || '').toLowerCase()));
    const missing = normalizedUsernames.find((username) => !found.has(username));
    throw new Error(`用户不存在: ${missing}`);
  }

  for (const user of users) {
    const userId = Number(user.id || 0);
    const quota = await getCachedUserQuota(db, userId);
    const alreadyOwns = currentUsernames.has(String(user.username || '').toLowerCase());
    const nextUsed = quota.used + (alreadyOwns ? 0 : 1);
    if (nextUsed > quota.limit) {
      throw new Error(`用户 ${user.username} 已达到邮箱上限`);
    }
  }

  await db.exec('BEGIN');
  try {
    await db.prepare('DELETE FROM user_mailboxes WHERE mailbox_id = ?').bind(mailboxId).run();

    for (const user of users) {
      const normalizedUsername = String(user.username || '').toLowerCase();
      const existingMeta = currentAssignmentMap.get(normalizedUsername);
      await db.prepare(
        'INSERT INTO user_mailboxes (user_id, mailbox_id, created_at, is_pinned) VALUES (?, ?, COALESCE(?, CURRENT_TIMESTAMP), ?)'
      )
        .bind(Number(user.id), mailboxId, existingMeta?.created_at || null, Number(existingMeta?.is_pinned || 0))
        .run();
    }
    await db.exec('COMMIT');
  } catch (error) {
    try { await db.exec('ROLLBACK'); } catch (_) { }
    throw error;
  }

  const affectedUserIds = new Set([
    ...(currentAssignments.users || []).map((user) => Number(user.id || 0)),
    ...users.map((user) => Number(user.id || 0))
  ]);
  for (const userId of affectedUserIds) {
    invalidateUserQuotaCache(userId);
  }

  return {
    success: true,
    address: normalizedAddress,
    assigned_count: users.length,
    assigned_users: users.map((user) => String(user.username || '').toLowerCase())
  };
}

/**
 * 取消邮箱分配，解除用户与邮箱的绑定关系
 * @param {object} db - 数据库连接对象
 * @param {object} params - 取消分配参数对象
 * @param {number} params.userId - 用户ID，可选
 * @param {string} params.username - 用户名，可选（userId和username至少提供一个）
 * @param {string} params.address - 邮箱地址
 * @returns {Promise<object>} 取消分配结果对象
 * @throws {Error} 当邮箱地址无效、用户不存在或邮箱未分配给该用户时抛出异常
 */
export async function unassignMailboxFromUser(db, { userId = null, username = null, address }) {
  const normalized = String(address || '').trim().toLowerCase();
  if (!normalized) throw new Error('邮箱地址无效');
  
  // 获取邮箱ID
  const mailboxId = await getMailboxIdByAddress(db, normalized);
  if (!mailboxId) throw new Error('邮箱不存在');

  // 获取用户ID
  const uid = await resolveUserId(db, userId, username);

  // 检查绑定关系是否存在
  const checkRes = await db.prepare('SELECT id FROM user_mailboxes WHERE user_id = ? AND mailbox_id = ? LIMIT 1')
    .bind(uid, mailboxId).all();
  if (!checkRes.results || checkRes.results.length === 0) {
    throw new Error('该邮箱未分配给该用户');
  }

  // 删除绑定关系
  await db.prepare('DELETE FROM user_mailboxes WHERE user_id = ? AND mailbox_id = ?')
    .bind(uid, mailboxId).run();
  
  // 使缓存失效
  invalidateUserQuotaCache(uid);
  
  return { success: true };
}
