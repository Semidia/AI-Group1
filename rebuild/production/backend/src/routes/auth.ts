import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import prisma from '../utils/db';
import { AppError } from '../middleware/errorHandler';

// Helper class for creating AppError instances
class AppErrorClass extends Error implements AppError {
  statusCode?: number;
  code?: string;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.statusCode = statusCode;
    this.name = 'AppError';
  }
}
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { logger } from '../utils/logger';

const router = express.Router();

// Validation schemas
const registerSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email(),
  password: z.string().min(6).max(100),
});

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(6).max(100),
});

// Helper function to generate JWT token
const generateToken = (userId: string, username: string): string => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new AppErrorClass('JWT secret not configured', 500);
  }

  return jwt.sign(
    { userId, username },
    jwtSecret as jwt.Secret,
    {
      expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as jwt.SignOptions['expiresIn'],
    }
  );
};

/**
 * POST /api/auth/register
 * Register a new user
 */
router.post('/register', async (req, res, next) => {
  try {
    const validatedData = registerSchema.parse(req.body);
    const { username, email, password } = validatedData;

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ username }, { email }],
      },
    });

    if (existingUser) {
      throw new AppErrorClass('Username or email already exists', 400);
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user，默认状态为 active
    const user = await prisma.user.create({
      data: {
        username,
        email,
        password: passwordHash,
        nickname: username,
        status: 'active',
      },
      select: {
        id: true,
        username: true,
        email: true,
        nickname: true,
        avatarUrl: true,
        level: true,
        experience: true,
        createdAt: true,
        status: true,
      },
    });

    // Generate token
    const token = generateToken(user.id, user.username);

    logger.info(`User registered: ${username}`);

    res.status(201).json({
      code: 201,
      message: 'User registered successfully',
      data: {
        token,
        user,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppErrorClass('Invalid input data', 400));
    } else {
      next(error);
    }
  }
});

/**
 * POST /api/auth/login
 * Login user
 */
router.post('/login', async (req, res, next) => {
  try {
    const validatedData = loginSchema.parse(req.body);
    const { username, password } = validatedData;

    // Find user by username or email
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ username }, { email: username }],
      },
    });

    if (!user) {
      throw new AppErrorClass('Invalid username or password', 401);
    }

    if (user.status === 'frozen') {
      throw new AppErrorClass('Account is frozen, please contact administrator', 403);
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      throw new AppErrorClass('Invalid username or password', 401);
    }

    // Update last login time
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Generate token
    const token = generateToken(user.id, user.username);

    logger.info(`User logged in: ${username}`);

    res.json({
      code: 200,
      message: 'Login successful',
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          nickname: user.nickname,
          avatarUrl: user.avatarUrl,
          level: user.level,
          experience: user.experience,
          status: user.status,
        },
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppErrorClass('Invalid input data', 400));
    } else {
      next(error);
    }
  }
});

/**
 * POST /api/auth/forgot-password
 * Request password reset
 */
router.post('/forgot-password', async (req, res, next) => {
  try {
    const validatedData = forgotPasswordSchema.parse(req.body);
    const { email } = validatedData;

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
    });

    // Always return success to prevent email enumeration
    if (!user) {
      logger.warn(`Password reset requested for non-existent email: ${email}`);
      return res.json({
        code: 200,
        message: 'If the email exists, a password reset link has been sent',
      });
    }

    // Generate reset token (in production, use crypto.randomBytes or similar)
    const resetToken = jwt.sign(
      { userId: user.id, type: 'password-reset' },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '1h' }
    );

    // TODO: Send email with reset link
    // In production, implement email service here
    logger.info(`Password reset token generated for: ${email} (token: ${resetToken})`);

    return res.json({
      code: 200,
      message: 'If the email exists, a password reset link has been sent',
      // In development, return token for testing
      ...(process.env.NODE_ENV === 'development' && { resetToken }),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return next(new AppErrorClass('Invalid input data', 400));
    } else {
      return next(error);
    }
  }
});

/**
 * POST /api/auth/reset-password
 * Reset password with token
 */
router.post('/reset-password', async (req, res, next) => {
  try {
    const validatedData = resetPasswordSchema.parse(req.body);
    const { token, password } = validatedData;

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new AppErrorClass('JWT secret not configured', 500);
    }

    // Verify token
    let decoded: any;
    try {
      decoded = jwt.verify(token, jwtSecret) as any;
      if (decoded.type !== 'password-reset') {
        throw new AppErrorClass('Invalid reset token', 400);
      }
    } catch (error) {
      throw new AppErrorClass('Invalid or expired reset token', 400);
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });

    if (!user) {
      throw new AppErrorClass('User not found', 404);
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(password, 10);

    // Update password
    await prisma.user.update({
      where: { id: user.id },
      data: { password: passwordHash },
    });

    logger.info(`Password reset for user: ${user.username}`);

    res.json({
      code: 200,
      message: 'Password reset successful',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppErrorClass('Invalid input data', 400));
    } else {
      next(error);
    }
  }
});

/**
 * POST /api/auth/refresh
 * Refresh JWT token
 */
router.post('/refresh', authenticateToken, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.userId!;
    const username = req.username!;

    // Generate new token
    const token = generateToken(userId, username);

    res.json({
      code: 200,
      message: 'Token refreshed successfully',
      data: { token },
    });
  } catch (error) {
    next(error);
  }
});

export default router;

