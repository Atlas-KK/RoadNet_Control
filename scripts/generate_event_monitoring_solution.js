const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  ImageRun, Header, Footer, AlignmentType, PageOrientation, LevelFormat,
  SectionType, TableOfContents, HeadingLevel, BorderStyle, WidthType,
  ShadingType, VerticalAlign, PageNumber, PageBreak
} = require('docx');

const outDir = path.resolve(process.argv[2] || 'output/event_monitoring_solution_v1.0');
fs.mkdirSync(outDir, { recursive: true });
const docxPath = path.join(outDir, '高速公路门架流量守恒异常事件识别技术方案_V1.0.docx');

const C = {
  navy: '17365D', blue: '2F75B5', cyan: 'DDEBF7', pale: 'F4F7FA',
  green: '70AD47', orange: 'ED7D31', red: 'C00000', gray: '666666',
  lightGray: 'E7E6E6', dark: '222222', white: 'FFFFFF', teal: '00A6A6'
};
const PAGE_W = 11906;
const PAGE_H = 16838;
const MARGIN = 1134;
const CONTENT_W = PAGE_W - MARGIN * 2;
const border = { style: BorderStyle.SINGLE, size: 4, color: 'B7C9D6' };
const borders = { top: border, bottom: border, left: border, right: border };

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function wrapSvgText(text, maxChars = 12) {
  const parts = [];
  let line = '';
  for (const ch of String(text)) {
    line += ch;
    if (line.length >= maxChars || ch === '；' || ch === '，') {
      parts.push(line);
      line = '';
    }
  }
  if (line) parts.push(line);
  return parts;
}

function svgText(x, y, text, opts = {}) {
  const { size = 24, fill = '#17365D', weight = 500, anchor = 'middle', maxChars = 14, lineHeight = 1.25 } = opts;
  const lines = wrapSvgText(text, maxChars);
  const startY = y - ((lines.length - 1) * size * lineHeight) / 2;
  return `<text x="${x}" y="${startY}" text-anchor="${anchor}" font-family="Microsoft YaHei, SimHei, Arial" font-size="${size}" font-weight="${weight}" fill="${fill}">${lines.map((l, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : size * lineHeight}">${escapeXml(l)}</tspan>`).join('')}</text>`;
}

function arrow(x1, y1, x2, y2, color = '#5B9BD5', dash = '') {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="4" ${dash ? `stroke-dasharray="${dash}"` : ''} marker-end="url(#arrow)"/>`;
}

async function makeBusinessFlow(file) {
  const boxes = [
    [60, 100, 240, 105, '数据采集', '门架、收费站、拓扑、设备状态'],
    [340, 100, 240, 105, '质量校验', '缺失、零值、突跳、延迟、识别偏差'],
    [620, 100, 240, 105, '边界守恒', '同步净流量差与历史偏差校正'],
    [900, 100, 240, 105, '传播检测', '动态时延、下游预测残差、变点'],
    [1180, 100, 240, 105, '证据融合', '持续性、历史罕见度、空间一致性'],
    [620, 330, 300, 115, '分层判别', '数据异常 / 积压 / 拥堵 / 容量下降 / 事件型'],
    [1020, 330, 300, 115, '告警生成', '区间、等级、置信分、证据与替代解释'],
    [1020, 560, 300, 115, '人工复核与处置', '视频确认、交警联动、处置反馈'],
    [620, 560, 300, 115, '事件闭环', '状态更新、解除告警、事件归档'],
    [220, 560, 300, 115, '样本沉淀', '真值、误报漏报、阈值与模型迭代']
  ];
  let body = '';
  for (const [x, y, w, h, title, sub] of boxes) {
    body += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="#F7FAFC" stroke="#5B9BD5" stroke-width="3"/>`;
    body += svgText(x + w / 2, y + 36, title, { size: 25, weight: 700, maxChars: 12 });
    body += svgText(x + w / 2, y + 78, sub, { size: 17, fill: '#555555', maxChars: 18 });
  }
  body += arrow(300, 152, 340, 152) + arrow(580, 152, 620, 152) + arrow(860, 152, 900, 152) + arrow(1140, 152, 1180, 152);
  body += arrow(1300, 205, 850, 330) + arrow(920, 388, 1020, 388) + arrow(1170, 445, 1170, 560);
  body += arrow(1020, 618, 920, 618) + arrow(620, 618, 520, 618);
  body += arrow(370, 560, 440, 235, '#70AD47', '10,8');
  body += svgText(490, 410, '反馈标注与迭代', { size: 18, fill: '#548235', weight: 700, maxChars: 12 });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="760" viewBox="0 0 1500 760"><defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#5B9BD5"/></marker></defs><rect width="1500" height="760" fill="#FFFFFF"/><text x="750" y="48" text-anchor="middle" font-family="Microsoft YaHei, SimHei" font-size="34" font-weight="700" fill="#17365D">门架流量异常识别业务闭环</text>${body}</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(file);
}

async function makeSequence(file) {
  const lanes = ['门架/收费站', '数据接入层', '实时计算层', '算法引擎', '事件服务', '监测人员'];
  const x = [120, 380, 640, 900, 1160, 1420];
  let body = '';
  lanes.forEach((lane, i) => {
    body += `<rect x="${x[i]-95}" y="75" width="190" height="58" rx="10" fill="${i % 2 ? '#DDEBF7' : '#E2F0D9'}" stroke="#5B9BD5" stroke-width="2"/>`;
    body += svgText(x[i], 110, lane, { size: 20, weight: 700, maxChars: 10 });
    body += `<line x1="${x[i]}" y1="133" x2="${x[i]}" y2="850" stroke="#A6A6A6" stroke-width="2" stroke-dasharray="8,8"/>`;
  });
  const msgs = [
    [0,1,185,'上报5分钟流量与设备状态'], [1,2,255,'清洗、对齐、拓扑映射'],
    [2,3,325,'发送窗口数据与质量标签'], [3,3,395,'计算守恒残差、传播残差、累计积压'],
    [3,4,480,'输出异常状态、等级、置信分与证据'], [4,5,550,'推送疑似事件型拥堵告警'],
    [5,4,630,'发起视频复核并更新处置状态'], [4,3,700,'回传事件真值与人工标签'],
    [3,3,770,'离线评估、阈值校准与模型迭代']
  ];
  for (const [a,b,y,label] of msgs) {
    if (a === b) {
      body += `<path d="M ${x[a]} ${y} h 105 v 45 h -105" fill="none" stroke="#ED7D31" stroke-width="3" marker-end="url(#arrowO)"/>`;
      body += svgText(x[a]+115, y+20, label, { size: 17, fill: '#9E480E', anchor: 'start', maxChars: 16 });
    } else {
      body += arrow(x[a], y, x[b], y, '#5B9BD5');
      body += svgText((x[a]+x[b])/2, y-12, label, { size: 17, fill: '#333333', maxChars: 18 });
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1540" height="900" viewBox="0 0 1540 900"><defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#5B9BD5"/></marker><marker id="arrowO" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#ED7D31"/></marker></defs><rect width="1540" height="900" fill="#FFFFFF"/><text x="770" y="42" text-anchor="middle" font-family="Microsoft YaHei, SimHei" font-size="34" font-weight="700" fill="#17365D">实时检测与事件闭环时序</text>${body}</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(file);
}

async function makeArchitecture(file) {
  const layers = [
    ['业务应用层', '#D9EAF7', ['路网监测大屏', '区间异常列表', '事件详情与证据链', '视频复核', '处置闭环', '统计评估']],
    ['服务中台层', '#E2F0D9', ['告警服务', '事件服务', '规则配置', '模型管理', '拓扑服务', '统一API']],
    ['算法引擎层', '#FFF2CC', ['质量检测', '守恒残差', '时延估计', '变点检测', '累计积压', '证据融合']],
    ['数据资产层', '#FCE4D6', ['实时明细', '5分钟主题表', '路网拓扑', '特征库', '事件真值库', '模型样本库']],
    ['接入计算层', '#E4DFEC', ['消息接入', '批量同步', '时间对齐', '流式窗口', '数据校验', '任务调度']],
    ['数据源层', '#EDEDED', ['门架流量', '收费站流量', '匝道拓扑', '设备状态', '视频/速度', '交警事件']]
  ];
  let body = '';
  layers.forEach((layer, idx) => {
    const y = 95 + idx * 120;
    body += `<rect x="50" y="${y}" width="170" height="90" rx="10" fill="#17365D"/><text x="135" y="${y+53}" text-anchor="middle" font-family="Microsoft YaHei, SimHei" font-size="22" font-weight="700" fill="#FFFFFF">${layer[0]}</text>`;
    body += `<rect x="235" y="${y}" width="1110" height="90" rx="10" fill="${layer[1]}" stroke="#7F8C8D" stroke-width="2"/>`;
    layer[2].forEach((item, j) => {
      const bx = 255 + j * 178;
      body += `<rect x="${bx}" y="${y+18}" width="158" height="54" rx="8" fill="#FFFFFF" stroke="#A6A6A6" stroke-width="1.5"/>`;
      body += svgText(bx+79, y+51, item, { size: 17, fill: '#333333', weight: 600, maxChars: 9 });
    });
    if (idx < layers.length - 1) body += arrow(790, y+112, 790, y+98, '#7F8C8D');
  });
  body += `<rect x="1375" y="95" width="120" height="690" rx="12" fill="#F4F7FA" stroke="#00A6A6" stroke-width="3"/>`;
  body += svgText(1435, 190, '横切能力', { size: 22, fill: '#008C8C', weight: 700, maxChars: 6 });
  body += svgText(1435, 430, '权限审计、配置治理、指标监控、日志追踪、数据安全、容灾运维', { size: 18, fill: '#555555', maxChars: 6, lineHeight: 1.55 });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1540" height="850" viewBox="0 0 1540 850"><defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#7F8C8D"/></marker></defs><rect width="1540" height="850" fill="#FFFFFF"/><text x="770" y="48" text-anchor="middle" font-family="Microsoft YaHei, SimHei" font-size="34" font-weight="700" fill="#17365D">门架流量异常事件监测技术架构</text>${body}</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(file);
}

function run(text, opts = {}) {
  return new TextRun({ text, font: opts.font || 'Microsoft YaHei', size: opts.size || 21, bold: !!opts.bold, color: opts.color || C.dark, italics: !!opts.italics });
}
function para(text = '', opts = {}) {
  const children = Array.isArray(text) ? text : [run(text, opts)];
  return new Paragraph({
    children,
    alignment: opts.align || AlignmentType.JUSTIFIED,
    spacing: { before: opts.before || 0, after: opts.after ?? 100, line: opts.line || 330 },
    indent: opts.firstLine === false ? undefined : { firstLine: opts.firstLine ?? 420 },
    keepNext: !!opts.keepNext,
    pageBreakBefore: !!opts.pageBreakBefore
  });
}
function h1(text, pageBreakBefore = false) { return new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore, keepNext: true, children: [run(text, { size: 32, bold: true, color: C.navy })] }); }
function h2(text) { return new Paragraph({ heading: HeadingLevel.HEADING_2, keepNext: true, children: [run(text, { size: 28, bold: true, color: C.blue })] }); }
function h3(text) { return new Paragraph({ heading: HeadingLevel.HEADING_3, keepNext: true, children: [run(text, { size: 24, bold: true, color: C.dark })] }); }
function bullet(text, level = 0) { return new Paragraph({ numbering: { reference: 'bullet-list', level }, spacing: { after: 80, line: 300 }, children: [run(text)] }); }
function numbered(text, level = 0) { return new Paragraph({ numbering: { reference: 'number-list', level }, spacing: { after: 80, line: 300 }, children: [run(text)] }); }
function equation(text) { return new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 120 }, children: [run(text, { font: 'Cambria Math', size: 22, color: C.navy })] }); }
function note(title, text, color = C.cyan) {
  return new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [CONTENT_W], rows: [new TableRow({ cantSplit: true, children: [new TableCell({ borders, width: { size: CONTENT_W, type: WidthType.DXA }, shading: { fill: color, type: ShadingType.CLEAR }, margins: { top: 140, bottom: 140, left: 180, right: 180 }, children: [para([run(title + '：', { bold: true, color: C.navy }), run(text)], { firstLine: false, after: 0 })] })] })] });
}
function table(headers, rows, widths, fontSize = 18) {
  const mkCell = (txt, width, header = false) => new TableCell({
    borders, width: { size: width, type: WidthType.DXA }, verticalAlign: VerticalAlign.CENTER,
    shading: header ? { fill: C.navy, type: ShadingType.CLEAR } : undefined,
    margins: { top: 90, bottom: 90, left: 100, right: 100 },
    children: [new Paragraph({ spacing: { after: 0, line: 260 }, alignment: header ? AlignmentType.CENTER : AlignmentType.LEFT, children: [run(String(txt), { size: fontSize, bold: header, color: header ? C.white : C.dark })] })]
  });
  const tRows = [new TableRow({ cantSplit: true, tableHeader: true, children: headers.map((h, i) => mkCell(h, widths[i], true)) })];
  rows.forEach(r => tRows.push(new TableRow({ cantSplit: true, children: r.map((v, i) => mkCell(v, widths[i])) })));
  return new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: widths, rows: tRows });
}
function imageBlock(file, width, height, caption) {
  return [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 140, after: 80 }, children: [new ImageRun({ type: 'png', data: fs.readFileSync(file), transformation: { width, height }, altText: { title: caption, description: caption, name: caption } })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 150 }, children: [run(caption, { size: 18, color: C.gray })] })
  ];
}

async function build() {
  const flowPng = path.join(outDir, '图1_业务闭环流程图.png');
  const seqPng = path.join(outDir, '图2_实时检测时序图.png');
  const archPng = path.join(outDir, '图3_技术架构图.png');
  await Promise.all([makeBusinessFlow(flowPng), makeSequence(seqPng), makeArchitecture(archPng)]);

  const content = [];
  content.push(
    h1('1 项目概述'),
    h2('1.1 建设背景'),
    para('高速公路路网运行监测已具备门架断面流量和收费站出入口流量等高覆盖、准实时数据，但现有应用通常停留在流量展示、同比环比和人工研判层面。为提升突发事件发现的及时性，本方案以相邻门架区间为最小分析单元，通过车辆守恒、流量传播和时序异常检测，识别车辆异常积累、下游通行能力下降及事件型拥堵迹象。'),
    para('方案面向产品经理和大数据算法工程师，既定义业务闭环、产品状态和告警解释，也明确数据拓扑、计算口径、特征指标、算法路径、工程架构、验证方法和MVP实施边界。'),
    note('核心定位', '系统输出“疑似积压、疑似拥堵、疑似容量下降、疑似事件型拥堵”等辅助研判结论。仅凭5分钟流量不能确认交通事故，事故确认必须依赖视频、交警、救援或人工核查。'),
    h2('1.2 建设目标'),
    bullet('建立“门架—匝道—收费站—方向—区间”统一路网拓扑，形成可计算的守恒边界。'),
    bullet('构建数据质量、流量守恒、传播残差、持续积压、空间一致性五类证据。'),
    bullet('形成从疑似异常发现、告警解释、人工复核、处置跟踪到样本回流的闭环。'),
    bullet('在无事故标签或标签稀缺的条件下，先实现可解释、可配置、可回测的MVP。'),
    bullet('为后续融合速度、旅行时间、视频和事件数据预留接口与模型升级空间。'),
    h2('1.3 建设范围与非目标'),
    table(['范围', '本期包含', '本期不承诺'], [
      ['空间范围', '相邻门架构成的单方向区间；可扩展到连续多区间', '复杂枢纽中无法闭合边界的精确车辆守恒'],
      ['数据范围', '5分钟门架流量、收费站进出流量、拓扑、设备状态', '在未接入速度或视频时直接确认事故原因'],
      ['业务范围', '异常发现、证据解释、复核、处置状态和样本沉淀', '替代交警或运营人员的事件定性与执法判断'],
      ['算法范围', '动态基线、守恒残差、传播残差、变点、持续性和融合评分', 'MVP阶段直接建设不可解释的端到端深度学习系统']
    ], [1500, 3930, 3930]),
    h2('1.4 关键术语'),
    table(['术语', '定义'], [
      ['分析单元', '同一方向相邻门架之间的道路区间，包含区间内已知入口与出口匝道。'],
      ['同步守恒残差', '同一物理时间窗口内，进入分析单元的车辆数减去离开车辆数，并进行识别偏差和历史基线校正。'],
      ['传播残差', '按正常旅行时延预测的下游到达流量与实际下游流量之间的差异。'],
      ['积压指数', '对连续正向守恒残差进行带衰减累计，表示车辆异常积累程度。'],
      ['事件型拥堵', '具有突发容量下降、历史罕见、持续积压和合理空间传播特征的疑似突发事件状态。']
    ], [2200, 7160]),

    h1('2 可行性结论与理论边界', true),
    h2('2.1 可行性结论'),
    table(['判断问题', '结论', '置信边界'], [
      ['能否判断车辆积压', '可以。连续流入大于流出是区间车辆存量增加的直接表现。', '需要边界闭合、数据质量稳定，并校正识别偏差。'],
      ['能否判断拥堵', '可以辅助判断。持续积压叠加下游出流下降时，拥堵可能性显著提高。', '排队回溢越过上游门架后，流量差可能缩小，存在漏报。'],
      ['能否判断事故', '不能单独确认。可以识别疑似突发容量下降或事件型拥堵。', '事故原因、位置、占道车道数需要外部数据确认。'],
      ['能否作为独立依据', '可作为异常触发器，不宜作为事故定性依据。', '建议形成“流量触发—状态证据—外部确认”三级证据链。']
    ], [2100, 3500, 3760]),
    h2('2.2 交通流机理'),
    para('当下游瓶颈、事故占道或临时管制降低区间出流能力时，上游仍有车辆进入，区间车辆数增加并形成排队。流量守恒能够观测存量变化，传播残差能够识别进入上游的车流是否按正常时延到达下游。两者结合，比单纯比较上下游同周期流量更稳健。'),
    para('但流量是交通状态的投影而非完整状态。饱和拥堵时上下游流量可能同时降低；轻微事故可能未造成容量变化；收费站流量变化、路径分流和设备故障也可能产生类似信号。因此，算法必须显式保留替代解释。'),
    h2('2.3 成立条件'),
    bullet('区间的全部入口、出口、服务区和互通分支可观测，或者其未观测影响在历史上稳定。'),
    bullet('上下游门架时间戳对齐，聚合周期和迟到数据处理口径一致。'),
    bullet('门架识别率相对稳定，能够用设备指标或历史累计比进行校正。'),
    bullet('至少具备覆盖工作日、周末、节假日和主要时段的历史正常样本。'),
    bullet('复杂互通拆分为可闭合子单元；无法闭合的区间标记为低可观测。'),
    h2('2.4 典型失效场景'),
    table(['场景', '影响', '控制措施'], [
      ['未统计匝道或服务区', '产生伪积压或伪消散', '补齐拓扑与支路数据；无法补齐则降低可观测等级。'],
      ['门架识别率突变', '累计残差漂移并触发误报', '先执行数据质量判别；使用分设备校正系数。'],
      ['队列回溢越过上游门架', '上游入流下降，净流量差趋近零', '引入连续多门架空间分析和速度/旅行时间。'],
      ['全网需求同步下降', '上下游同时下降', '结合相邻路段、收费站入口和历史时段进行解释。'],
      ['事故未影响通行能力', '流量信号不明显', '依赖视频、事件上报等直接感知。']
    ], [2500, 3100, 3760]),

    h1('3 业务需求与产品方案', true),
    h2('3.1 用户与职责'),
    table(['角色', '核心诉求', '系统职责'], [
      ['路网监测人员', '尽早发现异常并获得可解释证据', '接收告警、查看时空曲线、发起视频复核。'],
      ['值班负责人', '控制误报并掌握处置态势', '审核事件等级、协调处置、关闭或合并告警。'],
      ['产品经理', '定义业务口径、状态和验收标准', '配置状态机、解释模板、复核流程和指标看板。'],
      ['算法工程师', '获得稳定数据、标签和回测闭环', '维护特征、阈值、模型版本和离线评估。'],
      ['数据工程师', '保障拓扑、时效和数据质量', '建设实时链路、主题表、质量规则和监控。'],
      ['运维人员', '定位设备与任务故障', '处理断流、延迟、重复、任务积压和服务异常。']
    ], [1800, 3300, 4260]),
    h2('3.2 业务闭环'),
    ...imageBlock(flowPng, 620, 314, '图1 门架流量异常识别业务闭环流程图'),
    h2('3.3 告警状态机'),
    table(['状态', '进入条件', '允许流转', '产品提示'], [
      ['NORMAL', '所有核心指标处于动态正常范围', 'DATA_ISSUE / ACCUMULATION_SUSPECTED', '正常，不展示强提示。'],
      ['DATA_ISSUE', '数据缺失、零值、异常跳变或拓扑不完整', 'NORMAL', '展示设备或数据异常，抑制交通事件告警。'],
      ['ACCUMULATION_SUSPECTED', '守恒残差异常且积压指数上升', 'NORMAL / CONGESTION_SUSPECTED', '黄色提示，建议持续观察。'],
      ['CONGESTION_SUSPECTED', '积压持续且传播残差异常', 'NORMAL / CAPACITY_DROP_SUSPECTED', '橙色提示，展示区间趋势。'],
      ['CAPACITY_DROP_SUSPECTED', '下游流量出现显著负向变点', 'CONGESTION_SUSPECTED / INCIDENT_LIKE', '橙红提示，建议视频复核。'],
      ['INCIDENT_LIKE', '多证据一致、历史罕见且持续', 'CONFIRMED / DISMISSED / RECOVERING', '红色告警，但文案保留“疑似”。'],
      ['CONFIRMED', '视频、交警、救援或人工确认', 'RECOVERING / CLOSED', '展示事件类型和处置状态。'],
      ['DISMISSED', '人工确认误报或设备故障', 'CLOSED', '记录驳回原因并回流样本。'],
      ['RECOVERING', '积压指数下降且出流恢复', 'CLOSED / INCIDENT_LIKE', '展示恢复趋势，防止过早关闭。']
    ], [1500, 3500, 2200, 2160], 17),
    h2('3.4 告警详情页信息'),
    bullet('基础定位：方向、上游门架、下游门架、桩号、区间长度、关联收费站和匝道。'),
    bullet('事件信息：首次异常时间、持续时间、等级、状态、置信分、模型版本。'),
    bullet('证据卡片：守恒残差、积压指数、传播残差、下游突变量、历史罕见度、空间一致性。'),
    bullet('替代解释：设备异常、未观测出口增加、全局需求下降、施工或管制。'),
    bullet('趋势图：上下游流量、预测下游流量、动态阈值、积压指数和相邻区间状态。'),
    bullet('操作区：视频复核、确认事件、驳回、合并、转派、更新状态、解除告警。'),
    h2('3.5 告警去重与抑制'),
    para('同一区间、同一方向、相邻时间窗口内的同类异常应合并为一条持续事件；同一拥堵队列跨多个区间传播时，可按最早异常区间作为根告警，其余作为影响区间。处于DATA_ISSUE状态的区间应抑制交通事件告警；计划施工、已知管制和已确认事件可进入差异化阈值或静默策略。'),

    h1('4 数据拓扑与数据模型', true),
    h2('4.1 分析单元定义'),
    para('将同一行驶方向相邻两个门架之间的道路定义为有向分析单元。上游门架为主线流入边界，下游门架为主线流出边界；区间内入口匝道计入流入，出口匝道计入流出。收费站必须映射到具体匝道、方向和汇入或驶出位置，不能仅依据“最近收费站”关系计入。'),
    h2('4.2 拓扑主数据'),
    table(['实体', '关键字段', '说明'], [
      ['gantry', 'gantry_id、route_code、direction、stake、lane_count', '门架位置、方向和车道信息。'],
      ['segment', 'segment_id、up_gantry_id、down_gantry_id、length、observability', '最小分析单元及可观测等级。'],
      ['ramp', 'ramp_id、segment_id、type、direction、merge_stake', '入口或出口匝道及其空间关系。'],
      ['toll_station', 'station_id、ramp_id、entry_or_exit', '收费站流量与匝道方向映射。'],
      ['device_quality', 'device_id、capture_rate、delay、status', '设备质量和识别偏差。'],
      ['calendar_context', 'date_type、holiday、weather、construction', '动态基线分层条件。']
    ], [1700, 4300, 3360]),
    h2('4.3 区间可观测等级'),
    table(['等级', '条件', '算法策略'], [
      ['A 高', '主线与全部匝道可观测，设备质量稳定', '可计算校正后的车辆积压指数和较高置信告警。'],
      ['B 中', '存在少量稳定的未观测流量或识别偏差', '使用历史偏差校正，置信分降级。'],
      ['C 低', '复杂互通、路径不唯一或关键匝道缺失', '只做变化检测与辅助提示，不输出积压车辆量。'],
      ['D 不可用', '拓扑错误、核心设备故障或长期缺失', '停止事件算法，输出数据治理任务。']
    ], [1500, 4200, 3660]),
    h2('4.4 实时主题数据建议'),
    table(['主题表', '粒度', '核心字段'], [
      ['dwd_gantry_flow_5m', '门架×方向×5分钟', '流量、车型、完整率、延迟、设备状态。'],
      ['dwd_station_flow_5m', '收费站×出入口×5分钟', '入口量、出口量、方向、质量标识。'],
      ['dws_segment_balance_5m', '区间×方向×5分钟', '流入、流出、原始残差、校正残差、基线。'],
      ['dws_segment_feature_5m', '区间×方向×5分钟', '积压、传播残差、变点、持续性、空间特征。'],
      ['ads_segment_alert', '告警事件', '状态、等级、时间、置信分、证据、模型版本。'],
      ['dim_network_topology', '拓扑版本', '门架、匝道、收费站、区间和生效时间。']
    ], [2200, 2400, 4760]),

    h1('5 算法方法与指标体系', true),
    h2('5.1 同步车辆守恒'),
    para('设第k个5分钟周期上游门架流量为Uₖ，下游门架流量为Dₖ，区间入口匝道流量为Eᵣ,ₖ，出口匝道流量为Xₛ,ₖ，区间车辆存量变化为ΔNₖ。'),
    equation('ΔNₖ = αᵤUₖ + Σᵣ αₑEᵣ,ₖ − α_dDₖ − Σₛ αₓXₛ,ₖ + εₖ'),
    para('α表示各数据源识别率或校正系数，ε表示未观测出入口、时间误差和随机识别误差。该公式计算同一物理时间窗口内边界存量变化，不需要人为加入行程时延。'),
    h2('5.2 历史偏差校正'),
    equation('Bₖ = ΔN̂ₖ − median(ΔN̂ | segment, time-of-week, date-type, context)'),
    para('Bₖ表示高于正常水平的额外车辆积累。采用中位数或分位数基线可降低门架长期识别偏差、轻微未观测支流等系统误差的影响。若偏差不稳定，应由数据质量层拦截。'),
    h2('5.3 传播时延与下游预测残差'),
    equation('D̂ₖ = β₀ + Σₗ wₗUₖ₋ₗ + 匝道传播修正项，且 Σₗwₗ = 1'),
    equation('Rₖ = D̂ₖ − Dₖ'),
    para('D̂ₖ是根据历史正常传播关系预测的下游流量。Rₖ显著为正，说明下游实际出流低于正常预期。时延优先由ETC轨迹或旅行时间估计；缺失时可在正常时段通过互相关确定，并采用多个5分钟滞后权重而非单一固定滞后。'),
    note('口径辨析', '同步流入与流出用于计算空间边界内存量变化；时延校正用于比较同一批车辆的正常传播。两种口径服务于不同问题，应同时保留。'),
    h2('5.4 指标体系'),
    table(['指标', '定义或计算', '业务含义'], [
      ['单周期净流量差', '流入量减流出量', '发现车辆开始积累，但易受噪声影响。'],
      ['归一化不平衡率', 'Bₖ / 平均流量规模', '支持不同流量规模区间横向比较。'],
      ['累计积压指数', 'Aₖ=max(0, λAₖ₋₁+Bₖ)', '识别持续积压、扩大与消散。'],
      ['传播残差', '预测下游流量减实际流量', '识别下游容量或传播异常。'],
      ['下游负向变点', '实际下游流量结构性下降', '识别突发容量下降。'],
      ['鲁棒标准分', '基于中位数和MAD标准化', '将当前指标映射到历史异常程度。'],
      ['历史罕见度', '历史同期经验分位数', '区分常规拥堵与非典型异常。'],
      ['异常持续性', '连续异常周期数与累计强度', '过滤单周期噪声。'],
      ['空间一致性', '相邻区间异常先后和传播方向', '识别真实排队传播并辅助定位。'],
      ['数据质量分', '缺失、零值、突跳、延迟、设备状态', '区分交通异常与设备故障。']
    ], [1800, 3500, 4060], 17),
    h2('5.5 数据质量特征'),
    bullet('完整性：当前窗口是否到齐、迟到比例、补传次数。'),
    bullet('连续性：持续零值、持续常数、异常尖峰、相邻窗口跳变。'),
    bullet('一致性：门架与相邻门架、收费站、历史同期是否同步变化。'),
    bullet('合理性：流量是否超过设备或车道工程上限，累计残差是否超过区间可容纳车辆量。'),
    bullet('设备性：设备在线状态、识别率、心跳、软件升级与维护记录。'),
    h2('5.6 特征窗口'),
    para('建议同时计算短、中、长三个窗口。短窗口用于检测突发变化，中窗口用于验证持续积压，长窗口用于判断恢复和历史偏移。窗口长度不在方案阶段拍定，应结合区间自由流时间、5分钟粒度、目标发现时延和误报约束，通过离线回测确定。'),

    h1('6 分层判别与模型方案', true),
    h2('6.1 五层判别框架'),
    table(['层级', '输入', '输出', '关键控制'], [
      ['L1 数据质量', '原始流量、设备状态、拓扑', '可用/降级/不可用', '不可用时抑制交通告警。'],
      ['L2 守恒异常', '同步残差、动态基线', '异常净流入', '使用鲁棒分位数而非统一固定阈值。'],
      ['L3 持续积压', '积压指数、持续时间', '疑似车辆积压', '避免单周期波动触发强告警。'],
      ['L4 类型研判', '传播残差、变点、罕见度、空间特征', '常规拥堵/容量下降/事件型', '保留替代解释，不直接确认事故。'],
      ['L5 融合输出', '多证据、区间可观测等级', '等级、置信分、证据链', '有标签后进行概率校准。']
    ], [1500, 2750, 2200, 2910]),
    h2('6.2 动态阈值'),
    para('阈值按路段、方向、时段、日期类型和外部环境分层建立。优先采用历史经验分位数、鲁棒Z分数和目标误报率反推，不设置全路网统一常数。样本不足时，使用同类型区间共享先验并对低样本区间降低置信度。'),
    equation('Zᵣₒᵦᵤₛₜ = (Bₖ − median(B)) / (1.4826 × MAD(B) + ε)'),
    h2('6.3 模型演进'),
    table(['阶段', '推荐方法', '适用条件', '说明'], [
      ['MVP', '动态基线＋EWMA/CUSUM＋变点＋规则融合', '标签少、强调解释性', '开发快，可配置、可回测、易定位误报。'],
      ['增强版', '分位数回归或LightGBM预测残差', '具备较完整上下文数据', '学习非线性正常流量，提高路段适配性。'],
      ['监督版', '逻辑回归、LightGBM、时序卷积', '事件真值质量稳定', '输出事件型拥堵概率并做概率校准。'],
      ['融合版', '流量＋速度＋轨迹＋视频多模态融合', '多源数据实时可用', '提升状态识别、原因确认和定位能力。']
    ], [1500, 3000, 2400, 2460]),
    h2('6.4 置信分设计'),
    para('无标签阶段可使用规则置信分：综合数据质量、区间可观测等级、守恒异常、积压持续、下游变点、历史罕见度和空间一致性。各证据权重通过回测调整。该分数只能表示证据强弱，不应宣称为真实事故概率。'),
    para('有标签后可用逻辑回归或树模型融合证据，并通过Platt Scaling或等距回归进行概率校准。产品界面应同时展示概率与主要证据，避免黑箱分数主导人工决策。'),
    h2('6.5 典型模式判别'),
    table(['观测模式', '拥堵支持', '事件支持', '替代解释与复核'], [
      ['上游正常、下游突然大幅下降', '高', '中至高', '下游设备故障、车道封闭；复核速度、视频和设备状态。'],
      ['上游下降、下游延迟下降', '对本区间低至中', '低', '上游需求下降或事件位于上游边界外；查看更上游门架。'],
      ['上游持续大于下游', '高', '中', '出口漏统计或下游容量不足；核查匝道与速度。'],
      ['上下游同时下降', '低至中', '低', '全局需求、天气、管制或数据异常；查看邻近路段。'],
      ['仅异常一个周期', '低', '低', '时间戳、抖动或车流团；等待持续性证据。'],
      ['流量差连续扩大', '高', '中至高', '真实排队增长或识别偏差漂移；复核质量与传播。'],
      ['门架异常、收费站无变化', '中', '中', '主线事件或门架故障；查看相邻门架和设备日志。']
    ], [2900, 1300, 1400, 3760], 17),

    h1('7 实时业务时序与技术架构', true),
    h2('7.1 实时检测时序'),
    ...imageBlock(seqPng, 620, 363, '图2 实时检测与事件闭环时序图'),
    para('系统以5分钟窗口为主要计算节拍，同时允许处理迟到数据。迟到数据只更新历史特征和评估口径，不应无条件重放已关闭的业务告警；如确需修正，应记录告警版本和变更原因。'),
    h2('7.2 技术架构'),
    ...imageBlock(archPng, 620, 342, '图3 门架流量异常事件监测技术架构图'),
    h2('7.3 架构组件说明'),
    table(['组件', '主要职责', '建议能力'], [
      ['数据接入', '接收门架、收费站、设备和外部事件数据', '幂等、迟到处理、断点续传、数据血缘。'],
      ['流式计算', '完成5分钟窗口、时间对齐、拓扑关联和实时特征', '事件时间、水位线、状态存储、重算机制。'],
      ['特征服务', '统一管理在线与离线特征口径', '版本、回溯、可重现、线上线下一致。'],
      ['算法引擎', '执行质量、守恒、传播、变点和融合算法', '规则热更新、模型灰度、解释输出。'],
      ['事件服务', '管理状态机、去重、合并、抑制和关闭', '幂等事件ID、操作审计、状态历史。'],
      ['监测应用', '展示区间、趋势、证据、视频和处置流程', '地图联动、筛选、复核、反馈标注。'],
      ['评估平台', '离线回测、指标对比、误报漏报分析', '模型版本对照、时间切分、事件级评估。']
    ], [1800, 4000, 3560]),
    h2('7.4 部署建议'),
    para('实时链路可采用消息队列＋流式计算＋在线特征/状态存储＋事件服务的模式；历史数据进入数据湖仓或分析型数据库，用于基线训练、回放和评估。具体技术选型应服从现有集团数据平台和运维体系，本方案不强制绑定某一产品。'),
    bullet('计算任务按路网方向和区间分区，保证同一区间事件有序。'),
    bullet('算法配置、拓扑版本和模型版本必须与每条告警绑定，支持追溯。'),
    bullet('在线计算降级时保留原始数据和恢复点，避免静默丢失。'),
    bullet('规则和阈值发布采用灰度机制，支持按路段回滚。'),

    h1('8 接口、事件对象与可解释输出', true),
    h2('8.1 异常事件对象'),
    table(['字段组', '示例字段'], [
      ['标识', 'alert_id、root_alert_id、segment_id、direction'],
      ['时间', 'first_detected_at、latest_detected_at、duration_min'],
      ['状态', 'state、severity、confidence_score、observability_level'],
      ['定位', 'up_gantry_id、down_gantry_id、start_stake、end_stake'],
      ['证据', 'balance_z、accumulation_index、propagation_residual、change_point_score'],
      ['解释', 'evidence_list、alternative_explanations、recommended_checks'],
      ['治理', 'rule_version、model_version、topology_version、data_quality_score'],
      ['处置', 'review_status、confirmed_type、operator、close_reason']
    ], [1900, 7460]),
    h2('8.2 服务接口建议'),
    table(['接口', '用途', '关键要求'], [
      ['GET /segments/{id}/status', '查询区间实时状态与证据', '返回数据质量和可观测等级。'],
      ['GET /alerts', '分页查询异常告警', '支持时间、方向、等级、状态和路线筛选。'],
      ['GET /alerts/{id}', '查询告警详情和指标曲线', '包含状态历史、模型与拓扑版本。'],
      ['POST /alerts/{id}/review', '提交确认、驳回或事件类型', '幂等、审计、必填复核依据。'],
      ['POST /alerts/{id}/close', '解除或关闭告警', '记录关闭原因和恢复指标。'],
      ['POST /models/evaluate', '发起离线回测', '绑定数据快照、配置和模型版本。']
    ], [2800, 3200, 3360]),
    h2('8.3 可解释性要求'),
    bullet('每条告警至少给出三个层次：结论、主要证据、替代解释。'),
    bullet('动态阈值应显示当前值、基线范围和超出程度。'),
    bullet('提供上下游实际流量、预测下游流量和积压指数的同轴趋势。'),
    bullet('若因数据质量降级，必须明确展示降级原因，不得隐藏在置信分中。'),

    h1('9 数据局限与多源融合路线', true),
    h2('9.1 当前数据可观测性'),
    table(['能力层级', '可以得到的结论'], [
      ['较可靠', '异常净流入、持续车辆积累迹象、下游出流是否低于正常预期。'],
      ['概率性', '是否形成拥堵、是否属于突发型容量下降、异常大致区间。'],
      ['无法单独确认', '事故原因、精确位置、影响车道、严重程度、排队长度和真实速度。']
    ], [2200, 7160]),
    h2('9.2 补充数据优先级'),
    table(['优先级', '数据', '主要增益'], [
      ['P0', '速度、占有率或可靠区间旅行时间', '直接判断交通状态，识别流量平衡但速度很低的饱和拥堵。'],
      ['P0', 'ETC车辆轨迹', '估计动态旅行时延、滞留时间和传播路径。'],
      ['P1', '视频与视频事件检测', '确认停车、碰撞、占道和具体位置。'],
      ['P1', '交警、救援和运营事件记录', '构建高可信事件真值及处置时间线。'],
      ['P1', '施工、车道封闭和交通管制', '排除计划性容量下降并实施阈值抑制。'],
      ['P2', '天气数据', '解释区域性降速、需求下降和风险升高。'],
      ['P2', '车型与分车道流量', '分析重车比例和局部车道异常。']
    ], [1200, 3000, 5160]),

    h1('10 离线回测与在线验证', true),
    h2('10.1 真值体系'),
    para('事件真值至少包括事件ID、类型、方向、位置、发生时间、平台发现时间、处置时间、恢复时间、影响车道、来源和可信等级。视频、交警、救援和人工记录应进行交叉校验。设备故障应建立独立真值，防止将数据异常混入交通事件样本。'),
    h2('10.2 样本设计'),
    bullet('正常样本覆盖高峰、平峰、工作日、节假日、天气、施工和常规拥堵。'),
    bullet('异常样本覆盖事故、故障车、抛洒、车道封闭、收费站拥堵和设备故障。'),
    bullet('负样本按路段、时段和天气匹配，避免模型只学习高峰或节假日。'),
    bullet('同一事件的连续窗口必须置于同一数据集。'),
    h2('10.3 数据切分与防泄漏'),
    bullet('采用时间向前的训练、验证、测试切分，不随机打散相邻窗口。'),
    bullet('阈值、基线和校正系数只能使用告警时点之前的数据。'),
    bullet('不使用事件结束时间、未来流量或处置结果作为在线特征。'),
    bullet('增加跨路段测试，评估新路段泛化能力。'),
    h2('10.4 评价指标'),
    table(['维度', '指标'], [
      ['发现能力', '事件级召回率、告警准确率、AUPRC、漏报率。'],
      ['时效性', '平均发现延迟、相对人工上报提前量、P90发现延迟。'],
      ['运营负担', '每百路段小时误报数、重复告警数、无效告警持续时间。'],
      ['定位能力', '异常区间命中率、根告警区间偏差、影响区间覆盖率。'],
      ['数据治理', '设备故障识别率、设备故障误判为交通事件的比例。'],
      ['稳定性', '不同路线、时段、节假日和天气下的指标波动。']
    ], [2200, 7160]),
    h2('10.5 在线验证步骤'),
    numbered('静默运行：实时计算但不直接触发业务处置。'),
    numbered('人工比对：每日将告警与视频、交警和救援事件对照。'),
    numbered('误报归因：区分数据、拓扑、阈值、常规拥堵和业务规则问题。'),
    numbered('灰度上线：选择拓扑简单、数据质量高的区间先上线辅助告警。'),
    numbered('指标门禁：达到双方确认的召回、误报和时延要求后扩大范围。'),

    h1('11 MVP实施方案', true),
    h2('11.1 MVP最小范围'),
    bullet('选择拓扑简单、无复杂互通、门架质量稳定的试点路线。'),
    bullet('建立A/B/C/D四级区间可观测清单。'),
    bullet('实现数据质量、守恒残差、传播残差、积压指数、变点和持续性。'),
    bullet('实现五类核心状态和人工确认、驳回、关闭闭环。'),
    bullet('提供告警详情、趋势曲线、证据和替代解释。'),
    bullet('建立离线回放、事件级评估和参数版本管理。'),
    h2('11.2 分阶段交付'),
    table(['阶段', '主要工作', '核心产物', '退出条件'], [
      ['阶段一 数据准备', '拓扑梳理、数据口径、质量规则、历史样本', '拓扑表、质量报告、可观测清单', '试点区间边界和数据口径确认。'],
      ['阶段二 算法原型', '动态基线、守恒、传播、变点和规则融合', '离线算法、回测报告、参数配置', '可解释输出完整，误报原因可归类。'],
      ['阶段三 产品闭环', '告警列表、详情、视频复核、状态机', 'MVP应用、接口、操作日志', '完成静默运行和人工复核。'],
      ['阶段四 灰度优化', '阈值校准、空间联动、事件真值回流', '灰度报告、V1模型、上线方案', '满足双方确认的指标门禁。']
    ], [1500, 3200, 2500, 2160], 17),
    h2('11.3 产品验收标准'),
    bullet('能够按方向正确关联上下游门架及区间内收费站、匝道。'),
    bullet('数据异常时优先输出DATA_ISSUE，并抑制交通事件强告警。'),
    bullet('每条告警均可追溯到原始数据、特征、阈值、模型和拓扑版本。'),
    bullet('告警详情具备证据链、替代解释、趋势图和复核入口。'),
    bullet('支持确认、驳回、恢复、关闭和样本回流。'),
    bullet('支持按事件级指标完成离线回测和灰度评估。'),
    h2('11.4 算法验收标准'),
    para('具体数值指标必须基于试点路线事件数量、数据质量和人工基线共同确定，不在缺乏样本统计的情况下拍定。建议至少同时设置事件召回率、每百路段小时误报数、P90发现延迟、设备故障误判率和告警可解释覆盖率五类门禁。'),

    h1('12 风险、治理与运维', true),
    h2('12.1 风险清单'),
    table(['风险', '表现', '应对措施'], [
      ['拓扑错误', '收费站或匝道计入错误方向', '拓扑版本化、人工抽检、累计流量闭合校验。'],
      ['识别偏差漂移', '积压指数长期单向累积', '设备质量拦截、滚动偏差监控、带衰减累计。'],
      ['标签稀缺', '无法稳定训练事故分类器', '规则MVP、弱监督、人工复核和主动学习。'],
      ['误报过多', '值班人员产生告警疲劳', '事件合并、持续性、静默规则和目标误报率阈值。'],
      ['过度承诺', '将疑似事件展示为确认事故', '产品文案分级，外部证据确认后才升级。'],
      ['模型漂移', '节假日、施工或交通结构变化后性能下降', '分场景监控、定期回测、模型灰度与回滚。']
    ], [1800, 3000, 4560]),
    h2('12.2 安全与审计'),
    bullet('原始轨迹数据如涉及车辆标识，应实施脱敏、最小权限和留痕审计。'),
    bullet('规则、阈值、模型和拓扑变更均需记录发布人、时间、版本和影响范围。'),
    bullet('人工确认、驳回和关闭操作需记录操作人、依据和备注。'),
    bullet('对外接口采用鉴权、限流和数据字段分级，避免暴露敏感车辆信息。'),
    h2('12.3 运行监控'),
    bullet('数据时效：各源延迟、缺失率、迟到率。'),
    bullet('计算稳定：窗口积压、任务失败、状态存储和重启恢复。'),
    bullet('算法健康：各状态分布、分路段误报、特征漂移、置信分漂移。'),
    bullet('业务闭环：待复核时长、确认率、驳回原因、事件关闭时长。'),

    h1('附录A MVP算法伪代码', true),
    para('以下伪代码用于统一产品、数据与算法团队对实时处理顺序的理解，实际实现需补充异常处理、迟到数据和状态存储机制。'),
    para('OFFLINE：为每个区间建立拓扑与可观测等级；在历史正常数据上估计识别偏差、传播时延分布、动态基线和目标误报率阈值；保存配置版本。', { firstLine: false }),
    para('ONLINE：每5分钟获取门架、收费站和设备状态；执行质量校验；计算同步流入、流出和基线校正守恒残差；计算带衰减积压指数；使用分布式时延预测下游流量并得到传播残差；检测下游负向变点；计算持续性、历史罕见度和空间一致性；融合为状态、等级、置信分、证据与替代解释；事件服务执行去重、合并和状态流转。', { firstLine: false }),
    note('强制规则', '若数据质量不可用或拓扑等级为D，则不得输出事件型拥堵强告警；若没有视频、交警、救援或人工确认，不得输出“已确认事故”。', 'FCE4D6'),
    h1('附录B 待业务与数据团队确认事项'),
    numbered('确认试点路线、方向、门架清单和复杂互通排除范围。'),
    numbered('确认收费站流量能否映射到具体入口/出口匝道和方向。'),
    numbered('确认门架流量的统计口径、识别率、迟到补传和时间戳规则。'),
    numbered('确认是否可以接入速度、ETC轨迹、视频、交警或救援事件数据。'),
    numbered('确认事件真值负责人、复核流程和数据保留期限。'),
    numbered('共同确定灰度阶段的召回、误报、发现时延和运营负担门禁。'),
    numbered('确认现有大数据平台、消息、计算、存储、模型发布和监控能力，以便细化技术选型。')
  );

  const cover = [
    new Paragraph({ spacing: { before: 1200, after: 300 }, alignment: AlignmentType.CENTER, children: [run('高速公路门架流量守恒', { size: 44, bold: true, color: C.navy })] }),
    new Paragraph({ spacing: { after: 260 }, alignment: AlignmentType.CENTER, children: [run('异常事件识别技术方案', { size: 44, bold: true, color: C.navy })] }),
    new Paragraph({ spacing: { after: 760 }, alignment: AlignmentType.CENTER, children: [run('面向产品经理与大数据算法工程师', { size: 26, color: C.blue })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 180 }, children: [run('版本：V1.0', { size: 24, bold: true })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 180 }, children: [run('日期：2026年8月31日', { size: 22 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1100, after: 120 }, border: { top: { style: BorderStyle.SINGLE, size: 8, color: C.blue, space: 1 } }, children: [run('文档属性：技术设计稿 / 内部评审', { size: 20, color: C.gray })] }),
    para('本方案用于指导产品设计、数据治理、算法研发、工程实施和试点验证。文档中的阈值、周期和验收数值需在试点数据回测后确认。', { align: AlignmentType.CENTER, firstLine: false, size: 18, color: C.gray })
  ];

  const doc = new Document({
    creator: 'OpenAI Codex', title: '高速公路门架流量守恒异常事件识别技术方案', subject: '路网运行监测技术方案',
    styles: {
      default: { document: { run: { font: 'Microsoft YaHei', size: 21, color: C.dark }, paragraph: { spacing: { line: 330, after: 100 } } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: 'Microsoft YaHei', size: 32, bold: true, color: C.navy }, paragraph: { spacing: { before: 260, after: 180 }, outlineLevel: 0, keepNext: true } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: 'Microsoft YaHei', size: 28, bold: true, color: C.blue }, paragraph: { spacing: { before: 220, after: 140 }, outlineLevel: 1, keepNext: true } },
        { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: 'Microsoft YaHei', size: 24, bold: true, color: C.dark }, paragraph: { spacing: { before: 180, after: 100 }, outlineLevel: 2, keepNext: true } }
      ]
    },
    numbering: { config: [
      { reference: 'bullet-list', levels: [
        { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 620, hanging: 300 } } } },
        { level: 1, format: LevelFormat.BULLET, text: '–', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1100, hanging: 300 } } } }
      ] },
      { reference: 'number-list', levels: [
        { level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 620, hanging: 300 } } } }
      ] }
    ] },
    sections: [
      { properties: { page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } }, children: cover },
      { properties: { type: SectionType.NEXT_PAGE, page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } },
        headers: { default: new Header({ children: [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C.blue, space: 1 } }, children: [run('高速公路门架流量守恒异常事件识别技术方案  V1.0', { size: 17, color: C.gray })] })] }) },
        footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [run('第 ', { size: 17, color: C.gray }), new TextRun({ children: [PageNumber.CURRENT], font: 'Microsoft YaHei', size: 17, color: C.gray }), run(' 页', { size: 17, color: C.gray })] })] }) },
        children: [
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 260 }, children: [run('目 录', { size: 34, bold: true, color: C.navy })] }),
          new TableOfContents('目录', { hyperlink: true, headingStyleRange: '1-3' }),
          new Paragraph({ children: [new PageBreak()] }),
          ...content
        ]
      }
    ]
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(docxPath, buffer);
  console.log(JSON.stringify({ docxPath, flowPng, seqPng, archPng }, null, 2));
}

build().catch(err => { console.error(err); process.exit(1); });
