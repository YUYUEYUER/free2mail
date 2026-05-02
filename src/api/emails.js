/**
 * 邮件 API 模块
 * @module api/emails
 */

import {
  errorResponse,
  getCachedJsonResponse,
  bumpApiCacheVersion,
  jsonResponseWithHeaders
} from './helpers.js';
import { buildMockEmails, buildMockEmailDetail } from './mock.js';
import { extractEmail } from '../utils/common.js';
import { getMailboxIdByAddress, checkMailboxOwnership } from '../db/index.js';
import { parseEmailBody } from '../email/parser.js';

const LIVE_POLL_INTERVAL_MS = 1200;
const LIVE_POLL_MAX_MS = 20000;
const LIVE_STREAM_TIMEOUT_MS = 25000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildSseFrame(event, payload) {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function escapeLikeFragment(value) {
  return String(value || '').trim().toLowerCase().replace(/[\\%_]/g, '\\$&');
}

function buildContainsPattern(value) {
  const normalized = escapeLikeFragment(value);
  return normalized ? `%${normalized}%` : '';
}

function buildFtsQuery(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';

  const tokens = trimmed.match(/[\p{L}\p{N}_@.-]+/gu)?.slice(0, 8) || [];
  if (!tokens.length) {
    return `"${trimmed.replace(/"/g, '""')}"`;
  }

  return tokens
    .map((token) => `"${String(token).replace(/"/g, '""')}"`)
    .join(' AND ');
}

function parseDateFilter(value, endOfDay = false) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const suffix = endOfDay ? 'T23:59:59.999Z' : 'T00:00:00.000Z';
    const parsed = new Date(`${trimmed}${suffix}`);
    return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString();
}

function readMessageFilters(url) {
  const read = String(url.searchParams.get('read') || 'all').trim().toLowerCase();
  const hitField = String(url.searchParams.get('hit_field') || 'all').trim().toLowerCase();
  return {
    q: String(url.searchParams.get('q') || '').trim(),
    sender: String(url.searchParams.get('sender') || '').trim(),
    code: String(url.searchParams.get('code') || '').trim(),
    hitField: ['subject', 'sender', 'preview', 'code'].includes(hitField) ? hitField : 'all',
    read: read === 'read' || read === '1' ? 'read' : (read === 'unread' || read === '0' ? 'unread' : 'all'),
    dateFrom: parseDateFilter(url.searchParams.get('date_from')),
    dateTo: parseDateFilter(url.searchParams.get('date_to'), true)
  };
}

function buildMessageWhere(mailboxId, filters, isMailboxOnly) {
  const clauses = ['mailbox_id = ?'];
  const bindings = [mailboxId];

  if (isMailboxOnly) {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    clauses.push('received_at >= ?');
    bindings.push(twentyFourHoursAgo);
  }

  if (filters?.sender) {
    clauses.push(`LOWER(sender) LIKE ? ESCAPE '\\'`);
    bindings.push(buildContainsPattern(filters.sender));
  }

  if (filters?.code) {
    clauses.push(`COALESCE(verification_code, '') = ?`);
    bindings.push(String(filters.code || '').trim());
  }

  if (filters?.read === 'read') {
    clauses.push('is_read = 1');
  } else if (filters?.read === 'unread') {
    clauses.push('is_read = 0');
  }

  if (filters?.dateFrom) {
    clauses.push('received_at >= ?');
    bindings.push(filters.dateFrom);
  }

  if (filters?.dateTo) {
    clauses.push('received_at <= ?');
    bindings.push(filters.dateTo);
  }

  const hitFieldTokens = extractSearchTokens(filters?.q);
  if (filters?.q && filters?.hitField && filters.hitField !== 'all' && hitFieldTokens.length) {
    const columnMap = {
      subject: 'subject',
      sender: 'sender',
      preview: 'preview',
      code: 'verification_code'
    };
    const targetColumn = columnMap[filters.hitField];
    if (targetColumn) {
      const likeClauses = hitFieldTokens.map(() => `LOWER(COALESCE(${targetColumn}, '')) LIKE ? ESCAPE '\\'`);
      clauses.push(`(${likeClauses.join(' OR ')})`);
      bindings.push(...hitFieldTokens.map((token) => buildContainsPattern(token)));
    }
  }

  return {
    whereSql: clauses.join(' AND '),
    bindings
  };
}

function buildMessageSearchJoin(filters, includeSnippet = false) {
  if (!filters?.q) {
    return { joinSql: '', whereSql: '', bindings: [], selectSql: `'' AS search_snippet` };
  }

  const query = buildFtsQuery(filters.q);
  if (includeSnippet) {
    return {
      joinSql: `
        JOIN (
          SELECT rowid, snippet(messages_fts, -1, '[[[H]]]', '[[[/H]]]', ' … ', 12) AS search_snippet
          FROM messages_fts
          WHERE messages_fts MATCH ?
        ) AS search_hits ON search_hits.rowid = messages.id
      `,
      whereSql: '',
      bindings: [query],
      selectSql: 'search_hits.search_snippet AS search_snippet'
    };
  }

  return {
    joinSql: 'JOIN messages_fts ON messages_fts.rowid = messages.id',
    whereSql: ' AND messages_fts MATCH ?',
    bindings: [query],
    selectSql: `'' AS search_snippet`
  };
}

function extractSearchTokens(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .match(/[\p{L}\p{N}_@.-]+/gu)
    ?.filter(Boolean)
    ?.slice(0, 8) || [];
}

function fieldContainsToken(value, tokens) {
  if (!tokens.length) return false;
  const normalized = String(value || '').toLowerCase();
  return tokens.some((token) => normalized.includes(token));
}

function attachSearchMetadata(items, filters) {
  const keywordTokens = extractSearchTokens(filters?.q);
  const senderNeedle = String(filters?.sender || '').trim().toLowerCase();
  const codeNeedle = String(filters?.code || '').trim();

  if (!keywordTokens.length && !senderNeedle && !codeNeedle) {
    return items;
  }

  return (items || []).map((item) => {
    const hitFields = [];
    if (fieldContainsToken(item.subject, keywordTokens)) hitFields.push('主题');
    if (fieldContainsToken(item.sender, keywordTokens) || (senderNeedle && String(item.sender || '').toLowerCase().includes(senderNeedle))) hitFields.push('发件人');
    if (fieldContainsToken(item.preview, keywordTokens)) hitFields.push('摘要');
    if (fieldContainsToken(item.verification_code, keywordTokens) || (codeNeedle && String(item.verification_code || '') === codeNeedle)) hitFields.push('验证码');

    return {
      ...item,
      search_hit_fields: hitFields
    };
  });
}

async function queryEmailList(db, mailboxId, filters, limit, isMailboxOnly) {
  const { whereSql, bindings } = buildMessageWhere(mailboxId, filters, isMailboxOnly);
  const search = buildMessageSearchJoin(filters, true);
  const { results } = await db.prepare(`
    SELECT messages.id, messages.sender, messages.subject, messages.received_at, messages.is_read, messages.preview, messages.verification_code, ${search.selectSql}
    FROM messages
    ${search.joinSql}
    WHERE ${whereSql}${search.whereSql}
    ORDER BY received_at DESC, id DESC
    LIMIT ?
  `).bind(...search.bindings, ...bindings, limit).all();
  return attachSearchMetadata(results || [], filters);
}

async function queryEmailDelta(db, mailboxId, filters, sinceId, limit, isMailboxOnly) {
  const { whereSql, bindings } = buildMessageWhere(mailboxId, filters, isMailboxOnly);
  const search = buildMessageSearchJoin(filters, true);
  const { results } = await db.prepare(`
    SELECT messages.id, messages.sender, messages.subject, messages.received_at, messages.is_read, messages.preview, messages.verification_code, ${search.selectSql}
    FROM messages
    ${search.joinSql}
    WHERE ${whereSql}${search.whereSql} AND messages.id > ?
    ORDER BY received_at DESC, id DESC
    LIMIT ?
  `).bind(...search.bindings, ...bindings, sinceId, limit).all();
  return attachSearchMetadata(results || [], filters);
}

async function getLatestMatchingEmail(db, mailboxId, filters, isMailboxOnly) {
  const { whereSql, bindings } = buildMessageWhere(mailboxId, filters, isMailboxOnly);
  const search = buildMessageSearchJoin(filters, false);
  const row = await db.prepare(`
    SELECT messages.id, messages.received_at
    FROM messages
    ${search.joinSql}
    WHERE ${whereSql}${search.whereSql}
    ORDER BY received_at DESC, id DESC
    LIMIT 1
  `).bind(...search.bindings, ...bindings).first();
  return row || null;
}

async function readRawEmailFromStorage(r2, objectKey) {
  if (!r2 || !objectKey) return '';
  const obj = await r2.get(objectKey);
  if (!obj) return '';
  if (typeof obj.text === 'function') return await obj.text();
  if (typeof obj.arrayBuffer === 'function') return await new Response(await obj.arrayBuffer()).text();
  return await new Response(obj.body).text();
}

function buildFallbackRawEmail(row, content, htmlContent) {
  const subject = String(row?.subject || '(无主题)');
  const sender = String(row?.sender || 'unknown@example.com');
  const toAddrs = String(row?.to_addrs || 'unknown@example.com');
  const receivedAt = String(row?.received_at || new Date().toUTCString());

  if (htmlContent) {
    const boundary = `mf-${String(row?.id || Date.now())}`;
    return [
      `From: <${sender}>`,
      `To: ${toAddrs}`,
      `Subject: ${subject}`,
      `Date: ${receivedAt}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset="utf-8"',
      'Content-Transfer-Encoding: 8bit',
      '',
      content || '',
      `--${boundary}`,
      'Content-Type: text/html; charset="utf-8"',
      'Content-Transfer-Encoding: 8bit',
      '',
      htmlContent,
      `--${boundary}--`,
      ''
    ].join('\r\n');
  }

  return [
    `From: <${sender}>`,
    `To: ${toAddrs}`,
    `Subject: ${subject}`,
    `Date: ${receivedAt}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="utf-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    content || '',
    ''
  ].join('\r\n');
}

function buildDetailResponse(emailId, row, content, htmlContent) {
  return {
    ...row,
    content,
    html_content: htmlContent,
    download: row?.r2_object_key ? `/api/email/${emailId}/download` : '',
    raw_url: `/api/email/${emailId}/raw`,
    available_views: {
      html: Boolean(htmlContent),
      text: Boolean(content),
      raw: Boolean(row?.r2_object_key || content || htmlContent)
    }
  };
}

/**
 * 处理邮件相关 API
 * @param {Request} request - HTTP 请求
 * @param {object} db - 数据库连接
 * @param {URL} url - 请求 URL
 * @param {string} path - 请求路径
 * @param {object} options - 选项
 * @returns {Promise<Response|null>} 响应或 null
 */
export async function handleEmailsApi(request, db, url, path, options) {
  const isMock = !!options.mockOnly;
  const isMailboxOnly = !!options.mailboxOnly;
  const r2 = options.r2;
  const EMAIL_LIST_TTL = 8 * 1000;
  const EMAIL_BATCH_TTL = 8 * 1000;

  async function ensureReadableMailbox(address) {
    const normalized = extractEmail(address).trim().toLowerCase();
    if (!normalized) {
      return { error: errorResponse('缺少 mailbox 参数', 400), mailboxId: null, normalized: '' };
    }

    const mailboxId = await getMailboxIdByAddress(db, normalized);
    if (!mailboxId) {
      return { error: null, mailboxId: null, normalized };
    }

    if (isMailboxOnly) {
      return { error: null, mailboxId, normalized };
    }

    const userId = Number(options?.authPayload?.userId || 0);
    const role = String(options?.authPayload?.role || '');
    if (userId > 0 && role !== 'admin') {
      const ownership = await checkMailboxOwnership(db, normalized, userId);
      if (!ownership.ownedByUser) {
        return { error: errorResponse('无权访问该邮箱', 403), mailboxId: null, normalized };
      }
    }

    return { error: null, mailboxId, normalized };
  }

  async function ensureReadableMessage(messageId) {
    if (isMock || isMailboxOnly) return null;

    const userId = Number(options?.authPayload?.userId || 0);
    const role = String(options?.authPayload?.role || '');
    if (!userId || role === 'admin') return null;

    const row = await db.prepare('SELECT mailbox_id FROM messages WHERE id = ? LIMIT 1').bind(messageId).first();
    if (!row?.mailbox_id) return errorResponse('未找到邮件', 404);

    const ownership = await db.prepare(
      'SELECT id FROM user_mailboxes WHERE user_id = ? AND mailbox_id = ? LIMIT 1'
    ).bind(userId, Number(row.mailbox_id)).first();

    if (!ownership?.id) {
      return errorResponse('无权访问此邮件', 403);
    }

    return null;
  }

  async function ensureReadableMessages(messageIds) {
    if (isMock || isMailboxOnly) return null;

    const userId = Number(options?.authPayload?.userId || 0);
    const role = String(options?.authPayload?.role || '');
    if (!userId || role === 'admin') return null;
    if (!Array.isArray(messageIds) || !messageIds.length) return null;

    const placeholders = messageIds.map(() => '?').join(',');
    const { results } = await db.prepare(
      `SELECT id, mailbox_id FROM messages WHERE id IN (${placeholders})`
    ).bind(...messageIds).all();

    const rows = results || [];
    if (rows.length !== messageIds.length) {
      return errorResponse('未找到邮件', 404);
    }

    const mailboxIds = Array.from(new Set(rows.map((row) => Number(row.mailbox_id || 0)).filter((id) => id > 0)));
    if (!mailboxIds.length) {
      return errorResponse('未找到邮件', 404);
    }

    const mailboxPlaceholders = mailboxIds.map(() => '?').join(',');
    const { results: ownedRows } = await db.prepare(
      `SELECT mailbox_id FROM user_mailboxes WHERE user_id = ? AND mailbox_id IN (${mailboxPlaceholders})`
    ).bind(userId, ...mailboxIds).all();

    const ownedMailboxIds = new Set((ownedRows || []).map((row) => Number(row.mailbox_id || 0)));
    if (mailboxIds.some((mailboxId) => !ownedMailboxIds.has(mailboxId))) {
      return errorResponse('无权访问部分邮件', 403);
    }

    return null;
  }

  // 获取邮件列表（支持搜索过滤）
  if (path === '/api/emails' && request.method === 'GET') {
    const mailbox = url.searchParams.get('mailbox');
    if (!mailbox) {
      return errorResponse('缺少 mailbox 参数', 400);
    }

    const filters = readMessageFilters(url);
    const requestedLimit = parseInt(url.searchParams.get('limit') || '50', 10);
    const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 100)) : 50;

    return getCachedJsonResponse(request, options, 'emails', EMAIL_LIST_TTL, async () => {
      if (isMock) {
        return buildMockEmails(6);
      }

      const { error, mailboxId, normalized } = await ensureReadableMailbox(mailbox);
      if (error) return error;
      if (!mailboxId) return [];

      const results = await queryEmailList(db, mailboxId, filters, limit, isMailboxOnly);
      return results;
    }, {
      keyParts: [String(mailbox).toLowerCase(), JSON.stringify(filters), String(limit)]
    }).catch((e) => {
      console.error('查询邮件失败:', e);
      return errorResponse('查询邮件失败', 500);
    });
  }

  // 长轮询监听匹配结果变化
  if (path === '/api/emails/live' && request.method === 'GET') {
    const mailbox = url.searchParams.get('mailbox');
    if (!mailbox) {
      return errorResponse('缺少 mailbox 参数', 400);
    }

    const sinceId = Math.max(0, parseInt(url.searchParams.get('since_id') || '0', 10) || 0);
    const waitSeconds = Math.min(Math.max(parseInt(url.searchParams.get('timeout') || '18', 10) || 18, 5), Math.floor(LIVE_POLL_MAX_MS / 1000));
    const filters = readMessageFilters(url);

    if (isMock) {
      const latestId = 1000;
      return jsonResponseWithHeaders({
        changed: latestId !== sinceId,
        latestId,
        latestReceivedAt: new Date().toISOString(),
        timeout: latestId === sinceId
      }, 200, { 'Cache-Control': 'no-store' });
    }

    try {
      const { error, mailboxId } = await ensureReadableMailbox(mailbox);
      if (error) return error;
      if (!mailboxId) {
        return jsonResponseWithHeaders({ changed: false, latestId: 0, latestReceivedAt: null, timeout: true }, 200, { 'Cache-Control': 'no-store' });
      }

      const initial = await getLatestMatchingEmail(db, mailboxId, filters, isMailboxOnly);
      if ((initial?.id || 0) !== sinceId) {
        return jsonResponseWithHeaders({
          changed: true,
          latestId: initial?.id || 0,
          latestReceivedAt: initial?.received_at || null,
          timeout: false
        }, 200, { 'Cache-Control': 'no-store' });
      }

      const deadline = Date.now() + waitSeconds * 1000;
      while (Date.now() < deadline) {
        await sleep(LIVE_POLL_INTERVAL_MS);
        const latest = await getLatestMatchingEmail(db, mailboxId, filters, isMailboxOnly);
        if ((latest?.id || 0) !== sinceId) {
          return jsonResponseWithHeaders({
            changed: true,
            latestId: latest?.id || 0,
            latestReceivedAt: latest?.received_at || null,
            timeout: false
          }, 200, { 'Cache-Control': 'no-store' });
        }
      }

      return jsonResponseWithHeaders({
        changed: false,
        latestId: initial?.id || 0,
        latestReceivedAt: initial?.received_at || null,
        timeout: true
      }, 200, { 'Cache-Control': 'no-store' });
    } catch (e) {
      console.error('实时监听失败:', e);
      return errorResponse('实时监听失败', 500);
    }
  }

  // SSE 实时流
  if (path === '/api/emails/stream' && request.method === 'GET') {
    const mailbox = url.searchParams.get('mailbox');
    if (!mailbox) {
      return errorResponse('缺少 mailbox 参数', 400);
    }

    const sinceId = Math.max(0, parseInt(url.searchParams.get('since_id') || '0', 10) || 0);
    const waitMs = Math.min(
      Math.max(parseInt(url.searchParams.get('timeout_ms') || String(LIVE_STREAM_TIMEOUT_MS), 10) || LIVE_STREAM_TIMEOUT_MS, 5000),
      LIVE_STREAM_TIMEOUT_MS
    );
    const filters = readMessageFilters(url);

    if (isMock) {
      const latest = buildMockEmails(6)[0] || null;
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('retry: 1500\n\n'));
          controller.enqueue(encoder.encode(buildSseFrame('ready', { latestId: latest?.id || 0, latestReceivedAt: latest?.received_at || null })));
          controller.enqueue(encoder.encode(buildSseFrame('timeout', { latestId: latest?.id || 0, latestReceivedAt: latest?.received_at || null })));
          controller.close();
        }
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-store',
          'Connection': 'keep-alive'
        }
      });
    }

    try {
      const { error, mailboxId } = await ensureReadableMailbox(mailbox);
      if (error) return error;
      if (!mailboxId) {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode('retry: 1500\n\n'));
            controller.enqueue(encoder.encode(buildSseFrame('ready', { latestId: 0, latestReceivedAt: null })));
            controller.enqueue(encoder.encode(buildSseFrame('timeout', { latestId: 0, latestReceivedAt: null })));
            controller.close();
          }
        });
        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-store',
            'Connection': 'keep-alive'
          }
        });
      }

      const initial = await getLatestMatchingEmail(db, mailboxId, filters, isMailboxOnly);
      const encoder = new TextEncoder();

      const stream = new ReadableStream({
        start(controller) {
          let closed = false;
          const close = () => {
            if (closed) return;
            closed = true;
            controller.close();
          };
          const push = (event, payload) => {
            if (closed) return;
            controller.enqueue(encoder.encode(buildSseFrame(event, payload)));
          };

          controller.enqueue(encoder.encode('retry: 1500\n\n'));
          push('ready', {
            latestId: initial?.id || 0,
            latestReceivedAt: initial?.received_at || null
          });

          if ((initial?.id || 0) !== sinceId) {
            push('change', {
              latestId: initial?.id || 0,
              latestReceivedAt: initial?.received_at || null
            });
            close();
            return;
          }

          (async () => {
            const deadline = Date.now() + waitMs;
            let nextHeartbeatAt = Date.now() + 12000;

            while (!closed && Date.now() < deadline) {
              await sleep(LIVE_POLL_INTERVAL_MS);
              if (closed) return;

              const latest = await getLatestMatchingEmail(db, mailboxId, filters, isMailboxOnly);
              if ((latest?.id || 0) !== sinceId) {
                push('change', {
                  latestId: latest?.id || 0,
                  latestReceivedAt: latest?.received_at || null
                });
                close();
                return;
              }

              if (Date.now() >= nextHeartbeatAt) {
                push('heartbeat', {
                  latestId: latest?.id || 0,
                  latestReceivedAt: latest?.received_at || null
                });
                nextHeartbeatAt = Date.now() + 12000;
              }
            }

            push('timeout', {
              latestId: initial?.id || 0,
              latestReceivedAt: initial?.received_at || null
            });
            close();
          })().catch((error) => {
            console.error('SSE 邮件流失败:', error);
            try {
              push('error', { message: 'stream_failed' });
            } catch (_) { }
            close();
          });
        },
        cancel() {
          // 客户端主动断开时，ReadableStream 会自行结束
        }
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-store',
          'Connection': 'keep-alive'
        }
      });
    } catch (e) {
      console.error('创建 SSE 邮件流失败:', e);
      return errorResponse('创建实时流失败', 500);
    }
  }

  // 获取比当前列表更新的增量邮件
  if (path === '/api/emails/delta' && request.method === 'GET') {
    const mailbox = url.searchParams.get('mailbox');
    if (!mailbox) {
      return errorResponse('缺少 mailbox 参数', 400);
    }

    const sinceId = Math.max(0, parseInt(url.searchParams.get('since_id') || '0', 10) || 0);
    const requestedLimit = parseInt(url.searchParams.get('limit') || '20', 10);
    const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 30)) : 20;
    const filters = readMessageFilters(url);

    if (isMock) {
      return jsonResponseWithHeaders([], 200, { 'Cache-Control': 'no-store' });
    }

    try {
      const { error, mailboxId } = await ensureReadableMailbox(mailbox);
      if (error) return error;
      if (!mailboxId) {
        return jsonResponseWithHeaders([], 200, { 'Cache-Control': 'no-store' });
      }

      const results = await queryEmailDelta(db, mailboxId, filters, sinceId, limit, isMailboxOnly);
      return jsonResponseWithHeaders(results, 200, { 'Cache-Control': 'no-store' });
    } catch (e) {
      console.error('查询增量邮件失败:', e);
      return errorResponse('查询增量邮件失败', 500);
    }
  }

  // 批量查询邮件详情
  if (path === '/api/emails/batch' && request.method === 'GET') {
    const idsParam = String(url.searchParams.get('ids') || '').trim();
    if (!idsParam) return Response.json([]);
    const ids = idsParam.split(',').map((s) => parseInt(s, 10)).filter((n) => Number.isInteger(n) && n > 0);
    if (!ids.length) return Response.json([]);

    if (ids.length > 50) {
      return errorResponse('单次最多查询50封邮件', 400);
    }

    return getCachedJsonResponse(request, options, 'emailsBatch', EMAIL_BATCH_TTL, async () => {
      if (isMock) {
        return ids.map((id) => buildMockEmailDetail(id));
      }

      const authError = await ensureReadableMessages(ids);
      if (authError) return authError;

      let timeFilter = '';
      let timeParam = [];
      if (isMailboxOnly) {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        timeFilter = ' AND received_at >= ?';
        timeParam = [twentyFourHoursAgo];
      }

      const placeholders = ids.map(() => '?').join(',');
      const { results } = await db.prepare(`
        SELECT id, sender, to_addrs, subject, verification_code, preview, r2_bucket, r2_object_key, received_at, is_read
        FROM messages WHERE id IN (${placeholders})${timeFilter}
      `).bind(...ids, ...timeParam).all();
      return results || [];
    }, {
      keyParts: [ids.join(',')]
    }).catch(() => errorResponse('批量查询失败', 500));
  }

  // 清空邮箱邮件
  if (request.method === 'DELETE' && path === '/api/emails') {
    if (isMock) return errorResponse('演示模式不可清空', 403);
    const mailbox = url.searchParams.get('mailbox');
    if (!mailbox) {
      return errorResponse('缺少 mailbox 参数', 400);
    }
    try {
      const { error, mailboxId } = await ensureReadableMailbox(mailbox);
      if (error) return error;
      if (!mailboxId) {
        return Response.json({ success: true, deletedCount: 0 });
      }

      const result = await db.prepare('DELETE FROM messages WHERE mailbox_id = ?').bind(mailboxId).run();
      const deletedCount = result?.meta?.changes || 0;

      bumpApiCacheVersion('emails', 'emailsBatch');
      return Response.json({ success: true, deletedCount });
    } catch (e) {
      console.error('清空邮件失败:', e);
      return errorResponse('清空邮件失败', 500);
    }
  }

  // 下载 EML（从 R2 获取）- 必须在通用邮件详情处理器之前
  if (request.method === 'GET' && path.startsWith('/api/email/') && path.endsWith('/download')) {
    if (options.mockOnly) return errorResponse('演示模式不可下载', 403);
    const id = path.split('/')[3];
    const authError = await ensureReadableMessage(id);
    if (authError) return authError;
    const { results } = await db.prepare('SELECT r2_bucket, r2_object_key FROM messages WHERE id = ?').bind(id).all();
    const row = (results || [])[0];
    if (!row || !row.r2_object_key) return errorResponse('未找到对象', 404);
    try {
      if (!r2) return errorResponse('R2 未绑定', 500);
      const obj = await r2.get(row.r2_object_key);
      if (!obj) return errorResponse('对象不存在', 404);
      const headers = new Headers({ 'Content-Type': 'message/rfc822' });
      headers.set('Content-Disposition', `attachment; filename="${String(row.r2_object_key).split('/').pop()}"`);
      return new Response(obj.body, { headers });
    } catch (_) {
      return errorResponse('下载失败', 500);
    }
  }

  // 查看原始 EML
  if (request.method === 'GET' && path.startsWith('/api/email/') && path.endsWith('/raw')) {
    const emailId = path.split('/')[3];
    const authError = await ensureReadableMessage(emailId);
    if (authError) return authError;

    if (isMock) {
      const detail = buildMockEmailDetail(emailId);
      const raw = buildFallbackRawEmail(detail, detail.content || '', detail.html_content || '');
      return new Response(raw, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
    }

    try {
      const row = await db.prepare(`
        SELECT id, sender, to_addrs, subject, r2_object_key, received_at
        FROM messages WHERE id = ?
      `).bind(emailId).first();

      if (!row) return errorResponse('未找到邮件', 404);

      const raw = await readRawEmailFromStorage(r2, row.r2_object_key);
      if (raw) {
        return new Response(raw, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
      }

      const fallback = await db.prepare('SELECT content, html_content FROM messages WHERE id = ?').bind(emailId).first();
      const syntheticRaw = buildFallbackRawEmail(row, fallback?.content || '', fallback?.html_content || '');
      return new Response(syntheticRaw, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
    } catch (e) {
      console.error('读取原始邮件失败:', e);
      return errorResponse('读取原始邮件失败', 500);
    }
  }

  // 获取单封邮件详情
  if (request.method === 'GET' && path.startsWith('/api/email/')) {
    const emailId = path.split('/')[3];
    const authError = await ensureReadableMessage(emailId);
    if (authError) return authError;
    if (isMock) {
      const detail = buildMockEmailDetail(emailId);
      return Response.json({
        ...detail,
        raw_url: `/api/email/${emailId}/raw`,
        available_views: {
          html: Boolean(detail.html_content),
          text: Boolean(detail.content),
          raw: true
        }
      });
    }
    try {
      let timeFilter = '';
      let timeParam = [];
      if (isMailboxOnly) {
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        timeFilter = ' AND received_at >= ?';
        timeParam = [twentyFourHoursAgo];
      }

      const { results } = await db.prepare(`
        SELECT id, sender, to_addrs, subject, verification_code, preview, r2_bucket, r2_object_key, received_at, is_read
        FROM messages WHERE id = ?${timeFilter}
      `).bind(emailId, ...timeParam).all();
      if (results.length === 0) {
        if (isMailboxOnly) {
          return errorResponse('邮件不存在或已超过24小时访问期限', 404);
        }
        return errorResponse('未找到邮件', 404);
      }
      await db.prepare('UPDATE messages SET is_read = 1 WHERE id = ?').bind(emailId).run();
      const row = results[0];
      let content = '';
      let htmlContent = '';

      try {
        const raw = await readRawEmailFromStorage(r2, row.r2_object_key);
        if (raw) {
          const parsed = parseEmailBody(raw);
          content = parsed.text || '';
          htmlContent = parsed.html || '';
        }
      } catch (_) { }

      if (!content && !htmlContent) {
        try {
          const fallback = await db.prepare('SELECT content, html_content FROM messages WHERE id = ?').bind(emailId).all();
          const legacy = (fallback?.results || [])[0] || {};
          content = legacy.content || '';
          htmlContent = legacy.html_content || '';
        } catch (_) { }
      }

      return Response.json(buildDetailResponse(emailId, row, content, htmlContent));
    } catch (e) {
      try {
        const { results } = await db.prepare(`
          SELECT id, sender, to_addrs, subject, content, html_content, received_at, is_read
          FROM messages WHERE id = ?
        `).bind(emailId).all();
        if (!results || !results.length) return errorResponse('未找到邮件', 404);
        await db.prepare('UPDATE messages SET is_read = 1 WHERE id = ?').bind(emailId).run();
        const row = results[0];
        return Response.json(buildDetailResponse(emailId, row, row.content || '', row.html_content || ''));
      } catch (_) {
        return errorResponse('未找到邮件', 404);
      }
    }
  }

  // 快速标记单封邮件已读
  if (request.method === 'POST' && path.startsWith('/api/email/') && path.endsWith('/read')) {
    if (isMock) {
      return Response.json({ success: true, updated: true, is_read: 1 });
    }

    const emailId = path.split('/')[3];
    if (!emailId || !Number.isInteger(parseInt(emailId, 10))) {
      return errorResponse('无效的邮件ID', 400);
    }

    const authError = await ensureReadableMessage(emailId);
    if (authError) return authError;

    try {
      const result = await db.prepare('UPDATE messages SET is_read = 1 WHERE id = ?').bind(emailId).run();
      const updated = (result?.meta?.changes || 0) > 0;

      if (updated) {
        bumpApiCacheVersion('emails', 'emailsBatch');
      }

      return Response.json({ success: true, updated, is_read: 1 });
    } catch (e) {
      console.error('标记邮件已读失败:', e);
      return errorResponse('标记邮件已读失败', 500);
    }
  }

  // 删除单封邮件
  if (request.method === 'DELETE' && path.startsWith('/api/email/')) {
    if (isMock) return errorResponse('演示模式不可删除', 403);
    const emailId = path.split('/')[3];

    if (!emailId || !Number.isInteger(parseInt(emailId, 10))) {
      return errorResponse('无效的邮件ID', 400);
    }

    const authError = await ensureReadableMessage(emailId);
    if (authError) return authError;

    try {
      const result = await db.prepare('DELETE FROM messages WHERE id = ?').bind(emailId).run();
      const deleted = (result?.meta?.changes || 0) > 0;

      bumpApiCacheVersion('emails', 'emailsBatch');
      return Response.json({
        success: true,
        deleted,
        message: deleted ? '邮件已删除' : '邮件不存在或已被删除'
      });
    } catch (e) {
      console.error('删除邮件失败:', e);
      return errorResponse(`删除邮件时发生错误: ${e.message}`, 500);
    }
  }

  return null;
}
