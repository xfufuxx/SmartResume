#!/usr/bin/env bash
# ============================================================
# 智能简历优化系统 · ECS 一键部署脚本
# 用法：在服务器上、项目根目录执行  bash scripts/deploy_ecs.sh
# 前提：已安装 Docker 与 docker compose 插件（见 docs/阿里云ECS部署指南.md 第 2 节）
#      已创建 docker/.env 与 backend/.env（见指南第 4 节）
# ============================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

COMPOSE="docker compose --env-file docker/.env -f docker/docker-compose.yml"

echo "==> [1/6] 检查 Docker 环境"
if ! docker version >/dev/null 2>&1; then
    echo "错误：Docker 未安装或未运行，请先按指南第 2 节安装"; exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
    echo "错误：缺少 docker compose 插件（docker-compose-plugin）"; exit 1
fi

echo "==> [2/6] 检查配置文件"
[ -f backend/.env ] || { echo "错误：backend/.env 不存在（cp backend/.env.example backend/.env 后修改）"; exit 1; }
[ -f docker/.env ]   || { echo "错误：docker/.env 不存在（cp docker/.env.production.example docker/.env 后修改）"; exit 1; }
grep -q "请改成强密码" docker/.env && echo "警告：docker/.env 的 POSTGRES_PASSWORD 还是占位值"

echo "==> [3/6] 构建镜像（首次 10~30 分钟，请耐心等待）"
$COMPOSE build

echo "==> [4/6] 启动服务（db / redis / backend / frontend / nginx，不含 celery_worker）"
$COMPOSE up -d db redis backend frontend nginx

echo "==> [5/6] 等待后端健康检查（经 nginx 反代，最多 5 分钟）"
ok=0
for _ in $(seq 1 60); do
    if curl -fs http://127.0.0.1/health >/dev/null 2>&1; then ok=1; break; fi
    sleep 5
done
if [ "$ok" -ne 1 ]; then
    echo "错误：健康检查超时，请排查："
    echo "  $COMPOSE ps"
    echo "  $COMPOSE logs --tail=100 backend"
    exit 1
fi
echo "后端健康检查通过：$(curl -fs http://127.0.0.1/health)"

echo "==> [6/6] 部署完成"
$COMPOSE ps
echo
echo "验证：浏览器访问 http://你的公网IP （配好域名后为 https://你的域名）"
echo "导入演示数据（可选）：见 docs/阿里云ECS部署指南.md 第 6 节"
echo "配置定时备份（强烈建议）：bash scripts/backup_db.sh 并按 9.2 节加 crontab"
