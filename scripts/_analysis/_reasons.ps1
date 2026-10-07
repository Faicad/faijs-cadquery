$ErrorActionPreference = 'Stop'
$m = Get-Content -Raw 'D:\Faicad\faijs-cadquery\tests\manifest.json' | ConvertFrom-Json
$out = New-Object System.Collections.Generic.List[string]
$include = @('kernel:fillet-chain-reapply','op:assembly-solve','kernel:boolean-near-coincident-bspline','plane','kernel:sphere','op:pendingWires','op:shell','comparator:')
foreach ($p in $m.PSObject.Properties) {
  $v = $p.Value
  if ($v.status -ne 'blocked') { continue }
  $hit = $false
  foreach ($i in $include) { if ($v.blockedBy -like "$i*") { $hit = $true } }
  if (-not $hit) { continue }
  $rs = ''
  if ($v.PSObject.Properties.Name -contains 'reason') { $rs = [string]$v.reason }
  $out.Add(("{0}`t{1}`t{2}" -f $p.Name, $v.blockedBy, $rs))
}
[System.IO.File]::WriteAllLines('D:\Faicad\faijs-cadquery\scripts\_analysis\out-reasons.txt', $out, [System.Text.UTF8Encoding]::new($false))
"rows=$($out.Count)"