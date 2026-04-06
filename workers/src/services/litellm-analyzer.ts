import type { Env } from '../types';

interface AnalysisResult {
  xml: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  cost: number;
}

// LiteLLM proxy on your ai-stack (OpenAI-compatible API)
const LITELLM_URL = 'https://ai-api.service.d.bridgeintelligence.ltd/v1/chat/completions';
const LITELLM_KEY = 'sk-litellm-bridge-master-2026';
const MODEL = 'local-fast'; // qwen3.5-4b — free, on-prem, ~120 RPM

export async function analyzeWithLiteLLM(
  fullName: string,
  branch: string,
  githubToken: string,
): Promise<AnalysisResult> {
  const ghHeaders = { Authorization: `Bearer ${githubToken}`, 'User-Agent': 'Arcwright' };

  // 1. Fetch repo tree
  const treeRes = await fetch(`https://api.github.com/repos/${fullName}/git/trees/${branch}?recursive=1`, { headers: ghHeaders });
  if (!treeRes.ok) throw new Error(`Failed to fetch tree: ${treeRes.status}`);
  const tree = await treeRes.json() as { tree: Array<{ path: string; type: string; size?: number }> };

  // 2. Select files (similar to CF AI — limited by local model context)
  const priorityPatterns = [
    /^package\.json$/, /^build\.gradle/, /^docker-compose/, /^Dockerfile$/i,
    /^src\/(main|index|app)\./i, /tsconfig\.json$/, /wrangler\.toml$/,
  ];

  const codeFiles = tree.tree.filter(f =>
    f.type === 'blob' && f.size && f.size < 50_000 &&
    /\.(ts|tsx|js|jsx|kt|java|py|go|yaml|yml|json|toml|gradle|prisma)$/i.test(f.path) &&
    !f.path.includes('node_modules') && !f.path.includes('.lock') && !f.path.includes('dist/')
  );

  const scored = codeFiles.map(f => ({
    ...f,
    priority: priorityPatterns.some(p => p.test(f.path)) ? 0 : 1,
    depth: f.path.split('/').length,
  })).sort((a, b) => a.priority - b.priority || a.depth - b.depth);

  // 3. Fetch 10 files (local model has 32K context)
  const filesToAnalyze = scored.slice(0, 10);
  const fileContents: Array<{ path: string; content: string }> = [];

  for (const file of filesToAnalyze) {
    try {
      const res = await fetch(`https://api.github.com/repos/${fullName}/contents/${file.path}?ref=${branch}`, {
        headers: { ...ghHeaders, Accept: 'application/vnd.github.v3.raw' },
      });
      if (res.ok) {
        const content = await res.text();
        fileContents.push({ path: file.path, content: content.slice(0, 5000) });
      }
    } catch {}
  }

  const fileTree = tree.tree.filter(f => f.type === 'blob').map(f => f.path).slice(0, 150).join('\n');
  const fileSummaries = fileContents.map(f => `--- ${f.path} ---\n${f.content}`).join('\n\n');

  const prompt = `Analyze this repo and output XML architecture doc.

Repo: ${fullName} (branch: ${branch})

FILES:
${fileTree}

SOURCE:
${fileSummaries}

Output ONLY valid XML (no markdown, no commentary):
<architecture repo="${fullName}" branch="${branch}" analyzed_at="${new Date().toISOString()}">
<summary>Description</summary>
<tech_stack><technology name="NAME" category="language|framework|database|tool" /></tech_stack>
<services>
<service id="id" name="Name" type="api|worker|frontend|database|cache|external_service" tier="frontend|gateway|business|data|infrastructure" port="NUM">
<description>What it does</description>
<modules><module id="id" name="Name" prefix="/prefix"><endpoint method="GET" path="/path" description="what" /></module></modules>
<databases><database type="postgresql" name="db" purpose="what" /></databases>
</service>
</services>
<connections><connection from="id" to="id" protocol="http|kafka|redis" direction="one-way|two-way" label="label" description="what flows" /></connections>
<user_flows><flow id="id" name="Name"><step order="1" service="id" action="What happens" /></flow></user_flows>
<issues><issue type="no_tests|security_concern" severity="warning" title="Title">Description</issue></issues>
</architecture>`;

  // 4. Call LiteLLM
  const response = await fetch(LITELLM_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LITELLM_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: 'You are a software architect. Output ONLY valid XML. No markdown.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 3072,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`LiteLLM error ${response.status}: ${err.slice(0, 200)}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };

  const xml = data.choices[0]?.message?.content || '';
  const inputTokens = data.usage?.prompt_tokens || 0;
  const outputTokens = data.usage?.completion_tokens || 0;

  return { xml, inputTokens, outputTokens, model: MODEL, cost: 0 }; // Free — on-prem
}
