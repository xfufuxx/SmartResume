import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HOT_CITIES, PROVINCE_CITIES, findProvinceOfCity } from '../cities.ts'

test('省份列表覆盖 31 个省级区划，无重复省份/城市', () => {
  assert.equal(PROVINCE_CITIES.length, 31)
  const provinces = PROVINCE_CITIES.map((p) => p.province)
  assert.equal(new Set(provinces).size, provinces.length)
  const seen = new Set<string>()
  for (const p of PROVINCE_CITIES) {
    for (const c of p.cities) {
      assert.ok(!seen.has(c), `城市重复：${c}`)
      seen.add(c)
    }
  }
})

test('直辖市城市列表就是自身', () => {
  for (const name of ['北京', '上海', '天津', '重庆']) {
    const p = PROVINCE_CITIES.find((x) => x.province === name)
    assert.ok(p, `缺少直辖市 ${name}`)
    assert.deepEqual(p.cities, [name])
  }
})

test('findProvinceOfCity 反查省份', () => {
  assert.equal(findProvinceOfCity('杭州'), '浙江')
  assert.equal(findProvinceOfCity('深圳'), '广东')
  assert.equal(findProvinceOfCity('北京'), '北京')
  assert.equal(findProvinceOfCity('不存在市'), null)
  assert.equal(findProvinceOfCity(null), null)
  assert.equal(findProvinceOfCity(undefined), null)
})

test('热门城市全部存在于数据集', () => {
  for (const c of HOT_CITIES) {
    assert.notEqual(findProvinceOfCity(c), null, `热门城市 ${c} 不在省份映射中`)
  }
})
