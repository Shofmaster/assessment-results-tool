# Downloads free/public reference files linked from document acquisition guidance.
# From repo root:  powershell -ExecutionPolicy Bypass -File .\scripts\download-baseline-public-docs.ps1
# Some hosts block automated requests (403) or require corporate DNS; retry on your network.

$ErrorActionPreference = 'Continue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot (Join-Path '..' (Join-Path 'downloads' 'baseline-doc-public'))))
New-Item -ItemType Directory -Force -Path $root | Out-Null

$ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

function Save-Url ($url, $outPath) {
  try {
    Invoke-WebRequest -Uri $url -OutFile $outPath -UseBasicParsing -TimeoutSec 120 -Headers @{ 'User-Agent' = $ua }
    return $true
  } catch {
    Write-Warning "$outPath <- $url : $($_.Exception.Message)"
    return $false
  }
}

# Direct PDFs (government / standards bodies)
$pdfs = [ordered]@{
  'FAA_AC21-40B.pdf'           = 'https://rgl.faa.gov/Regulatory_and_Guidance_Library/rgAdvisoryCircular.nsf/0/32af4ec91e3af7d38625783600517791/$FILE/AC21-40B.pdf'
  'FAA_AC20-152A.pdf'          = 'https://rgl.faa.gov/Regulatory_and_Guidance_Library/rgAdvisoryCircular.nsf/0/f1b7f9e6b97e09e086258755005da0f3/$FILE/AC%2020-152A.pdf'
  'NASA_NPR_7120-5H.pdf'       = 'https://nodis3.gsfc.nasa.gov/npg_img/N_PR_7120_005H_/N_PR_7120_005H_.pdf'
  'BIPM_JCGM_100_2008_GUM.pdf' = 'https://www.bipm.org/documents/20126/2071204/JCGM_100_2008_E.pdf'
  'NIST_SP_800-171_rev2.pdf'   = 'https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-171r2.pdf'
}

# Informational HTML (reference only)
$html = [ordered]@{
  'faa-part145-repair-stations.html' = 'https://www.faa.gov/licenses_certificates/repair_stations/part_145_repair_stations'
  'faa-sms-resources.html'           = 'https://www.faa.gov/about/initiatives/sms'
  'icao-sms-guidance-docs.html'     = 'https://www.icao.int/safety/SafetyManagement/Pages/GuidanceDocuments.aspx'
  'faa-ops-specs-afs220.html'       = 'https://www.faa.gov/about/office_org/headquarters_offices/avs/offices/afs/afs200/afs220'
  'faa-mmel-database.html'          = 'https://rgl.faa.gov/Regulatory_and_Guidance_Library/rgMakeModel.nsf/0/OpenDatabase&&&MMEL'
  'dot-phmsa-hazmat-training.html'  = 'https://www.phmsa.dot.gov/hazmat/training'
  'ibac-is-bao.html'                = 'https://www.ibac.org/is-bao'
  'pri-nadcap.html'                 = 'https://www.pri-network.org/NADCAP'
  'faa-aircraft-certification.html' = 'https://www.faa.gov/aircraft/air_cert'
  'ecfr-14CFR-21.50.html'           = 'https://www.ecfr.gov/current/title-14/chapter-I/subchapter-C/part-21/subpart-B/section-21.50'
  'jarus-publications.html'         = 'https://jarus-rpas.org/publications'
  'faa-part107-waivers.html'       = 'https://www.faa.gov/uas/commercial_operators/part_107_waivers'
  'cmmc-program.html'              = 'https://www.acq.osd.mil/cmmc/'
  'nasa-msfc-std-3716.html'        = 'https://standards.nasa.gov/standard/msfc/msfc-std-3716'
}

$ok = 0; $fail = 0
foreach ($kv in $pdfs.GetEnumerator()) {
  if (Save-Url $kv.Value (Join-Path $root $kv.Key)) { $ok++ } else { $fail++ }
}
foreach ($kv in $html.GetEnumerator()) {
  if (Save-Url $kv.Value (Join-Path $root $kv.Key)) { $ok++ } else { $fail++ }
}

Write-Host "`nSaved under: $root"
Write-Host "Succeeded: $ok  Failed: $fail"
Get-ChildItem $root | Sort-Object Name | Format-Table Name, Length -AutoSize
