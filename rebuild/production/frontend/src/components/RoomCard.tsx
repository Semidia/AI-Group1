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
  onClose?: (roomId: string) => void;
  onKillGame?: (roomId: string) => void;
  isHost?: boolean;
  loading?: boolean;
}

export function RoomCard({ room, onJoin, onLeave, onClose, onKillGame, isHost, loading }: RoomCardProps) {
  const hostLabel = room.hostName || room.hostId || '未知房主';
  const isFull = room.currentPlayers >= room.maxPlayers;
  const isPlaying = room.status === 'playing';
  const isJoined = room.isJoined ?? false; // 问题2修复：检查用户是否在房间中

  return (
    <Card
      title={
        <Space style={{ width: '100%', justifyContent: 'space-between' }}>
          <Typography.Text 
            strong 
            ellipsis 
            style={{ maxWidth: 180 }} 
            title={room.name}
          >
            {room.name}
          </Typography.Text>
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
            disabled={isFull || isPlaying} // 问题1修复：playing状态不能加入
            loading={loading}
            onClick={() => onJoin(room.id)}
          >
            {isPlaying ? '进行中' : isFull ? '已满' : '加入'}
          </Button>
          {/* 问题2修复：只有加入的房间才显示离开按钮 */}
          {isJoined && (
            <Button size="small" danger loading={loading} onClick={() => onLeave(room.id)}>
              离开
            </Button>
          )}
          {isHost && isPlaying && onKillGame && (
            <Button
              size="small"
              danger
              loading={loading}
              onClick={() => onKillGame(room.id)}
              title="终止进行中的游戏"
            >
              终止游戏
            </Button>
          )}
          {isHost && onClose && !isPlaying && (
            <Button
              size="small"
              danger
              loading={loading}
              onClick={() => onClose(room.id)}
            >
              关闭
            </Button>
          )}
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
