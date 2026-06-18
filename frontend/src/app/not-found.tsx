import Link from 'next/link'
import { Button, Result } from 'antd'

export default function NotFound() {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: '#f5f5f5',
    }}>
      <Result
        status="404"
        title="页面不存在"
        subTitle="您访问的页面不存在或已被移除"
        extra={
          <Link href="/">
            <Button type="primary">返回首页</Button>
          </Link>
        }
      />
    </div>
  )
}