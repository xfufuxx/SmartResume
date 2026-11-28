'use client'

import { useEffect, useState } from 'react'
import { Popover } from 'antd'
import {
  CaretDownFilled, CloseCircleFilled, EnvironmentOutlined,
} from '@ant-design/icons'
import { HOT_CITIES, PROVINCE_CITIES, findProvinceOfCity } from '@/lib/cities'

interface CityPickerProps {
  value?: string
  onChange: (v?: string) => void
}

/**
 * 城市 = 点击弹出「省份 → 城市」级联卡片：
 * 左列选省，右侧网格选市；直辖市点击省份即选中；顶部有热门城市快捷区。
 */
export default function CityPicker({ value, onChange }: CityPickerProps) {
  const [open, setOpen] = useState(false)
  const [province, setProvince] = useState<string | null>(null)

  // 每次展开时，让左列定位到当前城市所属的省（历史值可能不在数据集里）
  useEffect(() => {
    if (open) setProvince(findProvinceOfCity(value))
  }, [open, value])

  const select = (city: string) => {
    onChange(city)
    setOpen(false)
  }

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange(undefined)
  }

  const trigger = (
    <button
      type="button"
      className="match-city-trigger"
      data-testid="match-city-trigger"
    >
      <span className={value ? 'match-city-text has-value' : 'match-city-text'}>
        <EnvironmentOutlined style={{ marginRight: 6 }} />
        {value || '期望城市'}
      </span>
      {value && (
        <CloseCircleFilled
          className="match-city-clear"
          data-testid="match-city-clear"
          onClick={clear}
        />
      )}
      <CaretDownFilled style={{ fontSize: 10, color: 'var(--text-quaternary)' }} />
    </button>
  )

  const cities = province ? (PROVINCE_CITIES.find((p) => p.province === province)?.cities ?? []) : []

  const panel = (
    <div className="match-city-panel" data-testid="match-city-popover">
      {/* 热门城市快捷区 */}
      <div className="match-city-hot">
        <span className="match-city-cat">热门</span>
        <div className="match-city-chips">
          {HOT_CITIES.map((c) => (
            <button
              key={c}
              type="button"
              className={`match-city-chip${c === value ? ' active' : ''}`}
              onClick={() => select(c)}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="match-city-divider" />

      {/* 省份 → 城市两栏级联 */}
      <div className="match-city-cascade">
        <div className="match-city-provinces">
          {PROVINCE_CITIES.map((p) => (
            <button
              key={p.province}
              type="button"
              className={`match-city-province${p.province === province ? ' active' : ''}`}
              onClick={() => {
                // 直辖市：点击省份即完成选择
                if (p.cities.length === 1) select(p.cities[0])
                else setProvince(p.province)
              }}
            >
              {p.province}
            </button>
          ))}
        </div>
        <div className="match-city-right">
          {province ? (
            <div className="match-city-chips">
              {cities.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={`match-city-chip${c === value ? ' active' : ''}`}
                  data-testid="match-city-option"
                  onClick={() => select(c)}
                >
                  {c}
                </button>
              ))}
            </div>
          ) : (
            <div className="match-city-hint">先在左侧选择省份，再选具体城市</div>
          )}
        </div>
      </div>

      {value && (
        <>
          <div className="match-city-divider" />
          <button type="button" className="match-city-clear-all" onClick={() => { onChange(undefined); setOpen(false) }}>
            清除已选（{value}）
          </button>
        </>
      )}
    </div>
  )

  return (
    <Popover
      content={panel}
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      placement="bottomLeft"
      arrow={false}
      styles={{ body: { padding: 0 } }}
    >
      {trigger}
    </Popover>
  )
}
