# 可行性、兼容性、Token 消耗与潜在问题审计报告

## 1. 会不会额外消耗 Token？（核心结论：**不会，严格 0 额外 Token**）

在 Google Antigravity 2.0 中，哪些插件内容会消耗大模型上下文 Token，哪些不会，有明确的边界：

| 插件组件 | 是否注入 LLM 上下文 | 本仓库是否使用 | Token 消耗 |
| :--- | :--- | :--- | :--- |
| `rules/AGENTS.md` | **是**（每轮对话注入） | 未使用 | 0 |
| `skills/<name>/SKILL.md` | **是**（名称与描述常驻系统提示词） | 未使用 | 0 |
| `mcp_config.json` | **是**（工具 Schema 注入上下文） | 未使用 | 0 |
| `sidecars/<id>/`（纯 UI 面板） | **否**（本地独立进程 + Webview 渲染） | **全部使用** | **0** |

此外：
- `antigravity-balance-widget` 仅调用 `GET /user/balance` 只读账单查询接口，**不调用任何 Chat/Completion 推理接口**。
- `antigravity-gemini-pet` 仅通过本地文件系统只读检查 `transcript.jsonl` 末尾 8KB 的修改时间与步骤类型，**不向模型发送任何请求**。
- `antigravity-better-sidebar` 全部文件读写、终端命令与 Git 查询均在本地 Node.js 进程内完成，**不经过 LLM**。

> **结论**：启用本仓库全部 3 个插件，对 Antigravity 对话的上下文长度与模型账单均为 **0 额外 Token 消耗**。

---

## 2. 可行性与兼容性评估

| 维度 | 评估结果 | 说明 |
| :--- | :--- | :--- |
| **Antigravity 2.0 桌面端** | ✅ 原生完全兼容 | 遵循官方 `plugin.json` + `sidecar.json`（`has_web_ui: true`、`SIDECAR_UI_ENTRYPOINT_AUX_PANE`）与 `sidecar_sdk` 规范 |
| **主题同步（亮/暗模式）** | ✅ 原生兼容 | 前端引入 `/preload.js` 并消费宿主 CSS 变量（`--background`, `--card`, `--foreground`, `--border`） |
| **操作系统兼容性** | ✅ Windows / macOS / Linux | 后端仅使用 Node.js 内置模块，无原生 C++ 编译依赖、无平台特定二进制 |
| **Node.js 版本要求** | Node.js >= 18（已于 v26.13.1 实测通过） | 使用原生 `fetch` 与 ESM `.mjs` |
| **Antigravity CLI / IDE** | ⚠️ 部分兼容 | Sidecar Auxiliary Pane 为 Antigravity 2.0 桌面端特性；在无 `sidecar_sdk` 环境下可运行 `node main.mjs` 启动独立本地 Web 版 |

---

## 3. 所有可能出现的问题与规避方案

1. **客户端边界限制（无法悬浮在主对话窗口外）**
   - **原因**：Antigravity 官方 Sidecar 面板运行在右侧 Auxiliary Pane 沙箱内，不能突破 iframe 覆盖主聊天输入框。
   - **应对**：`balance-widget` 与 `gemini-pet` 在 Auxiliary Pane 内部提供完整的拖拽、贴边吸附、左吸附镜像翻转与物理弹跳舞台；同时提供独立运行模式（`PORT=xxxx node main.mjs`），可配合浏览器小窗置顶使用。
2. **端口冲突问题**
   - **原因**：固定端口容易与本地开发服务器冲突。
   - **应对**：在 Antigravity 内由 `sidecar_sdk` 自动分配通信通道；独立模式下默认监听 `PORT=0`（系统自动分配空闲端口）。
3. **路径穿越与工作区安全（`better-sidebar`）**
   - **原因**：文件编辑 API 若未校验路径，可能被误操作读写工作区外文件。
   - **应对**：`safePath()` 使用 `realpathSync` 严格校验目标路径必须在 `workspaceRoot` 内部，且限制单文件在线编辑上限为 1MB。
4. **Git 未安装时的兼容性（`better-sidebar`）**
   - **原因**：部分 Windows 机器未将 `git` 加入 `PATH`。
   - **应对**：`/api/git/status` 会先探测 `git --version`，若缺失则优雅降级展示提示文案，不影响文件浏览、终端和扩展页签功能。
5. **API Key 泄露风险（`balance-widget`）**
   - **原因**：若将 Key 存在前端 `localStorage` 或代码目录，容易误提交到 Git。
   - **应对**：Key 仅由本地 Sidecar 后端以 `0600` 权限写入 `~/.gemini/config/plugin-data/antigravity-balance-widget.json`，`GET /api/config` 仅返回脱敏掩码（如 `sk-1****abcd`）。
6. **大日志文件导致的高 I/O（`gemini-pet`）**
   - **原因**：长对话的 `transcript.jsonl` 可能达到数 MB，全量读取会卡顿。
   - **应对**：`readTail()` 仅用 `fs.readSync` 读取文件末尾 8KB，且轮询间隔为 4 秒，CPU 与磁盘开销几乎为零。
7. **外部 URL / iframe CSP 限制（`better-sidebar`）**
   - **原因**：部分网站通过 `X-Frame-Options: DENY` 禁止被 `iframe` 嵌入。
   - **应对**：扩展页签支持 `markdown`、`html`、`iframe` 三种模式；建议 `iframe` 主要用于嵌入本地开发服务（如 `http://localhost:5173`）。
8. **版权与原创合规风险**
   - **应对**：所有代码均为面向 Antigravity Sidecar 重新编写；`README.md` 与 `LICENSE` 明确标注模仿与灵感来源及原项目链接；`gemini-pet` 使用全新原创生成的无水印 Q 版 Gemini 娘立绘，不使用任何带原作者水印的搬运图片。
