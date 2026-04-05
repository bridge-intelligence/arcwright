import { Hono } from 'hono';
import type { Env, GoogleTokenResponse, GoogleUserInfo } from '../types';
import { createToken, authMiddleware } from '../middleware/auth';

const auth = new Hono<{ Bindings: Env }>();

// Google OAuth: redirect to Google consent screen
auth.get('/google', (c) => {
  const workerOrigin = new URL(c.req.url).origin;
  const redirectUri = `${workerOrigin}/api/auth/google/callback`;
  const params = new URLSearchParams({
    client_id: c.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'consent',
  });
  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// Google OAuth callback
auth.get('/google/callback', async (c) => {
  const code = c.req.query('code');
  if (!code) return c.json({ error: 'Missing code' }, 400);

  const workerOrigin = new URL(c.req.url).origin;
  const redirectUri = `${workerOrigin}/api/auth/google/callback`;

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    console.error('Google token exchange failed:', tokenRes.status, err);
    const errorDetail = encodeURIComponent(`token_exchange_${tokenRes.status}`);
    return c.redirect(`${c.env.APP_URL}/login?error=${errorDetail}`);
  }

  const tokens: GoogleTokenResponse = await tokenRes.json();

  // Get user info
  const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!userRes.ok) {
    return c.redirect(`${c.env.APP_URL}/login?error=google_profile_failed`);
  }

  const googleUser: GoogleUserInfo = await userRes.json();

  // Upsert user + tenant
  const db = c.env.DB;
  let user = await db.prepare('SELECT * FROM users WHERE google_id = ?').bind(googleUser.id).first();

  if (!user) {
    // Create tenant for new user
    const tenantId = crypto.randomUUID();
    const slug = googleUser.email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '-');

    await db.prepare(
      'INSERT INTO tenants (id, name, slug) VALUES (?, ?, ?)'
    ).bind(tenantId, googleUser.name || slug, slug).run();

    // Create user
    const userId = crypto.randomUUID();
    await db.prepare(
      `INSERT INTO users (id, tenant_id, email, display_name, photo_url, google_id, role)
       VALUES (?, ?, ?, ?, ?, ?, 'admin')`
    ).bind(userId, tenantId, googleUser.email, googleUser.name, googleUser.picture, googleUser.id).run();

    user = { id: userId, tenant_id: tenantId, email: googleUser.email, role: 'admin' };
  }

  // Create JWT
  const jwt = await createToken({
    sub: user.id as string,
    email: user.email as string,
    tenant_id: user.tenant_id as string,
    role: user.role as string,
  }, c.env.JWT_SECRET);

  // Redirect to frontend with token
  return c.redirect(`${c.env.APP_URL}/auth/callback?token=${jwt}`);
});

// GitHub OAuth: redirect to GitHub consent
auth.get('/github', authMiddleware, async (c) => {
  const user = c.get('user');

  const workerOrigin = new URL(c.req.url).origin;
  const redirectUri = `${workerOrigin}/api/auth/github/callback`;
  const state = btoa(JSON.stringify({ userId: user.sub }));
  const params = new URLSearchParams({
    client_id: c.env.GITHUB_CLIENT_ID,
    redirect_uri: redirectUri,
    scope: 'repo read:user user:email',
    state,
  });
  return c.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

// GitHub OAuth callback
auth.get('/github/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  if (!code || !state) return c.json({ error: 'Missing code or state' }, 400);

  let userId: string;
  try {
    const parsed = JSON.parse(atob(state));
    userId = parsed.userId;
  } catch {
    return c.json({ error: 'Invalid state' }, 400);
  }

  // Exchange code for token
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: c.env.GITHUB_CLIENT_ID,
      client_secret: c.env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });

  const tokenData = await tokenRes.json() as { access_token?: string };
  if (!tokenData.access_token) {
    return c.redirect(`${c.env.APP_URL}/dashboard?error=github_auth_failed`);
  }

  // Get GitHub user info
  const ghUserRes = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`,
      'User-Agent': 'Arcwright',
    },
  });
  const ghUser = await ghUserRes.json() as { id: number; login: string };

  // Update user with GitHub info
  await c.env.DB.prepare(
    `UPDATE users SET github_id = ?, github_token = ?, github_username = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).bind(String(ghUser.id), tokenData.access_token, ghUser.login, userId).run();

  return c.redirect(`${c.env.APP_URL}/dashboard?github=connected`);
});

// Get current user
auth.get('/me', authMiddleware, async (c) => {
  const user = c.get('user');

  const dbUser = await c.env.DB.prepare(
    'SELECT id, tenant_id, email, display_name, photo_url, github_username, role, created_at FROM users WHERE id = ?'
  ).bind(user.sub).first();

  if (!dbUser) return c.json({ error: 'User not found' }, 404);
  return c.json(dbUser);
});

export default auth;
