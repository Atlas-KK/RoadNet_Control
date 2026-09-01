param([Parameter(Mandatory=$true)][string]$DocxPath)

$resolved = [System.IO.Path]::GetFullPath($DocxPath)
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
$doc = $null

try {
  $doc = $word.Documents.Open($resolved)
  $groups = @()
  $groupStart = $null
  $groupEnd = $null
  for ($i = 1; $i -le $doc.Paragraphs.Count; $i++) {
    $paragraph = $doc.Paragraphs.Item($i)
    $listType = $paragraph.Range.ListFormat.ListType
    if ($listType -eq 3) {
      if ($null -eq $groupStart) { $groupStart = $i }
      $groupEnd = $i
    } elseif ($null -ne $groupStart) {
      $groups += ,@($groupStart, $groupEnd)
      $groupStart = $null
      $groupEnd = $null
    }
  }
  if ($null -ne $groupStart) { $groups += ,@($groupStart, $groupEnd) }

  foreach ($group in $groups) {
    $first = $doc.Paragraphs.Item($group[0])
    $last = $doc.Paragraphs.Item($group[1])
    $range = $doc.Range($first.Range.Start, $last.Range.End)
    $template = $first.Range.ListFormat.ListTemplate
    $range.ListFormat.ApplyListTemplateWithLevel($template, $false, 0, 1, 1)
  }

  foreach ($toc in $doc.TablesOfContents) { $toc.Update() }
  $doc.Fields.Update() | Out-Null
  $doc.Repaginate()
  $doc.Save()
  [ordered]@{numbered_groups_reset=$groups.Count} | ConvertTo-Json
} finally {
  if ($doc) { $doc.Close($false) }
  $word.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}
