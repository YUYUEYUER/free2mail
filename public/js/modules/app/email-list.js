/**
 * 邮件列表模块
 * @module modules/app/email-list
 */

import { formatTs, formatTsMobile, extractCode, escapeHtml } from './ui-helpers.js';
import { getCurrentMailbox } from './mailbox-state.js';

const PAGE_SIZE = 8;

let currentPage = 1;
let lastLoadedEmails = [];
let isSentView = false;
let selectedEmailId = 0;

const emailCache = new Map();
const viewLoaded = new Set();

function renderHighlightedSnippet(snippet) {
  return escapeHtml(String(snippet || ''))
    .replace(/\[\[\[H\]\]\]/g, '<mark>')
    .replace(/\[\[\[\/H\]\]\]/g, '</mark>');
}

function renderSearchHitTags(hitFields) {
  const fields = Array.isArray(hitFields) ? hitFields.filter(Boolean) : [];
  if (!fields.length) return '';
  return `<div class="search-hit-tags">${fields.map((field) => `<span class="search-hit-tag">${escapeHtml(field)}</span>`).join('')}</div>`;
}

function getViewKey() {
  return `${getCurrentMailbox()}:${isSentView ? 'sent' : 'inbox'}`;
}

function buildEmailPresentation(email, isMobile = false) {
  const rawContent = isSentView
    ? (email.text_content || email.html_content || '')
    : (email.preview || email.content || email.html_content || '');
  const snippetSource = !isSentView ? String(email.search_snippet || '').trim() : '';

  let preview = '';
  let previewHtml = '';
  if (snippetSource) {
    preview = snippetSource.replace(/\[\[\[H\]\]\]|\[\[\[\/H\]\]\]/g, '').replace(/\s+/g, ' ').trim();
    previewHtml = renderHighlightedSnippet(snippetSource);
  } else if (rawContent) {
    preview = rawContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const codeMatch = (email.verification_code || '').toString().trim() || extractCode(rawContent);
    if (codeMatch) {
      preview = `验证码: ${codeMatch} | ${preview}`;
    }
    preview = preview.slice(0, isMobile ? 42 : 88);
    previewHtml = escapeHtml(preview);
  }

  let recipientsDisplay = '';
  if (isSentView) {
    const rawRecipients = (email.recipients || email.to_addrs || '').toString();
    const recipients = rawRecipients.split(',').map((item) => item.trim()).filter(Boolean);
    if (recipients.length) {
      recipientsDisplay = recipients.slice(0, 2).join(', ');
      if (recipients.length > 2) recipientsDisplay += ` 等${recipients.length}人`;
    } else {
      recipientsDisplay = rawRecipients;
    }
  }

  return {
    preview,
    hasContent: preview.length > 0,
    listCode: (email.verification_code || '').toString().trim() || extractCode(rawContent || ''),
    senderText: escapeHtml(email.sender || ''),
    recipientsText: escapeHtml(recipientsDisplay),
    subjectText: escapeHtml(email.subject || '(无主题)'),
    previewText: previewHtml || escapeHtml(preview),
    searchTagsHtml: renderSearchHitTags(email.search_hit_fields),
    metaLabel: isSentView ? '收件人' : '发件人',
    metaText: isSentView ? escapeHtml(recipientsDisplay) : escapeHtml(email.sender || ''),
    timeDisplay: isMobile ? formatTsMobile(email.received_at || email.created_at) : formatTs(email.received_at || email.created_at)
  };
}

function buildEmailItemClasses(email) {
  const classes = ['email-item', 'clickable'];
  if (!isSentView && !email.is_read) classes.push('unread');
  if (!isSentView && selectedEmailId && Number(selectedEmailId) === Number(email.id)) classes.push('is-selected');
  return classes.join(' ');
}

function getEmailItemSignature(email, isMobile = false) {
  const presentation = buildEmailPresentation(email, isMobile);
  return JSON.stringify({
    id: email.id,
    sent: isSentView,
    mobile: isMobile,
    sender: email.sender || '',
    recipients: email.recipients || email.to_addrs || '',
    subject: email.subject || '',
    preview: presentation.preview,
    snippet: email.search_snippet || '',
    hitFields: Array.isArray(email.search_hit_fields) ? email.search_hit_fields.join('|') : '',
    code: presentation.listCode || '',
    read: email.is_read ? 1 : 0,
    status: email.status || '',
    time: email.received_at || email.created_at || '',
    selected: selectedEmailId && Number(selectedEmailId) === Number(email.id) ? 1 : 0
  });
}

function createEmailItemNode(email, isMobile = false) {
  const template = document.createElement('template');
  template.innerHTML = renderEmailItem(email, isMobile).trim();
  return template.content.firstElementChild;
}

function applySelectionState(root = document) {
  root.querySelectorAll?.('.email-item[data-email-id]').forEach((node) => {
    node.classList.toggle('is-selected', Number(node.dataset.emailId || 0) === Number(selectedEmailId || 0));
  });
}

function sortEmailsDesc(a, b) {
  const timeA = Date.parse(a?.received_at || a?.created_at || 0) || 0;
  const timeB = Date.parse(b?.received_at || b?.created_at || 0) || 0;
  if (timeA !== timeB) return timeB - timeA;
  return Number(b?.id || 0) - Number(a?.id || 0);
}

function getVisiblePageItems(elements) {
  const total = lastLoadedEmails.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  renderPager(elements);
  return lastLoadedEmails.slice(start, end);
}

export function renderPager(elements) {
  try {
    const total = Array.isArray(lastLoadedEmails) ? lastLoadedEmails.length : 0;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (!elements.pager) return;
    elements.pager.style.display = total > PAGE_SIZE ? 'flex' : 'none';
    if (elements.pageInfo) elements.pageInfo.textContent = `${currentPage} / ${totalPages}`;
    if (elements.prevPage) elements.prevPage.disabled = currentPage <= 1;
    if (elements.nextPage) elements.nextPage.disabled = currentPage >= totalPages;
  } catch (_) { }
}

export function sliceByPage(items, elements) {
  lastLoadedEmails = Array.isArray(items) ? items : [];
  return getVisiblePageItems(elements);
}

export function mergeNewEmails(items, elements, options = {}) {
  const maxItems = Number(options.maxItems || 50);
  const merged = new Map();

  for (const email of [...(Array.isArray(items) ? items : []), ...lastLoadedEmails]) {
    if (!email?.id) continue;
    const existing = merged.get(email.id);
    merged.set(email.id, existing ? { ...existing, ...email } : email);
  }

  lastLoadedEmails = Array.from(merged.values()).sort(sortEmailsDesc);
  if (maxItems > 0 && lastLoadedEmails.length > maxItems) {
    lastLoadedEmails = lastLoadedEmails.slice(0, maxItems);
  }

  return getVisiblePageItems(elements);
}

export function prevPage(refresh) {
  if (currentPage > 1) {
    currentPage -= 1;
    refresh();
  }
}

export function nextPage(refresh) {
  const total = lastLoadedEmails.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (currentPage < totalPages) {
    currentPage += 1;
    refresh();
  }
}

export function resetPager(elements) {
  currentPage = 1;
  lastLoadedEmails = [];
  selectedEmailId = 0;
  renderPager(elements);
}

export function setView(sent) {
  isSentView = sent;
  if (sent) selectedEmailId = 0;
}

export function isSentViewActive() {
  return isSentView;
}

export function statusClass(status) {
  const map = {
    queued: 'status-queued',
    delivered: 'status-delivered',
    failed: 'status-failed',
    processing: 'status-processing'
  };
  return map[status] || '';
}

export function renderEmailItem(email, isMobile = false) {
  const presentation = buildEmailPresentation(email, isMobile);
  return `
    <div class="${buildEmailItemClasses(email)}" data-email-id="${Number(email.id || 0)}" onclick="${isSentView ? `showSentEmail(${email.id})` : `showEmail(${email.id})`}">
      <div class="email-meta">
        <span class="meta-from"><span class="meta-label">${presentation.metaLabel}</span><span class="meta-from-text">${presentation.metaText}</span></span>
        <span class="email-time">${presentation.timeDisplay}</span>
      </div>
      <div class="email-content">
        <div class="email-main">
          <div class="email-line"><span class="label-chip">主题</span><span class="value-text subject">${presentation.subjectText}</span></div>
          ${presentation.searchTagsHtml}
          <div class="email-line"><span class="label-chip">内容</span>${presentation.hasContent ? `<span class="email-preview value-text">${presentation.previewText}</span>` : '<span class="email-preview value-text" style="color:#94a3b8">(暂无预览)</span>'}</div>
        </div>
        <div class="email-actions">
          ${isSentView ? `
            <span class="status-badge ${statusClass(email.status)}">${email.status || 'unknown'}</span>
            <button class="btn btn-danger btn-sm" onclick="deleteSent(${email.id});event.stopPropagation()" title="删除记录">删除</button>
          ` : `
            <button class="btn btn-secondary btn-sm" data-code="${presentation.listCode || ''}" onclick="copyFromList(event, ${email.id});event.stopPropagation()" title="复制内容或验证码">复制</button>
            <button class="btn btn-danger btn-sm" onclick="deleteEmail(${email.id});event.stopPropagation()" title="删除邮件">删除</button>
          `}
        </div>
      </div>
    </div>`;
}

export function syncEmailList(items, elements, isMobile = false) {
  const list = elements?.list;
  if (!list) return;

  const viewport = list.closest('.list-viewport');
  const previousScrollTop = viewport?.scrollTop ?? 0;
  const existingNodes = new Map(
    Array.from(list.querySelectorAll('.email-item[data-email-id]')).map((node) => [Number(node.dataset.emailId || 0), node])
  );

  items.forEach((email, index) => {
    const emailId = Number(email.id || 0);
    const signature = getEmailItemSignature(email, isMobile);
    let node = existingNodes.get(emailId);

    if (!node) {
      node = createEmailItemNode(email, isMobile);
    } else if (node.dataset.signature !== signature) {
      const replacement = createEmailItemNode(email, isMobile);
      node.replaceWith(replacement);
      node = replacement;
    } else {
      node.className = buildEmailItemClasses(email);
    }

    node.dataset.signature = signature;
    existingNodes.delete(emailId);

    const referenceNode = list.children[index];
    if (referenceNode !== node) {
      list.insertBefore(node, referenceNode || null);
    }
  });

  for (const node of existingNodes.values()) {
    node.remove();
  }

  applySelectionState(list);
  if (viewport) viewport.scrollTop = previousScrollTop;
}

export function getEmailFromCache(id) {
  return emailCache.get(id);
}

export function setEmailCache(id, email) {
  emailCache.set(id, email);
}

export function clearEmailCache() {
  emailCache.clear();
}

export function removeEmailFromCache(id) {
  emailCache.delete(Number(id || 0));
}

export function setSelectedEmailId(id, root = document) {
  selectedEmailId = Number(id || 0);
  applySelectionState(root);
}

export function clearSelectedEmailId(root = document) {
  selectedEmailId = 0;
  applySelectionState(root);
}

export function markEmailAsRead(id, root = document) {
  const numericId = Number(id || 0);
  if (!numericId) return;

  lastLoadedEmails = lastLoadedEmails.map((email) => Number(email.id || 0) === numericId
    ? { ...email, is_read: 1 }
    : email);

  const cached = emailCache.get(numericId);
  if (cached) {
    emailCache.set(numericId, { ...cached, is_read: 1 });
  }

  const node = root.querySelector?.(`.email-item[data-email-id="${numericId}"]`);
  if (node) {
    node.classList.remove('unread');
  }
}

export function getLatestLoadedEmailId() {
  const first = Array.isArray(lastLoadedEmails) && lastLoadedEmails.length ? lastLoadedEmails[0] : null;
  return Number(first?.id || 0);
}

export function getCurrentPageNumber() {
  return currentPage;
}

export function getLoadedEmailCount() {
  return lastLoadedEmails.length;
}

export function getLoadedEmailNavigation(id) {
  const numericId = Number(id || 0);
  const index = lastLoadedEmails.findIndex((email) => Number(email?.id || 0) === numericId);
  if (index < 0) {
    return { index: -1, total: lastLoadedEmails.length, prevId: 0, nextId: 0 };
  }
  return {
    index,
    total: lastLoadedEmails.length,
    prevId: Number(lastLoadedEmails[index - 1]?.id || 0),
    nextId: Number(lastLoadedEmails[index + 1]?.id || 0)
  };
}

export function markViewLoaded() {
  viewLoaded.add(getViewKey());
}

export function isFirstLoad() {
  return !viewLoaded.has(getViewKey());
}

export function clearViewLoaded() {
  viewLoaded.clear();
}

export default {
  renderPager,
  sliceByPage,
  prevPage,
  nextPage,
  resetPager,
  setView,
  isSentViewActive,
  statusClass,
  renderEmailItem,
  syncEmailList,
  getEmailFromCache,
  setEmailCache,
  clearEmailCache,
  removeEmailFromCache,
  setSelectedEmailId,
  clearSelectedEmailId,
  markEmailAsRead,
  getLatestLoadedEmailId,
  getCurrentPageNumber,
  getLoadedEmailCount,
  getLoadedEmailNavigation,
  mergeNewEmails,
  markViewLoaded,
  isFirstLoad,
  clearViewLoaded
};
