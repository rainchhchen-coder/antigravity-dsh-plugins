# Antigravity DSH-Inspired Plugins Suite

面向 **Google Antigravity 2.0 原生 Sidecar UI 插件规范** 的社区插件合集，包含开放式侧边栏底座、QQ 弹弹小鲸鱼余额挂件，以及原创 Q 版 **Gemini 娘桌面宠物**。

> [!IMPORTANT]
> **原创声明与灵感来源致谢（Anti-Plagiarism & Attribution）**
>
> 本仓库中的所有插件均为**面向 Google Antigravity 2.0 原生 Sidecar 体系从零独立重构/编写**，**明确声明系模仿以下优秀 DSH（DeepSeek Harness）开源社区项目的设计理念与交互形态**，特此向原作者致敬并标明出处：
>
> | 本仓库插件 | 模仿/灵感来源项目 | 原项目协议 | 说明 |
> | :--- | :--- | :--- | :--- |
> | [`antigravity-better-sidebar`](./plugins/antigravity-better-sidebar) | [omdsh-dev/DSH-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) | MIT | 模仿其开放式侧边栏底座、第三方页签注册、文件浏览编辑/终端/Git 集成理念 |
> | [`antigravity-balance-widget`](./plugins/antigravity-balance-widget) | [MeteorNOX/DeepSeek-Balance-Whale-Widget](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget) | MIT | 模仿其 QQ 弹弹小鲸鱼、拖拽吸附、左吸附镜像翻转、数字滚动动画与余额监控交互 |
> | [`antigravity-gemini-pet`](./plugins/antigravity-gemini-pet) | [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet) | Open Source | 模仿其互动桌宠物理（拖拽惯性/投掷弹跳/漫步/投喂/DIY皮肤），角色为原创 Q 版 Gemini 娘 |
> | *(未改写，见说明)* | [elysia395/dsh-wallpaper-engine](https://github.com/elysia395/dsh-wallpaper-engine) | MIT | 详见下方[可行性说明](#为什么未改写-dsh-wallpaper-engine) |

---

## 核心特性与实测结论

- **严格 0 额外 Token 消耗**：3 个插件均仅包含 `plugin.json` 与 `sidecars/`，**不向模型注入任何 Skill、Rule 或 MCP 工具定义**，后端也不调用任何 LLM 推理接口。
- **零侵入 & 原生主题同步**：全部基于 Antigravity 2.0 官方 Sidecar（`sidecar_sdk` + `SIDECAR_UI_ENTRYPOINT_AUX_PANE`）构建，通过 `/preload.js` 自动适配亮色/暗色主题，不修改 Antigravity 客户端二进制文件。
- **零外部 npm 依赖**：后端全部基于 Node.js 内置标准库（`node:http`, `node:fs`, `node:child_process`），Windows / macOS / Linux 三平台通用，无需 `npm install`。
- **双模式运行**：在 Antigravity 内由宿主通过 `sidecar_sdk` 自动拉起；也可直接执行 `node main.mjs` 在独立浏览器中预览调试。

详细的可行性、兼容性、Token 消耗与潜在问题审计报告请见：[docs/FEASIBILITY_AND_AUDIT.md](./docs/FEASIBILITY_AND_AUDIT.md)。

---

## 为什么未改写 `dsh-wallpaper-engine`？

Antigravity 2.0 的官方 UI 插件（Sidecar）运行在右侧 Auxiliary Pane 沙箱内，**官方机制不允许插件篡改主对话窗口的全局背景或注入液态玻璃样式**。若强行通过外部 CDP 注入或修改 Electron 资源文件实现全局壁纸，存在以下风险：
1. 违反宿主安全边界，Antigravity 每次自动更新都会导致补丁失效；
2. 持续运行 WebGL/视频背景在 Electron 壳内可能带来显存/功耗占用问题。

因此本仓库严格遵循官方无侵入规范，仅改写并交付上述 3 个 100% 兼容原生 Sidecar 架构的插件。

---

## 快速安装

### Windows (PowerShell)
```powershell
.\install.ps1
```

### macOS / Linux
```bash
chmod +x ./install.sh && ./install.sh
```

脚本会将 `plugins/` 下的 3 个插件安装到 `~/.gemini/config/plugins/`。安装完成后，在 Antigravity 的 **Customizations / Plugins** 页面即可看到并一键启用，随后在右侧 Auxiliary Pane 中打开使用。

## 自动化验证

运行内置的端到端测试脚本（检查配置合法性、启动 3 个 Sidecar、验证所有核心 API 与静态资源）：

```bash
node tests/verify_all.mjs
```

## License

MIT License — 详见 [LICENSE](./LICENSE)。
