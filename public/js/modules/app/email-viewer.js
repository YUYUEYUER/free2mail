/**
 * 邮件查看模块
 * @module modules/app/email-viewer
 */

import { escapeHtml, escapeAttr, extractCode, formatTs } from './ui-helpers.js';
import { getEmailFromCache, setEmailCache, removeEmailFromCache } from './email-list.js';

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getSearchRegex(searchTerm) {
  const tokens = String(searchTerm || '').trim().match(/[\p{L}\p{N}_@.-]+/gu)?.slice(0, 8) || [];
  if (!tokens.length) return null;
  const source = tokens
    .map((token) => escapeRegExp(token))
    .sort((left, right) => right.length - left.length)
    .join('|');
  return source ? new RegExp(`(${source})`, 'giu') : null;
}

function renderHighlightedText(text, searchTerm) {
  const source = String(text || '');
  const regex = getSearchRegex(searchTerm);
  if (!regex || !source) return escapeHtml(source);

  let lastIndex = 0;
  let result = '';
  source.replace(regex, (match, _capture, offset) => {
    result += escapeHtml(source.slice(lastIndex, offset));
    result += `<mark>${escapeHtml(match)}</mark>`;
    lastIndex = offset + match.length;
    return match;
  });
  result += escapeHtml(source.slice(lastIndex));
  return result;
}

function highlightHtmlContent(htmlContent, searchTerm) {
  const source = String(htmlContent || '').trim();
  const regex = getSearchRegex(searchTerm);
  if (!source || !regex || typeof DOMParser === 'undefined') return source;

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(source, 'text/html');
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    const textNodes = [];

    let currentNode = walker.nextNode();
    while (currentNode) {
      const parentTag = currentNode.parentElement?.tagName;
      regex.lastIndex = 0;
      if (currentNode.nodeValue?.trim() && !['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'MARK'].includes(parentTag) && regex.test(currentNode.nodeValue)) {
        textNodes.push(currentNode);
      }
      currentNode = walker.nextNode();
    }

    for (const node of textNodes) {
      const fragment = doc.createDocumentFragment();
      const text = node.nodeValue || '';
      regex.lastIndex = 0;
      let lastIndex = 0;

      text.replace(regex, (match, _capture, offset) => {
        if (offset > lastIndex) {
          fragment.append(doc.createTextNode(text.slice(lastIndex, offset)));
        }
        const mark = doc.createElement('mark');
        mark.textContent = match;
        fragment.append(mark);
        lastIndex = offset + match.length;
        return match;
      });

      if (lastIndex < text.length) {
        fragment.append(doc.createTextNode(text.slice(lastIndex)));
      }

      node.parentNode?.replaceChild(fragment, node);
    }

    return doc.body.innerHTML;
  } catch (_) {
    return source;
  }
}

function wrapHtmlDocument(htmlContent, searchTerm = '') {
  const body = highlightHtmlContent(htmlContent, searchTerm) || '<p style="color:#64748b">暂无 HTML 内容</p>';
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https: http: cid:; media-src https: http:; style-src 'unsafe-inline'; font-src data: https: http:;" />
    <base target="_blank" />
    <style>
      :root { color-scheme: light; }
      html, body { margin: 0; padding: 0; background: #ffffff; color: #0f172a; font: 14px/1.6 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
      body { padding: 16px; word-break: break-word; }
      img, video, iframe, table { max-width: 100%; }
      pre { white-space: pre-wrap; word-break: break-word; }
      a { color: #2563eb; }
      mark { background: rgba(250, 204, 21, 0.32); color: inherit; padding: 0 2px; border-radius: 4px; }
      mark.current-hit { background: rgba(59, 130, 246, 0.26); box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.18); }
    </style>
  </head>
  <body>${body}</body>
</html>`;
}

function renderViewTab(label, view, active, enabled = true) {
  return `<button type="button" class="email-view-tab${active ? ' is-active' : ''}" data-email-view="${view}" aria-pressed="${active ? 'true' : 'false'}"${enabled ? '' : ' disabled'}>${label}</button>`;
}

function getHitExcerpt(mark) {
  const source = String(mark?.parentElement?.textContent || mark?.textContent || '').replace(/\s+/g, ' ').trim();
  const focus = String(mark?.textContent || '').trim();
  if (!source) return focus || '搜索命中';
  const index = focus ? source.toLowerCase().indexOf(focus.toLowerCase()) : 0;
  if (index < 0) return source.slice(0, 80);
  const start = Math.max(0, index - 20);
  const end = Math.min(source.length, index + focus.length + 24);
  return source.slice(start, end);
}

function clearCurrentHitMarks(entries) {
  for (const entry of entries) {
    entry.mark?.classList?.remove('current-hit');
  }
}

function getActiveView(modalContent) {
  return modalContent.querySelector('[data-view-panel].is-active')?.dataset?.viewPanel || 'html';
}

function collectHitEntries(modalContent, view) {
  if (view === 'html') {
    const iframe = modalContent.querySelector('.email-frame');
    const marks = Array.from(iframe?.contentDocument?.querySelectorAll('mark') || []);
    if (marks.length) {
      return marks.map((mark, index) => ({ index, mark, text: getHitExcerpt(mark), jump: () => mark.scrollIntoView({ block: 'center', behavior: 'smooth' }) }));
    }
  }

  const panel = modalContent.querySelector(`[data-view-panel="${view}"]`);
  const panelMarks = Array.from(panel?.querySelectorAll('mark') || []);
  if (panelMarks.length) {
    return panelMarks.map((mark, index) => ({ index, mark, text: getHitExcerpt(mark), jump: () => mark.scrollIntoView({ block: 'center', behavior: 'smooth' }) }));
  }

  const fallbackMarks = Array.from(modalContent.querySelectorAll('.verification-code-box mark, .email-detail-title mark, .email-briefing-card mark, .email-detail-card mark'));
  return fallbackMarks.map((mark, index) => ({ index, mark, text: getHitExcerpt(mark), jump: () => mark.scrollIntoView({ block: 'center', behavior: 'smooth' }) }));
}

function renderHitNavigator(modalContent, view, activeIndex = 0) {
  const nav = modalContent.querySelector('[data-hit-nav]');
  const list = modalContent.querySelector('[data-hit-nav-list]');
  const status = modalContent.querySelector('[data-hit-nav-status]');
  if (!nav || !list || !status) return;

  const entries = collectHitEntries(modalContent, view);
  if (!entries.length) {
    nav.hidden = true;
    list.innerHTML = '';
    status.textContent = '0 / 0';
    return;
  }

  const boundedIndex = Math.max(0, Math.min(activeIndex, entries.length - 1));
  clearCurrentHitMarks(entries);
  entries[boundedIndex]?.mark?.classList?.add('current-hit');

  nav.hidden = false;
  nav.dataset.view = view;
  nav.dataset.activeIndex = String(boundedIndex);
  list.innerHTML = entries.map((entry) => `
    <button type="button" class="email-hit-nav__item${entry.index === boundedIndex ? ' is-active' : ''}" data-hit-index="${entry.index}">
      <span class="email-hit-nav__index">#${entry.index + 1}</span>
      <span class="email-hit-nav__text">${escapeHtml(entry.text)}</span>
    </button>
  `).join('');
  status.textContent = `${boundedIndex + 1} / ${entries.length}`;

  list.onclick = (event) => {
    const button = event.target.closest('[data-hit-index]');
    if (!button) return;
    const nextIndex = Number(button.dataset.hitIndex || 0);
    renderHitNavigator(modalContent, view, nextIndex);
    entries[nextIndex]?.jump?.();
  };
}

function scheduleHitNavigator(modalContent, view, activeIndex = 0) {
  const attempts = [0, 80, 220, 480];
  for (const delay of attempts) {
    window.setTimeout(() => {
      try {
        renderHitNavigator(modalContent, view, activeIndex);
      } catch (_) { }
    }, delay);
  }
}

function renderDetailShell(email, defaultView, searchTerm = '', navigation = null) {
  const code = email.verification_code || extractCode(email.content || email.html_content || '');
  const summary = renderHighlightedText(email.summary || email.preview || '', searchTerm);
  const sender = renderHighlightedText(email.sender || '未知发件人', searchTerm);
  const recipients = renderHighlightedText((email.to_addrs || '').toString() || '当前邮箱', searchTerm);
  const receivedAt = escapeHtml(formatTs(email.received_at || email.created_at || '') || email.received_at || email.created_at || '--');
  const rawAvailable = email.available_views?.raw !== false;
  const textAvailable = Boolean(email.content);
  const htmlAvailable = Boolean(email.html_content);
  const subjectHtml = renderHighlightedText(email.subject || '(无主题)', searchTerm);
  const codeHtml = renderHighlightedText(code, searchTerm);

  return `
    ${code ? `
      <div class="verification-code-box">
        <span class="verification-label">验证码</span>
        <button class="code-copy" type="button" data-copy-code="${escapeAttr(code)}">${codeHtml}</button>
        <span class="verification-hint">点击复制</span>
      </div>` : ''}

    <div class="email-detail-sheet">
      <div class="email-detail-meta">
        <div class="email-detail-card">
          <span class="email-detail-card__label">发件人</span>
          <span class="email-detail-card__value is-break">${sender}</span>
        </div>
        <div class="email-detail-card">
          <span class="email-detail-card__label">收件人</span>
          <span class="email-detail-card__value is-break">${recipients}</span>
        </div>
        <div class="email-detail-card">
          <span class="email-detail-card__label">到达时间</span>
          <span class="email-detail-card__value">${receivedAt}</span>
        </div>
        <div class="email-detail-card">
          <span class="email-detail-card__label">视图模式</span>
          <span class="email-detail-card__value">${htmlAvailable ? 'HTML + 文本 + EML' : (textAvailable ? '文本 + EML' : '原始 EML')}</span>
        </div>
      </div>
      ${summary ? `<div class="email-briefing-card"><span class="email-briefing-card__label">摘要</span><p>${summary}</p></div>` : ''}
    </div>

    <div class="email-detail-title">${subjectHtml}</div>

    <div class="email-view-toolbar">
      <div class="email-view-tabs" role="tablist" aria-label="邮件视图切换">
        ${renderViewTab('HTML', 'html', defaultView === 'html', htmlAvailable)}
        ${renderViewTab('文本', 'text', defaultView === 'text', textAvailable)}
        ${renderViewTab('原始 EML', 'raw', defaultView === 'raw', rawAvailable)}
      </div>
      <div class="email-view-actions">
        <button type="button" class="btn btn-ghost btn-sm" data-detail-prev ${navigation?.prevId ? '' : 'disabled'}>上一封</button>
        <span class="email-nav-status">${navigation?.index >= 0 ? `${navigation.index + 1} / ${navigation.total}` : '-- / --'}</span>
        <button type="button" class="btn btn-ghost btn-sm" data-detail-next ${navigation?.nextId ? '' : 'disabled'}>下一封</button>
        ${code ? `<button type="button" class="btn btn-secondary btn-sm" data-detail-copy-code="${escapeAttr(code)}">复制验证码</button>` : ''}
        <button type="button" class="btn btn-ghost btn-sm" data-detail-mark-read>${email.is_read ? '已读' : '标已读'}</button>
        <button type="button" class="btn btn-danger btn-sm" data-detail-delete>删除</button>
        ${email.download ? `<a class="btn btn-ghost btn-sm" href="${escapeAttr(email.download)}" target="_blank" rel="noopener noreferrer">下载 EML</a>` : ''}
      </div>
    </div>

    <div class="email-detail-layout">
      <div class="email-view-panels">
        <div class="email-view-panel${defaultView === 'html' ? ' is-active' : ''}" data-view-panel="html">
          ${htmlAvailable ? `<iframe class="email-frame" sandbox="allow-popups" referrerpolicy="no-referrer" srcdoc="${escapeAttr(wrapHtmlDocument(email.html_content, searchTerm))}"></iframe>` : '<div class="email-view-empty">这封邮件没有 HTML 正文。</div>'}
        </div>
        <div class="email-view-panel${defaultView === 'text' ? ' is-active' : ''}" data-view-panel="text">
          ${textAvailable ? `<pre class="email-plain-text">${renderHighlightedText(email.content || '', searchTerm)}</pre>` : '<div class="email-view-empty">这封邮件没有纯文本正文。</div>'}
        </div>
        <div class="email-view-panel${defaultView === 'raw' ? ' is-active' : ''}" data-view-panel="raw">
          <div class="email-raw-placeholder">切换到原始 EML 时会按需加载完整原文。</div>
        </div>
      </div>
      <aside class="email-hit-nav" data-hit-nav hidden>
        <div class="email-hit-nav__header">
          <span>命中位置</span>
          <span data-hit-nav-status>0 / 0</span>
        </div>
        <div class="email-hit-nav__list" data-hit-nav-list></div>
      </aside>
    </div>`;
}

function activateView(modalContent, view) {
  modalContent.querySelectorAll('[data-email-view]').forEach((button) => {
    const isActive = button.dataset.emailView === view;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
  modalContent.querySelectorAll('[data-view-panel]').forEach((panel) => {
    panel.classList.toggle('is-active', panel.dataset.viewPanel === view);
  });
}

async function loadRawPanel(id, email, modalContent, api, showToast, searchTerm = '') {
  const rawPanel = modalContent.querySelector('[data-view-panel="raw"]');
  if (!rawPanel || rawPanel.dataset.loaded === '1') return;

  rawPanel.innerHTML = '<div class="email-view-empty">正在加载原始 EML…</div>';

  try {
    const response = await api(email.raw_url || `/api/email/${id}/raw`);
    if (!response.ok) throw new Error(await response.text());
    const rawText = await response.text();
    rawPanel.innerHTML = `<pre class="email-raw-text">${renderHighlightedText(rawText || '', searchTerm)}</pre>`;
    rawPanel.dataset.loaded = '1';
  } catch (error) {
    rawPanel.innerHTML = '<div class="email-view-empty is-error">原始 EML 加载失败，请稍后重试。</div>';
    showToast(error.message || '原始 EML 加载失败', 'error');
  }
}

/**
 * 显示邮件详情
 * @param {number} id - 邮件ID
 * @param {object} elements - DOM 元素
 * @param {Function} api - API 函数
 * @param {Function} showToast - 提示函数
 * @param {Function} onOpen - 打开后的回调
 */
export async function showEmailDetail(id, elements, api, showToast, onOpen, detailOptions = {}) {
  const { modal, modalSubject, modalContent } = elements;
  const searchTerm = detailOptions.searchTerm || '';
  const navigation = typeof detailOptions.getNavigation === 'function'
    ? detailOptions.getNavigation(id)
    : { index: -1, total: 0, prevId: 0, nextId: 0 };

  try {
    let email = getEmailFromCache(id);
    if (!email || (!email.html_content && !email.content)) {
      const response = await api(`/api/email/${id}`);
      email = await response.json();
      setEmailCache(id, email);
    }

    if (typeof onOpen === 'function') {
      try {
        onOpen(id, email);
      } catch (_) { }
    }

    const defaultView = email.html_content ? 'html' : (email.content ? 'text' : 'raw');
    email = { ...email, is_read: 1 };
    setEmailCache(id, email);

    modalSubject.innerHTML = `<span>${renderHighlightedText(email.subject || '(无主题)', searchTerm)}</span>`;
    modalContent.innerHTML = renderDetailShell(email, defaultView, searchTerm, navigation);

    const iframe = modalContent.querySelector('.email-frame');
    if (iframe && searchTerm) {
      iframe.addEventListener('load', () => {
        scheduleHitNavigator(modalContent, getActiveView(modalContent), 0);
      }, { once: true });
    }

    const copyButton = modalContent.querySelector('[data-copy-code]');
    if (copyButton) {
      copyButton.addEventListener('click', async () => {
        const code = copyButton.dataset.copyCode || '';
        try {
          await navigator.clipboard.writeText(code);
          showToast('验证码已复制', 'success');
        } catch (_) {
          showToast('复制失败', 'error');
        }
      });
    }

    const toolbarCopyButton = modalContent.querySelector('[data-detail-copy-code]');
    if (toolbarCopyButton) {
      toolbarCopyButton.addEventListener('click', async () => {
        const code = toolbarCopyButton.dataset.detailCopyCode || '';
        try {
          await navigator.clipboard.writeText(code);
          showToast(`验证码 ${code} 已复制`, 'success');
        } catch (_) {
          showToast('复制失败', 'error');
        }
      });
    }

    const markReadButton = modalContent.querySelector('[data-detail-mark-read]');
    if (markReadButton) {
      markReadButton.addEventListener('click', async () => {
        if (email.is_read) {
          showToast('这封邮件已经是已读', 'success');
          return;
        }
        try {
          const response = await api(`/api/email/${id}/read`, { method: 'POST' });
          if (!response.ok) throw new Error(await response.text());
          email = { ...email, is_read: 1 };
          setEmailCache(id, email);
          markReadButton.textContent = '已读';
          showToast('已标记为已读', 'success');
        } catch (error) {
          showToast(error.message || '标记已读失败', 'error');
        }
      });
    }

    const deleteButton = modalContent.querySelector('[data-detail-delete]');
    if (deleteButton) {
      deleteButton.addEventListener('click', async () => {
        const confirmDelete = typeof detailOptions.showConfirm === 'function'
          ? await detailOptions.showConfirm('确定删除这封邮件？')
          : true;
        if (!confirmDelete) return;

        try {
          const response = await api(`/api/email/${id}`, { method: 'DELETE' });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(payload.message || '删除失败');
          removeEmailFromCache(id);
          if (typeof detailOptions.onDelete === 'function') {
            try { detailOptions.onDelete(id); } catch (_) { }
          }
          modal.classList.remove('show');
          showToast(payload.message || '邮件已删除', 'success');
          if (typeof detailOptions.refresh === 'function') {
            await detailOptions.refresh({ forceFresh: true });
          }
        } catch (error) {
          showToast(error.message || '删除失败', 'error');
        }
      });
    }

    const prevButton = modalContent.querySelector('[data-detail-prev]');
    if (prevButton) {
      prevButton.addEventListener('click', async () => {
        if (!navigation?.prevId || typeof detailOptions.onNavigate !== 'function') return;
        await detailOptions.onNavigate(navigation.prevId);
      });
    }

    const nextButton = modalContent.querySelector('[data-detail-next]');
    if (nextButton) {
      nextButton.addEventListener('click', async () => {
        if (!navigation?.nextId || typeof detailOptions.onNavigate !== 'function') return;
        await detailOptions.onNavigate(navigation.nextId);
      });
    }

    modalContent.querySelectorAll('[data-email-view]').forEach((button) => {
      button.addEventListener('click', async () => {
        if (button.disabled) return;
        const view = button.dataset.emailView;
        activateView(modalContent, view);
        if (view === 'raw') {
          await loadRawPanel(id, email, modalContent, api, showToast, searchTerm);
        }
        if (searchTerm) {
          scheduleHitNavigator(modalContent, view, 0);
        }
      });
    });

    if (defaultView === 'raw') {
      await loadRawPanel(id, email, modalContent, api, showToast, searchTerm);
    }

    if (searchTerm) {
      scheduleHitNavigator(modalContent, getActiveView(modalContent), 0);
    }

    modal.classList.add('show');
  } catch (error) {
    showToast(error.message || '加载失败', 'error');
  }
}

export async function deleteEmailById(id, api, showToast, showConfirm, refresh) {
  const confirmed = await showConfirm('确定删除这封邮件？');
  if (!confirmed) return;

  try {
    const response = await api(`/api/email/${id}`, { method: 'DELETE' });
    if (response.ok) {
      removeEmailFromCache(id);
      showToast('邮件已删除', 'success');
      await refresh();
    }
  } catch (error) {
    showToast(error.message || '删除失败', 'error');
  }
}

export async function deleteSentById(id, api, showToast, showConfirm, refresh) {
  const confirmed = await showConfirm('确定删除这条发送记录？');
  if (!confirmed) return;

  try {
    const response = await api(`/api/sent/${id}`, { method: 'DELETE' });
    if (response.ok) {
      showToast('记录已删除', 'success');
      await refresh();
    }
  } catch (error) {
    showToast(error.message || '删除失败', 'error');
  }
}

export async function copyFromEmailList(event, id, api, showToast) {
  const button = event.target.closest('button');
  const code = button?.dataset?.code;

  if (code) {
    try {
      await navigator.clipboard.writeText(code);
      showToast(`验证码 ${code} 已复制`, 'success');
    } catch (_) {
      showToast('复制失败', 'error');
    }
    return;
  }

  let email = getEmailFromCache(id);
  if (!email) {
    const response = await api(`/api/email/${id}`);
    email = await response.json();
    setEmailCache(id, email);
  }

  const text = email.content || email.html_content?.replace(/<[^>]+>/g, ' ') || '';
  try {
    await navigator.clipboard.writeText(text.slice(0, 500));
    showToast('内容已复制', 'success');
  } catch (_) {
    showToast('复制失败', 'error');
  }
}

export async function prefetchEmails(emails, api) {
  const top = emails.filter((email) => !getEmailFromCache(email.id)).slice(0, 3);
  if (!top.length) return;

  try {
    const ids = top.map((email) => email.id).join(',');
    const response = await api(`/api/emails/batch?ids=${encodeURIComponent(ids)}`);
    const details = await response.json();
    if (Array.isArray(details) && details.length) {
      details.forEach((detail) => {
        if (detail?.id) setEmailCache(detail.id, detail);
      });
      return;
    }
  } catch (_) { }

  for (const email of top) {
    try {
      const response = await api(`/api/email/${email.id}`);
      const detail = await response.json();
      setEmailCache(email.id, detail);
    } catch (_) { }
  }
}

export default {
  showEmailDetail,
  deleteEmailById,
  deleteSentById,
  copyFromEmailList,
  prefetchEmails
};
