/**
 * 邮件查看模块
 * @module modules/app/email-viewer
 */

import { escapeHtml, escapeAttr, extractCode } from './ui-helpers.js';
import { getEmailFromCache, setEmailCache } from './email-list.js';

/**
 * 显示邮件详情
 * @param {number} id - 邮件ID
 * @param {object} elements - DOM 元素
 * @param {Function} api - API 函数
 * @param {Function} showToast - 提示函数
 */
export async function showEmailDetail(id, elements, api, showToast) {
  const { modal, modalSubject, modalContent } = elements;
  
  try {
    let email = getEmailFromCache(id);
    if (!email || (!email.html_content && !email.content)) {
      const r = await api(`/api/email/${id}`);
      email = await r.json();
      setEmailCache(id, email);
    }
    
    modalSubject.innerHTML = `<span>${escapeHtml(email.subject || '(无主题)')}</span>`;
    
    let contentHtml = '';
    const code = email.verification_code || extractCode(email.content || email.html_content || '');
    const summary = escapeHtml(email.summary || email.preview || '');
    const sender = escapeHtml(email.sender || '未知发件人');
    const recipients = escapeHtml((email.to_addrs || '').toString() || '当前邮箱');
    const receivedAt = escapeHtml(email.received_at || email.created_at || '');
    const desk = escapeHtml(email.desk || email.section || 'Inbox briefing');
    
    if (code) {
      contentHtml += `
        <div class="verification-code-box">
          <span class="verification-label">验证码</span>
          <button class="code-copy" type="button" onclick="navigator.clipboard.writeText('${code}').then(()=>showToast('验证码已复制','success'))">${code}</button>
          <span class="verification-hint">点击复制</span>
        </div>`;
    }

    contentHtml += `
      <div class="email-detail-sheet">
        <div class="email-detail-meta">
          <div class="email-detail-card">
            <span class="email-detail-card__label">栏目</span>
            <span class="email-detail-card__value">${desk}</span>
          </div>
          <div class="email-detail-card">
            <span class="email-detail-card__label">发件人</span>
            <span class="email-detail-card__value">${sender}</span>
          </div>
          <div class="email-detail-card">
            <span class="email-detail-card__label">收件人</span>
            <span class="email-detail-card__value">${recipients}</span>
          </div>
          <div class="email-detail-card">
            <span class="email-detail-card__label">到达时间</span>
            <span class="email-detail-card__value">${receivedAt || '--'}</span>
          </div>
        </div>
        ${summary ? `<div class="email-briefing-card"><span class="email-briefing-card__label">摘要</span><p>${summary}</p></div>` : ''}
      </div>`;
    
    if (email.html_content) {
      contentHtml += `<iframe class="email-frame" srcdoc="${escapeAttr(email.html_content)}"></iframe>`;
    } else {
      contentHtml += `<pre class="email-plain-text">${escapeHtml(email.content || '')}</pre>`;
    }
    
    modalContent.innerHTML = contentHtml;
    modal.classList.add('show');
  } catch(e) {
    showToast(e.message || '加载失败', 'error');
  }
}

/**
 * 删除邮件
 * @param {number} id - 邮件ID
 * @param {Function} api - API 函数
 * @param {Function} showToast - 提示函数
 * @param {Function} showConfirm - 确认函数
 * @param {Function} refresh - 刷新函数
 */
export async function deleteEmailById(id, api, showToast, showConfirm, refresh) {
  const confirmed = await showConfirm('确定删除这封邮件？');
  if (!confirmed) return;
  
  try {
    const r = await api(`/api/email/${id}`, { method: 'DELETE' });
    if (r.ok) {
      showToast('邮件已删除', 'success');
      await refresh();
    }
  } catch(e) {
    showToast(e.message || '删除失败', 'error');
  }
}

/**
 * 删除已发送邮件
 * @param {number} id - 邮件ID
 * @param {Function} api - API 函数
 * @param {Function} showToast - 提示函数
 * @param {Function} showConfirm - 确认函数
 * @param {Function} refresh - 刷新函数
 */
export async function deleteSentById(id, api, showToast, showConfirm, refresh) {
  const confirmed = await showConfirm('确定删除这条发送记录？');
  if (!confirmed) return;
  
  try {
    const r = await api(`/api/sent/${id}`, { method: 'DELETE' });
    if (r.ok) {
      showToast('记录已删除', 'success');
      await refresh();
    }
  } catch(e) {
    showToast(e.message || '删除失败', 'error');
  }
}

/**
 * 从列表复制验证码或内容
 * @param {Event} event - 事件
 * @param {number} id - 邮件ID
 * @param {Function} api - API 函数
 * @param {Function} showToast - 提示函数
 */
export async function copyFromEmailList(event, id, api, showToast) {
  const btn = event.target.closest('button');
  const code = btn?.dataset?.code;
  
  if (code) {
    try {
      await navigator.clipboard.writeText(code);
      showToast(`验证码 ${code} 已复制`, 'success');
    } catch(_) {
      showToast('复制失败', 'error');
    }
  } else {
    let email = getEmailFromCache(id);
    if (!email) {
      const r = await api(`/api/email/${id}`);
      email = await r.json();
      setEmailCache(id, email);
    }
    const text = email.content || email.html_content?.replace(/<[^>]+>/g, ' ') || '';
    try {
      await navigator.clipboard.writeText(text.slice(0, 500));
      showToast('内容已复制', 'success');
    } catch(_) {
      showToast('复制失败', 'error');
    }
  }
}

/**
 * 预取邮件详情
 * @param {Array} emails - 邮件列表
 * @param {Function} api - API 函数
 */
export async function prefetchEmails(emails, api) {
  const top = emails.filter((e) => !getEmailFromCache(e.id)).slice(0, 3);
  if (!top.length) return;

  try {
    const ids = top.map((e) => e.id).join(',');
    const r = await api(`/api/emails/batch?ids=${encodeURIComponent(ids)}`);
    const details = await r.json();
    if (Array.isArray(details) && details.length) {
      details.forEach((detail) => {
        if (detail?.id) setEmailCache(detail.id, detail);
      });
      return;
    }
  } catch (_) {}

  for (const e of top) {
    try {
      const r = await api(`/api/email/${e.id}`);
      const detail = await r.json();
      setEmailCache(e.id, detail);
    } catch (_) {}
  }
}

export default {
  showEmailDetail,
  deleteEmailById,
  deleteSentById,
  copyFromEmailList,
  prefetchEmails
};
