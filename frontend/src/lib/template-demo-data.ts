import type { ResumeParseResult } from '@/types'

/**
 * 模板预览专用演示简历（前后端共用同一套字段形状）。
 * 仅用于模板选择面板的高保真预览，不写入任何业务数据。
 *
 * 注意：这是后端 `app/api/templates.py::_DEMO_RESUME`（GET /api/templates/demo
 * 下发）的静态副本——React 组件预览需要同步导入、不走网络。两侧内容由
 * `scripts/check_template_sync.py` 第 5 节逐字段守护，改任一侧必须同步另一侧。
 *
 * 对象字面量内部不要写 `//` 注释：该校验用 ast.literal_eval 求值 TS 字面量，
 * `//` 会致 SyntaxError（后端 dict 内的 `#` 注释则无碍）。personal_info.avatar
 * 为演示职业照占位图（人物剪影，非真实人像），与后端同值。
 */
export const DEMO_RESUME: ResumeParseResult = {
  personal_info: {
    name: '陈思远',
    email: 'chensiyuan@example.com',
    phone: '138-0000-0000',
    avatar: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAAEYCAIAAACWcy5SAAAEy0lEQVR42u3d2U4TURzA4WPTtwBBE0XigtuFLAWXG8HlaV0QTYwxIAgxGre4QFzAW1+hXlTKEtRSZuqcc74vXBqFmV/P+TOdjofef/8ZoGj1ZrPpKFC4mkOAsBAW2c9YDgJWLGJZsUKwZGHFIpoZyzGglK1QWdgKERZmLHC5AcM7ZiwwY2HFQlhQ6PBuM8SKheEdKxYIC1feMWOBN6ExY2HGAjMWtkKEBcLCg9ewYoGwEBbCAk/0w5vQ2ApBWHgTGrfNgK0QYZHJjGUvxIqF4R0rFriOhRULMxa4uwEzFmYsEBaGd6xY4E1orFhkeB2LvY2e7Ovkjy29/+FYGd7/WtKpvoP3t/ROZy6QhhBCGOuqp3/WuZh3YXU9lf3351lYXVK9+edyyyuvN6HHTvX/35oX3214KEhSxk/3V6fsZ283bIWSKutbSjuvmqp8b8JK7cwl3Faa17Em4jlhrbYWktsWE7zyPnGmP8ZXwsKbDZcbqlzV4XhfDwtv1s1YqvL95xFWGmclmbYSuUDaGDmc0itk/vW6FUtVfqIUw0qvqjR+Lp+ErrKIT02tGUK8X42RgYSzaowMxHtqavFmNZl0VS2TIwORnp1YZ6zJs+lXFfVP6uNfmLE2v/JZrtqLVoQzFpRzd0Nkv9NOnRvM8DxNnR14+uqbGQszVlQ7d57LVXupNmPhaTPxuJzxchXdEfBQkOD9Q8M7nuhXtCvnjzhbIYTL5wefvPxqxcLwDkWGFcNVEfvg7qmg8qfME/38amgrxD3vZL5mWbHI9QOr1y4edZ52uXrh6OMXX6xYuI4FwsKMRdG/FjZdbiC/Kw62QoSFpyaT+aV3tyYry1aIN6HxWyFk+UnoRytrztMuj1bWKn7WDO+2QVshLpDiAil2wlJWrAg+//VweVVMbQ+XV6t/ygzv1iszFq5jFf4199xuGEIIc89XPdEPlxsgt9tmro8ec562jsal30djbmnVg9f2bXr0uIY6f709WPpcwdtm9BS99nGrTmF1PSkstRlrekxP5Re2+DmjFUtSPT7Uvc+rp29Cz+jpf28Os70qrEf3vM+MDTm7VdB6bc8ufop+K5RUJfMaKjuvsob3mXE9xZFXCGH22acIZqwbkoqusPGhEML9QvOqS4rtp6+ovOqSooy86pKijLxqzQNQVfJ5dd1GlyvWzYkTjnsOWif63sLH0rdCScmr4LAkJa/O8+r0wxSqop1XMQ8FudWQFDuTmDgRQrg7/7H7D1Ooiu7a+OPdDbcaw44dnbR1d/5DpzOWqthPXsN7zVg73ZYU+9fK5s62pWvHfzauKg6a12ZLW8P77UlVceC2NiuqS4oy2jrU9P/KETwUBGEhLBAWwkJYICyEhbBAWAgLYYGwEBbCAmEhLIQFwkJYCAuEhbAQFggLYSEsEBbCQlggLISFsEBYCAthgbAQFsICYSEshAXCQlgIC4SFsBAWCAthISwQFsJCWCAshIWwQFgIC2GBsBAWwgJhISyEBcJCWAgLhIWwEBYIC2EhLBAWwkJYICyEhbBAWAgLYSEsEBbCQlggLISFsEBYCAthgbAQFsICYSEshAXCQlgIC4SFsBAWCAthISwQFsJCWCAshIWwQFgIC2GBsBAWwgJhISyEBcJCWKTpF38MOUCOzvxvAAAAAElFTkSuQmCC',
  },
  summary:
    '5 年互联网产品设计经验，主导过日活百万级 C 端产品的完整设计周期。擅长用户研究、交互设计与设计系统建设，具备良好的跨职能协作能力，能独立推动从需求洞察到落地验证的闭环。',
  experience: [
    {
      company: '某知名互联网公司',
      title: '高级产品设计师',
      start: '2022.03',
      end: '至今',
      points: [
        '主导核心购物流路的体验改版，转化率提升 23%，NPS 提升 11 分',
        '从 0 到 1 搭建组件化设计系统，覆盖 12 条业务线，设计交付效率提升 40%',
        '建立用户可用性测试流程，累计完成 30+ 轮测试，输出报告被产品委员会采纳',
      ],
    },
    {
      company: '某成长型 SaaS 企业',
      title: '产品设计师',
      start: '2019.07',
      end: '2022.02',
      points: [
        '负责 B 端工作台的整体信息架构重构，任务完成路径缩短 35%',
        '推动设计走查机制落地，线上视觉还原度从 82% 提升至 97%',
      ],
    },
  ],
  education: [
    {
      school: '某 985 高校',
      degree: '硕士',
      major: '设计学',
      start: '2016.09',
      end: '2019.06',
    },
    {
      school: '某 211 高校',
      degree: '学士',
      major: '工业设计',
      start: '2012.09',
      end: '2016.06',
    },
  ],
  skills: ['用户研究', '交互设计', '设计系统', 'Figma', '数据驱动', '可用性测试', '前端基础'],
  projects: [
    {
      name: '电商大促活动阵地改版',
      role: '设计负责人',
      start: '2023.05',
      end: '2023.11',
      points: [
        '统筹 6 人设计团队完成双 11 阵地设计，活动页 GMV 同比增长 31%',
        '设计并落地动态皮肤能力，支持运营零代码配置，节省 80% 重复开发',
      ],
    },
    {
      name: '企业级设计系统 DesignKit',
      role: '核心贡献者',
      start: '2022.06',
      end: '2023.03',
      points: [
        '制定 Token 规范与深色模式方案，组件复用率达到 76%',
      ],
    },
  ],
}
