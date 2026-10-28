# Deploy the API code in this repo to the VPS.
#
# The image is built from /opt/coair-api, so that directory must always hold the
# full committed code. Copying single files into the running container is lost on
# the next rebuild and silently rolls production back.
#
# Ships `git archive HEAD:api`: the whole committed API tree (Dockerfile,
# requirements and lock, vendor, frontend, scripts) with LF line endings, which
# is what CI tested. Server-only files (.env, docker-compose.vps.yml, storage,
# data) are not in git and are left alone.
#
# Usage (from COAir/api):  .\scripts\deploy_vps.ps1

param(
    [string]$Server = "root@187.53.133.40",
    [string]$AppDir = "/opt/coair-api"
)

# Native tools (ssh, docker) write progress to stderr; Windows PowerShell would
# turn that into a terminating error under "Stop". Exit codes are checked instead.
$ErrorActionPreference = "Continue"
# git archive only packs the current directory's part of the tree, so run it
# from the repository root.
Set-Location (git -C $PSScriptRoot rev-parse --show-toplevel)

$dirty = git status --porcelain --untracked-files=no -- api
if ($dirty) {
    Write-Host "Uncommitted API changes - commit them first:" -ForegroundColor Red
    $dirty
    exit 1
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$commit = git rev-parse --short HEAD
$archive = Join-Path $env:TEMP "coair-api-$stamp.tgz"
git archive --format=tar.gz -o $archive HEAD:api
$entries = (tar -tzf $archive | Measure-Object).Count
if ($LASTEXITCODE -ne 0 -or $entries -lt 100) {
    Write-Host "Archive looks wrong ($entries files) - not deploying." -ForegroundColor Red
    exit 1
}
scp -o BatchMode=yes $archive "${Server}:/tmp/coair-api-code.tgz"
if ($LASTEXITCODE -ne 0) { Write-Host "Upload failed." -ForegroundColor Red; exit 1 }
Remove-Item $archive

$remote = @"
set -eo pipefail
cd $AppDir
tar --exclude=./storage --exclude=./data --exclude=./logs --exclude=./.env \
    -czf /root/coair-api-code-backup-$stamp.tgz .
tar -xzf /tmp/coair-api-code.tgz -C $AppDir && rm /tmp/coair-api-code.tgz
docker compose -f docker-compose.vps.yml build api 2>&1 | tail -3
docker compose -f docker-compose.vps.yml up -d api 2>&1 | tail -1
echo $commit > $AppDir/DEPLOYED_COMMIT
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
Write-Host "Deployed $commit" -ForegroundColor Green
