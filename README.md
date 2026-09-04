# 路网综合管控智能体 MVP

面向高速公路运行监测与应急处置的交互式产品原型。项目以事件为主线，串联事件接入与归并、事理图谱推理、交通流计算、管控预案生成、人工复核、指令下发、执行跟踪和审计留痕，用于产品方案验证、业务演示与前端研发联调。

> 当前路网、桩号、设备、资源、交通流及现场素材均为演示或仿真数据，不可作为导航、测绘、生产调度或真实应急决策依据。

## 核心能力

- 事件上报、AI 结构化接报、事件归并与多事件分诊。
- 独立的事件监测工作台：24 条默认待核实模拟事件、类型筛选、证据预览、人工核实、权限门禁、核实历史和 GIS 态势。
- L4 自动接管与复合 L3 人工接管；通过本地桥接和消息总线把核实结果同步到智能管控，保留幂等、版本与顺序语义。
- 五步推理、条件求值、跨事件冲突校验、资源链推理和交通流计算。
- 管控预案 V1/V2 版本演进，以及确认、打回、作废、证伪和超时升级。
- 基于高德地图的事件、路网设施、处置资源、拥堵与雷视融合孪生展示。
- 五个可重复加载的典型案例，覆盖分流冲突、资源挤兑、条件组合、撤销传导和方案自引用。
- 处置指令回执、交通响应回写、态势简报、事件终报、审计及 JSONL 数据集导出。
- 可选的 Qwen、DeepSeek、Kimi 或 OpenAI 兼容大模型增强；调用失败时自动回退至本地模板。

## 技术栈

| 分类 | 技术 |
| --- | --- |
| 前端 | React 19、TypeScript 6、Vite 8 |
| 状态与样式 | Zustand 5、Tailwind CSS 4、全局 CSS 变量 |
| GIS 与图表 | 高德地图 JavaScript API 2.0、Recharts 3 |
| 工程质量 | Oxlint、Vitest、TypeScript、Vite Build |

## 快速开始

环境要求：Node.js `^20.19.0` 或 `>=22.12.0`，并随 Node.js 安装 npm。

### Windows 一键启动

双击 [`demo/一键启动.bat`](demo/一键启动.bat)。脚本会检查运行环境、在首次运行时安装依赖、启动开发服务器并打开浏览器。

### 命令行启动

```bash
cd demo
npm ci
npm run dev
```

浏览器默认访问：<http://127.0.0.1:5173>

若 PowerShell 的执行策略阻止运行 `npm.ps1`，可将上述命令中的 `npm` 替换为 `npm.cmd`。

## 可选服务配置

应用不配置外部服务也可体验本地模板和核心业务流程；地图底图及大模型增强需要单独配置。

复制 `demo/.env.local.example` 为 `demo/.env.local`，再按需补充或填写。示例文件当前预置 LLM 配置；如需高德地图，还需加入下列两个 `VITE_AMAP_*` 配置项：

```env
# 高德地图 JavaScript API 2.0
VITE_AMAP_KEY=your-amap-key
VITE_AMAP_SECURITY_JS_CODE=your-amap-security-code

# 大模型（以下为 Qwen 示例，也可在页面配置面板中设置）
VITE_LLM_PROVIDER=qwen
VITE_LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
VITE_LLM_MODEL=qwen-plus
VITE_LLM_TIMEOUT_MS=30000
VITE_LLM_API_KEY=your-api-key
VITE_LLM_QWEN_API_KEY=your-qwen-api-key
VITE_LLM_DEEPSEEK_API_KEY=your-deepseek-api-key
VITE_LLM_KIMI_API_KEY=your-kimi-api-key
```

项目也支持将 `demo/API KEY.txt` 中的 Qwen、DeepSeek、Kimi 密钥同步到 `.env.local`；`npm run dev` 前会自动执行同步脚本，也可手动运行 `npm run sync:llm-keys`。

安全提示：

- `.env.local`、`API KEY.txt` 已在 `demo/.gitignore` 中忽略，请勿将真实密钥提交到版本库。
- 前端环境变量会进入浏览器运行环境，仅适合本地演示；生产环境应通过服务端代理调用地图和大模型服务。
- 修改环境变量后需重启 Vite 开发服务器。

## 使用入口

启动后默认进入“事件监测”，可通过顶部一级 Tab 切换“态势驾驶舱 / 事件监测 / 智能管控”。

事件监测推荐流程：

1. 查看系统幂等补齐的 24 条默认模拟事件，按事件类型筛选并打开卡片。
2. 在“核实详情”中查看事件卡片、AI 建议和受控证据引用，主动领取核实任务。
3. 订正类型、位置和影响范围，确认等级、持续观察或判定误报；L3/L4 操作受模拟角色权限约束。
4. 对严重事件发起接管，并在“关联处置”或智能管控模块查看同步结果。

智能管控推荐流程：

1. 加载案例或上报事件，查看事件归并和分诊结果。
2. 在 GIS 中聚焦事件，观察拥堵、设施、资源和事件孪生态势。
3. 打开“图谱·计算”，查看推理路径、公式代入和参数来源。
4. 在预案及统一待办中完成复核、下发、打回或作废操作。
5. 推进模拟时钟，观察执行回执、交通响应、队列消散和终报生成。
6. 从审计与数据集入口导出处置过程记录。

五个案例的输入、时间线和预期结果见 [`事件案例/五个案例.md`](事件案例/五个案例.md)，完整操作说明见 [`demo/README.md`](demo/README.md)。

## 项目结构

```text
road_goven_mvp/
├─ demo/                 # 可运行的 React/Vite 前端及详细使用说明
│  ├─ public/            # 地图图标、监控图片和演示视频等静态资源
│  ├─ scripts/           # 本地配置同步脚本
│  └─ src/
│     ├─ components/     # 工作台面板与交互组件
│     ├─ data/           # 路网、设备、资源、案例及措施模板
│     ├─ domain/         # 事件、预案、审计等领域模型
│     ├─ engine/         # 推理、计算、归并、状态机等业务引擎
│     ├─ gis/            # 地图模型、覆盖物和高德地图适配
│     ├─ monitoring/     # 事件监测领域、Store、引擎、仓储、适配器、GIS 与组件
│     ├─ services/       # 持久化与大模型服务
│     └─ utils/          # 通用工具
├─ 产品文档/             # 产品方案、需求规格、Demo 规格和视觉稿
├─ 事件案例/             # 五个演示案例及现场视角素材
├─ AI评审意见/           # 历次代码审计、测试验收和 UI 评审记录
├─ 代码修改日志/         # 按日期维护的主要变更记录
├─ scripts/              # 文档生成、导出与校验辅助脚本
└─ tools/                # 文档生成等辅助工具
```

核心代码数据流：

```text
事件输入
  → Zustand Store
  → 归并 / 推理 / 条件 / 交通流 / 预案 / 状态机
  → 分诊 / GIS / 待办 / 执行回写 / 审计 / 数据集
```

## 开发与质量检查

以下命令均在 `demo/` 目录执行：

```bash
npm run lint        # Oxlint 静态检查
npm run test        # Vitest 单元测试
npm run build       # TypeScript 检查并生成生产构建
npm run check       # 依次执行 lint、test、build
npm run preview     # 本地预览生产构建
npm run audit:deps  # 使用官方 npm registry 检查依赖漏洞
```

开发约定：

- 领域类型放在 `src/domain`，纯业务算法放在 `src/engine`，组件主要负责交互与渲染。
- 地图业务状态优先沉淀到 `src/gis` 的共享模型，避免组件和地图各自计算产生偏差。
- 新增或修改纯函数时同步补充 Vitest 测试。
- 不在源码、案例、日志或导出物中写入真实密钥、生产电话号码和敏感调度数据。

当前验证快照（2026-09-03，`main` / `ac221aa`；业务代码仍为 `359f1de`）：事件监测定向回归 6 个测试文件、18 项用例通过；全量 Vitest 94 个测试文件、403 项用例通过；TypeScript 检查和 Vite 生产构建通过。Oxlint 无错误，仍有 2 条既有 React 警告（`EventTriageList.tsx` 的渲染期 `Date.now()` 与 `TrafficFlowMonitor.tsx` 的渲染期 ref 读取）。浏览器视觉、响应式、真实时延和连续 2 小时稳定性尚未完成当前验收。

## 相关文档

- [前端运行版详细说明](demo/README.md)
- [MVP 需求规格说明书](产品文档/路网综合管控智能体_MVP需求规格说明书_v1.0.md)
- [演示 Demo 开发规格](产品文档/路网综合管控智能体_演示Demo开发规格_v1.0.md)
- [五个演示案例](事件案例/五个案例.md)
- [测试验收及整改报告](AI评审意见/测试验收及整改报告_2026-08-05.md)
- [代码修改日志](代码修改日志/)
- [面向 AI 的项目 Harness](README_FOR_AI.md)

## 当前边界

本仓库当前为单机前端 MVP，业务数据主要由内置案例、人工输入和浏览器本地存储承载；尚未接入真实雷达、摄像机结构化数据、生产 GIS 服务、统一身份认证、真实指令下发通道及后端审计库。用于正式部署前，需补齐服务端安全代理、权限控制、数据治理、可观测性及生产系统接口。
