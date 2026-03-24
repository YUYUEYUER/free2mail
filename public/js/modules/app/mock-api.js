/**
 * 模拟 API 模块（演示模式）
 * @module modules/app/mock-api
 */

// 模拟状态
export const MOCK_STATE = {
  domains: ['example.com'],
  mailboxes: [],
  emailsByMailbox: new Map(),
  sentEmailsById: new Map(),
  nextMailboxId: 100
};

const DEMO_EMAIL_LIBRARY = [
  {
    id: 1,
    desk: 'City Briefing',
    sender: 'alerts@signal-observer.net',
    subject: '晨报样本：城市观测更新',
    preview: '今早同步了 4 条城市观测线索，已经整理成可直接浏览的编辑部简报。',
    summary: '编辑部已将今天最值得演示的城市观测条目压成一张晨报卡，适合在首页直接查看真实邮件细节。',
    verification_code: '',
    hoursAgo: 1.2,
    highlights: ['4 条观测线索已归并', '2 条热点继续升温', '建议保留在首页做首屏样本']
  },
  {
    id: 2,
    desk: 'Access Control',
    sender: 'noreply@workspace.example',
    subject: '登录验证码：482913',
    preview: '这是一个带验证码的演示样本，适合测试列表复制、详情复制和验证码识别。',
    summary: '安全面板刚签发一枚新的登录验证码，当前演示环境会把它放在最醒目的位置。',
    verification_code: '482913',
    hoursAgo: 2.1,
    highlights: ['验证码已自动提取', '适合测试复制按钮', '5 分钟内有效（演示文本）']
  },
  {
    id: 3,
    desk: 'Signal Lab',
    sender: 'digest@insight-board.org',
    subject: '研究摘要：本周信号面板',
    preview: '信号面板汇总了 7 个高频主题，适合观察更完整的摘要邮件排版。',
    summary: 'Signal Lab 把一周内最活跃的主题压缩成了可视化式摘要，适合演示长文本与条目列表。',
    verification_code: '',
    hoursAgo: 4.8,
    highlights: ['高频主题 7 个', '新增一组夜间趋势', '建议作为总览页的深度样本']
  },
  {
    id: 4,
    desk: 'Field Log',
    sender: 'field@observer.example',
    subject: '现场记录：样本回传完成',
    preview: '现场样本已全部回传，包含验证码类邮件与普通摘要邮件各若干条。',
    summary: '现场记录已完成归档，这封邮件主要用来验证首页在真实文字密度下的阅读节奏。',
    verification_code: '',
    hoursAgo: 7.4,
    highlights: ['现场记录 3 份', '验证码类样本 1 份', '普通摘要样本 2 份']
  },
  {
    id: 5,
    desk: 'Press Room',
    sender: 'brief@presswire.example',
    subject: '外部快讯：发布节奏调整',
    preview: '发布节奏已调整为半小时滚动一次，便于观察时间轴与详情排版。',
    summary: 'Press Room 对对外快讯的推送节奏做了调整，当前页面会用这封邮件展示说明型内容。',
    verification_code: '',
    hoursAgo: 10.2,
    highlights: ['滚动频率改为 30 分钟', '建议保留在顶部列表', '适合观察多段正文']
  },
  {
    id: 6,
    desk: 'Demo Intake',
    sender: 'hello@demo-source.test',
    subject: '欢迎进入演示收件箱',
    preview: '这是一封用于填充真实内容态的欢迎邮件，可用来查看空态过渡后的第一屏。',
    summary: 'Demo Intake 会在首次打开时投递一封欢迎邮件，让你不用先发测试消息也能看到完整页面状态。',
    verification_code: '',
    hoursAgo: 14.6,
    highlights: ['适合作为空态结束后的第一封邮件', '正文使用更完整的 editorial 排版', '适合移动端阅读检查']
  }
];

const DEMO_SENT_LIBRARY = [
  {
    id: 8001,
    subject: '演示发件：晨间摘要',
    recipients: 'team@example.net',
    status: 'delivered',
    hoursAgo: 1.6,
    summary: '一封用来填充发件箱的编辑部摘要样本。'
  },
  {
    id: 8002,
    subject: '演示发件：调度同步',
    recipients: 'ops@example.net, support@example.net',
    status: 'delivered',
    hoursAgo: 3.2,
    summary: '模拟 dispatch room 对外同步样本。'
  },
  {
    id: 8003,
    subject: '演示发件：信号复核',
    recipients: 'editorial@example.net',
    status: 'queued',
    hoursAgo: 6.5,
    summary: '模拟待复核状态，方便查看不同发件状态。'
  }
];

function formatMockTimestamp(hoursAgo = 0) {
  return new Date(Date.now() - hoursAgo * 3600000).toISOString().replace('T', ' ').slice(0, 19);
}

function buildEditorialHtml(entry) {
  const bulletItems = (entry.highlights || []).map((item) => `<li>${item}</li>`).join('');
  const codeBlock = entry.verification_code ? `<div class="code">${entry.verification_code}</div>` : '';
  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { margin: 0; padding: 28px; background: #f7f2e8; color: #231b14; font-family: "Georgia", "Times New Roman", serif; }
      .eyebrow { margin-bottom: 10px; color: #9c7b3b; font: 700 11px/1.4 sans-serif; letter-spacing: 0.16em; text-transform: uppercase; }
      h1 { margin: 0 0 10px; font-size: 30px; line-height: 1.08; }
      p { margin: 0 0 14px; font: 16px/1.8 sans-serif; color: #4a3d31; }
      .panel { margin-top: 18px; padding: 18px 20px; border-radius: 18px; background: rgba(255,255,255,0.72); border: 1px solid rgba(128,96,48,0.12); }
      .panel strong { display: block; margin-bottom: 8px; font: 700 11px/1.4 sans-serif; letter-spacing: 0.14em; text-transform: uppercase; color: #9c7b3b; }
      ul { margin: 0; padding-left: 18px; color: #3f3328; font: 15px/1.8 sans-serif; }
      .code { display: inline-flex; margin: 4px 0 18px; padding: 10px 14px; border-radius: 999px; background: #201b17; color: #f5d184; font: 700 16px/1 monospace; letter-spacing: 0.18em; }
    </style>
  </head>
  <body>
    <div class="eyebrow">${entry.desk}</div>
    <h1>${entry.subject}</h1>
    <p>${entry.summary}</p>
    ${codeBlock}
    <div class="panel">
      <strong>重点摘录</strong>
      <ul>${bulletItems}</ul>
    </div>
  </body>
</html>`;
}

function buildEditorialText(entry) {
  const bullets = (entry.highlights || []).map((item) => `- ${item}`).join('\n');
  return `${entry.subject}\n\n${entry.summary}\n\n重点摘录\n${bullets}${entry.verification_code ? `\n\n验证码：${entry.verification_code}` : ''}`;
}

/**
 * 生成随机 ID
 * @param {number} length - 长度
 * @returns {string}
 */
export function mockGenerateId(length = 8) {
  const vowelSyllables = ["a", "e", "i", "o", "u", "ai", "ei", "ou", "ia", "io"];
  const commonSyllables = [
    "al", "an", "ar", "er", "in", "on", "en", "el", "or", "ir",
    "la", "le", "li", "lo", "lu", "ra", "re", "ri", "ro", "ru",
    "na", "ne", "ni", "no", "nu", "ma", "me", "mi", "mo", "mu",
    "ta", "te", "ti", "to", "tu", "sa", "se", "si", "so", "su"
  ];
  const nameFragments = [
    "alex", "max", "sam", "ben", "tom", "joe", "leo", "kai", "ray", "jay",
    "anna", "emma", "lily", "lucy", "ruby", "zoe", "eva", "mia", "ava", "ivy"
  ];

  const makeNaturalWord = (targetLen) => {
    let word = "";
    let attempts = 0;
    const maxAttempts = 50;

    while (word.length < targetLen && attempts < maxAttempts) {
      attempts++;
      let syllable;
      
      if (word.length === 0 && Math.random() < 0.3 && targetLen >= 4) {
        const fragment = nameFragments[Math.floor(Math.random() * nameFragments.length)];
        if (fragment.length <= targetLen) {
          syllable = fragment;
        } else {
          syllable = commonSyllables[Math.floor(Math.random() * commonSyllables.length)];
        }
      } else {
        syllable = commonSyllables[Math.floor(Math.random() * commonSyllables.length)];
      }

      if (word.length + syllable.length <= targetLen) {
        word += syllable;
      } else {
        const remaining = targetLen - word.length;
        if (remaining > 0 && remaining <= syllable.length) {
          word += syllable.substring(0, remaining);
        }
      }
    }

    return word;
  };

  return makeNaturalWord(length);
}

/**
 * 构建模拟邮件列表
 * @param {number} count - 数量
 * @returns {Array}
 */
export function buildMockEmails(count = 6) {
  return DEMO_EMAIL_LIBRARY.slice(0, count).map((entry, index) => ({
    id: entry.id,
    sender: entry.sender,
    subject: entry.subject,
    received_at: formatMockTimestamp(entry.hoursAgo),
    is_read: index > 1 ? 1 : 0,
    preview: entry.preview,
    verification_code: entry.verification_code || null,
    summary: entry.summary,
    desk: entry.desk
  }));
}

/**
 * 构建模拟邮件详情
 * @param {number} id - 邮件 ID
 * @returns {object}
 */
export function buildMockEmailDetail(id) {
  const entry = DEMO_EMAIL_LIBRARY.find((item) => item.id === Number(id)) || DEMO_EMAIL_LIBRARY[0];
  return {
    id: entry.id,
    sender: entry.sender,
    to_addrs: 'test@example.com',
    subject: entry.subject,
    content: buildEditorialText(entry),
    html_content: buildEditorialHtml(entry),
    received_at: formatMockTimestamp(entry.hoursAgo),
    is_read: 1,
    verification_code: entry.verification_code || '',
    preview: entry.preview,
    summary: entry.summary,
    desk: entry.desk
  };
}

export function buildMockSentEmails(fromAddress = '', count = 3) {
  return DEMO_SENT_LIBRARY.slice(0, count).map((entry) => ({
    id: entry.id,
    resend_id: `demo-${entry.id}`,
    from_addr: fromAddress || 'demo@example.com',
    recipients: entry.recipients,
    subject: entry.subject,
    created_at: formatMockTimestamp(entry.hoursAgo),
    status: entry.status,
    text_content: entry.summary,
    html_content: `<div style="padding:22px;font-family:Arial,sans-serif;background:#fbf7ef;color:#2d2218"><p style="margin:0 0 10px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#9c7b3b">Outgoing Desk</p><h2 style="margin:0 0 12px;font-size:24px">${entry.subject}</h2><p style="margin:0;font-size:15px;line-height:1.7">${entry.summary}</p></div>`
  }));
}

export function buildMockSentEmailDetail(id, fromAddress = '') {
  const entry = DEMO_SENT_LIBRARY.find((item) => item.id === Number(id)) || DEMO_SENT_LIBRARY[0];
  return buildMockSentEmails(fromAddress, DEMO_SENT_LIBRARY.length).find((item) => item.id === entry.id) || {
    id: entry.id,
    resend_id: `demo-${entry.id}`,
    from_addr: fromAddress || 'demo@example.com',
    recipients: entry.recipients,
    subject: entry.subject,
    created_at: formatMockTimestamp(entry.hoursAgo),
    status: entry.status,
    text_content: entry.summary,
    html_content: `<p>${entry.summary}</p>`
  };
}

/**
 * 构建模拟邮箱列表
 * @param {number} count - 数量
 * @param {number} pinnedCount - 置顶数量
 * @param {Array} domains - 域名列表
 * @returns {Array}
 */
export function buildMockMailboxes(count = 6, pinnedCount = 2, domains = ['example.com']) {
  return Array(count).fill(null).map((_, i) => ({
    id: i + 1,
    address: `demo${i + 1}@${domains[i % domains.length]}`,
    created_at: new Date(Date.now() - i * 86400000).toISOString().replace('T', ' ').slice(0, 19),
    is_pinned: i < pinnedCount ? 1 : 0,
    password_is_default: 1,
    can_login: 0,
    forward_to: i === 0 ? 'backup@gmail.com' : null,
    is_favorite: i < 2 ? 1 : 0
  }));
}

/**
 * 模拟 API 请求处理
 * @param {string} path - API 路径
 * @param {object} options - 请求选项
 * @returns {Promise<Response>}
 */
export async function mockApi(path, options = {}) {
  const url = new URL(path, location.origin);
  const jsonHeaders = { 'Content-Type': 'application/json' };

  // GET /api/domains
  if (url.pathname === '/api/domains') {
    return new Response(JSON.stringify(MOCK_STATE.domains), { headers: jsonHeaders });
  }

  // GET /api/generate
  if (url.pathname === '/api/generate') {
    const len = Number(url.searchParams.get('length') || '8');
    const id = mockGenerateId(len);
    const domain = MOCK_STATE.domains[Number(url.searchParams.get('domainIndex') || 0)] || 'example.com';
    const email = `${id}@${domain}`;
    const newMailbox = { 
      id: MOCK_STATE.nextMailboxId++,
      address: email, 
      created_at: new Date().toISOString().replace('T', ' ').slice(0, 19), 
      is_pinned: 0,
      password_is_default: 1,
      can_login: 0,
      forward_to: null,
      is_favorite: 0
    };
    MOCK_STATE.mailboxes.unshift(newMailbox);
    return new Response(JSON.stringify({ email, expires: Date.now() + 3600000 }), { headers: jsonHeaders });
  }

  // GET /api/emails
  if (url.pathname === '/api/emails' && (!options.method || options.method === 'GET')) {
    const mailbox = url.searchParams.get('mailbox') || '';
    let list = MOCK_STATE.emailsByMailbox.get(mailbox);
    if (!list) {
      list = buildMockEmails(6);
      MOCK_STATE.emailsByMailbox.set(mailbox, list);
    }
    return new Response(JSON.stringify(list), { headers: jsonHeaders });
  }

  // GET /api/emails/batch
  if (url.pathname === '/api/emails/batch' && (!options.method || options.method === 'GET')) {
    const ids = String(url.searchParams.get('ids') || '')
      .split(',')
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isInteger(item) && item > 0);
    const list = ids.map((id) => buildMockEmailDetail(id));
    return new Response(JSON.stringify(list), { headers: jsonHeaders });
  }

  // GET /api/email/:id
  if (url.pathname.startsWith('/api/email/') && (!options.method || options.method === 'GET')) {
    const id = Number(url.pathname.split('/')[3]);
    return new Response(JSON.stringify(buildMockEmailDetail(id)), { headers: jsonHeaders });
  }

  // GET /api/sent
  if (url.pathname === '/api/sent' && (!options.method || options.method === 'GET')) {
    const from = url.searchParams.get('from') || url.searchParams.get('mailbox') || '';
    const sentList = buildMockSentEmails(from, DEMO_SENT_LIBRARY.length);
    sentList.forEach((item) => MOCK_STATE.sentEmailsById.set(item.id, item));
    return new Response(JSON.stringify(sentList), { headers: jsonHeaders });
  }

  // GET /api/sent/:id
  if (url.pathname.startsWith('/api/sent/') && (!options.method || options.method === 'GET')) {
    const id = Number(url.pathname.split('/')[3]);
    const cached = MOCK_STATE.sentEmailsById.get(id);
    return new Response(JSON.stringify(cached || buildMockSentEmailDetail(id)), { headers: jsonHeaders });
  }

  // GET /api/mailboxes
  if (url.pathname === '/api/mailboxes' && (!options.method || options.method === 'GET')) {
    // 初始化 mock 邮箱
    if (!MOCK_STATE.mailboxes.length) {
      MOCK_STATE.mailboxes = buildMockMailboxes(6, 2, MOCK_STATE.domains);
    }
    
    let result = [...MOCK_STATE.mailboxes];
    
    // 搜索过滤
    const q = url.searchParams.get('q');
    if (q) {
      result = result.filter(m => m.address.toLowerCase().includes(q.toLowerCase()));
    }
    
    // 域名过滤
    const domain = url.searchParams.get('domain');
    if (domain) {
      result = result.filter(m => m.address.endsWith('@' + domain));
    }
    
    // 登录状态过滤
    const login = url.searchParams.get('login');
    if (login === 'allowed') {
      result = result.filter(m => m.can_login);
    } else if (login === 'denied') {
      result = result.filter(m => !m.can_login);
    }
    
    // 收藏状态过滤
    const favorite = url.searchParams.get('favorite');
    if (favorite === 'favorite') {
      result = result.filter(m => m.is_favorite);
    } else if (favorite === 'not-favorite') {
      result = result.filter(m => !m.is_favorite);
    }
    
    // 转发状态过滤
    const forward = url.searchParams.get('forward');
    if (forward === 'has-forward') {
      result = result.filter(m => m.forward_to);
    } else if (forward === 'no-forward') {
      result = result.filter(m => !m.forward_to);
    }
    
    // 排序：置顶优先，然后按时间
    result.sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) {
        return (b.is_pinned || 0) - (a.is_pinned || 0);
      }
      return new Date(b.created_at) - new Date(a.created_at);
    });
    
    // 分页
    const page = Number(url.searchParams.get('page') || 1);
    const size = Number(url.searchParams.get('size') || 20);
    const total = result.length;
    const start = (page - 1) * size;
    const pageResult = result.slice(start, start + size);
    
    return new Response(JSON.stringify({ list: pageResult, total }), { headers: jsonHeaders });
  }

  // POST /api/mailboxes/pin
  if (url.pathname === '/api/mailboxes/pin' && options.method === 'POST') {
    const address = url.searchParams.get('address');
    if (!address) return new Response('缺少 address 参数', { status: 400 });
    
    const mailbox = MOCK_STATE.mailboxes.find(m => m.address === address);
    if (mailbox) {
      mailbox.is_pinned = mailbox.is_pinned ? 0 : 1;
      return new Response(JSON.stringify({ success: true, is_pinned: mailbox.is_pinned }), { headers: jsonHeaders });
    }
    return new Response('邮箱不存在', { status: 404 });
  }

  // POST /api/create
  if (url.pathname === '/api/create' && options.method === 'POST') {
    try {
      const body = typeof options.body === 'string' ? JSON.parse(options.body || '{}') : (options.body || {});
      const local = String((body.local || '').trim());
      if (!/^[A-Za-z0-9._-]{1,64}$/.test(local)) {
        return new Response('非法用户名', { status: 400 });
      }
      const domainIndex = Number(body.domainIndex || 0);
      const domain = MOCK_STATE.domains[Math.max(0, Math.min(MOCK_STATE.domains.length - 1, domainIndex))] || 'example.com';
      const email = `${local}@${domain}`;
      
      if (MOCK_STATE.mailboxes.find(m => m.address === email)) {
        return new Response('邮箱地址已存在', { status: 409 });
      }
      
      const newMailbox = { 
        id: MOCK_STATE.nextMailboxId++,
        address: email, 
        created_at: new Date().toISOString().replace('T', ' ').slice(0, 19), 
        is_pinned: 0,
        password_is_default: 1,
        can_login: 0,
        forward_to: null,
        is_favorite: 0
      };
      MOCK_STATE.mailboxes.unshift(newMailbox);
      return new Response(JSON.stringify({ email, expires: Date.now() + 3600000 }), { headers: jsonHeaders });
    } catch (_) {
      return new Response('Bad Request', { status: 400 });
    }
  }

  // 演示模式禁止删除操作
  if ((url.pathname === '/api/emails' && options.method === 'DELETE') ||
      (url.pathname.startsWith('/api/email/') && options.method === 'DELETE') ||
      (url.pathname === '/api/mailboxes' && options.method === 'DELETE') ||
      (url.pathname.startsWith('/api/sent/') && options.method === 'DELETE')) {
    return new Response('演示模式不可操作', { status: 403 });
  }

  // GET /api/user/quota
  if (url.pathname === '/api/user/quota') {
    return new Response(JSON.stringify({ limit: 999, used: MOCK_STATE.mailboxes.length, remaining: 997 }), { headers: jsonHeaders });
  }

  // GET /api/session
  if (url.pathname === '/api/session') {
    return new Response(JSON.stringify({ authenticated: true, role: 'guest', username: 'guest' }), { headers: jsonHeaders });
  }

  // POST /api/logout - 登出
  if (url.pathname === '/api/logout' && options.method === 'POST') {
    // 清除 guest 模式状态
    window.__GUEST_MODE__ = false;
    return new Response(JSON.stringify({ success: true }), { headers: jsonHeaders });
  }

  // POST /api/mailbox/forward - 设置转发
  if (url.pathname === '/api/mailbox/forward' && options.method === 'POST') {
    try {
      const body = typeof options.body === 'string' ? JSON.parse(options.body || '{}') : (options.body || {});
      const mailboxId = body.mailbox_id;
      const forwardTo = body.forward_to || null;
      
      const mailbox = MOCK_STATE.mailboxes.find(m => m.id === mailboxId);
      if (mailbox) {
        mailbox.forward_to = forwardTo;
        return new Response(JSON.stringify({ success: true, forward_to: forwardTo }), { headers: jsonHeaders });
      }
      return new Response(JSON.stringify({ error: '邮箱不存在' }), { status: 404, headers: jsonHeaders });
    } catch (_) {
      return new Response(JSON.stringify({ error: 'Bad Request' }), { status: 400, headers: jsonHeaders });
    }
  }

  // POST /api/mailbox/favorite - 切换收藏
  if (url.pathname === '/api/mailbox/favorite' && options.method === 'POST') {
    try {
      const body = typeof options.body === 'string' ? JSON.parse(options.body || '{}') : (options.body || {});
      const mailboxId = body.mailbox_id;
      
      const mailbox = MOCK_STATE.mailboxes.find(m => m.id === mailboxId);
      if (mailbox) {
        mailbox.is_favorite = mailbox.is_favorite ? 0 : 1;
        return new Response(JSON.stringify({ success: true, is_favorite: mailbox.is_favorite }), { headers: jsonHeaders });
      }
      return new Response(JSON.stringify({ error: '邮箱不存在' }), { status: 404, headers: jsonHeaders });
    } catch (_) {
      return new Response(JSON.stringify({ error: 'Bad Request' }), { status: 400, headers: jsonHeaders });
    }
  }

  // POST /api/mailboxes/batch-favorite - 批量收藏
  if (url.pathname === '/api/mailboxes/batch-favorite' && options.method === 'POST') {
    try {
      const body = typeof options.body === 'string' ? JSON.parse(options.body || '{}') : (options.body || {});
      const mailboxIds = body.mailbox_ids || [];
      const isFavorite = body.is_favorite ? 1 : 0;
      
      let count = 0;
      for (const id of mailboxIds) {
        const mailbox = MOCK_STATE.mailboxes.find(m => m.id === id);
        if (mailbox) {
          mailbox.is_favorite = isFavorite;
          count++;
        }
      }
      return new Response(JSON.stringify({ success: true, updated_count: count }), { headers: jsonHeaders });
    } catch (_) {
      return new Response(JSON.stringify({ error: 'Bad Request' }), { status: 400, headers: jsonHeaders });
    }
  }

  // POST /api/mailboxes/batch-favorite-by-address - 批量收藏（按地址）
  if (url.pathname === '/api/mailboxes/batch-favorite-by-address' && options.method === 'POST') {
    try {
      const body = typeof options.body === 'string' ? JSON.parse(options.body || '{}') : (options.body || {});
      const addresses = body.addresses || [];
      const isFavorite = body.is_favorite ? 1 : 0;
      
      let count = 0;
      for (const addr of addresses) {
        const mailbox = MOCK_STATE.mailboxes.find(m => m.address === addr);
        if (mailbox) {
          mailbox.is_favorite = isFavorite;
          count++;
        }
      }
      return new Response(JSON.stringify({ success: true, updated_count: count }), { headers: jsonHeaders });
    } catch (_) {
      return new Response(JSON.stringify({ error: 'Bad Request' }), { status: 400, headers: jsonHeaders });
    }
  }

  // POST /api/mailboxes/batch-forward-by-address - 批量转发（按地址）
  if (url.pathname === '/api/mailboxes/batch-forward-by-address' && options.method === 'POST') {
    try {
      const body = typeof options.body === 'string' ? JSON.parse(options.body || '{}') : (options.body || {});
      const addresses = body.addresses || [];
      const forwardTo = body.forward_to || null;
      
      let count = 0;
      for (const addr of addresses) {
        const mailbox = MOCK_STATE.mailboxes.find(m => m.address === addr);
        if (mailbox) {
          mailbox.forward_to = forwardTo;
          count++;
        }
      }
      return new Response(JSON.stringify({ success: true, updated_count: count }), { headers: jsonHeaders });
    } catch (_) {
      return new Response(JSON.stringify({ error: 'Bad Request' }), { status: 400, headers: jsonHeaders });
    }
  }

  // POST /api/mailboxes/toggle-login - 切换登录状态
  if (url.pathname === '/api/mailboxes/toggle-login' && options.method === 'POST') {
    try {
      const body = typeof options.body === 'string' ? JSON.parse(options.body || '{}') : (options.body || {});
      const address = body.address;
      const canLogin = body.can_login ? 1 : 0;
      
      const mailbox = MOCK_STATE.mailboxes.find(m => m.address === address);
      if (mailbox) {
        mailbox.can_login = canLogin;
        return new Response(JSON.stringify({ success: true, can_login: canLogin }), { headers: jsonHeaders });
      }
      return new Response(JSON.stringify({ error: '邮箱不存在' }), { status: 404, headers: jsonHeaders });
    } catch (_) {
      return new Response(JSON.stringify({ error: 'Bad Request' }), { status: 400, headers: jsonHeaders });
    }
  }

  // POST /api/mailboxes/batch-toggle-login - 批量切换登录状态
  if (url.pathname === '/api/mailboxes/batch-toggle-login' && options.method === 'POST') {
    try {
      const body = typeof options.body === 'string' ? JSON.parse(options.body || '{}') : (options.body || {});
      const addresses = body.addresses || [];
      const canLogin = body.can_login ? 1 : 0;
      
      let count = 0;
      for (const addr of addresses) {
        const mailbox = MOCK_STATE.mailboxes.find(m => m.address === addr);
        if (mailbox) {
          mailbox.can_login = canLogin;
          count++;
        }
      }
      return new Response(JSON.stringify({ success: true, updated_count: count }), { headers: jsonHeaders });
    } catch (_) {
      return new Response(JSON.stringify({ error: 'Bad Request' }), { status: 400, headers: jsonHeaders });
    }
  }

  return new Response('Not Found', { status: 404 });
}

// 导出默认对象
export default {
  MOCK_STATE,
  mockGenerateId,
  buildMockEmails,
  buildMockEmailDetail,
  buildMockSentEmails,
  buildMockSentEmailDetail,
  buildMockMailboxes,
  mockApi
};
