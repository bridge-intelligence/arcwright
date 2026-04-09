import { Hono } from 'hono';
import type { Env } from '../types';
import { authMiddleware } from '../middleware/auth';
import { ecosystemData } from '../data/ecosystem';

const explore = new Hono<{ Bindings: Env }>();

// Domain check: only allow emails from ALLOWED_EXPLORE_DOMAINS
explore.use('*', authMiddleware);
explore.use('*', async (c, next) => {
  const user = c.get('user');
  const allowed = (c.env.ALLOWED_EXPLORE_DOMAINS || '')
    .split(',')
    .map((d: string) => d.trim().toLowerCase())
    .filter(Boolean);

  if (allowed.length === 0) {
    return c.json({ error: 'No allowed domains configured' }, 500);
  }

  const domain = user.email.split('@')[1]?.toLowerCase();
  if (!allowed.includes(domain)) {
    return c.json({ error: 'Access restricted to authorized organizations' }, 403);
  }

  await next();
});

// GET /api/explore/ecosystem — returns full ecosystem data
explore.get('/ecosystem', (c) => {
  return c.json(ecosystemData);
});

export default explore;
