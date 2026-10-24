'use client';

import React, { useCallback, useState } from 'react';
import {
  Alert, Button, Card, Col, Descriptions, Empty, List, Row, Space, Tag, Typography, message,
} from 'antd';
import {
  CheckCircleOutlined, FileTextOutlined, ImportOutlined, InboxOutlined, UploadOutlined,
} from '@ant-design/icons';
import { Upload } from 'antd';
import type { UploadFile } from 'antd';
import { useRouter } from 'next/navigation';

import AppLayout from '@/components/AppLayout';
import AuthGate from '@/components/AuthGate';
import { resumeImport } from '@/lib/api';
import { getToken } from '@/lib/auth';

const { Title, Text, Paragraph } = Typography;

interface ParseResult {
  file_type: string;
  parsed_json: Record<string, any>;
  raw_text: string;
  sections: Array<{ key: string; label: string; count: number }>;
  warnings: string[];
}

const ACCEPT = '.pdf,.docx,.png,.jpg,.jpeg,.webp';

/**
 * 简历解析导入页 —— 上传旧简历 → 预览结构化结果 → 确认导入。
 *
 * 与 /resumes 的上传区别：上传=档案化（存原件）；本页=把内容灌进优化流程，
 * 导入后立即可在「一键优化」使用（后端同步写入 saved_texts.resume_text）。
 */
export default function ResumeImportPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [fileList, setFileList] = useState<UploadFile[]>([]);

  React.useEffect(() => {
    const t = getToken();
    if (!t) return;
    setToken(t);
  }, []);

  const handleParse = useCallback(async (file: File) => {
    setParsing(true);
    try {
      const res = await resumeImport.parse(file);
      setResult(res.data as ParseResult);
      message.success('解析完成，请确认内容');
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      message.error(detail || '解析失败，请更换文件重试');
      setFileList([]);
    } finally {
      setParsing(false);
    }
  }, []);

  const handleApply = useCallback(async () => {
    if (!result) return;
    setApplying(true);
    try {
      await resumeImport.apply({
        parsed_json: result.parsed_json,
        raw_text: result.raw_text,
        file_type: result.file_type,
        title: fileList[0]?.name?.replace(/\.[^.]+$/, '') || '导入的简历',
      });
      message.success('导入成功，已同步到一键优化');
      router.push('/');
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      message.error(detail || '导入失败，请重试');
    } finally {
      setApplying(false);
    }
  }, [result, fileList, router]);

  const pi = result?.parsed_json?.personal_info || {};
  const experience = Array.isArray(result?.parsed_json?.experience) ? result.parsed_json.experience : [];
  const education = Array.isArray(result?.parsed_json?.education) ? result.parsed_json.education : [];
  const skills = Array.isArray(result?.parsed_json?.skills) ? result.parsed_json.skills : [];
  const projects = Array.isArray(result?.parsed_json?.projects) ? result.parsed_json.projects : [];

  if (!token) return <AuthGate activeKey="import" />;

  return (
    <AppLayout activeKey="import" title="简历导入" subtitle="上传 PDF / Word / 图片简历，解析成结构化数据，导入后即可优化">
      <div className="app-page-enter" style={{ maxWidth: 960, margin: '0 auto' }}>
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="导入只保存解析出的结构化内容，不存储原文件；需要留存原件请到「简历」页上传"
        />

        <Card
          size="small"
          style={{ marginBottom: 16 }}
          title={<Space><UploadOutlined /><span>1. 选择简历文件</span></Space>}
        >
          <Upload.Dragger
            accept={ACCEPT}
            fileList={fileList}
            beforeUpload={(file) => {
              setFileList([file]);
              void handleParse(file);
              return false; // 手动控制，不走自动上传
            }}
            onRemove={() => {
              setFileList([]);
              setResult(null);
            }}
            disabled={parsing}
            showUploadList={{ showRemoveIcon: !parsing }}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">点击或拖拽文件到此处</p>
            <p className="ant-upload-hint">支持 PDF / DOCX / PNG / JPG / WebP，单个不超过 20MB</p>
          </Upload.Dragger>
        </Card>

        {parsing ? (
          <Card size="small">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Text>正在解析简历内容（扫描版会调用视觉识别，可能需要几十秒）…</Text>
            </Space>
          </Card>
        ) : null}

        {result && !parsing ? (
          <>
            <Card
              size="small"
              style={{ marginBottom: 16 }}
              title={<Space><FileTextOutlined /><span>2. 确认解析结果</span></Space>}
              extra={
                <Space>
                  <Button onClick={() => { setResult(null); setFileList([]); }}>重新上传</Button>
                  <Button
                    type="primary"
                    icon={<ImportOutlined />}
                    loading={applying}
                    onClick={handleApply}
                  >
                    确认导入
                  </Button>
                </Space>
              }
            >
              {result.warnings.length > 0 ? (
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginBottom: 12 }}
                  message="以下内容未能识别，导入后请补充"
                  description={
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {result.warnings.map((w) => <li key={w}>{w}</li>)}
                    </ul>
                  }
                />
              ) : (
                <Alert type="success" showIcon style={{ marginBottom: 12 }} message="内容识别完整" />
              )}

              <Space wrap style={{ marginBottom: 12 }}>
                {result.sections.filter((s) => s.count > 0).map((s) => (
                  <Tag key={s.key} color="blue">{s.label} · {s.count}</Tag>
                ))}
              </Space>

              <Descriptions column={2} size="small" bordered style={{ marginBottom: 12 }}>
                <Descriptions.Item label="姓名">{pi.name || '—'}</Descriptions.Item>
                <Descriptions.Item label="求职意向">{pi.job_title || pi.title || '—'}</Descriptions.Item>
                <Descriptions.Item label="电话">{pi.phone || '—'}</Descriptions.Item>
                <Descriptions.Item label="邮箱">{pi.email || '—'}</Descriptions.Item>
              </Descriptions>

              {result.parsed_json?.summary ? (
                <Paragraph>
                  <Text strong>个人简介：</Text>
                  {result.parsed_json.summary}
                </Paragraph>
              ) : null}

              {experience.length > 0 ? (
                <>
                  <Title level={5}>工作经历</Title>
                  <List
                    size="small"
                    dataSource={experience}
                    renderItem={(exp: any) => (
                      <List.Item>
                        <List.Item.Meta
                          title={`${exp.company || ''} · ${exp.title || exp.position || ''}`}
                          description={
                            <>
                              <Text type="secondary">{exp.start || ''} ~ {exp.end || '至今'}</Text>
                              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                                {(exp.points || []).map((p: string, i: number) => <li key={i}>{p}</li>)}
                              </ul>
                            </>
                          }
                        />
                      </List.Item>
                    )}
                  />
                </>
              ) : null}

              {education.length > 0 ? (
                <>
                  <Title level={5}>教育背景</Title>
                  <List
                    size="small"
                    dataSource={education}
                    renderItem={(edu: any) => (
                      <List.Item>
                        <List.Item.Meta
                          title={`${edu.school || edu.institution || ''} · ${edu.degree || ''}${edu.major ? ` · ${edu.major}` : ''}`}
                          description={<Text type="secondary">{edu.start || ''} ~ {edu.end || ''}</Text>}
                        />
                      </List.Item>
                    )}
                  />
                </>
              ) : null}

              {skills.length > 0 ? (
                <>
                  <Title level={5}>技能特长</Title>
                  <Space wrap style={{ marginBottom: 12 }}>
                    {skills.map((s: string, i: number) => <Tag key={i}>{s}</Tag>)}
                  </Space>
                </>
              ) : null}

              {projects.length > 0 ? (
                <>
                  <Title level={5}>项目经历</Title>
                  <List
                    size="small"
                    dataSource={projects}
                    renderItem={(proj: any) => (
                      <List.Item>
                        <List.Item.Meta
                          title={proj.name || '未命名项目'}
                          description={
                            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                              {(proj.points || []).map((p: string, i: number) => <li key={i}>{p}</li>)}
                            </ul>
                          }
                        />
                      </List.Item>
                    )}
                  />
                </>
              ) : null}

              {result.raw_text ? (
                <Card size="small" type="inner" title="识别原文" style={{ marginTop: 12 }}>
                  <Paragraph style={{ maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap', fontSize: 12 }}>
                    {result.raw_text.slice(0, 2000)}
                    {result.raw_text.length > 2000 ? '…（已截断）' : ''}
                  </Paragraph>
                </Card>
              ) : null}
            </Card>

            <Row justify="center" style={{ marginBottom: 24 }}>
              <Col>
                <Button
                  type="primary"
                  size="large"
                  icon={<CheckCircleOutlined />}
                  loading={applying}
                  onClick={handleApply}
                >
                  确认导入并去优化
                </Button>
              </Col>
            </Row>
          </>
        ) : null}

        {!result && !parsing ? (
          <Empty description="上传文件后这里会显示解析预览" style={{ marginTop: 24 }} />
        ) : null}
      </div>
    </AppLayout>
  );
}
