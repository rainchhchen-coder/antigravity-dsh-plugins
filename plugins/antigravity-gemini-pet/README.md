# Antigravity Gemini 娘桌面宠物 (Gemini Pet)

> **来源与致谢声明（Attribution）**：本项目的互动桌宠玩法（自由拖拽、惯性投掷弹跳、自动漫步、投喂互动、DIY 资产包）模仿自开源项目 **[PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)**。角色形象为专为 Antigravity 原创生成的 Q 版「Gemini 娘」（紫蓝渐变猫耳、异瞳、星芒发饰），代码基于 **Google Antigravity 2.0 原生 Sidecar UI 插件规范** 从零独立实现。

## 功能特性

- **原创 Gemini 娘多状态立绘**：包含元气待机、认真倾听/思考、敲代码、低电量打盹等状态。
- **实时联动 Antigravity Agent 状态**：通过只读本地 `transcript.jsonl` 尾部记录自动切换动作，**0 额外 Token 消耗**。
- **2D 物理与互动**：支持鼠标拖拽甩飞（重力 + 边界反弹）、随机漫步、摸摸头、投喂小鱼干、能量/心情条。
- **DIY 自定义皮肤**：将任意 `.png` / `.jpg` / `.gif` / `.webp` / `.webm` 放入 `sidecars/gemini_pet/assets/custom/` 即可扩展。
