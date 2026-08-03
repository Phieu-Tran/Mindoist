import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { google } from 'googleapis';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import {
  ACCESS_TOKEN_TTL,
  consumeRefreshToken,
  issueRefreshToken,
  revokeRefreshToken,
} from './refresh-tokens.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const GOOGLE_AUTH_SCOPES = ['openid', 'email', 'profile'];

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

const loginSchema = z.object({
  email: z.string().trim().email().transform(normalizeEmail),
  password: z.string().min(1),
});

const registerSchema = z.object({
  email: z.string().trim().email().transform(normalizeEmail),
  password: z.string().min(6),
  name: z.string().min(1),
});

const setPasswordSchema = z.object({
  password: z.string().min(6),
});

const completeOnboardingSchema = z.object({
  name: z.string().trim().min(1).max(80),
  timeZone: z.string().trim().min(1).max(100),
  password: z.string().min(6).optional(),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

// Deleting an account is irreversible, so it takes a deliberate act beyond
// holding a valid token: the user must type their own email address back.
// A password check would not work here - accounts created through Google get a
// random password they have never seen (see the /google/callback handler).
const deleteAccountSchema = z.object({
  confirmEmail: z.string().trim().email().transform(normalizeEmail),
});

type AuthRateLimitAction = 'login' | 'register';
type RateLimitBucket = { count: number; resetAt: number };

const authRateLimitBuckets = new Map<string, RateLimitBucket>();

export function resetAuthRateLimits() {
  authRateLimitBuckets.clear();
}

function getRateLimitConfig(action: AuthRateLimitAction) {
  const windowMs = readAuthRateLimitNumber('AUTH_RATE_LIMIT_WINDOW_MS', 60_000);
  if (action === 'register') {
    return {
      windowMs,
      ipLimit: readAuthRateLimitNumber('AUTH_REGISTER_IP_LIMIT', 60),
      emailLimit: readAuthRateLimitNumber('AUTH_REGISTER_EMAIL_LIMIT', 5),
    };
  }
  return {
    windowMs,
    ipLimit: readAuthRateLimitNumber('AUTH_LOGIN_IP_LIMIT', 120),
    emailLimit: readAuthRateLimitNumber('AUTH_LOGIN_EMAIL_LIMIT', 10),
  };
}

function readAuthRateLimitNumber(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function hitAuthRateLimit(key: string, limit: number, windowMs: number, now: number) {
  if (limit <= 0) return null;
  const current = authRateLimitBuckets.get(key);
  if (!current || current.resetAt <= now) {
    authRateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }
  if (current.count >= limit) {
    return Math.max(1, Math.ceil((current.resetAt - now) / 1000));
  }
  current.count += 1;
  return null;
}

function checkAuthRateLimit(
  request: FastifyRequest,
  reply: FastifyReply,
  action: AuthRateLimitAction,
  email: string,
) {
  const now = Date.now();
  const config = getRateLimitConfig(action);
  const normalizedEmail = email.trim().toLowerCase();
  const retryAfter =
    hitAuthRateLimit(`${action}:ip:${request.ip}`, config.ipLimit, config.windowMs, now) ??
    hitAuthRateLimit(`${action}:email:${normalizedEmail}`, config.emailLimit, config.windowMs, now);

  if (!retryAfter) return null;
  return reply
    .header('Retry-After', String(retryAfter))
    .status(429)
    .send({ success: false, error: 'Too many attempts. Try again later.' });
}

function signUserToken(user: { id: string; email: string }) {
  // Short-lived on purpose - clients trade a refresh token for a new one via
  // POST /auth/refresh, so a leaked access token expires quickly.
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'],
  });
}

function serializeUser(user: {
  id: string;
  email: string;
  name: string;
  timeZone: string | null;
  onboardingRequired: boolean;
  role: 'USER' | 'ADMIN';
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    timeZone: user.timeZone,
    onboardingRequired: user.onboardingRequired,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
  };
}

async function createUserWithBootstrapRole(data: {
  email: string;
  password: string;
  name: string;
  onboardingRequired?: boolean;
}) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('mindoist-admin-bootstrap'))`;
    const userCount = await tx.user.count();
    return tx.user.create({
      data: { ...data, role: userCount === 0 ? 'ADMIN' : 'USER' },
    });
  });
}

function isValidTimeZone(value: string) {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function getGoogleOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_AUTH_REDIRECT_URI || 'http://localhost:3000/auth/google/callback',
  );
}

function getFrontendUrl() {
  return process.env.FRONTEND_URL || 'http://localhost:5173';
}

const googleAuthUrlSchema = z.object({
  returnTo: z.string().optional(),
});

function getAllowedGoogleReturnTo(raw?: string) {
  if (!raw) return undefined;

  try {
    const url = new URL(raw);
    const frontendUrl = new URL(getFrontendUrl());
    if (url.origin === frontendUrl.origin) return url.origin;
    if ((url.hostname === 'localhost' || url.hostname === '127.0.0.1') && url.protocol === 'http:') {
      return url.origin;
    }
    if (url.protocol === 'mindoist:') return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return undefined;
  }

  return undefined;
}

function encodeGoogleState(returnTo?: string) {
  if (!returnTo) return undefined;
  return Buffer.from(JSON.stringify({ returnTo }), 'utf8').toString('base64url');
}

function decodeGoogleState(raw?: string) {
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as { returnTo?: string };
    return getAllowedGoogleReturnTo(parsed.returnTo);
  } catch {
    return undefined;
  }
}

function redirectToFrontend(reply: FastifyReply, params: Record<string, string>, returnTo?: string) {
  const hash = new URLSearchParams(params).toString();
  return reply.redirect(`${returnTo ?? getFrontendUrl()}/#${hash}`);
}

export async function authRoutes(app: FastifyInstance) {
  app.post('/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: parsed.error.issues.map(i => i.message).join(', '),
      });
    }

    const { email, password } = parsed.data;
    const limited = checkAuthRateLimit(request, reply, 'login', email);
    if (limited) return limited;

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return reply.status(401).send({ success: false, error: 'Invalid credentials' });
    }
    if (user.status === 'SUSPENDED') {
      return reply.status(403).send({ success: false, error: 'Account suspended' });
    }

    return reply.send({
      success: true,
      data: {
        accessToken: signUserToken(user),
        refreshToken: await issueRefreshToken(user.id),
        user: serializeUser(user),
      },
    });
  });

  app.post('/register', async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: parsed.error.issues.map(i => i.message).join(', '),
      });
    }

    const { email, password, name } = parsed.data;
    const limited = checkAuthRateLimit(request, reply, 'register', email);
    if (limited) return limited;

    const hashedPassword = await bcrypt.hash(password, 10);

    try {
      const user = await createUserWithBootstrapRole({ email, password: hashedPassword, name });
      return reply.status(201).send({
        success: true,
        data: {
          accessToken: signUserToken(user),
          refreshToken: await issueRefreshToken(user.id),
          user: serializeUser(user),
        },
      });
    } catch {
      return reply.status(409).send({ success: false, error: 'Email already exists' });
    }
  });

  app.post('/set-password', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = setPasswordSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: parsed.error.issues.map(i => i.message).join(', '),
      });
    }

    const hashedPassword = await bcrypt.hash(parsed.data.password, 10);
    await prisma.user.update({
      where: { id: request.auth!.sub },
      data: { password: hashedPassword },
    });

    return reply.send({ success: true });
  });

  app.post('/complete-onboarding', { preHandler: requireAuth }, async (request, reply) => {
    const parsed = completeOnboardingSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: parsed.error.issues.map(issue => issue.message).join(', '),
      });
    }

    if (!isValidTimeZone(parsed.data.timeZone)) {
      return reply.status(400).send({ success: false, error: 'Invalid time zone' });
    }

    const user = await prisma.user.update({
      where: { id: request.auth!.sub },
      data: {
        name: parsed.data.name,
        timeZone: parsed.data.timeZone,
        onboardingRequired: false,
        ...(parsed.data.password
          ? { password: await bcrypt.hash(parsed.data.password, 10) }
          : {}),
      },
    });

    return reply.send({ success: true, data: serializeUser(user) });
  });

  app.get('/google/url', async (request, reply) => {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return reply.status(503).send({ success: false, error: 'Google sign-in is not configured' });
    }

    const parsed = googleAuthUrlSchema.safeParse(request.query);
    const returnTo = parsed.success ? getAllowedGoogleReturnTo(parsed.data.returnTo) : undefined;
    const client = getGoogleOAuth2Client();
    const url = client.generateAuthUrl({
      access_type: 'online',
      prompt: 'select_account',
      scope: GOOGLE_AUTH_SCOPES,
      ...(returnTo ? { state: encodeGoogleState(returnTo) } : {}),
    });

    return reply.send({ success: true, data: { url } });
  });

  app.get('/google/callback', async (request, reply) => {
    const { code, error, state } = request.query as { code?: string; error?: string; state?: string };
    const returnTo = decodeGoogleState(state);
    if (error) return redirectToFrontend(reply, { google_error: error }, returnTo);
    if (!code) return redirectToFrontend(reply, { google_error: 'missing_code' }, returnTo);

    try {
      const client = getGoogleOAuth2Client();
      const { tokens } = await client.getToken(code);
      if (!tokens.id_token) {
        return redirectToFrontend(reply, { google_error: 'missing_identity' }, returnTo);
      }

      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      if (!payload?.email || !payload.email_verified) {
        return redirectToFrontend(reply, { google_error: 'unverified_email' }, returnTo);
      }

      const email = normalizeEmail(payload.email);
      let user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        const fallbackName = payload.name || email.split('@')[0];
        user = await createUserWithBootstrapRole({
            email,
            name: fallbackName,
            password: await bcrypt.hash(randomUUID(), 10),
            onboardingRequired: true,
        });
      }

      if (user.status === 'SUSPENDED') {
        return redirectToFrontend(reply, { google_error: 'account_suspended' }, returnTo);
      }

      // The refresh token rides along in the URL fragment, same as the access
      // token: fragments are never sent to a server, and the frontend strips
      // them from the address bar as soon as it reads them.
      return redirectToFrontend(
        reply,
        {
          google_token: signUserToken(user),
          google_refresh: await issueRefreshToken(user.id),
        },
        returnTo,
      );
    } catch {
      return redirectToFrontend(reply, { google_error: 'auth_failed' }, returnTo);
    }
  });

  app.get('/me', { preHandler: requireAuth }, async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.auth!.sub },
      select: {
        id: true,
        email: true,
        name: true,
        timeZone: true,
        onboardingRequired: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    if (!user) {
      return reply.status(404).send({ success: false, error: 'User not found' });
    }

    return reply.send({ success: true, data: user });
  });

  // POST /auth/refresh — trade a refresh token for a fresh pair.
  // Deliberately unauthenticated: the whole point is to be callable once the
  // access token has already expired.
  app.post<{ Body: { refreshToken: string } }>('/refresh', async (request, reply) => {
    const parsed = refreshSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: 'Missing refresh token' });
    }

    const result = await consumeRefreshToken(parsed.data.refreshToken);
    if (!result.ok) {
      // One shape for every failure - telling an attacker whether a token was
      // unknown, expired or already used is free information.
      return reply.status(401).send({ success: false, error: 'Invalid refresh token' });
    }

    const user = await prisma.user.findUnique({ where: { id: result.userId } });
    if (!user || user.status === 'SUSPENDED') {
      return reply.status(401).send({ success: false, error: 'Invalid refresh token' });
    }

    return reply.send({
      success: true,
      data: {
        accessToken: signUserToken(user),
        refreshToken: await issueRefreshToken(user.id),
        user: serializeUser(user),
      },
    });
  });

  app.post<{ Body?: { refreshToken?: string } }>(
    '/logout',
    { preHandler: requireAuth },
    async request => {
      // The access token is stateless and simply discarded by the client, but
      // the refresh token must actually be revoked or signing out leaves a
      // credential that still works for 30 days.
      const refreshToken = request.body?.refreshToken;
      if (refreshToken) await revokeRefreshToken(refreshToken);
      return { success: true };
    },
  );

  // DELETE /auth/account — erase the account and everything it owns.
  // Google Play requires an in-app deletion path for any app that lets users
  // create an account. Every User relation in schema.prisma is onDelete:
  // Cascade, so one delete takes tasks, projects, notes, tokens and the rest
  // with it; nothing is left behind to restore.
  app.delete<{ Body: { confirmEmail: string } }>(
    '/account',
    { preHandler: requireAuth },
    async (request, reply) => {
      const parsed = deleteAccountSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: 'Type your account email to confirm deletion',
        });
      }

      const user = await prisma.user.findUnique({
        where: { id: request.auth!.sub },
        select: { id: true, email: true },
      });
      if (!user) {
        return reply.status(404).send({ success: false, error: 'User not found' });
      }

      if (normalizeEmail(user.email) !== parsed.data.confirmEmail) {
        return reply
          .status(400)
          .send({ success: false, error: 'Confirmation email does not match this account' });
      }

      await prisma.user.delete({ where: { id: user.id } });

      return reply.send({ success: true });
    },
  );
}
