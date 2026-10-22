/**
 * useMediaQuery —— SSR 安全的 matchMedia 订阅 hook。
 *
 * 初始返回 fallback（服务端/首帧没有 window.matchMedia），mount 后同步
 * 真实值，断点变化时重渲染。比纯 CSS 降级多一个能力：JS 侧需要知道
 * 「当前是不是窄屏」来决定渲染哪套组件（如画布只读 + 排序面板）。
 */

import { useEffect, useState } from 'react';

export function useMediaQuery(query: string, fallback = false): boolean {
  const [matches, setMatches] = useState(fallback);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(query);
    const sync = () => setMatches(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [query]);

  return matches;
}
