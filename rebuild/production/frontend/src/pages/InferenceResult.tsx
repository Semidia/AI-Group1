import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Space, Tag, Progress, message, List, Button, Row, Col, Empty
} from 'antd';
import {
  ChevronLeft, Loader2, ScrollText, CheckCircle2,
  AlertTriangle, Flag, TrendingUp, Sparkles, Activity
} from 'lucide-react';
import { gameAPI } from '../services/game';
import { wsService } from '../services/websocket';
import { useMessageRouter } from '../hooks/useMessageRouter';
import { GlassCard } from '../components/GlassCard';

// ...接口定义保持不变
interface InferenceResult {
  sessionId: string;
  round: number;
  status: 'processing' | 'completed' | 'failed';
  result?: {
    narrative?: string;
    outcomes?: Array<{
      playerIndex: number;
      outcome: string;
      resources?: Record<string, unknown>;
    }>;
    events?: Array<{
      type: string;
      description: string;
    }>;
    nextRoundHints?: string;
  };
  completedAt?: string;
  error?: string;
}

interface InferenceProgress {
  sessionId: string;
  round: number;
  progress: number;
  message: string;
}

function InferenceResultPage() {
  const { sessionId, round } = useParams<{ sessionId: string; round: string }>();
  const navigate = useNavigate();
  useMessageRouter();

  const [result, setResult] = useState<InferenceResult | null>(null);
  const [progress, setProgress] = useState<InferenceProgress | null>(null);
  const [narrativeText, setNarrativeText] = useState('');
  const typewriterIntervalRef = useRef<number | null>(null);

  const loadResult = async () => {
    if (!sessionId || !round) return;
    try {
      const data = await gameAPI.getInferenceResult(sessionId, Number(round));
      setResult(data);
      if (data.status === 'completed' && data.result?.narrative) {
        startTypewriter(data.result.narrative);
      }
    } catch (err: any) {
      message.error('同步结果失败');
    }
  };

  const startTypewriter = (text: string) => {
    if (typewriterIntervalRef.current) clearInterval(typewriterIntervalRef.current);
    let index = 0;
    typewriterIntervalRef.current = window.setInterval(() => {
      if (index <= text.length) {
        setNarrativeText(text.slice(0, index));
        index++;
      } else {
        clearInterval(typewriterIntervalRef.current!);
      }
    }, 20);
  };

  useEffect(() => {
    loadResult();
    const handleProgress = (p: any) => setProgress(p);
    const handleCompleted = () => loadResult();
    wsService.on('inference_progress', handleProgress);
    wsService.on('inference_completed', handleCompleted);
    return () => {
      wsService.off('inference_progress', handleProgress);
      wsService.off('inference_completed', handleCompleted);
      if (typewriterIntervalRef.current) clearInterval(typewriterIntervalRef.current);
    };
  }, [sessionId, round]);

  return (
    <div className="min-h-screen p-8 text-slate-200">
      <header className="max-w-6xl mx-auto mb-8 flex justify-between items-center">
        <Space size="large">
          <Button ghost icon={<ChevronLeft size={16} />} onClick={() => navigate(`/game/${sessionId}`)}>
            返回战场
          </Button>
          <div className="flex flex-col">
            <h1 className="text-2xl font-bold tech-gradient-text uppercase tracking-widest">推演视界</h1>
            <span className="text-xs text-slate-500">SESSION: {sessionId} · ROUND: {round}</span>
          </div>
        </Space>
        {result?.status === 'processing' && (
          <div className="flex items-center gap-2 text-indigo-400 animate-pulse">
            <Loader2 className="animate-spin" size={20} />
            <span className="font-bold tracking-tighter">AI INFERRING...</span>
          </div>
        )}
      </header>

      <main className="max-w-6xl mx-auto">
        <Row gutter={24}>
          <Col span={16}>
            <GlassCard title="核心叙事" extra={<ScrollText size={18} />}>
              <div className="min-h-[400px] p-8 bg-slate-950/40 rounded-xl leading-relaxed text-xl font-serif">
                {result?.status === 'processing' ? (
                  <div className="flex flex-col items-center justify-center h-full py-20 opacity-40">
                    <Sparkles size={48} className="mb-4" />
                    <p>正在重构因果链路，构筑时空分叉...</p>
                  </div>
                ) : (
                  <p className="typewriter-cursor">{narrativeText}</p>
                )}
              </div>
            </GlassCard>

            {result?.result?.nextRoundHints && (
              <GlassCard title="先导提示" className="border-indigo-500/30">
                <div className="flex gap-4">
                  <Flag className="text-indigo-400 shrink-0" size={24} />
                  <p className="text-slate-300 italic">{result.result.nextRoundHints}</p>
                </div>
              </GlassCard>
            )}
          </Col>

          <Col span={8}>
            {result?.status === 'processing' && (
              <GlassCard title="计算进度" extra={<Activity size={18} />}>
                <Progress
                  percent={progress?.progress || 0}
                  strokeColor={{ '0%': '#6366f1', '100%': '#a5b4fc' }}
                  status="active"
                />
                <p className="mt-4 text-xs text-slate-400">{progress?.message || '初始化计算单元...'}</p>
              </GlassCard>
            )}

            <GlassCard title="实体变动" extra={<TrendingUp size={18} />}>
              <List
                dataSource={result?.result?.outcomes || []}
                renderItem={item => (
                  <div className="p-3 mb-3 bg-white/5 rounded border border-white/5">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-bold tech-gradient-text">P{item.playerIndex}</span>
                      <CheckCircle2 size={14} className="text-emerald-500" />
                    </div>
                    <p className="text-xs text-slate-400 leading-tight">{item.outcome}</p>
                  </div>
                )}
                locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无变动" /> }}
              />
            </GlassCard>

            <GlassCard title="突发事件" extra={<AlertTriangle size={18} />}>
              {result?.result?.events?.map((ev, i) => (
                <div key={i} className="mb-2 p-2 bg-rose-500/10 border-l-2 border-rose-500 pl-3">
                  <Tag color="error" className="mb-1">{ev.type}</Tag>
                  <p className="text-xs">{ev.description}</p>
                </div>
              )) || <p className="text-slate-500 text-xs text-center py-4">无突发情况</p>}
            </GlassCard>
          </Col>
        </Row>
      </main>
    </div>
  );
}

export default InferenceResultPage;
