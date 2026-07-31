<div align="center">
  <img src="图标.jpg" alt="笺流" width="120" style="border-radius: 20px" />
  <h1>笺流 · JianFlow</h1>
  <p>
    <strong>规划 → 执行 → 反馈</strong>
    <br />
    一款面向个人学习与工作的桌面待办管理应用
  </p>
  <p>
    <img src="https://img.shields.io/badge/Tauri-v2-ffc131?logo=tauri" alt="Tauri v2" />
    <img src="https://img.shields.io/badge/Rust-1.85+-dealing" alt="Rust" />
    <img src="https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript" alt="TypeScript" />
    <img src="https://img.shields.io/badge/Vite-6-646CFF?logo=vite" alt="Vite" />
    <img src="https://img.shields.io/badge/license-MIT-green" alt="License" />
  </p>
</div>

---

用**便签板**管理宏观目标，子任务自然下沉到每日待办，配合**番茄钟**专注计时与**统计反馈**形成完整闭环。每一天打开应用，看到的是今天的待办项，而非杂乱的全部计划。专注当下，逐项完成。

---

## ✨ 功能一览

### 📋 自由便签板
画布式便签管理，随意拖拽排版。支持 **Note**（笔记）和 **Plan**（计划）双类型，计划内可无限嵌套子任务，类型自动继承。
- 拖拽便签到 Dock 快速切状态：**活跃** → **收纳** → **归档** → **回收**
- 便签之间用 **连接线** 建立关联，构建知识网络
- 子任务支持拖出成为独立便签，布局自由灵活
- 软木板 / 网格 / 毛玻璃三种背景风格

### 📅 每日待办
便签的子任务一键「激活到今日」，自动出现在每日待办面板。当日任务完成后勾选即消失，未完成的自动滚入下一天。
- 左侧贴附关联便签，执行时参考上下文
- 支持待办拖拽排序、分类筛选

### 🍅 番茄钟
倒计时 / 正向计时双模式，预设快捷启动，完成时自动记录学习时长。

**反馈系统让每一次完成都有仪式感：**
- 🎆 倒计时完成 → 上行琶音 + **全屏撒花**
- 📏 正向计时每 25 分钟 → 短促音效 + **半屏粒子**
- 🎯 达成每日目标 → 金色辉光 + **加倍撒花**
- ✅ 勾选待办 → pop 弹音 + **从 checkbox 爆裂出微型粒子**
- 所有反馈均可独立开关，里程碑间隔可自定义

### 📊 统计分析
- 日 / 周 / 月 / 年多维报告
- 学习类型分布（学习、编程、英语、阅读…）
- 自动计算连续专注天数
- 每日 / 每周目标进度追踪

### 🎨 完整生态
| 功能 | 说明 |
|------|------|
| **分类染色** | 全自定义分类与颜色，便签区分配色高亮 |
| **四态管理** | 活跃 / 收纳 / 归档 / 回收，拖拽一键切换 |
| **重复任务** | 每日 / 每周 / 每月自动生成 |
| **倒计时** | 重要日期倒计时显示 |
| **全屏编辑器** | 笔记全屏编辑，支持 Markdown 预览、Tab 缩进、工具栏 |
| **数据导入导出** | JSON 格式全量备份与恢复 |
| **多主题** | 暖色 / 冷色 / 简约 / 深色 |
| **系统托盘** | 后台运行，全局快捷键唤醒，开机自启 |

---

## 🖼️ 截图

<details>
<summary>点击展开截图</summary>

<br />

> *（欢迎贡献截图！可提交 PR 添加你的工作区截图。）*

</details>

---

## 🚀 快速开始

### 下载安装

从 [Releases](https://github.com/Shirohati/JianFlow/releases) 下载最新安装包（`笺流_x.x.x_x64-setup.exe`），运行即装。

### 从源码构建

```bash
cd todo-desktop_v0.1
npm install
npm run tauri dev        # 开发模式（热更新）
npm run tauri build      # 生产构建
```

构建产物在 `src-tauri/target/release/bundle/` 下。

**系统要求：**
- Windows 10+
- [Rust 工具链](https://rustup.rs)
- Node.js 18+

---

## 🧱 技术栈

```
┌─ Tauri v2 ──────────────────────┐
│  ┌─ Frontend (TypeScript + Vite) │
│  │  pages/     → 各页面逻辑      │
│  │  components/ → 可复用组件      │
│  │  styles/    → CSS 设计系统     │
│  │  store.ts   → 响应式状态管理   │
│  │  router.ts  → 前端路由        │
│  └────────────────────────────── │
│  ┌─ Backend (Rust) ───────────── │
│  │  commands.rs → Tauri 命令    │
│  │  database.rs → JSON 持久化   │
│  │  models.rs   → 数据模型       │
│  └────────────────────────────── │
│  数据存储: %APPDATA%/todo-data.json│
└──────────────────────────────────┘
```

**核心依赖：**
- [Tauri v2](https://v2.tauri.app) — 桌面框架
- [Vite 6](https://vitejs.dev) — 构建工具
- [Lucide](https://lucide.dev) — 图标库
- [serde_json](https://github.com/serde-rs/json) — JSON 序列化
- [chrono](https://github.com/chronotope/chrono) — 日期处理

---

## 🗺️ 设计哲学

笺流的名字源自「笺」（便签）和「流」（流动）：

1. **目标驱动** — 从便签板规划目标，而非从空白待办清单开始
2. **自然下沉** — 目标的子任务逐层拆解，最终落地到每日执行
3. **专注当下** — 每天只看到今天的待办，屏蔽整体焦虑
4. **正向反馈** — 完成有声音、有动画、有统计，让坚持可见

---

## 🤝 贡献

欢迎提交 Issue 和 PR！无论是功能建议、Bug 报告还是代码贡献。

## 📄 许可

MIT © Shirohati
