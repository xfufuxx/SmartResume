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

/**
 * 重点城市的区县映射（求职高频集合，非全量）。
 * 不在此表中的城市：点击城市即完成选择（无第三级）。
 */
export const CITY_DISTRICTS: Record<string, string[]> = {
  北京: ['朝阳区', '海淀区', '西城区', '东城区', '丰台区', '通州区', '大兴区', '昌平区', '顺义区', '石景山区'],
  上海: ['浦东新区', '徐汇区', '长宁区', '静安区', '黄浦区', '杨浦区', '虹口区', '普陀区', '闵行区', '宝山区', '嘉定区', '松江区'],
  广州: ['天河区', '越秀区', '海珠区', '荔湾区', '白云区', '黄埔区', '番禺区', '花都区'],
  深圳: ['南山区', '福田区', '罗湖区', '宝安区', '龙岗区', '龙华区', '坪山区', '光明区'],
  杭州: ['西湖区', '滨江区', '余杭区', '萧山区', '上城区', '拱墅区', '临平区', '钱塘区', '富阳区'],
  南京: ['玄武区', '秦淮区', '鼓楼区', '建邺区', '雨花台区', '栖霞区', '江宁区'],
  苏州: ['工业园区', '高新区', '姑苏区', '吴中区', '相城区', '吴江区', '昆山市', '常熟市'],
  成都: ['高新区', '天府新区', '锦江区', '青羊区', '金牛区', '武侯区', '成华区', '双流区'],
  武汉: ['洪山区', '东湖高新区', '武昌区', '江汉区', '江岸区', '汉阳区', '硚口区', '江夏区'],
  西安: ['高新区', '雁塔区', '碑林区', '未央区', '莲湖区', '长安区', '曲江新区'],
  重庆: ['渝中区', '江北区', '渝北区', '南岸区', '沙坪坝区', '九龙坡区', '两江新区'],
  天津: ['和平区', '南开区', '河西区', '滨海新区', '河东区', '红桥区'],
  郑州: ['金水区', '郑东新区', '高新区', '二七区', '中原区'],
  长沙: ['岳麓区', '雨花区', '芙蓉区', '天心区', '开福区'],
  合肥: ['高新区', '蜀山区', '包河区', '庐阳区', '经开区'],
  青岛: ['市南区', '市北区', '崂山区', '城阳区', '黄岛区'],
  济南: ['历下区', '市中区', '高新区', '槐荫区'],
  厦门: ['思明区', '湖里区', '集美区', '海沧区'],
  福州: ['鼓楼区', '台江区', '仓山区', '晋安区'],
  沈阳: ['和平区', '沈河区', '铁西区', '浑南区'],
  大连: ['中山区', '甘井子区', '高新园区', '沙河口区'],
  昆明: ['五华区', '官渡区', '盘龙区', '西山区'],
  贵阳: ['观山湖区', '南明区', '云岩区'],
}

/** 城市是否有第三级区县可选 */
export function districtsOfCity(city?: string | null): string[] | null {
  if (!city) return null
  return CITY_DISTRICTS[city] ?? null
}

/** 选择值格式：有区县时为「城市·区县」，如「杭州·滨江区」 */
export const CITY_DISTRICT_SEPARATOR = '·'

/** 拆分选择值 → { province, city, district }；value 不在数据集时尽量降级 */
export function parseCityValue(value?: string | null): {
  province: string | null
  city: string | null
  district: string | null
} {
  if (!value) return { province: null, city: null, district: null }
  const sep = value.indexOf(CITY_DISTRICT_SEPARATOR)
  const city = sep > 0 ? value.slice(0, sep) : value
  const district = sep > 0 ? value.slice(sep + 1) : null
  const province = findProvinceOfCity(city)
  return { province, city: city || null, district }
}

/** 反查城市所属省份；找不到返回 null（如自定义输入的历史值） */
export function findProvinceOfCity(city?: string | null): string | null {
  if (!city) return null
  return PROVINCE_CITIES.find((p) => p.cities.includes(city))?.province ?? null
}
