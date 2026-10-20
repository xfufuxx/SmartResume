#!/usr/bin/env bash
# ============================================================
# 智能简历系统 · 服务器端代码更新脚本（docker compose 部署）
# 用法（在服务器上、项目根目录执行）：
#   bash scripts/update_server.sh [tar包路径] [服务...]
# 示例：
#   bash scripts/update_server.sh
#       → 默认用 /root/app.tar.gz，重建 backend + celery_worker + frontend
#   bash scripts/update_server.sh /root/app.tar.gz backend celery_worker
#       → 只改了后端时用，跳过前端构建省约 2 分钟
# 流程：更新前自动备份数据库 → 存代码回滚点 → 解压覆盖（绝不覆盖 .env）
#       → 按需重建 → 健康检查，失败时打印回滚命令
# 本地打包命令见 docs/极简部署教程.md 第 4 步（已排除 .env，上传不含密钥）
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TAR="${1:-/root/app.tar.gz}"
if [ $# -gt 0 ]; then shift; fi
SERVICES=("$@")
if [ ${#SERVICES[@]} -eq 0 ]; then
  SERVICES=(backend celery_worker frontend)
fi

COMPOSE="docker compose --env-file docker/.env -f docker/docker-compose.yml"

if [ ! -f "$TAR" ]; then
  echo "错误：找不到代码包 $TAR（先按教程第 4 步 scp 上传）"
  exit 1
fi

echo "==> 1/5 更新前自动备份数据库"
bash scripts/backup_db.sh

echo "==> 2/5 保存代码回滚点"
TS="$(date +%Y%m%d_%H%M%S)"
mkdir -p /root/rollback
# 注意：--exclude 必须放在位置参数（smart-resume）之前，否则 GNU tar 报
# "options were used after any non-optional arguments" 直接失败退出
tar -czf "/root/rollback/code_$TS.tar.gz" -C /opt \
  --exclude='smart-resume/frontend/node_modules' \
  --exclude='smart-resume/frontend/.next' \
  --exclude='smart-resume/backups' \
  --exclude='smart-resume/logs' \
  smart-resume
echo "    回滚点：/root/rollback/code_$TS.tar.gz"

echo "==> 3/5 解压新代码（排除 .env，服务器上的 Key/密码/SMTP 配置不被覆盖）"
tar -xzf "$TAR" -C "$ROOT" --exclude='backend/.env' --exclude='docker/.env'

echo "==> 4/5 重建并重启：${SERVICES[*]}"
$COMPOSE up -d --build "${SERVICES[@]}"

echo "==> 5/5 健康检查（最多等 60 秒）"
OK=0
for _ in $(seq 1 30); do
  if curl -sf http://127.0.0.1/health >/dev/null 2>&1; then OK=1; break; fi
  sleep 2
done

if [ "$OK" = "1" ]; then
  echo "更新完成 ✓  浏览器访问 http://121.40.191.169"
else
  echo "健康检查失败！按以下命令回滚到更新前："
  echo "  cd /opt && rm -rf smart-resume && tar -xzf /root/rollback/code_$TS.tar.gz -C /opt && cd smart-resume"
  echo "  $COMPOSE up -d --build"
  echo "（uploads 卷与 pgdata 卷不受回滚影响；回滚前可先 docker compose logs backend 看真实报错）"
  exit 1
fi
