'use client'

/**
 * 面试环节进度条：把「现在到哪一步、还剩几个环节」直接摆出来。
 *
 * 环节顺序与题数全部来自后端 plan（interview_flow 计算），前端只负责渲染，
 * 不硬编码流程——否则后端调整流程时前端会悄悄说谎。
 */
import React from 'react'
import { CheckOutlined } from '@ant-design/icons'

import { stageUsed } from '@/lib/interview-chat'
import type { InterviewPlanItem, InterviewStageKey } from '@/types'

export default function StageRail({
  plan,
  stageKey,
  asked,
  finished,
}: {
  plan?: InterviewPlanItem[] | null
  stageKey?: InterviewStageKey | null
  asked: number
  finished?: boolean
}) {
  if (!plan?.length) return null
  const found = plan.findIndex((item) => item.key === stageKey)
  const activeIdx = found < 0 ? 0 : found

  return (
    <div className="mock-rail" data-testid="mock-stage-rail" role="list" aria-label="面试环节进度">
      {plan.map((item, index) => {
        const used = stageUsed(item, asked)
        // 结束后不能一律打勾：没走到/没问满的环节要如实标出来，
        // 否则「复盘写着专业能力 0/2，顶部却全绿」会自相矛盾。
        const state = finished
          ? used >= item.count
            ? 'done'
            : used > 0
              ? 'partial'
              : 'skipped'
          : index < activeIdx
            ? 'done'
            : index === activeIdx
              ? 'active'
              : 'todo'
        return (
          <div
            key={item.key}
            role="listitem"
            className={`mock-rail-item ${state}`}
            data-testid={`mock-stage-${item.key}`}
            data-state={state}
            title={state === 'skipped' ? '本场未进行到这里' : item.focus}
          >
            <span className="mock-rail-dot">
              {state === 'done' ? <CheckOutlined /> : index + 1}
            </span>
            <span className="mock-rail-body">
              <span className="mock-rail-label">{item.label}</span>
              <span className="mock-rail-count">
                {state === 'skipped' ? '未进行' : `${used}/${item.count}`}
              </span>
            </span>
          </div>
        )
      })}
    </div>
  )
}
