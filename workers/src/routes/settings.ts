import { Hono } from 'hono';
import type { Env } from '../types';
import { authMiddleware } from '../middleware/auth';

const settings = new Hono<{ Bindings: Env }>();
settings.use('*', authMiddleware);

// ===== USER PROFILE =====
settings.get('/profile', async (c) => {
  const user = c.get('user');
  const dbUser = await c.env.DB.prepare(
    'SELECT u.*, o.name as org_name, o.slug as org_slug, o.plan, o.max_repos, o.max_analyses_per_month, o.max_claude_analyses, o.max_team_members FROM users u LEFT JOIN organizations o ON o.id = u.org_id WHERE u.id = ?'
  ).bind(user.sub).first();
  return c.json(dbUser);
});

settings.patch('/profile', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ display_name?: string }>();
  await c.env.DB.prepare('UPDATE users SET display_name = COALESCE(?, display_name), updated_at = datetime(\'now\') WHERE id = ?')
    .bind(body.display_name || null, user.sub).run();
  return c.json({ ok: true });
});

// ===== ORGANIZATION =====
settings.get('/org', async (c) => {
  const user = c.get('user');
  const org = await c.env.DB.prepare(
    'SELECT o.* FROM organizations o JOIN users u ON u.org_id = o.id WHERE u.id = ?'
  ).bind(user.sub).first();
  if (!org) return c.json({ error: 'No organization' }, 404);
  return c.json(org);
});

settings.patch('/org', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ name?: string; billing_email?: string }>();
  const dbUser = await c.env.DB.prepare('SELECT org_id FROM users WHERE id = ?').bind(user.sub).first();
  if (!dbUser?.org_id) return c.json({ error: 'No org' }, 404);

  await c.env.DB.prepare(
    'UPDATE organizations SET name = COALESCE(?, name), billing_email = COALESCE(?, billing_email), updated_at = datetime(\'now\') WHERE id = ?'
  ).bind(body.name || null, body.billing_email || null, dbUser.org_id).run();
  return c.json({ ok: true });
});

// ===== TEAM =====
settings.get('/team', async (c) => {
  const user = c.get('user');
  const dbUser = await c.env.DB.prepare('SELECT org_id FROM users WHERE id = ?').bind(user.sub).first();
  if (!dbUser?.org_id) return c.json([]);

  const members = await c.env.DB.prepare(
    `SELECT om.*, u.email, u.display_name, u.photo_url, u.github_username
     FROM org_members om JOIN users u ON u.id = om.user_id
     WHERE om.org_id = ? ORDER BY om.created_at`
  ).bind(dbUser.org_id).all();

  return c.json(members.results);
});

settings.post('/team/invite', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ email: string; role?: string }>();
  if (!body.email) return c.json({ error: 'email required' }, 400);

  const dbUser = await c.env.DB.prepare('SELECT org_id FROM users WHERE id = ?').bind(user.sub).first();
  if (!dbUser?.org_id) return c.json({ error: 'No org' }, 404);

  // Check quota
  const org = await c.env.DB.prepare('SELECT max_team_members FROM organizations WHERE id = ?').bind(dbUser.org_id).first();
  const count = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM org_members WHERE org_id = ?').bind(dbUser.org_id).first();
  if (org && count && (count.cnt as number) >= (org.max_team_members as number)) {
    return c.json({ error: `Team limit reached (${org.max_team_members}). Upgrade your plan.` }, 403);
  }

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    'INSERT INTO org_members (id, org_id, user_id, role, invited_by, invited_email) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(id, dbUser.org_id, user.sub, body.role || 'member', user.sub, body.email).run();

  await logAudit(c.env.DB, dbUser.org_id as string, user.sub, 'team.invite', 'org_member', id, `Invited ${body.email} as ${body.role || 'member'}`);
  return c.json({ ok: true, id });
});

settings.delete('/team/:memberId', async (c) => {
  const user = c.get('user');
  const memberId = c.req.param('memberId');
  const dbUser = await c.env.DB.prepare('SELECT org_id FROM users WHERE id = ?').bind(user.sub).first();
  if (!dbUser?.org_id) return c.json({ error: 'No org' }, 404);

  await c.env.DB.prepare('DELETE FROM org_members WHERE id = ? AND org_id = ?').bind(memberId, dbUser.org_id).run();
  return c.json({ ok: true });
});

// ===== USAGE =====
settings.get('/usage', async (c) => {
  const user = c.get('user');
  const days = parseInt(c.req.query('days') || '30');
  const dbUser = await c.env.DB.prepare('SELECT org_id FROM users WHERE id = ?').bind(user.sub).first();
  if (!dbUser?.org_id) return c.json({ error: 'No org' }, 404);

  const [summary, daily, byModel, org] = await Promise.all([
    c.env.DB.prepare(
      `SELECT COUNT(*) as total_analyses, SUM(tokens_in) as total_tokens_in, SUM(tokens_out) as total_tokens_out, SUM(cost_usd) as total_cost
       FROM usage_records WHERE org_id = ? AND created_at > datetime('now', '-' || ? || ' days')`
    ).bind(dbUser.org_id, days).first(),
    c.env.DB.prepare(
      `SELECT date(created_at) as day, COUNT(*) as count, SUM(cost_usd) as cost
       FROM usage_records WHERE org_id = ? AND created_at > datetime('now', '-' || ? || ' days')
       GROUP BY date(created_at) ORDER BY day DESC`
    ).bind(dbUser.org_id, days).all(),
    c.env.DB.prepare(
      `SELECT model, COUNT(*) as count, SUM(tokens_in) as tokens_in, SUM(tokens_out) as tokens_out, SUM(cost_usd) as cost
       FROM usage_records WHERE org_id = ? AND created_at > datetime('now', '-' || ? || ' days')
       GROUP BY model`
    ).bind(dbUser.org_id, days).all(),
    c.env.DB.prepare('SELECT * FROM organizations WHERE id = ?').bind(dbUser.org_id).first(),
  ]);

  // Current month analysis count
  const monthCount = await c.env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM usage_records WHERE org_id = ? AND created_at > datetime('now', 'start of month')`
  ).bind(dbUser.org_id).first();

  return c.json({
    summary,
    daily: daily.results,
    byModel: byModel.results,
    quota: {
      analyses_used: monthCount?.cnt || 0,
      analyses_limit: org?.max_analyses_per_month || 10,
      claude_limit: org?.max_claude_analyses || 0,
      repos_limit: org?.max_repos || 3,
      plan: org?.plan || 'free',
    },
  });
});

// ===== BILLING =====
settings.get('/billing', async (c) => {
  const user = c.get('user');
  const dbUser = await c.env.DB.prepare('SELECT org_id FROM users WHERE id = ?').bind(user.sub).first();
  if (!dbUser?.org_id) return c.json({ error: 'No org' }, 404);

  const org = await c.env.DB.prepare('SELECT * FROM organizations WHERE id = ?').bind(dbUser.org_id).first();
  const repoCount = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM repos WHERE tenant_id = ?').bind(dbUser.org_id).first();
  const monthUsage = await c.env.DB.prepare(
    `SELECT COUNT(*) as analyses, SUM(cost_usd) as cost FROM usage_records WHERE org_id = ? AND created_at > datetime('now', 'start of month')`
  ).bind(dbUser.org_id).first();

  return c.json({
    plan: org?.plan || 'free',
    billing_email: org?.billing_email,
    stripe_customer_id: org?.stripe_customer_id,
    limits: { repos: org?.max_repos, analyses: org?.max_analyses_per_month, claude: org?.max_claude_analyses, team: org?.max_team_members },
    current: { repos: repoCount?.cnt || 0, analyses: monthUsage?.analyses || 0, cost: monthUsage?.cost || 0 },
    plans: [
      { id: 'free', name: 'Free', price: 0, repos: 3, analyses: 10, claude: 0, team: 1 },
      { id: 'pro', name: 'Pro', price: 15, repos: 20, analyses: 100, claude: 20, team: 5 },
      { id: 'team', name: 'Team', price: 49, repos: -1, analyses: 500, claude: 100, team: 25 },
      { id: 'enterprise', name: 'Enterprise', price: -1, repos: -1, analyses: -1, claude: -1, team: -1 },
    ],
  });
});

// Plan upgrade (stub — will connect to LemonSqueezy/Stripe)
settings.post('/billing/upgrade', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ plan: string }>();
  const dbUser = await c.env.DB.prepare('SELECT org_id FROM users WHERE id = ?').bind(user.sub).first();
  if (!dbUser?.org_id) return c.json({ error: 'No org' }, 404);

  const limits: Record<string, { repos: number; analyses: number; claude: number; team: number }> = {
    free: { repos: 3, analyses: 10, claude: 0, team: 1 },
    pro: { repos: 20, analyses: 100, claude: 20, team: 5 },
    team: { repos: 999, analyses: 500, claude: 100, team: 25 },
  };

  const plan = limits[body.plan];
  if (!plan) return c.json({ error: 'Invalid plan' }, 400);

  await c.env.DB.prepare(
    `UPDATE organizations SET plan = ?, max_repos = ?, max_analyses_per_month = ?, max_claude_analyses = ?, max_team_members = ?, updated_at = datetime('now') WHERE id = ?`
  ).bind(body.plan, plan.repos, plan.analyses, plan.claude, plan.team, dbUser.org_id).run();

  await logAudit(c.env.DB, dbUser.org_id as string, user.sub, 'billing.upgrade', 'organization', dbUser.org_id as string, `Upgraded to ${body.plan}`);
  return c.json({ ok: true, plan: body.plan });
});

// ===== AUDIT LOG =====
settings.get('/audit', async (c) => {
  const user = c.get('user');
  const limit = parseInt(c.req.query('limit') || '50');
  const dbUser = await c.env.DB.prepare('SELECT org_id FROM users WHERE id = ?').bind(user.sub).first();
  if (!dbUser?.org_id) return c.json([]);

  const logs = await c.env.DB.prepare(
    `SELECT al.*, u.display_name, u.email FROM audit_log al LEFT JOIN users u ON u.id = al.user_id
     WHERE al.org_id = ? ORDER BY al.created_at DESC LIMIT ?`
  ).bind(dbUser.org_id, limit).all();

  return c.json(logs.results);
});

// Helper
async function logAudit(db: D1Database, orgId: string, userId: string, action: string, resourceType: string, resourceId: string, details: string) {
  await db.prepare(
    'INSERT INTO audit_log (id, org_id, user_id, action, resource_type, resource_id, details) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(crypto.randomUUID(), orgId, userId, action, resourceType, resourceId, details).run();
}

export { logAudit };
export default settings;
