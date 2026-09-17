import Link from 'next/link'
import { Button, Result } from 'antd'

export default function NotFound() {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      background: 'var(--bg-body)',
    }}>
      <div style={{ padding: '32px 48px', borderRadius: 'var(--radius-2xl)', border: '1px solid var(--border-light)', background: 'var(--bg-card)', boxShadow: 'var(--shadow-lg)' }}>
        <Result
          status="404"
          title={<span style={{ color: 'var(--text-primary)' }}>页面不存在</span>}
          subTitle={<span style={{ color: 'var(--text-tertiary)' }}>您访问的页面不存在或已被移除</span>}
          extra={
            <Link href="/">
              <Button type="primary">返回首页</Button>
            </Link>
          }
        />
      </div>
    </div>
  )
}