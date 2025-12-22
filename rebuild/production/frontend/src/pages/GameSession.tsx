import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, Descriptions, Input, Button, Space, Tag, List, message } from 'antd';
import { gameAPI, GameSessionSummary, DecisionSummary } from '../services/game';
import { useAuthStore } from '../stores/authStore';
import { wsService } from '../services/websocket';
import { useSocket } from '../hooks/useSocket';
import { useMessageRouter } from '../hooks/useMessageRouter';

const { TextArea } = Input;

function formatRemaining(deadline?: string | null): string {
  if (!deadline) return '未设置';
  const end = new Date(deadline).getTime();
  const now = Date.now();
  const diff = end - now;
  if (diff <= 0) return '已超时';
  const seconds = Math.floor(diff / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}分${s}秒`;
}

function GameSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const socketStatus = useSocket();
  useMessageRouter();

  const [session, setSession] = useState<GameSessionSummary | null>(null);
  const [decisions, setDecisions] = useState<DecisionSummary[]>([]);
  const [decisionText, setDecisionText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isTimeout = useMemo(() => {
    if (!session?.decisionDeadline) return false;
    return Date.now() > new Date(session.decisionDeadline).getTime();
  }, [session?.decisionDeadline]);

  const loadSession = useMemo(
    () => async () => {
      if (!sessionId) return;
      try {
        const data = await gameAPI.getSession(sessionId);
        setSession(data);
      } catch (err) {
        message.error('获取会话信息失败');
      }
    },
    [sessionId]
  );

  const loadDecisions = useMemo(
    () => async () => {
      if (!sessionId || !session?.currentRound) return;
      try {
        const data = await gameAPI.getRoundDecisions(sessionId, session.currentRound);
        setDecisions(data.actions);
      } catch (err) {
        // 允许在游戏刚开始时无决策记录
      }
    },
    [sessionId, session?.currentRound]
  );

  useEffect(() => {
    if (!sessionId) return;
    loadSession();
  }, [sessionId, loadSession]);

  useEffect(() => {
    loadDecisions();
  }, [loadDecisions]);

  useEffect(() => {
    if (!sessionId) return;
    wsService.setActiveSession(sessionId);

    const handleDecisionStatusUpdate = (payload: unknown) => {
      if (
        !payload ||
        typeof payload !== 'object' ||
        !('sessionId' in payload) ||
        (payload as { sessionId?: string }).sessionId !== sessionId
      ) {
        return;
      }
      loadDecisions();
    };

    const handleGameStateUpdate = (payload: unknown) => {
      if (
        !payload ||
        typeof payload !== 'object' ||
        !('sessionId' in payload) ||
        (payload as { sessionId?: string }).sessionId !== sessionId
      ) {
        return;
      }
      const data = payload as {
        sessionId: string;
        roomId: string;
        currentRound: number;
        roundStatus: string;
        decisionDeadline?: string | null;
        status: string;
      };
      setSession({
        sessionId: data.sessionId,
        roomId: data.roomId,
        currentRound: data.currentRound,
        roundStatus: data.roundStatus,
        decisionDeadline: data.decisionDeadline,
        status: data.status,
      });
    };

    wsService.on('decision_status_update', handleDecisionStatusUpdate);
    wsService.on('game_state_update', handleGameStateUpdate);

    return () => {
      wsService.setActiveSession(null);
      wsService.off('decision_status_update', handleDecisionStatusUpdate);
      wsService.off('game_state_update', handleGameStateUpdate);
    };
  }, [sessionId, loadDecisions]);

  const handleSubmitDecision = async () => {
    if (!sessionId || !session) return;
    if (!decisionText.trim()) {
      message.warning('请输入决策内容');
      return;
    }
    if (isTimeout) {
      message.error('当前回合已超时，无法提交决策');
      return;
    }
    setSubmitting(true);
    try {
      await gameAPI.submitDecision(sessionId, {
        round: session.currentRound,
        actionText: decisionText.trim(),
      });
      setDecisionText('');
      await loadDecisions();
      message.success('决策已提交');
    } catch (err) {
      message.error('提交决策失败');
    } finally {
      setSubmitting(false);
    }
  };

  if (!sessionId) {
    return <Card>缺少会话 ID</Card>;
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Button onClick={() => navigate('/rooms')}>返回房间列表</Button>
      <Card
        title="游戏会话"
        extra={
          <Space>
            <Tag
              color={
                socketStatus === 'connected'
                  ? 'green'
                  : socketStatus === 'connecting'
                    ? 'orange'
                    : 'red'
              }
            >
              WebSocket：
              {socketStatus === 'connected'
                ? '已连接'
                : socketStatus === 'connecting'
                  ? '连接中'
                  : '未连接'}
            </Tag>
            {session && (
              <Tag color={isTimeout ? 'red' : 'blue'}>
                决策剩余时间：{formatRemaining(session.decisionDeadline)}
              </Tag>
            )}
          </Space>
        }
      >
        {session ? (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label="会话ID" span={2}>
                {session.sessionId}
              </Descriptions.Item>
              <Descriptions.Item label="房间ID">{session.roomId}</Descriptions.Item>
              <Descriptions.Item label="当前回合">{session.currentRound}</Descriptions.Item>
              <Descriptions.Item label="阶段">{session.roundStatus}</Descriptions.Item>
              <Descriptions.Item label="状态">{session.status}</Descriptions.Item>
            </Descriptions>

            <Space align="start" style={{ width: '100%' }} size="large">
              <Card title="我的决策" style={{ flex: 1 }}>
                <TextArea
                  rows={6}
                  value={decisionText}
                  onChange={e => setDecisionText(e.target.value)}
                  placeholder="请输入本回合的决策内容（文本描述即可）"
                />
                <Button
                  type="primary"
                  style={{ marginTop: 12 }}
                  block
                  loading={submitting}
                  onClick={handleSubmitDecision}
                  disabled={!user}
                >
                  提交决策
                </Button>
              </Card>

              <Card title="决策状态" style={{ flex: 1 }}>
                <List
                  dataSource={decisions}
                  renderItem={(item: DecisionSummary) => (
                    <List.Item>
                      <Space>
                        <Tag>{item.playerIndex}</Tag>
                        <span>{item.userId === user?.userId ? '我' : item.userId}</span>
                        <Tag color={item.status === 'submitted' ? 'green' : 'default'}>
                          {item.status}
                        </Tag>
                      </Space>
                    </List.Item>
                  )}
                />
              </Card>
            </Space>
          </Space>
        ) : (
          <div>正在加载会话信息...</div>
        )}
      </Card>
    </Space>
  );
}

export default GameSessionPage;


