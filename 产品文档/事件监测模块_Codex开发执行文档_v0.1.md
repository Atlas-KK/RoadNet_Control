# 事件监测模块·Codex开发执行文档

## 1. 文档信息

| 项目 | 内容 |
| --- | --- |
| 文档版本 | v0.1 |
| 编制日期 | 2026-08-24 |
| 唯一需求基线 | 产品文档/事件监测模块_PRD_v0.3.md |
| 适用代码 | demo/ React 19 + TypeScript 6 + Zustand 5 + Vite 8 |
| 使用对象 | 执行开发任务的 Codex、代码评审人员、测试人员 |
| 文档目标 | 把 PRD 转化为严格分阶段、可追溯、可测试的开发过程 |

## 2. 使用规则与权威顺序

本开发文档只解释“如何实现”，不得修改 PRD 的“实现什么”。

发生冲突时按以下顺序处理：

1. 用户在当前开发任务中的明确指令。
2. 事件监测模块_PRD_v0.3.md。
3. 本开发执行文档。
4. 当前代码和测试所体现的既有智能管控行为。
5. README及历史规格。

v0.1、v0.2及其评审文件只作为历史材料，不得用来覆盖v0.3。发现PRD v0.3与当前代码不一致时：

- 新增事件监测能力以PRD v0.3为准。
- 现有智能管控行为必须保持兼容。
- 不得擅自修改PRD、阈值、事件类型或业务规则。
- 无法同时满足时停止编码，列出冲突、影响和最小选项，等待用户决策。

## 3. 开发目标

完成以下闭环：

    模拟视频告警
      → 幂等接收和标准化
      → 告警聚合
      → 视频事件卡片
      → 人工核实和分级
      → 一般事件监测闭环
      → L3/L4严重事件接管
      → 智能管控研判与处置
      → 事件级状态回写

同时保证：

- 现有五个智能管控案例继续可运行。
- 现有人工应急直报继续可用。
- 现有智能管控Store和localStorage快照不被整体重写。
- 监测业务数据使用IndexedDB。
- 不接入真实生产视频、后端、认证和专业监测平台。

## 4. 强制开发原则

### 4.1 不越界

Codex只能实现当前阶段明确列出的需求。不得顺手增加：

- PRD未定义的新事件类型。
- 真实后端、WebSocket、SSO或生产视频接口。
- 手机端复杂操作。
- 专业桥梁、隧道或边坡诊断。
- 自动执行交通管控措施。
- 法定事故等级认定。
- PRD未要求的设计系统、路由库、状态库或测试框架。

### 4.2 不自作主张

以下内容不得自行修改：

- 八类P0事件及其编码。
- L1～L4规则和时间阈值。
- 聚合权重和0.75/0.45阈值。
- L3人工接管、人工确认L4后自动接管规则。
- 权限复核矩阵。
- IndexedDB/localStorage/sessionStorage边界。
- 事件级关闭权威来源。
- PRD P0/P1/P2边界。

### 4.3 保护现有系统

- 不删除或重写现有五案例数据。
- 不将现有store.ts整体迁移到新Store。
- 不改变现有推理、交通流、预案和TMS规则，除非当前阶段明确要求接入。
- 不把监测数据混入RuntimeSnapshot。
- 加载智能管控案例不得清空监测数据。
- 不使用破坏性Git命令。
- 不覆盖用户已有未提交修改。

### 4.4 纯函数优先

标准化、聚合、等级、状态机、指标、幂等和状态映射均实现为纯函数，Store只负责编排。任何新增纯函数必须有Vitest测试。

### 4.5 不引入不必要依赖

MVP默认使用浏览器原生IndexedDB、现有Zustand和Vitest。未经用户明确批准，不新增：

- idb
- React Router
- React Testing Library
- 日期库
- WebSocket客户端库
- UI组件库

## 5. 当前代码基线

### 5.1 当前入口

App.tsx当前直接渲染：

- Timeline顶部栏
- EventTriageList
- GisNetworkMap
- InfrastructureMonitorGrid
- TwinNarrativePanel
- TrafficFlowMonitor
- PlanTracePanel

Timeline内部由品牌区、系统在线状态和RuntimeBar组成。当前不存在一级模块导航。

### 5.2 当前状态

store.ts为智能管控主Store，包含：

- 模拟时钟
- 事件、推理、计算和预案
- GIS聚焦
- 资源占用
- 审计
- 五案例加载
- 人工上报
- 续报、订正、证伪和终报

现有loadDemoCase会调用clearRuntime。新增监测域不得挂入clearRuntime或被其清理。

### 5.3 当前持久化

services/persistence.ts使用localStorage保存智能管控RuntimeSnapshot和审计。该设计继续保留。

监测域新增独立IndexedDB，不修改RuntimeSnapshot版本，不把监测数据写入roadgov-mvp:runtime。

### 5.4 当前事件关闭语义

SimEvent使用finalized、finalReport和falsePositive等字段；Plan具有独立PlanState。接管回写必须遵守：

- Plan已完成不等于事件已解除。
- Plan已作废不等于事件证伪。
- Plan被替换不等于监测事件恢复。
- 只有事件级ControlEventUpdate可以改变MonitoringEvent的resolved/closed状态。

## 6. 目标技术架构

### 6.1 总体分层

    AppShell
    ├─ AppHeader
    │  ├─ 一级模块Tab
    │  ├─ 系统状态
    │  ├─ 模拟身份
    │  └─ 当前模块操作区
    ├─ EventMonitoringWorkspace
    │  ├─ VideoMonitoringView
    │  └─ MonitoringGisView
    └─ IntelligentControlWorkspace
       └─ 现有智能管控四列工作台

    Monitoring Domain
    ├─ Immutable Alarm / DeliveryReceipt / Assessment
    ├─ MonitoringEvent
    ├─ VerificationTask
    ├─ Handoff / CrossModuleUpdate
    └─ Audit

    Monitoring Engine
    ├─ normalize
    ├─ aggregate
    ├─ severity
    ├─ verification state machine
    ├─ metrics
    └─ lifecycle mapping

    Monitoring Services
    ├─ IndexedDB repository
    ├─ DemoMonitoringAdapter
    ├─ operational clock
    ├─ evidence resolver
    └─ ControlBridge

### 6.2 建议目录

    demo/src/
    ├─ App.tsx
    ├─ components/
    │  ├─ AppHeader.tsx
    │  └─ IntelligentControlWorkspace.tsx
    ├─ domain/
    │  ├─ monitoring.ts
    │  └─ handoff.ts
    ├─ monitoring/
    │  ├─ components/
    │  │  ├─ EventMonitoringWorkspace.tsx
    │  │  ├─ MonitoringOverview.tsx
    │  │  ├─ MonitoringFilterBar.tsx
    │  │  ├─ VideoEventGrid.tsx
    │  │  ├─ VideoEventCard.tsx
    │  │  ├─ MonitoringEventDrawer.tsx
    │  │  ├─ EvidencePanel.tsx
    │  │  ├─ VerificationPanel.tsx
    │  │  └─ MonitoringGisView.tsx
    │  ├─ engine/
    │  │  ├─ normalize.ts
    │  │  ├─ aggregation.ts
    │  │  ├─ monitoringSeverity.ts
    │  │  ├─ verificationMachine.ts
    │  │  ├─ monitoringMetrics.ts
    │  │  └─ lifecycleMapping.ts
    │  ├─ services/
    │  │  ├─ monitoringDb.ts
    │  │  ├─ monitoringAdapter.ts
    │  │  ├─ demoMonitoringAdapter.ts
    │  │  ├─ evidenceResolver.ts
    │  │  └─ operationalClock.ts
    │  ├─ bridge/
    │  │  ├─ controlBridge.ts
    │  │  └─ crossModuleSync.ts
    │  ├─ data/
    │  │  ├─ monitoringScenarios.ts
    │  │  └─ monitoringDevices.ts
    │  ├─ store.ts
    │  ├─ uiState.ts
    │  ├─ selectors.ts
    │  └─ permissions.ts
    └─ services/persistence.ts

目录可以根据现有命名做最小调整，但不得把以上职责重新合并回store.ts或组件。

## 7. 模块边界

### 7.1 AppShell

负责一级模块选择和公共顶部栏，不持有业务事件数据。

建议：

- 从当前App提取IntelligentControlWorkspace，保证DOM结构和现有样式尽量不变。
- 新建AppHeader承载品牌、一级Tab、系统状态和模拟用户。
- RuntimeBar只在智能管控模块显示，作为AppHeader的模块操作插槽。
- 事件监测模块使用独立MonitoringHeaderActions。

### 7.2 Monitoring Store

只保存监测域内存投影和动作：

- alarmsById的近期投影
- monitoringEventsById
- activeEventIds
- verificationTasks
- handoffLinks
- connectionState
- streamCursor
- persistenceState

不得保存视频二进制；不得包含智能管控的Plan、Trace或Calc。

### 7.3 UI State

保存：

- activeMonitoringView
- filters
- sort
- selectedMonitoringEventId
- gridScrollOffset
- mapViewport
- drawerTab

使用sessionStorage恢复，不写业务审计。

### 7.4 ControlBridge

监测Store不得直接修改useStore内部数组。ControlBridge是唯一接管入口。

实现建议：

1. 在共享domain/handoff.ts定义契约。
2. 为现有智能管控Store增加一个最小的acceptMonitoringHandoff动作。
3. 动作复用现有ingestReport、runReasoning和plan管线。
4. 动作返回HandoffResult和controlEventId。
5. 幂等键由桥接层持久化，重复请求恢复已有映射。
6. 不修改现有ingestEvent人工入口语义。

如现有ingestEvent无法可靠返回eventId，不得通过查找“最后一个事件”猜测。应提取确定性的事件创建函数或增加显式返回值。

### 7.5 跨模块回写

ControlEventUpdate来自显式事件级变化，不从PlanState猜测事件关闭。

MVP可以由crossModuleSync订阅智能管控Store并生成次级处置摘要，但resolved/closed必须来自：

- SimEvent.finalized及有效finalReport
- 明确的事件证伪决定
- 新增的事件级closureDecision

不能仅依据Plan已完成、已作废或已被替换。

## 8. 数据与标识规范

### 8.1 ID

使用可读前缀：

- ALM：Alarm
- RCP：AlarmDeliveryReceipt
- ASM：AlarmAssessment
- ME：MonitoringEvent
- VT：VerificationTask
- HO：Handoff
- CE：ControlEvent沿用现有事件ID规则
- MSG：跨模块消息

ID生成集中封装。测试允许注入固定ID生成器，禁止依赖随机值断言。

### 8.2 版本

- MonitoringEvent每次业务变更version加1。
- ControlEventUpdate携带controlEventVersion。
- 写操作携带expectedVersion。
- 跨模块消息携带messageId和全局streamSequence。
- 老版本不得覆盖新版本。

### 8.3 不变性

- Alarm创建后不可原地修改。
- 重复投递创建DeliveryReceipt，不创建第二个Alarm。
- 告警核实结果创建AlarmAssessment。
- duplicateCount由Receipt投影计算。
- 事件订正创建新版本和审计，不覆盖历史。

## 9. 存储架构

### 9.1 IndexedDB数据库

建议数据库名：

    roadgov-monitoring-mvp

建议对象仓：

| Store | 主键 | 索引 |
| --- | --- | --- |
| alarms | alarmId | sourceSystem+sourceAlarmId、detectedAt、eventType、deviceId |
| receipts | receiptId | messageId、sourceAlarmId、receivedAt |
| assessments | assessmentId | alarmId、assessedAt |
| events | monitoringEventId | lifecycleStatus、verificationStatus、updatedAt、roadCode |
| verificationTasks | taskId | eventId、ownerId、nextReviewAt |
| handoffs | handoffId | monitoringEventId、idempotencyKey、controlEventId |
| outbox | messageId | streamSequence、status |
| monitoringAudit | seq | entityId、occurredAt、kind |

使用原生IndexedDB薄层，集中处理事务、版本升级和错误。组件不得直接调用IndexedDB。

### 9.2 写入顺序

业务操作遵循：

    校验expectedVersion
      → IndexedDB事务写入
      → 事务成功
      → 更新Zustand内存投影
      → 发布UI变化

事务失败不得先更新UI为成功。

### 9.3 内存窗口

- 最多200起活跃事件。
- 卡片和告警使用按需投影。
- 旧记录只从内存卸载，不从IndexedDB删除。
- 演示重置只能删除monitoring_demo命名空间，需二次确认。

## 10. 时钟架构

禁止直接复用现有simSec计算核实SLA。

- eventTime用于案例发生和演示时间线。
- operationalTime使用Date.now加performance.now校准，负责核实、观察和接管SLA。
- displayTime负责格式化。

模拟时钟暂停、4倍或16倍时，核实倒计时仍按真实秒推进。所有纯时间函数必须支持注入Clock，单测禁止真实等待。

## 11. 开发阶段总览

| 阶段 | 目标 | 对应PRD |
| --- | --- | --- |
| 0 | 基线审计和追踪矩阵 | 全文 |
| 1 | AppShell及一级导航 | FR-EM-001 |
| 2 | 领域模型、IndexedDB和UI状态 | FR-EM-002/011/012 |
| 3 | 模拟适配器和六个场景数据 | FR-EM-002/005 |
| 4 | 标准化、去重、聚合和拆分 | FR-EM-002/003 |
| 5 | 视频卡片列表、筛选和详情 | FR-EM-004/005 |
| 6 | 核实、权限、状态机和双时钟 | FR-EM-006/012 |
| 7 | 等级规则和GIS基础态势 | FR-EM-007/008 |
| 8 | 接管、幂等和智能管控接入 | FR-EM-009 |
| 9 | 双向同步、订正和事件级关闭 | FR-EM-010 |
| 10 | 降级、指标、性能和稳定性 | FR-EM-011/013/NFR |
| 11 | 全量验收、文档和交付 | AC-01～AC-26 |

每阶段完成后必须停止，输出变更、测试、风险和下一阶段建议；未经用户确认不得自动进入下一阶段。

## 12. 阶段0：基线审计

### 目标

不修改业务代码，形成实现前检查结果。

### 必做

1. 完整阅读PRD v0.3和本开发文档。
2. 读取App.tsx、Timeline、RuntimeBar、store.ts、persistence.ts、event.ts、plan.ts、ingest.ts、merge.ts、severity.ts、GisNetworkMap。
3. 检查工作区状态，保护用户已有改动。
4. 建立FR到文件、测试和验收编号的追踪矩阵。
5. 列出PRD与代码冲突，不自行裁决。

### 阶段门禁

- 无代码修改。
- 用户确认追踪矩阵和阶段1计划。

## 13. 阶段1：AppShell与一级导航

### 开发任务

1. 提取IntelligentControlWorkspace，保持现有四列布局和行为。
2. 新建AppHeader和一级Tab。
3. 新建EventMonitoringWorkspace空壳和二级视图占位。
4. activeModule及监测视图写入sessionStorage。
5. RuntimeBar仅在智能管控上下文展示。

### 禁止

- 不改现有事件、预案、地图和案例逻辑。
- 不加入监测业务数据。
- 不引入Router。

### 测试

- activeModule恢复纯函数或Store测试。
- 智能管控默认组件仍可渲染。
- 手工冒烟：两个Tab切换；智能管控五案例入口仍存在。

### 门禁

    npm.cmd run check

现有功能无回归后停止。

## 14. 阶段2：领域模型、IndexedDB和UI状态

### 开发任务

1. 实现domain/monitoring.ts和domain/handoff.ts。
2. 实现原生IndexedDB仓储和数据库升级。
3. 实现监测Store最小骨架。
4. 实现uiState及sessionStorage恢复。
5. 实现模拟身份、权限点和权限守卫。

### 必测

- Alarm不可变。
- Receipt幂等。
- IndexedDB增删查、索引和事务失败。
- 数据库升级不影响智能管控localStorage。
- 权限越权在动作层被拒绝。

### 门禁

- 不存在监测业务数据写入localStorage。
- 不修改RuntimeSnapshot版本。
- npm.cmd run check通过。

## 15. 阶段3：模拟适配器和场景

### 开发任务

实现MonitoringSourceAdapter和DemoMonitoringAdapter：

- 固定随机种子
- 开始、暂停、恢复
- 场景重置
- 故障注入
- 消息订阅
- 游标补拉
- 视频失败和连接中断模拟

建立六个场景：

1. 异常停车重复告警。
2. 行人误报。
3. 抛洒物持续观察。
4. 隧道交通事故L3。
5. 隧道火灾L4。
6. 交通拥堵持续监测。

### 禁止

- 不直接调用页面setState产生告警。
- 不复用五个智能管控案例的clearRuntime。
- 不声称建立真实WebSocket或视频流。

### 门禁

- 同一seed产生一致消息序列。
- 暂停/恢复不影响operationalTime。
- reset monitoring_demo不影响智能管控。

## 16. 阶段4：标准化、去重、聚合和拆分

### 开发任务

1. 实现标准化和关键字段失败队列。
2. 实现DeliveryReceipt和精确幂等。
3. 实现七维聚合评分及集中配置。
4. 实现候选聚合结果，不做UI。
5. 实现事实冲突和聚合后独立演化拆分。
6. 实现事件级综合可信度。

### 必测

- PRD验收1、2、21。
- 方向反向、设施不同和类型不相容不得自动聚合。
- 0.45和0.75边界值。
- 伤亡、车辆、危化冲突进入人工比对。
- 初次1～3km评分不会被错误的即时拆分覆盖。

### 门禁

- 纯函数测试覆盖正常、边界、冲突和异常输入。
- 不修改现有engine/merge.ts语义。

## 17. 阶段5：视频事件列表、筛选和详情

### 开发任务

1. 实现工作指标和正确时间口径。
2. 实现筛选、排序、快捷筛选和重置。
3. 实现响应式视频事件卡片网格。
4. 实现新增N条提示及滚动位置保持。
5. 实现宽幅详情抽屉、五页签和全屏。
6. 实现模拟关键帧、短视频占位和降级。

### 禁止

- 查看详情不得自动开始核实。
- 算法置信度不得显示为准确率。
- 不展示英文业务对象名。
- 不在卡片展示敏感个人信息。

### 门禁

- PRD验收3、16、20。
- 1920、1440、1366和1280宽度冒烟通过。
- 现有智能管控CSS无明显回归。

## 18. 阶段6：核实、权限、状态机和SLA

### 开发任务

1. 实现开始核实、占用、释放和强制转交。
2. 实现人工核实和持续观察子模式。
3. 实现首次核实和复核倒计时。
4. 实现新证据提前触发复核。
5. 实现L4复核权限和连续观察升级。
6. 实现AlarmAssessment和事件订正版本。

### 必测

- PRD验收3～8、26。
- 多用户版本冲突。
- 模拟时钟暂停/加速不影响SLA。
- L4无班长复核不得误报、降级或观察。
- 持续观察释放占用后可被他人认领。

### 门禁

- 时间测试使用注入Clock，不使用sleep。
- 所有状态转换只有一个纯函数入口。

## 19. 阶段7：监测等级和GIS

### 开发任务

1. 实现L1～L4短路规则和reasonCodes。
2. 实现suggestedLevel和confirmedLevel分离。
3. 接入已配置关键节点、设施和交通阈值。
4. 实现GIS事件点、聚合、筛选和跨视图定位。
5. 地图失败时保留视频核实。

### 禁止

- 不把L1～L4直接赋给管控Severity。
- 不称现有Severity为法定等级。
- 不实现P1热力、排行和趋势。
- 不编造缺失关键节点或设施数据。

### 门禁

- PRD验收7、8、17。
- 每条等级结果都有reasonCodes。
- GIS基础功能P0完成，P1明确留空。

## 20. 阶段8：接管与智能管控接入

### 开发任务

1. 实现HandoffRequest/Result。
2. 实现幂等键、重试和关联持久化。
3. 新增ControlBridge。
4. 为现有智能管控Store增加最小acceptMonitoringHandoff动作。
5. 复用现有事件接入和研判流程。
6. 实现L3人工接管、确认L4后自动发起。
7. 实现成功提示和主动跳转。

### 禁止

- 不通过“最后一个事件”猜controlEventId。
- 不自动执行任何控制措施。
- 不生成空参数可执行Measure。
- 通用研判只创建PlanningGap。
- 不改变人工应急直报入口。

### 门禁

- PRD验收9～12、24。
- 同一幂等键只产生一个ControlEvent。
- 五个现有智能管控案例全部回归。

## 21. 阶段9：双向同步、订正和关闭

### 开发任务

1. 实现MonitoringEventUpdate和ControlEventUpdate。
2. 实现messageId幂等、streamSequence补拉、实体版本仲裁和expectedVersion。
3. 实现证据补充、事实订正和重新研判。
4. 实现事件级resolved、closed、correction_required和false_positive_confirmed。
5. 实现处置摘要和监测卡片次级状态。

### 禁止

- Plan已完成不得直接关闭监测事件。
- Plan已作废不得直接判定事件误报。
- Plan被替换不得直接恢复监测状态。
- 监测侧不得直接关闭已接管事件。

### 门禁

- PRD验收13～15、23。
- 人为制造乱序和重复消息时结果一致。
- 关闭必须存在closureDecision。

## 22. 阶段10：降级、指标、性能和稳定性

### 开发任务

1. 完成GIS、视频、AI、接管和IndexedDB失败降级。
2. 完成内存窗口和按需投影。
3. 完成P0运营指标；P1算法效果仅实现数据准备或按用户指令实施。
4. 建立固定seed性能数据生成器。
5. 执行筛选、详情、GIS和两小时稳定性验收。

### 门禁

- PRD验收16～22。
- 报告平均值和P95。
- 记录参考机和浏览器信息。
- 内存卸载不删除IndexedDB数据。

## 23. 阶段11：全量验收与交付

1. 执行PRD 26条验收标准。
2. 执行六个典型案例。
3. 执行npm.cmd run check。
4. 执行浏览器冒烟和响应式检查。
5. 检查模拟标识、权限、审计和降级。
6. 更新demo/README.md和代码修改日志。
7. 输出FR→代码→测试→验收追踪矩阵。
8. 列出P1/P2未实现内容，禁止伪装为完成。

## 24. 测试策略

### 24.1 单元测试

| 模块 | 重点 |
| --- | --- |
| normalize | 类型映射、关键字段、模拟标识、非法输入 |
| aggregation | 幂等、边界分数、硬冲突、候选、拆分 |
| monitoringSeverity | L1～L4短路、理由、缺失数据 |
| verificationMachine | 全部合法与非法转换 |
| operationalClock | 暂停、倍速、到期、注入时间 |
| monitoringMetrics | 今日流量与当前存量口径 |
| lifecycleMapping | Plan状态不改变事件级生命周期 |
| permissions | 角色权限和越权拒绝 |
| IndexedDB | 事务、升级、失败和恢复 |
| handoff/sync | 幂等、乱序、重放和版本冲突 |

### 24.2 Store测试

- 持久化成功后才更新内存。
- 刷新恢复。
- 模块清理隔离。
- 同时核实冲突。
- 接管及关联恢复。

### 24.3 浏览器冒烟

- 一级Tab和二级视图。
- 卡片、抽屉和GIS定位。
- 权限切换。
- 六个场景。
- 接管到智能管控及返回。
- GIS和视频故障降级。

### 24.4 质量命令

在demo目录执行：

    npm.cmd run lint
    npm.cmd run test
    npm.cmd run build
    npm.cmd run check

阶段中可以运行定向Vitest，但阶段门禁必须执行完整check。

## 25. 需求追踪规则

每个新增模块、函数和测试必须在注释、测试名称或阶段报告中关联FR或AC编号。不要在代码中堆砌大段PRD原文；使用简短引用，例如：

    FR-EM-003 / AC-02

阶段报告至少包含：

| 字段 | 内容 |
| --- | --- |
| 当前阶段 | 阶段编号和名称 |
| 覆盖需求 | FR和AC编号 |
| 修改文件 | 新增/修改列表 |
| 决策 | 仅列PRD允许的技术决策 |
| 测试 | 命令和结果 |
| 未完成 | 明确剩余项 |
| 风险 | 阻塞或后续风险 |
| 下一阶段 | 仅建议，不自动开始 |

## 26. 停止条件

出现以下任一情况，Codex必须停止编码并请求用户决策：

1. PRD v0.3无法确定唯一实现。
2. 需要改变八类事件、阈值、状态或权限。
3. 需要新增依赖。
4. 需要修改现有智能管控业务规则。
5. 需要真实接口、凭据或外部系统。
6. 用户已有修改与当前阶段重叠且无法安全合并。
7. 测试连续失败且原因表明PRD与代码冲突。
8. 需要删除、迁移或重置用户数据。
9. 无法在不使用Plan状态的情况下确定事件关闭。
10. 当前阶段范围不足以安全完成某项依赖。

停止时只报告事实、影响、可选方案和推荐项，不自行选择。

## 27. 禁止清单

Codex在任何阶段都不得：

- 修改PRD v0.3或本开发文档来适配代码。
- 使用v0.2覆盖v0.3。
- 将监测业务数据写入localStorage。
- 将监测数据塞入现有RuntimeSnapshot。
- 加载案例时清空另一个模块。
- 将Plan状态直接映射为事件关闭。
- 原地修改Alarm或删除持久化Alarm。
- 以AI置信度代替准确率。
- 将内部等级描述为法定等级。
- 用空参数Measure充当PlanningGap。
- 未经人工确认由单一AI建议L4直接接管。
- 接管后自动执行控制措施。
- 静默填充缺失的类型、时间、位置或设施。
- 在组件内重复实现聚合、等级、权限或计时规则。
- 跳过测试或以“理论上通过”代替实际结果。
- 自动创建Git提交、分支或推送，除非用户明确要求。

## 28. Codex总控提示词

以下提示词应与PRD v0.3和本开发文档一并提供给执行开发的Codex。

---

你是本项目“事件监测模块”的实现工程师。你的唯一任务是严格按照以下两份文档分阶段开发：

1. 产品文档/事件监测模块_PRD_v0.3.md
2. 产品文档/事件监测模块_Codex开发执行文档_v0.1.md

你必须完整阅读两份文档，以及当前阶段涉及的现有代码和测试。v0.1、v0.2及历史评审仅供追溯，不得覆盖v0.3。

### 一、权威规则

- 用户当前明确指令最高。
- PRD v0.3定义“做什么”，开发执行文档定义“怎么做”。
- 现有代码只定义智能管控既有行为，不得用现状否定PRD新增需求。
- 发现文档冲突、歧义或无法兼容时立即停止，说明冲突和选项，等待用户决策。
- 不得自行修改需求、阈值、事件类型、状态、权限或优先级。

### 二、阶段规则

- 当前只实施用户明确指定的阶段。
- 开始编码前先输出：当前阶段、覆盖FR/AC、拟修改文件、测试计划、发现的冲突。
- 一次只允许一个阶段处于进行中。
- 不得提前实现下一阶段。
- 阶段完成后执行完整质量门禁，输出结果并停止。
- 未经用户回复“进入下一阶段”，不得继续。

### 三、架构红线

- 现有智能管控Store、五案例、人工应急直报和localStorage快照必须保持兼容。
- 新监测域放入src/monitoring，不能继续堆入现有store.ts。
- 监测业务数据必须使用IndexedDB；localStorage只保存偏好。
- Alarm不可原地修改；重复投递写DeliveryReceipt。
- 模拟时钟不得驱动核实和接管SLA。
- 监测Store不得直接修改智能管控Store，必须经ControlBridge和共享契约。
- Plan完成、作废或替换不得直接改变监测事件生命周期。
- 只有事件级ControlEventUpdate和closureDecision可以解除或关闭已接管事件。
- 通用安全研判只能生成PlanningGap，不得生成空参数可执行措施。

### 四、业务红线

- P0八类事件固定为：交通拥堵、交通事故、行人闯入、车辆逆行、车辆倒车、异常停车、火灾、抛洒物。
- 危化品是关键属性；追尾、侧翻是交通事故子类型；抛锚是异常停车原因。
- L1～L4均为内部监测等级，不是法定等级。
- AI只生成建议等级，不能静默覆盖人工等级。
- L3由人工发起接管；人工确认L4后自动发起，但不自动执行控制措施。
- 加载智能管控案例不得清空监测数据。
- 缺失关键字段不得自行补默认值。

### 五、工程规则

- 纯函数优先，Store只编排。
- 新增纯函数必须有Vitest。
- 不新增依赖，除非用户明确批准。
- 使用apply_patch编辑文件。
- 保留用户已有改动，忽略无关脏文件。
- 不运行破坏性Git命令。
- 不自动提交、建分支或推送。
- 测试必须实际执行，不得虚报。

### 六、质量门禁

每阶段至少执行：

    npm.cmd run check

并按阶段运行定向测试和浏览器冒烟。任何失败都必须说明原因，不得隐藏或降级为“已完成”。

### 七、输出格式

阶段完成后只输出：

1. 完成结果。
2. 覆盖的FR和AC。
3. 修改文件。
4. 测试命令及真实结果。
5. 未完成项。
6. 风险和待确认项。
7. 下一阶段建议。

不要自动进入下一阶段。

当前阶段由用户指定为：＜填写阶段编号和名称＞。

现在先阅读文档和代码，输出当前阶段实施计划；除非用户已明确授权开始编码，否则不要修改文件。

---

## 29. 单阶段提示词模板

后续每次可以使用以下简短提示启动某一阶段：

    严格依据：
    - 产品文档/事件监测模块_PRD_v0.3.md
    - 产品文档/事件监测模块_Codex开发执行文档_v0.1.md

    执行阶段：阶段X《阶段名称》。

    只实施该阶段，不进入下一阶段，不修改PRD，不扩大范围。
    开始前先报告FR/AC、拟改文件和测试计划；完成后执行npm.cmd run check并停止。

## 30. 开发交付检查表

### 需求

- [ ] 每个FR有代码和测试映射。
- [ ] 26条AC全部有结果。
- [ ] P1/P2未实现能力明确标记。

### 架构

- [ ] 监测域独立。
- [ ] 现有智能管控Store未被重写。
- [ ] IndexedDB边界正确。
- [ ] ControlBridge为唯一接管入口。
- [ ] 双时钟隔离。
- [ ] 事件级关闭与Plan状态分离。

### 业务

- [ ] 八类事件正确。
- [ ] Alarm不可变。
- [ ] 聚合规则和阈值正确。
- [ ] 核实占用和持续观察正确。
- [ ] L3/L4接管正确。
- [ ] 通用研判无空参数措施。

### 质量

- [ ] lint通过。
- [ ] test通过。
- [ ] build通过。
- [ ] 六场景通过。
- [ ] 响应式冒烟通过。
- [ ] 性能和两小时稳定性有报告。
- [ ] 无真实密钥、个人信息和生产数据。

## 31. 最终交付物

开发完成时应包含：

1. 事件监测模块源代码。
2. 新增及更新的单元测试。
3. IndexedDB存储和升级测试。
4. 六个模拟监测案例。
5. FR/AC追踪矩阵。
6. 测试和性能验收报告。
7. demo/README.md更新。
8. 对应代码修改日志。
9. P1/P2未实现项清单。

