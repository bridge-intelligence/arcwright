import type { Env } from '../types';

interface AnalysisResult {
  xml: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  cost: number;
}

const CLAUDE_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';
const INPUT_COST_PER_M = 0.80;  // $/M input tokens
const OUTPUT_COST_PER_M = 4.00; // $/M output tokens

export async function analyzeWithClaude(
  env: Env,
  fullName: string,
  branch: string,
  githubToken: string,
): Promise<AnalysisResult> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const ghHeaders = {
    Authorization: `Bearer ${githubToken}`,
    'User-Agent': 'Arcwright',
  };

  // 1. Fetch repo tree
  const treeRes = await fetch(
    `https://api.github.com/repos/${fullName}/git/trees/${branch}?recursive=1`,
    { headers: ghHeaders }
  );
  if (!treeRes.ok) throw new Error(`Failed to fetch tree: ${treeRes.status}`);
  const tree = await treeRes.json() as { tree: Array<{ path: string; type: string; size?: number }> };

  // 2. Select MORE files than CF AI (Claude has 200K context)
  const priorityPatterns = [
    /^package\.json$/, /^build\.gradle/, /^pom\.xml$/, /^Cargo\.toml$/,
    /^docker-compose/, /^Dockerfile$/i, /\.env\.example$/,
    /^src\/(main|index|app)\./i, /settings\.gradle/, /wrangler\.toml$/,
    /tsconfig\.json$/, /^k8s\//, /^helm\//, /values\.yaml$/,
    /routes?\//i, /controllers?\//i, /services?\//i, /middleware\//i,
    /schema\.prisma$/, /migrations?\//i,
  ];

  const codeFiles = tree.tree.filter(f =>
    f.type === 'blob' && f.size && f.size < 80_000 &&
    /\.(ts|tsx|js|jsx|kt|java|py|go|rs|yaml|yml|json|toml|xml|gradle|prisma|dockerfile|sql)$/i.test(f.path) &&
    !f.path.includes('node_modules') && !f.path.includes('.lock') && !f.path.includes('dist/')
  );

  const scored = codeFiles.map(f => ({
    ...f,
    priority: priorityPatterns.some(p => p.test(f.path)) ? 0 : 1,
    depth: f.path.split('/').length,
  })).sort((a, b) => a.priority - b.priority || a.depth - b.depth);

  // 3. Fetch up to 30 files (Claude has 200K context — no subrequest limit since it's one API call)
  const filesToAnalyze = scored.slice(0, 30);
  const fileContents: Array<{ path: string; content: string }> = [];

  for (const file of filesToAnalyze) {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${fullName}/contents/${file.path}?ref=${branch}`,
        { headers: { ...ghHeaders, Accept: 'application/vnd.github.v3.raw' } }
      );
      if (res.ok) {
        const content = await res.text();
        fileContents.push({ path: file.path, content: content.slice(0, 8000) });
      }
    } catch {}
  }

  const fileTree = tree.tree
    .filter(f => f.type === 'blob')
    .map(f => f.path)
    .slice(0, 300)
    .join('\n');

  const fileSummaries = fileContents
    .map(f => `--- ${f.path} ---\n${f.content}`)
    .join('\n\n');

  // 4. Build comprehensive prompt (Claude can handle detailed instructions)
  const prompt = `Analyze this GitHub repository and produce a comprehensive architecture XML document.

Repository: ${fullName} (branch: ${branch})

COMPLETE FILE TREE:
${fileTree}

KEY SOURCE FILES:
${fileSummaries}

INSTRUCTIONS:
1. Identify EVERY service, module, database, cache, queue, and external integration
2. Group API endpoints into logical modules (auth, users, billing, etc.)
3. Include port numbers from configs (package.json scripts, docker-compose, k8s manifests)
4. List ALL connections with protocol and data flow description
5. Parse docker-compose.yml and k8s/ configs for infrastructure services — include replicas, resources, env vars
6. Identify data flows: Kafka topics (name, producers, consumers), Redis channels, event streams, webhooks
7. Define at least 3 user flows showing step-by-step service interactions
8. Flag real issues: missing tests, security concerns, dead code, missing docs
9. Extract tech stack from package.json/build.gradle/requirements.txt dependencies
10. If k8s/ or helm/ directories exist, extract deployment metadata (namespace, replicas, resources, probes)
11. Analyze from multiple perspectives: architecture, security, performance, operations

Output ONLY this XML structure (no markdown fences, no explanation):

<architecture repo="${fullName}" branch="${branch}" analyzed_at="${new Date().toISOString()}">
<summary>2-3 detailed sentences about what this project does</summary>
<tech_stack><technology name="NAME" category="language|framework|database|messaging|cache|tool|cloud|auth|ui|orm" /></tech_stack>
<services>
<service id="kebab-id" name="Name" type="api|worker|frontend|library|database|cache|queue|external_service|infrastructure" tier="frontend|gateway|business|data|infrastructure" port="NUMBER">
<description>Detailed description with responsibilities and tech</description>
<modules>
<module id="mod-id" name="Module Name" prefix="/route-prefix">
<endpoint method="GET|POST|PUT|PATCH|DELETE|PROCESS|CRON|CONSUME|PAGE" path="/full/path" description="what it does" />
</module>
</modules>
<databases><database type="postgresql|redis|neo4j|mongodb|sqlite|qdrant" name="db_name" purpose="what data" /></databases>
<deployment namespace="k8s-namespace" replicas="N" image="image:tag" />
</service>
</services>
<connections><connection from="svc-id" to="svc-id" protocol="http|kafka|redis|grpc|prisma|bolt|mongodb|websocket|binding|d1" direction="one-way|two-way" label="short label" description="what data flows and why" /></connections>
<data_flows>
<topic name="topic.name" type="kafka|redis|event" producers="svc-id" consumers="svc-id" description="what data and when" />
</data_flows>
<user_flows>
<flow id="flow-id" name="Flow Name">
<step order="1" service="svc-id" action="Detailed action description" />
</flow>
</user_flows>
<issues><issue type="no_tests|dangling_code|security_concern|missing_docs|circular_dependency|no_error_handling" severity="info|warning|error" title="Title" file_path="path/to/file">Detailed description of the issue</issue></issues>
<agent_insights>
<insight agent="architect" title="Insight title">Architectural observation or recommendation</insight>
<insight agent="security" title="Insight title">Security finding or recommendation</insight>
<insight agent="devops" title="Insight title">DevOps/operational observation</insight>
</agent_insights>
</architecture>`;

  // 5. Call Claude API
  const response = await fetch(CLAUDE_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8192,
      messages: [
        { role: 'user', content: prompt },
      ],
      system: 'You are an expert software architect. Output ONLY valid XML. No markdown fences, no commentary, no explanation. Start directly with <architecture>.',
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error ${response.status}: ${err.slice(0, 200)}`);
  }

  const data = await response.json() as {
    content: Array<{ type: string; text: string }>;
    usage: { input_tokens: number; output_tokens: number };
  };

  const xml = data.content[0]?.text || '';
  const inputTokens = data.usage.input_tokens;
  const outputTokens = data.usage.output_tokens;
  const cost = (inputTokens / 1_000_000) * INPUT_COST_PER_M + (outputTokens / 1_000_000) * OUTPUT_COST_PER_M;

  return { xml, inputTokens, outputTokens, model: MODEL, cost };
}
