import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, Descriptions, Space, Spin, Tag, Button, message } from 'antd';
import { roomAPI, RoomSummary } from '../services/rooms';
import { wsService } from '../services/websocket';
import { useAuthStore } from '../stores/authStore';

const statusColor: Record<string, string> = {
  waiting: 'blue',
  playing: 'green',
  closed: 'default',
};

function WaitingRoom() {
  const { roomId } = useParams<{ roomId: string }>();
  const { token } = useAuthStore();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [loading, setLoading] = useState(false);

  const getErrMsg = (error: unknown, fallback: string) => {
    if (typeof error === 'object' && error && 'response' in error) {
      const resp = (error as { response?: { data?: { message?: string } } }).response;
      if (resp?.data?.message) return resp.data.message;
    }
    if (error instanceof Error) return error.message;
    return fallback;
  };

  const loadRooms = useMemo(
    () => async () => {
      setLoading(true);
      try {
        const result = await roomAPI.list({ limit: 200 });
        setRooms(result.rooms);
      } catch (err) {
        message.error(getErrMsg(err, '获取房间信息失败'));
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  useEffect(() => {
    if (!token) return;
    wsService.connect(token);
    const refresh = () => loadRooms();
    wsService.on('player_joined', refresh);
    wsService.on('player_left', refresh);
    wsService.on('system_message', refresh);
    return () => {
      wsService.off('player_joined', refresh);
      wsService.off('player_left', refresh);
      wsService.off('system_message', refresh);
    };
  }, [token, loadRooms]);

  const currentRoom = rooms.find(r => r.id === roomId);

  if (!roomId) {
    return <Card>房间 ID 缺失</Card>;
  }

  return (
    <Spin spinning={loading && !currentRoom}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Button onClick={() => navigate('/rooms')}>返回房间列表</Button>
        <Card title={`房间等待中：${currentRoom?.name || roomId}`}>
          {currentRoom ? (
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="房间名">{currentRoom.name}</Descriptions.Item>
              <Descriptions.Item label="人数">
                {currentRoom.currentPlayers}/{currentRoom.maxPlayers}
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={statusColor[currentRoom.status] || 'default'}>{currentRoom.status}</Tag>
              </Descriptions.Item>
            </Descriptions>
          ) : (
            <div>未找到房间，可能已被关闭或尚未加载。</div>
          )}
        </Card>
      </Space>
    </Spin>
  );
}

export default WaitingRoom;
