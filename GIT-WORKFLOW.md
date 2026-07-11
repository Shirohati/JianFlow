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

## 提交前检查

1. 更新 `.gitignore` 确保不提交构建产物
2. 检查 `git status` 确认只包含预期变更
3. 用简短描述概括变更，需要时补充详细说明

## 操作步骤

```powershell
# 查看状态
git status

# 查看具体变更
git diff

# 暂存
git add <文件路径>
# 或全部暂存（确认无误后）
git add -A

# 提交
git commit -m "feat(board): 添加便签层级折叠功能"

# 推送到 GitHub
git push
```

## 分支策略

- `main` 分支保持稳定可运行
- 较大功能可创建 `feat/<功能名>` 分支开发，完成后合并到 main

## 版本号

遵循 semver：`v<主版本>.<次版本>.<补丁>`

- 主版本：不兼容的 API 变更
- 次版本：向下兼容的新功能
- 补丁：向下兼容的 bug 修复

版本标签示例：`git tag v0.2.0 && git push origin v0.2.0`
