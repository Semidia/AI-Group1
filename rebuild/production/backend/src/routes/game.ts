import { Router } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import prisma from '../utils/db';
import { AppError } from '../middleware/errorHandler';
import { io } from '../server';

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
        sessionId: session.id,
        roomId,
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

export default router;
