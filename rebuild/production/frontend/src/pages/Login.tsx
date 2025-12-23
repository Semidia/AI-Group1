import { Form, Input, Button, Card, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { authAPI } from '../services/auth';
import { useAuthStore } from '../stores/authStore';

function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const login = useAuthStore(state => state.login);
  const [loading, setLoading] = useState(false);

  const onFinish = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const response = await authAPI.login(values);
      login(response.token, response.user);
      message.success('登录成功！');
      // Redirect to the page user was trying to access, or home
      const from =
        (location.state as { from?: { pathname?: string } } | undefined)?.from?.pathname || '/';
      navigate(from, { replace: true });
    } catch (error: unknown) {
      const msg =
        typeof error === 'object' && error && 'response' in error
          ? ((error as { response?: { data?: { message?: string } } }).response?.data?.message ??
            null)
          : null;
      message.error(msg || '登录失败，请检查用户名和密码');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
      }}
    >
      <Card title="登录" style={{ width: 400 }}>
        <Form name="login" onFinish={onFinish} autoComplete="off">
          <Form.Item name="username" rules={[{ required: true, message: '请输入用户名!' }]}>
            <Input prefix={<UserOutlined />} placeholder="用户名" />
          </Form.Item>

          <Form.Item name="password" rules={[{ required: true, message: '请输入密码!' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>
              登录
            </Button>
          </Form.Item>

          <Form.Item>
            <div style={{ textAlign: 'center' }}>
              <Link to="/register">还没有账号？立即注册</Link>
            </div>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}

export default Login;
