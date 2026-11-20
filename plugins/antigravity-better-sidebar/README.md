# Antigravity Better Sidebar

> **来源与致谢声明（Attribution）**：本项目的设计灵感与开放式侧边栏底座理念模仿自开源项目 **[omdsh-dev/DSH-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar)**（MIT License）。本仓库代码为面向 **Google Antigravity 2.0 原生 Sidecar UI 插件规范** 从零独立重构实现，不直接复制原项目源码。

## 功能特性

- **开放式第三方扩展页签**：自动加载 `sidecars/better_sidebar/extensions/*.json`，支持注册 `markdown`、`iframe`、`html` 类型的自定义侧边栏页面。
- **内置文件浏览与在线编辑**：支持目录树浏览、文本/代码编辑与保存、Markdown 实时预览。
- **内置工作区终端**：直接在侧边栏运行命令并查看输出。
- **内置 Git 面板**：查看分支、未提交文件状态、Diff 与最近提交记录。
- **零额外 Token 消耗**：纯本地 Node.js Sidecar + Webview 面板，不包含任何会注入 LLM 上下文的 Skill 或 Rule。
