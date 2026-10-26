# Deploy the API code in this repo to the VPS.
#
# The image is built from /opt/coair-api, so that directory must always hold the
# full committed code. Copying single files into the running container is lost on
# the next rebuild and silently rolls production back.
#
# Usage (from COAir/api):  .\scripts\deploy_vps.ps1

param(
    [string]$Server = "root@187.53.133.40",
    [string]$AppDir = "/opt/coair-api"
)

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

$dirty = git status --porcelain -- backend src config migrations
if ($dirty) {
    Write-Host "Uncommitted API changes - commit them first:" -ForegroundColor Red
    $dirty
    exit 1
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$archive = Join-Path $env:TEMP "coair-api-$stamp.tgz"
tar --exclude=__pycache__ --exclude=*.pyc -czf $archive backend src config migrations tests
scp -o BatchMode=yes $archive "${Server}:/tmp/coair-api-code.tgz"
Remove-Item $archive

$remote = @"
set -e
cd $AppDir
tar -czf /root/coair-api-code-backup-$stamp.tgz backend src config migrations tests
tar -xzf /tmp/coair-api-code.tgz -C $AppDir && rm /tmp/coair-api-code.tgz
docker compose -f docker-compose.vps.yml build api | tail -1
docker compose -f docker-compose.vps.yml up -d api | tail -1
for i in `$(seq 1 40); do
  sleep 6
  state=`$(docker inspect coair-api --format '{{.State.Health.Status}}')
  [ "`$state" = healthy ] && break
done
echo "health: `$state (backup: /root/coair-api-code-backup-$stamp.tgz)"
[ "`$state" = healthy ]
"@
$remote -replace "`r", "" | ssh -o BatchMode=yes $Server "bash -s"
if ($LASTEXITCODE -ne 0) {
    Write-Host "API is not healthy. Roll back with:" -ForegroundColor Red
    Write-Host "  ssh $Server 'cd $AppDir && tar -xzf /root/coair-api-code-backup-$stamp.tgz && docker compose -f docker-compose.vps.yml up -d --build api'"
    exit 1
}
Write-Host "Deployed $(git rev-parse --short HEAD)" -ForegroundColor Green
