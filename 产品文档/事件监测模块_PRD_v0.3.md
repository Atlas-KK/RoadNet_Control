# 路网综合管控智能体·事件监测模块 PRD

## 1. 文档信息

| 项目 | 内容 |
| --- | --- |
| 文档名称 | 事件监测模块产品需求文档 |
| 文档版本 | v0.3 |
| 文档状态 | 开发前终审稿 |
| 编制日期 | 2026-08-24 |
| 适用项目 | 路网综合管控智能体 MVP |
| 目标读者 | 产品、设计、前端、测试、后端、算法及接口负责人 |
| 建设方式 | 生产目标设计、前端演示 MVP 实现 |
| 数据声明 | 本期使用模拟数据和演示素材，不代表已接入生产系统 |

## 2. 修订记录

| 版本 | 日期 | 修订说明 | 状态 |
| --- | --- | --- | --- |
| v0.1 | 2026-08-24 | 根据七轮需求澄清形成首版 PRD | 已评审 |
| v0.2 | 2026-08-24 | DeepSeek 根据首轮评审补充规则、契约及工程细节 | 未通过终审 |
| v0.3 | 2026-08-24 | 恢复确认基线；修正事件分类、存储、状态同步、指标口径、告警不变性、聚合、双时钟及通用研判 | 待终审 |

### 2.1 v0.3关键修订

1. 恢复已确认的八类 P0 监测事件，现有四类管控事件改为子类型映射。
2. 将现有 Severity 更名为“管控侧事件严重度”，明确并非法定等级。
3. 恢复 IndexedDB 为监测业务数据 P0 存储；localStorage 仅保存偏好，现有智能管控快照不强制迁移。
4. 将今日流量指标与当前存量指标分开计算。
5. 增加事件级管控生命周期，禁止用预案状态直接关闭监测事件。
6. 增加 MonitoringEventUpdate、messageId、correlationId、streamSequence 和 expectedVersion。
7. 拆分 Alarm、AlarmDeliveryReceipt 和派生投影，保持原始告警不可变。
8. 修正初次聚合与聚合后拆分规则，补充方向、车道、设施和目标特征。
9. 通用安全研判不再生成空参数可执行措施，改为 PlanningGap。
10. 演示案例与监测数据隔离；业务 SLA 使用真实运行时钟，不随模拟倍速变化。

## 3. 项目背景

现有系统已经形成事件接入、归并、图谱推理、交通流计算、预案生成、人工复核、指令下发、执行跟踪和终报审计闭环，但事件主要由演示案例或人工上报直接进入研判，缺少对视频 AI 原始告警进行持续接收、去重聚合、人工核实、等级判断和接管移交的前置业务层。

事件监测模块用于把算法发现转化为可信监测事件；一般事件在监测模块内持续观察并关闭，严重事件通过标准接管契约进入智能管控。

## 4. 建设目标

1. 建立 Alarm、MonitoringEvent、ControlEvent 三层业务模型。
2. 建立以视频检测结果卡片和视频证据为中心的监控员核实工作台。
3. 支持精确去重、候选聚合、事实冲突、拆分、误报和订正留痕。
4. 建立 L1～L4 内部监测等级和分级核实时限。
5. 实现 L3 人工接管、人工确认 L4 后自动接管。
6. 实现幂等接管、双向增量同步、事件级关闭回写和断线补拉。
7. 提供 GIS 事件空间分布和聚集态势大屏。
8. 以统一模拟适配器完成可重复运行、可测试的前端 MVP。

核心成功链路：

    模拟视频告警
      → 去重与聚合
      → 视频核实
      → 人工分级
      → 一般事件闭环 / 严重事件接管
      → 智能管控状态回写

## 5. 产品定位与边界

事件监测负责把“告警”变成“可信事件”；智能管控负责把“严重事件”变成“可执行处置”。

监测等级 L1～L4 和现有管控侧事件严重度均为项目内部研判口径，不等同于法定事故等级或应急响应等级。系统不得自动执行交通控制措施。

## 6. 用户角色与数据权限

| 角色 | 核心职责 | 数据范围 |
| --- | --- | --- |
| 路网监测员 | 查看、核实、误报、订正、持续观察、确认等级、发起 L3 接管 | 授权路段及设施 |
| 监控班长 | 超时督办、强制转交、L4复核、L4观察审批、接管异常处理 | 本机构授权范围 |
| 指挥调度人员 | 接收管控事件，开展研判、预案、下发、执行和关闭 | 接管至本级的事件 |
| 系统管理员 | 数据源、设备、规则及权限配置 | 无业务核实权限 |

权限采用 RBAC 加机构数据范围。跨区域事件设置主责机构和协同机构；协同机构可补充证据，不可覆盖主责结论。本期使用顶部模拟用户切换器验证权限点。

## 7. 现状分析与技术决策

### 7.1 可复用能力

- 复用 App.tsx 作为一级模块容器。
- 复用 PanelFrame、FullscreenPanel、MonitorDrawer 和时间线组件。
- 复用 GisNetworkMap 及 src/gis 的地图、覆盖物、聚焦和主题能力。
- 接管后复用现有事件接入、归并、推理、交通流、预案、待办、执行和终报。
- 复用 merge.ts 的多维评分思想，但监测聚合和管控归并分别实现。
- 复用现有审计结构和降级不静默失败原则。

### 7.2 状态分层

- 公共应用状态：一级模块、当前身份和全局连接状态。
- 监测业务状态：Alarm、MonitoringEvent、核实任务、等级和接管关系。
- 监测 UI 状态：筛选、选中事件、滚动位置和 GIS 视角。
- 智能管控状态：保留现有 store.ts。
- 跨模块同步状态：接管、增量更新、待同步和游标。

新增监测逻辑放入 src/monitoring，不直接堆入现有单一 Store。

### 7.3 持久化决策

| 数据 | MVP存储 |
| --- | --- |
| 主题、声音和个人筛选偏好 | localStorage |
| 当前模块、选中项等临时 UI 上下文 | sessionStorage |
| Alarm、投递回执、监测事件、核实记录、接管记录、断线队列 | IndexedDB |
| 当前活跃投影和卡片列表 | 内存 Store |
| 现有智能管控运行快照 | 继续沿用现有 localStorage，不强制迁移 |

IndexedDB 为 P0。内存只保留 200 起活跃事件和近期投影；Alarm 1000 条是压测规模，不是持久化删除上限。数据只能从内存卸载，不得因达到前端窗口上限而删除持久记录。

## 8. 业务范围与事件类型

### 8.1 P0八类监测事件

| 编码 | 中文名称 | 说明 | 接管后的管控映射 |
| --- | --- | --- | --- |
| traffic_congestion | 交通拥堵 | 速度下降、排队增长或持续拥堵 | 交通流模型及通用研判 |
| traffic_accident | 交通事故 | 碰撞、侧翻等事故的上位类型 | 按事故子类型映射 E_追尾、E_侧翻或通用事故 |
| pedestrian_intrusion | 行人闯入 | 行人进入高速车行区域 | 通用安全研判 |
| wrong_way_driving | 车辆逆行 | 车辆反向行驶 | 通用安全研判 |
| reversing | 车辆倒车 | 高速主线或敏感区域倒车 | 通用安全研判 |
| abnormal_stop | 异常停车 | 非正常停车，原因可为故障、事故或未知 | 确认故障时映射 E_抛锚，否则通用研判 |
| fire | 火灾 | 车辆、道路或设施火情 | 有专属事实时映射危化/隧道规则，否则通用研判 |
| road_debris | 抛洒物 | 行车区域散落物或障碍物 | 通用安全研判 |

事件子类型和属性用于对接现有管控模型：

- 交通事故子类型：追尾、侧翻、其他碰撞。
- 异常停车原因：抛锚、事故后停车、主动停车、未知。
- 危化品不是监测一级类型，而是事件关键属性；确认泄漏后映射 E_危化泄漏。
- 火灾保留为独立监测类型，不得被危化品类型替代。

### 8.2 P1设施异常

- 隧道异常
- 桥梁异常
- 山体滑坡或边坡异常

本系统只接收专业平台输出的事件结论，不分析原始传感器波形。

### 8.3 优先级

P0完成完整视频监测、核实、一般事件关闭、GIS基础态势、接管和回写。P1增加雷视、设施平台、相邻摄像机、GIS热力排行、算法效果、跨机构协同和导出。P2接入真实平台、统一认证、服务端存储和生产通知。

## 9. 名词与术语

| 数据名 | 界面中文 | 定义 |
| --- | --- | --- |
| Alarm | 原始告警 | 来源系统产生并完成标准化的首次有效告警，不可原地改写 |
| AlarmDeliveryReceipt | 告警投递回执 | 每次消息投递的接收事实，用于幂等、重复计数和审计 |
| AlarmAssessment | 告警核实记录 | 对告警有效、无关或误报的追加式人工判断 |
| MonitoringEvent | 监测事件 | 一条或多条告警聚合后形成的核实对象 |
| ControlEvent | 管控事件 | 智能管控接收后建立的独立处置实例 |
| PlanningGap | 待补充处置项 | 无专属规则时提示人工补充的非执行对象 |
| 接管快照 | 接管快照 | 接管时不可变的确认事实、上下文和证据摘要 |

界面只使用中文主名，英文名称仅用于代码和接口。

## 10. 总体业务流程

    原始来源消息
      → 写入投递回执
      → 幂等判断
      → 标准化有效 Alarm
      → 候选聚合
      → MonitoringEvent
      → 人工核实
          ├─ 已误报
          ├─ 核实中·持续观察
          └─ 已确认
              ├─ L1/L2持续监测、解除、关闭
              ├─ L3建议接管、人工发起
              └─ 人工确认L4后自动发起
      → ControlEvent
      → 智能管控处置
      → 事件级状态回写

## 11. 信息架构

    路网综合管控智能体
    ├─ 事件监测
    │  ├─ 视频事件监测
    │  │  ├─ 工作指标
    │  │  ├─ 筛选与事件卡片
    │  │  └─ 核实详情
    │  │     ├─ 视频核实
    │  │     ├─ 关联告警
    │  │     ├─ 事件信息
    │  │     ├─ 核实记录
    │  │     └─ 关联处置
    │  └─ GIS态势感知
    └─ 智能管控

## 12. 页面结构与导航

一级导航为“事件监测/智能管控”，默认进入“事件监测—视频事件监测”。切换模块不清空另一个模块的数据，且恢复筛选、滚动、选中事件和地图视角。

视频事件页采用指标、筛选、卡片网格布局。1920px每行4张，1440/1366px每行3张，1280px每行2张。详情为60%～70%宽幅抽屉并支持全屏。

GIS作为独立视图。P0支持事件点、聚合、筛选、定位和全屏；热力、区域排行和时段趋势为P1。

加载智能管控案例默认不得清空监测数据。整体重置仅允许在演示模式通过“重置全部演示数据”执行，并需二次确认；不得影响生产数据命名空间。

## 13. 功能需求清单

| 编号 | 功能 | 优先级 |
| --- | --- | --- |
| FR-EM-001 | 模块导航与工作指标 | P0 |
| FR-EM-002 | 告警接收与标准化 | P0 |
| FR-EM-003 | 去重、聚合、冲突和拆分 | P0 |
| FR-EM-004 | 视频事件列表、筛选与实时新增 | P0 |
| FR-EM-005 | 视频证据与事件核实 | P0 |
| FR-EM-006 | 核实任务、状态机和计时 | P0 |
| FR-EM-007 | 监测等级与人工复核 | P0 |
| FR-EM-008 | GIS事件态势 | P0/P1 |
| FR-EM-009 | 严重事件接管 | P0 |
| FR-EM-010 | 双向同步与订正 | P0 |
| FR-EM-011 | 持久化、断线和恢复 | P0/P1 |
| FR-EM-012 | 权限与审计 | P0 |
| FR-EM-013 | 算法效果与运营指标 | P1 |

## 14. FR-EM-001 模块导航与工作指标

| 项目 | 需求 |
| --- | --- |
| 用户故事 | 监控员进入系统即可看到待核实视频事件，并能切换智能管控。 |
| 入口 | 顶部一级Tab、事件监测二级视图、指标卡。 |
| 主流程 | 默认视频监测；加载当前存量和今日流量指标；切换时保存UI上下文。 |
| 异常 | 指标失败显示暂不可用，不阻断事件列表。 |
| 权限 | 指标只统计用户授权范围。 |
| 留痕 | 页面切换不写业务审计；导出需审计。 |
| 验收 | 刷新恢复视图；点击指标生成正确筛选；跨模块数据不被清空。 |
| 可能文件 | App.tsx、RuntimeBar.tsx、monitoring/uiState.ts、index.css |

指标口径：

| 指标 | 口径 |
| --- | --- |
| 今日检测 | detectedAt处于当前自然日的有效Alarm数 |
| 当前待核实 | 当前verificationStatus为pending的活跃事件 |
| 当前核实中 | 当前verificationStatus为verifying的活跃事件 |
| 今日已确认 | confirmedAt处于当前自然日的事件数 |
| 今日已误报 | falsePositiveAt处于当前自然日的事件数 |
| 当前核实超时 | 当前已超时且尚未完成核实的事件数 |
| 今日已接管 | takenOverAt处于当前自然日的事件数 |
| 当前接管处置中 | 已接管且事件级状态尚未resolved/closed的事件数 |

## 15. FR-EM-002 告警接收与标准化

| 项目 | 需求 |
| --- | --- |
| 用户故事 | 系统将异构来源消息转化为可追溯的标准告警。 |
| 输入 | 来源、消息ID、来源告警ID、算法版本、时间、位置、类型、置信度和证据引用。 |
| 主流程 | 写投递回执→幂等判断→字段映射→关键字段校验→写不可变Alarm。 |
| 分支 | 人工补报走同一标准化入口；P1专业平台使用适配器映射。 |
| 异常 | 类型、时间或位置等关键字段缺失时不得编造默认值；标记invalid并进入失败队列。 |
| 输出 | Alarm、AlarmDeliveryReceipt或标准化失败记录。 |
| 留痕 | 接收、重复、解析失败、字段无效和位置异常全部审计。 |
| 验收 | 重复消息不生成第二个Alarm；关键字段无效不进入自动聚合。 |
| 可能文件 | monitoring/adapter.ts、normalize.ts、domain/monitoring.ts |

本期由 DemoMonitoringAdapter 产生模拟视频告警、关键帧、可选短视频占位和故障注入，全部携带simulation标识。

## 16. FR-EM-003 去重、聚合、冲突与拆分

### 16.1 精确去重

同一 sourceSystem、sourceAlarmId 或幂等 messageId 的重复投递只创建一个Alarm。每次投递均追加AlarmDeliveryReceipt；重复次数由投影计算，不修改原Alarm。

### 16.2 初次聚合评分

| 维度 | 权重 | 规则摘要 |
| --- | ---: | --- |
| 空间/设施 | 0.25 | 同设施ID或同路近距离高分；异设施为0 |
| 时间 | 0.20 | 1分钟内1.0；5分钟内0.7；15分钟内0.4 |
| 类型相容 | 0.20 | 同类1.0；父子/相容类型0.7；不相容0 |
| 方向 | 0.10 | 同向1.0；未知0.8；反向0 |
| 设备覆盖 | 0.10 | 同设备覆盖或相邻覆盖区高分 |
| 车道/目标 | 0.10 | 同车道、同目标轨迹或同车辆特征高分 |
| 来源独立性 | 0.05 | 独立来源佐证1.0；同源不同检测0.5 |

总分大于等于0.75自动聚合；0.45至0.75进入人工比对；低于0.45独立建事件。权重和阈值集中配置。

方向相反、设施ID不同或事件类型明确不相容时禁止自动聚合。伤亡、车辆数、危化品等事实冲突不静默覆盖，降为人工比对，由监控员决定合并或拆分。

### 16.3 聚合后拆分

位置漂移超过1km不直接用于否决初次候选。只有聚合后出现两个独立来源持续指向不同位置或目标轨迹，并满足独立演化条件时才强制拆分。拆分保留原聚合关系、依据和审计。

事件级综合可信度单独计算，不得简单取最高Alarm置信度。

## 17. FR-EM-004 视频事件列表与筛选

卡片展示视频封面、事件类型、核实状态、建议等级、道路方向桩号、摄像机、检测时间、AI置信度、关联告警数、超时、冲突、模拟和接管标识。

筛选包括事件类型、核实状态、等级、道路、方向、设备、置信度、检测时间、超时、冲突、接管和关键词。默认排序为核实超时、严重事件、待核实、检测时间倒序。

用户位于列表顶部时直接插入新事件；用户向下浏览时显示“新增N条”，不得改变滚动位置或关闭当前详情。MVP在1000条Alarm、200起活跃事件下组合筛选平均不超过500ms。

## 18. FR-EM-005 视频证据与事件核实

详情页签为视频核实、关联告警、事件信息、核实记录和关联处置。核实结果包括确认事件、判定误报、信息不足持续观察。

AI值和人工确认值分别展示。允许修正事件类型、位置、方向、车道、车辆、伤亡、危化品、等级和备注。历史结论只追加订正，不覆盖。

视频失败时展示关键帧、算法信息和文字证据；证据过期显示归档状态。证据只保存evidenceId和受控引用，车牌默认脱敏、人脸默认模糊。

## 19. FR-EM-006 核实任务、状态机与计时

核实主状态：

    pending
      → verifying
          ├─ manual_review
          └─ observation
      → confirmed / false_positive

查看不占用任务；点击开始核实后建立独占任务。持续观察释放占用，设置nextReviewAt，并允许其他监控员重新占用。新证据或复核到期后事件重新置顶。

首次核实目标：L4为1分钟、L3为3分钟、L2为5分钟、L1为10分钟。持续观察默认复核：L4经班长批准不超过1分钟、L3为3分钟、L2为5分钟、L1为10分钟。连续两次仍信息不足时升级班长。

### 19.1 双时钟

- eventTime：模拟案例或来源事件发生时间，可受模拟倍速影响。
- operationalTime：核实、接管和操作SLA时间，基于真实单调时钟，不受暂停及倍速影响。
- displayTime：页面展示时间，根据模式格式化。

今日指标依据事件和状态变更的业务时间字段；操作SLA一律依据operationalTime。

## 20. FR-EM-007 监测等级与人工复核

### 20.1 建议等级

| 等级 | 确定性触发规则 |
| --- | --- |
| L4严重 | 已知伤亡；危化品泄漏或高风险疑似；隧道确认火灾；桥梁垮塌；重大滑坡阻断；全幅封闭；关键节点失效 |
| L3较重 | 占用车道不少于2或比例不少于2/3；确认行人、逆行或倒车；敏感设施内事故/火情/异常停车；拥堵持续不少于10分钟且队列不少于3km，或30分钟内将到达已配置关键节点；次生风险明确扩大 |
| L2一般 | 单车道受影响；一般事故无伤亡；异常停车或抛洒物持续存在；已确认拥堵但未达到L3 |
| L1提示 | 信息不足、单一低置信告警或未命中更高规则 |

“关键节点”“敏感设施”和交通阈值必须来自配置数据。数据缺失时输出依据不足，不得自行补默认。

AI和规则只生成suggestedLevel；人工确认confirmedLevel。L3/L4降级必须填写依据，L4降级、误报和持续观察须班长复核或批准。新证据只更新建议等级并生成复核任务，不静默覆盖人工等级。

### 20.2 与管控侧严重度关系

现有engine/severity.ts输出“管控侧事件严重度”，仅用于项目内部排序和展示，并非法定等级。接管时依据已确认事实重新调用assessSeverity，不直接由L1～L4赋值。两套字段独立展示和审计。

## 21. FR-EM-008 GIS事件态势

P0支持事件点、聚合、类型/状态/等级筛选、卡片互相定位和全屏。GIS失败不影响视频列表与核实。

P1支持热力图、区域排行、类型分布和时段趋势。所有GIS数据受机构范围过滤，模拟点位必须显示模拟标识。

## 22. FR-EM-009 严重事件接管

L1/L2默认不接管。L3满足复合条件时生成可解释接管建议，由监控员发起；不接管必须填写理由。仅AI建议L4时不自动接管，人工确认L4后自动发起，但不自动执行控制措施。

状态为持续监测、待接管、接管中、已接管或接管失败。每次请求生成handoffId和idempotencyKey；技术错误最多自动重试3次且复用同一幂等键。重复事件返回已有controlEventId。

接管成功后不强制切换，提供“查看智能管控”和“继续事件监测”。

## 23. FR-EM-010 双向同步与订正

### 23.1 监测到管控

    interface MonitoringEventUpdate {
      messageId: string
      correlationId: string
      streamSequence: number
      monitoringEventId: string
      controlEventId: string
      expectedControlEventVersion?: number
      monitoringEventVersion: number
      occurredAt: string
      updateType:
        | 'evidence_added'
        | 'facts_corrected'
        | 'level_changed'
        | 'resolution_reported'
        | 'false_positive_review_requested'
      changedFacts?: Partial<ConfirmedEventFacts>
      evidence?: EvidenceSummary[]
      reason: string
      simulation: boolean
    }

关键事实订正触发重新研判；普通证据只更新时间线。已接管事件不能由监测侧直接误报或关闭，只能发起订正或复核申请。

### 23.2 管控到监测

    interface ControlEventUpdate {
      messageId: string
      correlationId: string
      streamSequence: number
      controlEventId: string
      handoffId: string
      controlEventVersion: number
      occurredAt: string
      eventLifecycleStatus:
        | 'handling'
        | 'resolved'
        | 'closed'
        | 'correction_required'
        | 'false_positive_confirmed'
      controlPhase:
        | 'ingested'
        | 'reasoning'
        | 'planning'
        | 'review'
        | 'executing'
        | 'closing'
        | 'closed'
      planVersion?: number
      planState?: string
      pendingMeasureCount?: number
      executionProgress?: string
      closureDecision?: {
        decisionId: string
        decidedAt: string
        decidedBy: string
        reason: string
      }
      simulation: boolean
    }

只有eventLifecycleStatus和closureDecision可改变监测事件的解除、关闭或订正状态。planState仅作为处置次级信息；预案已完成、已作废或已被替换均不得直接关闭、恢复或证伪MonitoringEvent。

messageId用于消息幂等，streamSequence用于全局断线补拉，实体版本用于顺序仲裁，expectedVersion用于写操作乐观锁。

## 24. 跨模块接管契约

    interface HandoffRequest {
      messageId: string
      correlationId: string
      handoffId: string
      idempotencyKey: string
      monitoringEventId: string
      monitoringEventVersion: number
      requestedAt: string
      requestedBy: {
        mode: 'user' | 'rule'
        userId?: string
        ruleIds: string[]
      }
      confirmedFacts: ConfirmedEventFacts
      context: TrafficAndFacilityContext
      evidence: EvidenceSummary[]
      conflicts: FactConflict[]
      rationale: {
        level: 'L3' | 'L4'
        reasons: string[]
        reviewerId?: string
      }
      simulation: boolean
    }

    interface HandoffResult {
      messageId: string
      correlationId: string
      handoffId: string
      status: 'accepted' | 'rejected' | 'duplicate' | 'failed'
      controlEventId?: string
      controlEventVersion?: number
      acceptedAt?: string
      errorCode?: string
      errorMessage?: string
      retryable: boolean
    }

## 25. 数据模型

    interface Alarm {
      alarmId: string
      sourceAlarmId: string
      sourceType: SourceType
      sourceSystem: string
      eventType: MonitoringEventType
      eventSubtype?: string
      detectedAt: string
      firstReceivedAt: string
      location: EventLocation
      confidence?: number
      algorithmVersion?: string
      modelName?: string
      rawPayloadRef: string
      evidenceIds: string[]
      simulation: boolean
    }

    interface AlarmDeliveryReceipt {
      receiptId: string
      messageId: string
      sourceSystem: string
      sourceAlarmId: string
      receivedAt: string
      result: 'created' | 'duplicate' | 'invalid'
      alarmId?: string
      errorCode?: string
    }

    interface AlarmAssessment {
      assessmentId: string
      alarmId: string
      result: 'valid' | 'unrelated' | 'false_positive'
      reason: string
      assessedBy: string
      assessedAt: string
    }

    interface MonitoringEvent {
      monitoringEventId: string
      version: number
      alarmIds: string[]
      eventType: MonitoringEventType
      location: EventLocation
      suggestedLevel: MonitoringLevel
      confirmedLevel?: MonitoringLevel
      verificationStatus: VerificationStatus
      verificationMode?: VerificationMode
      lifecycleStatus: MonitoringLifecycle
      verificationOwnerId?: string
      nextReviewAt?: string
      observationCount: number
      conflicts: FactConflict[]
      controlEventId?: string
      handoffId?: string
      detectedAt: string
      confirmedAt?: string
      falsePositiveAt?: string
      takenOverAt?: string
      resolvedAt?: string
      closedAt?: string
      updatedAt: string
      simulation: boolean
    }

## 26. 接口与模拟适配器

生产目标采用REST查询/操作、WebSocket推送和受控视频地址。本期接口由DemoMonitoringAdapter本地实现，但签名与生产契约隔离。

    interface MonitoringSourceAdapter {
      connect(): Promise<void>
      disconnect(): Promise<void>
      startScenario(scenarioId: string, seed: number): Promise<void>
      pause(): void
      resume(): void
      reset(scope: 'monitoring_demo' | 'all_demo'): Promise<void>
      injectFailure(kind: string): void
      subscribe(handler: MonitoringMessageHandler): () => void
      queryEvents(query: EventQuery): Promise<EventPage>
      getEventDetail(eventId: string): Promise<MonitoringEventDetail>
      pullAfter(cursor: number): Promise<MonitoringMessage[]>
    }

DemoMonitoringAdapter的连接中断、补拉和视频失败均由故障注入演示，不假装已经建立真实WebSocket。

## 27. FR-EM-011 持久化、断线与恢复

业务操作写入IndexedDB后更新内存投影。断线保留已有列表和数据时间；操作进入待同步队列。恢复后按streamSequence补拉，再按messageId和实体版本幂等合并。

刷新恢复业务现场和UI上下文。未提交核实表单存sessionStorage并提示恢复。IndexedDB不可用时回退内存并显示“当前仅保存在内存，本次可能不留痕”，不得静默成功。

监测演示数据和生产数据使用不同数据库或命名空间。清理演示数据需明确操作和二次确认。

## 28. FR-EM-012 权限与审计

权限点至少包括核实、L4误报复核、L4降级复核、L4观察审批、接管重试、任务转交、证据原图查看和导出。

原始告警、投递回执、核实、订正、等级、观察、转交、接管、同步、下载、失败和重试全部追加审计。系统管理员没有核实权限。越权操作在状态层再次校验，不能只依靠隐藏按钮。

## 29. 异常与降级

- 无事件时显示空状态和重置筛选。
- GIS失败不影响视频列表和核实。
- 视频失败降级关键帧和文字证据。
- AI服务中断保留人工补报和历史核实。
- 管控不可用时保留核实结果并显示接管失败。
- 证据过期显示已归档。
- 版本冲突显示字段差异并禁止旧数据覆盖。
- 大量重复投递只增加回执和派生计数，不重复发声。

通用安全研判只能输出事实摘要、风险提示、非执行建议和PlanningGap。PlanningGap不得进入措施确认或下发队列；人工补充完整措施并通过参数、来源和复核级别校验后，才能成为可执行Measure。

## 30. 非功能需求

| 指标 | 生产目标 | MVP验收 |
| --- | ---: | ---: |
| 告警接收 | 持续20条/s，峰值100条/s | 持续5条/s，峰值20条/s |
| 活跃事件 | 5000起 | 200起 |
| 模拟告警 | — | 1000条 |
| 首屏可交互 | 不超过3s | 不超过3s |
| 新事件显示 | 不超过2s | 不超过1s |
| 组合筛选 | 不超过1s | 平均不超过500ms |
| 详情打开 | 不超过2s | 平均不超过1s |
| 接管反馈 | 不超过3s | 不超过3s或进入查询确认 |
| GIS | 万级聚合 | 1000点聚合 |
| 稳定性 | 99.9%目标 | 连续2小时无崩溃 |

MVP性能测试使用固定随机种子，在记录CPU、内存、浏览器和构建版本的参考机执行。筛选和详情各测5次，报告平均值和P95。

内存测试在预热完成及浏览器自然GC后记录基线；2小时后使用相同采样条件，稳定堆增长不超过100MB。无法使用performance.memory时，使用Chrome DevTools内存快照替代，并在报告中说明。

浏览器支持最新版及前一个主要版本的Chrome和Edge；主分辨率1920×1080，最低验收宽度1280px。手机端不纳入本期验收。

## 31. FR-EM-013 算法效果与运营指标

P1按算法名称、版本、来源和事件类型统计人工确认率、误报率、样本量及人工标注覆盖率。样本不足时显示“样本不足”，不得输出结论性准确率。置信度平均值不得称为准确率。

## 32. 验收标准

1. Given同一来源告警重复投递10次，When系统接收，Then只创建一个Alarm和10条投递回执，派生重复次数为9。
2. Given同摄像机短时间检测同一异常，When聚合评分不低于0.75且无硬冲突，Then只生成一个事件卡片。
3. Given用户仅打开详情，When未点击开始核实，Then不建立核实占用。
4. Given用户A已占用事件，When用户B提交核实，Then系统拒绝并展示当前核实人。
5. Given提交持续观察，When保存成功，Then释放占用、设置复核时间且可被他人重新占用。
6. Given持续观察收到新证据，When消息到达，Then立即置顶并标记待复核。
7. GivenAI建议L3而人工确认为L2，When提交，Then分别保存并记录调整依据。
8. GivenL4申请误报、降级或持续观察，When班长未批准，Then不得生效。
9. GivenL3满足接管规则，When规则求值，Then显示逐条依据且不自动接管。
10. Given人工确认L4，When核实提交成功，Then自动发起接管但不自动下发措施。
11. Given同一接管重复点击和重试，When管控接收，Then只产生一个ControlEvent。
12. Given接管成功，When用户留在监测模块，Then监测事件保留并显示关联及处置次级状态。
13. Given预案被作废或替换，When管控回写，Then不得据此关闭或恢复监测事件。
14. Given事件级closureDecision回写，When版本有效，Then监测事件按决定解除或关闭。
15. Given已接管事件，When监控员直接误报或关闭，Then系统拒绝并引导提交订正。
16. Given视频失败，When打开详情，Then关键帧和文字证据仍可支持核实。
17. GivenGIS失败，When进入视频监测，Then列表、详情和核实仍可使用。
18. Given1000条Alarm和200起活跃事件，When组合筛选，Then参考机平均响应不超过500ms并报告P95。
19. Given页面连续运行2小时，When模拟流持续推送，Then无崩溃且稳定堆增长不超过100MB。
20. Given模拟数据，When在卡片、详情和GIS展示，Then均显示模拟标识。
21. Given两个独立来源在聚合后持续指向相距超过1km的位置，When满足独立演化条件，Then拆分事件并保留历史关系。
22. Given告警达到内存活动窗口上限，When旧数据卸载，ThenIndexedDB中的原始记录和审计仍可查询。
23. Given断线后发生本地核实，When恢复连接，Then按全局游标补拉且不重复、不覆盖新版本。
24. Given通用安全研判缺少专属措施，When生成结果，Then只产生PlanningGap，不产生空参数可执行措施。
25. Given加载智能管控案例，When未执行全部重置，Then监测模块现有数据保持不变。
26. Given模拟时钟暂停或加速，When核实倒计时运行，ThenSLA仍按真实运行时钟连续计算。

## 33. 典型验收场景

1. 异常停车：12条连续告警聚合为1起L2事件，车辆驶离后解除并关闭。
2. 行人误报：确认阴影或标识误报，Alarm保留并追加核实标签。
3. 抛洒物持续观察：新证据提前触发复核，确认L3并建议接管。
4. 隧道交通事故：多源证据和两车道受阻，人工发起L3接管。
5. 隧道火灾：人工确认L4后自动接管，首次超时后以同一幂等键重试成功。
6. 交通拥堵：交通运行数据生成拥堵事件，未达L3时在监测侧持续跟踪和关闭。

## 34. 研发影响范围

- App.tsx：一级模块容器。
- RuntimeBar.tsx：拆分公共操作与智能管控专属操作。
- src/monitoring：领域模型、Store、适配器、聚合、等级、核实状态机、接管、同步、指标和UI状态。
- src/gis及GisNetworkMap：监测图层、聚合和跨视图定位。
- domain/event、audit、dataset：跨模块关系和审计扩展。
- engine/ingest、severity、tms及现有Store：接管适配和重新研判。
- services/persistence：新增IndexedDB监测存储，不破坏现有RuntimeSnapshot。

聚合、等级、状态机、接管、同步和指标均实现为纯函数并补充Vitest。

## 35. 风险、依赖及待决事项

### 35.1 依赖

- 真实视频告警样例和类型编码。
- 摄像机、路段、隧道、桥梁和边坡数据。
- 六个案例所需的合法、脱敏素材。
- 视频协议、编码和证据授权方式。
- 数据保留、统一认证和机构权限制度。
- 新增事件类型的专属管控规则。

### 35.2 风险

- 真实接口未确定，后续字段可能变化。
- 高频告警对前端投影和地图渲染产生性能压力。
- 新类型缺少专属推理规则。
- 视频授权、并发核实和生产审计依赖后端。
- 专业设施异常依赖外部平台。

### 35.3 待决事项

- 数据保留期限最终值。
- 真实AI、设施及第三方接口协议。
- 生产通知渠道。
- 统一认证和跨机构协同规则。
- Word版产品方案条款的最终逐段复核。

待决事项不阻塞前端MVP，但必须通过接口契约、配置项或待确认标识隔离。

## 36. 本期不实现

- 真实生产视频AI、真实视频流和专业平台接入。
- 真实统一身份认证、服务端数据库和对象存储。
- 桥梁、边坡和隧道原始传感器诊断。
- 自动执行交通控制措施。
- 法定事故等级自动认定。
- 手机端完整核实。
- 使用模拟数据宣称真实算法准确率。
- 新增类型的完整专属推理规则。
- 空参数措施进入确认或下发队列。

