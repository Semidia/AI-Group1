import { Router } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import prisma from '../utils/db';
import { AppError } from '../middleware/errorHandler';
import { io } from '../server';
import { aiService, InferenceRequest } from '../services/aiService';
import redis from '../utils/redis';
import { logger } from '../utils/logger';

const router = Router();

// 获取房间内玩家成员关系
const ensureRoomMembership = async (roomId: string, userId: string) => {
  const membership = await prisma.roomPlayer.findFirst({
    where: {
      roomId,
      userId,
      status: { not: 'left' },
    },
  });
  if (!membership) {
    throw new AppError('用户不在房间中', 403);
  }
  return membership;
};

// 确保用户是房间主持人
const ensureRoomHost = async (roomId: string, userId: string) => {
  const room = await prisma.room.findUnique({ where: { id: roomId } });
  if (!room) {
    throw new AppError('房间不存在', 404);
  }
  if (room.hostId !== userId) {
    throw new AppError('只有主持人可以执行此操作', 403);
  }
  return room;
};

/**
 * POST /api/game/:roomId/start
 * 开始游戏，创建或返回当前房间的 GameSession
 */
router.post('/:roomId/start', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.userId;
    const { roomId } = req.params;
    if (!userId) throw new AppError('Unauthorized', 401);

    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new AppError('房间不存在', 404);
    if (room.hostId !== userId) throw new AppError('只有房主可以开始游戏', 403);

    const hostConfig = await prisma.hostConfig.findUnique({ where: { roomId } });
    if (!hostConfig || !hostConfig.initializationCompleted) {
      throw new AppError('主持人配置未完成，无法开始游戏', 400);
    }

    // 如果已存在会话且处于进行中，直接返回
    let session = await prisma.gameSession.findUnique({ where: { roomId } });
    const now = new Date();
    const decisionMinutes = hostConfig.decisionTimeLimit || 4;
    const deadline = new Date(now.getTime() + decisionMinutes * 60 * 1000);

    if (!session) {
      session = await prisma.gameSession.create({
        data: {
          roomId,
          currentRound: 1,
          roundStatus: 'decision',
          status: 'playing',
          decisionDeadline: deadline,
        },
      });
    } else if (session.status !== 'playing') {
      // 重新开始或继续游戏时，重置到决策阶段
      session = await prisma.gameSession.update({
        where: { id: session.id },
        data: {
          status: 'playing',
          roundStatus: 'decision',
          decisionDeadline: deadline,
        },
      });
    }

    // 标记房间状态为 playing
    if (room.status !== 'playing') {
      await prisma.room.update({
        where: { id: roomId },
        data: { status: 'playing', startedAt: now },
      });
    }

    // 通过 WebSocket 广播回合阶段变化和游戏状态
    io.to(roomId).emit('round_stage_changed', {
      sessionId: session.id,
      round: session.currentRound,
      stage: session.roundStatus,
    });
    io.to(roomId).emit('game_state_update', {
      roomId,
      sessionId: session.id,
      currentRound: session.currentRound,
      roundStatus: session.roundStatus,
      decisionDeadline: session.decisionDeadline,
      status: session.status,
    });

    res.json({
      code: 200,
      message: '游戏已开始',
      data: {
        session: {
          id: session.id,
          roomId,
          currentRound: session.currentRound,
          roundStatus: session.roundStatus,
          decisionDeadline: session.decisionDeadline,
          status: session.status,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/game/history
 * 获取游戏历史记录列表（当前用户参与的）
 * 注意：必须在 /:sessionId 之前定义，避免路由冲突
 */
router.get(
  '/history',
  authenticateToken,
  async (req: AuthRequest, res, next) => {
    try {
      const userId = req.userId;
      if (!userId) throw new AppError('Unauthorized', 401);

      const { page = 1, limit = 10, status } = req.query;
      const pageNum = Number(page) || 1;
      const limitNum = Number(limit) || 10;
      const skip = (pageNum - 1) * limitNum;

      // 获取用户参与的所有游戏会话（通过RoomPlayer关联）
      const where: any = {
        room: {
          players: {
            some: {
              userId,
              status: { not: 'left' },
            },
          },
        },
      };

      if (status) {
        where.status = status;
      }

      const [sessions, total] = await Promise.all([
        prisma.gameSession.findMany({
          where,
          include: {
            room: {
              include: {
                host: {
                  select: {
                    id: true,
                    username: true,
                    nickname: true,
                  },
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limitNum,
        }),
        prisma.gameSession.count({ where }),
      ]);

      const history = sessions.map(session => ({
        id: session.id,
        sessionId: session.id,
        roomId: session.roomId,
        roomName: session.room.name,
        hostName: session.room.host.nickname || session.room.host.username,
        currentRound: session.currentRound,
        totalRounds: session.totalRounds,
        status: session.status,
        roundStatus: session.roundStatus,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        finishedAt: session.status === 'finished' ? session.updatedAt : null,
      }));

      res.json({
        code: 200,
        data: {
          history,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            totalPages: Math.ceil(total / limitNum),
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/game/history/statistics
 * 获取游戏历史统计
 * 注意：必须在 /history/:sessionId 之前定义
 */
router.get(
  '/history/statistics',
  authenticateToken,
  async (req: AuthRequest, res, next) => {
    try {
      const userId = req.userId;
      if (!userId) throw new AppError('Unauthorized', 401);

      // 获取用户参与的所有游戏会话
      const allSessions = await prisma.gameSession.findMany({
        where: {
          room: {
            players: {
              some: {
                userId,
                status: { not: 'left' },
              },
            },
          },
        },
        include: {
          room: true,
        },
      });

      const totalGames = allSessions.length;
      const finishedGames = allSessions.filter(s => s.status === 'finished').length;
      const playingGames = allSessions.filter(s => s.status === 'playing').length;
      const totalRounds = allSessions.reduce((sum, s) => sum + s.currentRound, 0);
      const averageRounds = totalGames > 0 ? (totalRounds / totalGames).toFixed(2) : 0;

      // 按状态统计
      const byStatus = {
        finished: finishedGames,
        playing: playingGames,
        paused: allSessions.filter(s => s.status === 'paused').length,
      };

      // 按月份统计（最近6个月）
      const monthlyStats: Record<string, number> = {};
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        monthlyStats[monthKey] = allSessions.filter(s => {
          const sessionDate = new Date(s.createdAt);
          return (
            sessionDate.getFullYear() === date.getFullYear() &&
            sessionDate.getMonth() === date.getMonth()
          );
        }).length;
      }

      res.json({
        code: 200,
        data: {
          totalGames,
          finishedGames,
          playingGames,
          totalRounds,
          averageRounds: Number(averageRounds),
          byStatus,
          monthlyStats,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/game/history/:sessionId
 * 获取游戏历史详情
 */
router.get(
  '/history/:sessionId',
  authenticateToken,
  async (req: AuthRequest, res, next) => {
    try {
      const userId = req.userId;
      const { sessionId } = req.params;
      if (!userId) throw new AppError('Unauthorized', 401);

      const session = await prisma.gameSession.findUnique({
        where: { id: sessionId },
        include: {
          room: {
            include: {
              host: {
                select: {
                  id: true,
                  username: true,
                  nickname: true,
                },
              },
              hostConfig: true,
            },
          },
          actions: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  nickname: true,
                },
              },
            },
            orderBy: [{ round: 'asc' }, { submittedAt: 'asc' }],
          },
          events: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      if (!session) throw new AppError('游戏历史不存在', 404);

      // 检查用户是否参与过此游戏
      const membership = await prisma.roomPlayer.findFirst({
        where: {
          roomId: session.roomId,
          userId,
        },
      });
      if (!membership) {
        throw new AppError('您未参与此游戏', 403);
      }

      // 获取所有回合的推演结果
      const roundResults: Array<{
        round: number;
        status: string;
        result?: any;
        completedAt?: string;
      }> = [];

      for (let round = 1; round <= session.currentRound; round++) {
        const resultKey = `inference:result:${sessionId}:${round}`;
        const resultData = await redis.get(resultKey);
        
        if (resultData) {
          const result = JSON.parse(resultData);
          roundResults.push({
            round,
            status: result.status,
            result: result.result,
            completedAt: result.completedAt,
          });
        }
      }

      res.json({
        code: 200,
        data: {
          id: session.id,
          sessionId: session.id,
          roomId: session.roomId,
          roomName: session.room.name,
          hostName: session.room.host.nickname || session.room.host.username,
          currentRound: session.currentRound,
          totalRounds: session.totalRounds,
          status: session.status,
          roundStatus: session.roundStatus,
          gameState: session.gameState,
          roundResults,
          actions: session.actions,
          events: session.events,
          gameRules: session.room.hostConfig?.gameRules,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          finishedAt: session.status === 'finished' ? session.updatedAt : null,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/game/history/batch
 * 批量删除游戏历史
 * 注意：必须在 /history/:sessionId 之前定义，避免路由冲突
 */
router.delete(
  '/history/batch',
  authenticateToken,
  async (req: AuthRequest, res, next) => {
    try {
      const userId = req.userId;
      const { sessionIds } = req.body || {};
      if (!userId) throw new AppError('Unauthorized', 401);

      if (!Array.isArray(sessionIds) || sessionIds.length === 0) {
        throw new AppError('请提供要删除的游戏历史ID列表', 400);
      }

      // 获取所有会话并验证权限
      const sessions = await prisma.gameSession.findMany({
        where: {
          id: { in: sessionIds },
        },
        include: { room: true },
      });

      // 验证用户是每个游戏的主持人
      for (const session of sessions) {
        await ensureRoomHost(session.roomId, userId);
      }

      // 删除推演结果（Redis）
      for (const session of sessions) {
        for (let round = 1; round <= session.currentRound; round++) {
          await redis.del(`inference:result:${session.id}:${round}`);
          await redis.del(`inference:task:${session.id}:${round}`);
        }
      }

      // 批量删除游戏会话
      await prisma.gameSession.deleteMany({
        where: {
          id: { in: sessionIds },
        },
      });

      res.json({
        code: 200,
        message: `已删除 ${sessions.length} 条游戏历史`,
        data: {
          deletedCount: sessions.length,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/game/history/:sessionId
 * 删除游戏历史（仅主持人可删除）
 */
router.delete(
  '/history/:sessionId',
  authenticateToken,
  async (req: AuthRequest, res, next) => {
    try {
      const userId = req.userId;
      const { sessionId } = req.params;
      if (!userId) throw new AppError('Unauthorized', 401);

      const session = await prisma.gameSession.findUnique({
        where: { id: sessionId },
        include: { room: true },
      });

      if (!session) throw new AppError('游戏历史不存在', 404);

      // 只有主持人可以删除
      await ensureRoomHost(session.roomId, userId);

      // 删除推演结果（Redis）
      for (let round = 1; round <= session.currentRound; round++) {
        await redis.del(`inference:result:${sessionId}:${round}`);
        await redis.del(`inference:task:${sessionId}:${round}`);
      }

      // 删除游戏会话（级联删除相关数据）
      await prisma.gameSession.delete({
        where: { id: sessionId },
      });

      res.json({
        code: 200,
        message: '游戏历史已删除',
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/game/:sessionId
 * 获取会话基本信息
 */
router.get('/:sessionId', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.userId;
    const { sessionId } = req.params;
    if (!userId) throw new AppError('Unauthorized', 401);

    const session = await prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: { room: true },
    });
    if (!session) throw new AppError('游戏会话不存在', 404);

    // 确认用户在房间中
    await ensureRoomMembership(session.roomId, userId);

    res.json({
      code: 200,
      data: {
        sessionId: session.id,
        roomId: session.roomId,
        currentRound: session.currentRound,
        roundStatus: session.roundStatus,
        decisionDeadline: session.decisionDeadline,
        status: session.status,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/game/:sessionId/decision
 * 提交当前回合决策
 */
router.post('/:sessionId/decision', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.userId;
    const { sessionId } = req.params;
    if (!userId) throw new AppError('Unauthorized', 401);

    const { round, actionText, selectedOptionIds, actionType, actionData } = req.body || {};

    const session = await prisma.gameSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new AppError('游戏会话不存在', 404);

    const effectiveRound = typeof round === 'number' && round > 0 ? round : session.currentRound;

    // 校验用户在房间中
    const membership = await ensureRoomMembership(session.roomId, userId);

    if (session.status !== 'playing') {
      throw new AppError('当前会话未处于进行中状态，无法提交决策', 400);
    }
    if (session.roundStatus !== 'decision') {
      throw new AppError('当前阶段不允许提交决策', 400);
    }

    const now = new Date();
    if (session.decisionDeadline && now > session.decisionDeadline) {
      throw new AppError('当前回合决策已超时', 400);
    }

    if (!actionText && !actionData && !selectedOptionIds) {
      throw new AppError('决策内容不能为空', 400);
    }

    const existing = await prisma.playerAction.findFirst({
      where: {
        sessionId,
        userId,
        round: effectiveRound,
      },
    });

    const payloadData: any = {
      selectedOptionIds: selectedOptionIds ?? undefined,
      actionText: actionText ?? '',
      actionType: actionType ?? null,
      actionData: actionData ?? null,
      status: 'submitted',
      submittedAt: now,
    };

    let action;
    if (existing) {
      action = await prisma.playerAction.update({
        where: { id: existing.id },
        data: payloadData,
      });
    } else {
      action = await prisma.playerAction.create({
        data: {
          sessionId,
          userId,
          playerIndex: membership.playerIndex ?? 0,
          round: effectiveRound,
          selectedOptionIds: selectedOptionIds ?? null,
          actionText: actionText ?? '',
          actionType: actionType ?? null,
          actionData: actionData ?? null,
          status: 'submitted',
        },
      });
    }

    // 通知房间内其他玩家决策状态更新
    io.to(session.roomId).emit('decision_status_update', {
      sessionId,
      userId,
      round: effectiveRound,
      status: action.status,
    });

    res.json({
      code: 200,
      message: '决策已提交',
      data: {
        id: action.id,
        sessionId: action.sessionId,
        userId: action.userId,
        round: action.round,
        status: action.status,
        submittedAt: action.submittedAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/game/:sessionId/round/:round/decisions
 * 获取某一回合的所有决策状态
 */
router.get(
  '/:sessionId/round/:round/decisions',
  authenticateToken,
  async (req: AuthRequest, res, next) => {
    try {
      const userId = req.userId;
      const { sessionId, round } = req.params;
      if (!userId) throw new AppError('Unauthorized', 401);

      const roundNumber = Number(round);
      if (!Number.isFinite(roundNumber) || roundNumber <= 0) {
        throw new AppError('无效的回合号', 400);
      }

      const session = await prisma.gameSession.findUnique({
        where: { id: sessionId },
      });
      if (!session) throw new AppError('游戏会话不存在', 404);

      await ensureRoomMembership(session.roomId, userId);

      const actions = await prisma.playerAction.findMany({
        where: {
          sessionId,
          round: roundNumber,
        },
        orderBy: { submittedAt: 'asc' },
      });

      const now = new Date();
      const isTimeout = !!(session.decisionDeadline && now > session.decisionDeadline);

      res.json({
        code: 200,
        data: {
          sessionId,
          round: roundNumber,
          decisionDeadline: session.decisionDeadline,
          timedOut: isTimeout,
          actions: actions.map(action => ({
            id: action.id,
            userId: action.userId,
            playerIndex: action.playerIndex,
            status: action.status,
            submittedAt: action.submittedAt,
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/game/:sessionId/round/:round/decisions/review
 * 获取审核决策列表（主持人专用）
 */
router.get(
  '/:sessionId/round/:round/decisions/review',
  authenticateToken,
  async (req: AuthRequest, res, next) => {
    try {
      const userId = req.userId;
      const { sessionId, round } = req.params;
      if (!userId) throw new AppError('Unauthorized', 401);

      const roundNumber = Number(round);
      if (!Number.isFinite(roundNumber) || roundNumber <= 0) {
        throw new AppError('无效的回合号', 400);
      }

      const session = await prisma.gameSession.findUnique({
        where: { id: sessionId },
        include: { room: true },
      });
      if (!session) throw new AppError('游戏会话不存在', 404);

      // 确保用户是主持人
      await ensureRoomHost(session.roomId, userId);

      // 获取所有决策，包含详细信息
      const actions = await prisma.playerAction.findMany({
        where: {
          sessionId,
          round: roundNumber,
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              nickname: true,
            },
          },
        },
        orderBy: { submittedAt: 'asc' },
      });

      const now = new Date();
      const isTimeout = !!(session.decisionDeadline && now > session.decisionDeadline);

      res.json({
        code: 200,
        data: {
          sessionId,
          round: roundNumber,
          decisionDeadline: session.decisionDeadline,
          timedOut: isTimeout,
          actions: actions.map(action => ({
            id: action.id,
            userId: action.userId,
            playerIndex: action.playerIndex,
            username: action.user.username,
            nickname: action.user.nickname,
            actionText: action.actionText,
            selectedOptionIds: action.selectedOptionIds,
            actionType: action.actionType,
            actionData: action.actionData,
            status: action.status,
            hostModified: action.hostModified,
            hostModification: action.hostModification,
            submittedAt: action.submittedAt,
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/game/:sessionId/round/:round/temporary-event
 * 添加临时事件（主持人专用）
 */
router.post(
  '/:sessionId/round/:round/temporary-event',
  authenticateToken,
  async (req: AuthRequest, res, next) => {
    try {
      const userId = req.userId;
      const { sessionId, round } = req.params;
      if (!userId) throw new AppError('Unauthorized', 401);

      const { eventType, eventContent, effectiveRounds } = req.body || {};

      if (!eventType || !eventContent) {
        throw new AppError('事件类型和内容不能为空', 400);
      }

      if (eventType !== 'single_round' && eventType !== 'multi_round') {
        throw new AppError('事件类型必须是 single_round 或 multi_round', 400);
      }

      const roundNumber = Number(round);
      if (!Number.isFinite(roundNumber) || roundNumber <= 0) {
        throw new AppError('无效的回合号', 400);
      }

      const session = await prisma.gameSession.findUnique({
        where: { id: sessionId },
        include: { room: true },
      });
      if (!session) throw new AppError('游戏会话不存在', 404);

      // 确保用户是主持人
      await ensureRoomHost(session.roomId, userId);

      // 确保当前阶段是 review
      if (session.roundStatus !== 'review') {
        throw new AppError('当前阶段不是审核阶段，无法添加临时事件', 400);
      }

      const effectiveRoundsNum = eventType === 'multi_round' 
        ? (Number(effectiveRounds) || 1)
        : 1;

      const event = await prisma.temporaryEvent.create({
        data: {
          sessionId,
          round: roundNumber,
          eventType,
          eventContent,
          effectiveRounds: effectiveRoundsNum,
          progress: eventType === 'multi_round' ? { current: roundNumber, total: effectiveRoundsNum } : {},
          createdBy: userId,
        },
      });

      // 广播临时事件添加通知
      io.to(session.roomId).emit('temporary_event_added', {
        sessionId,
        round: roundNumber,
        eventId: event.id,
        eventType: event.eventType,
        eventContent: event.eventContent,
      });

      res.json({
        code: 200,
        message: '临时事件已添加',
        data: {
          id: event.id,
          sessionId: event.sessionId,
          round: event.round,
          eventType: event.eventType,
          eventContent: event.eventContent,
          effectiveRounds: event.effectiveRounds,
          progress: event.progress,
          createdAt: event.createdAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/game/:sessionId/round/:round/temporary-rule
 * 添加临时规则（主持人专用）
 * 注意：临时规则也使用 TemporaryEvent 存储，eventType 为 'rule'
 */
router.post(
  '/:sessionId/round/:round/temporary-rule',
  authenticateToken,
  async (req: AuthRequest, res, next) => {
    try {
      const userId = req.userId;
      const { sessionId, round } = req.params;
      if (!userId) throw new AppError('Unauthorized', 401);

      const { ruleContent, effectiveRounds } = req.body || {};

      if (!ruleContent) {
        throw new AppError('规则内容不能为空', 400);
      }

      const roundNumber = Number(round);
      if (!Number.isFinite(roundNumber) || roundNumber <= 0) {
        throw new AppError('无效的回合号', 400);
      }

      const session = await prisma.gameSession.findUnique({
        where: { id: sessionId },
        include: { room: true },
      });
      if (!session) throw new AppError('游戏会话不存在', 404);

      // 确保用户是主持人
      await ensureRoomHost(session.roomId, userId);

      // 确保当前阶段是 review
      if (session.roundStatus !== 'review') {
        throw new AppError('当前阶段不是审核阶段，无法添加临时规则', 400);
      }

      const effectiveRoundsNum = Number(effectiveRounds) || 1;

      // 使用 TemporaryEvent 存储规则，eventType 为 'rule'
      const rule = await prisma.temporaryEvent.create({
        data: {
          sessionId,
          round: roundNumber,
          eventType: 'rule', // 使用 'rule' 作为规则类型
          eventContent: ruleContent,
          effectiveRounds: effectiveRoundsNum,
          progress: { current: roundNumber, total: effectiveRoundsNum },
          createdBy: userId,
        },
      });

      // 广播临时规则添加通知
      io.to(session.roomId).emit('temporary_rule_added', {
        sessionId,
        round: roundNumber,
        ruleId: rule.id,
        ruleContent: rule.eventContent,
      });

      res.json({
        code: 200,
        message: '临时规则已添加',
        data: {
          id: rule.id,
          sessionId: rule.sessionId,
          round: rule.round,
          ruleContent: rule.eventContent,
          effectiveRounds: rule.effectiveRounds,
          createdAt: rule.createdAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/game/:sessionId/round/:round/submit-to-ai
 * 提交给AI推演（主持人专用）
 */
router.post(
  '/:sessionId/round/:round/submit-to-ai',
  authenticateToken,
  async (req: AuthRequest, res, next) => {
    try {
      const userId = req.userId;
      const { sessionId, round } = req.params;
      if (!userId) throw new AppError('Unauthorized', 401);

      const roundNumber = Number(round);
      if (!Number.isFinite(roundNumber) || roundNumber <= 0) {
        throw new AppError('无效的回合号', 400);
      }

      const session = await prisma.gameSession.findUnique({
        where: { id: sessionId },
        include: {
          room: {
            include: {
              hostConfig: true,
            },
          },
        },
      });
      if (!session) throw new AppError('游戏会话不存在', 404);

      // 确保用户是主持人
      await ensureRoomHost(session.roomId, userId);

      // 确保当前阶段是 review
      if (session.roundStatus !== 'review') {
        throw new AppError('当前阶段不是审核阶段，无法提交推演', 400);
      }

      const hostConfig = session.room.hostConfig;
      if (!hostConfig || !hostConfig.apiEndpoint) {
        throw new AppError('主持人配置未完成，无法提交推演', 400);
      }

      // 获取所有决策
      const actions = await prisma.playerAction.findMany({
        where: {
          sessionId,
          round: roundNumber,
          status: { in: ['submitted', 'reviewed'] },
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              nickname: true,
            },
          },
        },
        orderBy: { submittedAt: 'asc' },
      });

      // 获取活跃的多回合事件及其进度
      const activeEvents = await prisma.temporaryEvent.findMany({
        where: {
          sessionId,
          eventType: { in: ['multi_round', 'rule'] },
          completedAt: null,
        },
        orderBy: { createdAt: 'asc' },
      });

      // 构建推演数据
      const inferenceData = {
        sessionId,
        round: roundNumber,
        decisions: actions.map(action => ({
          playerIndex: action.playerIndex,
          username: action.user.username,
          nickname: action.user.nickname,
          actionText: action.actionText,
          selectedOptionIds: action.selectedOptionIds,
          actionType: action.actionType,
          actionData: action.actionData,
          hostModified: action.hostModified,
          hostModification: action.hostModification,
        })),
        activeEvents: activeEvents.map(event => ({
          id: event.id,
          eventType: event.eventType,
          eventContent: event.eventContent,
          effectiveRounds: event.effectiveRounds,
          progress: event.progress,
          round: event.round,
        })),
        gameRules: hostConfig.gameRules || '',
        currentRound: session.currentRound,
      };

      // 更新会话状态为 inference
      await prisma.gameSession.update({
        where: { id: sessionId },
        data: {
          roundStatus: 'inference',
        },
      });

      // 广播推演开始通知
      io.to(session.roomId).emit('inference_started', {
        sessionId,
        round: roundNumber,
        inferenceData,
      });

      // 异步执行AI推演（不阻塞响应）
      const aiConfig = {
        provider: hostConfig.apiProvider,
        endpoint: hostConfig.apiEndpoint,
        headers: hostConfig.apiHeaders as Record<string, unknown> | null,
        bodyTemplate: hostConfig.apiBodyTemplate as Record<string, unknown> | null,
      };

      // 将推演任务加入Redis队列（异步处理）
      const inferenceTask = {
        sessionId,
        round: roundNumber,
        roomId: session.roomId,
        inferenceData: inferenceData as InferenceRequest,
        aiConfig,
        createdAt: new Date().toISOString(),
      };

      // 使用Redis存储推演任务
      await redis.setex(
        `inference:task:${sessionId}:${roundNumber}`,
        3600, // 1小时过期
        JSON.stringify(inferenceTask)
      );

      // 立即启动异步推演（不等待完成）
      performInferenceAsync(sessionId, roundNumber, session.roomId, inferenceData as InferenceRequest, aiConfig).catch(
        error => {
          logger.error(`Async inference failed for session ${sessionId}, round ${roundNumber}:`, error);
          // 广播推演失败通知
          io.to(session.roomId).emit('inference_failed', {
            sessionId,
            round: roundNumber,
            error: error.message || '推演失败',
          });
        }
      );

      res.json({
        code: 200,
        message: '已提交给AI推演，正在处理中...',
        data: {
          sessionId,
          round: roundNumber,
          status: 'processing',
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/game/:sessionId/round/:round/inference-result
 * 获取推演结果
 */
router.get(
  '/:sessionId/round/:round/inference-result',
  authenticateToken,
  async (req: AuthRequest, res, next) => {
    try {
      const userId = req.userId;
      const { sessionId, round } = req.params;
      if (!userId) throw new AppError('Unauthorized', 401);

      const roundNumber = Number(round);
      if (!Number.isFinite(roundNumber) || roundNumber <= 0) {
        throw new AppError('无效的回合号', 400);
      }

      const session = await prisma.gameSession.findUnique({
        where: { id: sessionId },
      });
      if (!session) throw new AppError('游戏会话不存在', 404);

      await ensureRoomMembership(session.roomId, userId);

      // 从Redis获取推演结果
      const resultKey = `inference:result:${sessionId}:${roundNumber}`;
      const resultData = await redis.get(resultKey);

      if (!resultData) {
        // 检查是否还在处理中
        const taskKey = `inference:task:${sessionId}:${roundNumber}`;
        const taskExists = await redis.exists(taskKey);
        
        if (taskExists) {
          return res.json({
            code: 200,
            data: {
              sessionId,
              round: roundNumber,
              status: 'processing',
              message: '推演正在进行中，请稍候...',
            },
          });
        } else {
          throw new AppError('推演结果不存在', 404);
        }
      }

      const result = JSON.parse(resultData);

      return res.json({
        code: 200,
        data: {
          sessionId,
          round: roundNumber,
          status: result.status,
          result: result.result,
          completedAt: result.completedAt,
          error: result.error,
        },
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * 异步执行AI推演
 */
async function performInferenceAsync(
  sessionId: string,
  round: number,
  roomId: string,
  inferenceData: InferenceRequest,
  aiConfig: {
    provider?: string | null;
    endpoint?: string | null;
    headers?: Record<string, unknown> | null;
    bodyTemplate?: Record<string, unknown> | null;
  }
): Promise<void> {
  try {
    // 发送推演进度更新
    io.to(roomId).emit('inference_progress', {
      sessionId,
      round,
      progress: 10,
      message: '正在构建推演请求...',
    });

    // 更新多回合事件进度（推演后自动更新）
    await updateEventProgressAfterInference(sessionId, round);

    // 调用AI服务
    const result = await aiService.performInference(aiConfig, inferenceData);

    // 发送推演进度更新
    io.to(roomId).emit('inference_progress', {
      sessionId,
      round,
      progress: 90,
      message: '正在解析推演结果...',
    });

    // 保存推演结果到Redis
    const resultKey = `inference:result:${sessionId}:${round}`;
    const resultData = {
      sessionId,
      round,
      result,
      status: 'completed',
      completedAt: new Date().toISOString(),
    };
    await redis.setex(resultKey, 86400, JSON.stringify(resultData)); // 24小时过期

    // 更新会话状态为 result
    const updatedSession = await prisma.gameSession.update({
      where: { id: sessionId },
      data: {
        roundStatus: 'result',
        gameState: result as any, // 保存推演结果到gameState
      },
      include: {
        room: {
          select: {
            id: true,
            hostId: true,
          },
        },
        actions: {
          where: {
            status: { in: ['submitted', 'reviewed'] },
          },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                nickname: true,
              },
            },
          },
        },
        events: {
          where: {
            completedAt: null,
          },
        },
        trades: {
          where: {
            status: { in: ['pending', 'accepted'] },
          },
        },
      },
    });

    // 自动存档：每回合推演完成后自动保存
    try {
      const autoSaveData = {
        session: {
          id: updatedSession.id,
          roomId: updatedSession.roomId,
          currentRound: updatedSession.currentRound,
          totalRounds: updatedSession.totalRounds,
          roundStatus: updatedSession.roundStatus,
          gameState: updatedSession.gameState,
          status: updatedSession.status,
          decisionDeadline: updatedSession.decisionDeadline,
        },
        actions: updatedSession.actions,
        events: updatedSession.events,
        trades: updatedSession.trades,
        inferenceResults: await Promise.all(
          Array.from({ length: updatedSession.currentRound }, async (_, i) => {
            const roundNum = i + 1;
            const resultKey = `inference:result:${sessionId}:${roundNum}`;
            const resultData = await redis.get(resultKey);
            return resultData ? { round: roundNum, result: JSON.parse(resultData) } : null;
          })
        ).then(results => results.filter(r => r !== null)),
        savedAt: new Date().toISOString(),
      };

      await prisma.gameSave.create({
        data: {
          sessionId,
          saveName: `自动存档-第${round}回合`,
          description: `第${round}回合推演完成后的自动存档`,
          isAutoSave: true,
          saveData: autoSaveData as any,
          createdBy: updatedSession.room.hostId, // 使用房间主持人ID
        },
      });

      logger.info(`Auto-save created for session ${sessionId}, round ${round}`);
    } catch (error) {
      // 自动存档失败不应影响游戏流程
      logger.error(`Failed to create auto-save for session ${sessionId}, round ${round}:`, error);
    }

    // 删除任务标记
    await redis.del(`inference:task:${sessionId}:${round}`);

    // 广播推演完成通知
    io.to(roomId).emit('inference_completed', {
      sessionId,
      round,
      result,
    });

    // 广播阶段切换通知
    io.to(roomId).emit('stage_changed', {
      sessionId,
      round,
      stage: 'result',
      previousStage: 'inference',
    });

    // 发送最终进度
    io.to(roomId).emit('inference_progress', {
      sessionId,
      round,
      progress: 100,
      message: '推演完成',
    });

    logger.info(`Inference completed for session ${sessionId}, round ${round}`);
  } catch (error: any) {
    logger.error(`Inference failed for session ${sessionId}, round ${round}:`, error);

    // 保存错误结果
    const resultKey = `inference:result:${sessionId}:${round}`;
    const errorData = {
      sessionId,
      round,
      status: 'failed',
      error: error.message || '推演失败',
      completedAt: new Date().toISOString(),
    };
    await redis.setex(resultKey, 86400, JSON.stringify(errorData));

    // 更新会话状态
    await prisma.gameSession.update({
      where: { id: sessionId },
      data: {
        roundStatus: 'review', // 失败后回到review阶段
      },
    });

    // 删除任务标记
    await redis.del(`inference:task:${sessionId}:${round}`);

    // 广播推演失败通知
    io.to(roomId).emit('inference_failed', {
      sessionId,
      round,
      error: error.message || '推演失败',
    });

    throw error;
  }
}

/**
 * PUT /api/game/:sessionId/events/:eventId/progress
 * 更新事件进度（主持人专用）
 */
router.put(
  '/:sessionId/events/:eventId/progress',
  authenticateToken,
  async (req: AuthRequest, res, next) => {
    try {
      const userId = req.userId;
      const { sessionId, eventId } = req.params;
      if (!userId) throw new AppError('Unauthorized', 401);

      const { progress, currentRound } = req.body || {};

      if (!progress || typeof progress !== 'object') {
        throw new AppError('进度数据无效', 400);
      }

      const session = await prisma.gameSession.findUnique({
        where: { id: sessionId },
        include: { room: true },
      });
      if (!session) throw new AppError('游戏会话不存在', 404);

      // 确保用户是主持人
      await ensureRoomHost(session.roomId, userId);

      const event = await prisma.temporaryEvent.findUnique({
        where: { id: eventId },
      });
      if (!event) throw new AppError('事件不存在', 404);
      if (event.sessionId !== sessionId) {
        throw new AppError('事件不属于此会话', 400);
      }

      // 更新进度
      const updatedEvent = await prisma.temporaryEvent.update({
        where: { id: eventId },
        data: {
          progress: progress as any,
          updatedAt: new Date(),
        },
      });

      // 检查事件是否完成
      const isCompleted = checkEventCompletion(updatedEvent, currentRound || session.currentRound);
      if (isCompleted && !updatedEvent.completedAt) {
        await prisma.temporaryEvent.update({
          where: { id: eventId },
          data: {
            completedAt: new Date(),
          },
        });
      }

      // 广播事件进度更新
      io.to(session.roomId).emit('event_progress_updated', {
        sessionId,
        eventId,
        progress: updatedEvent.progress,
        completed: isCompleted,
      });

      res.json({
        code: 200,
        message: '事件进度已更新',
        data: {
          id: updatedEvent.id,
          sessionId: updatedEvent.sessionId,
          progress: updatedEvent.progress,
          completed: isCompleted,
          completedAt: isCompleted ? new Date() : null,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/game/:sessionId/events/active
 * 获取活跃事件列表
 */
router.get(
  '/:sessionId/events/active',
  authenticateToken,
  async (req: AuthRequest, res, next) => {
    try {
      const userId = req.userId;
      const { sessionId } = req.params;
      if (!userId) throw new AppError('Unauthorized', 401);

      const session = await prisma.gameSession.findUnique({
        where: { id: sessionId },
      });
      if (!session) throw new AppError('游戏会话不存在', 404);

      await ensureRoomMembership(session.roomId, userId);

      // 获取所有未完成的事件
      const activeEvents = await prisma.temporaryEvent.findMany({
        where: {
          sessionId,
          completedAt: null,
        },
        include: {
          creator: {
            select: {
              id: true,
              username: true,
              nickname: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      // 计算每个事件的完成状态
      const eventsWithStatus = activeEvents.map(event => {
        const isCompleted = checkEventCompletion(event, session.currentRound);
        return {
          id: event.id,
          sessionId: event.sessionId,
          round: event.round,
          eventType: event.eventType,
          eventContent: event.eventContent,
          effectiveRounds: event.effectiveRounds,
          progress: event.progress,
          isCompleted,
          progressPercentage: calculateProgressPercentage(event, session.currentRound),
          createdAt: event.createdAt,
          updatedAt: event.updatedAt,
          creator: event.creator,
        };
      });

      res.json({
        code: 200,
        data: {
          sessionId,
          currentRound: session.currentRound,
          events: eventsWithStatus,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * 检查事件是否完成
 */
function checkEventCompletion(event: { eventType: string; effectiveRounds: number; progress: any; completedAt: Date | null; round: number }, currentRound: number): boolean {
  if (event.completedAt) {
    return true; // 已经标记为完成
  }

  if (event.eventType === 'single_round') {
    // 单回合事件在当前回合后完成
    return currentRound > event.round;
  }

  if (event.eventType === 'multi_round' || event.eventType === 'rule') {
    // 多回合事件根据进度判断
    if (event.progress && typeof event.progress === 'object') {
      const progress = event.progress as { current?: number; total?: number };
      if (progress.current !== undefined && progress.total !== undefined) {
        return progress.current >= progress.total;
      }
    }
    // 如果没有进度信息，根据回合数判断
    return currentRound >= event.round + event.effectiveRounds;
  }

  return false;
}

/**
 * 计算事件进度百分比
 */
function calculateProgressPercentage(event: { eventType: string; effectiveRounds: number; progress: any; round: number }, currentRound: number): number {
  if (event.eventType === 'single_round') {
    return currentRound > event.round ? 100 : 0;
  }

  if (event.eventType === 'multi_round' || event.eventType === 'rule') {
    if (event.progress && typeof event.progress === 'object') {
      const progress = event.progress as { current?: number; total?: number };
      if (progress.current !== undefined && progress.total !== undefined && progress.total > 0) {
        return Math.min(100, Math.round((progress.current / progress.total) * 100));
      }
    }
    // 根据回合数计算
    const roundsElapsed = Math.max(0, currentRound - event.round + 1);
    return Math.min(100, Math.round((roundsElapsed / event.effectiveRounds) * 100));
  }

  return 0;
}

/**
 * 推演后自动更新事件进度
 */
async function updateEventProgressAfterInference(sessionId: string, round: number): Promise<void> {
  try {
    // 获取所有活跃的多回合事件
    const activeEvents = await prisma.temporaryEvent.findMany({
      where: {
        sessionId,
        eventType: { in: ['multi_round', 'rule'] },
        completedAt: null,
      },
    });

    for (const event of activeEvents) {
      const currentProgress = (event.progress as { current?: number; total?: number }) || {};
      const current = (currentProgress.current || event.round);
      const total = event.effectiveRounds;

      // 更新进度（当前回合+1）
      const newProgress = {
        current: Math.min(current + 1, total),
        total: total,
        lastUpdatedRound: round,
      };

      await prisma.temporaryEvent.update({
        where: { id: event.id },
        data: {
          progress: newProgress as any,
          updatedAt: new Date(),
        },
      });

      // 检查是否完成
      const session = await prisma.gameSession.findUnique({
        where: { id: sessionId },
      });
      if (session && checkEventCompletion({ ...event, progress: newProgress }, session.currentRound)) {
        await prisma.temporaryEvent.update({
          where: { id: event.id },
          data: {
            completedAt: new Date(),
          },
        });

        // 广播事件完成通知
        const room = await prisma.room.findUnique({
          where: { id: session.roomId },
        });
        if (room) {
          io.to(room.id).emit('event_completed', {
            sessionId,
            eventId: event.id,
            eventType: event.eventType,
            eventContent: event.eventContent,
          });
        }
      }
    }
  } catch (error) {
    logger.error(`Failed to update event progress after inference:`, error);
  }
}

/**
 * GET /api/game/:sessionId/state
 * 获取游戏状态（包含当前回合、阶段、历史等）
 */
router.get(
  '/:sessionId/state',
  authenticateToken,
  async (req: AuthRequest, res, next) => {
    try {
      const userId = req.userId;
      const { sessionId } = req.params;
      if (!userId) throw new AppError('Unauthorized', 401);

      const session = await prisma.gameSession.findUnique({
        where: { id: sessionId },
        include: {
          room: {
            include: {
              hostConfig: true,
            },
          },
          actions: {
            where: {
              status: { in: ['submitted', 'reviewed'] },
            },
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  nickname: true,
                },
              },
            },
            orderBy: { submittedAt: 'asc' },
          },
          events: {
            where: {
              completedAt: null,
            },
            orderBy: { createdAt: 'asc' },
          },
        },
      });
      if (!session) throw new AppError('游戏会话不存在', 404);

      await ensureRoomMembership(session.roomId, userId);

      // 获取推演结果（如果有）
      let inferenceResult = null;
      if (session.roundStatus === 'result' || session.roundStatus === 'inference') {
        const resultKey = `inference:result:${sessionId}:${session.currentRound}`;
        const resultData = await redis.get(resultKey);
        if (resultData) {
          inferenceResult = JSON.parse(resultData);
        }
      }

      res.json({
        code: 200,
        data: {
          sessionId: session.id,
          roomId: session.roomId,
          currentRound: session.currentRound,
          totalRounds: session.totalRounds,
          roundStatus: session.roundStatus,
          gameStatus: session.status,
          decisionDeadline: session.decisionDeadline,
          gameState: session.gameState,
          inferenceResult,
          activeEvents: session.events.map(event => ({
            id: event.id,
            eventType: event.eventType,
            eventContent: event.eventContent,
            effectiveRounds: event.effectiveRounds,
            progress: event.progress,
            round: event.round,
          })),
          submittedDecisions: session.actions.length,
          totalPlayers: session.room.hostConfig?.totalDecisionEntities || 0,
          updatedAt: session.updatedAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/game/:sessionId/round/:round/next
 * 进入下一回合（主持人专用）
 */
router.post(
  '/:sessionId/round/:round/next',
  authenticateToken,
  async (req: AuthRequest, res, next) => {
    try {
      const userId = req.userId;
      const { sessionId, round } = req.params;
      if (!userId) throw new AppError('Unauthorized', 401);

      const roundNumber = Number(round);
      if (!Number.isFinite(roundNumber) || roundNumber <= 0) {
        throw new AppError('无效的回合号', 400);
      }

      const session = await prisma.gameSession.findUnique({
        where: { id: sessionId },
        include: { room: true },
      });
      if (!session) throw new AppError('游戏会话不存在', 404);

      // 确保用户是主持人
      await ensureRoomHost(session.roomId, userId);

      // 确保当前回合匹配
      if (session.currentRound !== roundNumber) {
        throw new AppError('回合号不匹配', 400);
      }

      // 确保当前阶段是 result
      if (session.roundStatus !== 'result') {
        throw new AppError('当前阶段不是结果阶段，无法进入下一回合', 400);
      }

      // 检查是否达到总回合数
      if (session.totalRounds && session.currentRound >= session.totalRounds) {
        // 游戏结束
        await prisma.gameSession.update({
          where: { id: sessionId },
          data: {
            status: 'finished',
            roundStatus: 'finished',
          },
        });

        // 广播游戏结束通知
        io.to(session.roomId).emit('game_finished', {
          sessionId,
          finalRound: session.currentRound,
        });

        return res.json({
          code: 200,
          message: '游戏已结束',
          data: {
            sessionId,
            status: 'finished',
            finalRound: session.currentRound,
          },
        });
      }

      // 进入下一回合
      const nextRound = session.currentRound + 1;
      await prisma.gameSession.update({
        where: { id: sessionId },
        data: {
          currentRound: nextRound,
          roundStatus: 'decision',
          decisionDeadline: null,
          updatedAt: new Date(),
        },
      });

      // 广播回合切换通知
      io.to(session.roomId).emit('round_changed', {
        sessionId,
        previousRound: roundNumber,
        currentRound: nextRound,
        roundStatus: 'decision',
      });

      // 广播阶段切换通知
      io.to(session.roomId).emit('stage_changed', {
        sessionId,
        round: nextRound,
        stage: 'decision',
        previousStage: 'result',
      });

      return res.json({
        code: 200,
        message: '已进入下一回合',
        data: {
          sessionId,
          previousRound: roundNumber,
          currentRound: nextRound,
          roundStatus: 'decision',
        },
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * GET /api/game/:sessionId/history
 * 获取游戏历史记录
 */
router.get(
  '/:sessionId/history',
  authenticateToken,
  async (req: AuthRequest, res, next) => {
    try {
      const userId = req.userId;
      const { sessionId } = req.params;
      if (!userId) throw new AppError('Unauthorized', 401);

      const session = await prisma.gameSession.findUnique({
        where: { id: sessionId },
      });
      if (!session) throw new AppError('游戏会话不存在', 404);

      await ensureRoomMembership(session.roomId, userId);

      // 获取所有回合的推演结果
      const history: Array<{
        round: number;
        status: string;
        result?: any;
        completedAt?: string;
      }> = [];

      for (let round = 1; round <= session.currentRound; round++) {
        const resultKey = `inference:result:${sessionId}:${round}`;
        const resultData = await redis.get(resultKey);
        
        if (resultData) {
          const result = JSON.parse(resultData);
          history.push({
            round,
            status: result.status,
            result: result.result,
            completedAt: result.completedAt,
          });
        } else {
          // 如果结果不存在，至少记录回合号
          history.push({
            round,
            status: 'unknown',
          });
        }
      }

      res.json({
        code: 200,
        data: {
          sessionId,
          currentRound: session.currentRound,
          totalRounds: session.totalRounds,
          history,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/game/history 已在前面定义（第126行附近），避免路由冲突

/**
 * GET /api/game/history/:sessionId
 * 获取游戏历史详情
 */
router.get(
  '/history/:sessionId',
  authenticateToken,
  async (req: AuthRequest, res, next) => {
    try {
      const userId = req.userId;
      const { sessionId } = req.params;
      if (!userId) throw new AppError('Unauthorized', 401);

      const session = await prisma.gameSession.findUnique({
        where: { id: sessionId },
        include: {
          room: {
            include: {
              host: {
                select: {
                  id: true,
                  username: true,
                  nickname: true,
                },
              },
              hostConfig: true,
            },
          },
          actions: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  nickname: true,
                },
              },
            },
            orderBy: [{ round: 'asc' }, { submittedAt: 'asc' }],
          },
          events: {
            orderBy: { createdAt: 'asc' },
          },
        },
      });

      if (!session) throw new AppError('游戏历史不存在', 404);

      // 检查用户是否参与过此游戏
      const membership = await prisma.roomPlayer.findFirst({
        where: {
          roomId: session.roomId,
          userId,
        },
      });
      if (!membership) {
        throw new AppError('您未参与此游戏', 403);
      }

      // 获取所有回合的推演结果
      const roundResults: Array<{
        round: number;
        status: string;
        result?: any;
        completedAt?: string;
      }> = [];

      for (let round = 1; round <= session.currentRound; round++) {
        const resultKey = `inference:result:${sessionId}:${round}`;
        const resultData = await redis.get(resultKey);
        
        if (resultData) {
          const result = JSON.parse(resultData);
          roundResults.push({
            round,
            status: result.status,
            result: result.result,
            completedAt: result.completedAt,
          });
        }
      }

      res.json({
        code: 200,
        data: {
          id: session.id,
          sessionId: session.id,
          roomId: session.roomId,
          roomName: session.room.name,
          hostName: session.room.host.nickname || session.room.host.username,
          currentRound: session.currentRound,
          totalRounds: session.totalRounds,
          status: session.status,
          roundStatus: session.roundStatus,
          gameState: session.gameState,
          roundResults,
          actions: session.actions,
          events: session.events,
          gameRules: session.room.hostConfig?.gameRules,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          finishedAt: session.status === 'finished' ? session.updatedAt : null,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/game/history/:sessionId
 * 删除游戏历史（仅主持人可删除）
 */
router.delete(
  '/history/:sessionId',
  authenticateToken,
  async (req: AuthRequest, res, next) => {
    try {
      const userId = req.userId;
      const { sessionId } = req.params;
      if (!userId) throw new AppError('Unauthorized', 401);

      const session = await prisma.gameSession.findUnique({
        where: { id: sessionId },
        include: { room: true },
      });

      if (!session) throw new AppError('游戏历史不存在', 404);

      // 只有主持人可以删除
      await ensureRoomHost(session.roomId, userId);

      // 删除推演结果（Redis）
      for (let round = 1; round <= session.currentRound; round++) {
        await redis.del(`inference:result:${sessionId}:${round}`);
        await redis.del(`inference:task:${sessionId}:${round}`);
      }

      // 删除游戏会话（级联删除相关数据）
      await prisma.gameSession.delete({
        where: { id: sessionId },
      });

      res.json({
        code: 200,
        message: '游戏历史已删除',
      });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/game/history/batch 已在前面定义（第451行附近），避免路由冲突

/**
 * POST /api/game/:sessionId/save
 * 保存游戏存档（手动存档）
 */
router.post(
  '/:sessionId/save',
  authenticateToken,
  async (req: AuthRequest, res, next) => {
    try {
      const userId = req.userId;
      const { sessionId } = req.params;
      if (!userId) throw new AppError('Unauthorized', 401);

      const { saveName, description } = req.body || {};

      const session = await prisma.gameSession.findUnique({
        where: { id: sessionId },
        include: {
          room: true,
          actions: {
            where: {
              status: { in: ['submitted', 'reviewed'] },
            },
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  nickname: true,
                },
              },
            },
          },
          events: {
            where: {
              completedAt: null,
            },
          },
          trades: {
            where: {
              status: { in: ['pending', 'accepted'] },
            },
          },
        },
      });

      if (!session) throw new AppError('游戏会话不存在', 404);

      await ensureRoomMembership(session.roomId, userId);

      // 构建存档数据
      const saveData = {
        session: {
          id: session.id,
          roomId: session.roomId,
          currentRound: session.currentRound,
          totalRounds: session.totalRounds,
          roundStatus: session.roundStatus,
          gameState: session.gameState,
          status: session.status,
          decisionDeadline: session.decisionDeadline,
        },
        actions: session.actions,
        events: session.events,
        trades: session.trades,
        // 获取所有回合的推演结果
        inferenceResults: await Promise.all(
          Array.from({ length: session.currentRound }, async (_, i) => {
            const round = i + 1;
            const resultKey = `inference:result:${sessionId}:${round}`;
            const resultData = await redis.get(resultKey);
            return resultData ? { round, result: JSON.parse(resultData) } : null;
          })
        ).then(results => results.filter(r => r !== null)),
        savedAt: new Date().toISOString(),
      };

      // 创建存档
      const gameSave = await prisma.gameSave.create({
        data: {
          sessionId,
          saveName: saveName || `第${session.currentRound}回合存档`,
          description: description || null,
          isAutoSave: false,
          saveData: saveData as any,
          createdBy: userId,
        },
      });

      // 广播存档创建通知
      io.to(session.roomId).emit('game_saved', {
        sessionId,
        saveId: gameSave.id,
        saveName: gameSave.saveName,
        createdAt: gameSave.createdAt,
      });

      res.json({
        code: 200,
        message: '游戏已保存',
        data: {
          id: gameSave.id,
          sessionId: gameSave.sessionId,
          saveName: gameSave.saveName,
          description: gameSave.description,
          isAutoSave: gameSave.isAutoSave,
          createdAt: gameSave.createdAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/game/:sessionId/saves
 * 获取游戏存档列表
 */
router.get(
  '/:sessionId/saves',
  authenticateToken,
  async (req: AuthRequest, res, next) => {
    try {
      const userId = req.userId;
      const { sessionId } = req.params;
      if (!userId) throw new AppError('Unauthorized', 401);

      const session = await prisma.gameSession.findUnique({
        where: { id: sessionId },
      });
      if (!session) throw new AppError('游戏会话不存在', 404);

      await ensureRoomMembership(session.roomId, userId);

      const saves = await prisma.gameSave.findMany({
        where: { sessionId },
        include: {
          creator: {
            select: {
              id: true,
              username: true,
              nickname: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      res.json({
        code: 200,
        data: {
          sessionId,
          saves: saves.map(save => ({
            id: save.id,
            sessionId: save.sessionId,
            saveName: save.saveName,
            description: save.description,
            isAutoSave: save.isAutoSave,
            createdAt: save.createdAt,
            creator: save.creator,
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/game/:sessionId/restore/:saveId
 * 恢复游戏存档
 */
router.post(
  '/:sessionId/restore/:saveId',
  authenticateToken,
  async (req: AuthRequest, res, next) => {
    try {
      const userId = req.userId;
      const { sessionId, saveId } = req.params;
      if (!userId) throw new AppError('Unauthorized', 401);

      const session = await prisma.gameSession.findUnique({
        where: { id: sessionId },
        include: { room: true },
      });
      if (!session) throw new AppError('游戏会话不存在', 404);

      // 只有主持人可以恢复存档
      await ensureRoomHost(session.roomId, userId);

      const gameSave = await prisma.gameSave.findUnique({
        where: { id: saveId },
      });

      if (!gameSave) throw new AppError('存档不存在', 404);
      if (gameSave.sessionId !== sessionId) {
        throw new AppError('存档不属于此会话', 400);
      }

      const saveData = gameSave.saveData as any;

      // 恢复会话状态
      await prisma.gameSession.update({
        where: { id: sessionId },
        data: {
          currentRound: saveData.session.currentRound,
          roundStatus: saveData.session.roundStatus,
          gameState: saveData.session.gameState,
          status: saveData.session.status,
          decisionDeadline: saveData.session.decisionDeadline
            ? new Date(saveData.session.decisionDeadline)
            : null,
        },
      });

      // 恢复推演结果到 Redis
      if (saveData.inferenceResults && Array.isArray(saveData.inferenceResults)) {
        for (const result of saveData.inferenceResults) {
          if (result && result.round && result.result) {
            const resultKey = `inference:result:${sessionId}:${result.round}`;
            await redis.setex(
              resultKey,
              86400,
              JSON.stringify(result.result)
            );
          }
        }
      }

      // 广播恢复通知
      io.to(session.roomId).emit('game_restored', {
        sessionId,
        saveId: gameSave.id,
        saveName: gameSave.saveName,
        restoredAt: new Date().toISOString(),
      });

      // 广播游戏状态更新
      io.to(session.roomId).emit('game_state_update', {
        roomId: session.roomId,
        sessionId,
        currentRound: saveData.session.currentRound,
        roundStatus: saveData.session.roundStatus,
        decisionDeadline: saveData.session.decisionDeadline,
        status: saveData.session.status,
      });

      res.json({
        code: 200,
        message: '游戏已恢复到指定存档点',
        data: {
          sessionId,
          saveId: gameSave.id,
          saveName: gameSave.saveName,
          restoredAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /api/game/:sessionId/saves/:saveId
 * 删除游戏存档
 */
router.delete(
  '/:sessionId/saves/:saveId',
  authenticateToken,
  async (req: AuthRequest, res, next) => {
    try {
      const userId = req.userId;
      const { sessionId, saveId } = req.params;
      if (!userId) throw new AppError('Unauthorized', 401);

      const session = await prisma.gameSession.findUnique({
        where: { id: sessionId },
        include: { room: true },
      });
      if (!session) throw new AppError('游戏会话不存在', 404);

      // 只有主持人可以删除存档
      await ensureRoomHost(session.roomId, userId);

      const gameSave = await prisma.gameSave.findUnique({
        where: { id: saveId },
      });

      if (!gameSave) throw new AppError('存档不存在', 404);
      if (gameSave.sessionId !== sessionId) {
        throw new AppError('存档不属于此会话', 400);
      }

      await prisma.gameSave.delete({
        where: { id: saveId },
      });

      // 广播删除通知
      io.to(session.roomId).emit('game_save_deleted', {
        sessionId,
        saveId,
        deletedAt: new Date().toISOString(),
      });

      res.json({
        code: 200,
        message: '存档已删除',
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
