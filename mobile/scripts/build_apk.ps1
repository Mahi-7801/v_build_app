$Env:JAVA_HOME = 'C:\Users\pc\tools\jdk-21.0.13.1+2'
$Env:ANDROID_HOME = 'C:\Users\pc\AppData\Local\Android\Sdk'
$Env:ANDROID_SDK_ROOT = $Env:ANDROID_HOME
$Env:PATH = "$Env:JAVA_HOME\bin;$Env:ANDROID_HOME\platform-tools;$Env:PATH"

Set-Location 'C:\Users\pc\Downloads\app_vone\mobile\android'

Write-Output '[build] java version:'
& "$Env:JAVA_HOME\bin\java.exe" -version 2>$null

Write-Output '[build] gradle assembleDebug ...'
& .\gradlew.bat assembleDebug --no-daemon 2>&1 | Select-Object -Last 60

$apk = Get-ChildItem -Path . -Recurse -Filter 'app-debug.apk' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($apk) {
  $dest = 'C:\Users\pc\Downloads\app_vone\mobile\HomeWorkout-debug.apk'
  Copy-Item $apk.FullName $dest -Force
  Write-Output "[build] APK: $dest ($([math]::Round((Get-Item $dest).Length/1MB,1)) MB)"
} else {
  Write-Output '[build] APK not found - check errors above'
}
