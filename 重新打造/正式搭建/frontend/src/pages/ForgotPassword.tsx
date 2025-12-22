import { Form, Input, Button, Card, message } from 'antd';
import { MailOutlined } from '@ant-design/icons';
import { useState } from 'react';
import { authAPI } from '../services/auth';

function ForgotPassword() {
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const onFinish = async (values: { email: string }) => {
    setLoading(true);
    try {
      await authAPI.forgotPassword(values.email);
      setSubmitted(true);
      message.success('如果该邮箱存在，密码重置链接已发送到您的邮箱');
    } catch (error: unknown) {
      const msg =
        typeof error === 'object' && error && 'response' in error
          ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message ??
            null)
          : null;
      message.error(msg || '请求失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
        }}
      >
        <Card title="密码重置" style={{ width: 400 }}>
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <p>如果该邮箱存在，密码重置链接已发送到您的邮箱。</p>
            <p style={{ color: '#999', fontSize: '12px', marginTop: '10px' }}>
              请检查您的邮箱（包括垃圾邮件文件夹），并按照邮件中的说明重置密码。
            </p>
            <Button
              type="link"
              onClick={() => (window.location.href = '/login')}
              style={{ marginTop: '20px' }}
            >
              返回登录
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
      }}
    >
      <Card title="忘记密码" style={{ width: 400 }}>
        <Form name="forgot-password" onFinish={onFinish} autoComplete="off">
          <Form.Item
            name="email"
            rules={[
              { required: true, message: '请输入邮箱!' },
              { type: 'email', message: '请输入有效的邮箱地址!' },
            ]}
          >
            <Input prefix={<MailOutlined />} placeholder="请输入您的邮箱" />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>
              发送重置链接
            </Button>
          </Form.Item>

          <Form.Item>
            <div style={{ textAlign: 'center' }}>
              <a href="/login">返回登录</a>
            </div>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}

export default ForgotPassword;
