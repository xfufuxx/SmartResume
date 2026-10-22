/**
 * 导出前校验弹窗 —— 展示 validateLayout 结果，用户确认后才允许导出。
 *
 * 展示规则：
 * - auto 类（已自动修复）：信息提示 + 列表打勾，说明可在编辑器撤销回退；
 * - warn 类（需注意，如重叠）：橙色警示列表，底部按钮为「仍然导出」；
 * - 两类都没有时不应打开（由 useExportGuard 保证）。
 */

import { Alert, Button, List, Modal, Space, Typography } from 'antd';
import {
  CheckCircleOutlined,
  WarningOutlined,
} from '@ant-design/icons';

import type { ValidationResult } from '../../lib/layout/validate.ts';

export interface ValidationDialogProps {
  open: boolean;
  result: ValidationResult | null;
  /** 「仍然导出」回调（可能是异步，如调用后端生成 PDF） */
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  /** 导出进行中（按钮 loading） */
  exporting?: boolean;
}

const { Text } = Typography;

export function ValidationDialog({
  open,
  result,
  onConfirm,
  onCancel,
  exporting = false,
}: ValidationDialogProps) {
  const autoIssues = result?.issues.filter((i) => i.severity === 'auto') ?? [];
  const warnIssues = result?.issues.filter((i) => i.severity === 'warn') ?? [];

  return (
    <Modal
      open={open}
      title="导出前检查"
      okText="仍然导出"
      cancelText="取消"
      confirmLoading={exporting}
      onOk={() => void onConfirm()}
      onCancel={onCancel}
      destroyOnClose
      width={520}
    >
      {result ? (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          {autoIssues.length > 0 && (
            <Alert
              type="info"
              showIcon
              message={`已自动修复 ${autoIssues.length} 处问题`}
              description="自动修正已写入编辑器，如不满意可在编辑器中撤销回退。"
            />
          )}

          {autoIssues.length > 0 && (
            <List
              size="small"
              bordered
              dataSource={autoIssues}
              renderItem={(issue) => (
                <List.Item>
                  <Space align="start">
                    <CheckCircleOutlined style={{ color: '#52c41a', marginTop: 4 }} />
                    <Space direction="vertical" size={0}>
                      <Text>{issue.message}</Text>
                      {issue.detail && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {issue.detail}
                        </Text>
                      )}
                    </Space>
                  </Space>
                </List.Item>
              )}
            />
          )}

          {warnIssues.length > 0 && (
            <>
              <Alert
                type="warning"
                showIcon
                message={`${warnIssues.length} 处需要你注意`}
                description="以下问题不会自动修改（移动任何一块都可能违背你的排版意图），请确认后再导出。"
              />
              <List
                size="small"
                bordered
                dataSource={warnIssues}
                renderItem={(issue) => (
                  <List.Item>
                    <Space align="start">
                      <WarningOutlined style={{ color: '#faad14', marginTop: 4 }} />
                      <Space direction="vertical" size={0}>
                        <Text>{issue.message}</Text>
                        {issue.detail && (
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {issue.detail}
                          </Text>
                        )}
                    </Space>
                  </Space>
                </List.Item>
              )}
            />
            </>
          )}

          {autoIssues.length === 0 && warnIssues.length === 0 && (
            <Alert type="success" showIcon message="未发现问题，可以导出。" />
          )}
        </Space>
      ) : (
        <Text type="secondary">正在检查…</Text>
      )}
    </Modal>
  );
}

/** 便于上层直接 import { ValidationDialog } */
export default ValidationDialog;
