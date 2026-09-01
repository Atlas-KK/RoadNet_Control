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

const numberingPatch = `
replaceText(
  "const h2=s=>new Paragraph({heading:HeadingLevel.HEADING_2,keepNext:true,children:[r(s,{size:28,bold:true,color:C.blue})]});",
  "let listRefIndex=0;const h2=s=>{listRefIndex+=1;return new Paragraph({heading:HeadingLevel.HEADING_2,keepNext:true,children:[r(s,{size:28,bold:true,color:C.blue})]})};"
);
replaceText(
  "const num=s=>new Paragraph({numbering:{reference:'num',level:0},spacing:{after:80,line:300},children:[r(s)]});",
  "const num=s=>new Paragraph({numbering:{reference:'num'+listRefIndex,level:0},spacing:{after:80,line:300},children:[r(s)]});"
);
replaceText(
  "{reference:'num',levels:[{level:0,format:LevelFormat.DECIMAL,text:'%1.',alignment:AlignmentType.LEFT,style:{paragraph:{indent:{left:620,hanging:300}}}}]}",
  "...Array.from({length:80},(_,i)=>({reference:'num'+i,levels:[{level:0,format:LevelFormat.DECIMAL,text:'%1.',alignment:AlignmentType.LEFT,style:{paragraph:{indent:{left:620,hanging:300}}}}]}))"
);
`;

const insertionAnchor = "const endPattern = /main\\(\\)\\.catch";
const anchorIndex = source.indexOf(insertionAnchor);
if (anchorIndex < 0) throw new Error('未找到编号补丁插入位置');
source = source.slice(0, anchorIndex) + numberingPatch + source.slice(anchorIndex);

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
