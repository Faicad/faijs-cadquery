$ErrorActionPreference = 'Stop'
$m = Get-Content -Raw 'D:\Faicad\faijs-cadquery\tests\manifest.json' | ConvertFrom-Json
$out = New-Object System.Collections.Generic.List[string]
$items = @()
foreach ($p in $m.PSObject.Properties) {
  $v = $p.Value
  $st = ''
  if ($v.PSObject.Properties.Name -contains 'status') { $st = $v.status }
  $bb = $null
  if ($v.PSObject.Properties.Name -contains 'blockedBy') { $bb = $v.blockedBy }
  $rs = ''
  if ($v.PSObject.Properties.Name -contains 'reason') { $rs = $v.reason }
  $items += [pscustomobject]@{ Name = $p.Name; Status = $st; BlockedBy = $bb; Reason = $rs }
}
$out.Add("TOTAL=$($items.Count)")
foreach ($s in @('ported','blocked','skipped')) {
  $c = @($items | Where-Object { $_.Status -eq $s }).Count
  $out.Add("STATUS_${s}=$c")
}
$out.Add("OTHER_STATUS=" + ((@($items | Where-Object { 'ported','blocked','skipped' -notcontains $_.Status }).Count)))
$blocked = @($items | Where-Object { $_.Status -eq 'blocked' })
$tags = @{}
foreach ($b in $blocked) {
  $raw = $b.BlockedBy
  if ($null -eq $raw -or $raw -eq '') { $k = '<null>' } else { $k = [string]$raw }
  if (-not $tags.ContainsKey($k)) { $tags[$k] = 0 }
  $tags[$k] = $tags[$k] + 1
}
$out.Add("BLOCKEDCOUNT=$($blocked.Count)")
$out.Add("DISTINCT_KEYS=$($tags.Count)")
$out.Add('--- tag | count | sample names ---')
foreach ($kv in ($tags.GetEnumerator() | Sort-Object -Property Value -Descending)) {
  $names = @($blocked | Where-Object { [string]($_.BlockedBy) -eq $kv.Key } | ForEach-Object { $_.Name })
  $sample = ($names | Select-Object -First 4) -join ', '
  $out.Add(("{0}`t{1}`t{2}" -f $kv.Value, $kv.Key, $sample))
}
[System.IO.File]::WriteAllLines('D:\Faicad\faijs-cadquery\scripts\_analysis\out-blocked-tags.txt', $out, [System.Text.UTF8Encoding]::new($false))
