param(
  [string]$DatabaseUrl = $env:DATABASE_URL,
  [string]$BackupFile,
  [string]$PgBinPath = 'C:\Program Files\PostgreSQL\18\bin'
)

$ErrorActionPreference = 'Stop'

if (-not $DatabaseUrl) {
  throw 'DATABASE_URL fehlt. Bitte als Umgebungsvariable setzen oder -DatabaseUrl uebergeben.'
}
if (-not $BackupFile) {
  throw 'Bitte -BackupFile mitgeben.'
}
if (-not (Test-Path $BackupFile)) {
  throw "Backup-Datei nicht gefunden: $BackupFile"
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

$BackupFile = [System.IO.Path]::GetFullPath($BackupFile)
$pgRestore = Join-Path $PgBinPath 'pg_restore.exe'
if (-not (Test-Path $pgRestore)) {
  throw "pg_restore nicht gefunden: $pgRestore"
}

$env:PGPASSWORD = $password
& $pgRestore --clean --if-exists --no-owner --no-privileges --host=$hostName --port=$port --username=$username --dbname=$database $BackupFile
if ($LASTEXITCODE -ne 0) {
  throw "pg_restore fehlgeschlagen mit Exit-Code $LASTEXITCODE"
}

Write-Host "Restore erfolgreich abgeschlossen aus: $BackupFile"
