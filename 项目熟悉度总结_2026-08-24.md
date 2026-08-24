# 路网综合管控智能体 MVP · 项目熟悉度总结

> 生成日期：2026-08-24 ｜ 用途：为后续迭代升级提供项目全景基线
> 数据来源：README、产品文档、demo 源码（src 123 文件）、事件案例、代码修改日志

---

## 一、项目概览

面向**高速公路运行监测与应急处置**的交互式产品原型。以**事件为主线**，串联事件接入与归并、事理图谱推理、交通流计算、管控预案生成、人工复核、指令下发、执行跟踪和审计留痕。当前是**单机前端 MVP**（React 19 + TypeScript + Zustand + 高德地图），业务数据由内置案例、人工输入和 localStorage 承载。

> ⚠️ 当前路网、桩号、设备、资源、交通流及现场素材均为**演示/仿真数据**，不可作为导航、测绘、生产调度或真实应急决策依据。

### 核心能力

- 事件上报、AI 结构化接报、事件归并与多事件分诊
- 五步推理、条件求值、跨事件冲突校验、资源链推理和交通流计算
- 管控预案 V1/V2 版本演进（确认、打回、作废、证伪、超时升级）
- 高德地图事件/路网设施/处置资源/拥堵/雷视融合孪生展示
- 五个可重复加载的典型案例（分流冲突、资源挤兑、条件组合、撤销传导、方案自引用）
- 指令回执、交通响应回写、态势简报、事件终报、审计及 JSONL 数据集导出
- 可选 Qwen/DeepSeek/Kimi/OpenAI 兼容 LLM 增强；失败自动回退本地模板/规则引擎

---

## 二、功能定位

### 演进路径

| 阶段 | 定位 | 状态 |
|---|---|---|
| demo 演示器 | S0–S5 脚本化场景，证明推理逻辑可运行 | 已演进为运行模式，脚本薄化为案例 |
| **MVP 运行版（当前）** | 同一套推理能力脱离脚本，对**任意输入事件**完成「接入→归并→推理→预案→复核→下发→留痕→数据集」闭环 | **当前代码基线** |
| post-MVP | 服务端代理、权限控制、生产 GIS、真实感知/派单对接、多用户 | 明确不做（当前边界） |

### 能力边界（不得突破）

1. 不自动执行改变驾驶行为的控制措施——控制类一律人工确认
2. 不替代现场指挥权——全部产出定位为处置建议
3. 不做责任认定与执法判断
4. 不在低置信时伪装确定——显式标注依据不足并回退规则结论或转人工

### 权威依据（重要）

实际开发进度已超过 MVP SRS，**当前以 demo 目录代码 + README（demo/README.md、根 README.md）为准**。历史文档供理解演进脉络：

- 《MVP 需求规格说明书 v1.0》（`产品文档/`）：历史基线（2026-07-16），FR-A~K 模块与 12.1 回归锚点仍有参考价值，但**代码已超出其范围**（如 2026-08 新增指令回执、简报降级等），冲突时以代码/README 为准
- 《演示 Demo 开发规格 v1.0》：前置规格（五步推理契约 §5.2、模型口径 §4）
- 《路网综合管控智能体产品方案 v1.7.docx》：上位方案（附录 A 五案例）
- 《事件监测模块_PRD_v0.1.md》：事件监测模块需求

---

## 三、核心业务流程（统一处置链）

```
事件输入（手工上报 / 五个案例装载）
  → Zustand Store（store.ts 编排）
  → 归并判定（engine/merge.ts）→ 高置信并入 / 中置信并案 / 独立新建
  → 五步推理（engine/reasoner.ts）：①落图 ②快照 ③多跳子图检索 ④因果/顺承/条件推演 ⑤约束裁剪与措施匹配
  → 交通流计算（engine/flowModel.ts）：C_b → k_a → k_q → w（排队回溯速度）
  → 跨事件分流冲突校验（engine/conflictCheck.ts）+ 自引用检测（engine/traversal.ts）→ 自动裁剪改提前分流
  → 预案 V1 构建（engine/planBuilder.ts）+ 候选方案比较（engine/planComparison.ts）
  → 人工复核：统一待办三档（控制类人工确认 / 实况类自动执行 / 预测预警类一键确认）
  → 指令下发回执（engine/commandDispatch.ts）+ 交通响应回写（engine/trafficResponse.ts）
  → 执行跟踪：拥堵网格 / 地图 / 孪生车流（增长→稳定→消散→恢复）
  → 续报/订正续报（人工续报触发重研判 → 新预案版本）；属性修正走 TMS 撤销传导（engine/tms.ts）
  → 事件终报 + 审计留痕 + JSONL 数据集导出
```

### 预案版本状态机

`草案 → 待确认 → 已确认 → 已下发 → 执行中 → 已完成`；分支终态 `已作废 / 已被替换`。新版本生成时旧版自动转「已被替换」，措施逐条标注 继承/新增/撤销/降级。

### 五个演示案例（回归锚点）

| 案例 | 场景 | 关键数值锚点 |
|---|---|---|
| 案例一 | 跨事件分流冲突 | w(B)=7.55、T_conflict=24min、T_arrive=18min、裁剪→提前分流 K1140→S204 |
| 案例二 | 资源链式挤兑 | W-01 等待 ETA=41min < W-EX 48min |
| 案例三 | 危化品+隧道+团雾+夜间 | 封道点 K1169.5→VMS-05@K1168、VMS-03 被裁剪、通风/无人管制区参数 |
| 案例四 | 事实撤回撤销传导 | F_泄漏撤回→消防撤销/全封降级/通风降级/清障保留，V1→V2 |
| 案例五 | 方案自引用 | w=9.8、T(枢纽)=35.5min、17:06 预测兑现 |

---

## 四、技术架构

### 技术栈

| 分类 | 技术 |
|---|---|
| 前端 | React 19、TypeScript 6、Vite 8 |
| 状态 | Zustand 5（单一 store，store.ts 1411 行） |
| 样式 | Tailwind CSS 4 + Arco Design 视觉令牌（index.css @theme） |
| GIS | 高德地图 JavaScript API 2.0（原生 Marker/Polyline/InfoWindow 覆盖物） |
| 图表 | Recharts 3（按需异步加载） |
| 持久化 | localStorage（运行快照 + 只增审计流，services/persistence.ts） |
| LLM | OpenAI 兼容 /chat/completions（qwen/deepseek/kimi/custom），schema + 值级校验 |
| 质量 | Oxlint、Vitest（38 文件 182 用例）、tsc、Vite build |

### 架构分层与依赖方向（单向）

```
components（交互/渲染）
   ↓ 订阅
store.ts（Zustand 编排，串联引擎 action）
   ↓ 调用
engine/*（纯函数业务算法，无副作用）   ←→ 依赖 data/*、domain/*、gis/*
gis/*（地图共享模型 + 高德适配器）
services/*（llm、persistence）
```

**核心约定**：领域类型入 `domain/`、纯业务算法入 `engine/`、组件只做交互渲染、地图业务状态沉淀到 `gis/twinMapModel`（双渲染引擎共享，避免组件/地图各自计算偏差）。engine 不触达 store/UI（唯一例外 `clock.ts`，React hook）。

---

## 五、代码结构（demo/src 123 文件）

| 目录 | 文件数 | 职责 |
|---|---|---|
| `components/` | 26 | 工作台面板与交互组件（四列布局） |
| `data/` | 10 | 路网、设备、资源、图谱 schema、措施模板、五个案例脚本 |
| `domain/` | 7 | 事件/预案/审计/数据集/归并/TMS/图表类型 |
| `engine/` | 47（含 20 测试） | 推理、计算、归并、状态机、TMS 等纯函数算法 |
| `gis/` | 21 | 路网几何、共享模型、高德覆盖物适配、雷视仿真 |
| `services/` | 4 | 持久化（persistence.ts 185 行）、LLM 通道（llm.ts 1459 行） |
| `utils/` | 2 | 时钟格式化等 |

### 关键文件

- **`store.ts`**（1411 行）：唯一 Zustand store，全部业务 action（ingest/loadDemoCase/confirmMeasure/reviseEventFacts/falsifyEvent/submitProgressReport/tick...）
- **`App.tsx`**：四列工作台布局
- **`engine/reasoner.ts`**：五步推理引擎
- **`engine/ingest.ts`**：事件接入管道（归并→推理→预案→冲突校验→自引用检测）
- **`engine/flowModel.ts`**：交通流模型（C_b/k_a/k_q/w）
- **`engine/tms.ts`**：真值维护/撤销传导
- **`data/demoCases.ts`**：五个案例脚本（sceneBaseSec/environment/events/twinScript/finalSimSec）
- **`services/llm.ts`**：LLM 通道 + schema 校验 + 值级溯源比对 + 本地规则引擎降级
- **`services/persistence.ts`**：localStorage 快照 + 审计流

### 引擎层设计模式

- 绝大多数 engine 模块为**无状态纯函数**：输入事件快照/预案/环境/时刻，输出派生数据
- store 在 action 内按序串联：ingest→computeFlow→runReasoning→buildPlanV1→propagateRetraction→buildEventFinalReport→buildPlanCandidates
- 组件/gis 直接调用只读计算函数（网格/门架/监控/分诊/设备指令）驱动渲染

---

## 六、页面结构（工作台四列布局）

顶部 `Timeline`（内嵌 `RuntimeBar`：设置/审计抽屉/数据集导出/事件上报/LLM 配置）；主区四列：

| 列 | 面板 | 说明 |
|---|---|---|
| ① 事件分诊 | `EventTriageList` | 活跃事件列表（严重度/超时/待办），聚焦/续报/修正/作废/证伪/案例加载 |
| ② GIS 数字孪生 | `GisNetworkMap` + `InfrastructureMonitorGrid` | 高德地图（事故/拥堵/设施/资源/孪生车流）+ 设备监测网格 |
| ③ 孪生态势讲解 | `TwinNarrativePanel` + `TrafficFlowMonitor` | AI/规则态势简报（30s 刷新）+ 门架通行能力对比曲线 |
| ④ 智能处置队列 | `PlanTracePanel`（内嵌 `UnifiedTimelineQueue`） | 推理→续报→预案版本→候选对比→措施确认→终报一线串起 |

**非挂载独立面板**：`ReasoningPanel`（推理详情弹窗：左图谱路径播放/右计算）、`TodoQueue`（统一待办）、`PlanPanel`（预案版本）、`CongestionGrid`（拥堵网格）等。弹窗：`EventFinalReportModal`/`ProgressReportModal`/`FactReviseModal`/监控抽屉 `MonitorDrawer`。

---

## 七、当前状态与质量

### 最近变更（代码修改日志）

| 日期 | 内容 |
|---|---|
| 2026-08-11 | 态势感知简报 LLM 400 重试 + 本地规则引擎降级 |
| 2026-08-08 | 处置指令回执与基础设施联动 |
| 2026-08-05 | 测试验收 + 高德 JS API 失败缓存修复 |
| 2026-07-30 | 高德单引擎测试修复 |
| 2026-07-27/26 | Arco 全局视觉规范优化 |
| 2026-07-15/16 | MVP 里程碑（引擎通用化、运行模式、持久化、LLM 通道） |

### 质量门禁

`npm run check` = Oxlint → Vitest → TypeScript → Vite 生产构建。最近一次：38 测试文件 182 用例通过；未引入 E2E 框架（建议补 Playwright/Cypress）。

### 已知边界（README「当前边界」）

尚未接入真实雷达/摄像机结构化数据、生产 GIS 服务、统一身份认证、真实指令下发通道及后端审计库。正式部署前需补齐服务端安全代理、权限控制、数据治理、可观测性及生产接口。

---

## 八、迭代升级注意事项（经验沉淀）

1. **回归红线**：五个案例的数值锚点（§三）是评审资产，任何重构不得破坏；改算法必须同步更新 Vitest 用例。
2. **现状基线**：以 demo 当前代码 + README 为准（开发已超出 MVP SRS，SRS 仅作历史参考）；需求变更应先对照现状代码评估影响面，新增阈值标「初值」并集中配置。
3. **架构约束**：领域→domain、算法→engine、地图共享→gis；engine 保持纯函数，不反向依赖 store；新增纯函数必须补测试。
4. **视觉规范**：遵循 Arco Design 令牌（index.css @theme），主色 `#4080FF`、8px 卡片圆角、4px 控件圆角、48px 标题区。
5. **LLM 设计**：外部 LLM 是可选增强，schema + 值级溯源校验不通过即回退模板/本地规则引擎；不要把密钥写进源码。
6. **持久化**：运行快照 + 审计流走 localStorage（services/persistence.ts），有版本号校验；`demo/API KEY.txt` 与 `.env.local` 已 gitignore。
7. **技术债**：node_modules 是损坏的符号链接（不影响源码）；git 只有 2 个初始提交，未建立常规提交历史。
