# Antigravity Balance Whale Widget

> **来源与致谢声明（Attribution）**：本项目的互动挂件理念（QQ 弹弹动画、拖拽贴边吸附、左吸附镜像翻转、数字滚动动画）模仿自开源项目 **[MeteorNOX/DeepSeek-Balance-Whale-Widget](https://github.com/MeteorNOX/DeepSeek-Balance-Whale-Widget)**（MIT License）。本仓库代码为面向 **Google Antigravity 2.0 原生 Sidecar UI 插件规范** 从零独立重构实现。

## 功能特性

- **QQ 弹弹物理交互**：点击、拖拽、吸附触发果冻弹性形变与随机俏皮台词。
- **拖拽贴边吸附 + 左吸附镜像翻转**：拖动到面板左侧松手自动贴边并水平镜像翻转。
- **平滑数字滚动动画**：余额更新时流畅滚动到最新数值，低于阈值自动变红提醒。
- **安全本地代理 & 零 Token 消耗**：API Key 仅以 `0600` 权限保存在 `~/.gemini/config/plugin-data/`，仅请求只读账单接口，**0 LLM Token 消耗**。
