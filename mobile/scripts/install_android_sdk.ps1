$ErrorActionPreference = 'Stop'
$sdk = 'C:\Users\pc\AppData\Local\Android\Sdk'
$zip = 'C:\Users\pc\AppData\Local\Temp\opencode\cmdline-tools.zip'
$url = 'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip'

Write-Output '[sdk] downloading Android command-line tools ...'
if (-not (Test-Path $zip)) {
  Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
}
Write-Output "[sdk] downloaded $([math]::Round((Get-Item $zip).Length/1MB,1)) MB"

New-Item -ItemType Directory -Force -Path "$sdk\cmdline-tools" | Out-Null
$tmp = "$sdk\cmdline-tools\_tmp"
if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
Expand-Archive -Force -Path $zip -DestinationPath $tmp
$latest = "$sdk\cmdline-tools\latest"
if (Test-Path $latest) { Remove-Item -Recurse -Force $latest }
Move-Item "$tmp\cmdline-tools" $latest
Remove-Item -Recurse -Force $tmp

$sdkmgr = "$latest\bin\sdkmanager.bat"
Write-Output '[sdk] accepting licenses ...'
$yes = ('y' + "`n") * 30
$yes | & $sdkmgr --sdk_root=$sdk --licenses 2>&1 | Select-Object -Last 10

Write-Output '[sdk] installing platform-tools, android-35, build-tools 35.0.0 ...'
& $sdkmgr --sdk_root=$sdk 'platform-tools' 'platforms;android-35' 'build-tools;35.0.0' 2>&1 | Select-Object -Last 20

Write-Output '[sdk] installed components:'
Get-ChildItem $sdk | Select-Object Name
Write-Output '[sdk] done'
