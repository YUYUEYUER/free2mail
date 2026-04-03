const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');

const filesToParse = [
  'src/api/emails.js',
  'src/api/index.js',
  'src/api/mock.js',
  'src/db/init.js',
  'public/js/app.js',
  'public/js/modules/app/email-list.js',
  'public/js/modules/app/email-viewer.js',
  'public/js/modules/app/mock-api.js'
];

const syntaxTransforms = [
  [/^\s*import\s+[^;]+;\s*$/mg, ''],
  [/^\s*export\s+default\s+/mg, 'const __default__ = '],
  [/^\s*export\s+\{[^}]+\}\s+from\s+['"][^'"]+['"];?\s*$/mg, ''],
  [/^\s*export\s+(async\s+function|function|const|let|class)\s+/mg, (_, decl) => `${decl} `],
  [/^\s*export\s*\{[^}]+\};?\s*$/mg, '']
];

const checks = [
  {
    name: 'HTML ids',
    file: 'public/html/app.html',
    expected: [
      'email-filter-hit-field',
      'email-filter-presets',
      'email-filter-save',
      'email-filter-rename',
      'email-filter-default',
      'email-pending-toggle',
      'email-pending-preview'
    ],
    matcher: (source, needle) => source.includes(`id="${needle}"`)
  },
  {
    name: 'Email API routes',
    file: 'src/api/emails.js',
    expected: [
      '/api/emails/live',
      '/api/emails/stream',
      '/api/emails/delta',
      "path.endsWith('/read')",
      'messages_fts',
      'snippet(messages_fts'
    ]
  },
  {
    name: 'Viewer actions',
    file: 'public/js/modules/app/email-viewer.js',
    expected: [
      'data-detail-prev',
      'data-detail-next',
      'data-detail-copy-code',
      'data-detail-mark-read',
      'data-detail-delete',
      'renderHighlightedText',
      'highlightHtmlContent'
    ]
  },
  {
    name: 'App integrations',
    file: 'public/js/app.js',
    expected: [
      'EMAIL_FILTER_PRESETS_KEY',
      'renameSelectedEmailFilterPreset',
      'setDefaultEmailFilterPreset',
      'applyDefaultEmailFilterPreset',
      'handleDetailKeyboardShortcuts',
      'pendingPreviewCopyCode',
      'openEmailDetailWithContext'
    ]
  },
  {
    name: 'CSS hooks',
    file: 'public/css/app.css',
    expected: [
      '.filter-preset-row',
      '.search-hit-tag',
      '.email-nav-status',
      '.email-pending-preview__actions',
      '.email-preview mark'
    ]
  }
];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function parseSyntax(relativePath) {
  let source = read(relativePath);
  for (const [pattern, replacement] of syntaxTransforms) {
    source = source.replace(pattern, replacement);
  }

  const wrapped = (relativePath === 'public/js/app.js' ? '(async function(){\n' : '(function(){\n') + source + '\n})';
  new vm.Script(wrapped, { filename: relativePath });
}

function runSyntaxChecks() {
  for (const file of filesToParse) {
    parseSyntax(file);
  }
}

function runContentChecks() {
  const failures = [];

  for (const check of checks) {
    const source = read(check.file);
    for (const expected of check.expected) {
      const ok = typeof check.matcher === 'function'
        ? check.matcher(source, expected)
        : source.includes(expected);
      if (!ok) {
        failures.push(`${check.name}: missing ${expected} in ${check.file}`);
      }
    }
  }

  return failures;
}

function main() {
  runSyntaxChecks();
  const failures = runContentChecks();

  if (failures.length) {
    console.error('preflight-failed');
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exit(1);
  }

  console.log('preflight-ok');
  console.log(`syntax files: ${filesToParse.length}`);
  console.log(`contract groups: ${checks.length}`);
}

main();
