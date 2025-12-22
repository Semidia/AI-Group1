import { Card, Space, Tag, Button, Typography } from 'antd';
import { UserOutlined, TeamOutlined } from '@ant-design/icons';
import { RoomSummary } from '../services/rooms';

const statusColor: Record<string, string> = {
  waiting: 'blue',
  playing: 'green',
  closed: 'default',
};

interface RoomCardProps {
  room: RoomSummary;
  onJoin: (roomId: string) => void;
  onLeave: (roomId: string) => void;
  loading?: boolean;
}

export function RoomCard({ room, onJoin, onLeave, loading }: RoomCardProps) {
  const hostLabel = room.hostName || room.hostId || '未知房主';
  const isFull = room.currentPlayers >= room.maxPlayers;

  return (
    <Card
      title={
        <Space>
          <Typography.Text strong>{room.name}</Typography.Text>
          <Tag color={statusColor[room.status] || 'default'}>{room.status}</Tag>
        </Space>
      }
      style={{ width: 320 }}
      size="small"
      extra={
        <Space>
          <Button
            type="primary"
            size="small"
            disabled={isFull}
            loading={loading}
            onClick={() => onJoin(room.id)}
          >
            {isFull ? '已满' : '加入'}
          </Button>
          <Button size="small" danger loading={loading} onClick={() => onLeave(room.id)}>
            离开
          </Button>
        </Space>
      }
    >
      <Space direction="vertical" size={6}>
        <Space>
          <TeamOutlined />
          <Typography.Text>
            人数：{room.currentPlayers}/{room.maxPlayers}
          </Typography.Text>
        </Space>
        <Space>
          <UserOutlined />
          <Typography.Text>房主：{hostLabel}</Typography.Text>
        </Space>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          创建时间：{new Date(room.createdAt).toLocaleString()}
        </Typography.Text>
      </Space>
    </Card>
  );
}

export default RoomCard;
