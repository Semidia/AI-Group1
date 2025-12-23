import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { rateLimiter } from './middleware/rateLimiter';
import { initSocketServer } from './socket';
import prisma from './utils/db';
import bcrypt from 'bcrypt';

// Load environment variables
dotenv.config();

const app = express();
const httpServer = createServer(app);

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  process.env.FRONTEND_URL,
].filter(Boolean) as string[];

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);

    // 局域网识别
    if (process.env.NODE_ENV !== 'production' &&
      (origin.includes('192.168.') || origin.includes('10.') || origin.includes('172.') || origin.includes('localhost'))) {
      return callback(null, true);
    }

    if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      if (process.env.NODE_ENV !== 'production') {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  credentials: true,
};

const io = new Server(httpServer, {
  cors: corsOptions,
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false, // 演示环境下关闭 CSP 以减少兼容性问题
}));
app.use(compression());
app.use(cors(corsOptions));

// Update Socket.io CORS as well
io.engine.on("headers", (headers, req) => {
  const origin = req.headers.origin;
  if (origin && (origin.includes('192.168.') || origin.includes('10.') || origin.includes('172.'))) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
  }
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads')); // Serve uploaded files

// Health check (should not be rate limited)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Apply rate limiter after health check
app.use(rateLimiter);

// Test routes (for Phase 1 testing)
import testRoutes from './routes/test';
app.use('/api', testRoutes);

// API routes
// Phase 2: Auth routes
import authRoutes from './routes/auth';
import userRoutes from './routes/user';
import roomRoutes from './routes/rooms';
import gameRoutes from './routes/game';
import tradeRoutes from './routes/trade';
import taskRoutes from './routes/tasks';
import strategyRoutes from './routes/strategies';
import adminRoutes from './routes/admin';
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/user', strategyRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/game', tradeRoutes);
app.use('/api/game', taskRoutes);
app.use('/api/admin', adminRoutes);

// Error handling
app.use(errorHandler);

// WebSocket connection handling (delegated to socket module)
initSocketServer(io);

// Ensure default developer account exists
const ensureDefaultAdmin = async () => {
  try {
    const username = process.env.ADMIN_USERNAME || 'developer';
    const password = process.env.ADMIN_DEFAULT_PASSWORD || '000000';

    // Check if user exists by username
    const existing = await prisma.user.findUnique({
      where: { username },
    });

    if (!existing) {
      const passwordHash = await bcrypt.hash(password, 10);
      await prisma.user.create({
        data: {
          username,
          password: passwordHash,
          nickname: username,
          status: 'active',
        },
      });
      logger.info(`Default admin user created: ${username} / ${password}`);
    } else {
      logger.info(`Default admin user already exists: ${existing.username}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error(`Failed to ensure default admin user: ${errorMessage}`, {
      error: errorMessage,
      stack: errorStack,
    });
  }
};

// Start server
httpServer.listen(PORT, async () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  await ensureDefaultAdmin();
});

export { app, io };
