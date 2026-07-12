# 笺流项目协定

每次会话开始时，请先读取 `DEVELOPMENT.md` 了解当前活跃状态、待办工作和待同步记录。

## 触发词

| 触发词 | 行为 |
|--------|------|
| `@start` | 读取 DEVELOPMENT.md，汇报未同步记录、活跃状态、当前待办 |
| `@end` | 在 DEVELOPMENT.md 的「待同步区」追加本轮工作记录，不碰 git |
| `@sync` | 合并所有待同步记录 → 写入会话日志 → 更新活跃状态 → 清空待同步区 → git push |

## 活跃版本

`todo-desktop-v0.2/` — Tauri v2 + Rust + Vanilla TS

## Git 提交范围

只提交程序源码，不提交开发文档（DEVELOPMENT.md、交接报告等）。

## 关键文件

- `DEVELOPMENT.md` — 总体开发指导（包含待同步区、会话日志、活跃状态）
- `todo-desktop-v0.2/docs/project-knowledge.md` — 详细技术知识库（数据模型定义）
