import { Hono } from 'hono';
import type { Env, GitHubRepo } from '../types';
import { authMiddleware } from '../middleware/auth';

const repos = new Hono<{ Bindings: Env }>();
repos.use('*', authMiddleware);

// List connected repos for tenant
repos.get('/', async (c) => {
  const user = c.get('user');
  const results = await c.env.DB.prepare(
    `SELECT r.*,
       (SELECT COUNT(*) FROM analyses a WHERE a.repo_id = r.id AND a.status = 'completed') as analysis_count,
       (SELECT a.services_count FROM analyses a WHERE a.repo_id = r.id AND a.status = 'completed' ORDER BY a.created_at DESC LIMIT 1) as services,
       (SELECT a.issues_count FROM analyses a WHERE a.repo_id = r.id AND a.status = 'completed' ORDER BY a.created_at DESC LIMIT 1) as issues
     FROM repos r WHERE r.tenant_id = ? ORDER BY r.created_at DESC`
  ).bind(user.tenant_id).all();

  return c.json(results.results);
});

// List available GitHub repos (not yet connected)
repos.get('/github/available', async (c) => {
  const user = c.get('user');
  const dbUser = await c.env.DB.prepare('SELECT github_token FROM users WHERE id = ?').bind(user.sub).first();

  if (!dbUser?.github_token) {
    return c.json({ error: 'GitHub not connected' }, 400);
  }

  // Fetch repos from GitHub
  const ghRes = await fetch('https://api.github.com/user/repos?sort=updated&per_page=100', {
    headers: {
      Authorization: `Bearer ${dbUser.github_token}`,
      'User-Agent': 'Arcwright',
    },
  });

  if (!ghRes.ok) {
    return c.json({ error: 'Failed to fetch GitHub repos' }, 502);
  }

  const ghRepos: GitHubRepo[] = await ghRes.json();

  // Filter out already connected ones
  const connected = await c.env.DB.prepare(
    'SELECT github_repo_id FROM repos WHERE tenant_id = ?'
  ).bind(user.tenant_id).all();
  const connectedIds = new Set(connected.results.map(r => r.github_repo_id));

  const available = ghRepos
    .filter(r => !connectedIds.has(r.id))
    .map(r => ({
      id: r.id,
      name: r.name,
      full_name: r.full_name,
      default_branch: r.default_branch,
      private: r.private,
      language: r.language,
      description: r.description,
      updated_at: r.updated_at,
    }));

  return c.json(available);
});

// Connect a GitHub repo
repos.post('/connect', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ full_name: string }>();

  if (!body.full_name) {
    return c.json({ error: 'full_name required' }, 400);
  }

  const dbUser = await c.env.DB.prepare('SELECT github_token FROM users WHERE id = ?').bind(user.sub).first();
  if (!dbUser?.github_token) {
    return c.json({ error: 'GitHub not connected' }, 400);
  }

  // Verify repo exists and get details
  const ghRes = await fetch(`https://api.github.com/repos/${body.full_name}`, {
    headers: {
      Authorization: `Bearer ${dbUser.github_token}`,
      'User-Agent': 'Arcwright',
    },
  });

  if (!ghRes.ok) {
    return c.json({ error: 'Repository not found or no access' }, 404);
  }

  const ghRepo: GitHubRepo = await ghRes.json();

  // Create webhook for live sync
  const webhookSecret = crypto.randomUUID();
  let webhookId: number | null = null;

  try {
    const hookRes = await fetch(`https://api.github.com/repos/${body.full_name}/hooks`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${dbUser.github_token}`,
        'User-Agent': 'Arcwright',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'web',
        active: true,
        events: ['push'],
        config: {
          url: `${c.env.APP_URL}/api/webhooks/github`,
          content_type: 'json',
          secret: webhookSecret,
        },
      }),
    });

    if (hookRes.ok) {
      const hook = await hookRes.json() as { id: number };
      webhookId = hook.id;
    }
  } catch (err) {
    console.error('Failed to create webhook:', err);
  }

  // Save repo
  const repoId = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO repos (id, tenant_id, connected_by, github_repo_id, full_name, name, default_branch, webhook_id, webhook_secret, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'analyzing')`
  ).bind(repoId, user.tenant_id, user.sub, ghRepo.id, ghRepo.full_name, ghRepo.name, ghRepo.default_branch, webhookId, webhookSecret).run();

  // Trigger initial analysis
  await triggerAnalysis(c.env, repoId, user.tenant_id, ghRepo.full_name, ghRepo.default_branch, dbUser.github_token as string);

  return c.json({ id: repoId, status: 'analyzing' }, 201);
});

// Get single repo with latest analysis
repos.get('/:id', async (c) => {
  const user = c.get('user');
  const repoId = c.req.param('id');

  const repo = await c.env.DB.prepare(
    'SELECT * FROM repos WHERE id = ? AND tenant_id = ?'
  ).bind(repoId, user.tenant_id).first();

  if (!repo) return c.json({ error: 'Not found' }, 404);

  const latestAnalysis = await c.env.DB.prepare(
    `SELECT * FROM analyses WHERE repo_id = ? ORDER BY created_at DESC LIMIT 1`
  ).bind(repoId).first();

  const issues = latestAnalysis
    ? (await c.env.DB.prepare(
        'SELECT * FROM analysis_issues WHERE analysis_id = ? ORDER BY severity DESC'
      ).bind(latestAnalysis.id).all()).results
    : [];

  return c.json({ ...repo, latest_analysis: latestAnalysis, issues });
});

// Get XML architecture doc from R2
repos.get('/:id/architecture.xml', async (c) => {
  const user = c.get('user');
  const repoId = c.req.param('id');

  const repo = await c.env.DB.prepare(
    'SELECT * FROM repos WHERE id = ? AND tenant_id = ?'
  ).bind(repoId, user.tenant_id).first();

  if (!repo) return c.json({ error: 'Not found' }, 404);

  const latestAnalysis = await c.env.DB.prepare(
    `SELECT xml_key FROM analyses WHERE repo_id = ? AND status = 'completed' ORDER BY created_at DESC LIMIT 1`
  ).bind(repoId).first();

  if (!latestAnalysis?.xml_key) {
    return c.json({ error: 'No analysis available' }, 404);
  }

  const obj = await c.env.STORAGE.get(latestAnalysis.xml_key as string);
  if (!obj) return c.json({ error: 'XML not found in storage' }, 404);

  return new Response(obj.body, {
    headers: { 'Content-Type': 'application/xml' },
  });
});

// Disconnect repo
repos.delete('/:id', async (c) => {
  const user = c.get('user');
  const repoId = c.req.param('id');

  const repo = await c.env.DB.prepare(
    'SELECT * FROM repos WHERE id = ? AND tenant_id = ?'
  ).bind(repoId, user.tenant_id).first();

  if (!repo) return c.json({ error: 'Not found' }, 404);

  // Remove webhook if exists
  if (repo.webhook_id) {
    const dbUser = await c.env.DB.prepare('SELECT github_token FROM users WHERE id = ?').bind(user.sub).first();
    if (dbUser?.github_token) {
      await fetch(`https://api.github.com/repos/${repo.full_name}/hooks/${repo.webhook_id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${dbUser.github_token}`,
          'User-Agent': 'Arcwright',
        },
      }).catch(() => {});
    }
  }

  // Delete analyses, issues, and repo
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM analysis_issues WHERE repo_id = ?').bind(repoId),
    c.env.DB.prepare('DELETE FROM analyses WHERE repo_id = ?').bind(repoId),
    c.env.DB.prepare('DELETE FROM repos WHERE id = ?').bind(repoId),
  ]);

  return c.json({ ok: true });
});

// --- Helper: trigger analysis ---
async function triggerAnalysis(env: Env, repoId: string, tenantId: string, fullName: string, branch: string, githubToken: string) {
  const analysisId = crypto.randomUUID();

  await env.DB.prepare(
    `INSERT INTO analyses (id, repo_id, tenant_id, branch, status, started_at)
     VALUES (?, ?, ?, ?, 'running', datetime('now'))`
  ).bind(analysisId, repoId, tenantId, branch).run();

  // Run analysis asynchronously via waitUntil if available, otherwise inline
  try {
    await runAnalysis(env, analysisId, repoId, tenantId, fullName, branch, githubToken);
  } catch (err) {
    console.error('Analysis failed:', err);
    await env.DB.prepare(
      `UPDATE analyses SET status = 'failed', error = ?, completed_at = datetime('now') WHERE id = ?`
    ).bind(String(err), analysisId).run();
    await env.DB.prepare(
      `UPDATE repos SET status = 'error', updated_at = datetime('now') WHERE id = ?`
    ).bind(repoId).run();
  }
}

async function runAnalysis(env: Env, analysisId: string, repoId: string, tenantId: string, fullName: string, branch: string, githubToken: string) {
  // 1. Fetch repo tree from GitHub API
  const treeRes = await fetch(
    `https://api.github.com/repos/${fullName}/git/trees/${branch}?recursive=1`,
    {
      headers: {
        Authorization: `Bearer ${githubToken}`,
        'User-Agent': 'Arcwright',
      },
    }
  );

  if (!treeRes.ok) throw new Error(`Failed to fetch tree: ${treeRes.status}`);
  const tree = await treeRes.json() as { tree: Array<{ path: string; type: string; size?: number; sha: string }> };

  // 2. Identify key files to analyze
  const codeFiles = tree.tree.filter(f =>
    f.type === 'blob' &&
    f.size && f.size < 100_000 &&
    /\.(ts|tsx|js|jsx|kt|java|py|go|rs|yaml|yml|json|toml|xml|gradle|pom|dockerfile|docker-compose)$/i.test(f.path) &&
    !f.path.includes('node_modules') &&
    !f.path.includes('.lock') &&
    !f.path.includes('dist/')
  );

  // 3. Fetch content of key files (batched, max 50)
  const filesToAnalyze = codeFiles.slice(0, 50);
  const fileContents: Array<{ path: string; content: string }> = [];

  for (const file of filesToAnalyze) {
    try {
      const contentRes = await fetch(
        `https://api.github.com/repos/${fullName}/contents/${file.path}?ref=${branch}`,
        {
          headers: {
            Authorization: `Bearer ${githubToken}`,
            'User-Agent': 'Arcwright',
            Accept: 'application/vnd.github.v3.raw',
          },
        }
      );
      if (contentRes.ok) {
        const content = await contentRes.text();
        fileContents.push({ path: file.path, content: content.slice(0, 5000) });
      }
    } catch {
      // Skip files that can't be fetched
    }
  }

  // 4. Build analysis prompt
  const fileTree = tree.tree
    .filter(f => f.type === 'blob')
    .map(f => f.path)
    .join('\n');

  const fileSummaries = fileContents
    .map(f => `--- ${f.path} ---\n${f.content}`)
    .join('\n\n');

  const prompt = `You are an expert software architect. Analyze this repository and generate a comprehensive architecture document in XML format.

Repository: ${fullName} (branch: ${branch})

FILE TREE:
${fileTree}

KEY FILE CONTENTS:
${fileSummaries}

Generate XML with this structure:
<architecture repo="${fullName}" branch="${branch}" analyzed_at="ISO_DATE">
  <summary>Brief description of the project</summary>
  <tech_stack>
    <technology name="" category="language|framework|database|messaging|tool" />
  </tech_stack>
  <services>
    <service id="" name="" type="api|worker|frontend|library|database" tier="frontend|gateway|business|infrastructure">
      <description>What this service does</description>
      <endpoints>
        <endpoint method="GET|POST|..." path="/..." description="..." />
      </endpoints>
      <dependencies>
        <dependency service_id="" protocol="http|kafka|grpc|database" description="..." />
      </dependencies>
    </service>
  </services>
  <connections>
    <connection from="" to="" protocol="" direction="one-way|two-way" description="..." />
  </connections>
  <issues>
    <issue type="dangling_code|circular_dependency|missing_docs|dead_import|orphan_service|security_concern" severity="info|warning|error" title="" file_path="" line="">
      Description of the issue
    </issue>
  </issues>
</architecture>

Be thorough. Identify ALL services, their connections, and any architectural issues like dangling code, circular dependencies, orphaned files, missing documentation, or security concerns.`;

  // 5. Call Workers AI
  const aiResponse = await env.AI.run('@cf/meta/llama-3.1-70b-instruct', {
    messages: [
      { role: 'system', content: 'You are an expert software architect. Output only valid XML, no markdown fences.' },
      { role: 'user', content: prompt },
    ],
    max_tokens: 4096,
  });

  const xmlContent = (aiResponse as { response?: string }).response || '<architecture><error>No response from AI</error></architecture>';

  // 6. Store XML in R2
  const xmlKey = `analyses/${tenantId}/${repoId}/${analysisId}.xml`;
  await env.STORAGE.put(xmlKey, xmlContent, {
    httpMetadata: { contentType: 'application/xml' },
    customMetadata: { repo: fullName, branch, analysisId },
  });

  // 7. Parse issue counts from XML
  const servicesMatch = xmlContent.match(/<service /g);
  const issuesMatch = xmlContent.match(/<issue /g);
  const servicesCount = servicesMatch ? servicesMatch.length : 0;
  const issuesCount = issuesMatch ? issuesMatch.length : 0;

  // 8. Extract and store issues
  const issueRegex = /<issue\s+type="([^"]*?)"\s+severity="([^"]*?)"\s+title="([^"]*?)"(?:\s+file_path="([^"]*?)")?(?:\s+line="([^"]*?)")?[^>]*>([\s\S]*?)<\/issue>/g;
  let match;
  while ((match = issueRegex.exec(xmlContent)) !== null) {
    await env.DB.prepare(
      `INSERT INTO analysis_issues (id, analysis_id, repo_id, type, severity, title, description, file_path, line_number)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      crypto.randomUUID(), analysisId, repoId,
      match[1], match[2], match[3], match[6]?.trim() || null,
      match[4] || null, match[5] ? parseInt(match[5]) : null
    ).run();
  }

  // 9. Update analysis record
  await env.DB.prepare(
    `UPDATE analyses SET status = 'completed', xml_key = ?, services_count = ?, issues_count = ?,
     summary = ?, completed_at = datetime('now') WHERE id = ?`
  ).bind(xmlKey, servicesCount, issuesCount, `${servicesCount} services, ${issuesCount} issues found`, analysisId).run();

  // 10. Update repo status
  await env.DB.prepare(
    `UPDATE repos SET status = 'ready', last_analyzed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
  ).bind(repoId).run();
}

export { triggerAnalysis };
export default repos;
