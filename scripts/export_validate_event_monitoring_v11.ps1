param(
  [Parameter(Mandatory=$true)][string]$DocxPath,
  [Parameter(Mandatory=$true)][string]$PdfPath
)

$resolvedDocx = [System.IO.Path]::GetFullPath($DocxPath)
$resolvedPdf = [System.IO.Path]::GetFullPath($PdfPath)

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($resolvedDocx)
$required = @('[Content_Types].xml', 'word/document.xml', 'word/styles.xml')
$entryNames = @($zip.Entries | ForEach-Object { $_.FullName })
foreach ($name in $required) {
  if ($entryNames -notcontains $name) { throw "DOCX缺少必要项: $name" }
}
$xmlCount = 0
foreach ($entry in $zip.Entries) {
  if ($entry.FullName.EndsWith('.xml')) {
    $stream = $entry.Open()
    try {
      $reader = New-Object System.IO.StreamReader($stream)
      $content = $reader.ReadToEnd()
      $xml = New-Object System.Xml.XmlDocument
      $xml.PreserveWhitespace = $true
      $xml.LoadXml($content)
      $xmlCount += 1
    } finally {
      if ($reader) { $reader.Dispose() }
      $stream.Dispose()
    }
  }
}
$zip.Dispose()

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
$doc = $null
try {
  $doc = $word.Documents.Open($resolvedDocx)
  foreach ($toc in $doc.TablesOfContents) { $toc.Update() }
  $doc.Fields.Update() | Out-Null
  $doc.Repaginate()
  $doc.Save()
  $pageCount = $doc.ComputeStatistics(2)
  $wordCount = $doc.ComputeStatistics(0)
  $doc.ExportAsFixedFormat($resolvedPdf, 17)
} finally {
  if ($doc) { $doc.Close($false) }
  $word.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}

[ordered]@{
  docx = $resolvedDocx
  pdf = $resolvedPdf
  xml_files_validated = $xmlCount
  pages = $pageCount
  words = $wordCount
  pdf_exists = (Test-Path -LiteralPath $resolvedPdf)
  pdf_bytes = (Get-Item -LiteralPath $resolvedPdf).Length
} | ConvertTo-Json
