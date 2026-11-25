$ErrorActionPreference = 'Stop'
$d = 'C:\Users\pc\Downloads\app_vone\mobile\android'
$pkgPath = "$d\app\src\main\java\homeworkout\homeworkouts\noequipment\rebuild"

# 1. Move the Java/Kotlin sources into the real package path
New-Item -ItemType Directory -Force -Path $pkgPath | Out-Null
Copy-Item "$d\app\src\main\java\com\helloworld\MainActivity.kt" $pkgPath -Force
Copy-Item "$d\app\src\main\java\com\helloworld\MainApplication.kt" $pkgPath -Force
Remove-Item -Recurse -Force "$d\app\src\main\java\com"

# 2. Rewrite package declarations and component name
foreach ($f in @("$pkgPath\MainActivity.kt", "$pkgPath\MainApplication.kt")) {
  $t = Get-Content $f -Raw
  $t = $t -replace 'package com\.helloworld', 'package homeworkout.homeworkouts.noequipment.rebuild'
  $t = $t -replace '"HelloWorld"', '"homeworkout"'
  Set-Content -NoNewline -Path $f -Value $t
}

# 3. Gradle project name
$s = Get-Content "$d\settings.gradle" -Raw
$s = $s -replace "rootProject.name = 'HelloWorld'", "rootProject.name = 'HomeWorkout'"
Set-Content -NoNewline -Path "$d\settings.gradle" -Value $s

# 4. App build config
$b = Get-Content "$d\app\build.gradle" -Raw
if ($b -match 'applicationId') {
  $b = $b -replace 'applicationId\s+["''][^"'']+["'']', 'applicationId "homeworkout.homeworkouts.noequipment.rebuild"'
} else {
  $b = $b -replace '(defaultConfig\s*\{)', "`$1`n        applicationId `"homeworkout.homeworkouts.noequipment.rebuild`""
}
if ($b -match 'versionCode') { $b = $b -replace 'versionCode\s+\d+', 'versionCode 1' }
else { $b = $b -replace '(defaultConfig\s*\{)', "`$1`n        versionCode 1" }
if ($b -match 'versionName') { $b = $b -replace 'versionName\s+["''][^"'']+["'']', 'versionName "1.0.0"' }
else { $b = $b -replace '(defaultConfig\s*\{)', "`$1`n        versionName `"1.0.0`"" }
if ($b -notmatch 'namespace') {
  $b = $b -replace '(android\s*\{)', "`$1`n    namespace `"homeworkout.homeworkouts.noequipment.rebuild`""
}
$b = $b -replace 'minSdkVersion = 24', 'minSdkVersion = 24'
Set-Content -NoNewline -Path "$d\app\build.gradle" -Value $b

# 5. Display name + cleartext HTTP for the local API
Set-Content -NoNewline -Path "$d\app\src\main\res\values\strings.xml" -Value '<resources>
    <string name="app_name">Home Workout</string>
</resources>
'
$m = Get-Content "$d\app\src\main\AndroidManifest.xml" -Raw
$m = $m -replace 'android:allowBackup="false"', 'android:allowBackup="false"`n      android:usesCleartextTraffic="true"'
Set-Content -NoNewline -Path "$d\app\src\main\AndroidManifest.xml" -Value $m

# 6. local.properties
$sdk = 'C:\Users\pc\AppData\Local\Android\Sdk'
$sdkEsc = $sdk -replace '\\', '\\'
Set-Content -NoNewline -Path "$d\local.properties" -Value "sdk.dir=$sdkEsc`n"

Write-Output '[android] project configured'
Write-Output "  package: homeworkout.homeworkouts.noequipment.rebuild"
Write-Output "  component: homeworkout"
Write-Output "  sdk.dir: $sdk"
Get-ChildItem $pkgPath | Select-Object Name
Select-String -Path "$d\app\build.gradle" -Pattern 'applicationId|versionCode|versionName|namespace' | ForEach-Object { $_.Line.Trim() }
