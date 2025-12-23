import { Button, Card } from 'antd';
import { useNavigate } from 'react-router-dom';

function ForgotPassword() {
  const navigate = useNavigate();

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: '100vh',
      }}
    >
      <Card title="找回密码" style={{ width: 400 }}>
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <p>当前系统已关闭邮箱找回功能</p>
          <p style={{ color: '#666', marginTop: '10px' }}>
            请联系管理员重置您的密码
          </p>
          <Button
            type="primary"
            onClick={() => navigate('/login')}
            style={{ marginTop: '20px' }}
          >
            返回登录
          </Button>
        </div>
      </Card>
    </div>
  );
}

export default ForgotPassword;
