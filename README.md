# 笺流 (JianFlow)

一款面向学习场景的桌面待办管理应用。核心理念是**目标驱动日常**——通过便签板管理宏观目标，目标子任务自然下沉到每日待办，形成「规划 → 执行 → 反馈」的闭环。

## 功能

- **目标板** — 画布式便签管理，自由拖拽排版，支持 note/plan 双类型
- **每日待办** — 从便签激活待办到具体日期，支持贴附便签快捷参考
- **番茄钟** — 可自定义时长的专注计时器
- **计时统计** — 按类型记录学习时间，自动计算连续天数
- **日历** — 日历视图查看日程与待办分布
- **统计分析** — 日/周/月/年学习报告，类型分布
- **分类染色** — 自定义分类与颜色，拖拽即可分类
- **状态管理** — 活跃/收纳/归档/回收四种状态，拖拽切换
- **多层嵌套** — 子便签支持多层嵌套，类型自动继承
- **重复任务** — 每日/每周/每月重复
- **便签关联** — 便签之间的连接线关联
- **倒计时** — 重要日期倒计时
- **数据导入导出** — JSON 格式备份与恢复
- **系统托盘** — 后台运行，快捷键唤醒
- **自动启动** — 开机自启选项
- **主题切换** — 暖色/冷色/深色主题

## 项目结构

```
笺流/
├── todo-desktop/          # Electron 原型版
│   ├── main.js
│   ├── preload.js
│   ├── renderer/          # 前端页面
│   └── src/               # 数据层
│
├── todo-desktop_v0.1/     # Tauri v2 版 (v0.1.1)
│   ├── src/               # 前端 (TypeScript + Vite)
│   │   ├── js/
│   │   │   ├── pages/     # 各页面逻辑
│   │   │   ├── components/ # UI 组件
│   │   │   ├── api.ts     # Tauri 命令调用
│   │   │   ├── router.ts  # 前端路由
│   │   │   ├── store.ts   # 状态管理
│   │   │   └── history.ts # 撤销/重做
│   │   ├── styles/        # CSS 设计系统
│   │   └── main.ts
│   └── src-tauri/         # Rust 后端
│       └── src/
│           ├── main.rs
│           ├── lib.rs     # 应用入口、托盘、插件
│           ├── database.rs # JSON 文件数据存储
│           ├── models.rs  # 数据模型
│           └── commands.rs # Tauri 命令
│
├── todo-desktop-v0.2/     # Tauri v2 版 (v0.2，迭代中)
│   ├── src/               # 前端
│   └── src-tauri/         # 后端 (含 AI 服务、提醒)
│
├── todo.html              # HTML 原型
├── SPEC-v0.1.1.md         # 设计规格文档
└── 图标.jpg               # 应用图标
```

## 技术栈

| 层 | 技术 |
|----|------|
| 桌面框架 | Tauri v2 |
| 前端 | TypeScript, Vite, Lucide Icons |
| 后端 | Rust |
| 数据存储 | JSON 文件 (todo-data.json) |
| 插件 | 通知、自动启动、全局快捷键、对话框、文件系统 |

## 开发

```bash
# todo-desktop_v0.1 (v0.1.1)
cd todo-desktop_v0.1
npm install
npm run tauri dev

# todo-desktop-v0.2 (v0.2)
cd todo-desktop-v0.2
npm install
npm run tauri dev
```

## 构建

```bash
npm run tauri build
```

构建产物在 `src-tauri/target/release/bundle/` 下。

## 许可

MIT
