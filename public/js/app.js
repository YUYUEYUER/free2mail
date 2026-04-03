/**
 * Free2Mail 主应用入口
 * @module app
 */

import { cacheGet, cacheSet, setCurrentUserKey, getCurrentUserKey } from './storage.js';
import { openForwardDialog, toggleFavorite, injectDialogStyles } from './mailbox-settings.js';
import { icon, setIcon } from './core/icons.js';

// 导入模块
import { formatTs, formatTsMobile, extractCode, escapeHtml, escapeAttr } from './modules/app/ui-helpers.js';
import { mockApi, MOCK_STATE } from './modules/app/mock-api.js';
import { showConfirm } from './modules/app/confirm-dialog.js';
import { startAutoRefresh, stopAutoRefresh, initVisibilityTracking, setRefreshGuard } from './modules/app/auto-refresh.js';
import { getCurrentMailbox, setCurrentMailbox, loadCurrentMailbox, clearCurrentMailbox, setCurrentMailboxInfo, getCurrentMailboxInfo } from './modules/app/mailbox-state.js';
import { sliceByPage, prevPage, nextPage, resetPager, setView, isSentViewActive, syncEmailList, setSelectedEmailId, markEmailAsRead, getLatestLoadedEmailId, getCurrentPageNumber, getLoadedEmailCount, getLoadedEmailNavigation, mergeNewEmails, markViewLoaded, isFirstLoad, removeEmailFromCache } from './modules/app/email-list.js';
import { renderMailboxList, renderMbPager, getCurrentPage, setCurrentPage, getPageSize, prevMbPage, nextMbPage, resetMbPage, setSearchTerm, getSearchTerm, setLoading, isLoadingMailboxes, setLastCount, getLastCount } from './modules/app/mailbox-list.js';
import { initSessionFromCache, validateSession, isGuest, isAdmin, applySessionUI, initGuestMode } from './modules/app/session.js';
import { loadDomains, getStoredLength, saveLength, updateRangeProgress, getSelectedDomainIndex, populateDomains, STORAGE_KEYS } from './modules/app/domains.js';
import { initCompose, showSentEmailDetail } from './modules/app/compose.js';
import { showEmailDetail, deleteEmailById, deleteSentById, copyFromEmailList, prefetchEmails } from './modules/app/email-viewer.js';
import { generateMailbox, generateNameMailbox, createCustomMailbox, updateEmailDisplay, selectMailboxAddress, toggleMailboxPin, deleteMailboxAddress, copyMailboxAddress, clearAllEmails, logout } from './modules/app/mailbox-actions.js';

// 全局状态
window.__GUEST_MODE__ = false;
window.__MOCK_STATE__ = MOCK_STATE;
try { if (sessionStorage.getItem('mf:just_logged_in') === '1') sessionStorage.removeItem('mf:just_logged_in'); } catch(_) {}

// 注入弹窗样式
injectDialogStyles();

// API 请求封装
async function api(path, options) {
  if (window.__GUEST_MODE__) return mockApi(path, options);
  const res = await fetch(path, options);
  if (res.status === 401) {
    if (location.pathname !== '/html/login.html') location.replace('/html/login.html');
    throw new Error('unauthorized');
  }
  return res;
}

// 加载模板
const app = document.getElementById('app');
const templateResp = await fetch('/html/app.html', { cache: 'force-cache' }).catch(() => null);
app.innerHTML = templateResp && templateResp.ok ? await templateResp.text() : await (await fetch('/html/app.html', { cache: 'no-cache' })).text();

// DOM 元素
const els = {
  email: document.getElementById('email'), gen: document.getElementById('gen'), genName: document.getElementById('gen-name'),
  copy: document.getElementById('copy'), clear: document.getElementById('clear'), list: document.getElementById('list'),
  listCard: document.getElementById('list-card'), tabInbox: document.getElementById('tab-inbox'), tabSent: document.getElementById('tab-sent'),
  boxTitle: document.getElementById('box-title'), boxIcon: document.getElementById('box-icon'), refresh: document.getElementById('refresh'),
  logout: document.getElementById('logout'), modal: document.getElementById('email-modal'), modalClose: document.getElementById('modal-close'),
  modalSubject: document.getElementById('modal-subject'), modalContent: document.getElementById('modal-content'),
  mbList: document.getElementById('mb-list'), mbSearch: document.getElementById('mb-search'), mbLoading: document.getElementById('mb-loading'),
  toast: document.getElementById('toast'), mbPager: document.getElementById('mb-pager'), mbPrev: document.getElementById('mb-prev'),
  mbNext: document.getElementById('mb-next'), mbPageInfo: document.getElementById('mb-page-info'), listLoading: document.getElementById('list-status'),
  confirmModal: document.getElementById('confirm-modal'), confirmClose: document.getElementById('confirm-close'),
  confirmMessage: document.getElementById('confirm-message'), confirmCancel: document.getElementById('confirm-cancel'), confirmOk: document.getElementById('confirm-ok'),
  emailActions: document.getElementById('email-actions'), toggleCustom: document.getElementById('toggle-custom'),
  customOverlay: document.getElementById('custom-overlay'), customLocalOverlay: document.getElementById('custom-local-overlay'),
  createCustomOverlay: document.getElementById('create-custom-overlay'), compose: document.getElementById('compose'),
  composeModal: document.getElementById('compose-modal'), composeClose: document.getElementById('compose-close'),
  composeTo: document.getElementById('compose-to'), composeSubject: document.getElementById('compose-subject'),
  composeHtml: document.getElementById('compose-html') || document.getElementById('compose-body'),
  composeFromName: document.getElementById('compose-from-name'), composeCancel: document.getElementById('compose-cancel'), composeSend: document.getElementById('compose-send'),
  pager: document.getElementById('list-pager'), prevPage: document.getElementById('prev-page'), nextPage: document.getElementById('next-page'), pageInfo: document.getElementById('page-info'),
  sidebarToggle: document.getElementById('sidebar-toggle'), sidebarToggleIcon: document.getElementById('sidebar-toggle-icon'),
  sidebar: document.querySelector('.sidebar'), container: document.querySelector('.container'),
  forwardSetting: document.getElementById('forward-setting'), toggleFavorite: document.getElementById('toggle-favorite'),
  favoriteIcon: document.getElementById('favorite-icon'), favoriteText: document.getElementById('favorite-text'),
  emailSearchBar: document.getElementById('email-search-bar'), emailFilterKeyword: document.getElementById('email-filter-keyword'),
  emailFilterSender: document.getElementById('email-filter-sender'), emailFilterCode: document.getElementById('email-filter-code'),
  emailFilterRead: document.getElementById('email-filter-read'), emailFilterHitField: document.getElementById('email-filter-hit-field'), emailFilterFrom: document.getElementById('email-filter-from'),
  emailFilterTo: document.getElementById('email-filter-to'), emailFilterReset: document.getElementById('email-search-reset'),
  emailFilterPresets: document.getElementById('email-filter-presets'), emailFilterSave: document.getElementById('email-filter-save'), emailFilterRename: document.getElementById('email-filter-rename'), emailFilterDefault: document.getElementById('email-filter-default'), emailFilterDelete: document.getElementById('email-filter-delete'),
  emailFilterPresetList: document.getElementById('email-filter-preset-list'),
  emailLiveStatus: document.getElementById('email-live-status'), emailFilterSummary: document.getElementById('email-filter-summary'),
  emailPendingBanner: document.getElementById('email-pending-banner'), emailPendingText: document.getElementById('email-pending-text'),
  emailPendingAction: document.getElementById('email-pending-action'), emailPendingToggle: document.getElementById('email-pending-toggle'),
  emailPendingPreview: document.getElementById('email-pending-preview')
};
const lenRange = document.getElementById('len-range'), lenVal = document.getElementById('len-val'), domainSelect = document.getElementById('domain-select');

// 初始化
initSessionFromCache();
// showToast 由 toast-utils.js 全局提供
const showToast = window.showToast || ((msg, type) => console.log(`[${type}] ${msg}`));

// 低负载模式
function detectLowPowerMode() {
  try {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const saveData = !!connection?.saveData;
    const slowNetwork = ['slow-2g', '2g'].includes(connection?.effectiveType);
    const lowCpu = Number(navigator.hardwareConcurrency || 0) > 0 && Number(navigator.hardwareConcurrency || 0) <= 4;
    const lowMemory = Number(navigator.deviceMemory || 0) > 0 && Number(navigator.deviceMemory || 0) <= 4;
    return saveData || slowNetwork || lowCpu || lowMemory;
  } catch (_) {
    return false;
  }
}

const isLowPowerMode = detectLowPowerMode();
const PERF_MODE = {
  lowPower: isLowPowerMode,
  searchDebounceMs: isLowPowerMode ? 480 : 320,
  prefetchDetails: !isLowPowerMode
};

if (PERF_MODE.lowPower) {
  try { document.body.classList.add('low-power-mode'); } catch (_) {}
}

// 刷新状态
const REFRESH_INTERVAL = 15;
let countdown = REFRESH_INTERVAL;
function showHeaderLoading(t) { if (els.listLoading) { els.listLoading.innerHTML = `<span class="spinner"></span>${t || '加载中…'}`; els.listLoading.style.display = 'flex'; }}
function hideHeaderLoading() { if (els.listLoading) els.listLoading.style.display = 'none'; }
function showCountdown() { if (els.listLoading) { els.listLoading.innerHTML = `<span class="countdown-icon">${icon('history')}</span>${countdown}s 后刷新`; els.listLoading.style.display = 'flex'; }}

function renderInboxEmptyPanel(mailbox, sentView = false) {
  const safeMailbox = escapeHtml(mailbox || '未选择邮箱');
  const title = sentView ? '发件档案暂时还是空白' : '研究面板正在等待新邮件样本';
  const description = sentView
    ? '当前邮箱还没有产生发件记录。发送一封测试邮件后，这里会展开投递状态与内容摘要。'
    : '当前邮箱已经就绪，但还没有新的来信。你可以刷新、发送测试邮件，或切换到另一条历史邮箱继续查看。';
  const viewLabel = sentView ? '发件箱' : '收件箱';

  return `
    <div class="research-panel-empty research-panel-empty--inbox">
      <div class="research-panel-empty__eyebrow">
        <span class="research-panel-empty__badge">${icon(sentView ? 'send' : 'inbox')}</span>
        <span>${sentView ? 'Outgoing desk' : 'Inbox observatory'}</span>
      </div>
      <div class="research-panel-empty__body">
        <div class="research-panel-empty__copy">
          <div class="research-panel-empty__title">${title}</div>
          <div class="research-panel-empty__description">${description}</div>
        </div>
        <div class="research-panel-empty__stats">
          <div class="research-panel-empty__stat">
            <span class="research-panel-empty__stat-label">当前邮箱</span>
            <span class="research-panel-empty__stat-value">${safeMailbox}</span>
          </div>
          <div class="research-panel-empty__stat">
            <span class="research-panel-empty__stat-label">当前视图</span>
            <span class="research-panel-empty__stat-value">${viewLabel}</span>
          </div>
          <div class="research-panel-empty__stat">
            <span class="research-panel-empty__stat-label">刷新节奏</span>
            <span class="research-panel-empty__stat-value">实时监听 + ${REFRESH_INTERVAL} 秒兜底刷新</span>
          </div>
          <div class="research-panel-empty__stat">
            <span class="research-panel-empty__stat-label">建议动作</span>
            <span class="research-panel-empty__stat-value">${sentView ? '从当前邮箱发一封测试邮件' : '向当前邮箱投递一封测试邮件'}</span>
          </div>
        </div>
      </div>
      </div>`;
}

const emailFilters = {
  q: '',
  sender: '',
  code: '',
  hitField: 'all',
  read: 'all',
  dateFrom: '',
  dateTo: ''
};

let emailFilterTimer = null;
let liveLoopToken = 0;
let liveLoopState = { active: false, mailbox: '', queryKey: '' };
let liveEventSource = null;
let liveCursorId = 0;
const pendingInboxEmails = new Map();
let pendingPreviewExpanded = false;
const EMAIL_FILTER_PRESETS_KEY = 'savedEmailFilters';
let savedEmailFilterPresets = [];
let activeEmailPresetId = '';
let draggingEmailPresetId = '';

function normalizeEmailFilterPreset(filters = {}) {
  return {
    q: String(filters.q || '').trim(),
    sender: String(filters.sender || '').trim(),
    code: String(filters.code || '').trim(),
    hitField: ['all', 'subject', 'sender', 'preview', 'code'].includes(filters.hitField) ? filters.hitField : 'all',
    read: ['all', 'read', 'unread'].includes(filters.read) ? filters.read : 'all',
    dateFrom: String(filters.dateFrom || '').trim(),
    dateTo: String(filters.dateTo || '').trim()
  };
}

function loadSavedEmailFilterPresets() {
  const stored = cacheGet(EMAIL_FILTER_PRESETS_KEY);
      savedEmailFilterPresets = Array.isArray(stored)
    ? stored.map((item) => ({
        id: String(item?.id || ''),
        name: String(item?.name || '').trim(),
        isDefault: Boolean(item?.isDefault),
        filters: normalizeEmailFilterPreset(item?.filters || {})
      })).filter((item) => item.id && item.name)
    : [];
  let defaultFound = false;
  savedEmailFilterPresets = savedEmailFilterPresets.map((item) => {
    if (item.isDefault && !defaultFound) {
      defaultFound = true;
      return item;
    }
    return { ...item, isDefault: false };
  });
  renderSavedEmailFilterPresets();
}

function persistSavedEmailFilterPresets() {
  cacheSet(EMAIL_FILTER_PRESETS_KEY, savedEmailFilterPresets);
}

function renderSavedEmailFilterPresets(selectedId = '') {
  activeEmailPresetId = selectedId || activeEmailPresetId || '';
  if (!els.emailFilterPresets) return;
  const options = ['<option value="">已保存筛选器</option>'];
  for (const preset of savedEmailFilterPresets) {
    options.push(`<option value="${escapeAttr(preset.id)}">${escapeHtml(`${preset.isDefault ? '★ ' : ''}${preset.name}`)}</option>`);
  }
  els.emailFilterPresets.innerHTML = options.join('');
  els.emailFilterPresets.value = activeEmailPresetId || '';
  renderSavedEmailFilterPresetList();
}

function renderSavedEmailFilterPresetList() {
  if (!els.emailFilterPresetList) return;
  if (!savedEmailFilterPresets.length) {
    els.emailFilterPresetList.innerHTML = '';
    els.emailFilterPresetList.style.display = 'none';
    return;
  }

  els.emailFilterPresetList.style.display = 'flex';
  els.emailFilterPresetList.innerHTML = savedEmailFilterPresets.map((preset) => `
    <button
      type="button"
      class="filter-preset-chip${preset.id === activeEmailPresetId ? ' is-active' : ''}${preset.isDefault ? ' is-default' : ''}"
      draggable="true"
      data-preset-id="${escapeAttr(preset.id)}"
      title="拖拽排序，点击应用"
    >
      <span class="filter-preset-chip__handle">⋮⋮</span>
      <span>${escapeHtml(`${preset.isDefault ? '★ ' : ''}${preset.name}`)}</span>
    </button>
  `).join('');
}

function getCurrentEmailFilterPreset() {
  return normalizeEmailFilterPreset(emailFilters);
}

function applyEmailFilterPreset(filters = {}) {
  const preset = normalizeEmailFilterPreset(filters);
  if (els.emailFilterKeyword) els.emailFilterKeyword.value = preset.q;
  if (els.emailFilterSender) els.emailFilterSender.value = preset.sender;
  if (els.emailFilterCode) els.emailFilterCode.value = preset.code;
  if (els.emailFilterHitField) els.emailFilterHitField.value = preset.hitField;
  if (els.emailFilterRead) els.emailFilterRead.value = preset.read;
  if (els.emailFilterFrom) els.emailFilterFrom.value = preset.dateFrom;
  if (els.emailFilterTo) els.emailFilterTo.value = preset.dateTo;
  readEmailFiltersFromInputs();
}

async function saveCurrentEmailFilterPreset() {
  const name = window.prompt('筛选器名称', '')?.trim();
  if (!name) return;

  const existing = savedEmailFilterPresets.find((preset) => preset.name === name);
  const hasDefault = savedEmailFilterPresets.some((preset) => preset.isDefault);
  const preset = {
    id: existing?.id || `${Date.now()}`,
    name,
    isDefault: existing?.isDefault || !hasDefault,
    filters: getCurrentEmailFilterPreset()
  };

  savedEmailFilterPresets = [preset, ...savedEmailFilterPresets.filter((item) => item.id !== preset.id)].slice(0, 12);
  persistSavedEmailFilterPresets();
  renderSavedEmailFilterPresets(preset.id);
  showToast(`已保存筛选器：${name}`, 'success');
}

async function renameSelectedEmailFilterPreset() {
  const selectedId = activeEmailPresetId || String(els.emailFilterPresets?.value || '').trim();
  if (!selectedId) {
    showToast('先选择一个已保存筛选器', 'warn');
    return;
  }

  const selected = savedEmailFilterPresets.find((preset) => preset.id === selectedId);
  const nextName = window.prompt('新的筛选器名称', selected?.name || '')?.trim();
  if (!nextName || !selected) return;

  savedEmailFilterPresets = savedEmailFilterPresets.map((preset) => preset.id === selectedId
    ? { ...preset, name: nextName }
    : preset);
  persistSavedEmailFilterPresets();
  renderSavedEmailFilterPresets(selectedId);
  showToast('筛选器已重命名', 'success');
}

function setDefaultEmailFilterPreset(selectedId) {
  if (!selectedId) {
    showToast('先选择一个已保存筛选器', 'warn');
    return;
  }

  savedEmailFilterPresets = savedEmailFilterPresets.map((preset) => ({
    ...preset,
    isDefault: preset.id === selectedId
  }));
  activeEmailPresetId = selectedId;
  persistSavedEmailFilterPresets();
  renderSavedEmailFilterPresets(selectedId);
  showToast('已设为默认筛选器', 'success');
}

function applyDefaultEmailFilterPreset() {
  const preset = savedEmailFilterPresets.find((item) => item.isDefault);
  if (!preset) return;
  applyEmailFilterPreset(preset.filters);
  renderSavedEmailFilterPresets(preset.id);
}

async function deleteSelectedEmailFilterPreset() {
  const selectedId = String(els.emailFilterPresets?.value || '').trim();
  if (!selectedId) {
    showToast('先选择一个已保存筛选器', 'warn');
    return;
  }

  const selected = savedEmailFilterPresets.find((preset) => preset.id === selectedId);
  const confirmed = await showConfirm(`确定删除筛选器“${selected?.name || '未命名'}”？`);
  if (!confirmed) return;

  savedEmailFilterPresets = savedEmailFilterPresets.filter((preset) => preset.id !== selectedId);
  if (selected?.isDefault && savedEmailFilterPresets[0]) {
    savedEmailFilterPresets[0] = { ...savedEmailFilterPresets[0], isDefault: true };
  }
  activeEmailPresetId = savedEmailFilterPresets[0]?.id || '';
  persistSavedEmailFilterPresets();
  renderSavedEmailFilterPresets();
  showToast('筛选器已删除', 'success');
}

function moveEmailFilterPreset(draggedId, targetId = '') {
  const draggedIndex = savedEmailFilterPresets.findIndex((preset) => preset.id === draggedId);
  if (draggedIndex < 0) return;

  const [draggedPreset] = savedEmailFilterPresets.splice(draggedIndex, 1);
  const targetIndex = targetId ? savedEmailFilterPresets.findIndex((preset) => preset.id === targetId) : -1;

  if (targetIndex < 0) {
    savedEmailFilterPresets.push(draggedPreset);
  } else {
    savedEmailFilterPresets.splice(targetIndex, 0, draggedPreset);
  }

  persistSavedEmailFilterPresets();
  renderSavedEmailFilterPresets(activeEmailPresetId || draggedId);
  showToast('筛选器顺序已更新', 'success');
}

function openEmailDetailWithContext(id) {
  return showEmailDetail(id, els, api, showToast, handleEmailOpened, {
    searchTerm: getDetailHighlightTerm(),
    showConfirm,
    refresh,
    onDelete: removePendingInboxEmail,
    getNavigation: getLoadedEmailNavigation,
    onNavigate: openEmailDetailWithContext
  });
}

function isTypingTarget(target) {
  if (!target) return false;
  const tagName = String(target.tagName || '').toUpperCase();
  return target.isContentEditable || tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
}

function handleDetailKeyboardShortcuts(event) {
  if (!els.modal?.classList.contains('show')) return;
  if (els.confirmModal?.classList.contains('show')) return;
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
  if (isTypingTarget(event.target)) return;

  const key = String(event.key || '').toLowerCase();
  const prevButton = els.modal?.querySelector('[data-detail-prev]');
  const nextButton = els.modal?.querySelector('[data-detail-next]');
  const markReadButton = els.modal?.querySelector('[data-detail-mark-read]');
  const deleteButton = els.modal?.querySelector('[data-detail-delete]');

  if (key === 'j' && nextButton && !nextButton.disabled) {
    event.preventDefault();
    nextButton.click();
    return;
  }

  if (key === 'k' && prevButton && !prevButton.disabled) {
    event.preventDefault();
    prevButton.click();
    return;
  }

  if (key === 'e' && markReadButton && !markReadButton.disabled) {
    event.preventDefault();
    markReadButton.click();
    return;
  }

  if (event.key === 'Delete' && deleteButton) {
    event.preventDefault();
    deleteButton.click();
  }
}

function hasActiveEmailFilters() {
  return Boolean(emailFilters.q || emailFilters.sender || emailFilters.code || emailFilters.dateFrom || emailFilters.dateTo || emailFilters.read === 'read' || emailFilters.read === 'unread');
}

function readEmailFiltersFromInputs() {
  emailFilters.q = String(els.emailFilterKeyword?.value || '').trim();
  emailFilters.sender = String(els.emailFilterSender?.value || '').trim();
  emailFilters.code = String(els.emailFilterCode?.value || '').trim();
  emailFilters.hitField = String(els.emailFilterHitField?.value || 'all').trim() || 'all';
  emailFilters.read = String(els.emailFilterRead?.value || 'all').trim() || 'all';
  emailFilters.dateFrom = String(els.emailFilterFrom?.value || '').trim();
  emailFilters.dateTo = String(els.emailFilterTo?.value || '').trim();
}

function clearEmailFilterInputs() {
  if (els.emailFilterKeyword) els.emailFilterKeyword.value = '';
  if (els.emailFilterSender) els.emailFilterSender.value = '';
  if (els.emailFilterCode) els.emailFilterCode.value = '';
  if (els.emailFilterHitField) els.emailFilterHitField.value = 'all';
  if (els.emailFilterRead) els.emailFilterRead.value = 'all';
  if (els.emailFilterFrom) els.emailFilterFrom.value = '';
  if (els.emailFilterTo) els.emailFilterTo.value = '';
  readEmailFiltersFromInputs();
}

function buildEmailListSearchParams(mailbox) {
  const params = new URLSearchParams({ mailbox, limit: '50' });
  if (emailFilters.q) params.set('q', emailFilters.q);
  if (emailFilters.sender) params.set('sender', emailFilters.sender);
  if (emailFilters.code) params.set('code', emailFilters.code);
  if (emailFilters.q && emailFilters.hitField && emailFilters.hitField !== 'all') params.set('hit_field', emailFilters.hitField);
  if (emailFilters.read && emailFilters.read !== 'all') params.set('read', emailFilters.read);
  if (emailFilters.dateFrom) params.set('date_from', emailFilters.dateFrom);
  if (emailFilters.dateTo) params.set('date_to', emailFilters.dateTo);
  return params;
}

function buildSentListSearchParams(mailbox, forceFresh = false) {
  const params = new URLSearchParams({ from: mailbox });
  if (forceFresh) params.set('_ts', String(Date.now()));
  return params;
}

function buildEmailDeltaSearchParams(mailbox, sinceId) {
  const params = buildEmailListSearchParams(mailbox);
  params.set('since_id', String(sinceId || 0));
  params.set('limit', '20');
  params.set('_ts', String(Date.now()));
  return params;
}

function renderEmailFilterSummary(count = 0) {
  if (!els.emailFilterSummary) return;

  const chips = [`<span class="email-filter-chip">当前命中 <strong>${count}</strong> 封</span>`];
  if (emailFilters.q) chips.push(`<span class="email-filter-chip">关键词 <strong>${escapeHtml(emailFilters.q)}</strong></span>`);
  if (emailFilters.q && emailFilters.hitField !== 'all') chips.push(`<span class="email-filter-chip">命中字段 <strong>${escapeHtml(emailFilters.hitField === 'subject' ? '主题' : emailFilters.hitField === 'sender' ? '发件人' : emailFilters.hitField === 'preview' ? '摘要' : '验证码')}</strong></span>`);
  if (emailFilters.sender) chips.push(`<span class="email-filter-chip">发件人 <strong>${escapeHtml(emailFilters.sender)}</strong></span>`);
  if (emailFilters.code) chips.push(`<span class="email-filter-chip">验证码 <strong>${escapeHtml(emailFilters.code)}</strong></span>`);
  if (emailFilters.read !== 'all') chips.push(`<span class="email-filter-chip">状态 <strong>${emailFilters.read === 'read' ? '已读' : '未读'}</strong></span>`);
  if (emailFilters.dateFrom || emailFilters.dateTo) chips.push(`<span class="email-filter-chip">日期 <strong>${escapeHtml(`${emailFilters.dateFrom || '--'} ~ ${emailFilters.dateTo || '--'}`)}</strong></span>`);

  els.emailFilterSummary.innerHTML = chips.join('');
}

function renderPendingSnippetHtml(email) {
  const snippet = String(email?.search_snippet || '').trim();
  if (snippet) {
    return escapeHtml(snippet)
      .replace(/\[\[\[H\]\]\]/g, '<mark>')
      .replace(/\[\[\[\/H\]\]\]/g, '</mark>');
  }
  return escapeHtml(email?.preview || '点击查看详情');
}

function getDetailHighlightTerm() {
  return [emailFilters.q, emailFilters.sender, emailFilters.code]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ');
}

async function fetchEmailDelta(mailbox) {
  const params = buildEmailDeltaSearchParams(mailbox, getLiveCursorId());
  const response = await api(`/api/emails/delta?${params.toString()}`);
  const delta = await response.json();
  return Array.isArray(delta) ? delta : [];
}

function getLiveCursorId() {
  return Math.max(Number(liveCursorId || 0), Number(getLatestLoadedEmailId() || 0));
}

function setLiveCursorId(id) {
  liveCursorId = Math.max(0, Number(id || 0));
}

function removePendingInboxEmail(id) {
  pendingInboxEmails.delete(Number(id || 0));
  if (!pendingInboxEmails.size) pendingPreviewExpanded = false;
  renderPendingInboxBanner();
}

function renderPendingInboxBanner() {
  if (!els.emailPendingBanner || !els.emailPendingText) return;

  const count = pendingInboxEmails.size;
  const visible = !isSentViewActive() && getCurrentPageNumber() > 1 && count > 0;
  els.emailPendingBanner.style.display = visible ? 'grid' : 'none';
  if (!visible) {
    if (els.emailPendingPreview) els.emailPendingPreview.style.display = 'none';
    return;
  }

  els.emailPendingText.textContent = `静默累加 ${count} 封新邮件，当前停留在第 ${getCurrentPageNumber()} 页`;
  if (els.emailPendingToggle) {
    els.emailPendingToggle.textContent = pendingPreviewExpanded ? '收起预览' : `展开预览 (${Math.min(count, 3)})`;
  }

  if (!els.emailPendingPreview) return;
  if (!pendingPreviewExpanded) {
    els.emailPendingPreview.style.display = 'none';
    return;
  }

  const previews = Array.from(pendingInboxEmails.values())
    .sort((a, b) => (Date.parse(b?.received_at || 0) || 0) - (Date.parse(a?.received_at || 0) || 0) || Number(b?.id || 0) - Number(a?.id || 0))
    .slice(0, 3);

  els.emailPendingPreview.innerHTML = previews.map((email) => `
    <div class="email-pending-preview__item">
      <button type="button" class="email-pending-preview__item-body" onclick="showEmail(${Number(email.id || 0)})">
        <div class="email-pending-preview__top">
          <span class="email-pending-preview__sender">${escapeHtml(email.sender || '未知发件人')}</span>
          <span class="email-pending-preview__time">${escapeHtml(formatTs(email.received_at || email.created_at || ''))}</span>
        </div>
        <div class="email-pending-preview__subject">${escapeHtml(email.subject || '(无主题)')}</div>
        <div class="email-pending-preview__snippet">${renderPendingSnippetHtml(email)}</div>
      </button>
      <div class="email-pending-preview__actions">
        ${email.verification_code ? `<button type="button" class="btn btn-secondary btn-sm" onclick="pendingPreviewCopyCode(event, ${Number(email.id || 0)})">复制验证码</button>` : ''}
        <button type="button" class="btn btn-ghost btn-sm" onclick="pendingPreviewMarkRead(event, ${Number(email.id || 0)})">标已读</button>
        <button type="button" class="btn btn-danger btn-sm" onclick="pendingPreviewDelete(event, ${Number(email.id || 0)})">删除</button>
      </div>
    </div>
  `).join('');
  els.emailPendingPreview.style.display = previews.length ? 'grid' : 'none';
}

function clearPendingInboxState() {
  pendingInboxEmails.clear();
  pendingPreviewExpanded = false;
  renderPendingInboxBanner();
}

async function quickMarkPendingEmail(id) {
  try {
    const response = await api(`/api/email/${id}/read`, { method: 'POST' });
    if (!response.ok) throw new Error(await response.text());
    markEmailAsRead(id, els.list || document);
    removePendingInboxEmail(id);
    showToast('已标记为已读', 'success');
  } catch (error) {
    showToast(error.message || '标记已读失败', 'error');
  }
}

async function quickDeletePendingEmail(id) {
  try {
    const response = await api(`/api/email/${id}`, { method: 'DELETE' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || '删除失败');
    removeEmailFromCache(id);
    removePendingInboxEmail(id);
    showToast(payload.message || '邮件已删除', 'success');
  } catch (error) {
    showToast(error.message || '删除失败', 'error');
  }
}

async function quickCopyPendingCode(id) {
  const email = pendingInboxEmails.get(Number(id || 0));
  const code = String(email?.verification_code || '').trim();
  if (!code) {
    showToast('这封邮件没有验证码', 'error');
    return;
  }

  try {
    await navigator.clipboard.writeText(code);
    showToast(`验证码 ${code} 已复制`, 'success');
  } catch (_) {
    showToast('复制失败', 'error');
  }
}

function rememberPendingInboxDelta(delta) {
  for (const email of delta) {
    if (email?.id) pendingInboxEmails.set(Number(email.id), email);
  }
  if (delta.length) {
    setLiveCursorId(Math.max(...delta.map((email) => Number(email.id || 0)), getLiveCursorId()));
  }
  renderPendingInboxBanner();
}

function getEmailSearchQueryKey(mailbox) {
  return buildEmailListSearchParams(mailbox).toString();
}

function setEmailSearchBarVisible(sentView = isSentViewActive()) {
  if (!els.emailSearchBar) return;
  els.emailSearchBar.style.display = sentView ? 'none' : 'grid';
}

function setLiveStatus(text, state = 'idle') {
  if (!els.emailLiveStatus) return;
  els.emailLiveStatus.textContent = text;
  els.emailLiveStatus.dataset.state = state;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function supportsLiveStream() {
  return !window.__GUEST_MODE__ && typeof window.EventSource === 'function';
}

function scheduleLiveLoopRetry(token, delay = 0) {
  if (token !== liveLoopToken) return;
  window.setTimeout(() => {
    if (token === liveLoopToken) {
      ensureLiveInboxLoop();
    }
  }, delay);
}

async function handleLiveChange(mailbox) {
  const delta = await fetchEmailDelta(mailbox);

  if (getCurrentPageNumber() === 1) {
    if (delta.length) {
      if (els.list?.querySelector('.research-panel-empty')) {
        els.list.innerHTML = '';
        delete els.list.dataset.renderKey;
      }
      const isMobile = window.matchMedia?.('(max-width: 900px)').matches;
      const visibleEmails = mergeNewEmails(delta, els, { maxItems: 50 });
      syncEmailList(visibleEmails, els, isMobile);
      setLiveCursorId(Number(visibleEmails[0]?.id || delta[0]?.id || getLiveCursorId()));
      clearPendingInboxState();
      renderEmailFilterSummary(getLoadedEmailCount());
      if (PERF_MODE.prefetchDetails) prefetchEmails(delta, api);
      markViewLoaded();
      return;
    }
  }

  if (delta.length) {
    rememberPendingInboxDelta(delta);
    return;
  }

  await refresh({ showLoading: false, forceFresh: true });
}

function openLiveInboxSse(mailbox, queryKey, token) {
  const params = buildEmailListSearchParams(mailbox);
  params.set('since_id', String(getLiveCursorId()));
  params.set('_ts', String(Date.now()));

  const source = new EventSource(`/api/emails/stream?${params.toString()}`);
  liveEventSource = source;

  const cleanup = () => {
    if (liveEventSource === source) {
      liveEventSource = null;
    }
    try { source.close(); } catch (_) { }
  };

  source.addEventListener('ready', () => {
    if (token !== liveLoopToken) {
      cleanup();
      return;
    }
    setLiveStatus('SSE 实时中', 'live');
  });

  source.addEventListener('change', async () => {
    if (token !== liveLoopToken) {
      cleanup();
      return;
    }
    if (getCurrentMailbox() !== mailbox || isSentViewActive() || getEmailSearchQueryKey(mailbox) !== queryKey) {
      cleanup();
      return;
    }

    setLiveStatus('收到新邮件', 'live-hit');
    cleanup();
    try {
      await handleLiveChange(mailbox);
      if (token === liveLoopToken) liveLoopState.active = false;
      setLiveStatus('SSE 实时中', 'live');
      scheduleLiveLoopRetry(token, 0);
    } catch (_) {
      if (token === liveLoopToken) liveLoopState.active = false;
      setLiveStatus('实时重连中', 'retry');
      scheduleLiveLoopRetry(token, 1500);
    }
  });

  source.addEventListener('timeout', () => {
    if (token !== liveLoopToken) {
      cleanup();
      return;
    }
    cleanup();
    if (token === liveLoopToken) liveLoopState.active = false;
    setLiveStatus('SSE 实时中', 'live');
    scheduleLiveLoopRetry(token, 0);
  });

  source.onerror = () => {
    if (token !== liveLoopToken) {
      cleanup();
      return;
    }
    cleanup();
    if (token === liveLoopToken) liveLoopState.active = false;
    setLiveStatus('实时重连中', 'retry');
    scheduleLiveLoopRetry(token, 1500);
  };
}

function stopLiveInboxLoop(reason = 'paused') {
  liveLoopToken += 1;
  liveLoopState = { active: false, mailbox: '', queryKey: '' };
  if (liveEventSource) {
    try { liveEventSource.close(); } catch (_) { }
    liveEventSource = null;
  }

  if (reason === 'retry') setLiveStatus('实时重连中', 'retry');
  else if (reason === 'hit') setLiveStatus('收到新邮件', 'live-hit');
  else setLiveStatus('实时暂停', 'paused');
}

function renderFilteredEmptyPanel(mailbox) {
  return `
    <div class="research-panel-empty research-panel-empty--inbox">
      <div class="research-panel-empty__eyebrow">
        <span class="research-panel-empty__badge">${icon('search')}</span>
        <span>Filtered inbox</span>
      </div>
      <div class="research-panel-empty__body">
        <div class="research-panel-empty__copy">
          <div class="research-panel-empty__title">当前筛选没有命中邮件</div>
          <div class="research-panel-empty__description">可以放宽关键词、时间范围或已读状态，再看这只邮箱里的新来信。</div>
        </div>
        <div class="research-panel-empty__stats">
          <div class="research-panel-empty__stat"><span class="research-panel-empty__stat-label">当前邮箱</span><span class="research-panel-empty__stat-value">${escapeHtml(mailbox || '未选择')}</span></div>
          <div class="research-panel-empty__stat"><span class="research-panel-empty__stat-label">关键词</span><span class="research-panel-empty__stat-value">${escapeHtml(emailFilters.q || '未设置')}</span></div>
          <div class="research-panel-empty__stat"><span class="research-panel-empty__stat-label">发件人 / 验证码</span><span class="research-panel-empty__stat-value">${escapeHtml(`${emailFilters.sender || '全部'} / ${emailFilters.code || '全部'}`)}</span></div>
          <div class="research-panel-empty__stat"><span class="research-panel-empty__stat-label">已读 / 日期</span><span class="research-panel-empty__stat-value">${escapeHtml(`${emailFilters.read || 'all'} / ${emailFilters.dateFrom || '--'} ~ ${emailFilters.dateTo || '--'}`)}</span></div>
        </div>
      </div>
    </div>`;
}

function ensureLiveInboxLoop() {
  const mailbox = getCurrentMailbox();
  const sentView = isSentViewActive();

  setEmailSearchBarVisible(sentView);
  if (!mailbox || sentView) {
    stopLiveInboxLoop('paused');
    return;
  }

  const queryKey = getEmailSearchQueryKey(mailbox);
  if (liveLoopState.active && liveLoopState.mailbox === mailbox && liveLoopState.queryKey === queryKey) {
    return;
  }

  const token = ++liveLoopToken;
  liveLoopState = { active: true, mailbox, queryKey };
  setLiveStatus(document.hidden ? '后台暂停' : '实时监听中', document.hidden ? 'paused' : 'live');

  if (supportsLiveStream() && !document.hidden) {
    openLiveInboxSse(mailbox, queryKey, token);
    return;
  }

  (async () => {
    while (token === liveLoopToken) {
      if (document.hidden) {
        setLiveStatus('后台暂停', 'paused');
        await wait(1500);
        continue;
      }

      try {
        const params = buildEmailListSearchParams(mailbox);
        params.set('since_id', String(getLiveCursorId()));
        params.set('timeout', '18');

        const response = await api(`/api/emails/live?${params.toString()}`);
        const data = await response.json();

        if (token !== liveLoopToken) return;
        if (getCurrentMailbox() !== mailbox || isSentViewActive() || getEmailSearchQueryKey(mailbox) !== queryKey) break;

        if (data.changed) {
          setLiveStatus('收到新邮件', 'live-hit');
          await handleLiveChange(mailbox);
        }

        setLiveStatus('实时监听中', 'live');
      } catch (_) {
        if (token !== liveLoopToken) return;
        setLiveStatus('实时重连中', 'retry');
        await wait(1800);
      }
    }

    if (token === liveLoopToken) {
      liveLoopState.active = false;
    }
  })().catch(() => {
    if (token === liveLoopToken) {
      liveLoopState.active = false;
      setLiveStatus('实时重连中', 'retry');
    }
  });
}

function scheduleEmailFilterRefresh(immediate = false) {
  readEmailFiltersFromInputs();
  if (emailFilterTimer) clearTimeout(emailFilterTimer);

  const run = () => {
    resetPager(els);
    refresh();
    ensureLiveInboxLoop();
  };

  if (immediate) {
    run();
    return;
  }

  emailFilterTimer = setTimeout(run, PERF_MODE.searchDebounceMs);
}

function isMailboxViewActive() {
  if (!getCurrentMailbox()) return false;
  const card = els.listCard;
  if (!card) return false;
  try {
    const style = window.getComputedStyle(card);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
  } catch (_) {}
  return card.getClientRects().length > 0;
}

// 刷新邮件列表
async function refresh(options = {}) {
  const mailbox = getCurrentMailbox();
  if (!mailbox) {
    stopLiveInboxLoop('paused');
    return;
  }

  readEmailFiltersFromInputs();

  try {
    if (options.showLoading !== false) {
      showHeaderLoading(isFirstLoad() ? '加载中…' : '正在更新…');
    }

    if (isFirstLoad() && els.list) {
      els.list.innerHTML = '';
      delete els.list.dataset.renderKey;
    }

    const sentView = isSentViewActive();
    setEmailSearchBarVisible(sentView);

    if (!sentView && getCurrentPageNumber() > 1 && !options.forceFresh) {
      const delta = await fetchEmailDelta(mailbox);
      if (delta.length) {
        rememberPendingInboxDelta(delta);
        ensureLiveInboxLoop();
        return;
      }
    }

    const emailParams = buildEmailListSearchParams(mailbox);
    if (options.forceFresh) emailParams.set('_ts', String(Date.now()));
    const url = !sentView
      ? `/api/emails?${emailParams.toString()}`
      : `/api/sent?${buildSentListSearchParams(mailbox, options.forceFresh).toString()}`;

    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 8000);
    let emails = [];
    try {
      const response = await api(url, { signal: ctrl.signal });
      emails = await response.json();
    } finally {
      clearTimeout(timeout);
    }

    if (!Array.isArray(emails) || !emails.length) {
      setLiveCursorId(0);
      clearPendingInboxState();
      const emptyKey = `${mailbox}::${sentView ? 'sent' : 'inbox'}::empty::${hasActiveEmailFilters() ? 'filtered' : 'plain'}`;
      if (els.list && els.list.dataset.renderKey !== emptyKey) {
        els.list.innerHTML = !sentView && hasActiveEmailFilters() ? renderFilteredEmptyPanel(mailbox) : renderInboxEmptyPanel(mailbox, sentView);
        els.list.dataset.renderKey = emptyKey;
      }
      if (els.pager) els.pager.style.display = 'none';
      if (!sentView) renderEmailFilterSummary(0);
      markViewLoaded();
      if (!sentView) ensureLiveInboxLoop();
      else stopLiveInboxLoop('paused');
      return;
    }

    const isMobile = window.matchMedia?.('(max-width: 900px)').matches;
    const visibleEmails = sliceByPage(emails, els);
    setLiveCursorId(Number(emails[0]?.id || 0));
    clearPendingInboxState();
    if (els.list) {
      delete els.list.dataset.renderKey;
      if (els.list.querySelector('.research-panel-empty')) {
        els.list.innerHTML = '';
      }
    }
    syncEmailList(visibleEmails, els, isMobile);
    if (!sentView) renderEmailFilterSummary(getLoadedEmailCount());
    renderPendingInboxBanner();

    if (!sentView && PERF_MODE.prefetchDetails) {
      prefetchEmails(visibleEmails, api);
    }

    markViewLoaded();
    if (!sentView) ensureLiveInboxLoop();
    else stopLiveInboxLoop('paused');
  } catch (_) { }
  finally {
    hideHeaderLoading();
    if (getCurrentMailbox()) {
      countdown = REFRESH_INTERVAL;
      showCountdown();
    }
  }
}

function handleEmailOpened(id) {
  if (isSentViewActive()) return;
  setSelectedEmailId(id, els.list || document);
  markEmailAsRead(id, els.list || document);
  removePendingInboxEmail(id);
}

function autoRefreshCallback() { if (countdown > 0) { countdown--; showCountdown(); if (countdown <= 0) refresh().finally(() => { countdown = REFRESH_INTERVAL; showCountdown(); }); }}

let hasLoadedMailboxList = false;
let mailboxListPromise = null;
let mailboxListWarmupScheduled = false;

function renderMailboxListDeferredState() {
  if (!els.mbList || hasLoadedMailboxList) return;
  els.mbList.innerHTML = '<div class="empty-state" style="text-align:center;color:#8b7355;padding:18px 14px">历史邮箱按需加载中</div>';
}

function scheduleMailboxListWarmup() {
  if (hasLoadedMailboxList || mailboxListPromise || mailboxListWarmupScheduled) return;
  mailboxListWarmupScheduled = true;
  const warmup = () => {
    mailboxListWarmupScheduled = false;
    if (!hasLoadedMailboxList && !mailboxListPromise) {
      loadMailboxes().catch(() => {});
    }
  };
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(warmup, { timeout: 2500 });
  } else {
    setTimeout(warmup, 1400);
  }
}

function primeMailboxListOnIntent() {
  if (hasLoadedMailboxList || mailboxListPromise) return;
  loadMailboxes().catch(() => {});
}

// 加载邮箱列表
async function loadMailboxes(opts = {}) {
  if (mailboxListPromise && !opts.forceFresh) return mailboxListPromise;
  if (isLoadingMailboxes() && !opts.forceFresh) return mailboxListPromise;

  mailboxListPromise = (async () => {
    setLoading(true);
    if (els.mbLoading) els.mbLoading.style.display = 'flex';
    try {
      let url = `/api/mailboxes?page=${getCurrentPage()}&size=${getPageSize()}`;
      const search = getSearchTerm(); if (search) url += `&q=${encodeURIComponent(search)}`;
      const r = await api(url); const data = await r.json();
      const list = Array.isArray(data) ? data : (data.list || []); const total = data.total || list.length;
      setLastCount(total); renderMailboxList(list, els.mbList); renderMbPager(els, total);
      hasLoadedMailboxList = true;
      try { const q = document.getElementById('quota'); if (q) q.textContent = `${total} 邮箱`; } catch(_) {}
    } catch (_) {}
    finally {
      setLoading(false);
      if (els.mbLoading) els.mbLoading.style.display = 'none';
      mailboxListPromise = null;
    }
  })();

  return mailboxListPromise;
}

function updateMailboxInfoUI(info) {
  if (!info) return;
  if (els.favoriteIcon && els.favoriteText) {
    setIcon(els.favoriteIcon, 'star');
    els.favoriteText.textContent = info.is_favorite ? '已收藏' : '收藏邮箱';
    els.toggleFavorite?.classList.toggle('is-active', !!info.is_favorite);
  }
}

// 全局函数
window.selectMailbox = (addr) => selectMailboxAddress(addr, els, api, refresh, autoRefreshCallback, updateMailboxInfoUI);
window.togglePin = (e, addr) => toggleMailboxPin(e, addr, api, showToast, loadMailboxes);
window.deleteMailbox = (e, addr) => deleteMailboxAddress(e, addr, els, api, showToast, showConfirm, loadMailboxes);
window.showEmail = (id) => openEmailDetailWithContext(id);
window.showSentEmail = async (id) => { try { const r = await api(`/api/sent/${id}`); showSentEmailDetail(await r.json(), els); } catch(e) { showToast(e.message || '加载失败', 'error'); }};
window.deleteEmail = (id) => deleteEmailById(id, api, showToast, showConfirm, refresh);
window.deleteSent = (id) => deleteSentById(id, api, showToast, showConfirm, refresh);
window.copyFromList = (e, id) => copyFromEmailList(e, id, api, showToast);
window.refreshEmails = () => refresh({ forceFresh: true });
window.pendingPreviewCopyCode = (event, id) => { event.stopPropagation(); quickCopyPendingCode(id); };
window.pendingPreviewMarkRead = (event, id) => { event.stopPropagation(); quickMarkPendingEmail(id); };
window.pendingPreviewDelete = (event, id) => { event.stopPropagation(); quickDeletePendingEmail(id); };
window.primeMailboxList = primeMailboxListOnIntent;

// 事件绑定
if (els.gen) els.gen.onclick = () => generateMailbox(els, lenRange, domainSelect, api, showToast, refresh, loadMailboxes, autoRefreshCallback, updateMailboxInfoUI);
if (els.genName) els.genName.onclick = () => generateNameMailbox(els, lenRange, domainSelect, api, showToast, refresh, loadMailboxes, autoRefreshCallback, updateMailboxInfoUI);
if (els.copy) els.copy.onclick = () => copyMailboxAddress(showToast);
if (els.clear) els.clear.onclick = () => clearAllEmails(api, showToast, showConfirm, refresh);
if (els.refresh) els.refresh.onclick = () => refresh({ forceFresh: true });
if (els.logout) els.logout.addEventListener('click', async () => {
  try { await fetch('/api/logout', { method: 'POST' }); } catch(_) {}
  location.replace('/html/login.html');
});
if (els.modalClose) els.modalClose.onclick = () => els.modal?.classList.remove('show');
els.modal?.addEventListener('click', (e) => { if (e.target === els.modal) els.modal.classList.remove('show'); });

// 视图切换
if (els.tabInbox) els.tabInbox.onclick = () => { setView(false); els.tabInbox.classList.add('active'); els.tabSent?.classList.remove('active'); if (els.boxTitle) els.boxTitle.textContent = '收件箱'; if (els.boxIcon) setIcon(els.boxIcon, 'inbox'); setEmailSearchBarVisible(false); resetPager(els); refresh(); };
if (els.tabSent) els.tabSent.onclick = () => { setView(true); els.tabSent.classList.add('active'); els.tabInbox?.classList.remove('active'); if (els.boxTitle) els.boxTitle.textContent = '发件箱'; if (els.boxIcon) setIcon(els.boxIcon, 'send'); setEmailSearchBarVisible(true); stopLiveInboxLoop('paused'); resetPager(els); refresh(); };

// 分页
if (els.prevPage) els.prevPage.onclick = () => prevPage(refresh);
if (els.nextPage) els.nextPage.onclick = () => nextPage(refresh);
if (els.mbPrev) els.mbPrev.onclick = () => prevMbPage(loadMailboxes);
if (els.mbNext) els.mbNext.onclick = () => nextMbPage(loadMailboxes, getLastCount());

// 搜索
renderMailboxListDeferredState();
els.sidebar?.addEventListener('pointerenter', primeMailboxListOnIntent, { once: true });
els.sidebar?.addEventListener('pointerdown', primeMailboxListOnIntent, { once: true });
els.sidebar?.addEventListener('focusin', primeMailboxListOnIntent, { once: true });
if (els.mbSearch) {
  let t = null;
  els.mbSearch.addEventListener('focus', primeMailboxListOnIntent, { once: true });
  els.mbSearch.oninput = () => {
    if (!hasLoadedMailboxList && !mailboxListPromise) primeMailboxListOnIntent();
    if (t) clearTimeout(t);
    t = setTimeout(() => { setSearchTerm(els.mbSearch.value); resetMbPage(); loadMailboxes(); }, PERF_MODE.searchDebounceMs);
  };
}
if (els.emailFilterKeyword) els.emailFilterKeyword.addEventListener('input', () => scheduleEmailFilterRefresh(false));
if (els.emailFilterSender) els.emailFilterSender.addEventListener('input', () => scheduleEmailFilterRefresh(false));
if (els.emailFilterCode) els.emailFilterCode.addEventListener('input', () => scheduleEmailFilterRefresh(false));
if (els.emailFilterHitField) els.emailFilterHitField.addEventListener('change', () => scheduleEmailFilterRefresh(true));
if (els.emailFilterRead) els.emailFilterRead.addEventListener('change', () => scheduleEmailFilterRefresh(true));
if (els.emailFilterFrom) els.emailFilterFrom.addEventListener('change', () => scheduleEmailFilterRefresh(true));
if (els.emailFilterTo) els.emailFilterTo.addEventListener('change', () => scheduleEmailFilterRefresh(true));
if (els.emailFilterPresets) els.emailFilterPresets.addEventListener('change', () => {
  const presetId = String(els.emailFilterPresets.value || '').trim();
  const preset = savedEmailFilterPresets.find((item) => item.id === presetId);
  if (!preset) return;
  activeEmailPresetId = presetId;
  applyEmailFilterPreset(preset.filters);
  resetPager(els);
  refresh({ forceFresh: true });
  ensureLiveInboxLoop();
});
if (els.emailFilterPresetList) {
  els.emailFilterPresetList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-preset-id]');
    if (!button) return;
    const presetId = String(button.dataset.presetId || '').trim();
    const preset = savedEmailFilterPresets.find((item) => item.id === presetId);
    if (!preset) return;
    activeEmailPresetId = presetId;
    renderSavedEmailFilterPresets(presetId);
    applyEmailFilterPreset(preset.filters);
    resetPager(els);
    refresh({ forceFresh: true });
    ensureLiveInboxLoop();
  });

  els.emailFilterPresetList.addEventListener('dragstart', (event) => {
    const button = event.target.closest('[data-preset-id]');
    if (!button) return;
    draggingEmailPresetId = String(button.dataset.presetId || '').trim();
    button.classList.add('is-dragging');
    try { event.dataTransfer.setData('text/plain', draggingEmailPresetId); } catch (_) { }
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  });

  els.emailFilterPresetList.addEventListener('dragover', (event) => {
    if (!draggingEmailPresetId) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  });

  els.emailFilterPresetList.addEventListener('drop', (event) => {
    if (!draggingEmailPresetId) return;
    event.preventDefault();
    const button = event.target.closest('[data-preset-id]');
    const targetId = String(button?.dataset?.presetId || '').trim();
    if (draggingEmailPresetId && draggingEmailPresetId !== targetId) {
      moveEmailFilterPreset(draggingEmailPresetId, targetId);
    }
    draggingEmailPresetId = '';
    els.emailFilterPresetList.querySelectorAll('.is-dragging').forEach((item) => item.classList.remove('is-dragging'));
  });

  els.emailFilterPresetList.addEventListener('dragend', () => {
    draggingEmailPresetId = '';
    els.emailFilterPresetList.querySelectorAll('.is-dragging').forEach((item) => item.classList.remove('is-dragging'));
  });
}
if (els.emailFilterSave) els.emailFilterSave.addEventListener('click', () => { saveCurrentEmailFilterPreset(); });
if (els.emailFilterRename) els.emailFilterRename.addEventListener('click', () => { renameSelectedEmailFilterPreset(); });
if (els.emailFilterDefault) els.emailFilterDefault.addEventListener('click', () => { setDefaultEmailFilterPreset(String(els.emailFilterPresets?.value || '').trim()); });
if (els.emailFilterDelete) els.emailFilterDelete.addEventListener('click', () => { deleteSelectedEmailFilterPreset(); });
if (els.emailFilterReset) els.emailFilterReset.addEventListener('click', () => {
  clearEmailFilterInputs();
  scheduleEmailFilterRefresh(true);
});
if (els.emailPendingToggle) els.emailPendingToggle.addEventListener('click', () => {
  pendingPreviewExpanded = !pendingPreviewExpanded;
  renderPendingInboxBanner();
});
if (els.emailPendingAction) els.emailPendingAction.addEventListener('click', () => {
  resetPager(els);
  clearPendingInboxState();
  refresh({ forceFresh: true });
});
document.addEventListener('keydown', handleDetailKeyboardShortcuts);

// 长度滑块
if (lenRange && lenVal) { lenRange.value = String(getStoredLength()); lenVal.textContent = String(getStoredLength()); updateRangeProgress(lenRange); lenRange.oninput = () => { lenVal.textContent = lenRange.value; saveLength(Number(lenRange.value)); updateRangeProgress(lenRange); };}

// 自定义邮箱
if (els.toggleCustom) els.toggleCustom.onclick = () => { if (els.customOverlay) { const vis = els.customOverlay.style.display !== 'none'; els.customOverlay.style.display = vis ? 'none' : 'flex'; if (!vis) setTimeout(() => els.customLocalOverlay?.focus(), 50); }};
if (els.createCustomOverlay) els.createCustomOverlay.onclick = () => createCustomMailbox(els, domainSelect, api, showToast, loadMailboxes);

// 侧边栏
if (els.sidebarToggle) {
  els.sidebarToggle.onclick = () => {
    els.sidebar?.classList.toggle('collapsed');
    els.container?.classList.toggle('sidebar-collapsed');
    const c = els.sidebar?.classList.contains('collapsed');
    if (els.sidebarToggleIcon) setIcon(els.sidebarToggleIcon, c ? 'chevron-right' : 'chevron-left');
    localStorage.setItem('sidebar-collapsed', c ? '1' : '0');
  };
  if (localStorage.getItem('sidebar-collapsed') === '1') {
    els.sidebar?.classList.add('collapsed');
    els.container?.classList.add('sidebar-collapsed');
    if (els.sidebarToggleIcon) setIcon(els.sidebarToggleIcon, 'chevron-right');
  }
}

// 转发和收藏
if (els.forwardSetting) els.forwardSetting.onclick = () => { 
  const i = getCurrentMailboxInfo(); 
  if (i && i.id) openForwardDialog(i.id, i.address, i.forward_to); 
  else showToast('请先选择一个邮箱', 'warn'); 
};
if (els.toggleFavorite) els.toggleFavorite.onclick = async () => { 
  const i = getCurrentMailboxInfo(); 
  if (i && i.id) { 
    try { 
      const result = await toggleFavorite(i.id); 
      if (result.success) {
        const newInfo = { ...i, is_favorite: result.is_favorite };
        setCurrentMailboxInfo(newInfo); 
        updateMailboxInfoUI(newInfo);
      }
    } catch(_) {} 
  } else showToast('请先选择一个邮箱', 'warn'); 
};

// 撰写
initCompose(els, api, showToast);
setRefreshGuard(isMailboxViewActive);
setEmailSearchBarVisible(isSentViewActive());

// 会话验证
(async () => {
  const s = await validateSession();
  if (!s) { clearCurrentMailbox(); stopAutoRefresh(); location.replace('/html/login.html'); return; }
  loadSavedEmailFilterPresets();
  applyDefaultEmailFilterPreset();
  if (s.role === 'guest') { initGuestMode(); if (domainSelect) { domainSelect.innerHTML = '<option value="0">example.com</option>'; domainSelect.disabled = true; } populateDomains(['example.com'], domainSelect); }
  else await loadDomains(domainSelect, api);
  try { const qr = await api('/api/user/quota'); const q = await qr.json(); const el = document.getElementById('quota'); if (el && q) { el.textContent = isAdmin() ? `${q.total || 0} 邮箱` : `${q.used || 0} / ${q.limit || 0}`; }} catch(_) {}
  scheduleMailboxListWarmup();
  
  // 优先使用 URL 参数中的邮箱，其次使用本地存储的上次邮箱
  const urlParams = new URLSearchParams(window.location.search);
  const urlMailbox = urlParams.get('mailbox');
  if (urlMailbox) {
    await window.selectMailbox(urlMailbox);
    // 清除 URL 参数，避免刷新时重复选择
    window.history.replaceState({}, '', window.location.pathname);
  } else {
    const last = loadCurrentMailbox(); 
    if (last) await window.selectMailbox(last);
  }

  scheduleMailboxListWarmup();
  
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopLiveInboxLoop('paused');
      return;
    }
    if (getCurrentMailbox() && !isSentViewActive()) {
      ensureLiveInboxLoop();
    }
  });

  initVisibilityTracking();
})();
