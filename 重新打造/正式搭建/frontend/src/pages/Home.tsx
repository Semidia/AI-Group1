import { Button, Space, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import UserRegistryPanel from '../components/UserRegistryPanel';
import OnlineRoomsPanel from '../components/OnlineRoomsPanel';
import { useAuthStore } from '../stores/authStore';

const { Title } = Typography;

function Home() {
  const [userPanelOpen, setUserPanelOpen] = useState(false);
  const [roomsPanelOpen, setRoomsPanelOpen] = useState(false);
  const { user, logout } = useAuthStore();

  return (
    <>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <div>
            <Title level={1}>凡墙皆是门</Title>
            <Title level={3}>AI文字交互式多人竞争博弈游戏</Title>
            <p>欢迎来到游戏世界！</p>
          </div>
          {user && (
            <Space>
              <span>当前用户：{user.nickname || user.username}</span>
              <Button size="small" onClick={logout}>
                退出登录
              </Button>
            </Space>
          )}
        </Space>
        <Space>
          <Link to="/rooms">
            <Button type="primary">进入房间列表</Button>
          </Link>
          <Button onClick={() => setUserPanelOpen(true)}>在册用户</Button>
          <Button onClick={() => setRoomsPanelOpen(true)}>在线房间</Button>
        </Space>
      </Space>
      <UserRegistryPanel open={userPanelOpen} onClose={() => setUserPanelOpen(false)} />
      <OnlineRoomsPanel open={roomsPanelOpen} onClose={() => setRoomsPanelOpen(false)} />
    </>
  );
}

export default Home;
