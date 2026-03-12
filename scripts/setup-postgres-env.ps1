param(
  [Parameter(Mandatory = $true)]
  [string]$DatabaseUrl,
  [Parameter(Mandatory = $true)]
  [string]$PgPassword
)

$ErrorActionPreference = 'Stop'

setx DATABASE_URL $DatabaseUrl | Out-Null
setx PGPASSWORD $PgPassword | Out-Null

Write-Host 'Benutzer-Umgebungsvariablen gespeichert.'
Write-Host 'Bitte PowerShell oder Windows einmal neu oeffnen, damit die Werte ueberall verfuegbar sind.'
