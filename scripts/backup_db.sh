#!/usr/bin/env bash
# ============================================================
# 智能简历系统 · 数据库备份脚本
# 用法：在服务器上、项目根目录执行  bash scripts/backup_db.sh
# 产出：backups/smart_resume_YYYYMMDD_HHMMSS.sql.gz（gzip 压缩的 pg_dump 全量）
# 定时：crontab -e 添加
#   0 3 * * * cd /opt/smart-resume && bash scripts/backup_db.sh >> logs/backup.log 2>&1
# 环境变量：KEEP=保留最近N份(默认7)  BACKUP_DIR=备份目录(默认项目下 backups/)
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

COMPOSE="docker compose --env-file docker/.env -f docker/docker-compose.yml"
BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups}"
KEEP="${KEEP:-7}"

mkdir -p "$BACKUP_DIR"
TS="$(date +%Y%m%d_%H%M%S)"
OUT="$BACKUP_DIR/smart_resume_$TS.sql.gz"

echo "[$(date '+%F %T')] 开始备份 → $OUT"
$COMPOSE exec -T db pg_dump -U postgres -d smart_resume | gzip > "$OUT"
echo "[$(date '+%F %T')] 备份完成：$(du -h "$OUT" | cut -f1)"

# 清理旧备份，仅保留最近 KEEP 份
ls -1t "$BACKUP_DIR"/smart_resume_*.sql.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f
echo "[$(date '+%F %T')] 已保留最近 $KEEP 份备份"
