import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Typography,
  Space,
  Tag,
  Timeline,
  Button,
  Progress,
  Alert,
  Spin,
  message,
  Divider,
} from 'antd';
import {
  PlayCircleOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { gameAPI } from '../services/game';
import { wsService } from '../services/websocket';
import { useSocket } from '../hooks/useSocket';
import { useMessageRouter } from '../hooks/useMessageRouter';
import { useAuthStore } from '../stores/authStore';

const { Title, Text, Paragraph } = Typography;

interface GameState {
  sessionId: string;
  roomId: string;
  currentRound: number;
  totalRounds: number | null;
  roundStatus: 'decision' | 'review' | 'inference' | 'result' | 'finished';
  gameStatus: 'playing' | 'paused' | 'finished';
  decisionDeadline: string | null;
  gameState: Record<string, unknown> | null;
  inferenceResult: {
    status: string;
    result?: any;
    completedAt?: string;
  } | null;
  activeEvents: Array<{
    id: string;
    eventType: string;
    eventContent: string;
    effectiveRounds: number;
    progress: Record<string, unknown>;
    round: number;
  }>;
  submittedDecisions: number;
  totalPlayers: number;
  updatedAt: string;
}

interface RoundHistory {
  round: number;
  status: string;
  result?: any;
  completedAt?: string;
}

function GameStatePage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const socketStatus = useSocket();
  const { user } = useAuthStore();
  useMessageRouter();

  const [gameState, setGameState] = useState<GameState | null>(null);
  const [history, setHistory] = useState<RoundHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [isHost, setIsHost] = useState(false);

  const loadGameState = async () => {
    if (!sessionId) return;
    try {
      setLoading(true);
      const data = await gameAPI.getGameState(sessionId);
      setGameState(data);
      
      // 检查是否是主持人（通过房间API）
      try {
        const roomData = await fetch(`/api/rooms/${data.roomId}`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        }).then(res => res.json());
        if (roomData.data) {
          setIsHost(roomData.data.hostId === user?.id);
        }
      } catch {
        // 如果获取房间信息失败，不影响主功能
      }
    } catch (err: any) {
      message.error(err?.response?.data?.message || '获取游戏状态失败');
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async () => {
    if (!sessionId) return;
    try {
      const data = await gameAPI.getGameHistory(sessionId);
      setHistory(data.history);
    } catch (err: any) {
      // 历史记录加载失败不影响主功能
      console.error('Failed to load history:', err);
    }
  };

  const handleNextRound = async () => {
    if (!sessionId || !gameState) return;
    try {
      await gameAPI.nextRound(sessionId, gameState.currentRound);
      message.success('已进入下一回合');
      loadGameState();
      loadHistory();
    } catch (err: any) {
      message.error(err?.response?.data?.message || '进入下一回合失败');
    }
  };

  useEffect(() => {
    if (!sessionId) return;
    wsService.setActiveSession(sessionId);

    const handleRoundChanged = (payload: unknown) => {
      if (
        !payload ||
        typeof payload !== 'object' ||
        !('sessionId' in payload) ||
        (payload as { sessionId?: string }).sessionId !== sessionId
      ) {
        return;
      }
      message.info('回合已切换');
      loadGameState();
      loadHistory();
    };

    const handleStageChanged = (payload: unknown) => {
      if (
        !payload ||
        typeof payload !== 'object' ||
        !('sessionId' in payload) ||
        (payload as { sessionId?: string }).sessionId !== sessionId
      ) {
        return;
      }
      const stageData = payload as { stage?: string; previousStage?: string };
      message.info(`阶段切换: ${stageData.previousStage} → ${stageData.stage}`);
      loadGameState();
    };

    const handleGameFinished = (payload: unknown) => {
      if (
        !payload ||
        typeof payload !== 'object' ||
        !('sessionId' in payload) ||
        (payload as { sessionId?: string }).sessionId !== sessionId
      ) {
        return;
      }
      message.success('游戏已结束');
      loadGameState();
    };

    wsService.on('round_changed', handleRoundChanged);
    wsService.on('stage_changed', handleStageChanged);
    wsService.on('game_finished', handleGameFinished);

    // 初始加载
    loadGameState();
    loadHistory();

    // 定期刷新
    const refreshInterval = setInterval(() => {
      loadGameState();
    }, 5000);

    return () => {
      wsService.off('round_changed', handleRoundChanged);
      wsService.off('stage_changed', handleStageChanged);
      wsService.off('game_finished', handleGameFinished);
      clearInterval(refreshInterval);
    };
  }, [sessionId]);

  if (loading && !gameState) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <Spin size="large" />
        <div style={{ marginTop: 16 }}>
          <Text>加载游戏状态...</Text>
        </div>
      </div>
    );
  }

  if (!gameState) {
    return (
      <Card>
        <Alert message="无法加载游戏状态" type="error" />
      </Card>
    );
  }

  const getStageLabel = (stage: string): string => {
    const labels: Record<string, string> = {
      decision: '决策阶段',
      review: '审核阶段',
      inference: '推演阶段',
      result: '结果阶段',
      finished: '已结束',
    };
    return labels[stage] || stage;
  };

  const getStageColor = (stage: string): string => {
    const colors: Record<string, string> = {
      decision: 'blue',
      review: 'orange',
      inference: 'purple',
      result: 'green',
      finished: 'default',
    };
    return colors[stage] || 'default';
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <Card>
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          {/* 游戏状态概览 */}
          <div>
            <Title level={3}>游戏状态</Title>
            <Space wrap>
              <Tag color={socketStatus === 'connected' ? 'green' : 'red'}>
                WebSocket: {socketStatus === 'connected' ? '已连接' : '未连接'}
              </Tag>
              <Tag>会话: {gameState.sessionId}</Tag>
              <Tag>当前回合: {gameState.currentRound}</Tag>
              {gameState.totalRounds && (
                <Tag>总回合数: {gameState.totalRounds}</Tag>
              )}
              <Tag color={getStageColor(gameState.roundStatus)}>
                {getStageLabel(gameState.roundStatus)}
              </Tag>
              <Tag color={gameState.gameStatus === 'finished' ? 'red' : 'green'}>
                {gameState.gameStatus === 'finished' ? '已结束' : '进行中'}
              </Tag>
            </Space>
          </div>

          {/* 回合进度 */}
          {gameState.totalRounds && (
            <div>
              <Text strong>回合进度:</Text>
              <Progress
                percent={Math.round((gameState.currentRound / gameState.totalRounds) * 100)}
                status={gameState.gameStatus === 'finished' ? 'success' : 'active'}
                style={{ marginTop: 8 }}
              />
            </div>
          )}

          {/* 决策提交状态 */}
          {gameState.roundStatus === 'decision' && (
            <Alert
              message={`决策提交: ${gameState.submittedDecisions}/${gameState.totalPlayers}`}
              type="info"
              showIcon
            />
          )}

          {/* 推演结果 */}
          {gameState.roundStatus === 'result' && gameState.inferenceResult?.result && (
            <Card title="本轮推演结果" size="small">
              {gameState.inferenceResult.result.narrative && (
                <Paragraph style={{ whiteSpace: 'pre-wrap' }}>
                  {gameState.inferenceResult.result.narrative}
                </Paragraph>
              )}
              <Button
                type="link"
                onClick={() => navigate(`/game/${sessionId}/round/${gameState.currentRound}/inference`)}
              >
                查看详细结果 →
              </Button>
            </Card>
          )}

          {/* 主持人操作 */}
          {isHost && gameState.roundStatus === 'result' && gameState.gameStatus !== 'finished' && (
            <Card>
              <Space>
                <Text strong>主持人操作:</Text>
                <Button
                  type="primary"
                  icon={<RightOutlined />}
                  onClick={handleNextRound}
                >
                  进入下一回合
                </Button>
              </Space>
            </Card>
          )}

          {/* 游戏结束提示 */}
          {gameState.gameStatus === 'finished' && (
            <Alert
              message="游戏已结束"
              description={`游戏在第 ${gameState.currentRound} 回合结束`}
              type="success"
              showIcon
            />
          )}

          <Divider />

          {/* 回合历史 */}
          <div>
            <Title level={4}>回合历史</Title>
            <Timeline>
              {history.map((item, index) => (
                <Timeline.Item
                  key={index}
                  dot={
                    item.status === 'completed' ? (
                      <CheckCircleOutlined style={{ fontSize: '16px' }} />
                    ) : item.status === 'processing' ? (
                      <ClockCircleOutlined style={{ fontSize: '16px' }} />
                    ) : (
                      <PlayCircleOutlined style={{ fontSize: '16px' }} />
                    )
                  }
                  color={
                    item.status === 'completed'
                      ? 'green'
                      : item.status === 'failed'
                      ? 'red'
                      : 'blue'
                  }
                >
                  <Text strong>第 {item.round} 回合</Text>
                  <br />
                  <Text type="secondary">
                    状态: {item.status === 'completed' ? '已完成' : item.status === 'failed' ? '失败' : '未知'}
                  </Text>
                  {item.completedAt && (
                    <>
                      <br />
                      <Text type="secondary" style={{ fontSize: '12px' }}>
                        完成时间: {new Date(item.completedAt).toLocaleString()}
                      </Text>
                    </>
                  )}
                </Timeline.Item>
              ))}
            </Timeline>
          </div>

          {/* 活跃事件 */}
          {gameState.activeEvents.length > 0 && (
            <div>
              <Title level={4}>活跃事件</Title>
              <Space direction="vertical" style={{ width: '100%' }}>
                {gameState.activeEvents.map(event => (
                  <Card key={event.id} size="small">
                    <Space>
                      <Tag>{event.eventType}</Tag>
                      <Text>{event.eventContent}</Text>
                    </Space>
                  </Card>
                ))}
              </Space>
            </div>
          )}

          {/* 快速导航 */}
          <Divider />
          <Space>
            <Button onClick={() => navigate(`/game/${sessionId}/review`)}>
              审核页面
            </Button>
            <Button onClick={() => navigate(`/game/${sessionId}/events`)}>
              事件进度
            </Button>
            {gameState.roundStatus === 'result' && (
              <Button
                onClick={() =>
                  navigate(`/game/${sessionId}/round/${gameState.currentRound}/inference`)
                }
              >
                推演结果
              </Button>
            )}
          </Space>
        </Space>
      </Card>
    </div>
  );
}

export default GameStatePage;

