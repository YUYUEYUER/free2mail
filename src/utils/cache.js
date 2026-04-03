/**
 * 缓存辅助模块 - 提供内存缓存功能
 * @module utils/cache
 */

// 缓存过期时间常量（毫秒）
const CACHE_EXPIRY = {
  MAILBOX_ID: 5 * 60 * 1000,      // 邮箱ID缓存5分钟
  USER_QUOTA: 60 * 1000,           // 用户配额缓存1分钟
  SYSTEM_STAT: 5 * 60 * 1000,      // 系统统计缓存5分钟
};

// 缓存存储
const caches = {
  mailboxId: new Map(),    // 邮箱地址 -> { id, forwardTo, expiry }
  userQuota: new Map(),    // 用户ID -> { used, limit, expiry }
  systemStat: new Map(),   // 统计键 -> { value, expiry }
};

// 进行中的查询，避免并发场景下重复打到 D1
const pendingRequests = {
  mailboxRecord: new Map(),
  userQuota: new Map(),
  systemStat: new Map(),
};

/**
 * 清理所有过期缓存
 */
export function clearExpiredCache() {
  const now = Date.now();
  for (const cache of Object.values(caches)) {
    for (const [key, entry] of cache.entries()) {
      if (entry.expiry <= now) {
        cache.delete(key);
      }
    }
  }
}

// ==================== 邮箱ID缓存 ====================

/**
 * 更新邮箱记录缓存
 * @param {string} address - 邮箱地址
 * @param {object} record - 邮箱记录
 */
export function updateMailboxRecordCache(address, record) {
  const normalized = String(address || '').trim().toLowerCase();
  if (!normalized || !record?.id) return;

  caches.mailboxId.set(normalized, {
    id: record.id,
    forwardTo: record.forwardTo || null,
    expiry: Date.now() + CACHE_EXPIRY.MAILBOX_ID
  });
}

/**
 * 从缓存获取邮箱记录，如果缓存不存在或过期则查询数据库
 * @param {object} db - 数据库连接对象
 * @param {string} address - 邮箱地址
 * @returns {Promise<object|null>} 邮箱记录
 */
export async function getCachedMailboxRecord(db, address) {
  const normalized = String(address || '').trim().toLowerCase();
  if (!normalized) return null;

  const now = Date.now();
  const cached = caches.mailboxId.get(normalized);

  if (cached && cached.expiry > now) {
    return { id: cached.id, forwardTo: cached.forwardTo || null };
  }

  const pending = pendingRequests.mailboxRecord.get(normalized);
  if (pending) {
    return pending;
  }

  const requestPromise = (async () => {
    const row = await db.prepare('SELECT id, forward_to FROM mailboxes WHERE address = ? LIMIT 1')
      .bind(normalized)
      .first();

    if (!row?.id) {
      return null;
    }

    const record = {
      id: row.id,
      forwardTo: row.forward_to || null
    };

    updateMailboxRecordCache(normalized, record);
    return record;
  })();

  pendingRequests.mailboxRecord.set(normalized, requestPromise);
  try {
    return await requestPromise;
  } finally {
    pendingRequests.mailboxRecord.delete(normalized);
  }
}

/**
 * 从缓存获取邮箱ID，如果缓存不存在或过期则查询数据库
 * @param {object} db - 数据库连接对象
 * @param {string} address - 邮箱地址
 * @returns {Promise<number|null>} 邮箱ID，如果不存在返回null
 */
export async function getCachedMailboxId(db, address) {
  const record = await getCachedMailboxRecord(db, address);
  return record?.id || null;
}

/**
 * 更新邮箱ID缓存
 * @param {string} address - 邮箱地址
 * @param {number} id - 邮箱ID
 */
export function updateMailboxIdCache(address, id) {
  const normalized = String(address || '').trim().toLowerCase();
  const cached = normalized ? caches.mailboxId.get(normalized) : null;
  updateMailboxRecordCache(address, { id, forwardTo: cached?.forwardTo || null });
}

/**
 * 使邮箱缓存失效
 * @param {string} address - 邮箱地址
 */
export function invalidateMailboxCache(address) {
  const normalized = String(address || '').trim().toLowerCase();
  if (normalized) {
    caches.mailboxId.delete(normalized);
    pendingRequests.mailboxRecord.delete(normalized);
  }
}

// ==================== 用户配额缓存 ====================

/**
 * 获取用户配额（带缓存）
 * @param {object} db - 数据库连接对象
 * @param {number} userId - 用户ID
 * @returns {Promise<object>} 包含 used 和 limit 的对象
 */
export async function getCachedUserQuota(db, userId) {
  if (!userId) return { used: 0, limit: 0 };
  
  const now = Date.now();
  const cached = caches.userQuota.get(userId);
  
  if (cached && cached.expiry > now) {
    return { used: cached.used, limit: cached.limit };
  }

  const pending = pendingRequests.userQuota.get(userId);
  if (pending) {
    return pending;
  }

  const requestPromise = (async () => {
    try {
      const userRes = await db.prepare('SELECT mailbox_limit FROM users WHERE id = ?').bind(userId).all();
      const limit = userRes?.results?.[0]?.mailbox_limit || 10;

      const countRes = await db.prepare('SELECT COUNT(1) AS c FROM user_mailboxes WHERE user_id = ?').bind(userId).all();
      const used = countRes?.results?.[0]?.c || 0;

      caches.userQuota.set(userId, {
        used,
        limit,
        expiry: Date.now() + CACHE_EXPIRY.USER_QUOTA
      });

      return { used, limit };
    } catch (error) {
      console.error('获取用户配额失败:', error);
      return { used: 0, limit: 0 };
    }
  })();

  pendingRequests.userQuota.set(userId, requestPromise);
  try {
    return await requestPromise;
  } finally {
    pendingRequests.userQuota.delete(userId);
  }
}

/**
 * 使用户配额缓存失效
 * @param {number} userId - 用户ID
 */
export function invalidateUserQuotaCache(userId) {
  if (userId) {
    caches.userQuota.delete(userId);
    pendingRequests.userQuota.delete(userId);
  }
}

// ==================== 系统统计缓存 ====================

/**
 * 获取系统统计值（带缓存）
 * @param {object} db - 数据库连接对象
 * @param {string} key - 统计键名
 * @param {Function} queryFn - 查询函数，返回统计值
 * @returns {Promise<any>} 统计值
 */
export async function getCachedSystemStat(db, key, queryFn) {
  const now = Date.now();
  const cached = caches.systemStat.get(key);
  
  if (cached && cached.expiry > now) {
    return cached.value;
  }

  const pending = pendingRequests.systemStat.get(key);
  if (pending) {
    return pending;
  }

  const requestPromise = (async () => {
    try {
      const value = await queryFn(db);
      caches.systemStat.set(key, {
        value,
        expiry: Date.now() + CACHE_EXPIRY.SYSTEM_STAT
      });
      return value;
    } catch (error) {
      console.error('获取系统统计失败:', error);
      return cached?.value ?? null;
    }
  })();

  pendingRequests.systemStat.set(key, requestPromise);
  try {
    return await requestPromise;
  } finally {
    pendingRequests.systemStat.delete(key);
  }
}

/**
 * 使系统统计缓存失效
 * @param {string} key - 统计键名
 */
export function invalidateSystemStatCache(key) {
  if (key) {
    caches.systemStat.delete(key);
    pendingRequests.systemStat.delete(key);
  }
}
