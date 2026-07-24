# GitHub 维护指南（全局规范）

> 适用所有分支，各分支专属细节见对应 DEVELOPMENT.md

---

## 提交规范

```
<type>(<scope>): <简短描述>
```

| type | 含义 |
|------|------|
| feat | 新功能 |
| fix | 修复 bug |
| refactor | 代码重构 |
| style | 样式/UI 调整 |
| docs | 文档变更 |
| chore | 构建/工具/依赖变更 |
| perf | 性能优化 |

---

## 提交范围

**只提交程序源码**，以下禁止提交：

- 版本交接报告（`**/交接报告.md`）
- 设计规格（`SPEC-*.md`）
- `**/docs/` 目录
- 构建产物及 IDE 配置

---

## 分支架构

```
main (集线器) ─── 全局规范
├── feat/v0.1 ─── v0.1 维护（活跃）
└── test_v02 ──── v0.2 归档（只读）
```

---

## 工作流

1. 不手动 git 操作，由 `@sync` 触发词统一处理
2. `@sync` 时执行：`git add -A && git commit -m "<type>(<scope>): <desc>" && git push`
3. 较大功能在 `feat/*` 分支完成，合并回 `main`

---

## 版本号

遵循 semver：`v<主>.<次>.<补丁>`
