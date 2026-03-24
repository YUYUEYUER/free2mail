/**
 * 邮箱渲染模块
 * @module modules/mailboxes/render
 */

import { icon, buttonIcon } from '../../core/icons.js';

/**
 * 格式化时间
 * @param {string} ts - 时间戳
 * @returns {string}
 */
export function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(String(ts).replace(' ', 'T') + 'Z');
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', hour12: false,
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).format(d);
}

/**
 * HTML 转义
 * @param {string} str - 字符串
 * @returns {string}
 */
export function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * 生成骨架屏卡片
 * @returns {string}
 */
export function createSkeletonCard() {
  return `<div class="skeleton-card"><div class="skeleton-line title"></div><div class="skeleton-line subtitle"></div><div class="skeleton-line text"></div><div class="skeleton-line time"></div></div>`;
}

/**
 * 生成骨架屏列表项
 * @returns {string}
 */
export function createSkeletonListItem() {
  return `<div class="skeleton-list-item"><div class="skeleton-line skeleton-pin"></div><div class="skeleton-content"><div class="skeleton-line title"></div><div class="skeleton-line subtitle"></div></div><div class="skeleton-actions"><div class="skeleton-line"></div><div class="skeleton-line"></div></div></div>`;
}

/**
 * 生成骨架屏内容
 * @param {string} view - 视图模式
 * @param {number} count - 数量
 * @returns {string}
 */
export function generateSkeleton(view = 'grid', count = 8) {
  return Array(count).fill(null).map(() => view === 'grid' ? createSkeletonCard() : createSkeletonListItem()).join('');
}

function shortText(text, max = 26) {
  const value = String(text || '').trim();
  if (!value) return '';
  return value.length > max ? `${value.slice(0, max - 1)}...` : value;
}

function splitAddress(address) {
  const [localPart = '', domain = ''] = String(address || '').split('@');
  return { localPart, domain };
}

function formatEditorialTime(ts) {
  if (!ts) return '--';
  try {
    const d = new Date(String(ts).replace(' ', 'T') + 'Z');
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(d);
  } catch (_) {
    return '--';
  }
}

function getMailboxKicker(mailbox) {
  if (mailbox.is_pinned && mailbox.is_favorite) return '头版归档';
  if (mailbox.is_pinned) return '头条样本';
  if (mailbox.is_favorite) return '精选样本';
  if (mailbox.can_login) return '登录样本';
  return '观察样本';
}

function describeMailbox(mailbox) {
  const parts = [];
  parts.push(mailbox.can_login ? '支持直接登录检查' : '维持纯接收观察');
  parts.push(mailbox.is_favorite ? '已加入收藏索引' : '尚未加入收藏');
  parts.push(mailbox.forward_to ? `转发至 ${shortText(mailbox.forward_to, 24)}` : '未设置外部转发');
  return parts.join(' · ');
}

function renderMailboxStat(label, value, tone = '') {
  return `
    <div class="mailbox-stat${tone ? ` ${tone}` : ''}">
      <span class="mailbox-stat__label">${escapeHtml(label)}</span>
      <span class="mailbox-stat__value">${escapeHtml(value)}</span>
    </div>
  `;
}

function renderPanelStats(stats = []) {
  if (!Array.isArray(stats) || !stats.length) return '';
  return `
    <div class="research-panel-empty__stats">
      ${stats.map((stat) => `
        <div class="research-panel-empty__stat">
          <span class="research-panel-empty__stat-label">${escapeHtml(stat.label || '')}</span>
          <span class="research-panel-empty__stat-value">${escapeHtml(stat.value || '')}</span>
        </div>
      `).join('')}
    </div>
  `;
}

export function renderResearchPanelEmpty({
  iconName = 'inbox',
  eyebrow = 'Research panel',
  title = '暂无数据',
  description = '',
  stats = []
} = {}) {
  return `
    <div class="research-panel-empty">
      <div class="research-panel-empty__eyebrow">
        <span class="research-panel-empty__badge">${icon(iconName)}</span>
        <span>${escapeHtml(eyebrow)}</span>
      </div>
      <div class="research-panel-empty__body">
        <div class="research-panel-empty__copy">
          <div class="research-panel-empty__title">${escapeHtml(title)}</div>
          <div class="research-panel-empty__description">${escapeHtml(description)}</div>
        </div>
        ${renderPanelStats(stats)}
      </div>
    </div>
  `;
}

export function renderOverviewEmptyState(filters = {}) {
  const query = String(filters.query || '').trim();
  const domain = String(filters.domain || '').trim();
  const login = String(filters.login || '').trim();
  const favorite = String(filters.favorite || '').trim();
  const forward = String(filters.forward || '').trim();
  const hasFilters = Boolean(query || domain || login || favorite || forward);

  if (hasFilters) {
    return renderResearchPanelEmpty({
      iconName: 'search',
      eyebrow: 'Filtered view',
      title: '当前检索没有命中样本',
      description: '可以放宽关键词或切换筛选项，让总览面板重新回到完整样本池。',
      stats: [
        { label: '关键词', value: query || '未输入' },
        { label: '域名', value: domain ? `@${domain}` : '全部域名' },
        { label: '登录', value: login || '全部状态' },
        { label: '收藏 / 转发', value: `${favorite || '全部'} / ${forward || '全部'}` }
      ]
    });
  }

  return renderResearchPanelEmpty({
    iconName: 'boxes',
    eyebrow: 'Mailbox atlas',
    title: '邮箱样本池尚未建立',
    description: '导入本地演示数据后，这里会展开研究卡片、状态标记和跳转入口。',
    stats: [
      { label: '样本数量', value: '0 个邮箱' },
      { label: '建议动作', value: '导入本地 demo 数据' },
      { label: '观察维度', value: '登录 / 收藏 / 转发' },
      { label: '视图模式', value: '卡片网格与列表概览' }
    ]
  });
}

/**
 * 渲染网格卡片（使用原始 CSS 类名）
 * 操作按钮：复制、置顶、设置转发、收藏（2x2 布局）
 * 点击卡片跳转邮箱
 * @param {object} m - 邮箱数据
 * @returns {string}
 */
export function renderCard(m) {
  const addr = escapeHtml(m.address);
  const time = formatTime(m.created_at);
  const shortTime = formatEditorialTime(m.created_at);
  const forward = m.forward_to ? escapeHtml(m.forward_to) : '';
  const { localPart, domain } = splitAddress(m.address);
  const kicker = getMailboxKicker(m);
  const summary = describeMailbox(m);
  
  return `
    <div class="mailbox-card" data-address="${addr}" data-id="${m.id}" data-action="jump">
      <div class="mailbox-card-kicker-row">
        <span class="mailbox-card-kicker">${escapeHtml(kicker)}</span>
        <span class="mailbox-card-domain">@${escapeHtml(domain || '')}</span>
      </div>
      <div class="card-header">
        <div class="mailbox-card-lead">
          <div class="mailbox-card-title">${escapeHtml(localPart || addr)}</div>
          <div class="mailbox-address" title="${addr}">${addr}</div>
        </div>
        <button class="btn btn-ghost btn-sm" data-action="pin" title="${m.is_pinned ? '取消置顶' : '置顶'}">${m.is_pinned ? '取消置顶' : '置顶'}</button>
      </div>
      <div class="card-body">
        <div class="mailbox-summary">${escapeHtml(summary)}</div>
        <div class="mailbox-stat-strip">
          ${renderMailboxStat('创建', shortTime)}
          ${renderMailboxStat('登录', m.can_login ? '允许' : '关闭', m.can_login ? 'is-positive' : '')}
          ${renderMailboxStat('密码', m.password_is_default ? '默认' : '已设')}
        </div>
        <div class="mailbox-meta">
          <span class="created-time">完整时间 ${time}</span>
          <span class="status-badge">${m.password_is_default ? '默认密码' : '已设密码'}</span>
          ${m.is_pinned ? `<span class="pin-status" title="已置顶">${icon('pin')} 置顶</span>` : ''}
          ${m.is_favorite ? `<span class="favorite-status active" title="已收藏">${icon('star')} 收藏</span>` : ''}
          ${forward ? `<span class="forward-indicator" title="转发到: ${forward}">${icon('forward')} 转发</span>` : ''}
          <span class="login-indicator" title="${m.can_login ? '允许登录' : '禁止登录'}">${icon(m.can_login ? 'check' : 'ban')} ${m.can_login ? '放行' : '禁止'}</span>
        </div>
      </div>
      <div class="card-actions">
        <button class="btn btn-sm" data-action="copy" title="复制">${buttonIcon('copy', '复制')}</button>
        <button class="btn btn-sm ${m.is_favorite ? 'active' : ''}" data-action="favorite" title="${m.is_favorite ? '取消收藏' : '收藏'}">${buttonIcon('star', m.is_favorite ? '已收藏' : '收藏')}</button>
        <button class="btn btn-sm" data-action="forward" title="设置转发">${buttonIcon('forward', '转发')}</button>
        <button class="btn btn-sm" data-action="login" title="${m.can_login ? '禁止登录' : '允许登录'}">${buttonIcon(m.can_login ? 'ban' : 'check', m.can_login ? '禁用' : '允许')}</button>
        <button class="btn btn-sm" data-action="password" title="${m.password_is_default ? '设置密码' : '重置密码'}">${buttonIcon('key', m.password_is_default ? '设置' : '重置')}</button>
        <button class="btn btn-sm danger" data-action="delete" title="删除">${buttonIcon('trash', '删除')}</button>
      </div>
    </div>`;
}

/**
 * 渲染列表项（使用原始 CSS 类名）
 * @param {object} m - 邮箱数据
 * @returns {string}
 */
export function renderListItem(m) {
  const addr = escapeHtml(m.address);
  const time = formatTime(m.created_at);
  const forward = m.forward_to ? escapeHtml(m.forward_to) : '';
  const { domain } = splitAddress(m.address);
  const kicker = getMailboxKicker(m);
  const summary = describeMailbox(m);
  
  return `
    <div class="mailbox-list-item" data-address="${addr}" data-id="${m.id}">
      <button class="item-pin ${m.is_pinned ? 'active' : ''}" data-action="pin" title="${m.is_pinned ? '取消置顶' : '置顶'}">${icon('pin')}${m.is_pinned ? '已置顶' : '置顶'}</button>
      <div class="item-content">
        <div class="item-kicker">${escapeHtml(kicker)} · @${escapeHtml(domain || '')}</div>
        <div class="item-address" title="${addr}">${addr}</div>
        <div class="item-summary">${escapeHtml(summary)}</div>
        <div class="item-meta">
          <span class="item-time">创建于 ${time}</span>
          <span class="item-indicators">
            <span class="indicator ${m.password_is_default ? 'password-default' : 'password-custom'}">${m.password_is_default ? '默认密码' : '已设密码'}</span>
            <span class="indicator ${m.can_login ? 'login-enabled' : 'login-disabled'}">${m.can_login ? '允许登录' : '禁止登录'}</span>
            ${m.is_favorite ? '<span class="indicator favorite">已收藏</span>' : ''}
            ${forward ? `<span class="indicator forward" title="转发到: ${forward}">转发 ${forward.length > 18 ? `${forward.substring(0, 18)}...` : forward}</span>` : ''}
          </span>
        </div>
      </div>
      <div class="item-actions">
        <button class="btn btn-sm" data-action="copy" title="复制">${buttonIcon('copy', '复制')}</button>
        <button class="btn btn-sm" data-action="jump" title="查看">${buttonIcon('mail', '查看')}</button>
        <button class="btn btn-sm" data-action="forward" title="转发设置">${buttonIcon('forward', '转发')}</button>
        <button class="btn btn-sm ${m.is_favorite ? 'active' : ''}" data-action="favorite" title="${m.is_favorite ? '取消收藏' : '收藏'}">${buttonIcon('star', m.is_favorite ? '已收藏' : '收藏')}</button>
        <button class="btn btn-sm" data-action="login" title="${m.can_login ? '禁止登录' : '允许登录'}">${buttonIcon(m.can_login ? 'ban' : 'check', m.can_login ? '禁用' : '允许')}</button>
        <button class="btn btn-sm" data-action="password" title="${m.password_is_default ? '设置密码' : '重置密码'}">${buttonIcon('key', m.password_is_default ? '设置' : '重置')}</button>
        <button class="btn btn-sm danger" data-action="delete" title="删除">${buttonIcon('trash', '删除')}</button>
      </div>
    </div>`;
}

/**
 * 渲染网格视图
 * @param {Array} list - 邮箱列表
 * @returns {string}
 */
export function renderGrid(list) {
  if (!list || !list.length) return '';
  return list.map(m => renderCard(m)).join('');
}

/**
 * 渲染列表视图
 * @param {Array} list - 邮箱列表
 * @returns {string}
 */
export function renderList(list) {
  if (!list || !list.length) return '';
  return list.map(m => renderListItem(m)).join('');
}

export default {
  formatTime, escapeHtml, createSkeletonCard, createSkeletonListItem,
  generateSkeleton, renderResearchPanelEmpty, renderOverviewEmptyState,
  renderCard, renderListItem, renderGrid, renderList
};
