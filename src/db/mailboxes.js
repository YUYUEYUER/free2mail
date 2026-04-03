/**
 * 邮箱数据库操作模块
 * @module db/mailboxes
 */

import {
  getCachedMailboxId,
  getCachedMailboxRecord,
  updateMailboxRecordCache,
  invalidateSystemStatCache,
  getCachedSystemStat
} from '../utils/cache.js';

function touchMailboxAccess(db, mailboxId) {
  if (!mailboxId) return;
  db.prepare('UPDATE mailboxes SET last_accessed_at = CURRENT_TIMESTAMP WHERE id = ?')
    .bind(mailboxId)
    .run()
    .catch(() => {});
}

/**
 * 获取或创建邮箱记录，如果邮箱不存在则自动创建
 * @param {object} db - 数据库连接对象
 * @param {string} address - 邮箱地址
 * @returns {Promise<{id:number, forwardTo:string|null}>} 邮箱记录
 */
export async function getOrCreateMailboxRecord(db, address) {
  const normalized = String(address || '').trim().toLowerCase();
  if (!normalized) throw new Error('无效的邮箱地址');

  const cachedRecord = await getCachedMailboxRecord(db, normalized);
  if (cachedRecord?.id) {
    touchMailboxAccess(db, cachedRecord.id);
    return cachedRecord;
  }

  let local_part = '';
  let domain = '';
  const at = normalized.indexOf('@');
  if (at > 0 && at < normalized.length - 1) {
    local_part = normalized.slice(0, at);
    domain = normalized.slice(at + 1);
  }
  if (!local_part || !domain) throw new Error('无效的邮箱地址');

  const insertResult = await db.prepare(
    'INSERT OR IGNORE INTO mailboxes (address, local_part, domain, password_hash, last_accessed_at) VALUES (?, ?, ?, NULL, CURRENT_TIMESTAMP)'
  ).bind(normalized, local_part, domain).run();
  const didInsert = (insertResult?.meta?.changes || 0) > 0;

  const insertedId = didInsert
    ? Number(insertResult?.meta?.last_row_id || 0)
    : 0;

  if (insertedId) {
    const createdRecord = { id: insertedId, forwardTo: null };
    updateMailboxRecordCache(normalized, createdRecord);
    invalidateSystemStatCache('total_mailboxes');
    return createdRecord;
  }

  const existing = await db.prepare('SELECT id, forward_to FROM mailboxes WHERE address = ? LIMIT 1')
    .bind(normalized)
    .first();

  if (!existing?.id) {
    throw new Error('邮箱创建失败');
  }

  const existingRecord = {
    id: existing.id,
    forwardTo: existing.forward_to || null
  };
  updateMailboxRecordCache(normalized, existingRecord);
  if (didInsert) {
    invalidateSystemStatCache('total_mailboxes');
  }
  touchMailboxAccess(db, existingRecord.id);
  return existingRecord;
}

/**
 * 获取或创建邮箱ID，如果邮箱不存在则自动创建
 * @param {object} db - 数据库连接对象
 * @param {string} address - 邮箱地址
 * @returns {Promise<number>} 邮箱ID
 * @throws {Error} 当邮箱地址无效时抛出异常
 */
export async function getOrCreateMailboxId(db, address) {
  const record = await getOrCreateMailboxRecord(db, address);
  return record.id;
}

/**
 * 根据邮箱地址获取邮箱记录
 * @param {object} db - 数据库连接对象
 * @param {string} address - 邮箱地址
 * @returns {Promise<{id:number, forwardTo:string|null}|null>} 邮箱记录
 */
export async function getMailboxRecordByAddress(db, address) {
  return await getCachedMailboxRecord(db, address);
}

/**
 * 根据邮箱地址获取邮箱ID
 * @param {object} db - 数据库连接对象
 * @param {string} address - 邮箱地址
 * @returns {Promise<number|null>} 邮箱ID，如果不存在返回null
 */
export async function getMailboxIdByAddress(db, address) {
  return await getCachedMailboxId(db, address);
}

/**
 * 检查邮箱是否存在以及是否属于特定用户
 * @param {object} db - 数据库连接对象
 * @param {string} address - 邮箱地址
 * @param {number} userId - 用户ID（可选）
 * @returns {Promise<object>} 包含exists(是否存在)、ownedByUser(是否属于该用户)、mailboxId的对象
 */
export async function checkMailboxOwnership(db, address, userId = null) {
  const normalized = String(address || '').trim().toLowerCase();
  if (!normalized) return { exists: false, ownedByUser: false, mailboxId: null };
  
  // 检查邮箱是否存在
  const res = await db.prepare('SELECT id FROM mailboxes WHERE address = ? LIMIT 1').bind(normalized).all();
  if (!res.results || res.results.length === 0) {
    return { exists: false, ownedByUser: false, mailboxId: null };
  }
  
  const mailboxId = res.results[0].id;
  
  // 如果没有提供用户ID，只返回存在性检查结果
  if (!userId) {
    return { exists: true, ownedByUser: false, mailboxId };
  }
  
  // 检查邮箱是否属于该用户
  const ownerRes = await db.prepare(
    'SELECT id FROM user_mailboxes WHERE user_id = ? AND mailbox_id = ? LIMIT 1'
  ).bind(userId, mailboxId).all();
  
  const ownedByUser = ownerRes.results && ownerRes.results.length > 0;
  
  return { exists: true, ownedByUser, mailboxId };
}

/**
 * 切换邮箱的置顶状态
 * @param {object} db - 数据库连接对象
 * @param {string} address - 邮箱地址
 * @param {number} userId - 用户ID
 * @returns {Promise<object>} 包含is_pinned状态的对象
 * @throws {Error} 当邮箱地址无效、用户未登录或邮箱不存在时抛出异常
 */
export async function toggleMailboxPin(db, address, userId) {
  const normalized = String(address || '').trim().toLowerCase();
  if (!normalized) throw new Error('无效的邮箱地址');
  const uid = Number(userId || 0);
  if (!uid) throw new Error('未登录');

  // 获取邮箱 ID
  const mbRes = await db.prepare('SELECT id FROM mailboxes WHERE address = ? LIMIT 1').bind(normalized).all();
  if (!mbRes.results || mbRes.results.length === 0){
    throw new Error('邮箱不存在');
  }
  const mailboxId = mbRes.results[0].id;

  // 检查该邮箱是否属于该用户
  const umRes = await db.prepare('SELECT id, is_pinned FROM user_mailboxes WHERE user_id = ? AND mailbox_id = ? LIMIT 1')
    .bind(uid, mailboxId).all();
  if (!umRes.results || umRes.results.length === 0){
    // 若尚未存在关联记录（例如严格管理员未分配该邮箱），则创建一条仅用于个人置顶的关联
    await db.prepare('INSERT INTO user_mailboxes (user_id, mailbox_id, is_pinned) VALUES (?, ?, 1)')
      .bind(uid, mailboxId).run();
    return { is_pinned: 1 };
  }

  const currentPin = umRes.results[0].is_pinned ? 1 : 0;
  const newPin = currentPin ? 0 : 1;
  await db.prepare('UPDATE user_mailboxes SET is_pinned = ? WHERE user_id = ? AND mailbox_id = ?')
    .bind(newPin, uid, mailboxId).run();
  return { is_pinned: newPin };
}

/**
 * 获取系统中所有邮箱的总数量
 * @param {object} db - 数据库连接对象
 * @returns {Promise<number>} 系统中所有邮箱的总数量
 */
export async function getTotalMailboxCount(db) {
  try {
    // 使用缓存避免频繁的 COUNT 全表扫描
    return await getCachedSystemStat(db, 'total_mailboxes', async (db) => {
      const result = await db.prepare('SELECT COUNT(1) AS count FROM mailboxes').all();
      return result?.results?.[0]?.count || 0;
    });
  } catch (error) {
    console.error('获取系统邮箱总数失败:', error);
    return 0;
  }
}

/**
 * 获取邮箱的转发目标
 * @param {object} db - 数据库连接对象
 * @param {string} address - 邮箱地址
 * @returns {Promise<string|null>} 转发目标地址，无配置返回 null
 */
export async function getForwardTarget(db, address) {
  const record = await getMailboxRecordByAddress(db, address);
  return record?.forwardTo || null;
}
