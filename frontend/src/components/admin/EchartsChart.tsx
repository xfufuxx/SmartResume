'use client'

// admin 页图表组件：echarts 全家桶集中在这里，由页面通过 next/dynamic 按需加载，
// 使 echarts 代码不进入 admin 路由首屏 chunk。
import ReactEChartsCore from 'echarts-for-react/lib/core'
import * as echarts from 'echarts/core'
import { LineChart, BarChart, PieChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent, TitleComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { CSSProperties } from 'react'

echarts.use([LineChart, BarChart, PieChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent, CanvasRenderer])

interface Props {
  option: any
  style?: CSSProperties
}

export default function EchartsChart({ option, style }: Props) {
  return <ReactEChartsCore echarts={echarts} option={option} style={style} />
}
