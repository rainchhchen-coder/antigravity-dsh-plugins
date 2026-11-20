# Gemini 娘 Windows 桌面透明悬浮宠（原生无边框版）

> **来源与致谢声明（Attribution）**：互动桌宠形态灵感源自开源项目 **[PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)**。本程序专为 **Google Antigravity 2.0** 的沙箱边界打造，使用 Windows 原生 WPF 透明置顶悬浮窗实现，**零侵入客户端、零外部依赖、严格 0 额外 Token 消耗**。

## 为什么用独立透明悬浮窗？

Google Antigravity 2.0 的官方 Sidecar 插件被隔离在右侧 Auxiliary Pane 内，不能突破面板覆盖到主聊天窗口外。通过 Windows 原生 WPF `AllowsTransparency="True"` 悬浮窗：
- **纯透明背景、无标题栏无边框**，直接趴在 Antigravity 窗口右下角（类似 DSH 截图效果）；
- **自动追踪 Antigravity 窗口坐标**（兼容高分屏 DPI 缩放），窗口移动自动跟随，窗口最小化自动隐藏；
- **严格 0 额外 Token 消耗**：只读 `~/.gemini/antigravity/brain/*/transcript.jsonl` 尾部 8KB，自动联动「待机 / 耳朵听着呢 / 敲代码 / 低电量打盹」状态。

## 一键启动

- 直接双击 **`Launch-GeminiPet.vbs`**（或 **`Launch-GeminiPet.bat`**），无黑框静默启动。
- **左键单击**：摸摸头（QQ 弹弹 + 随机台词）
- **左键拖拽**：自由拖动位置（右键菜单可随时恢复「自动吸附 Antigravity 右下角」）
- **右键点击**：切换姿势、调整大小、开关自动吸附/状态同步、退出。
