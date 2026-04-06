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

// List available GitHub repos grouped by owner/org
repos.get('/github/available', async (c) => {
  const user = c.get('user');
  const dbUser = await c.env.DB.prepare('SELECT github_token, github_username FROM users WHERE id = ?').bind(user.sub).first();

  if (!dbUser?.github_token) {
    return c.json({ error: 'GitHub not connected' }, 400);
  }

  const ghHeaders = {
    Authorization: `Bearer ${dbUser.github_token}`,
    'User-Agent': 'Arcwright',
  };

  // Fetch user repos + org repos in parallel
  const [userReposRes, orgsRes] = await Promise.all([
    fetch('https://api.github.com/user/repos?sort=updated&per_page=100&affiliation=owner', { headers: ghHeaders }),
    fetch('https://api.github.com/user/orgs?per_page=100', { headers: ghHeaders }),
  ]);

  const allRepos: GitHubRepo[] = [];

  if (userReposRes.ok) {
    const userRepos: GitHubRepo[] = await userReposRes.json();
    allRepos.push(...userRepos);
  }

  // Fetch repos for each org
  if (orgsRes.ok) {
    const orgs = await orgsRes.json() as Array<{ login: string }>;
    const orgRepoFetches = orgs.map(org =>
      fetch(`https://api.github.com/orgs/${org.login}/repos?sort=updated&per_page=100`, { headers: ghHeaders })
        .then(r => r.ok ? r.json() as Promise<GitHubRepo[]> : [])
        .catch(() => [] as GitHubRepo[])
    );
    const orgRepoArrays = await Promise.all(orgRepoFetches);
    for (const repos of orgRepoArrays) {
      allRepos.push(...repos);
    }
  }

  // Deduplicate by id
  const seen = new Set<number>();
  const dedupedRepos = allRepos.filter(r => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });

  // Filter out already connected ones
  const connected = await c.env.DB.prepare(
    'SELECT github_repo_id FROM repos WHERE tenant_id = ?'
  ).bind(user.tenant_id).all();
  const connectedIds = new Set(connected.results.map(r => r.github_repo_id));

  // Group by owner
  const grouped: Record<string, Array<{
    id: number; name: string; full_name: string; default_branch: string;
    private: boolean; language: string | null; description: string | null; updated_at: string;
  }>> = {};

  for (const r of dedupedRepos) {
    if (connectedIds.has(r.id)) continue;
    const owner = r.full_name.split('/')[0];
    if (!grouped[owner]) grouped[owner] = [];
    grouped[owner].push({
      id: r.id, name: r.name, full_name: r.full_name,
      default_branch: r.default_branch, private: r.private,
      language: r.language, description: r.description, updated_at: r.updated_at,
    });
  }

  return c.json({
    username: dbUser.github_username,
    organizations: Object.entries(grouped).map(([owner, repos]) => ({
      name: owner,
      is_personal: owner === dbUser.github_username,
      repos,
    })),
  });
});

// Connect a GitHub repo (optionally to a project)
repos.post('/connect', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ full_name: string; project_id?: string }>();

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
    `INSERT INTO repos (id, tenant_id, project_id, connected_by, github_repo_id, full_name, name, default_branch, webhook_id, webhook_secret, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'analyzing')`
  ).bind(repoId, user.tenant_id, body.project_id || null, user.sub, ghRepo.id, ghRepo.full_name, ghRepo.name, ghRepo.default_branch, webhookId, webhookSecret).run();

  // Trigger analysis inline (8b model is fast enough)
  c.executionCtx.waitUntil(
    triggerAnalysis(c.env, repoId, user.tenant_id, ghRepo.full_name, ghRepo.default_branch, dbUser.github_token as string)
      .catch(err => console.error('Background analysis failed:', err))
  );

  return c.json({ id: repoId, status: 'analyzing' }, 201);
});

// Retry analysis for a failed repo (runs INLINE to surface errors)
repos.post('/:id/retry', async (c) => {
  const user = c.get('user');
  const repoId = c.req.param('id');

  const repo = await c.env.DB.prepare(
    'SELECT * FROM repos WHERE id = ? AND tenant_id = ?'
  ).bind(repoId, user.tenant_id).first();

  if (!repo) return c.json({ error: 'Not found' }, 404);

  const dbUser = await c.env.DB.prepare('SELECT github_token FROM users WHERE id = ?').bind(user.sub).first();
  if (!dbUser?.github_token) return c.json({ error: 'GitHub not connected' }, 400);

  // Reset status
  await c.env.DB.prepare(
    `UPDATE repos SET status = 'analyzing', updated_at = datetime('now') WHERE id = ?`
  ).bind(repoId).run();

  // Run inline (not waitUntil) so errors propagate
  try {
    await triggerAnalysis(c.env, repoId, user.tenant_id, repo.full_name as string, repo.default_branch as string, dbUser.github_token as string);
    return c.json({ ok: true, status: 'ready' });
  } catch (err) {
    return c.json({ ok: false, error: String(err) }, 500);
  }
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

// Get XML architecture doc from D1
repos.get('/:id/architecture.xml', async (c) => {
  const user = c.get('user');
  const repoId = c.req.param('id');

  const repo = await c.env.DB.prepare(
    'SELECT * FROM repos WHERE id = ? AND tenant_id = ?'
  ).bind(repoId, user.tenant_id).first();

  if (!repo) return c.json({ error: 'Not found' }, 404);

  const latestAnalysis = await c.env.DB.prepare(
    `SELECT xml_content FROM analyses WHERE repo_id = ? AND status = 'completed' ORDER BY created_at DESC LIMIT 1`
  ).bind(repoId).first();

  if (!latestAnalysis?.xml_content) {
    return c.json({ error: 'No analysis available' }, 404);
  }

  return new Response(latestAnalysis.xml_content as string, {
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

  // Get latest commit SHA for tracking
  let commitSha: string | null = null;
  try {
    const refRes = await fetch(`https://api.github.com/repos/${fullName}/git/ref/heads/${branch}`, {
      headers: { Authorization: `Bearer ${githubToken}`, 'User-Agent': 'Arcwright' },
    });
    if (refRes.ok) {
      const refData = await refRes.json() as { object: { sha: string } };
      commitSha = refData.object.sha;
    }
  } catch {}

  // Skip if already analyzed this commit
  if (commitSha) {
    const existing = await env.DB.prepare(
      `SELECT id FROM analyses WHERE repo_id = ? AND commit_sha = ? AND status = 'completed'`
    ).bind(repoId, commitSha).first();
    if (existing) {
      console.log(`Skipping analysis — commit ${commitSha.slice(0, 7)} already analyzed`);
      return;
    }
  }

  await env.DB.prepare(
    `INSERT INTO analyses (id, repo_id, tenant_id, branch, commit_sha, source, status, started_at)
     VALUES (?, ?, ?, ?, ?, 'cloudflare-ai', 'running', datetime('now'))`
  ).bind(analysisId, repoId, tenantId, branch, commitSha).run();

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

  // 2. Identify HIGH-PRIORITY files to analyze (max 15 to stay under 50 subrequest limit)
  // Priority: config files, entry points, build files, API routes
  const priorityPatterns = [
    /^package\.json$/, /^build\.gradle/, /^pom\.xml$/, /^Cargo\.toml$/,
    /^docker-compose/, /^Dockerfile$/, /^\.env\.example$/,
    /^src\/(main|index|app)\.(ts|tsx|js|kt|java|py|go)$/i,
    /settings\.gradle/, /wrangler\.toml$/, /tsconfig\.json$/,
  ];

  const codeFiles = tree.tree.filter(f =>
    f.type === 'blob' &&
    f.size && f.size < 50_000 &&
    /\.(ts|tsx|js|jsx|kt|java|py|go|rs|yaml|yml|json|toml|xml|gradle|pom|dockerfile)$/i.test(f.path) &&
    !f.path.includes('node_modules') && !f.path.includes('.lock') && !f.path.includes('dist/')
  );

  // Sort: priority files first, then by path depth (shallower = more important)
  const scored = codeFiles.map(f => ({
    ...f,
    priority: priorityPatterns.some(p => p.test(f.path)) ? 0 : 1,
    depth: f.path.split('/').length,
  })).sort((a, b) => a.priority - b.priority || a.depth - b.depth);

  // 3. Fetch content of key files (max 5 — keep fast and under limits)
  const filesToAnalyze = scored.slice(0, 5);
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
        fileContents.push({ path: file.path, content: content.slice(0, 4000) });
      }
    } catch {
      // Skip files that can't be fetched
    }
  }

  // 4. Build analysis prompt (keep it concise for speed)
  const fileTree = tree.tree
    .filter(f => f.type === 'blob')
    .map(f => f.path)
    .slice(0, 100) // Cap tree size for prompt speed
    .join('\n');

  const fileSummaries = fileContents
    .map(f => `--- ${f.path} ---\n${f.content.slice(0, 2000)}`)
    .join('\n\n');

  const prompt = `You are analyzing a GitHub repository to produce a DETAILED architecture document. Be thorough — list EVERY service, database, API endpoint, queue, external integration, and data flow you can identify from the file tree and source code.

Repository: ${fullName} (branch: ${branch})

FILE TREE (every file in the repo):
${fileTree}

SOURCE FILES:
${fileSummaries}

Instructions:
1. List ALL services/modules (APIs, workers, frontends, databases, caches, queues, external services)
2. For each service, include its port, tech stack, and what it does
3. List ALL connections — how services talk to each other (HTTP, gRPC, Kafka, Redis, database, WebSocket)
4. Include the database name/type for each DB connection
5. Flag issues: dead code, missing tests, circular deps, no error handling, security concerns

Output ONLY this XML (no markdown fences, no commentary):
<architecture repo="${fullName}" branch="${branch}" analyzed_at="${new Date().toISOString()}">
<summary>2-3 sentence description of what this project does</summary>
<tech_stack>
<technology name="NAME" category="language|framework|database|messaging|cache|tool|cloud" />
</tech_stack>
<services>
<service id="kebab-id" name="Human Name" type="api|worker|frontend|library|database|cache|queue" tier="frontend|gateway|business|data|infrastructure">
<description>What this service does, its port, key responsibilities</description>
<endpoints>
<endpoint method="GET|POST|PUT|DELETE" path="/api/..." description="what it does" />
</endpoints>
<databases>
<database type="postgresql|redis|neo4j|mongodb" name="db_name" purpose="what data" />
</databases>
</service>
</services>
<connections>
<connection from="service-id" to="service-id" protocol="http|kafka|redis|grpc|websocket|jdbc" direction="one-way|two-way" label="short label" description="what data flows" />
</connections>
<issues>
<issue type="dangling_code|circular_dependency|missing_docs|dead_import|no_tests|security_concern|no_error_handling" severity="info|warning|error" title="Short title" file_path="path/to/file">
Description of the issue and why it matters
</issue>
</issues>
</architecture>`;

  // 5. Call Workers AI (fp8 quantized for speed)
  let xmlContent: string;
  try {
    const aiResponse = await env.AI.run('@cf/meta/llama-3.1-8b-instruct-fp8', {
      messages: [
        { role: 'system', content: 'You are a software architect. Output ONLY valid XML. No markdown fences, no explanation.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 3072,
    });
    xmlContent = (aiResponse as { response?: string }).response || '';
    if (!xmlContent || xmlContent.length < 50) {
      xmlContent = `<architecture repo="${fullName}" branch="${branch}" analyzed_at="${new Date().toISOString()}"><summary>Analysis produced minimal output — retry recommended</summary><tech_stack /><services /><connections /><issues /></architecture>`;
    }
  } catch (aiErr) {
    console.error('AI call failed:', aiErr);
    xmlContent = `<architecture repo="${fullName}" branch="${branch}" analyzed_at="${new Date().toISOString()}"><summary>AI analysis failed: ${String(aiErr).slice(0, 100)}</summary><tech_stack /><services /><connections /><issues /></architecture>`;
  }

  // 6. Parse issue counts from XML
  const servicesMatch = xmlContent.match(/<service /g);
  const issuesMatch = xmlContent.match(/<issue /g);
  const servicesCount = servicesMatch ? servicesMatch.length : 0;
  const issuesCount = issuesMatch ? issuesMatch.length : 0;

  // 7. Extract and store issues
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

  // 8. Update analysis record (store XML inline in D1)
  await env.DB.prepare(
    `UPDATE analyses SET status = 'completed', xml_content = ?, services_count = ?, issues_count = ?,
     summary = ?, completed_at = datetime('now') WHERE id = ?`
  ).bind(xmlContent, servicesCount, issuesCount, `${servicesCount} services, ${issuesCount} issues found`, analysisId).run();

  // 9. Push architecture docs to arcwright branch in the repo
  try {
    await pushToArcwrightBranch(fullName, branch, xmlContent, servicesCount, issuesCount, githubToken);
  } catch (err) {
    console.error('Failed to push to arcwright branch:', err);
    // Non-fatal — analysis still succeeded
  }

  // 10. Update repo status
  await env.DB.prepare(
    `UPDATE repos SET status = 'ready', last_analyzed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
  ).bind(repoId).run();
}

// Push generated architecture docs to an `arcwright` branch in the repo
async function pushToArcwrightBranch(
  fullName: string, baseBranch: string, xmlContent: string,
  servicesCount: number, issuesCount: number, githubToken: string
) {
  const ghHeaders = {
    Authorization: `Bearer ${githubToken}`,
    'User-Agent': 'Arcwright',
    'Content-Type': 'application/json',
  };

  const branchName = 'arcwright';
  const now = new Date().toISOString();

  // 1. Get the base branch SHA
  const baseRef = await fetch(`https://api.github.com/repos/${fullName}/git/ref/heads/${baseBranch}`, {
    headers: ghHeaders,
  });
  if (!baseRef.ok) throw new Error(`Failed to get base ref: ${baseRef.status}`);
  const baseData = await baseRef.json() as { object: { sha: string } };
  const baseSha = baseData.object.sha;

  // 2. Check if arcwright branch exists, create if not
  const branchCheck = await fetch(`https://api.github.com/repos/${fullName}/git/ref/heads/${branchName}`, {
    headers: ghHeaders,
  });

  if (!branchCheck.ok) {
    // Create the branch
    const createRes = await fetch(`https://api.github.com/repos/${fullName}/git/refs`, {
      method: 'POST',
      headers: ghHeaders,
      body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: baseSha }),
    });
    if (!createRes.ok) throw new Error(`Failed to create branch: ${createRes.status}`);
  }

  // 3. Build the README.md for the arcwright branch
  const readmeContent = `# Architecture Documentation

> Auto-generated by [Arcwright](https://arcwright.pages.dev) on ${now}

## Summary

- **Repository**: ${fullName}
- **Base branch**: ${baseBranch}
- **Services detected**: ${servicesCount}
- **Issues found**: ${issuesCount}

## Files

| File | Description |
|------|-------------|
| \`architecture.xml\` | Full architecture document (services, connections, issues) |
| \`README.md\` | This file |

## How to use

The \`architecture.xml\` file contains a machine-readable description of this repository's architecture including:

- **Tech stack** — languages, frameworks, databases, tools
- **Services** — each service with endpoints, dependencies, and descriptions
- **Connections** — how services communicate (HTTP, Kafka, gRPC, etc.)
- **Issues** — dangling code, circular dependencies, missing docs, security concerns

---

*This branch is managed by Arcwright. It updates automatically on each push to \`${baseBranch}\`.*
`;

  // 4. Create blobs for each file
  const files = [
    { path: 'architecture.xml', content: xmlContent },
    { path: 'README.md', content: readmeContent },
  ];

  const blobShas: Array<{ path: string; sha: string }> = [];
  for (const file of files) {
    const blobRes = await fetch(`https://api.github.com/repos/${fullName}/git/blobs`, {
      method: 'POST',
      headers: ghHeaders,
      body: JSON.stringify({ content: file.content, encoding: 'utf-8' }),
    });
    if (!blobRes.ok) throw new Error(`Failed to create blob for ${file.path}: ${blobRes.status}`);
    const blob = await blobRes.json() as { sha: string };
    blobShas.push({ path: file.path, sha: blob.sha });
  }

  // 5. Create a tree with the new files
  const treeRes = await fetch(`https://api.github.com/repos/${fullName}/git/trees`, {
    method: 'POST',
    headers: ghHeaders,
    body: JSON.stringify({
      base_tree: baseSha,
      tree: blobShas.map(b => ({
        path: b.path,
        mode: '100644',
        type: 'blob',
        sha: b.sha,
      })),
    }),
  });
  if (!treeRes.ok) throw new Error(`Failed to create tree: ${treeRes.status}`);
  const treeData = await treeRes.json() as { sha: string };

  // 6. Create a commit
  const commitRes = await fetch(`https://api.github.com/repos/${fullName}/git/commits`, {
    method: 'POST',
    headers: ghHeaders,
    body: JSON.stringify({
      message: `docs(arcwright): update architecture docs\n\n${servicesCount} services, ${issuesCount} issues detected\nGenerated at ${now}`,
      tree: treeData.sha,
      parents: [baseSha],
      author: {
        name: 'Arcwright',
        email: 'bot@arcwright.dev',
        date: now,
      },
    }),
  });
  if (!commitRes.ok) throw new Error(`Failed to create commit: ${commitRes.status}`);
  const commitData = await commitRes.json() as { sha: string };

  // 7. Update the branch ref
  await fetch(`https://api.github.com/repos/${fullName}/git/refs/heads/${branchName}`, {
    method: 'PATCH',
    headers: ghHeaders,
    body: JSON.stringify({ sha: commitData.sha, force: true }),
  });
}

export { triggerAnalysis };
export default repos;
