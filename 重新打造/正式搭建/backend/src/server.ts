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
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  },
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(compression());
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads')); // Serve uploaded files
app.use(rateLimiter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Test routes (for Phase 1 testing)
import testRoutes from './routes/test';
app.use('/api', testRoutes);

// API routes
// Phase 2: Auth routes
import authRoutes from './routes/auth';
import userRoutes from './routes/user';
import roomRoutes from './routes/rooms';
import gameRoutes from './routes/game';
import adminRoutes from './routes/admin';
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/admin', adminRoutes);

// Error handling
app.use(errorHandler);

// WebSocket connection handling (delegated to socket module)
initSocketServer(io);

// Ensure default developer account exists
const ensureDefaultAdmin = async () => {
  try {
    const username = process.env.ADMIN_USERNAME || '开发者账号';
    const email = process.env.ADMIN_EMAIL || 'dev@example.com';
    const password = process.env.ADMIN_DEFAULT_PASSWORD || '000000';

    const existing = await prisma.user.findFirst({ where: { username } });
    if (!existing) {
      const passwordHash = await bcrypt.hash(password, 10);
      await prisma.user.create({
        data: {
          username,
          email,
          password: passwordHash,
          nickname: username,
          status: 'active',
        },
      });
      logger.info(`Default admin user created: ${username} / ${password}`);
    }
  } catch (error) {
    logger.error('Failed to ensure default admin user', error);
  }
};

// Start server
httpServer.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  ensureDefaultAdmin();
});

export { app, io };
