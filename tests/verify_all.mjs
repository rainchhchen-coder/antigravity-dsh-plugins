/**
 * 端到端自动化验证脚本：
 * 1. 校验 3 个插件的 plugin.json 与 sidecar.json 规范性
 * 2. 校验无 skills/rules/mcp_config.json（确保 0 额外 Token 消耗）
 * 3. 实际启动 3 个 Sidecar 后端，逐一测试 HTTP 页面、API 与图片资源
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const PLUGINS = [
  {
    name: 'antigravity-better-sidebar',
    sidecar: 'better_sidebar',
    checks: async (base) => {
      const html = await fetch(`${base}/`).then((r) => { assert.equal(r.status, 200); return r.text(); });
      assert.ok(html.includes('Better Sidebar'));
      const health = await fetch(`${base}/api/health`).then((r) => r.json());
      assert.equal(health.ok, true);
      assert.equal(health.tokenCost, 0);
      const files = await fetch(`${base}/api/files`).then((r) => r.json());
      assert.ok(Array.isArray(files.tree));
      const exts = await fetch(`${base}/api/extensions`).then((r) => r.json());
      assert.ok(exts.extensions.length >= 1);
      const git = await fetch(`${base}/api/git/status`).then((r) => r.json());
      assert.equal(typeof git.available, 'boolean');
    },
  },
  {
    name: 'antigravity-balance-widget',
    sidecar: 'balance_widget',
    checks: async (base) => {
      const html = await fetch(`${base}/`).then((r) => { assert.equal(r.status, 200); return r.text(); });
      assert.ok(html.includes('小鲸鱼余额挂件'));
      const health = await fetch(`${base}/api/health`).then((r) => r.json());
      assert.equal(health.ok, true);
      assert.equal(health.tokenCost, 0);
      const bal = await fetch(`${base}/api/balance`).then((r) => r.json());
      assert.equal(bal.ok, true);
      assert.equal(bal.tokenCost, 0);
      assert.equal(typeof bal.totalBalance, 'number');
    },
  },
  {
    name: 'antigravity-gemini-pet',
    sidecar: 'gemini_pet',
    checks: async (base) => {
      const html = await fetch(`${base}/`).then((r) => { assert.equal(r.status, 200); return r.text(); });
      assert.ok(html.includes('Gemini 娘桌宠'));
      const health = await fetch(`${base}/api/health`).then((r) => r.json());
      assert.equal(health.ok, true);
      assert.equal(health.tokenCost, 0);
      const st = await fetch(`${base}/api/state`).then((r) => r.json());
      assert.ok(['idle', 'thinking', 'coding', 'sleepy'].includes(st.state));
      assert.equal(st.tokenCost, 0);
      for (const img of ['gemini_idle.jpg', 'gemini_thinking.jpg', 'gemini_coding.jpg']) {
        const res = await fetch(`${base}/assets/${img}`);
        assert.equal(res.status, 200, `Missing asset ${img}`);
        const buf = await res.arrayBuffer();
        assert.ok(buf.byteLength > 10000, `Asset ${img} unexpectedly small`);
      }
    },
  },
];

function startSidecar(cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['main.mjs'], {
      cwd,
      env: { ...process.env, PORT: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Timeout starting sidecar in ${cwd}: ${stderr}`));
    }, 8000);
    child.stdout.on('data', (chunk) => {
      const line = chunk.toString('utf-8');
      const m = line.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (m) {
        clearTimeout(timer);
        resolve({ child, base: `http://127.0.0.1:${m[1]}` });
      }
    });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf-8'); });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Sidecar exited early (${code}): ${stderr}`));
    });
  });
}

for (const p of PLUGINS) {
  const pDir = join(ROOT, 'plugins', p.name);
  const sDir = join(pDir, 'sidecars', p.sidecar);

  // 1. 校验 manifest
  const manifest = JSON.parse(readFileSync(join(pDir, 'plugin.json'), 'utf-8'));
  assert.equal(manifest.name, p.name);
  assert.ok(existsSync(join(pDir, manifest.logo)), `Missing logo for ${p.name}`);

  // 2. 校验零 Token 消耗结构（不包含 skills/rules/mcp_config.json）
  assert.equal(existsSync(join(pDir, 'skills')), false, `${p.name} should not ship skills`);
  assert.equal(existsSync(join(pDir, 'rules')), false, `${p.name} should not ship rules`);
  assert.equal(existsSync(join(pDir, 'mcp_config.json')), false, `${p.name} should not ship mcp_config.json`);

  // 3. 校验 sidecar.json
  const sc = JSON.parse(readFileSync(join(sDir, 'sidecar.json'), 'utf-8'));
  assert.equal(sc.has_web_ui, true);
  assert.equal(sc.ui_config.views[0].entrypoint, 'SIDECAR_UI_ENTRYPOINT_AUX_PANE');

  // 4. 真实启动并验证所有路由与资源
  const { child, base } = await startSidecar(sDir);
  try {
    await p.checks(base);
    console.log(`[PASS] ${p.name} (${base}) — manifest, 0-token check, HTTP APIs & assets verified.`);
  } finally {
    child.kill();
  }
}

console.log('\nALL 3 PLUGINS PASSED END-TO-END VERIFICATION.');
