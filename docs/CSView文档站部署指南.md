# CSView 文档站部署指南（与智能简历共存）

## 项目信息

| 项 | 值 |
|---|---|
| 仓库 | `xfufuxx/csview_private`（私有，拉取需 PAT） |
| 技术栈 | VuePress 2.0.0-beta.61 + vuepress-theme-hope（**纯静态站**） |
| 内容 | CSView 计算机招聘知识分享（算法/Java/Golang/MySQL/Redis/K8s/OS 等八股文，全部 markdown） |
| 访问地址 | `http://121.40.191.169/csview/` |
| 部署方式 | 构建产物 dist 放宿主机 `/opt/csview/dist`，挂载进 nginx 容器静态目录 |

## 架构说明

CSView 是纯静态站，**不需要自己的容器、不需要数据库、不占端口**：

```
浏览器 → nginx:80 /csview/ → root /usr/share/nginx/html/csview（宿主机 /opt/csview/dist）
```

与智能简历的关系：共用同一个 nginx（唯一 80 入口），新增了一个 `location /csview/`。智能简历的 `/api/`、`/` 反代完全不受影响。

## 已做的改动（重要，重新构建时别丢）

源码改了两类共 5 处，**因为部署在子路径 `/csview/` 而不是根路径**，且原仓库存在构建 bug：

1. `base: "/"` → `base: "/csview/"` —— 不改这个，所有 JS/CSS 资源会 404，页面全白
2. favicon `href: '/logo.png'` → `href: '/csview/logo.png'` —— head 里的手写绝对路径不会自动加 base
3. **删掉 3 处死图引用**：`src/os/` 下 filesystem.md / process.md / serverprogramming.md 引用了作者本机 Typora 路径（`C:\Users\zijing2333\AppData\Roaming\Typora\...`）的图片，仓库里没有这些文件，vite 直接构建失败
4. **加 cytoscape alias**（config.ts 的 viteBundler.resolve.alias）：mermaid 的 mindmap 模块 `import cytoscape from "cytoscape/dist/cytoscape.umd.js"`，而 cytoscape 3.34.3 的 exports 只给该路径开 `require` condition，ESM 构建报 "No known conditions"。alias 到真实文件路径绕过（文件确实存在于 `node_modules/cytoscape/dist/cytoscape.umd.js`）。作者原有的 `optimizeDeps.exclude` 只对 dev 生效，对 build 无效

另外：**安装依赖必须用 `npm install` 而不是 `npm ci`**——仓库的 package-lock.json 与 package.json 不同步（rollup 版本冲突），`npm ci` 会直接报错拒绝安装。

部署包 `src/` 目录里存的就是改好的版本，以后重新构建直接用。

## 首次部署步骤

```bash
# 1. 上传部署包（本地执行）
scp D:\csview_deploy.tar.gz root@121.40.191.169:/root/

# 2. 服务器上解压（解压后就是 /tmp/csview_deploy/dist，只有一层 csview_deploy）
tar -xzf /root/csview_deploy.tar.gz -C /tmp
ls /tmp/csview_deploy/

# 3. 静态文件落到 /opt/csview/dist（必须在重启 nginx 之前，否则挂载到空目录）
mkdir -p /opt/csview
cp -rf /tmp/csview_deploy/dist /opt/csview/

# 4. 备份并替换配置
#    坑：阿里云 ECS 默认 root 环境有 alias cp='cp -i'，且 GNU cp 只要带 -i 就弹
#    overwrite? 确认，-f 压不住 -i（已实测）。必须先 unalias，否则每个 cp 都卡住
cd /opt/smart-resume
unalias cp mv rm 2>/dev/null
cp -f docker/nginx.conf docker/nginx.conf.bak.$(date +%Y%m%d)
cp -f docker/docker-compose.yml docker/docker-compose.yml.bak.$(date +%Y%m%d)
cp -f /tmp/csview_deploy/nginx.conf docker/nginx.conf
cp -f /tmp/csview_deploy/docker-compose.yml docker/docker-compose.yml

# 5. 重建 nginx 容器（挂载新静态目录，nginx 镜像已 CACHED，几秒完成）
docker compose --env-file docker/.env -f docker/docker-compose.yml up -d nginx

# 6. 验证
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1/csview/          # 期望 200
curl -s http://127.0.0.1/csview/ | grep -o '<title>[^<]*</title>'          # 期望 CSView 标题
```

浏览器打开 `http://121.40.191.169/csview/` 即可。

## 以后更新内容（作者改了仓库里的 md）

两种方式，推荐 A：

**A. 本地重新构建（需要本地 node ≥ 18）**

```bash
cd D:/csview_build/csview_private-main
# 拉最新代码/改完 md 后（注意保留 base: "/csview/" 改动！）
D:/nodejs/node.exe D:/nodejs/node_modules/npm/bin/npm-cli.js run build
# 产物在 src/.vuepress/dist，打包上传：
tar -czf D:/csview_dist.tar.gz -C src/.vuepress/dist .
scp D:/csview_dist.tar.gz root@121.40.191.169:/root/
```

服务器上：

```bash
\rm -rf /opt/csview/dist/* && tar -xzf /root/csview_dist.tar.gz -C /opt/csview/dist
# 静态文件直接生效，不用 reload（nginx 每次请求实时读盘）
```
（`\rm` 的反斜杠是绕过 root 默认的 `alias rm='rm -i'`，否则删之前又会弹确认；`cp` 同理用 `\cp` 或先 `unalias cp mv rm 2>/dev/null`）

**B. 服务器上直接构建（一次配好，以后只拉代码）**

```bash
# 首次：把改好 base 的源码放服务器
# /opt/csview/src/（部署包里已带）

# 以后更新：
cd /opt/csview/src
git pull   # 或重新上传源码覆盖
docker run --rm -v /opt/csview/src:/app -w /app node:20-alpine \
  sh -c "npm install --registry=https://registry.npmmirror.com && npm run build"
\rm -rf /opt/csview/dist/* && \cp -r src/.vuepress/dist/. /opt/csview/dist/
```

## 注意事项

1. **必须走子路径**：`base: "/csview/"` 与 nginx `location /csview/` 是配套的。如果以后买了独立域名（如 csguide.xyz）要改成根路径部署，需要同时把 base 改回 `/`、nginx 加独立 server 块——别只改一边
2. **统计脚本**：config.ts 的 head 里保留了作者的百度统计 + matomo（指向 `www.csguide.xyz`）。数据会发到作者自己的统计服务，不影响站点功能；介意就在构建前删掉那段 head 配置
3. **挂载路径**：compose 里写的是宿主机绝对路径 `/opt/csview/dist`，目录不存在时 nginx 容器会启动失败（Docker 自动创建空目录的行为取决于配置），先建好目录再 `up -d`
4. **不要给 CSView 映射 80 端口**：宿主机 80 已被智能简历 nginx 独占，新服务一律走反代

## 排障

| 现象 | 原因 | 处理 |
|---|---|---|
| 页面全白/控制台 JS 404 | base 没改或改错 | 确认 config.ts 是 `base: "/csview/"` 后重新构建 |
| `/csview/` 返回智能简历首页 | nginx 没 reload 或容器没重建 | `exec nginx nginx -s reload`；检查 `/opt/csview/dist/index.html` 存在 |
| 404 Not Found（nginx 风格） | dist 目录空或挂载没生效 | `docker compose exec nginx ls /usr/share/nginx/html/csview` |
| 子页面 404 | VuePress clean URL 需要 `$uri/` 回退 | try_files 已含 `$uri/ /csview/index.html`，检查配置是否被覆盖回旧版 |
