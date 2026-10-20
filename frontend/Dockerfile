FROM node:20-alpine AS builder

WORKDIR /app

# 构建期内联的公开变量：Next.js 在 npm run build 时把 NEXT_PUBLIC_* 烘焙进产物，
# 必须是浏览器能直接访问的后端地址（同域由 nginx 反代，或独立 API 子域），
# 不能填 http://backend:8000 这类仅容器网络可解析的地址。
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

COPY package.json .
# 国内网络：npm 换 npmmirror 源（海外部署可删掉 --registry 参数）
RUN npm install --registry=https://registry.npmmirror.com

COPY . .
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO- http://localhost:3000/ || exit 1

CMD ["node", "server.js"]
