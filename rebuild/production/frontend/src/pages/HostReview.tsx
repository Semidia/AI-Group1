import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Button,
  List,
  Input,
  Space,
  Tag,
  message,
  Modal,
  Descriptions,
  Divider,
  Typography,
  Steps,
} from 'antd';
import {
  gameAPI,
  ReviewDecisions,
  ReviewDecisionSummary,
  TemporaryEvent,
  TemporaryRule,
} from '../services/game';
import { useAuthStore } from '../stores/authStore';
import { wsService } from '../services/websocket';
import { useSocket } from '../hooks/useSocket';
import { useMessageRouter } from '../hooks/useMessageRouter';

const { TextArea } = Input;
const { Title, Text } = Typography;
const { Step } = Steps;

function HostReviewPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const socketStatus = useSocket();
  useMessageRouter();

  const [reviewData, setReviewData] = useState<ReviewDecisions | null>(null);
  const [loading, setLoading] = useState(false);
  const [eventModalVisible, setEventModalVisible] = useState(false);
  const [ruleModalVisible, setRuleModalVisible] = useState(false);
  const [submitModalVisible, setSubmitModalVisible] = useState(false);

  // 临时事件表单
  const [eventType, setEventType] = useState<'single_round' | 'multi_round'>('single_round');
  const [eventContent, setEventContent] = useState('');
  const [eventRounds, setEventRounds] = useState(1);

  // 临时规则表单
  const [ruleContent, setRuleContent] = useState('');
  const [ruleRounds, setRuleRounds] = useState(1);

  const loadReviewData = async () => {
    if (!sessionId || !reviewData?.round) return;
    try {
      setLoading(true);
      const data = await gameAPI.getReviewDecisions(sessionId, reviewData.round);
      setReviewData(data);
    } catch (err: any) {
      message.error(err?.response?.data?.message || '获取审核数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!sessionId) return;
    // 初始加载时，需要先获取会话信息来确定当前回合
    gameAPI
      .getSession(sessionId)
      .then(session => {
        // 假设当前回合就是需要审核的回合
        return gameAPI.getReviewDecisions(sessionId, session.currentRound);
      })
      .then(data => {
        setReviewData(data);
      })
      .catch(err => {
        message.error('获取审核数据失败');
        console.error(err);
      });
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    wsService.setActiveSession(sessionId);

    const handleRoundStageChanged = (payload: unknown) => {
      if (
        !payload ||
        typeof payload !== 'object' ||
        !('sessionId' in payload) ||
        (payload as { sessionId?: string }).sessionId !== sessionId
      ) {
        return;
      }
      loadReviewData();
    };

    wsService.on('round_stage_changed', handleRoundStageChanged);
    wsService.on('temporary_event_added', () => loadReviewData());
    wsService.on('temporary_rule_added', () => loadReviewData());
    wsService.on('inference_started', () => {
      message.info('AI推演已开始');
      // 可以跳转到推演结果页面
    });

    return () => {
      wsService.off('round_stage_changed', handleRoundStageChanged);
      wsService.off('temporary_event_added', loadReviewData);
      wsService.off('temporary_rule_added', loadReviewData);
      wsService.off('inference_started', () => {});
    };
  }, [sessionId]);

  const handleAddEvent = async () => {
    if (!sessionId || !reviewData) return;
    if (!eventContent.trim()) {
      message.error('事件内容不能为空');
      return;
    }

    try {
      setLoading(true);
      await gameAPI.addTemporaryEvent(sessionId, reviewData.round, {
        eventType,
        eventContent: eventContent.trim(),
        effectiveRounds: eventType === 'multi_round' ? eventRounds : undefined,
      });
      message.success('临时事件已添加');
      setEventModalVisible(false);
      setEventContent('');
      setEventRounds(1);
      loadReviewData();
    } catch (err: any) {
      message.error(err?.response?.data?.message || '添加临时事件失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAddRule = async () => {
    if (!sessionId || !reviewData) return;
    if (!ruleContent.trim()) {
      message.error('规则内容不能为空');
      return;
    }

    try {
      setLoading(true);
      await gameAPI.addTemporaryRule(sessionId, reviewData.round, {
        ruleContent: ruleContent.trim(),
        effectiveRounds: ruleRounds,
      });
      message.success('临时规则已添加');
      setRuleModalVisible(false);
      setRuleContent('');
      setRuleRounds(1);
      loadReviewData();
    } catch (err: any) {
      message.error(err?.response?.data?.message || '添加临时规则失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitToAI = async () => {
    if (!sessionId || !reviewData) return;

    try {
      setLoading(true);
      const result = await gameAPI.submitToAI(sessionId, reviewData.round);
      message.success('已提交给AI推演');
      setSubmitModalVisible(false);
      // 可以显示推演数据预览
      console.log('推演数据:', result.inferenceData);
    } catch (err: any) {
      message.error(err?.response?.data?.message || '提交推演失败');
    } finally {
      setLoading(false);
    }
  };

  if (!reviewData) {
    return <Card loading>加载中...</Card>;
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <Card>
        <Space direction="vertical" style={{ width: '100%' }} size="large">
          <div>
            <Title level={3}>主持人审核</Title>
            <Space>
              <Tag color={socketStatus === 'connected' ? 'green' : 'red'}>
                WebSocket: {socketStatus === 'connected' ? '已连接' : '未连接'}
              </Tag>
              <Tag>回合: {reviewData.round}</Tag>
              <Tag color={reviewData.timedOut ? 'red' : 'green'}>
                {reviewData.timedOut ? '已超时' : '进行中'}
              </Tag>
            </Space>
          </div>

          <Divider />

          <Card title="决策列表" extra={<Button onClick={loadReviewData}>刷新</Button>}>
            <List
              dataSource={reviewData.actions}
              loading={loading}
              renderItem={(action: ReviewDecisionSummary) => (
                <List.Item>
                  <List.Item.Meta
                    title={
                      <Space>
                        <Text strong>玩家 {action.playerIndex}</Text>
                        <Text type="secondary">({action.username})</Text>
                        <Tag color={action.status === 'submitted' ? 'blue' : 'green'}>
                          {action.status}
                        </Tag>
                        {action.hostModified && <Tag color="orange">已修改</Tag>}
                      </Space>
                    }
                    description={
                      <div>
                        {action.actionText && (
                          <div>
                            <Text strong>决策内容:</Text>
                            <Text>{action.actionText}</Text>
                          </div>
                        )}
                        {action.selectedOptionIds && (
                          <div>
                            <Text strong>选项ID:</Text>
                            <Text code>{JSON.stringify(action.selectedOptionIds)}</Text>
                          </div>
                        )}
                        {action.hostModification && (
                          <div>
                            <Text strong>主持人修改:</Text>
                            <Text code>{JSON.stringify(action.hostModification)}</Text>
                          </div>
                        )}
                        <div>
                          <Text type="secondary">
                            提交时间: {new Date(action.submittedAt).toLocaleString()}
                          </Text>
                        </div>
                      </div>
                    }
                  />
                </List.Item>
              )}
            />
          </Card>

          <Card title="操作">
            <Space>
              <Button type="primary" onClick={() => setEventModalVisible(true)}>
                添加临时事件
              </Button>
              <Button type="primary" onClick={() => setRuleModalVisible(true)}>
                添加临时规则
              </Button>
              <Button
                type="primary"
                danger
                onClick={() => setSubmitModalVisible(true)}
                disabled={reviewData.actions.length === 0}
              >
                提交给AI推演
              </Button>
            </Space>
          </Card>
        </Space>
      </Card>

      {/* 添加临时事件弹窗 */}
      <Modal
        title="添加临时事件"
        open={eventModalVisible}
        onOk={handleAddEvent}
        onCancel={() => {
          setEventModalVisible(false);
          setEventContent('');
          setEventRounds(1);
        }}
        confirmLoading={loading}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Text strong>事件类型:</Text>
            <Space style={{ marginTop: 8 }}>
              <Button
                type={eventType === 'single_round' ? 'primary' : 'default'}
                onClick={() => setEventType('single_round')}
              >
                单回合事件
              </Button>
              <Button
                type={eventType === 'multi_round' ? 'primary' : 'default'}
                onClick={() => setEventType('multi_round')}
              >
                多回合事件
              </Button>
            </Space>
          </div>
          {eventType === 'multi_round' && (
            <div>
              <Text strong>有效回合数:</Text>
              <Input
                type="number"
                min={1}
                value={eventRounds}
                onChange={e => setEventRounds(Number(e.target.value) || 1)}
                style={{ marginTop: 8 }}
              />
            </div>
          )}
          <div>
            <Text strong>事件内容:</Text>
            <TextArea
              rows={6}
              value={eventContent}
              onChange={e => setEventContent(e.target.value)}
              placeholder="请输入事件内容..."
              style={{ marginTop: 8 }}
            />
          </div>
        </Space>
      </Modal>

      {/* 添加临时规则弹窗 */}
      <Modal
        title="添加临时规则"
        open={ruleModalVisible}
        onOk={handleAddRule}
        onCancel={() => {
          setRuleModalVisible(false);
          setRuleContent('');
          setRuleRounds(1);
        }}
        confirmLoading={loading}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Text strong>有效回合数:</Text>
            <Input
              type="number"
              min={1}
              value={ruleRounds}
              onChange={e => setRuleRounds(Number(e.target.value) || 1)}
              style={{ marginTop: 8 }}
            />
          </div>
          <div>
            <Text strong>规则内容:</Text>
            <TextArea
              rows={6}
              value={ruleContent}
              onChange={e => setRuleContent(e.target.value)}
              placeholder="请输入规则内容..."
              style={{ marginTop: 8 }}
            />
          </div>
        </Space>
      </Modal>

      {/* 提交推演确认弹窗 */}
      <Modal
        title="提交给AI推演"
        open={submitModalVisible}
        onOk={handleSubmitToAI}
        onCancel={() => setSubmitModalVisible(false)}
        confirmLoading={loading}
        okText="确认提交"
        cancelText="取消"
      >
        <Text>确认要将当前回合的所有决策提交给AI进行推演吗？</Text>
        <br />
        <Text type="secondary">
          提交后，系统将收集所有决策、活跃事件和规则，并调用AI API进行推演。
        </Text>
      </Modal>
    </div>
  );
}

export default HostReviewPage;

