const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sourcePath = path.join(__dirname, 'generate_event_monitoring_solution_v13_solution_first.js');
let source = fs.readFileSync(sourcePath, 'utf8');

const diagramPairs = [
  ['数据接入','流量、轨迹、站汇总、拓扑','可信数据准备','流量、轨迹、拓扑、上下文'],
  ['质量门控','缺失、零值、突跳、连续性','双维质量判断','DataHealth、证据可信度'],
  ['可观测分流','A/B守恒；C传播；D治理','分级分析','A/B守恒；C传播；D治理'],
  ['特征计算','动态时延、残差、趋势、变点','异常识别','积压、传播、变点、持续'],
  ['算法检测状态','正常、低可信、积压、拥堵、容量下降','证据融合','状态、等级、置信度、解释'],
  ['业务事件服务','去重合并、证据链、业务状态','告警与状态管理','合并、证据链、业务状态'],
  ['视频复核与处置','确认/驳回、处置、关闭','大屏人工复核','10分钟提醒、确认、关闭'],
  ['统一事件真值','高可信、弱标签、设备异常','真值回流','高/中/弱标签、设备异常'],
  ['离线评估校准','事件级指标、误报归因、版本','离线评估迭代','双重对照、归因、版本'],
  ['试点与扩面','候选路线、静默运行、门禁','试点决策','代表区间、效果门禁、扩面']
];

for (const [a,b,c,d] of diagramPairs) {
  source = source.replace(
    `replaceText("['${a}','${b}']", "['${c}','${d}']");`,
    `replaceText("'${a}','${b}'", "'${c}','${d}'");`
  );
}

// 附录连续排版，避免上一附录仅剩少量尾行后强制换页。
for (const title of [
  '附录C 分层判别规则与典型场景',
  '附录E 数据拓扑、去重与质量规则',
  '附录G 平台开发门禁与责任矩阵'
]) {
  source = source.replace(`h1('${title}',true)`, `h1('${title}')`);
}

// 在运行时修改基础文档：目录域本身已分页，不再额外插入一个空白页。
source = source.replace(
  'const bodyStart = src.indexOf',
  `replaceText("new Paragraph({children:[new PageBreak()]}),...c", "...c");\n\nconst bodyStart = src.indexOf`
);

vm.runInNewContext(source, {
  require,
  process,
  console,
  Buffer,
  setTimeout,
  clearTimeout,
  __dirname,
  __filename: sourcePath
}, { filename: sourcePath });
