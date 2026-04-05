import { Context, Next } from 'hono';
import * as jose from 'jose';
import type { Env, JwtPayload } from '../types';

export async function createToken(payload: Omit<JwtPayload, 'exp' | 'iat'>, secret: string): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return await new jose.SignJWT(payload as unknown as jose.JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(key);
}

export async function verifyToken(token: string, secret: string): Promise<JwtPayload> {
  const key = new TextEncoder().encode(secret);
  const { payload } = await jose.jwtVerify(token, key);
  return payload as unknown as JwtPayload;
}

export async function authMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = authHeader.slice(7);
  try {
    const payload = await verifyToken(token, c.env.JWT_SECRET);
    c.set('user', payload);
    await next();
  } catch {
    return c.json({ error: 'Invalid token' }, 401);
  }
}
