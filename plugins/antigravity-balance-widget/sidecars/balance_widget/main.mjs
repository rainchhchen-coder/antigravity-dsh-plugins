/**
 * Antigravity Balance Whale Widget - Sidecar Backend
 * 灵感源自 MeteorNOX/DeepSeek-Balance-Whale-Widget (MIT License)
 * 仅调用只读余额查询接口（0 LLM Token 消耗），API Key 仅保存在本机用户配置目录中。
 */
import http from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = join(homedir(), '.gemini', 'config', 'plugin-data');
const CONFIG_FILE = join(CONFIG_DIR, 'antigravity-balance-widget.json');

const DEFAULT_CONFIG = {
  provider: 'demo', // 'deepseek' | 'custom' | 'demo'
  apiKey: '',
  customUrl: '',
  currency: 'CNY',
  pollSeconds: 60,
  lowThreshold: 5.0,
  demoBalance: 42.88,
};

function loadConfig() {
  try {
    if (existsSync(CONFIG_FILE)) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) };
    }
  } catch {}
  return { ...DEFAULT_CONFIG };
}

function saveConfig(patch) {
  const next = { ...loadConfig(), ...patch };
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2), { encoding: 'utf-8', mode: 0o600 });
  return next;
}

function maskKey(key) {
  if (!key || key.length < 8) return key ? '****' : '';
  return `${key.slice(0, 4)}****${key.slice(-4)}`;
}

async function fetchBalance(cfg) {
  if (cfg.provider === 'demo' || (!cfg.apiKey && cfg.provider === 'deepseek')) {
    return {
      ok: true,
      provider: 'demo',
      isAvailable: true,
      currency: cfg.currency || 'CNY',
      totalBalance: Number(cfg.demoBalance ?? 42.88),
      grantedBalance: 10.0,
      toppedUpBalance: Number(((cfg.demoBalance ?? 42.88) - 10.0).toFixed(2)),
      updatedAt: new Date().toISOString(),
      tokenCost: 0,
      note: cfg.provider === 'deepseek' ? '未填写 API Key，当前为演示模式' : '演示模式（可在设置中填入 DeepSeek API Key）',
    };
  }

  const endpoint = cfg.provider === 'custom' && cfg.customUrl
    ? cfg.customUrl
    : 'https://api.deepseek.com/user/balance';

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!resp.ok) {
      return { ok: false, error: `HTTP ${resp.status}: ${resp.statusText}`, provider: cfg.provider };
    }
    const json = await resp.json();

    // 兼容 DeepSeek 官方格式: { is_available, balance_infos: [{ currency, total_balance, granted_balance, topped_up_balance }] }
    if (Array.isArray(json.balance_infos) && json.balance_infos.length > 0) {
      const info = json.balance_infos.find((b) => b.currency === cfg.currency) || json.balance_infos[0];
      return {
        ok: true,
        provider: cfg.provider,
        isAvailable: Boolean(json.is_available),
        currency: info.currency || 'CNY',
        totalBalance: Number(info.total_balance || 0),
        grantedBalance: Number(info.granted_balance || 0),
        toppedUpBalance: Number(info.topped_up_balance || 0),
        updatedAt: new Date().toISOString(),
        tokenCost: 0,
      };
    }

    // 兼容常见自定义 JSON 格式: { balance } 或 { total_balance }
    const val = Number(json.total_balance ?? json.balance ?? json.data?.balance ?? 0);
    return {
      ok: true,
      provider: cfg.provider,
      isAvailable: val > 0,
      currency: json.currency || cfg.currency || 'CNY',
      totalBalance: val,
      grantedBalance: 0,
      toppedUpBalance: val,
      updatedAt: new Date().toISOString(),
      tokenCost: 0,
    };
  } catch (err) {
    return { ok: false, error: err.message || '网络请求失败', provider: cfg.provider };
  }
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
          this.contentType = opts.contentType || 'text/plain; charset=utf-8';
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
            const route = routes.find((r) => r.path === url.pathname && r.method === req.method);
            if (!route) {
              res.writeHead(404, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Not found' }));
              return;
            }
            let data = Object.fromEntries(url.searchParams.entries());
            if (req.method === 'POST') {
              const chunks = [];
              for await (const c of req) chunks.push(c);
              const raw = Buffer.concat(chunks).toString('utf-8');
              if (raw) { try { data = { ...data, ...JSON.parse(raw) }; } catch {} }
            }
            try {
              const out = await route.handler(data);
              if (route.isPage && typeof out === 'string') {
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
            console.log(`[Balance Whale] Standalone listening at http://127.0.0.1:${server.address().port}/`);
          });
        },
      },
    };
  }
}

const { app, mode } = await createRuntimeApp();

app.page('/', () => readFileSync(join(__dirname, 'index.html'), 'utf-8'));

app.api('/api/health', () => ({ ok: true, mode, tokenCost: 0 }), 'GET');

app.api('/api/config', () => {
  const cfg = loadConfig();
  return {
    provider: cfg.provider,
    hasApiKey: Boolean(cfg.apiKey),
    maskedKey: maskKey(cfg.apiKey),
    customUrl: cfg.customUrl,
    currency: cfg.currency,
    pollSeconds: cfg.pollSeconds,
    lowThreshold: cfg.lowThreshold,
    demoBalance: cfg.demoBalance,
  };
}, 'GET');

app.api('/api/config', (data) => {
  const patch = {};
  if (['deepseek', 'custom', 'demo'].includes(data.provider)) patch.provider = data.provider;
  if (typeof data.apiKey === 'string' && data.apiKey.trim() !== '') patch.apiKey = data.apiKey.trim();
  if (data.clearKey) patch.apiKey = '';
  if (typeof data.customUrl === 'string') patch.customUrl = data.customUrl.trim();
  if (typeof data.currency === 'string') patch.currency = data.currency.trim() || 'CNY';
  if (Number.isFinite(Number(data.pollSeconds))) patch.pollSeconds = Math.max(15, Number(data.pollSeconds));
  if (Number.isFinite(Number(data.lowThreshold))) patch.lowThreshold = Math.max(0, Number(data.lowThreshold));
  if (Number.isFinite(Number(data.demoBalance))) patch.demoBalance = Math.max(0, Number(data.demoBalance));
  saveConfig(patch);
  return { ok: true };
}, 'POST');

app.api('/api/balance', async () => {
  const cfg = loadConfig();
  return await fetchBalance(cfg);
}, 'GET');

app.run();
