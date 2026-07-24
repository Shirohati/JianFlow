# 笺流 (JianFlow) — v0.1 开发指导

> **触发词**：`@start` — 开始会话 | `@end` — 记录本轮变更 | `@sync` — 合并提交 Git
> 本文件用于 `feat/v0.1` 分支的日常开发。全局分支概览请参见 `main` 分支的 `DEVELOPMENT.md`。

---

## 触发词用法

| 你说 | AI 行为 | 说明 |
|------|---------|------|
| `@start` | 读取本文件，汇报：①未同步记录 ②活跃状态 ③当前待办 | **只读不写** |
| `@end` | 在下方「待同步区」**追加一条**当前对话的工作记录 | **不碰 git**，多轮各自追加 |
| `@sync` | ①读取所有待同步记录→合并写入会话日志 ②更新活跃状态 ③清空待同步区 ④git add/commit/push | **只提交程序源码** |

---

## 待同步区（`@end` 追加至此，`@sync` 清空）

| 日期 | 对话摘要 | 涉及文件 |
|------|----------|----------|
| *待同步* | *暂无* | |

---

## 版本信息

| 项目 | 内容 |
|------|------|
| 名称 | 笺流 / JianFlow |
| 版本 | v0.1.1 |
| 分支 | `feat/v0.1`（活跃工作分支） |
| 目录 | `todo-desktop_v0.1/` |
| 框架 | Tauri v2 + Rust + Vanilla TS + Vite |
| 数据 | JSON 单文件 (`%APPDATA%/todo-data.json`) |
| 仓库 | https://github.com/Shirohati/JianFlow |

---

## 分支架构

```
main (集线器)
├── DEVELOPMENT.md (全局版本矩阵 + 分支关系 + 集成准则)
├── GIT-WORKFLOW.md (通用 Git 规范)
│
├── feat/v0.1 (当前) → v0.1 维护升级
│   └── todo-desktop_v0.1/
│
└── test_v02 (归档) → v0.2 实验性开发（只读）
    └── todo-desktop-v0.2/
```

---

## 活跃状态

**最后同步**：2026-07-24
**当前版本**：v0.1.1
**待办工作**：即将展开

---

## Git 提交规范

格式：`<type>(<scope>): <简短描述>`

| 类型 | 含义 |
|------|------|
| feat | 新功能 |
| fix | 修复 bug |
| refactor | 代码重构 |
| style | 样式/UI 调整 |
| docs | 文档变更 |
| chore | 构建/工具/依赖变更 |
| perf | 性能优化 |

**提交范围**：只提交程序源码，不提交构建产物和 IDE 配置。详细规则见 `GIT-WORKFLOW.md`。

---

## 代码风格

| 层 | 命名风格 | 说明 |
|----|---------|------|
| Rust 后端 | snake_case | 命令、函数、变量 |
| TS 前端 | camelCase | 函数、变量 |
| CSS 变量 | `--kebab-case` | 设计系统 |
| 数据字段 | snake_case (Rust) ↔ camelCase (TS) | serde 转换 |

---

## 会话日志（`@sync` 写入）

| 日期 | 对话摘要 | 涉及文件 | 版本 |
|------|----------|----------|------|
| 2026-07-24 | 初始化 feat/v0.1 分支：归档 v0.2、重置工作基线、创建开发规范 | .gitattributes, .gitignore, DEVELOPMENT.md, GIT-WORKFLOW.md | v0.1 |

---

## 构建与运行

```bash
cd todo-desktop_v0.1
npm install
npm run tauri dev        # 开发模式
npm run tauri build      # 生产构建
```
