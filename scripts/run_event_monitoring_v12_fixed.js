const fs = require('fs');
const path = require('path');
const vm = require('vm');

const scriptsDir = __dirname;
const sourcePath = path.join(scriptsDir, 'generate_event_monitoring_solution_v12.js');
let source = fs.readFileSync(sourcePath, 'utf8');

source = source.replace(
  `replaceText("['质量门控','缺失、零值、突跳、连续性']", "['数据健康门控','DataHealth、证据可信度']");`,
  `replaceText("'质量门控','缺失、零值、突跳、连续性'", "'数据健康门控','DataHealth、证据可信度'");`
);
source = source.replace(
  `replaceText("['视频复核与处置','确认/驳回、处置、关闭']", "['大屏复核与处置','10分钟提醒、人工确认关闭']");`,
  `replaceText("'视频复核与处置','确认/驳回、处置、关闭'", "'大屏复核与处置','10分钟提醒、人工确认关闭'");`
);

vm.runInNewContext(source, {
  require,
  process,
  console,
  Buffer,
  setTimeout,
  clearTimeout,
  __dirname: scriptsDir,
  __filename: sourcePath
}, { filename: sourcePath });
