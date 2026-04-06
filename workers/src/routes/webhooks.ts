import { Hono } from 'hono';
import type { Env } from '../types';
import { triggerAnalysis } from './repos';

const webhooks = new Hono<{ Bindings: Env }>();

// GitHub webhook receiver — triggers re-analysis on push
webhooks.post('/github', async (c) => {
  const event = c.req.header('X-GitHub-Event');
  if (event !== 'push') {
    return c.json({ ignored: true, reason: `event: ${event}` });
  }

  const signature = c.req.header('X-Hub-Signature-256');
  const body = await c.req.text();

  // Parse payload
  let payload: {
    ref: string;
    after: string;
    repository: { full_name: string };
  };
  try {
    payload = JSON.parse(body);
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  const fullName = payload.repository.full_name;
  const branch = payload.ref.replace('refs/heads/', '');
  const commitSha = payload.after;

  // Find the repo in our DB
  const repo = await c.env.DB.prepare(
    'SELECT r.*, u.github_token FROM repos r JOIN users u ON u.id = r.connected_by WHERE r.full_name = ?'
  ).bind(fullName).first();

  if (!repo) {
    return c.json({ ignored: true, reason: 'repo not connected' });
  }

  // Verify webhook signature
  if (repo.webhook_secret && signature) {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(repo.webhook_secret as string),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
    const expected = 'sha256=' + Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');

    if (signature !== expected) {
      return c.json({ error: 'Invalid signature' }, 401);
    }
  }

  // Only analyze default branch pushes
  if (branch !== repo.default_branch) {
    return c.json({ ignored: true, reason: `branch ${branch} is not default` });
  }

  // Skip if we already analyzed this commit
  const existingAnalysis = await c.env.DB.prepare(
    `SELECT id FROM analyses WHERE repo_id = ? AND commit_sha = ? AND status = 'completed'`
  ).bind(repo.id, commitSha).first();
  if (existingAnalysis) {
    return c.json({ ignored: true, reason: `commit ${commitSha.slice(0, 7)} already analyzed` });
  }

  if (!repo.github_token) {
    return c.json({ error: 'No GitHub token available' }, 500);
  }

  // Trigger re-analysis (Cloudflare AI — fast, on-commit)
  await triggerAnalysis(
    c.env,
    repo.id as string,
    repo.tenant_id as string,
    fullName,
    branch,
    repo.github_token as string
  );

  return c.json({
    ok: true,
    repo: fullName,
    branch,
    commit: commitSha,
    message: 'Analysis triggered',
  });
});

export default webhooks;
