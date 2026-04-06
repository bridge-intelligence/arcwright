import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ArrowLeft,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Loader2,
  FileCode2,
  Server,
  Link2,
  ExternalLink,
  GitBranch,
} from 'lucide-react';
import { reposApi, type RepoDetail } from '../services/api';

interface ParsedArch {
  summary: string;
  techStack: Array<{ name: string; category: string }>;
  services: Array<{ id: string; name: string; type: string; tier: string; description: string }>;
  connections: Array<{ from: string; to: string; protocol: string; direction: string; description: string }>;
  issues: Array<{ type: string; severity: string; title: string; description: string; filePath?: string }>;
}

function parseArchXml(xml: string): ParsedArch {
  const result: ParsedArch = { summary: '', techStack: [], services: [], connections: [], issues: [] };

  const summaryMatch = xml.match(/<summary>([\s\S]*?)<\/summary>/);
  if (summaryMatch) result.summary = summaryMatch[1].trim();

  const techRegex = /<technology\s+name="([^"]*?)"\s+category="([^"]*?)"\s*\/?\s*>/g;
  let m;
  while ((m = techRegex.exec(xml)) !== null) {
    result.techStack.push({ name: m[1], category: m[2] });
  }

  const svcRegex = /<service\s+id="([^"]*?)"\s+name="([^"]*?)"\s+type="([^"]*?)"\s+tier="([^"]*?)"[^>]*>([\s\S]*?)<\/service>/g;
  while ((m = svcRegex.exec(xml)) !== null) {
    const descMatch = m[5].match(/<description>([\s\S]*?)<\/description>/);
    result.services.push({ id: m[1], name: m[2], type: m[3], tier: m[4], description: descMatch?.[1]?.trim() || '' });
  }

  const connRegex = /<connection\s+from="([^"]*?)"\s+to="([^"]*?)"\s+protocol="([^"]*?)"\s+direction="([^"]*?)"\s+description="([^"]*?)"\s*\/?\s*>/g;
  while ((m = connRegex.exec(xml)) !== null) {
    result.connections.push({ from: m[1], to: m[2], protocol: m[3], direction: m[4], description: m[5] });
  }

  const issueRegex = /<issue\s+type="([^"]*?)"\s+severity="([^"]*?)"\s+title="([^"]*?)"(?:\s+file_path="([^"]*?)")?[^>]*>([\s\S]*?)<\/issue>/g;
  while ((m = issueRegex.exec(xml)) !== null) {
    result.issues.push({ type: m[1], severity: m[2], title: m[3], description: m[5]?.trim() || '', filePath: m[4] });
  }

  return result;
}

const tierColors: Record<string, string> = {
  frontend: '#06b6d4', gateway: '#3b82f6', business: '#a855f7', infrastructure: '#6b7280',
  api: '#3b82f6', worker: '#f97316', library: '#8b5cf6', database: '#22c55e',
};

const severityColors: Record<string, string> = {
  error: '#ef4444', warning: '#eab308', info: '#3b82f6',
};

export default function RepoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [repo, setRepo] = useState<RepoDetail | null>(null);
  const [xml, setXml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [activeTab, setActiveTab] = useState<'graph' | 'issues' | 'xml'>('graph');
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const [repoData, xmlData] = await Promise.all([
        reposApi.get(id),
        reposApi.getArchitectureXml(id).catch(() => null),
      ]);
      setRepo(repoData);
      setXml(xmlData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRetry = async () => {
    if (!id) return;
    setRetrying(true);
    try {
      await reposApi.retry(id);
      // Poll for completion
      const poll = setInterval(async () => {
        const r = await reposApi.get(id);
        if (r.status === 'ready' || r.status === 'error') {
          clearInterval(poll);
          loadData();
          setRetrying(false);
        }
      }, 3000);
    } catch { setRetrying(false); }
  };

  const parsed = useMemo(() => xml ? parseArchXml(xml) : null, [xml]);

  // Build ReactFlow nodes/edges from parsed architecture
  const { nodes, edges } = useMemo(() => {
    if (!parsed || parsed.services.length === 0) return { nodes: [] as Node[], edges: [] as Edge[] };

    const tierGroups: Record<string, typeof parsed.services> = {};
    for (const svc of parsed.services) {
      const t = svc.tier || svc.type || 'other';
      if (!tierGroups[t]) tierGroups[t] = [];
      tierGroups[t].push(svc);
    }

    const tiers = Object.keys(tierGroups);
    const nodes: Node[] = [];

    tiers.forEach((tier, ti) => {
      const svcs = tierGroups[tier];
      svcs.forEach((svc, si) => {
        nodes.push({
          id: svc.id || svc.name,
          position: { x: 100 + si * 260, y: 80 + ti * 200 },
          data: {
            label: svc.name,
            type: svc.type,
            tier: svc.tier,
            description: svc.description,
          },
          style: {
            background: `${tierColors[svc.tier] || tierColors[svc.type] || '#52525b'}15`,
            border: `1px solid ${tierColors[svc.tier] || tierColors[svc.type] || '#52525b'}50`,
            borderRadius: '12px',
            padding: '12px 16px',
            color: '#fff',
            fontSize: '12px',
            fontWeight: 600,
            minWidth: '140px',
          },
        });
      });
    });

    const edges: Edge[] = parsed.connections.map((conn, i) => ({
      id: `e-${i}`,
      source: conn.from,
      target: conn.to,
      label: conn.protocol,
      type: 'smoothstep',
      animated: conn.protocol === 'kafka' || conn.protocol === 'events',
      style: { stroke: tierColors[conn.protocol] || '#52525b', strokeWidth: 1.5 },
      labelStyle: { fill: '#a1a1aa', fontSize: 10 },
    }));

    return { nodes, edges };
  }, [parsed]);

  if (loading) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
    </div>
  );

  if (error || !repo) return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-sm text-red-400">
      {error || 'Repo not found'}
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      {/* Nav */}
      <nav className="border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/dashboard')} className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white">
              <ArrowLeft className="w-3.5 h-3.5" /> Dashboard
            </button>
            <span className="text-zinc-700">/</span>
            <span className="text-sm font-semibold">{repo.full_name}</span>
            {repo.status === 'ready' && <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />}
            {repo.status === 'error' && <AlertCircle className="w-3.5 h-3.5 text-red-400" />}
            {repo.status === 'analyzing' && <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleRetry} disabled={retrying}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50">
              {retrying ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Re-analyze
            </button>
            <a href={`https://github.com/${repo.full_name}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 text-xs text-zinc-300 hover:bg-zinc-800">
              <ExternalLink className="w-3 h-3" /> GitHub
            </a>
          </div>
        </div>
      </nav>

      {/* Summary bar */}
      {parsed && (
        <div className="border-b border-zinc-800/50 bg-zinc-900/30">
          <div className="max-w-7xl mx-auto px-6 py-4">
            <p className="text-sm text-zinc-300 mb-3">{parsed.summary}</p>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                <Server className="w-3.5 h-3.5" /> {parsed.services.length} services
              </div>
              <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                <Link2 className="w-3.5 h-3.5" /> {parsed.connections.length} connections
              </div>
              <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                <AlertCircle className="w-3.5 h-3.5" /> {parsed.issues.length} issues
              </div>
              <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                <GitBranch className="w-3.5 h-3.5" /> arcwright branch
              </div>
              <div className="flex flex-wrap gap-1.5 ml-auto">
                {parsed.techStack.map(t => (
                  <span key={t.name} className="px-2 py-0.5 rounded-full bg-zinc-800 text-[10px] text-zinc-400 border border-zinc-700/50">
                    {t.name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-zinc-800/50">
        <div className="max-w-7xl mx-auto px-6 flex gap-0">
          {([['graph', 'Architecture', Server], ['issues', 'Issues', AlertCircle], ['xml', 'Raw XML', FileCode2]] as const).map(([key, label, Icon]) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium border-b-2 transition-colors ${
                activeTab === key ? 'border-blue-500 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}>
              <Icon className="w-3.5 h-3.5" /> {label}
              {key === 'issues' && parsed && parsed.issues.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 text-[10px]">{parsed.issues.length}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1">
        {activeTab === 'graph' && (
          <div className="h-[calc(100vh-220px)]">
            {nodes.length > 0 ? (
              <ReactFlow
                nodes={nodes}
                edges={edges}
                fitView
                fitViewOptions={{ padding: 0.3 }}
                minZoom={0.3}
                maxZoom={2}
                defaultEdgeOptions={{ type: 'smoothstep' }}
                proOptions={{ hideAttribution: true }}
              >
                <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#27272a" />
                <Controls showInteractive={false} />
                <MiniMap
                  nodeColor="#3b82f6"
                  maskColor="rgba(0,0,0,0.7)"
                  style={{ width: 150, height: 100 }}
                />
              </ReactFlow>
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-zinc-500">
                No services detected in analysis. Try re-analyzing.
              </div>
            )}
          </div>
        )}

        {activeTab === 'issues' && parsed && (
          <div className="max-w-4xl mx-auto px-6 py-6">
            {parsed.issues.length === 0 ? (
              <div className="text-center py-12 text-sm text-zinc-500">No issues detected.</div>
            ) : (
              <div className="space-y-3">
                {parsed.issues.map((issue, i) => (
                  <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-4">
                    <div className="flex items-start gap-3">
                      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0`}
                        style={{ backgroundColor: severityColors[issue.severity] || '#6b7280' }} />
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-medium">{issue.title}</h4>
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-400">{issue.type.replace(/_/g, ' ')}</span>
                          <span className="text-[10px]" style={{ color: severityColors[issue.severity] }}>{issue.severity}</span>
                        </div>
                        {issue.description && <p className="text-xs text-zinc-400 mt-1">{issue.description}</p>}
                        {issue.filePath && <p className="text-[11px] text-zinc-600 mt-1 font-mono">{issue.filePath}</p>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'xml' && (
          <div className="max-w-5xl mx-auto px-6 py-6">
            <pre className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-xs text-zinc-300 overflow-auto max-h-[calc(100vh-280px)] font-mono leading-relaxed">
              {xml || 'No XML available'}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}