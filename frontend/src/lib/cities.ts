/** 省 / 直辖市 → 主要城市映射（求职场景常用集合，非全量行政区划） */
export interface ProvinceCities {
  province: string
  cities: string[]
}

export const PROVINCE_CITIES: ProvinceCities[] = [
  { province: '北京', cities: ['北京'] },
  { province: '上海', cities: ['上海'] },
  { province: '天津', cities: ['天津'] },
  { province: '重庆', cities: ['重庆'] },
  { province: '广东', cities: ['广州', '深圳', '珠海', '佛山', '东莞', '中山', '惠州', '汕头', '江门', '湛江'] },
  { province: '江苏', cities: ['南京', '苏州', '无锡', '常州', '南通', '徐州', '扬州', '镇江', '泰州', '盐城', '淮安', '连云港'] },
  { province: '浙江', cities: ['杭州', '宁波', '温州', '嘉兴', '绍兴', '金华', '台州', '湖州', '义乌', '舟山'] },
  { province: '山东', cities: ['济南', '青岛', '烟台', '潍坊', '临沂', '淄博', '威海', '济宁', '东营', '日照'] },
  { province: '四川', cities: ['成都', '绵阳', '德阳', '宜宾', '泸州', '南充', '乐山'] },
  { province: '湖北', cities: ['武汉', '宜昌', '襄阳', '荆州', '黄石'] },
  { province: '湖南', cities: ['长沙', '株洲', '湘潭', '衡阳', '岳阳', '常德'] },
  { province: '河南', cities: ['郑州', '洛阳', '开封', '新乡', '南阳'] },
  { province: '河北', cities: ['石家庄', '保定', '唐山', '廊坊', '沧州', '邯郸'] },
  { province: '陕西', cities: ['西安', '咸阳', '宝鸡', '渭南'] },
  { province: '福建', cities: ['福州', '厦门', '泉州', '漳州', '莆田', '宁德'] },
  { province: '安徽', cities: ['合肥', '芜湖', '蚌埠', '马鞍山', '安庆'] },
  { province: '辽宁', cities: ['沈阳', '大连', '鞍山', '锦州'] },
  { province: '吉林', cities: ['长春', '吉林'] },
  { province: '黑龙江', cities: ['哈尔滨', '大庆', '齐齐哈尔'] },
  { province: '山西', cities: ['太原', '大同', '晋中'] },
  { province: '江西', cities: ['南昌', '赣州', '九江', '上饶'] },
  { province: '云南', cities: ['昆明', '大理', '曲靖'] },
  { province: '贵州', cities: ['贵阳', '遵义'] },
  { province: '广西', cities: ['南宁', '桂林', '柳州', '北海'] },
  { province: '海南', cities: ['海口', '三亚'] },
  { province: '甘肃', cities: ['兰州'] },
  { province: '内蒙古', cities: ['呼和浩特', '包头', '鄂尔多斯'] },
  { province: '宁夏', cities: ['银川'] },
  { province: '新疆', cities: ['乌鲁木齐', '克拉玛依'] },
  { province: '青海', cities: ['西宁'] },
  { province: '西藏', cities: ['拉萨'] },
]

/** 首屏快捷选择的热门城市 */
export const HOT_CITIES = ['北京', '上海', '深圳', '杭州', '广州', '成都', '武汉', '南京', '西安', '苏州']

/** 反查城市所属省份；找不到返回 null（如自定义输入的历史值） */
export function findProvinceOfCity(city?: string | null): string | null {
  if (!city) return null
  return PROVINCE_CITIES.find((p) => p.cities.includes(city))?.province ?? null
}
