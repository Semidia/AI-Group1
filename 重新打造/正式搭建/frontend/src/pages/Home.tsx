import { Button, Space, Typography } from 'antd';
import { Link } from 'react-router-dom';

const { Title } = Typography;

function Home() {
  return (
    <Space direction="vertical" size="middle">
      <div>
        <Title level={1}>凡墙皆是门</Title>
        <Title level={3}>AI文字交互式多人竞争博弈游戏</Title>
        <p>欢迎来到游戏世界！</p>
      </div>
      <Space>
        <Link to="/rooms">
          <Button type="primary">进入房间列表</Button>
        </Link>
      </Space>
    </Space>
  );
}

export default Home;
