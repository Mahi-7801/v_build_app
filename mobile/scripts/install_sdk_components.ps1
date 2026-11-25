$Env:JAVA_HOME = 'C:\Users\pc\tools\jdk-21.0.13.1+2'
$Env:PATH = "$Env:JAVA_HOME\bin;$Env:PATH"
$sdk = 'C:\Users\pc\AppData\Local\Android\Sdk'
$sdkmgr = "$sdk\cmdline-tools\latest\bin\sdkmanager.bat"

Write-Output '[sdk] java:'
& "$Env:JAVA_HOME\bin\java.exe" -version 2>$null

Write-Output '[sdk] licenses ...'
$yes = ('y' + "`n") * 40
$yes | & $sdkmgr --sdk_root=$sdk --licenses 2>&1 | Select-Object -Last 6

Write-Output '[sdk] installing platform-tools / android-35 / build-tools 35.0.0 ...'
& $sdkmgr --sdk_root=$sdk 'platform-tools' 'platforms;android-35' 'build-tools;35.0.0' 2>&1 | Select-Object -Last 20

Write-Output '[sdk] components:'
Get-ChildItem $sdk | Select-Object -ExpandProperty Name
