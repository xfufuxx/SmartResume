/** 后端基址唯一来源：axios 实例、SSE fetch、文件 URL 拼接都用它。 */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
