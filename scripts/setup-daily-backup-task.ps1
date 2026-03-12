param(
  [string]$TaskName = 'Fuhrparkmanagement PostgreSQL Backup',
  [string]$StartTime = '20:00',
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
)

$ErrorActionPreference = 'Stop'

$backupScript = Join-Path $ProjectRoot 'scripts\backup-postgres.ps1'
if (-not (Test-Path $backupScript)) {
  throw "Backup-Skript nicht gefunden: $backupScript"
}

$databaseUrl = [Environment]::GetEnvironmentVariable('DATABASE_URL', 'User')
$pgPassword = [Environment]::GetEnvironmentVariable('PGPASSWORD', 'User')

if (-not $databaseUrl -or -not $pgPassword) {
  throw 'Bitte zuerst setup-postgres-env.ps1 ausfuehren oder DATABASE_URL und PGPASSWORD als Benutzer-Variablen setzen.'
}

$runAt = [datetime]::ParseExact($StartTime, 'HH:mm', $null)
$actionArgs = '-NoProfile -ExecutionPolicy Bypass -File "' + $backupScript + '"'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $actionArgs
$trigger = New-ScheduledTaskTrigger -Daily -At $runAt
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description 'Taegliches PostgreSQL-Backup fuer Fuhrparkmanagement' -Force | Out-Null

Write-Host "Geplantes Backup eingerichtet: $TaskName um $StartTime Uhr"
