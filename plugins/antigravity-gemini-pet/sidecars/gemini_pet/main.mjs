/**
 * Antigravity Gemini Pet - Sidecar Backend
 * 灵感源自 PC2005-cloud/dsh-pet
 * 通过本地只读检查 Antigravity 对话 transcript.jsonl 尾部状态实现实时联动，0 额外 Token 消耗。
 */
import http from 'node:http';
import { existsSync, openSync, readSync, closeSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = join(__dirname, 'assets');
const CUSTOM_DIR = join(ASSETS_DIR, 'custom');

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.webm': 'video/webm',
  '.svg': 'image/svg+xml',
};

function readTail(filePath, maxBytes = 8192) {
  try {
    const st = statSync(filePath);
    const size = st.size;
    const start = Math.max(0, size - maxBytes);
    const len = size - start;
    const buf = Buffer.alloc(len);
    const fd = openSync(filePath, 'r');
    readSync(fd, buf, 0, len, start);
    closeSync(fd);
    return { text: buf.toString('utf-8'), mtimeMs: st.mtimeMs };
  } catch {
    return null;
  }
}

function detectAgentState(conversationId) {
  const appData = join(homedir(), '.gemini', 'antigravity', 'brain');
  let targetLog = null;

  if (conversationId && /^[0-9a-f-]{8,}$/i.test(conversationId)) {
    const p = join(appData, conversationId, '.system_generated', 'logs', 'transcript.jsonl');
    if (existsSync(p)) targetLog = p;
  }

  // 如果未传入 conversationId，查找最近修改的会话日志（只读）
  if (!targetLog && existsSync(appData)) {
    let latestMtime = 0;
    try {
      for (const dir of readdirSync(appData)) {
        const p = join(appData, dir, '.system_generated', 'logs', 'transcript.jsonl');
        if (existsSync(p)) {
          const mt = statSync(p).mtimeMs;
          if (mt > latestMtime) {
            latestMtime = mt;
            targetLog = p;
          }
        }
      }
    } catch {}
  }

  if (!targetLog) {
    return { state: 'idle', detail: '自由待机中～', synced: false, tokenCost: 0 };
  }

  const tail = readTail(targetLog);
  if (!tail) {
    return { state: 'idle', detail: '待机中～', synced: false, tokenCost: 0 };
  }

  const ageSec = (Date.now() - tail.mtimeMs) / 1000;
  if (ageSec > 180) {
    return { state: 'sleepy', detail: `已安静 ${Math.floor(ageSec / 60)} 分钟，电量偏低打盹中…`, synced: true, tokenCost: 0 };
  }

  const lines = tail.text.trim().split(/\r?\n/).filter(Boolean);
  let lastObj = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    try { lastObj = JSON.parse(lines[i]); break; } catch {}
  }

  if (!lastObj) {
    return { state: 'idle', detail: '元气满满待命中！', synced: true, tokenCost: 0 };
  }

  const hasTools = Array.isArray(lastObj.tool_calls) && lastObj.tool_calls.length > 0;
  if (ageSec < 20 && hasTools) {
    return { state: 'coding', detail: '正在认真写代码/调用工具中⚡', synced: true, tokenCost: 0 };
  }
  if (ageSec < 25 && (lastObj.type === 'USER_INPUT' || lastObj.thinking)) {
    return { state: 'thinking', detail: '耳朵听着呢，思考中…', synced: true, tokenCost: 0 };
  }
  return { state: 'idle', detail: '刚刚完成任务，元气待机中✨', synced: true, tokenCost: 0 };
}

function listCustomAssets() {
  if (!existsSync(CUSTOM_DIR)) return [];
  return readdirSync(CUSTOM_DIR)
    .filter((f) => Boolean(MIME[extname(f).toLowerCase()]))
    .map((f) => ({ name: f, url: `/assets/custom/${encodeURIComponent(f)}`, isVideo: extname(f).toLowerCase() === '.webm' }));
}

async function createRuntimeApp() {
  try {
    const sdk = await import('sidecar_sdk');
    return { mode: 'sidecar_sdk', app: new sdk.SidecarApp(), Response: sdk.Response };
  } catch {
    const routes = [];
    return {
      mode: 'standalone',
      Response: class FallbackResponse {
        constructor(body, opts = {}) {
          this.body = body;
          this.status = opts.status || 200;
          this.contentType = opts.contentType || 'application/octet-stream';
          this.headers = opts.headers || {};
        }
      },
      app: {
        config: {},
        page(path, handler) { routes.push({ method: 'GET', path, handler, isPage: true }); },
        api(path, handler, method = 'GET') { routes.push({ method: method.toUpperCase(), path, handler, isPage: false }); },
        run() {
          const port = Number(process.env.PORT || 0);
          const server = http.createServer(async (req, res) => {
            const url = new URL(req.url || '/', 'http://127.0.0.1');
            if (url.pathname === '/preload.js') {
              res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
              res.end('// standalone preload stub\n');
              return;
            }
            const route = routes.find((r) => (r.path === url.pathname || (r.path.endsWith('*') && url.pathname.startsWith(r.path.slice(0, -1)))) && r.method === req.method);
            if (!route) {
              res.writeHead(404, { 'Content-Type': 'text/plain' });
              res.end('Not found');
              return;
            }
            const data = { ...Object.fromEntries(url.searchParams.entries()), _pathname: url.pathname };
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
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: e.message }));
            }
          });
          server.listen(port, '127.0.0.1', () => {
            console.log(`[Gemini Pet] Standalone listening at http://127.0.0.1:${server.address().port}/`);
          });
        },
      },
    };
  }
}

const { app, Response, mode } = await createRuntimeApp();

app.page('/', () => readFileSync(join(__dirname, 'index.html'), 'utf-8'));

// 静态立绘路由（显式注册，确保在 sidecar_sdk 精确路由匹配下也能 100% 命中）
for (const file of ['gemini_idle.jpg', 'gemini_thinking.jpg', 'gemini_coding.jpg']) {
  app.api(`/assets/${file}`, () => {
    const p = join(ASSETS_DIR, file);
    if (!existsSync(p)) return new Response('not found', { status: 404 });
    return new Response(readFileSync(p), {
      contentType: 'image/jpeg',
      headers: { 'Cache-Control': 'private, max-age=3600' },
    });
  }, 'GET');
}

// 自定义皮肤读取接口（通过 query ?name= 避免通配符兼容性问题）
app.api('/api/custom-asset', (data) => {
  const name = String(data.name || '').replace(/[\\/]/g, '');
  const p = join(CUSTOM_DIR, name);
  const type = MIME[extname(name).toLowerCase()];
  if (!name || !type || !existsSync(p)) return new Response('not found', { status: 404 });
  return new Response(readFileSync(p), { contentType: type });
}, 'GET');

app.api('/api/health', () => ({ ok: true, mode, tokenCost: 0 }), 'GET');

app.api('/api/state', (data) => {
  const conv = data.conversationId || app.config.conversationId || '';
  return {
    ...detectAgentState(conv),
    customAssets: listCustomAssets().map((a) => ({ ...a, url: `/api/custom-asset?name=${encodeURIComponent(a.name)}` })),
  };
}, 'GET');

app.run();
