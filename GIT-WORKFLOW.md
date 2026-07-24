# GitHub 维护指南（for opencode）

## 提交规范

提交信息采用以下格式：

```
<type>(<scope>): <简短描述>

<详细说明（可选）>
```

### type 类型

| 类型 | 含义 |
|------|------|
| feat | 新功能 |
| fix | 修复 bug |
| refactor | 代码重构 |
| style | 样式/UI 调整 |
| docs | 文档变更 |
| chore | 构建/工具/依赖变更 |
| perf | 性能优化 |

### scope 范围

| 范围 | 含义 |
|------|------|
| board | 目标板/画布 |
| home | 每日待办 |
| pomodoro | 番茄钟 |
| report | 统计报告 |
| calendar | 日历 |
| settings | 设置 |
| timer | 计时 |
| backend | Rust 后端 |
| db | 数据层 |
| ui | 通用 UI |
| deps | 依赖 |

## 提交范围

**只提交程序源码**，以下内容禁止提交：

| 类别 | 示例 |
|------|------|
| 版本交接/设计规格 | **/交接报告.md, **/docs/, SPEC-*.md |
| 构建产物 | node_modules/, target/, dist/, *.exe |
| IDE 配置 | .vscode/, .idea/, .trae/ |
| 环境/密钥 | .env, *.local |

> 版本交接报告及设计规格文档**只保留本地**，方便 AI 对话间无损交接，不提交到 GitHub。

## 触发方式

不手动执行 git 操作，由 AI 响应 `@sync` 触发词统一处理。

## 提交前检查

1. 确认 `.gitignore` 已排除非程序文件
2. 运行 `git status` 检查将要提交的文件，确保只包含程序源码变更
3. 用简短描述概括变更，需要时补充详细说明

## 操作步骤（`@sync` 时 AI 执行）

```powershell
git add -A
git commit -m "feat(board): 添加便签层级折叠功能"
git push
```

## 分支策略

```
main (集线器) ─── 全局开发文档 + 版本矩阵
├── feat/v0.1 ─── v0.1 维护升级（活跃）
└── test_v02 ──── v0.2 实验归档（只读）
```

- `main` 分支保持稳定，包含全局版本文档和 GIT-WORKFLOW.md
- 活跃开发在 `feat/v0.1` 进行，完成后合并回 `main`

## 版本号

遵循 semver：`v<主版本>.<次版本>.<补丁>`

- 主版本：不兼容的 API 变更
- 次版本：向下兼容的新功能
- 补丁：向下兼容的 bug 修复

版本标签示例：`git tag v0.2.0 && git push origin v0.2.0`
