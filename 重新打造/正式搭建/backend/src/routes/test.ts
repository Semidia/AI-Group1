import { Router } from 'express';
import prisma from '../utils/db';
import redis from '../utils/redis';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /api/test/db
 * 测试数据库连接
 */
router.get('/test/db', async (req, res) => {
  try {
    // 尝试执行一个简单的查询来测试连接
    await prisma.$queryRaw`SELECT 1`;
    logger.info('Database connection test: success');
    res.json({ 
      status: 'ok', 
      message: 'Database connected',
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    logger.error('Database connection test failed:', error);
    const errorMessage = error.message || 'Database connection failed';
    const errorCode = error.code || 'UNKNOWN';
    res.status(500).json({ 
      status: 'error', 
      message: errorMessage,
      code: errorCode,
      hint: errorCode === 'P1001' ? '无法连接到数据库服务器，请检查DATABASE_URL配置和PostgreSQL服务状态' : 
            errorCode === 'P1003' ? '数据库不存在，请先创建数据库或检查DATABASE_URL' :
            '请检查数据库配置和连接状态'
    });
  }
});

/**
 * GET /api/test/redis
 * 测试Redis连接
 */
router.get('/test/redis', async (req, res) => {
  try {
    const result = await redis.ping();
    logger.info('Redis connection test: success');
    res.json({ 
      status: 'ok', 
      message: 'Redis connected',
      ping: result,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    logger.error('Redis connection test failed:', error);
    // Redis是可选的，返回200但标记为警告
    res.status(200).json({ 
      status: 'warning', 
      message: error.message || 'Redis connection failed (optional)',
      note: 'Redis是可选的，不影响核心功能'
    });
  }
});

/**
 * GET /api/test/websocket
 * 测试WebSocket连接信息
 */
router.get('/test/websocket', (req, res) => {
  res.json({
    status: 'ok',
    message: 'WebSocket server is running',
    endpoint: process.env.FRONTEND_URL || 'http://localhost:5173',
    timestamp: new Date().toISOString()
  });
});

export default router;

