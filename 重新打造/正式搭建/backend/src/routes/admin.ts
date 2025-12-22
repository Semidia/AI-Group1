import express from 'express';
import prisma from '../utils/db';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = express.Router();

// 简单的开发者校验：通过环境变量或硬编码的管理员用户名
const isAdminUser = (req: AuthRequest) => {
  const adminUsername = process.env.ADMIN_USERNAME || '开发者账号';
  return req.username === adminUsername;
};

const requireAdmin = (req: AuthRequest) => {
  if (!isAdminUser(req)) {
    throw new AppError('只有开发者可以访问此接口', 403);
  }
};

/**
 * GET /api/admin/users
 * 查询在册用户列表
 */
router.get('/users', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    requireAdmin(req);

    const page = Number(req.query.page ?? 1) || 1;
    const limit = Number(req.query.limit ?? 20) || 20;
    const status = (req.query.status as string | undefined) || undefined; // active / frozen / all

    const where: any = {};
    if (status && status !== 'all') {
      where.status = status;
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          username: true,
          email: true,
          nickname: true,
          status: true,
          createdAt: true,
          lastLoginAt: true,
          roomPlayers: {
            where: { status: { not: 'left' } },
            select: {
              room: {
                select: {
                  id: true,
                  name: true,
                  status: true,
                },
              },
            },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    const items = users.map(u => {
      const activeRoom = u.roomPlayers[0]?.room;
      return {
        id: u.id,
        username: u.username,
        email: u.email,
        nickname: u.nickname,
        status: u.status,
        createdAt: u.createdAt,
        lastLoginAt: u.lastLoginAt,
        // 简化：是否在线先用 lastLoginAt 非空近似；如需更精确可接入 Socket/会话状态
        online: !!u.lastLoginAt,
        room: activeRoom
          ? {
              id: activeRoom.id,
              name: activeRoom.name,
              status: activeRoom.status,
            }
          : null,
      };
    });

    res.json({
      code: 200,
      data: {
        users: items,
        total,
        page,
        limit,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/admin/users/:userId/freeze
 * 冻结/拉黑用户
 */
router.post('/users/:userId/freeze', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    requireAdmin(req);
    const { userId } = req.params;

    const user = await prisma.user.update({
      where: { id: userId },
      data: { status: 'frozen' },
      select: { id: true, username: true, status: true },
    });

    res.json({
      code: 200,
      message: '用户已冻结',
      data: user,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/admin/users/:userId/unfreeze
 * 解冻用户
 */
router.post('/users/:userId/unfreeze', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    requireAdmin(req);
    const { userId } = req.params;

    const user = await prisma.user.update({
      where: { id: userId },
      data: { status: 'active' },
      select: { id: true, username: true, status: true },
    });

    res.json({
      code: 200,
      message: '用户已解冻',
      data: user,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/admin/users/:userId
 * 物理删除用户
 */
router.delete('/users/:userId', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    requireAdmin(req);
    const { userId } = req.params;

    // 简单保护：不允许删除当前登录管理员自己
    if (req.userId === userId) {
      throw new AppError('不能删除当前登录的开发者账号', 400);
    }

    // TODO: 若后续需要严格限制（存在重要关联时禁止删除），可在这里增加检查
    await prisma.user.delete({
      where: { id: userId },
    });

    res.json({
      code: 200,
      message: '用户已删除',
      data: { id: userId },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/admin/rooms
 * 查询在线/活跃房间列表
 */
router.get('/rooms', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    requireAdmin(req);

    const page = Number(req.query.page ?? 1) || 1;
    const limit = Number(req.query.limit ?? 20) || 20;
    const status = (req.query.status as string | undefined) || undefined; // waiting/playing/closed/all

    const where: any = {};
    if (status && status !== 'all') {
      where.status = status;
    } else if (!status) {
      where.status = { in: ['waiting', 'playing'] };
    }

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
          createdAt: true,
          startedAt: true,
          finishedAt: true,
          host: {
            select: {
              id: true,
              username: true,
              nickname: true,
            },
          },
        },
      }),
      prisma.room.count({ where }),
    ]);

    const items = rooms.map(room => ({
      id: room.id,
      name: room.name,
      status: room.status,
      maxPlayers: room.maxPlayers,
      currentPlayers: room.currentPlayers,
      createdAt: room.createdAt,
      startedAt: room.startedAt,
      finishedAt: room.finishedAt,
      host: {
        id: room.host?.id,
        username: room.host?.username,
        nickname: room.host?.nickname,
      },
    }));

    res.json({
      code: 200,
      data: {
        rooms: items,
        total,
        page,
        limit,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/admin/rooms/:roomId/close
 * 开发者强制关闭房间
 */
router.post('/rooms/:roomId/close', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    requireAdmin(req);
    const { roomId } = req.params;

    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) {
      throw new AppError('房间不存在', 404);
    }

    if (room.status === 'closed' || room.status === 'finished') {
      res.json({
        code: 200,
        message: '房间已关闭',
        data: { room_id: roomId, status: room.status },
      });
      return;
    }

    const now = new Date();

    await prisma.$transaction([
      prisma.roomPlayer.updateMany({
        where: { roomId, status: { not: 'left' } },
        data: { status: 'left', leftAt: now },
      }),
      prisma.room.update({
        where: { id: roomId },
        data: {
          status: 'closed',
          finishedAt: now,
          currentPlayers: 0,
        },
      }),
      prisma.gameSession.updateMany({
        where: { roomId },
        data: { status: 'finished' },
      }),
    ]);

    res.json({
      code: 200,
      message: '房间已关闭',
      data: { room_id: roomId, status: 'closed' },
    });
  } catch (error) {
    next(error);
  }
});

export default router;


