const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const root = path.resolve(__dirname, '..');
const wranglerBin = path.resolve(root, '..', '..', 'preview-tools', 'wrangler-local', 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const playwright = require(path.resolve(root, '..', '..', 'node_modules', 'playwright'));
const browserCandidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
];

function resolveBrowserExecutable() {
  for (const candidate of browserCandidates) {
    if (require('fs').existsSync(candidate)) return candidate;
  }
  return '';
}

async function waitForServer(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const status = await new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
          res.resume();
          resolve(res.statusCode || 0);
        });
        req.on('error', reject);
      });
      if (status >= 200 && status < 500) return;
    } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 600));
  }
  throw new Error(`Server not ready: ${url}`);
}

function startWrangler() {
  const child = spawn(process.execPath, [wranglerBin, 'dev', '--port', '8787', '--ip', '127.0.0.1'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  child.stdout.on('data', (chunk) => process.stdout.write(String(chunk)));
  child.stderr.on('data', (chunk) => process.stderr.write(String(chunk)));
  return child;
}

async function run() {
  const server = startWrangler();
  const stopServer = () => {
    if (!server.killed) {
      try { server.kill('SIGTERM'); } catch (_) {}
    }
  };

  process.on('exit', stopServer);
  process.on('SIGINT', () => { stopServer(); process.exit(130); });

  try {
    await waitForServer('http://127.0.0.1:8787/');

    const executablePath = resolveBrowserExecutable();
    const browser = await playwright.chromium.launch(executablePath ? { headless: true, executablePath } : { headless: true });
    const page = await browser.newPage();

    await page.goto('http://127.0.0.1:8787/html/login.html', { waitUntil: 'networkidle' });
    await page.fill('#username', 'guest');
    await page.fill('#pwd', 'admin');
    await Promise.all([
      page.waitForURL('http://127.0.0.1:8787/', { timeout: 15000 }),
      page.click('#login')
    ]);

    await page.click('#gen');
    await page.waitForFunction(() => {
      const text = document.querySelector('#email-text')?.textContent || '';
      return text && !text.includes('点击右侧生成按钮创建邮箱地址');
    }, { timeout: 15000 });
    await page.waitForSelector('#list-card', { state: 'visible', timeout: 15000 });
    await page.waitForSelector('#list .email-item', { timeout: 15000 });

    await page.fill('#email-filter-keyword', '样本');
    await page.waitForTimeout(700);
    await page.waitForSelector('.search-hit-tag', { timeout: 15000 });

    page.once('dialog', (dialog) => dialog.accept('Smoke 样本'));
    await page.click('#email-filter-save');
    await page.waitForSelector('.filter-preset-chip', { timeout: 15000 });

    const firstSubject = (await page.locator('#list .email-item').first().locator('.subject').textContent())?.trim();
    await page.locator('#list .email-item').first().click();
    await page.waitForSelector('#email-modal.show', { timeout: 15000 });
    await page.waitForSelector('[data-hit-nav]:not([hidden])', { timeout: 15000 });

    await page.keyboard.press('KeyJ');
    await page.waitForTimeout(500);
    const secondSubject = (await page.locator('#modal-subject').textContent())?.trim();
    if (!secondSubject || secondSubject === firstSubject) {
      throw new Error('J 快捷键未切换到下一封邮件');
    }

    await page.keyboard.press('KeyK');
    await page.waitForTimeout(500);
    const backSubject = (await page.locator('#modal-subject').textContent())?.trim();
    if (!backSubject || backSubject === secondSubject) {
      throw new Error('K 快捷键未切换回上一封邮件');
    }

    await page.keyboard.press('KeyE');
    await page.waitForTimeout(400);
    const markReadLabel = (await page.locator('[data-detail-mark-read]').textContent())?.trim();
    if (markReadLabel !== '已读') {
      throw new Error('E 快捷键未成功标记已读');
    }

    await page.keyboard.press('Delete');
    await page.waitForSelector('#confirm-modal.show', { timeout: 10000 });
    await page.click('#confirm-ok');
    await page.waitForSelector('#email-modal.show', { state: 'hidden', timeout: 15000 });

    await browser.close();
    stopServer();
    console.log('smoke-ui-ok');
  } catch (error) {
    stopServer();
    console.error('smoke-ui-failed');
    console.error(error?.stack || String(error));
    process.exit(1);
  }
}

run();
