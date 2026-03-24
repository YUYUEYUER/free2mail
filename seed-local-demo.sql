PRAGMA foreign_keys = ON;

BEGIN TRANSACTION;

DELETE FROM messages
WHERE mailbox_id IN (
  SELECT id FROM mailboxes WHERE address IN (
    'briefing-desk@temp.example.com',
    'signal-lab@temp.example.com',
    'atlas-notes@temp.example.com',
    'press-room@temp.example.com',
    'ops-window@temp.example.com',
    'field-log@temp.example.com',
    'demo-intake@temp.example.com',
    'radar-alpha@temp.example.com',
    'studio-queue@temp.example.com',
    'dispatch-room@temp.example.com',
    'night-shift@temp.example.com',
    'review-board@temp.example.com'
  )
);

DELETE FROM sent_emails
WHERE from_addr IN (
  'briefing-desk@temp.example.com',
  'dispatch-room@temp.example.com',
  'signal-lab@temp.example.com'
);

DELETE FROM user_mailboxes
WHERE user_id IN (
  SELECT id FROM users WHERE username IN ('admin', 'editorial', 'insights', 'ops', 'support', 'archive')
)
OR mailbox_id IN (
  SELECT id FROM mailboxes WHERE address IN (
    'briefing-desk@temp.example.com',
    'signal-lab@temp.example.com',
    'atlas-notes@temp.example.com',
    'press-room@temp.example.com',
    'ops-window@temp.example.com',
    'field-log@temp.example.com',
    'demo-intake@temp.example.com',
    'radar-alpha@temp.example.com',
    'studio-queue@temp.example.com',
    'dispatch-room@temp.example.com',
    'night-shift@temp.example.com',
    'review-board@temp.example.com'
  )
);

DELETE FROM mailboxes
WHERE address IN (
  'briefing-desk@temp.example.com',
  'signal-lab@temp.example.com',
  'atlas-notes@temp.example.com',
  'press-room@temp.example.com',
  'ops-window@temp.example.com',
  'field-log@temp.example.com',
  'demo-intake@temp.example.com',
  'radar-alpha@temp.example.com',
  'studio-queue@temp.example.com',
  'dispatch-room@temp.example.com',
  'night-shift@temp.example.com',
  'review-board@temp.example.com'
);

DELETE FROM users
WHERE username IN ('editorial', 'insights', 'ops', 'support', 'archive');

INSERT OR IGNORE INTO users (username, role, can_send, mailbox_limit, created_at)
VALUES ('admin', 'admin', 1, 9999, '2026-03-15 08:30:00');

UPDATE users
SET role = 'admin', can_send = 1, mailbox_limit = 9999
WHERE username = 'admin';

INSERT INTO users (username, role, can_send, mailbox_limit, created_at)
VALUES
  ('editorial', 'admin', 1, 24, '2026-03-15 09:10:00'),
  ('insights', 'user', 1, 12, '2026-03-16 10:00:00'),
  ('ops', 'user', 0, 8, '2026-03-17 11:20:00'),
  ('support', 'user', 1, 10, '2026-03-18 14:05:00'),
  ('archive', 'user', 0, 6, '2026-03-19 17:40:00');

INSERT INTO mailboxes (
  address,
  local_part,
  domain,
  password_hash,
  created_at,
  last_accessed_at,
  expires_at,
  is_pinned,
  can_login,
  forward_to,
  is_favorite
)
VALUES
  ('briefing-desk@temp.example.com', 'briefing-desk', 'temp.example.com', NULL, '2026-03-20 08:10:00', '2026-03-24 08:02:00', NULL, 1, 1, 'chiefdesk@example.net', 1),
  ('signal-lab@temp.example.com', 'signal-lab', 'temp.example.com', NULL, '2026-03-20 09:00:00', '2026-03-24 07:20:00', NULL, 0, 0, NULL, 1),
  ('atlas-notes@temp.example.com', 'atlas-notes', 'temp.example.com', NULL, '2026-03-20 09:35:00', '2026-03-23 20:16:00', NULL, 0, 1, NULL, 0),
  ('press-room@temp.example.com', 'press-room', 'temp.example.com', NULL, '2026-03-20 10:12:00', '2026-03-24 06:45:00', NULL, 0, 1, 'press-archive@example.net', 0),
  ('ops-window@temp.example.com', 'ops-window', 'temp.example.com', NULL, '2026-03-20 11:08:00', '2026-03-23 18:00:00', NULL, 0, 0, NULL, 0),
  ('field-log@temp.example.com', 'field-log', 'temp.example.com', NULL, '2026-03-20 11:42:00', '2026-03-24 05:32:00', NULL, 0, 1, NULL, 1),
  ('demo-intake@temp.example.com', 'demo-intake', 'temp.example.com', NULL, '2026-03-20 12:15:00', '2026-03-24 07:55:00', NULL, 0, 0, NULL, 0),
  ('radar-alpha@temp.example.com', 'radar-alpha', 'temp.example.com', NULL, '2026-03-20 13:25:00', '2026-03-24 04:40:00', NULL, 0, 1, NULL, 0),
  ('studio-queue@temp.example.com', 'studio-queue', 'temp.example.com', NULL, '2026-03-20 14:05:00', '2026-03-23 23:10:00', NULL, 0, 0, 'review-desk@example.net', 0),
  ('dispatch-room@temp.example.com', 'dispatch-room', 'temp.example.com', NULL, '2026-03-20 15:10:00', '2026-03-24 08:15:00', NULL, 1, 1, NULL, 1),
  ('night-shift@temp.example.com', 'night-shift', 'temp.example.com', NULL, '2026-03-20 16:20:00', '2026-03-23 22:02:00', NULL, 0, 0, NULL, 0),
  ('review-board@temp.example.com', 'review-board', 'temp.example.com', NULL, '2026-03-20 17:30:00', '2026-03-24 06:18:00', NULL, 0, 1, NULL, 1);

INSERT INTO user_mailboxes (user_id, mailbox_id, created_at, is_pinned)
VALUES
  ((SELECT id FROM users WHERE username = 'admin'), (SELECT id FROM mailboxes WHERE address = 'briefing-desk@temp.example.com'), '2026-03-20 18:00:00', 1),
  ((SELECT id FROM users WHERE username = 'admin'), (SELECT id FROM mailboxes WHERE address = 'dispatch-room@temp.example.com'), '2026-03-20 18:05:00', 1),
  ((SELECT id FROM users WHERE username = 'admin'), (SELECT id FROM mailboxes WHERE address = 'review-board@temp.example.com'), '2026-03-20 18:08:00', 0),
  ((SELECT id FROM users WHERE username = 'editorial'), (SELECT id FROM mailboxes WHERE address = 'press-room@temp.example.com'), '2026-03-20 18:12:00', 1),
  ((SELECT id FROM users WHERE username = 'editorial'), (SELECT id FROM mailboxes WHERE address = 'atlas-notes@temp.example.com'), '2026-03-20 18:18:00', 0),
  ((SELECT id FROM users WHERE username = 'editorial'), (SELECT id FROM mailboxes WHERE address = 'studio-queue@temp.example.com'), '2026-03-20 18:22:00', 0),
  ((SELECT id FROM users WHERE username = 'insights'), (SELECT id FROM mailboxes WHERE address = 'signal-lab@temp.example.com'), '2026-03-20 18:28:00', 0),
  ((SELECT id FROM users WHERE username = 'insights'), (SELECT id FROM mailboxes WHERE address = 'field-log@temp.example.com'), '2026-03-20 18:34:00', 0),
  ((SELECT id FROM users WHERE username = 'insights'), (SELECT id FROM mailboxes WHERE address = 'radar-alpha@temp.example.com'), '2026-03-20 18:38:00', 1),
  ((SELECT id FROM users WHERE username = 'ops'), (SELECT id FROM mailboxes WHERE address = 'ops-window@temp.example.com'), '2026-03-20 18:42:00', 1),
  ((SELECT id FROM users WHERE username = 'ops'), (SELECT id FROM mailboxes WHERE address = 'night-shift@temp.example.com'), '2026-03-20 18:45:00', 0),
  ((SELECT id FROM users WHERE username = 'support'), (SELECT id FROM mailboxes WHERE address = 'demo-intake@temp.example.com'), '2026-03-20 18:48:00', 1),
  ((SELECT id FROM users WHERE username = 'support'), (SELECT id FROM mailboxes WHERE address = 'briefing-desk@temp.example.com'), '2026-03-20 18:53:00', 0),
  ((SELECT id FROM users WHERE username = 'support'), (SELECT id FROM mailboxes WHERE address = 'dispatch-room@temp.example.com'), '2026-03-20 18:58:00', 0);

INSERT INTO messages (mailbox_id, sender, to_addrs, subject, verification_code, preview, r2_bucket, r2_object_key, received_at, is_read)
VALUES
  ((SELECT id FROM mailboxes WHERE address = 'briefing-desk@temp.example.com'), 'alerts@signal-observer.net', 'briefing-desk@temp.example.com', '晨报样本：城市观测更新', NULL, '今早同步了 4 条城市观测线索，已整理进编辑部面板，适合直接作为首页演示样本。', 'mail-eml', '', '2026-03-24 08:18:00', 1),
  ((SELECT id FROM mailboxes WHERE address = 'briefing-desk@temp.example.com'), 'noreply@workspace.example', 'briefing-desk@temp.example.com', '登录验证码：482913', '482913', '用于演示验证码识别的样本邮件，验证码已自动提取为 482913。', 'mail-eml', '', '2026-03-24 07:54:00', 0),
  ((SELECT id FROM mailboxes WHERE address = 'signal-lab@temp.example.com'), 'digest@insight-board.org', 'signal-lab@temp.example.com', '研究摘要：本周信号面板', NULL, '信号面板已汇总 7 个高频主题，适合在总览页展示不同状态标签与预览文字。', 'mail-eml', '', '2026-03-24 07:12:00', 1),
  ((SELECT id FROM mailboxes WHERE address = 'atlas-notes@temp.example.com'), 'editor@atlas.example', 'atlas-notes@temp.example.com', '地图批注已更新', NULL, 'Atlas Notes 新增两条批注：一条关于热点区域，一条关于夜间趋势切换。', 'mail-eml', '', '2026-03-23 22:40:00', 0),
  ((SELECT id FROM mailboxes WHERE address = 'press-room@temp.example.com'), 'brief@presswire.example', 'press-room@temp.example.com', '外部快讯：发布节奏调整', NULL, '发布节奏已从每小时一轮改为半小时滚动，方便演示时间轴和空态切换。', 'mail-eml', '', '2026-03-24 06:38:00', 1),
  ((SELECT id FROM mailboxes WHERE address = 'ops-window@temp.example.com'), 'ops@stack.example', 'ops-window@temp.example.com', '值班窗口：队列水位正常', NULL, '当前队列水位维持在安全区间，未发现需要转发的高优先级异常。', 'mail-eml', '', '2026-03-23 18:05:00', 1),
  ((SELECT id FROM mailboxes WHERE address = 'field-log@temp.example.com'), 'field@observer.example', 'field-log@temp.example.com', '现场记录：样本回传完成', NULL, '三份现场记录已回传，包含一条验证码类邮件和两条普通摘要。', 'mail-eml', '', '2026-03-24 05:26:00', 0),
  ((SELECT id FROM mailboxes WHERE address = 'demo-intake@temp.example.com'), 'hello@demo-source.test', 'demo-intake@temp.example.com', '欢迎进入演示收件箱', NULL, '这是一封用于填充真实内容态的欢迎邮件，可用于展示空态过渡后的第一屏。', 'mail-eml', '', '2026-03-24 07:50:00', 0),
  ((SELECT id FROM mailboxes WHERE address = 'radar-alpha@temp.example.com'), 'notify@alpha-radar.net', 'radar-alpha@temp.example.com', 'Alpha Radar：热度点位 03', NULL, '点位 03 在过去 24 小时内升温明显，适合演示收藏与置顶策略。', 'mail-eml', '', '2026-03-24 04:34:00', 1),
  ((SELECT id FROM mailboxes WHERE address = 'studio-queue@temp.example.com'), 'queue@studio.example', 'studio-queue@temp.example.com', '待处理清单已排队', NULL, 'Studio Queue 当前保留 5 条待处理任务，建议用于转发规则和筛选状态演示。', 'mail-eml', '', '2026-03-23 23:02:00', 0),
  ((SELECT id FROM mailboxes WHERE address = 'dispatch-room@temp.example.com'), 'desk@dispatch.example', 'dispatch-room@temp.example.com', '调度台：样本投递完成', NULL, '两组样本已送达 dispatch room，首页和总览页都能直接看到真实记录。', 'mail-eml', '', '2026-03-24 08:10:00', 1),
  ((SELECT id FROM mailboxes WHERE address = 'dispatch-room@temp.example.com'), 'security@dispatch.example', 'dispatch-room@temp.example.com', '安全校验码：903144', '903144', '另一封验证码样本，用来验证移动端列表在真实内容下的阅读密度。', 'mail-eml', '', '2026-03-24 07:30:00', 0),
  ((SELECT id FROM mailboxes WHERE address = 'night-shift@temp.example.com'), 'nightwatch@ops.example', 'night-shift@temp.example.com', '夜班摘要：零点巡检完成', NULL, '夜班巡检已结束，暂无新增异常，适合搭配空收件箱状态一起观察。', 'mail-eml', '', '2026-03-23 21:58:00', 1),
  ((SELECT id FROM mailboxes WHERE address = 'review-board@temp.example.com'), 'review@board.example', 'review-board@temp.example.com', '复盘面板：待审条目 6 条', NULL, 'Review Board 当前有 6 条待审条目，足够用来观察分页和不同卡片状态。', 'mail-eml', '', '2026-03-24 06:10:00', 0);

INSERT INTO sent_emails (resend_id, from_name, from_addr, to_addrs, subject, html_content, text_content, status, scheduled_at, created_at, updated_at)
VALUES
  ('demo-resend-001', 'Briefing Desk', 'briefing-desk@temp.example.com', 'team@example.net', '演示发件：晨间摘要', '<div><h2>晨间摘要</h2><p>这是用于本地演示的发件样本，方便查看发件箱详情布局。</p></div>', '这是用于本地演示的发件样本，方便查看发件箱详情布局。', 'delivered', NULL, '2026-03-24 08:05:00', '2026-03-24 08:05:00'),
  ('demo-resend-002', 'Dispatch Room', 'dispatch-room@temp.example.com', 'ops@example.net, support@example.net', '演示发件：调度同步', '<div><p>Dispatch room 已完成今日样本同步。</p><p>可直接在首页切换到发件箱查看。</p></div>', 'Dispatch room 已完成今日样本同步。可直接在首页切换到发件箱查看。', 'delivered', NULL, '2026-03-24 07:42:00', '2026-03-24 07:42:00'),
  ('demo-resend-003', 'Signal Lab', 'signal-lab@temp.example.com', 'editorial@example.net', '演示发件：信号复核', '<div><p>Signal lab 已提交一份待复核说明，用于展示已发送内容预览。</p></div>', 'Signal lab 已提交一份待复核说明，用于展示已发送内容预览。', 'queued', '2026-03-24 11:30:00', '2026-03-24 07:10:00', '2026-03-24 07:10:00');

COMMIT;
