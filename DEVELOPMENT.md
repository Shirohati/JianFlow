# JianFlow 全局开发文档

> `main` 分支集线器 · 版本矩阵 · 分支架构 · 集成准则

---

## 版本矩阵

| 目录 | 版本 | 框架 | 状态 | 分支 |
|------|------|------|------|------|
| `todo-desktop_v0.1/` | v0.1.1 | Tauri v2 + Rust + Vanilla TS | **维护中** | `feat/v0.1` |
| `todo-desktop-v0.2/` | v0.2 (dev) | Tauri v2 + Rust + Vanilla TS | 已归档 | `test_v02` |
| `todo-desktop/` | — | Electron + Vanilla JS | 归档 | `main` |
| `todo.html` | — | 纯 HTML 原型 | 归档 | `main` |

---

## 分支架构

```
main (集线器) ─── 全局规范 (DEVELOPMENT.md + GIT-WORKFLOW.md)
├── feat/v0.1 ─── v0.1 维护升级（活跃工作分支）
└── test_v02 ──── v0.2 实验性开发（只读归档）
```

### 分支职责

| 分支 | 职责 |
|------|------|
| `main` | 稳定基线，包含全局版本文档、Git 规范、归档代码 |
| `feat/v0.1` | v0.1 迭代开发（基于 `test_v02` 裁剪 v0.2 目录后创建） |
| `test_v02` | v0.2 完整代码快照（原 `feat/original`），只读不修改 |

---

## 集成准则

1. `feat/v0.1` 完成子版本迭代后通过 PR 合并至 `main`
2. `test_v02` 保持只读，不接收任何修改
3. 全局规范文件（DEVELOPMENT.md、GIT-WORKFLOW.md）直接提交至 `main`
4. 版本交接报告（`**/交接报告.md`）及设计规格（`SPEC-*.md`）仅保留本地

---

## 触发词（AI 开发辅助）

| 触发词 | 行为 |
|--------|------|
| `@start` | 读取当前分支的 DEVELOPMENT.md，汇报未同步记录、活跃状态、待办 |
| `@end` | 在 DEVELOPMENT.md 待同步区追加本轮工作记录（不碰 git） |
| `@sync` | 合并待同步记录至会话日志 → 更新活跃状态 → git add/commit/push |
