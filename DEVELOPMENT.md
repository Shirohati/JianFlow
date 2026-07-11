# 笺流 (JianFlow) 开发指导

> **重要**：每次 AI 对话开始时请先阅读本文件，结束时请更新本文件末尾的「会话日志」和「活跃状态」。
> 这是保证多轮对话间无损交接的核心机制。

---

## 1. 项目快照

| 项目 | 内容 |
|------|------|
| 名称 | 笺流 / JianFlow |
| 定位 | 面向学习场景的目标驱动桌面待办管理应用 |
| 仓库 | https://github.com/Shirohati/JianFlow |
| 开发分支 | `main`（稳定），功能分支 `feat/*` |

---

## 2. 版本矩阵

| 目录 | 版本 | 框架 | 状态 | 说明 |
|------|------|------|------|------|
| `todo.html` | — | HTML | 归档 | 纯 HTML 原型验证 |
| `todo-desktop/` | v1.0.0 | Electron | 归档 | 最早桌面原型 |
| `todo-desktop_v0.1/` | v0.1.1 | Tauri v2 | 维护 | 功能稳定，进入优化期 |
| `todo-desktop-v0.2/` | v0.2 | Tauri v2 | **活跃开发** | 新增活动监测、AI、提醒 |

> **目前活跃开发目录**：`todo-desktop-v0.2/`

---

## 3. 活跃状态（每次 AI 改动后更新）

<!-- 此区域由 AI 在每次会话结束时更新 -->
**当前版本**：v0.2
**最后操作**：
- 2026-07-11：初始化 Git 仓库，创建 .gitignore，推送至 GitHub，编写 README、GIT-WORKFLOW、DEVELOPMENT 文档

**待办工作**：
- [ ] board.ts 拆分（v0.1.1 C1，v0.2 亦然）
- [ ] render() 增量更新（C2）
- [ ] JSON → SQLite 迁移（C3）
- [ ] 活动监测优化（v0.2 特有）
- [ ] AI 功能完善（v0.2 特有）

---

## 4. 技术栈总览

| 层 | v0.1.1 | v0.2 |
|----|--------|------|
| 桌面框架 | Tauri v2 | Tauri v2 |
| 前端 | Vanilla TS + Vite | Vanilla TS + Vite |
| 图标 | Lucide | Lucide |
| 后端 | Rust (edition 2021) | Rust (edition 2021) |
| 数据存储 | JSON 文件 (todo-data.json) | JSON 双文件 (todo-data.json + activity-data.json) |
| 额外能力 | — | 活动监测(Win32)、AI API、提醒引擎 |

---

## 5. 目录结构（活跃版本）

```
todo-desktop-v0.2/
├── src/                          # 前端
│   ├── index.html                # 入口 HTML
│   ├── main.ts                   # 应用入口（路由、页面初始化）
│   ├── style.css                 # 全局样式
│   ├── store.ts                  # 状态管理（发布订阅）
│   ├── router.ts                 # hash 路由
│   ├── history.ts                # 看板 undo/redo
│   ├── icons.ts                  # Lucide 图标加载
│   ├── utils.ts                  # 工具函数
│   ├── api.ts                    # 后端命令绑定 + 事件监听
│   ├── pages/
│   │   ├── home.ts               # 首页：每日待办 + 日志 + 浮窗便签
│   │   ├── board.ts              # 目标板：无限画布 + 便签 + 连接线
│   │   ├── pomodoro.ts           # 番茄钟 + 学习目标 + 倒计时
│   │   ├── report.ts             # 学习统计报表
│   │   ├── daily-report.ts       # 活动监测日报 + 评分趋势（v0.2 新增）
│   │   ├── calendar.ts           # 日历视图
│   │   └── settings.ts           # 全量设置
│   └── components/
│       ├── chat-panel.ts         # AI 对话面板（v0.2 新增）
│       ├── toast.ts              # 消息提示
│       └── modal.ts              # 通用弹窗
├── src-tauri/                    # Rust 后端
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       ├── main.rs               # 入口
│       ├── lib.rs                # Tauri Builder + 插件注册
│       ├── models.rs             # 所有数据结构定义
│       ├── database.rs           # JSON 文件 CRUD
│       ├── commands.rs           # Tauri 命令
│       ├── ai_service.rs         # AI API 调用（v0.2 新增）
│       ├── activity.rs           # 活动监测 Win32（v0.2 新增）
│       └── reminder.rs           # 后台提醒引擎（v0.2 新增）
└── docs/
    └── project-knowledge.md      # 详细技术知识库
```

---

## 6. 核心数据模型

参见 `docs/project-knowledge.md#核心数据模型` 获取完整定义。关键要点：

### 6.1 TaskItem 身份判定

| 身份 | 判定条件 |
|------|---------|
| 待办（Home 页） | `grid_x IS NULL AND grid_y IS NULL` |
| 便签（Board 页） | `grid_x/grid_y NOT NULL AND sub_type != 'task'` |
| 看板子任务 | `grid_x/grid_y NOT NULL AND sub_type == 'task'` |
| Home 浮窗便签 | `grid_x/grid_y NULL AND home_x NOT NULL` |
| 待办已完成 | `status == 'done' OR status == 'completed'` |
| 重复任务模板 | `recurrence NOT NULL AND parent_id IS NULL` |

### 6.2 数据存储

- v0.1.1：单文件 `todo-data.json`（AppData 结构）
- v0.2：双文件 `todo-data.json` + `activity-data.json`
- 位置：`%APPDATA%\com.learning-todo.desktop\`
- 线程安全：`Arc<Mutex<AppData>>`
- 持久化：每次写操作全量覆写 JSON 文件（已知缺陷 C3）

---

## 7. 功能清单

### 7.1 跨版本共有

- 目标板无限画布（拖拽/缩放/分组/连接线/分区/节点模式）
- 每日待办（日期导航/三级分类/迁移/重复任务）
- 番茄钟（倒计时/暂停/自动记录/预设）
- 统计报告（饼图/折线图/日历热力图）
- 日历视图
- 设置（主题/分类/时间类型/数据导入导出/重置）

### 7.2 v0.2 新增

- 活动监测（Win32 前台窗口采样，10s 间隔）
- 活动分类规则（进程名/窗口标题/网页标题匹配）
- 生产力评分（公式 + AI 增强）
- AI 对话面板（流式 SSE / 思考链 / 16 个工具调用 / 对话记录）
- AI 长期记忆（Memories）
- 后台提醒引擎（空闲提醒 / 截止提醒）
- 活动数据 CSV/JSON 导入导出

---

## 8. 已知问题与路线图

### Critical（源于 v0.1.1，v0.2 仍存在）

| # | 问题 | 说明 |
|---|------|------|
| C1 | board.ts ~2200 行单文件 | 需拆分为 render/drag/connections/canvas/menus/state |
| C2 | render() 全量 DOM 重建 | 50+ 便签时卡顿，需增量更新 |
| C3 | JSON 全量写入 | 大数据量慢且不安全，建议迁移 SQLite |
| C4 | 无视图/数据分离 | HTML 字符串拼接在 TS 中，难以维护 |

### High

| # | 问题 | 说明 |
|---|------|------|
| H1 | 连线用 getBoundingClientRect | 触发布局重排，应从数据计算坐标 |
| H2 | boardZCounter 无限增长 | z-index 值极大，需定期重置 |
| H3 | initIcons() 全局重初始化 | 应局部更新 |
| H4 | Store 是写缓存 | 无失效策略 |
| H5 | CSP 已禁用 | 安全风险 |

### 性能优化路线图

1. **紧急**：board.ts 拆分 → render() 增量更新 → 连线坐标优化
2. **数据层**：JSON → SQLite → 原子写入 → Store 失效策略
3. **架构**：共享工具函数 → API 错误处理 → 路由生命周期 → CSP
4. **体验**：键盘快捷键 → 毛玻璃背景 → Z-index 规范

---

## 9. 构建与运行

```bash
# 活跃版本（v0.2）
cd todo-desktop-v0.2
npm install
npm run tauri dev        # 开发模式
npm run tauri build      # 生产构建

# v0.1.1 维护版本
cd todo-desktop_v0.1
npm install
npm run tauri dev
```

### 环境要求
- Rust 1.70+
- Node.js 18+
- Windows（活动监测仅支持 Windows）

### 数据文件
```
%APPDATA%\com.learning-todo.desktop\   # v0.1.1 & v0.2
  ├── todo-data.json                    # 主数据
  └── activity-data.json               # v0.2 活动监测数据（仅 v0.2）
```

---

## 10. Git 工作流

详见 `GIT-WORKFLOW.md`。要点：

- 提交格式：`<type>(<scope>): <描述>`
- 主分支 `main` 保持稳定
- 较大功能创建 `feat/*` 分支
- 版本 tag：`git tag v0.x.x && git push origin v0.x.x`

---

## 11. 开发约定

### 代码风格
- 前端：Vanilla TS，无框架，发布订阅 Store
- 后端：Rust，`Mutex<AppData>` 线程安全，JSON 存储
- CSS：CSS Variables 设计系统，5 个样式文件

### 命名
- Rust 后端命令：snake_case
- TS 前端函数：camelCase
- CSS 变量：`--kebab-case`
- 数据字段：snake_case（Rust）←→ camelCase（TS 通过 serde 转换）

---

## 12. AI 工作规范

### 每次会话开始
1. 读取本文件（DEVELOPMENT.md）
2. 读取 `docs/project-knowledge.md`（详细技术参考）
3. 检查会话日志末尾，确定上一轮进展
4. 明确当前活跃版本目录

### 每次会话结束
1. 更新本文件「活跃状态」区域（操作记录、待办变更）
2. 在「会话日志」追加一行记录
3. 如有数据结构变更，同步更新 `docs/project-knowledge.md`
4. 提交并推送 Git

### 安全准则
- 禁止提交 secrets（API Key 等）
- 禁止提交 `node_modules/`、`target/`、`dist/`
- JSON 数据文件在 `%APPDATA%`，不在仓库内

---

## 13. 会话日志

<!-- 每次 AI 会话结束时在此追加一条记录 -->

| 日期 | 操作者 | 工作内容摘要 | 涉及文件 | 版本 |
|------|--------|-------------|----------|------|
| 2026-07-11 | AI | 初始化 Git，创建 .gitignore，推送至 GitHub，编写 README、GIT-WORKFLOW、DEVELOPMENT | .gitignore, README.md, GIT-WORKFLOW.md, DEVELOPMENT.md | v0.2 |

---

## 14. 参考文档

| 文件 | 用途 |
|------|------|
| `SPEC-v0.1.1.md` | 产品设计规格（v0.1.1 定稿） |
| `docs/project-knowledge.md` | 详细技术知识库（含完整数据模型定义） |
| `GIT-WORKFLOW.md` | GitHub 提交规范与操作指南 |
| `交接报告.md`（各版本目录下） | 版本交接记录 |
