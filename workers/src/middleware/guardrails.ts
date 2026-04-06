import type { Env } from '../types';

interface QuotaCheck {
  allowed: boolean;
  reason?: string;
  usage: { analyses: number; limit: number; claude_used?: number; claude_limit?: number };
}

export async function checkAnalysisQuota(db: D1Database, orgId: string, source: string): Promise<QuotaCheck> {
  const org = await db.prepare('SELECT * FROM organizations WHERE id = ?').bind(orgId).first();
  if (!org) return { allowed: false, reason: 'Organization not found', usage: { analyses: 0, limit: 0 } };

  // Count analyses this month
  const monthCount = await db.prepare(
    `SELECT COUNT(*) as cnt FROM usage_records WHERE org_id = ? AND created_at > datetime('now', 'start of month')`
  ).bind(orgId).first();

  const used = (monthCount?.cnt as number) || 0;
  const limit = (org.max_analyses_per_month as number) || 10;

  if (used >= limit) {
    return { allowed: false, reason: `Monthly analysis limit reached (${used}/${limit}). Upgrade your plan.`, usage: { analyses: used, limit } };
  }

  // Check Claude-specific quota
  if (source === 'claude-api') {
    const claudeCount = await db.prepare(
      `SELECT COUNT(*) as cnt FROM usage_records WHERE org_id = ? AND type = 'claude_api' AND created_at > datetime('now', 'start of month')`
    ).bind(orgId).first();

    const claudeUsed = (claudeCount?.cnt as number) || 0;
    const claudeLimit = (org.max_claude_analyses as number) || 0;

    if (claudeLimit === 0) {
      return { allowed: false, reason: 'Claude API analysis not available on Free plan. Upgrade to Pro.', usage: { analyses: used, limit, claude_used: claudeUsed, claude_limit: claudeLimit } };
    }

    if (claudeUsed >= claudeLimit) {
      return { allowed: false, reason: `Monthly Claude analysis limit reached (${claudeUsed}/${claudeLimit}). Upgrade your plan.`, usage: { analyses: used, limit, claude_used: claudeUsed, claude_limit: claudeLimit } };
    }
  }

  // Rate limiting: max 10 analyses per hour
  const hourCount = await db.prepare(
    `SELECT COUNT(*) as cnt FROM usage_records WHERE org_id = ? AND created_at > datetime('now', '-1 hour')`
  ).bind(orgId).first();

  if ((hourCount?.cnt as number) >= 10) {
    return { allowed: false, reason: 'Rate limit: max 10 analyses per hour. Try again later.', usage: { analyses: used, limit } };
  }

  return { allowed: true, usage: { analyses: used, limit } };
}

export async function recordUsage(db: D1Database, orgId: string, userId: string, type: string, repoId: string, model: string | null, tokensIn: number, tokensOut: number, costUsd: number) {
  await db.prepare(
    'INSERT INTO usage_records (id, org_id, user_id, type, repo_id, model, tokens_in, tokens_out, cost_usd) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(crypto.randomUUID(), orgId, userId, type, repoId, model, tokensIn, tokensOut, costUsd).run();
}
