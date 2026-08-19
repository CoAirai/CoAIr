#!/usr/bin/env bash
set -Eeuo pipefail

# Retention for the pre-deploy backups written by create_deploy_backup.sh.
#
# That script deliberately never deletes anything, so the backup root grows by
# one archive per deploy forever. This is the counterpart: it keeps the newest
# verified backups (plus any full backup a kept incremental still needs) and
# removes the rest. It prints what it would delete and changes nothing unless
# --apply is passed.
#
#   scripts/prune_deploy_backups.sh                 # dry run, keeps 3
#   scripts/prune_deploy_backups.sh --keep 5        # dry run, keeps 5
#   scripts/prune_deploy_backups.sh --apply         # actually delete

APP_DIR="${APP_DIR:-/opt/mvp-api}"
BACKUP_ROOT="${BACKUP_ROOT:-$APP_DIR/.deploy-backups}"
KEEP="${KEEP:-3}"
APPLY=0
# A backup still being written must never be a deletion candidate. The deploy
# stops the API for the duration, so anything touched recently is in flight.
MIN_AGE_MINUTES="${MIN_AGE_MINUTES:-60}"

while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1 ;;
    --dry-run) APPLY=0 ;;
    --keep) KEEP="${2:?--keep needs a number}"; shift ;;
    --backup-root) BACKUP_ROOT="${2:?--backup-root needs a path}"; shift ;;
    -h|--help) sed -n '3,20p' "$0"; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

case "$BACKUP_ROOT" in
  ""|/|/opt|/usr|/var|/home|/etc) echo "Unsafe BACKUP_ROOT: $BACKUP_ROOT" >&2; exit 2 ;;
esac
case "$KEEP" in
  ''|*[!0-9]*) echo "--keep must be a non-negative integer: $KEEP" >&2; exit 2 ;;
esac
if [ "$KEEP" -lt 1 ]; then
  echo "Refusing to keep zero backups." >&2
  exit 2
fi
if [ ! -d "$BACKUP_ROOT" ]; then
  echo "No backup root at $BACKUP_ROOT — nothing to prune."
  exit 0
fi

is_verified() {
  [ -s "$1/application-data.tar" ] && [ -s "$1/SHA256SUMS" ] && [ -s "$1/manifest.txt" ]
}

manifest_value() {
  sed -n "s/^$2=//p" "$1/manifest.txt" 2>/dev/null | tail -1
}

# Newest first. Directory names are UTC timestamps, so lexical order is
# chronological — the same assumption create_deploy_backup.sh makes when it
# looks for a base backup.
mapfile -t all_dirs < <(find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -print | sort -r)

if [ "${#all_dirs[@]}" -eq 0 ]; then
  echo "No backups under $BACKUP_ROOT."
  exit 0
fi

keep_list=()
delete_list=()
verified_kept=0

for dir in "${all_dirs[@]}"; do
  if [ -n "$(find "$dir" -maxdepth 1 -newermt "-$MIN_AGE_MINUTES minutes" -print -quit)" ]; then
    keep_list+=("$dir  (in flight / too recent)")
    continue
  fi
  if ! is_verified "$dir"; then
    delete_list+=("$dir")
    continue
  fi
  if [ "$verified_kept" -lt "$KEEP" ]; then
    keep_list+=("$dir  ($(manifest_value "$dir" backup_mode))")
    verified_kept=$((verified_kept + 1))
  else
    delete_list+=("$dir")
  fi
done

# An incremental archive only holds storage/ plus the source files added since
# its base full backup. Deleting that base would leave the incremental
# unrestorable, so pull any referenced base back out of the delete list.
for dir in "${all_dirs[@]}"; do
  case " ${keep_list[*]-} " in *" $dir "*) ;; *) continue ;; esac
  base="$(manifest_value "$dir" base_backup)"
  [ -n "$base" ] || continue
  [ -d "$base" ] || continue
  for i in "${!delete_list[@]}"; do
    if [ "${delete_list[$i]}" = "$base" ]; then
      unset 'delete_list[i]'
      keep_list+=("$base  (base of a kept incremental)")
    fi
  done
done
delete_list=("${delete_list[@]-}")

echo "Backup root: $BACKUP_ROOT"
echo "Keeping ($verified_kept verified + dependencies):"
for entry in "${keep_list[@]-}"; do
  [ -n "$entry" ] && echo "  KEEP   $entry"
done

freed_kib=0
echo "Removing:"
have_deletions=0
for dir in "${delete_list[@]-}"; do
  [ -n "$dir" ] || continue
  have_deletions=1
  size_kib="$(du -sk "$dir" | awk '{print $1 + 0}')"
  freed_kib=$((freed_kib + size_kib))
  reason="aged out"
  is_verified "$dir" || reason="incomplete/failed backup"
  echo "  DELETE $dir  ($((size_kib / 1024)) MiB, $reason)"
done
if [ "$have_deletions" -eq 0 ]; then
  echo "  (nothing)"
fi

echo "Reclaimable: $((freed_kib / 1024)) MiB"

if [ "$APPLY" -ne 1 ]; then
  echo "Dry run — re-run with --apply to delete."
  exit 0
fi

for dir in "${delete_list[@]-}"; do
  [ -n "$dir" ] || continue
  rm -rf -- "$dir"
done
echo "Pruned. Remaining:"
df -Ph "$BACKUP_ROOT" | tail -1
