'use client'

import React, { useEffect, useState } from 'react'
import {
  Layout, Button, Card, Typography, Spin, message, Tabs, Row, Col,
  Form, Input, Select, Upload, Avatar, List, Tag, Space, Popconfirm,
  Modal, Divider, Empty, Badge, Statistic, Table,
} from 'antd'
import {
  LogoutOutlined, HomeOutlined, UserOutlined, SecurityScanOutlined,
  BellOutlined, DashboardOutlined, FileTextOutlined, HistoryOutlined,
  DeleteOutlined, ExportOutlined, UploadOutlined, PhoneOutlined,
  MailOutlined, EnvironmentOutlined, AimOutlined, DollarOutlined,
  WarningOutlined, LockOutlined,
} from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import { user, auth, messages as msgApi } from '@/lib/api'
import { getToken, clearAuth } from '@/lib/auth'
import type { UserProfile, UserDevice, MessageItem } from '@/types'

const { Header, Content } = Layout

const CAREER_OPTIONS = [
  { label: '在校生', value: 'student' },
  { label: '应届生', value: 'entry' },
  { label: '1-3年', value: 'junior' },
  { label: '3-5年', value: 'mid' },
  { label: '5年以上', value: 'senior' },
]

const INDUSTRIES = ['互联网', '金融', '医疗', '教育', '电商', '游戏', '汽车', '房产', '媒体', '制造']

export default function ProfilePage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)

  const [devices, setDevices] = useState<UserDevice[]>([])
  const [messageList, setMessageList] = useState<MessageItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [msgPage, setMsgPage] = useState(1)
  const [msgTotal, setMsgTotal] = useState(0)

  const [changePwdOpen, setChangePwdOpen] = useState(false)
  const [pwdLoading, setPwdLoading] = useState(false)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [editField, setEditField] = useState<'resume_text' | 'job_text' | null>(null)
  const [editText, setEditText] = useState('')
  const [editLoading, setEditLoading] = useState(false)

  const [profileForm] = Form.useForm()
  const [expectationForm] = Form.useForm()
  const [pwdForm] = Form.useForm()
  const [bindPhoneOpen, setBindPhoneOpen] = useState(false)
  const [phoneLoading, setPhoneLoading] = useState(false)

  useEffect(() => {
    const t = getToken()
    if (!t) { router.push('/login'); return }
    setToken(t)

    router.prefetch('/dashboard')
    router.prefetch('/resumes')
    router.prefetch('/history')
    router.prefetch('/')
  }, [router])

  useEffect(() => {
    if (!token) return
    loadAll()
  }, [token])

  const loadAll = async () => {
    setLoading(true)
    try {
      const [pRes, dRes, mRes] = await Promise.all([
        user.getProfile(),
        auth.getDevices(),
        msgApi.list(1, 20, false),
      ])
      setProfile(pRes.data)
      setDevices(dRes.data || [])
      setMessageList(mRes.data?.items || [])
      setMsgTotal(mRes.data?.total || 0)
      setUnreadCount(mRes.data?.unread_count || 0)

      profileForm.setFieldsValue(pRes.data)
      expectationForm.setFieldsValue(pRes.data?.expectation || {})
    } catch {
      message.error('加载个人信息失败')
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateProfile = async (values: { nickname: string; career_state: string }) => {
    setUpdating(true)
    try {
      await user.updateProfile(values)
      message.success('资料已更新')
      loadAll()
    } catch { message.error('更新失败') }
    finally { setUpdating(false) }
  }

  const handleUpdateExpectation = async (values: any) => {
    setUpdating(true)
    try {
      await user.updateExpectation(values)
      message.success('求职意向已更新')
    } catch { message.error('更新失败') }
    finally { setUpdating(false) }
  }

  const handleAvatarUpload = async (file: File) => {
    try {
      const res = await user.uploadAvatar(file)
      message.success('头像已更新')
      loadAll()
    } catch { message.error('上传失败') }
  }

  const handleRemoveDevice = async (deviceId: string) => {
    try {
      await auth.removeDevice(deviceId)
      message.success('设备已下线')
      loadAll()
    } catch { message.error('操作失败') }
  }

  const handleChangePassword = async (values: { old_password: string; new_password: string }) => {
    setPwdLoading(true)
    try {
      await auth.changePassword(values.old_password, values.new_password)
      message.success('密码已修改，请重新登录')
      setChangePwdOpen(false)
      clearAuth()
      router.push('/login')
    } catch (err: any) {
      message.error(err?.response?.data?.detail || '修改失败')
    } finally { setPwdLoading(false) }
  }

  const handleDeleteAccount = async () => {
    try {
      await auth.deleteAccount()
      message.success('账号已进入注销冻结期（30天），期间可重新登录恢复')
      setDeleteModalOpen(false)
      clearAuth()
      router.push('/login')
    } catch { message.error('操作失败') }
  }

  const handleExportData = async () => {
    try {
      const res = await user.exportData()
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = 'my-data-export.json'; a.click()
      URL.revokeObjectURL(url)
      message.success('数据已导出')
    } catch { message.error('导出失败') }
  }

  const handleBindPhone = async (values: { phone: string }) => {
    setPhoneLoading(true)
    try {
      await auth.bindPhone(values.phone)
      message.success('手机号已绑定')
      setBindPhoneOpen(false)
      loadAll()
    } catch (err: any) { message.error(err?.response?.data?.detail || '绑定失败') }
    finally { setPhoneLoading(false) }
  }

  const handleMarkAllRead = async () => {
    try {
      await msgApi.markAllRead()
      message.success('全部已读')
      loadAll()
    } catch {}
  }

  const handleSyncSavedTexts = async () => {
    setSyncing(true)
    try {
      const res = await user.syncSavedTexts()
      message.success(res.data?.detail || '同步成功')
      loadAll()
    } catch {
      message.error('同步失败')
    } finally {
      setSyncing(false)
    }
  }

  const handleOpenEdit = (field: 'resume_text' | 'job_text') => {
    setEditField(field)
    setEditText(profile?.saved_texts?.[field] || '')
  }

  const handleSaveSavedText = async () => {
    if (!editField) return
    setEditLoading(true)
    try {
      await user.updateSavedTexts({ [editField]: editText })
      message.success('已保存')
      setEditField(null)
      loadAll()
    } catch {
      message.error('保存失败')
    } finally {
      setEditLoading(false)
    }
  }

  if (!token || !profile) return <Spin style={{ display: 'block', margin: '40px auto' }} />

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingInline: 24 }}>
        <Typography.Title level={4} style={{ color: '#fff', margin: 0 }}><UserOutlined /> 个人中心</Typography.Title>
        <Space>
          <Button icon={<DashboardOutlined />} onClick={() => router.push('/dashboard')} type="text" style={{ color: '#fff' }}>仪表盘</Button>
          <Button icon={<FileTextOutlined />} onClick={() => router.push('/resumes')} type="text" style={{ color: '#fff' }}>简历库</Button>
          <Button icon={<HistoryOutlined />} onClick={() => router.push('/history')} type="text" style={{ color: '#fff' }}>历史记录</Button>
          <Button icon={<HomeOutlined />} onClick={() => router.push('/')} type="text" style={{ color: '#fff' }}>首页</Button>
          <Button icon={<LogoutOutlined />} onClick={() => { clearAuth(); router.push('/login') }} type="text" style={{ color: '#fff' }}>退出</Button>
        </Space>
      </Header>

      <Content style={{ padding: 24, maxWidth: 1000, margin: '0 auto', width: '100%' }}>
        <Row gutter={[24, 24]}>
          <Col span={24}>
            <Card>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <Upload showUploadList={false} beforeUpload={(f) => { handleAvatarUpload(f); return false }}>
                  <Avatar size={64} icon={<UserOutlined />} src={profile.avatar_url} style={{ cursor: 'pointer' }} />
                </Upload>
                <div>
                  <Typography.Title level={4} style={{ margin: 0 }}>{profile.nickname || profile.email.split('@')[0]}</Typography.Title>
                  <Space>
                    <Tag icon={<MailOutlined />}>{profile.email}</Tag>
                    {profile.phone && <Tag icon={<PhoneOutlined />}>{profile.phone}</Tag>}
                    <Tag color={profile.status === 'active' ? 'green' : 'red'}>{profile.status === 'active' ? '正常' : profile.status}</Tag>
                  </Space>
                </div>
              </div>
            </Card>
          </Col>
        </Row>

        <Tabs
          defaultActiveKey="profile"
          style={{ marginTop: 16 }}
          items={[
            {
              key: 'profile',
              label: <span><UserOutlined /> 个人资料</span>,
              children: (
                <Row gutter={[24, 24]}>
                  <Col xs={24} md={12}>
                    <Card title="基础资料">
                      <Form form={profileForm} layout="vertical" onFinish={handleUpdateProfile} initialValues={{ nickname: profile.nickname, career_state: profile.career_state }}>
                        <Form.Item name="nickname" label="昵称">
                          <Input maxLength={20} />
                        </Form.Item>
                        <Form.Item name="career_state" label="职业状态">
                          <Select options={CAREER_OPTIONS} placeholder="请选择" />
                        </Form.Item>
                        <Form.Item>
                          <Button type="primary" htmlType="submit" loading={updating} block>保存资料</Button>
                        </Form.Item>
                      </Form>
                    </Card>
                  </Col>
                  <Col xs={24} md={12}>
                    <Card title="求职意向" extra={<AimOutlined />}>
                      <Form form={expectationForm} layout="vertical" onFinish={handleUpdateExpectation} initialValues={profile.expectation || {}}>
                        <Form.Item name="industries" label="期望行业">
                          <Select mode="multiple" options={INDUSTRIES.map((i) => ({ label: i, value: i }))} placeholder="多选" />
                        </Form.Item>
                        <Form.Item name="job_title" label="期望岗位">
                          <Input placeholder="如：Python后端开发" />
                        </Form.Item>
                        <Row gutter={12}>
                          <Col span={12}>
                            <Form.Item name="salary_range" label={<><DollarOutlined /> 期望薪资</>}>
                              <Input placeholder="如：15k-25k" />
                            </Form.Item>
                          </Col>
                          <Col span={12}>
                            <Form.Item name="cities" label={<><EnvironmentOutlined /> 期望城市</>}>
                              <Select mode="multiple" options={['北京', '上海', '深圳', '杭州', '广州', '成都', '武汉', '南京'].map((c) => ({ label: c, value: c }))} placeholder="最多3个" maxCount={3} />
                            </Form.Item>
                          </Col>
                        </Row>
                        <Form.Item>
                          <Button type="primary" htmlType="submit" loading={updating} block>保存意向</Button>
                        </Form.Item>
                      </Form>
                    </Card>
                  </Col>
                </Row>
              ),
            },
            {
              key: 'security',
              label: <span><SecurityScanOutlined /> 安全中心</span>,
              children: (
                <Row gutter={[24, 24]}>
                  <Col xs={24} md={12}>
                    <Card title={<><LockOutlined /> 账号安全</>}>
                      <Space direction="vertical" style={{ width: '100%' }} size="middle">
                        <Button block onClick={() => setChangePwdOpen(true)} icon={<LockOutlined />}>修改密码</Button>
                        <Button block onClick={() => setBindPhoneOpen(true)} icon={<PhoneOutlined />}>
                          {profile.phone ? '更换手机号' : '绑定手机号'}
                        </Button>
                        <Button block icon={<ExportOutlined />} onClick={handleExportData}>导出个人数据</Button>
                        <Divider />
                        <Button block danger icon={<WarningOutlined />} onClick={() => setDeleteModalOpen(true)}>申请注销账号</Button>
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                          注销后进入 30 天冻结期，期间可重新登录恢复。30 天后数据将被彻底删除。
                        </Typography.Text>
                      </Space>
                    </Card>
                  </Col>
                  <Col xs={24} md={12}>
                    <Card title="登录设备" extra={<Tag>{devices.filter((d) => !d.is_revoked).length} 台在线</Tag>}>
                      {devices.length === 0 ? (
                        <Empty description="暂无设备记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                      ) : (
                        <List
                          size="small"
                          dataSource={devices}
                          renderItem={(d) => (
                            <List.Item actions={[
                              !d.is_revoked && (
                                <Popconfirm key="revoke" title="下线此设备？" onConfirm={() => handleRemoveDevice(d.id)}>
                                  <Button size="small" danger>下线</Button>
                                </Popconfirm>
                              ),
                            ]}>
                              <List.Item.Meta
                                title={
                                  <Space>
                                    {d.platform === 'web' ? '💻' : d.platform === 'ios' ? '📱' : d.platform === 'android' ? '📱' : '🖥️'}
                                    {d.device_name || '未知设备'}
                                    {d.is_current && <Tag color="blue">当前</Tag>}
                                    {d.is_revoked && <Tag color="red">已下线</Tag>}
                                  </Space>
                                }
                                description={
                                  <span style={{ fontSize: 12, color: '#999' }}>
                                    {d.ip_address} · {d.last_active ? new Date(d.last_active).toLocaleString() : '-'}
                                  </span>
                                }
                              />
                            </List.Item>
                          )}
                        />
                      )}
                    </Card>
                  </Col>
                </Row>
              ),
            },
            {
              key: 'messages',
              label: <span><Badge count={unreadCount} size="small" offset={[6, -2]}><BellOutlined /> 消息中心</Badge></span>,
              children: (
                <Card
                  title="消息列表"
                  extra={
                    <Space>
                      {unreadCount > 0 && <Button size="small" onClick={handleMarkAllRead}>全部已读</Button>}
                    </Space>
                  }
                >
                  {messageList.length === 0 ? (
                    <Empty description="暂无消息" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  ) : (
                    <List
                      dataSource={messageList}
                      renderItem={(msg) => (
                        <List.Item
                          style={{ background: msg.is_read ? undefined : '#f6ffed' }}
                          actions={[
                            !msg.is_read && (
                              <Button key="read" size="small" type="link"
                                onClick={async () => { await msgApi.markRead(msg.id); loadAll() }}>
                                标为已读
                              </Button>
                            ),
                            <Button key="del" size="small" type="link" danger
                              onClick={async () => { await msgApi.delete(msg.id); loadAll() }}>
                              删除
                            </Button>,
                          ]}
                        >
                          <List.Item.Meta
                            title={<Space>{!msg.is_read && <Badge status="processing" />}{msg.title || msg.msg_type}</Space>}
                            description={
                              <div>
                                <div>{msg.content || '-'}</div>
                                <span style={{ fontSize: 11, color: '#999' }}>
                                  {msg.created_at ? new Date(msg.created_at).toLocaleString() : ''}
                                </span>
                              </div>
                            }
                          />
                        </List.Item>
                      )}
                    />
                  )}
                </Card>
              ),
            },
            {
              key: 'saved_texts',
              label: <span><FileTextOutlined /> 我的信息</span>,
              children: (
                <>
                  <div style={{ marginBottom: 16, textAlign: 'right' }}>
                    <Button
                      type="primary"
                      loading={syncing}
                      onClick={handleSyncSavedTexts}
                    >
                      从简历库/岗位库同步
                    </Button>
                    <Typography.Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                      从已有的默认简历和默认岗位中读取信息
                    </Typography.Text>
                  </div>
                  <Row gutter={[24, 24]}>
                    <Col xs={24} md={12}>
                      <Card
                        title="简历信息"
                        extra={<Button type="link" size="small" onClick={() => handleOpenEdit('resume_text')}>编辑</Button>}
                        styles={{ body: { maxHeight: 500, overflow: 'auto' } }}
                      >
                        {profile.saved_texts?.resume_text ? (
                          <Typography.Paragraph
                            style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.8 }}
                          >
                            {profile.saved_texts.resume_text}
                          </Typography.Paragraph>
                        ) : (
                          <Empty description="暂无简历信息，请先上传简历或点击同步" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                        )}
                      </Card>
                    </Col>
                    <Col xs={24} md={12}>
                      <Card
                        title="岗位信息"
                        extra={<Button type="link" size="small" onClick={() => handleOpenEdit('job_text')}>编辑</Button>}
                        styles={{ body: { maxHeight: 500, overflow: 'auto' } }}
                      >
                        {profile.saved_texts?.job_text ? (
                          <Typography.Paragraph
                            style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.8 }}
                          >
                            {profile.saved_texts.job_text}
                          </Typography.Paragraph>
                        ) : (
                          <Empty description="暂无岗位信息，请先上传岗位图片或点击同步" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                        )}
                      </Card>
                    </Col>
                  </Row>
                </>
              ),
            },
          ]}
        />

        {/* 修改密码弹窗 */}
        <Modal title="修改密码" open={changePwdOpen} onCancel={() => setChangePwdOpen(false)} footer={null}>
          <Form form={pwdForm} layout="vertical" onFinish={handleChangePassword}>
            <Form.Item name="old_password" label="当前密码" rules={[{ required: true, message: '请输入当前密码' }]}>
              <Input.Password />
            </Form.Item>
            <Form.Item name="new_password" label="新密码" rules={[{ required: true, min: 6, message: '至少6位' }]}>
              <Input.Password />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={pwdLoading} block>确认修改</Button>
          </Form>
        </Modal>

        {/* 绑定手机弹窗 */}
        <Modal title="绑定手机号" open={bindPhoneOpen} onCancel={() => setBindPhoneOpen(false)} footer={null}>
          <Form onFinish={handleBindPhone} layout="vertical">
            <Form.Item name="phone" label="手机号" rules={[{ required: true, pattern: /^\d{11}$/, message: '请输入11位手机号' }]}>
              <Input maxLength={11} />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={phoneLoading} block>确认绑定</Button>
          </Form>
        </Modal>

        {/* 注销确认弹窗 */}
        <Modal
          title={<><WarningOutlined style={{ color: '#ff4d4f' }} /> 注销账号</>}
          open={deleteModalOpen}
          onCancel={() => setDeleteModalOpen(false)}
          onOk={handleDeleteAccount}
          okText="确认注销"
          okButtonProps={{ danger: true }}
        >
          <Typography.Paragraph>
            注销后将进入 <strong>30 天冻结期</strong>，期间你可以重新登录恢复账号。30 天后所有数据将被<strong>永久删除</strong>，不可恢复。
          </Typography.Paragraph>
          <Typography.Paragraph type="secondary">
            包括：简历文件、优化记录、投递反馈、个人资料等全部数据。
          </Typography.Paragraph>
        </Modal>

        {/* 编辑简历/岗位信息弹窗 */}
        <Modal
          title={editField === 'resume_text' ? '编辑简历信息' : '编辑岗位信息'}
          open={!!editField}
          onCancel={() => setEditField(null)}
          width={700}
          footer={[
            <Button key="cancel" onClick={() => setEditField(null)}>取消</Button>,
            <Button key="save" type="primary" loading={editLoading} onClick={handleSaveSavedText}>保存</Button>,
          ]}
        >
          <Input.TextArea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            autoSize={{ minRows: 12, maxRows: 30 }}
            style={{ fontSize: 13, lineHeight: 1.8 }}
            placeholder={editField === 'resume_text' ? '请输入简历信息...' : '请输入岗位信息...'}
          />
        </Modal>
      </Content>
    </Layout>
  )
}