# 笺流 全面进化路线图

> 基于开源社区最佳实践的笺流 v0.2 → v2.0 开发计划
> 调研项目：OpenHuman(34K⭐) · Super Productivity(20K⭐) · LobsterAI(5.5K⭐) · FreeTodo(2.3K⭐) · OpenSquilla(5.7K⭐) · OpenAkita · LeAgent · Thoth · OpenFlux · Kairox · Babo · OpenAgentd · Noema · Koda · Taskosaur

---

## 总览

| 阶段 | 名称 | 周期 | 突破性 |
|------|------|------|--------|
| P0 | 地基修复 | 已完成 | 🔧 修 bug |
| P1 | **MCP 协议集成** | 2 周 | 🚀 接入社区工具生态 |
| P2 | **多 Agent 架构** | 3 周 | 🚀 从 1 个 AI → AI 团队 |
| P3 | **记忆系统升级** | 3 周 | 🧠 从 key-value → 知识图谱 |
| P4 | **可视化工作流** | 4 周 | 🎨 拖拽构建学习路线图 |
| P5 | **Token 效率引擎** | 2 周 | 💰 API 费用降 60-80% |
| P6 | **定时自主 Agent** | 2 周 | 🤖 24/7 自主工作 |
| P7 | **插件 / Skill 市场** | 3 周 | 🧩 社区生态 |
| P8 | **工具执行透明度** | 1 周 | 👁️ 所见即所得 |
| P9 | **语音 & 多端** | 4 周 | 🎙️ 跨平台 |

---

## P0 — 地基修复（已完成 ✅）

| 子项 | 状态 | 参考来源 |
|------|------|----------|
| 对话历史重复累积修复 | ✅ | 自研 |
| SSE 跨块拼接 + 去重 | ✅ | 自研 |
| max_tokens 提升 (2K→8K/16K) | ✅ | 自研 |
| 提示词压缩 70% (11K→2.6K chars) | ✅ | OpenSquilla 思路 |
| parse_tool_calls 残缺标签容错 | ✅ | 自研 |
| strip_tool_calls 前后端双重容错 | ✅ | 自研 |

---

## P1 — MCP 协议集成（2 周）🚀

**目标**：通过 MCP（Model Context Protocol）接入社区数千工具生态

灵感来源：LobsterAI, Kairox, LeAgent, OpenFlux, Babo

### 子任务

| # | 任务 | 预估 | 参考实现 |
|---|------|------|----------|
| 1.1 | 引入 MCP TypeScript SDK | 2d | github.com/modelcontextprotocol/typescript-sdk |
| 1.2 | 实现 MCP 客户端核心（stdio/SSE transport） | 3d | Kairox 的 agent-mcp crate |
| 1.3 | 内置 MCP 服务器：文件系统、Shell、浏览器 | 2d | 参考 LobsterAI 内置工具集 |
| 1.4 | 在 AI 工具列表中加入 `mcp_call` 工具 | 1d | 笺流已有的 tool_system_prompt 扩展 |
| 1.5 | MCP 服务器配置管理 UI（设置页） | 2d | OpenFlux 的 YAML 配置方式 |
| 1.6 | 安全沙箱（敏感工具需确认） | 2d | OpenAkita 的 POLICIES.yaml 机制 |
| 1.7 | MCP 市场浏览（社区服务器列表） | 2d | LeAgent 的 MCP marketplace |

**验收标准**：
- `帮我搜索 MCP 服务器列表` → AI 能发现并安装社区 MCP 工具
- `帮我用浏览器打开百度` → AI 通过 MCP browser 工具执行
- `读取桌面上的 readme.md` → AI 通过 MCP filesystem 工具执行

---

## P2 — 多 Agent 架构（3 周）🚀

**目标**：从 1 个 AI 单打独斗 → AI 团队协作

灵感来源：OpenAkita, OpenHuman, Babo, OpenAgentd, VYN

### 架构设计

```
用户输入
    │
    ▼
┌──────────────────────────────────┐
│   主管 Agent (Orchestrator)       │
│   - 理解意图，拆解任务              │
│   - 分派给专业 Agent               │
│   - 汇总结果，生成回复              │
└──────────────┬───────────────────┘
               │ 任务分派
    ┌──────────┼──────────┬──────────┐
    ▼          ▼          ▼          ▼
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│ 规划   │ │ 分析   │ │ 执行   │ │ 记忆   │
│ Agent  │ │ Agent  │ │ Agent  │ │ Agent  │
│日程安排 │ │数据解读 │ │工具操作 │ │知识管理│
└────────┘ └────────┘ └────────┘ └────────┘
```

### 子任务

| # | 任务 | 预估 | 参考实现 |
|---|------|------|----------|
| 2.1 | Agent 定义与路由系统设计 | 2d | OpenAkita 的 AgentOrchestrator |
| 2.2 | 主管 Agent 实现（意图识别 + 任务拆解） | 3d | Babo 的 agentic loop |
| 2.3 | 规划 Agent：日程规划 + 习惯分析 | 2d | 复用已有 daily_plan/smart_suggest |
| 2.4 | 分析 Agent：学习数据 + 生产力分析 | 2d | 复用已有 weekly_review |
| 2.5 | 执行 Agent：工具调用（复用现有） | 1d | 现成的 task_create/note_create 等 |
| 2.6 | 记忆 Agent：知识管理（P3 后升级） | 2d | 现有 memory_save/search |
| 2.7 | Agent 间通信协议（mailbox pattern） | 2d | OpenAgentd 的 team_message |
| 2.8 | 容错与降级（Agent 失败自动切换） | 2d | OpenAkita 的 FallbackResolver |
| 2.9 | Agent 状态可视化 UI | 2d | OpenAkita 的 Agent Dashboard |

**验收标准**：
- `帮我规划今天的学习` → 规划 Agent + 执行 Agent 协作完成
- `分析这周的学习数据并给出建议` → 分析 Agent + 规划 Agent 协作
- 某个 Agent 失败 → 主管自动切换备用方案

---

## P3 — 记忆系统升级（3 周）🧠

**目标**：从扁平的 key-value → 因果关系知识图谱

灵感来源：OpenHuman, Thoth, Babo, VYN

### 当前 vs 目标

| 维度 | 当前 | 目标 |
|------|------|------|
| 存储 | key-value (SQLite) | 向量数据库 + 知识图谱 |
| 检索 | 关键词匹配 | 语义搜索 + 图遍历 |
| 关系 | 无 | 实体 → 关系 → 实体 |
| 遗忘 | 不遗忘 | 指数衰减 + 自动压缩 |
| 学习 | 用户手动保存 | 自动从对话中提取 |

### 子任务

| # | 任务 | 预估 | 参考实现 |
|---|------|------|----------|
| 3.1 | 引入向量数据库（sqlite-vec / ChromaDB） | 1d | Thoth 使用 ChromaDB |
| 3.2 | 实现嵌入生成管线（本地 ONNX 或 API） | 2d | OpenSquilla 本地 ONNX 嵌入 |
| 3.3 | 知识图谱数据模型设计 | 2d | OpenHuman 的 Memory Tree |
| 3.4 | 自动记忆提取（post-conversation extraction 升级） | 3d | Babo 的 Cryptex 分层记忆 |
| 3.5 | 语义搜索 + 混合检索（关键词+向量+图） | 2d | Thoth 的 FTS5+向量混合 |
| 3.6 | 记忆衰减与压缩 | 2d | OpenSquilla 的 exponential decay |
| 3.7 | 记忆可视化 UI（知识图谱浏览器） | 3d | OpenHuman 的 Obsidian vault 集成 |

**验收标准**：
- `记得我上周说过想学 Python` → 能从对话历史自动提取
- `我上周的学习模式是什么` → 能通过知识图谱推理出模式
- `帮我找到和考研英语相关的所有记忆` → 语义搜索 + 图遍历

---

## P4 — 可视化工作流（4 周）🎨

**目标**：拖拽式构建学习路线图和工作流，这是笺流最大的差异化竞争力

灵感来源：LeAgent, Taskosaur, 笺流已有的 workflow_create

### 架构

```
┌──────────────────────────────────────┐
│   ReactFlow 画布                       │
│                                       │
│  ┌──────┐    ┌──────┐    ┌──────┐    │
│  │ 获取  │───▶│ AI   │───▶│ 生成  │    │
│  │ 数据  │    │ 分析  │    │ 便签  │    │
│  └──────┘    └──────┘    └──────┘    │
│     │           │           │        │
│     ▼           ▼           ▼        │
│  ┌──────┐    ┌──────┐    ┌──────┐    │
│  │今日   │    │周报   │    │目标板 │    │
│  │待办   │    │数据   │    │便签   │    │
│  └──────┘    └──────┘    └──────┘    │
│                                       │
│  [导入模板] [保存模板] [一键执行]     │
└──────────────────────────────────────┘
```

### 子任务

| # | 任务 | 预估 | 参考实现 |
|---|------|------|----------|
| 4.1 | ReactFlow + 自定义节点组件 | 3d | LeAgent 的 workflow builder |
| 4.2 | 节点类型定义（数据源 / AI / 工具 / 输出） | 2d | 笺流现有工具映射为节点 |
| 4.3 | 连线与数据流（上游输出 → 下游输入） | 2d | ReactFlow edges |
| 4.4 | 工作流执行引擎（DAG 调度器） | 3d | Taskosaur 的 multi-step workflow |
| 4.5 | 模板系统（预设模板 + 用户保存） | 2d | LeAgent 的 YAML export |
| 4.6 | AI 建议工作流（`帮我构建一个考研复习计划`） | 2d | 笺流已有 workflow_create 升级 |
| 4.7 | 工作流执行过程可视化（实时进度） | 2d | OpenAkita 的 floating progress bar |

**预设模板**：
- 📚 **考研复习路线图**：获取各科待办 → AI 分析进度 → 生成便签结构 → 建立连接线
- 📊 **月度学习复盘**：获取 30 天数据 → AI 分析趋势 → 生成报告便签
- 🎯 **目标分解**：大目标 → AI 拆解为子目标 → 生成画布便签

---

## P5 — Token 效率引擎（2 周）💰

**目标**：API 费用降低 60-80%，响应速度提升 2-3 倍

灵感来源：OpenSquilla

### 子任务

| # | 任务 | 预估 | 参考实现 |
|---|------|------|----------|
| 5.1 | 任务复杂度分类器（本地 ONNX 模型） | 3d | OpenSquilla 的 SquillaRouter |
| 5.2 | 多模型路由（简单→便宜模型，复杂→贵模型） | 2d | OpenSquilla 的四层路由 |
| 5.3 | 自适应提示词（简单任务只用精简 prompt） | 2d | OpenSquilla 的 prompt scaling |
| 5.4 | Token 用量统计面板 | 1d | OpenSquilla 的 cost tracking |
| 5.5 | 本地小模型集成（Ollama） | 2d | Thoth 的 39 种 Ollama 模型 |

**路由策略**：
| 任务类型 | 路由目标 | Token 成本 |
|----------|----------|-----------|
| 问候/简单问答 | GPT-4o-mini | ~$0.0002 |
| 查待办/建便签 | GPT-4o-mini | ~$0.0005 |
| 周报分析 | GPT-4o | ~$0.01 |
| 复杂规划/推理 | GPT-4o / Claude Sonnet | ~$0.03 |
| 长时间自主运行 | 本地 Ollama (Qwen3) | $0 |

---

## P6 — 定时自主 Agent（2 周）🤖

**目标**：笺流 24/7 自主工作，无需用户触发

灵感来源：OpenAkita, Thoth, Babo, OpenHuman

### 子任务

| # | 任务 | 预估 | 参考实现 |
|---|------|------|----------|
| 6.1 | 定时任务引擎（cron 调度器） | 2d | OpenAkita 的 Scheduler |
| 6.2 | 早安 Agent：每天 8:00 自动生成今日规划 | 2d | 复用 daily_plan + 主动提议 |
| 6.3 | 周报 Agent：每周日 20:00 自动生成周报 | 1d | 复用 weekly_review |
| 6.4 | 监测 Agent：检测异常模式时主动提醒 | 2d | OpenAkita 的 Proactive Engine |
| 6.5 | 睡眠 Agent：夜间整理记忆、压缩知识 | 2d | Babo 的 Sleep Cycle |
| 6.6 | 自主任务队列与优先级管理 | 2d | OpenHuman 的 agent orchestration |

**场景示例**：
- 8:00 — 「早安老爷。今日待办 3 项，已将英语阅读安排在上午 9-10 点。」
- 14:00 — 检测到下午无安排 → 「下午日程空白。需要安排学习吗？」
- 20:00 — 「今日专注时长 4.2h，达标率 84%。已记录。」
- 周日 20:00 — 「本周回顾已生成。专注总时长 28h，较上周 +12%。需要我调整下周目标吗？」

---

## P7 — 插件 / Skill 市场（3 周）🧩

**目标**：社区可以为笺流贡献插件，如 LeAgent 的 100+ 工具

灵感来源：LeAgent, OpenAkita, Kairox, Koda

### 子任务

| # | 任务 | 预估 | 参考实现 |
|---|------|------|----------|
| 7.1 | 插件定义 SDK（插件结构 + 声明式 API） | 3d | LeAgent 的 Agent Skills v1.0 |
| 7.2 | 插件发现与加载引擎 | 2d | Kairox 的 skills system |
| 7.3 | 插件市场 UI（浏览 + 一键安装） | 2d | OpenAkita 的 Skill Marketplace |
| 7.4 | 内置官方插件包（10+ 实用工具） | 3d | Koda 的 233 tools |

**内置插件候选**：
- 天气查询、新闻摘要、翻译助手
- PDF/Word/Excel 处理
- 网页抓取与分析
- 代码片段管理

---

## P8 — 工具执行透明度（1 周）👁️

**目标**：用户实时看到 AI 在做什么，不像黑盒

灵感来源：OpenAgentd, OpenAkita

### 子任务

| # | 任务 | 预估 | 参考实现 |
|---|------|------|----------|
| 8.1 | Tool Inspector 面板（参数、状态、耗时、结果） | 2d | OpenAgentd 的 tool inspector |
| 8.2 | 执行过程实时流展示 | 1d | 基于现有 streaming 升级 |
| 8.3 | 执行前后差异对比（如修改了哪个待办） | 2d | OpenAgentd 的 Git-like diffs |

---

## P9 — 语音 & 多端（4 周）🎙️

**目标**：随时随地使用笺流

灵感来源：Koda, Noema, OpenFlux

### 子任务

| # | 任务 | 预估 | 参考实现 |
|---|------|------|----------|
| 9.1 | 离线语音识别（Sherpa-ONNX） | 3d | OpenFlux 的语音方案 |
| 9.2 | 语音合成（Edge TTS / Kokoro） | 2d | Koda 的 Kokoro ONNX |
| 9.3 | 语音唤醒（"嗨笺流"） | 2d | Noema 的 VAD + wake word |
| 9.4 | Web 端（浏览器访问） | 3d | OpenAkita 的 Web UI |
| 9.5 | 移动端适配（Tauri Mobile） | 4d | OpenAgentd 的 Tauri mobile |

---

## 参考项目清单

| 项目 | Stars | 主要借鉴 |
|------|-------|----------|
| [OpenHuman](https://github.com/tinyhumansai/openhuman) | 34K | 记忆树、Agent 编排、深度研究 |
| [Super Productivity](https://github.com/super-productivity/super-productivity) | 20K | 任务管理 UX、Jira/GitHub 集成模式 |
| [OpenSquilla](https://github.com/opensquilla/opensquilla) | 5.7K | Token 效率路由、自适应提示词 |
| [LobsterAI](https://github.com/netease-youdao/LobsterAI) | 5.5K | MCP 集成、多端 IM 接入 |
| [FreeTodo](https://github.com/FreeU-group/FreeTodo) | 2.3K | 智能任务分解流程 |
| [OpenAkita](https://github.com/liuchaoxun/openakita) | 1K+ | 多 Agent 编排、89 工具、定时 Agent |
| [Thoth](https://github.com/siddsachar/Thoth) | 1K+ | 知识图谱、本地模型集成 |
| [LeAgent](https://github.com/vixues/LeAgent) | 200+ | 可视化工作流、Skill 市场 |
| [OpenAgentd](https://github.com/lthoangg/openagentd) | 205 | 工具执行透明度、Agent 团队 |
| [OpenFlux](https://github.com/EDEAI/OpenFlux) | 200+ | Tauri v2 架构、多 Agent、语音 |
| [Kairox](https://github.com/Z-Only/kairox) | 3 | Rust 共享核心、MCP、TUI+GUI |
| [Babo](https://github.com/umbecanessa/babo) | 5 | 持久记忆、子 Agent、Merkle 链 |
| [Koda](https://github.com/HeyKodaAI/koda) | 1K+ | 233 工具、语音、本地优先 |
| [Noema](https://github.com/HappyFox001/Noema) | 118 | 情感层、语音管线、插件系统 |
| [VYN](https://github.com/openyfai/VYN) | 100+ | 认知架构、自改进循环 |

---

## 关键设计原则

1. **渐进增强** — 每个阶段都保持向后兼容，现有功能不受影响
2. **本地优先** — 所有数据本地存储，云端 LLM 只是推理引擎
3. **模块化** — 每个 Agent / 插件 / 工作流都是独立模块，可单独启用/禁用
4. **可观测** — 所有 Agent 决策、工具调用、记忆变更都可追溯
5. **用户控制** — 敏感操作需要确认，Agent 自主性可调节（完全手动→半自主→全自主）

---

## 总结

```
P0 地基修复 ───── 已完成
    │
P1 MCP 协议 ───── 接入社区工具 ⛓️
    │
P2 多 Agent ───── 从单AI到AI团队 🤝
    │
P3 记忆升级 ───── 从key-value到知识图谱 🧠
    │
P4 可视化工作流 ─ 拖拽构建学习路线 🎨
    │
P5 Token 引擎 ─── API费降80% 💰
    │
P6 定时 Agent ─── 24/7自主工作 🤖
    │
P7 插件市场 ───── 社区生态 🧩
    │
P8 透明执行 ───── 所见即所得 👁️
    │
P9 语音多端 ───── 随时随地 🎙️
```
