import { Router } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import prisma from '../utils/db';
import { logger } from '../utils/logger';
import { io } from '../server';

const router = Router();

// helpers
const parsePositiveInt = (value: any, fallback: number) => {
  const n = Number(value);
  if (Number.isNaN(n) || n <= 0) return fallback;
  return Math.floor(n);
};

/**
 * POST /api/rooms/create
 * 创建房间
 */
router.post('/create', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const { name, max_players, maxPlayers, game_mode, gameMode, password } = req.body || {};
    const userId = req.userId;
    if (!userId) throw new AppError('Unauthorized', 401);

    const roomName = (name || '').trim();
    if (!roomName) throw new AppError('房间名称不能为空', 400);

    const maxP = parsePositiveInt(max_players ?? maxPlayers, 4);
    if (maxP < 2 || maxP > 10) throw new AppError('人数上限需在2-10之间', 400);

    const mode = (game_mode || gameMode || 'competitive').toString();

    const room = await prisma.room.create({
      data: {
        name: roomName,
        maxPlayers: maxP,
        currentPlayers: 1,
        status: 'waiting',
        creatorId: userId,
        hostId: userId,
        password: password || null,
      },
    });

    await prisma.roomPlayer.create({
      data: {
        roomId: room.id,
        userId,
        role: 'host',
        status: 'joined',
        isHuman: true,
      },
    });

    res.status(201).json({
      code: 201,
      message: '房间创建成功',
      data: {
        room_id: room.id,
        room: {
          ...room,
          game_mode: mode,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/rooms/list
 * 获取房间列表
 */
router.get('/list', async (req, res, next) => {
  try {
    const page = parsePositiveInt(req.query.page, 1);
    const limit = parsePositiveInt(req.query.limit, 20);
    const status = req.query.status as string | undefined;

    const where = status ? { status: status.toString() } : {};
    const [rooms, total] = await Promise.all([
      prisma.room.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          name: true,
          status: true,
          maxPlayers: true,
          currentPlayers: true,
          hostId: true,
          createdAt: true,
          host: {
            select: {
              nickname: true,
              username: true,
            },
          },
        },
      }),
      prisma.room.count({ where }),
    ]);

    const withHostName = rooms.map(room => {
      const { host, ...rest } = room;
      return {
        ...rest,
        hostName: host?.nickname || host?.username || '',
      };
    });

    res.json({
      code: 200,
      data: { rooms: withHostName, total, page, limit },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/rooms/:roomId/join
 * 加入房间
 */
router.post('/:roomId/join', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.userId;
    if (!userId) throw new AppError('Unauthorized', 401);

    const { roomId } = req.params;
    const { password } = req.body || {};

    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) throw new AppError('房间不存在', 404);

    if (room.password && room.password !== password) {
      throw new AppError('房间密码错误', 403);
    }

    if (room.currentPlayers >= room.maxPlayers) {
      throw new AppError('房间已满员', 403);
    }

    const existing = await prisma.roomPlayer.findFirst({
      where: { roomId, userId },
    });

    if (existing && existing.status !== 'left') {
      throw new AppError('已在房间中', 400);
    }

    if (existing) {
      await prisma.roomPlayer.update({
        where: { id: existing.id },
        data: { status: 'joined', role: existing.role ?? 'human_player' },
      });
    } else {
      await prisma.roomPlayer.create({
        data: {
          roomId,
          userId,
          role: 'human_player',
          status: 'joined',
          isHuman: true,
        },
      });
    }

    await prisma.room.update({
      where: { id: roomId },
      data: { currentPlayers: { increment: 1 } },
    });

    try {
      io.to(roomId).emit('player_joined', { roomId, userId });
    } catch (emitErr) {
      logger.warn('emit player_joined failed', emitErr);
    }

    res.json({ code: 200, message: '加入房间成功' });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/rooms/:roomId/leave
 * 离开房间
 */
router.post('/:roomId/leave', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.userId;
    if (!userId) throw new AppError('Unauthorized', 401);
    const { roomId } = req.params;

    const membership = await prisma.roomPlayer.findFirst({
      where: { roomId, userId, status: { not: 'left' } },
    });
    if (!membership) {
      throw new AppError('不在房间中', 400);
    }

    await prisma.roomPlayer.update({
      where: { id: membership.id },
      data: { status: 'left' },
    });

    await prisma.room.update({
      where: { id: roomId },
      data: {
        currentPlayers: { decrement: 1 },
      },
    });

    try {
      io.to(roomId).emit('player_left', { roomId, userId });
    } catch (emitErr) {
      logger.warn('emit player_left failed', emitErr);
    }

    res.json({ code: 200, message: '离开房间成功' });
  } catch (error) {
    next(error);
  }
});

export default router;

