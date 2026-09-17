/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  // 生产环境关闭浏览器 source map，减小 _next/static 体积、加快下载与解析
  productionBrowserSourceMaps: false,
  experimental: {
    // 对 antd 与图标库做按需导入优化，显著减小打包体积与首屏加载时间
    optimizePackageImports: [
      'antd',
      '@ant-design/icons',
      // echarts v6 已支持 tree-shaking，但显式纳入可确保打包器只引入用到的子模块
      'echarts',
      'echarts-for-react',
    ],
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/:path*`,
      },
    ]
  },
  async headers() {
    return [
      // 构建产物哈希命名、内容不可变：交由浏览器/CDN/反向代理长期缓存，
      // 多用户并发访问时静态资源近乎零延迟命中缓存，极大缓解首页与路由切换负载
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      // 全局安全响应头（不影响业务；/api 经 rewrites 代理，头透传无害）
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ]
  },
}

module.exports = nextConfig
