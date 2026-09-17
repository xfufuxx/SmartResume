'use client'

import useSWR, { type SWRConfiguration } from 'swr'

/**
 * 统一客户端数据缓存封装，为多用户并发与面板间快速切换服务：
 * - dedupingInterval：并发 / 短时间内的重复请求自动合并，降低后端压力
 * - revalidateOnFocus=false：面板切回前台不盲目重拉，由 staleTime 控制刷新
 * - keepPreviousData：路由切换回该面板时先渲染旧数据（瞬时），再后台静默刷新
 * - errorRetryCount=0：单点故障不重试风暴，避免雪崩式请求
 *
 * key 传 null 时 SWR 自动禁用（如未登录），符合 Rules of Hooks。
 */
export function useApiData<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  options?: SWRConfiguration<T>,
) {
  return useSWR<T>(key, fetcher, {
    revalidateOnFocus: false,
    revalidateOnReconnect: true,
    dedupingInterval: 30_000,
    keepPreviousData: true,
    errorRetryCount: 0,
    ...options,
  })
}
