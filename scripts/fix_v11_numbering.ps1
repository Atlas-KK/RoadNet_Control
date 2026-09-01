param([Parameter(Mandatory=$true)][string]$DocxPath)

$resolved = [System.IO.Path]::GetFullPath($DocxPath)
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
$doc = $null

function Find-Range([object]$document, [string]$text) {
  $range = $document.Content.Duplicate
  $find = $range.Find
  $find.Text = $text
  $find.Forward = $true
  $find.Wrap = 0
  if (-not $find.Execute()) { throw "未找到编号段落: $text" }
  return $range
}

try {
  $doc = $word.Documents.Open($resolved)
  $groups = @(
    @('实时轨迹样本充分：使用滚动中位数、P85和分布式时延。', '仍不稳定：区间降级，不输出传播类强告警。'),
    @('数据质量：计算DataTrust，识别缺失、零值、突跳、时序、轨迹和邻点异常。', '输出等级与置信度：给出检测状态、证据、替代解释、DataTrust和复核建议。'),
    @('历史影子回放，复现事件时间、水位线和迟到逻辑。', '从提示级灰度至正式告警，以效果、负担、时延和稳定性联合门禁扩面。'),
    @('建立有效拓扑版本和A/B/C/D清单。', '人员视频复核并回填真值；离线按版本校准。'),
    @('平台负责人填写组件、版本、负责人、部署域和现有SLA。', '试点采集可用性基线后确认生产SLA、RPO和RTO。')
  )
  foreach ($pair in $groups) {
    $start = Find-Range $doc $pair[0]
    $end = Find-Range $doc $pair[1]
    $range = $doc.Range($start.Start, $end.End)
    $template = $range.Paragraphs.Item(1).Range.ListFormat.ListTemplate
    $range.ListFormat.ApplyListTemplateWithLevel($template, $false, 0, 1, 1)
  }
  foreach ($toc in $doc.TablesOfContents) { $toc.Update() }
  $doc.Fields.Update() | Out-Null
  $doc.Repaginate()
  $doc.Save()
} finally {
  if ($doc) { $doc.Close($false) }
  $word.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}

'Numbering groups reset successfully.'
