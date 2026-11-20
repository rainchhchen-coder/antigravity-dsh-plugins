/**
 * Antigravity Better Sidebar - Sidecar Backend
 * 灵感源自 omdsh-dev/DSH-better-sidebar (MIT License)
 * 专为 Google Antigravity 2.0 Sidecar 规范重构：零侵入、零额外 Token 消耗、跨平台。
 */
import http from 'node:http';
import { exec } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXTENSIONS_DIR = join(__dirname, 'extensions');
const MAX_EDIT_BYTES = 1024 * 1024; // 1 MB
const IGNORE_DIRS = new Set(['.git', 'node_modules', '.next', 'dist', 'build', '__pycache__', '.venv']);

// 工作区根目录：优先环境变量，否则取当前目录
let workspaceRoot = resolve(process.env.AGY_WORKSPACE || process.env.WORKSPACE_ROOT || process.cwd());

function safePath(relPath) {
  const rootReal = realpathSync(workspaceRoot);
  const candidate = resolve(rootReal, relPath || '.');
  const normRoot = rootReal.endsWith(sep) ? rootReal : rootReal + sep;
  if (candidate !== rootReal && !candidate.startsWith(normRoot)) {
    throw new Error('Access denied: path outside workspace');
  }
  return candidate;
}

function listTree(dirPath, depth = 0, maxDepth = 3) {
  if (depth > maxDepth) return [];
  let entries;
  try {
    entries = readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
  const items = [];
  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = join(dirPath, entry.name);
    const rel = relative(workspaceRoot, full).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      items.push({
        name: entry.name,
        path: rel,
        kind: 'dir',
        children: depth < maxDepth ? listTree(full, depth + 1, maxDepth) : [],
      });
    } else {
      let size = 0;
      try { size = statSync(full).size; } catch {}
      items.push({
        name: entry.name,
        path: rel,
        kind: 'file',
        ext: extname(entry.name).toLowerCase(),
        size,
      });
    }
  }
  items.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1));
  return items;
}

function loadExtensions() {
  if (!existsSync(EXTENSIONS_DIR)) mkdirSync(EXTENSIONS_DIR, { recursive: true });
  const list = [];
  for (const file of readdirSync(EXTENSIONS_DIR)) {
    if (!file.endsWith('.json')) continue;
    try {
      const data = JSON.parse(readFileSync(join(EXTENSIONS_DIR, file), 'utf-8'));
      if (data && data.id && data.title) {
        list.push({ ...data, _file: file });
      }
    } catch {
      // 忽略损坏的扩展配置
    }
  }
  return list;
}

function runShell(cmd, cwd, timeoutMs = 15000) {
  return new Promise((res) => {
    exec(cmd, { cwd, timeout: timeoutMs, maxBuffer: 2 * 1024 * 1024 }, (err, stdout, stderr) => {
      res({
        ok: !err,
        code: err ? (err.code ?? 1) : 0,
        stdout: String(stdout ?? ''),
        stderr: String(stderr ?? ''),
      });
    });
  });
}

// ---------------------------------------------------------------------------
// 统一注册路由（同时兼容官方 sidecar_sdk 与独立 Node HTTP 预览）
// ---------------------------------------------------------------------------
async function createRuntimeApp() {
  try {
    const sdk = await import('sidecar_sdk');
    return {
      mode: 'sidecar_sdk',
      app: new sdk.SidecarApp(),
      Response: sdk.Response,
    };
  } catch {
    // 独立运行/自动化测试 fallback
    const routes = [];
    return {
      mode: 'standalone',
      Response: class FallbackResponse {
        constructor(body, opts = {}) {
          this.body = body;
          this.status = opts.status || 200;
          this.contentType = opts.contentType || 'text/plain; charset=utf-8';
          this.headers = opts.headers || {};
        }
      },
      app: {
        config: {},
        page(path, handler) {
          routes.push({ method: 'GET', path, handler, isPage: true });
        },
        api(path, handler, method = 'GET') {
          routes.push({ method: method.toUpperCase(), path, handler, isPage: false });
        },
        run() {
          const port = Number(process.env.PORT || 0);
          const server = http.createServer(async (req, res) => {
            const url = new URL(req.url || '/', 'http://127.0.0.1');
            if (url.pathname === '/preload.js') {
              res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
              res.end('// standalone preload stub\n');
              return;
            }
            const route = routes.find((r) => r.path === url.pathname && r.method === req.method);
            if (!route) {
              res.writeHead(404, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Not found' }));
              return;
            }
            let data = Object.fromEntries(url.searchParams.entries());
            if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
              const chunks = [];
              for await (const c of req) chunks.push(c);
              const raw = Buffer.concat(chunks).toString('utf-8');
              if (raw) {
                try { data = { ...data, ...JSON.parse(raw) }; } catch {}
              }
            }
            try {
              const out = await route.handler(data);
              if (out && typeof out === 'object' && 'body' in out && 'status' in out) {
                res.writeHead(out.status, { 'Content-Type': out.contentType, ...out.headers });
                res.end(out.body);
              } else if (route.isPage && typeof out === 'string') {
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(out);
              } else {
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify(out));
              }
            } catch (e) {
              res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
              res.end(JSON.stringify({ error: e.message }));
            }
          });
          server.listen(port, '127.0.0.1', () => {
            const addr = server.address();
            console.log(`[Better Sidebar] Standalone listening at http://127.0.0.1:${addr.port}/`);
          });
        },
      },
    };
  }
}

const { app, Response, mode } = await createRuntimeApp();

app.page('/', () => readFileSync(join(__dirname, 'index.html'), 'utf-8'));

app.api('/api/health', () => ({
  ok: true,
  mode,
  workspaceRoot,
  tokenCost: 0,
}), 'GET');

app.api('/api/workspace', (data) => {
  if (data.root && existsSync(data.root) && statSync(data.root).isDirectory()) {
    workspaceRoot = resolve(data.root);
    return { ok: true, workspaceRoot };
  }
  return { ok: false, error: '目录不存在', workspaceRoot };
}, 'POST');

app.api('/api/files', (data) => {
  const rel = typeof data.dir === 'string' ? data.dir : '';
  const target = safePath(rel);
  return {
    workspaceRoot,
    tree: listTree(target, 0, 2),
  };
}, 'GET');

app.api('/api/file', (data) => {
  const rel = typeof data.path === 'string' ? data.path : '';
  if (!rel) return new Response(JSON.stringify({ error: 'missing path' }), { status: 400, contentType: 'application/json' });
  const target = safePath(rel);
  const st = statSync(target);
  if (st.size > MAX_EDIT_BYTES) {
    return { ok: false, error: `文件超过 1MB（${st.size} bytes），暂不支持在线编辑` };
  }
  const content = readFileSync(target, 'utf-8');
  return { ok: true, path: rel, name: basename(target), ext: extname(target).toLowerCase(), content };
}, 'GET');

app.api('/api/file/save', (data) => {
  const rel = typeof data.path === 'string' ? data.path : '';
  const content = typeof data.content === 'string' ? data.content : '';
  if (!rel) return { ok: false, error: 'missing path' };
  const target = safePath(rel);
  writeFileSync(target, content, 'utf-8');
  return { ok: true, path: rel, bytes: Buffer.byteLength(content, 'utf-8') };
}, 'POST');

app.api('/api/terminal', async (data) => {
  const cmd = typeof data.command === 'string' ? data.command.trim() : '';
  if (!cmd) return { ok: false, stderr: '空命令', stdout: '', code: 1 };
  return await runShell(cmd, workspaceRoot, 15000);
}, 'POST');

app.api('/api/git/status', async () => {
  const check = await runShell('git --version', workspaceRoot, 5000);
  if (!check.ok) {
    return { available: false, reason: '当前系统未检测到 git 命令，安装 Git 后即可自动启用。' };
  }
  const branch = await runShell('git rev-parse --abbrev-ref HEAD', workspaceRoot, 5000);
  if (!branch.ok) {
    return { available: true, isRepo: false, reason: '当前目录不是 Git 仓库。' };
  }
  const status = await runShell('git status --porcelain', workspaceRoot, 5000);
  const log = await runShell('git log -n 8 --oneline', workspaceRoot, 5000);
  const files = status.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => ({ code: line.slice(0, 2).trim() || 'M', path: line.slice(3).trim() }));
  return {
    available: true,
    isRepo: true,
    branch: branch.stdout.trim(),
    files,
    commits: log.stdout.split(/\r?\n/).filter(Boolean),
  };
}, 'GET');

app.api('/api/git/diff', async (data) => {
  const rel = typeof data.path === 'string' ? data.path : '';
  const safeArg = rel ? ` -- "${rel.replace(/"/g, '')}"` : '';
  const res = await runShell(`git diff${safeArg}`, workspaceRoot, 8000);
  return { ok: res.ok, diff: res.stdout || '(暂无未暂存差异)' };
}, 'GET');

app.api('/api/extensions', () => ({ extensions: loadExtensions() }), 'GET');

app.api('/api/extensions/add', (data) => {
  const id = String(data.id || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const title = String(data.title || '').trim();
  const type = ['markdown', 'iframe', 'html'].includes(data.type) ? data.type : 'markdown';
  if (!id || !title) return { ok: false, error: 'id 和 title 不能为空' };
  const payload = {
    id,
    title,
    icon: String(data.icon || '🧩').slice(0, 4),
    type,
    url: type === 'iframe' ? String(data.url || '') : undefined,
    content: type !== 'iframe' ? String(data.content || '') : undefined,
    description: String(data.description || ''),
  };
  writeFileSync(join(EXTENSIONS_DIR, `${id}.json`), JSON.stringify(payload, null, 2), 'utf-8');
  return { ok: true, extension: payload };
}, 'POST');

app.api('/api/extensions/delete', (data) => {
  const id = String(data.id || '').replace(/[^a-zA-Z0-9_-]/g, '');
  const file = join(EXTENSIONS_DIR, `${id}.json`);
  if (id && existsSync(file)) {
    unlinkSync(file);
    return { ok: true };
  }
  return { ok: false, error: '扩展不存在' };
}, 'POST');

app.run();
