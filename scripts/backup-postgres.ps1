param(
  [string]$DatabaseUrl = $env:DATABASE_URL,
  [string]$BackupRoot = (Join-Path $PSScriptRoot '..\backups\postgres'),
  [string]$PgBinPath = 'C:\Program Files\PostgreSQL\18\bin'
)

$ErrorActionPreference = 'Stop'

if (-not $DatabaseUrl) {
  throw 'DATABASE_URL fehlt. Bitte als Umgebungsvariable setzen oder -DatabaseUrl uebergeben.'
}

$uri = [System.Uri]$DatabaseUrl
$userInfo = $uri.UserInfo.Split(':', 2)
$username = if ($userInfo.Length -gt 0) { [System.Uri]::UnescapeDataString($userInfo[0]) } else { '' }
$password = if ($userInfo.Length -gt 1) { [System.Uri]::UnescapeDataString($userInfo[1]) } else { $env:PGPASSWORD }
$database = $uri.AbsolutePath.TrimStart('/')
$hostName = $uri.Host
$port = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }

if (-not $password) {
  throw 'Kein PostgreSQL-Passwort gefunden. In DATABASE_URL oder PGPASSWORD setzen.'
}
if (-not (Test-Path $BackupRoot)) {
  New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null
}

$BackupRoot = [System.IO.Path]::GetFullPath($BackupRoot)
$timestamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
$fileName = "$database-$timestamp.dump"
$targetFile = Join-Path $BackupRoot $fileName
$pgDump = Join-Path $PgBinPath 'pg_dump.exe'

if (-not (Test-Path $pgDump)) {
  throw "pg_dump nicht gefunden: $pgDump"
}

$env:PGPASSWORD = $password
& $pgDump --format=custom --no-owner --no-privileges --host=$hostName --port=$port --username=$username --file=$targetFile $database
if ($LASTEXITCODE -ne 0) {
  throw "pg_dump fehlgeschlagen mit Exit-Code $LASTEXITCODE"
}

Write-Host "Backup erfolgreich erstellt: $targetFile"
