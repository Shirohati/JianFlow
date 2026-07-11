# 笺流 (JianLiu) 项目知识库

## 项目概述

笺流是一款**个人生产力 + 学习追踪**桌面应用。用户通过每日待办、自由画布便签、番茄钟、活动监测等方式管理学习与工作，借助 AI 获得分析报告、生产力评分和对话辅助。

版本：v0.2（在 v0.1 基础上增加了活动监测、AI 分析、提醒通知等能力）

---

## 技术栈

| 层 | 技术 |
|--|------|
| 桌面框架 | Tauri v2（Rust 后端 + WebView 前端） |
| 后端语言 | Rust（edition 2021） |
| 前端语言 | TypeScript（vanilla，无框架） |
| 数据存储 | JSON 文件（`todo-data.json` + `activity-data.json`） |
| 状态管理 | 自定义 Store（发布-订阅模式） |
| 路由 | 自定义 hash 路由 |
| 图标 | Lucide（通过 `data-lucide` 属性） |
| AI API | OpenAI 兼容接口（OpenAI / DeepSeek / 硅基流动等） |
| 通知 | Tauri Notification Plugin |
| 窗口监测 | Win32 API（Windows 前台窗口采样） |
| HTTP | reqwest 0.12（含 stream 支持） |

---

## 目录结构

```
todo-desktop-v0.2/
├── src/                          # 前端
│   ├── index.html                # 入口 HTML
│   ├── main.ts                   # 应用入口（路由、页面初始化）
│   ├── style.css                 # 全局样式
│   ├── store.ts                  # 状态管理
│   ├── router.ts                 # hash 路由
│   ├── history.ts                # 看板操作历史（undo/redo）
│   ├── icons.ts                  # Lucide 图标加载器
│   ├── utils.ts                  # 工具函数
│   ├── api.ts                    # 后端命令绑定 + 事件监听
│   ├── pages/
│   │   ├── home.ts               # 首页：每日待办 + 日志 + 浮窗便签
│   │   ├── board.ts              # 目标板：无限画布 + 便签 + 连接线
│   │   ├── pomodoro.ts           # 番茄钟 + 学习目标 + 倒计时
│   │   ├── report.ts             # 学习统计报表
│   │   ├── daily-report.ts       # 活动监测日报 + 评分趋势
│   │   ├── calendar.ts           # 日历视图
│   │   └── settings.ts           # 全量设置
│   └── components/
│       ├── chat-panel.ts         # AI 对话面板（流式 + 思考链）
│       ├── toast.ts              # 消息提示
│       └── modal.ts              # 通用弹窗
├── src-tauri/                    # Rust 后端
│   ├── Cargo.toml
│   ├── src/
│   │   ├── main.rs               # 入口
│   │   ├── lib.rs                # Tauri Builder 配置
│   │   ├── models.rs             # 所有数据结构定义
│   │   ├── database.rs           # JSON 文件读写 + CRUD
│   │   ├── commands.rs           # Tauri 命令
│   │   ├── ai_service.rs         # AI API 调用 + 工具 + 流式
│   │   ├── activity.rs           # 活动监测（Win32 采样 + 存储）
│   │   └── reminder.rs           # 后台提醒引擎
│   └── icons/
└── docs/
    └── project-knowledge.md      # 本文件
```

---

## 架构与数据流

```
用户操作 → TypeScript invoke() → Tauri Command(Rust) → Database(JSON文件)
                                           ↕
                                     ActivityStore(独立JSON)
                                           ↕
                                     AI Service(HTTP API)
                                           ↕
                                     Reminder Engine(后台线程)
                                           ↕
                                     Windows 通知(Tauri Notification)
```

关键设计决策：
- **v0.1 数据兼容**：v0.2 用独立目录存储新数据，v0.1 的 `todo-data.json` 可通过导入迁移
- **活动数据独立存储**：`activity-data.json` 与 `todo-data.json` 分开，避免干扰原有数据结构
- **JSON 文件即数据库**：无 SQLite，全部读写 JSON 文件，`Mutex<AppData>` 保证线程安全

---

## 核心数据模型

### TaskItem（统一模型）

**所有条目共用一张表。** 待办、便签、看板子任务都存为 `TaskItem`，靠字段区分。

```rust
pub struct TaskItem {
    pub id: String,              // UUID v4
    pub r#type: String,          // 总分类："note" 或 "todo"（历史遗留，基本废弃，统一为 "note"）
    pub sub_type: String,        // 实际子类型："note"(便签) / "task"(看板子任务) / "todo"(旧数据)
    pub title: String,           // 标题（便签标题 / 待办内容）
    pub content: String,         // 正文（冗余，实际用 note 字段）
    pub category_id: String,     // 分类 ID，默认 "cat_default"
    pub priority: i32,           // 优先级（0=最低）
    pub parent_id: Option<String>, // 父条目 ID（看板子任务指向父便签；定期重复任务指向模板）
    pub sort_order: i32,         // 排序序号
    pub status: String,          // 全局状态："active"(活跃) / "done"(已完成) / "completed"(已完成)
    pub grid_x: Option<i32>,     // 看板 X 坐标（null=不是看板条目）
    pub grid_y: Option<i32>,     // 看板 Y 坐标（null=不是看板条目）
    pub home_x: Option<i32>,     // Home 页浮窗便签 X 坐标
    pub home_y: Option<i32>,     // Home 页浮窗便签 Y 坐标
    pub todo_date: Option<String>, // 待办日期 "YYYY-MM-DD"（仅待办有意义）
    pub todo_status: Option<String>, // 每日完成状态："pending"(待办) / "completed"(已完成)
    pub recurrence: Option<String>, // 重复规则："daily" / "weekly" / "monthly"
    pub completed_at: Option<String>, // 完成时间
    pub deadline: Option<String>, // 截止日期 "YYYY-MM-DD"
    pub pin_date: Option<String>, // 钉选日期（Home 页置顶的日期）
    pub collapsed: bool,         // 看板分组是否折叠
    pub note: Option<String>,    // 便签正文 / 待办备注（markdown 格式）
    pub time_start: Option<String>, // 时间区间起点（日程相关）
    pub time_end: Option<String>,   // 时间区间终点
    pub note_width: Option<i32>, // 便签宽度（看板）
    pub note_height: Option<i32>,// 便签高度（看板）
    pub open_width: Option<i32>, // 便签展开宽度
    pub open_height: Option<i32>,// 便签展开高度
    pub group_id: Option<String>, // 群组 ID（看板分组）
    pub board_tab: Option<String>, // 便签标签页名（看板多 tab）
    pub node_mode: Option<bool>, // 看板节点模式（true=线性流，false=自由）
    pub schedule_start: Option<String>, // 日程开始
    pub schedule_end: Option<String>,   // 日程结束
    pub created_at: String,      // 创建时间
    pub updated_at: String,      // 更新时间
}
```

**关键判定规则：**

| 要判断什么 | 判定方式 |
|-----------|---------|
| 是待办（Home 页） | `grid_x IS NULL AND grid_y IS NULL` |
| 是便签（Board 页） | `grid_x IS NOT NULL AND grid_y IS NOT NULL AND sub_type != 'task'` |
| 是看板子任务 | `grid_x IS NOT NULL AND grid_y IS NOT NULL AND sub_type == 'task'` |
| 是 Home 浮窗便签 | `grid_x IS NULL AND grid_y IS NULL AND home_x IS NOT NULL` |
| 待办已完成 | `status == 'done' OR status == 'completed'` |
| 待办当日已完成 | `todo_status == 'completed'` |
| 是重复任务 | `recurrence IS NOT NULL` |
| 是子任务（看板） | `parent_id IS NOT NULL`（且是看板便签的子条目） |
| 是重复模板 | `recurrence IS NOT NULL AND parent_id IS NULL` |

### Category（分类）

```rust
pub struct Category {
    pub id: String,     // 如 "cat_default" / "cat_study" / "cat_work" / "cat_reading" / "cat_exercise"
    pub name: String,   // "其他" / "学习" / "工作" / "阅读" / "运动"
    pub color: String,  // 十六进制色值
    pub sort_order: i32,
}
```

**默认分类：**
- `cat_default`：「其他」#8e8e8e (sort_order: 99)
- `cat_study`：「学习」#5b7fff (sort_order: 1)
- `cat_work`：「工作」#e07b6e (sort_order: 2)
- `cat_reading`：「阅读」#4caf84 (sort_order: 3)
- `cat_exercise`：「运动」#e0a83c (sort_order: 4)

### TimeRecord（时长记录）

```rust
pub struct TimeRecord {
    pub id: String,
    pub date: String,            // "YYYY-MM-DD"
    pub time_type: String,       // 类型名称（"学习"/"编程"/"英语"/"数学"/"阅读" 等）
    pub start_time: Option<String>, // 开始时间 "HH:MM"
    pub end_time: Option<String>,   // 结束时间 "HH:MM"
    pub total_minutes: i32,      // 总分钟数
    pub pauses: Option<String>,  // 暂停记录 JSON 数组
    pub source: String,          // "import"(手动导入) / 其他(番茄钟自动记录)
    pub note: String,            // 备注
    pub created_at: String,
}
```

### TimeType（时长类型 — 番茄钟和手动录入的分类）

```rust
pub struct TimeType {
    pub id: String,     // "tt_study" / "tt_programming" / "tt_english" / "tt_math" / "tt_reading"
    pub name: String,   // "学习" / "编程" / "英语" / "数学" / "阅读"
    pub color: String,
    pub sort_order: i32,
}
```

### PomodoroPreset（番茄钟预设）

```rust
pub struct PomodoroPreset {
    pub id: String,
    pub time_type: String,       // 对应的 TimeType name
    pub color: String,
    pub duration_minutes: i32,   // 时长（默认 25）
    pub mode: String,            // "countdown"(倒计时) 或 "stopwatch"(正向计时)
    pub created_at: String,
}
```

番茄钟工作流程：用户选预设 → 开始计时 → 完成后自动生成 TimeRecord（source 为空字符串）。

### Goal（学习目标）

```rust
pub struct Goal {
    pub id: String,          // "goal_daily" / "goal_weekly"
    pub goal_type: String,   // "daily" / "weekly"
    pub target_minutes: i32, // 目标分钟数
    pub is_active: bool,
}
```

默认值：每日 120 分钟，每周 600 分钟。

### Countdown（倒计时事件）

```rust
pub struct Countdown {
    pub id: String,
    pub title: String,
    pub target_date: String, // "YYYY-MM-DD"
    pub color: Option<String>,
    pub created_at: String,
}
```

### Connection（便签连接线 — 有向）

```rust
pub struct Connection {
    pub from_id: String,  // 起点便签 ID
    pub to_id: String,    // 终点便签 ID
}
```

### AppSettings（应用设置）

```rust
pub struct AppSettings {
    pub theme: String,             // "warm" / "cool" / "minimal" / "dark"
    pub master_plan: String,       // 年度/季度主计划
    pub master_reflection: String, // 主复盘
    pub quotes: String,            // JSON 字符串数组
    pub quote_mode: String,        // "random" / "sequential"
    pub quote_interval: String,    // 秒数
    pub pomodoro_show_todos: bool, // 番茄钟页是否显示待办
    pub pomodoro_show_plan: bool,  // 番茄钟页是否显示计划
    pub pomodoro_show_countdown: bool, // 番茄钟页是否显示倒计时
    pub bg_home: String,           // 首页背景
    pub bg_pomodoro: String,       // 番茄钟页背景
    pub startup_minimized: bool,   // 开机自启最小化
    pub move_uncompleted: bool,    // 自动移入未完成待办
    pub board_bg_style: String,    // 看板背景样式 "cork" / "grid" / "glass"
    pub note_spacing: i32,         // 便签间距 px
}
```

### AppData（todo-data.json 根结构）

```rust
pub struct AppData {
    pub tasks: Vec<TaskItem>,
    pub categories: Vec<Category>,
    pub time_types: Vec<TimeType>,
    pub time_records: Vec<TimeRecord>,
    pub pomodoro_presets: Vec<PomodoroPreset>,
    pub goals: Vec<Goal>,
    pub countdowns: Vec<Countdown>,
    pub connections: Vec<Connection>,
    pub settings: AppSettings,
    pub daily_logs: HashMap<String, String>,   // date → markdown text
    pub daily_scores: Vec<DailyScoreRecord>,   // v0.2 新增
    pub memories: Vec<Memory>,                 // v0.2 新增
    pub conversations: Vec<Conversation>,      // v0.2 新增
    pub version: String,                       // "0.1.1"
}
```

---

## v0.2 新增数据模型

### ActivitySession（活动监测会话）

```rust
pub struct ActivitySession {
    pub id: String,
    pub date: String,           // "YYYY-MM-DD"
    pub start_time: String,     // "HH:MM:SS"
    pub end_time: String,       // "HH:MM:SS"
    pub process_name: String,   // 进程名（如 "chrome.exe"）
    pub window_title: String,   // 窗口标题
    pub web_title: Option<String>, // 浏览器标签页标题
    pub category: String,       // 分类名（"学习"/"编程"/"浏览"/"社交"/"娱乐"/"其他"）
    pub duration_seconds: i64,  // 持续秒数
    pub source: String,         // ""(实时采样) / "import"(导入)
    pub import_batch_id: Option<String>,
}
```

### ActivitySettings（活动监测 + AI 配置 — 存于 activity-data.json）

```rust
pub struct ActivitySettings {
    pub monitor_enabled: bool,         // 是否启用活动监测
    pub sample_interval_sec: u64,      // 采样间隔（默认 10 秒）
    pub idle_threshold_min: u64,       // 空闲阈值（默认 3 分钟）
    pub exclude_keywords: Vec<String>, // 排除关键词列表
    pub ai_api_enabled: bool,          // 是否启用 AI
    pub ai_api_base_url: String,       // API 地址（默认 https://api.openai.com/v1）
    pub ai_api_key: String,            // API Key
    pub ai_model: String,              // 模型名（默认 gpt-4o-mini）
    pub ai_system_prompt: String,      // 自定义系统提示词
    pub ai_strict_mode: bool,          // 严格模式（数据脱敏）
    pub show_thinking: bool,           // 是否显示 AI 思考链
    pub reminder_config: ReminderConfig,
}
```

### CategoryRule（活动分类规则）

```rust
pub struct CategoryRule {
    pub id: String,          // "dcr_xxx"(默认/只读) 或 用户自定义 ID
    pub rule_type: String,   // "process"(进程名) / "title"(窗口标题) / "web"(网页标题)
    pub mode: String,        // "contains"(包含) / "equals"(等于) / "regex"(正则)
    pub value: String,       // 匹配值
    pub category: String,    // 目标分类
    pub is_default: bool,    // 是否默认规则（只读）
}
```

默认规则内置若干（学习/编程/浏览/社交/娱乐/其他），以 `dcr_` 前缀标识，用户可添加自定义规则覆盖。

### ProductivityScore（生产力评分）

```rust
pub struct ProductivityScore {
    pub score: i32,          // 0-100 分
    pub level: String,       // "优秀" / "良好" / "中等" / "待改进"
    pub focus_score: i32,    // 专注分（公式计算，目前固定 0）
    pub pomo_score: i32,     // 番茄钟分（公式计算，目前固定 0）
    pub todo_score: i32,     // 待办分（公式计算，目前固定 0）
    pub consistency_score: i32, // 持续分（公式计算，目前固定 0）
    pub analysis: Option<String>, // AI 分析文字
}
```

评分逻辑：先由公式计算基础分（活动、番茄钟、待办完成率、连续天数），若 AI 启用则用 AI 评分覆盖 `score / level / analysis`。

### 活动数据 ActivityData（activity-data.json 根结构）

```rust
pub struct ActivityData {
    pub sessions: Vec<ActivitySession>,
    pub category_rules: Vec<CategoryRule>,    // 仅存用户规则
    pub ai_summaries: HashMap<String, AISummary>, // date → 缓存报告
    pub settings: ActivitySettings,
    pub version: String,
}
```

两个 JSON 文件各管各的，互不干扰。

### Memory（AI 长期记忆）

```rust
pub struct Memory {
    pub id: String,
    pub key: String,       // 标签
    pub content: String,   // 内容
    pub created_at: String,
}
```

### Conversation（AI 对话记录）

```rust
pub struct Conversation {
    pub id: String,                          // session_id
    pub title: String,                       // 自动生成（取首条消息前 40 字）
    pub messages: Vec<ConversationMessage>,  // 对话历史
    pub created_at: String,
    pub updated_at: String,
}
```

### ConversationMessage

```rust
pub struct ConversationMessage {
    pub role: String,  // "user" / "assistant" / "system"
    pub content: String,
}
```

---

## 页面功能详解

### Home (`/`) — 每日待办首页
- 按日期显示待办列表（`todo_date == currentDate`）
- 三级分类显示：未完成 → 已完成 → 已归档
- 每日日志（textarea，debounce 自动保存到 `daily_logs`）
- 浮窗便签（`home_x/home_y !== null` 的 task）
- 待办操作：创建、编辑、删除、完成、排序、拖拽置顶
- 日历选择日期、昨日待办迁移、生成重复任务
- 学习时长概览（今日番茄钟分钟数）
- 格言轮播

### Board (`/`) — 目标板（便签画布）
- 无限缩放/平移画布
- 自由摆放便签（grid_x/grid_y 坐标）
- 便签间连接线（Connection，有向）
- 分组（group_id）与折叠
- 标签页（board_tab）切换
- 看板子任务（sub_type='task'，挂靠在父便签下）
- 节点模式（node_mode：线性流/自由）
- 多选、拖拽、调整大小
- 撤销/重做（history.ts）

### Pomodoro (`/pomodoro`) — 番茄钟
- 倒计时 / 正向计时
- 预设选择（PomodoroPreset）
- 暂停/继续、完成时自动生成 TimeRecord
- 学习目标进度条（每日/每周）
- 倒计时事件列表（Countdown）
- 格言轮播

### Report (`/report`) — 学习统计
- 按时间段筛选（日/周/月/年/自定义）
- 每日时长柱状图
- 类型分布饼图
- 汇总统计

### Daily Report (`/daily-report`) — 活动监测报告
- 按日期查看活动监测数据
- 分类时长分布
- Top 应用排行
- 浏览器标签页排行
- AI 生成每日报告（可缓存）
- 生产力评分趋势图
- 评分历史表格

### Calendar (`/calendar`) — 日历视图
- 月历显示有学习记录的日子（点标记）
- 点击日期查看当日学习时长

### Settings (`/settings`) — 设置
- 外观设置（主题、看板背景、便签间距）
- 行为设置（开机自启、自动迁移未完成）
- 分类管理（CRUD）
- 时间类型管理（CRUD）
- 番茄钟预设管理（CRUD）
- 学习目标设置
- 格言管理
- 倒计时管理
- 时长导入（累加/逐条）
- 数据管理（导出/导入/重置/迁移 v0.1）
- 活动监测设置（开关、采样间隔、排除关键词、分类规则）
- AI 配置（API URL、Key、模型、提示词、严格模式、显示思考链）
- 提醒设置（空闲提醒、截止提醒）
- 活动数据管理（CSV/JSON 导入导出、清除、导入历史）

---

## AI 功能系统

### AI 对话（chat-panel.ts + ai_service.rs）
- 浮窗聊天面板，支持页面场景切换（晨间规划/周报生成/分析建议/自由问答）
- **流式输出**：SSE 逐 token 推送，实时渲染到消息气泡
- **思考链**：`reasoning_content` 通过事件推送，前端可折叠显示
- **工具调用**：AI 可在回复中嵌入 `【TOOL】{"tool":"xxx","args":{}}【/TOOL】`，后端解析执行后跟一轮收尾
- **对话记录**：每次对话自动保存到 Conversations，可在面板切换
- **页面数据注入**：发送消息时自动收集当前页面的待办、评分等信息作为上下文

### 支持的工具（16 个）

| 工具 | 用途 | 关键参数 |
|------|------|---------|
| `task_list` | 按条件列出待办 | status, todo_date, category_id, keyword |
| `task_get` | 查看待办详情 | id |
| `task_create` | 创建待办 | title, category_id, priority, deadline, note, todo_date |
| `task_update` | 修改待办 | id + 任意可改字段 |
| `task_complete` | 完成待办 | id |
| `task_delete` | 删除待办 | id |
| `goal_set` | 设置目标 | goal_type, target_minutes |
| `note_create` | 创建看板便签 | title, note, board_tab, grid_x, grid_y |
| `note_update` | 修改便签 | id + 任意可改字段 |
| `note_delete` | 删除便签 | id |
| `connection_create` | 创建连接线 | from_id, to_id |
| `connection_delete` | 删除连接线 | from_id, to_id |
| `memory_search` | 搜索长期记忆 | keyword |
| `memory_save` | 保存长期记忆 | key, content |
| `memory_list` | 列出所有记忆 | 无 |
| `memory_delete` | 删除记忆 | id |

### 提醒引擎（reminder.rs）
- 后台线程，60 秒循环检查
- **空闲提醒**：检测 Windows 空闲时间，超过阈值则发通知
- **截止提醒**：检查所有 `deadline <= today` 的待办，每天每条只提醒一次
- 状态由 `activity_update_settings` 命令控制（通过 `reminder_config` 下发）

---

## 关键业务规则

### 待办完成流转
1. 用户勾选 → `todo_status = "completed"` + `status = "done"` + `completed_at = now`
2. 若为重复任务 → `generate_recurring_tasks` 在日期切换时生成子任务
3. 若开启 "自动移入未完成" → 昨日未完成自动移到今日

### 导入规则
- 导入 v0.1 数据：按 ID 去重，不覆盖已存在条目
- 导入老版本 JSON：同上去重，支持 todos/categories/timeRecords/timeTypes/presets/goals/countdowns/settings/dailyLogs 全部字段
- 重复任务生成：只对比 origin_date → target_date 的天数差，按规则（daily/weekly/monthly）生成子任务（`parent_id` 指向模板），已存在的跳过

---

## 开发指南

### 环境要求
- Rust 1.70+
- Node.js 18+
- Windows（目前只支持 Windows 活动监测）

### 常用命令
```bash
# 启动开发服务器
npm run tauri dev

# 构建
npm run tauri build

# TypeScript 检查
npx tsc --noEmit

# Rust 检查
cd src-tauri && cargo check

# Rust 编译（完整）
cd src-tauri && cargo build
```

### 数据文件位置
- todo-data.json: `%APPDATA%\com.learning-todo.desktop\todo-data.json`（Windows）
- activity-data.json: 同上目录（v0.2）

两个文件完全独立，各自有完整的数据结构。

### v0.1 → v0.2 迁移
- v0.1 使用单文件 `todo-data.json`（AppData 结构）
- v0.2 在其基础上增加字段（`daily_scores`/`memories`/`conversations` via `#[serde(default)]`），保持向前兼容
- v0.2 新增 `activity-data.json` 独立存储活动监测数据
- 可通过设置页「从 v0.1 迁移」或「自动检测 v0.1 数据」导入旧数据
