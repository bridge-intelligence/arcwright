import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  MarkerType,
  type Node,
  type Edge,
  type NodeMouseHandler,
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
  Workflow,
  X,
  Database,
} from 'lucide-react';
import { reposApi, type RepoDetail } from '../services/api';

// --- Types ---
interface ParsedService {
  id: string; name: string; type: string; tier: string; description: string;
  endpoints: Array<{ method: string; path: string; description: string }>;
  databases: Array<{ type: string; name: string; purpose: string }>;
}
interface ParsedConnection {
  from: string; to: string; protocol: string; direction: string; label: string; description: string;
}
interface ParsedIssue {
  type: string; severity: string; title: string; description: string; filePath?: string;
}
interface ParsedFlow {
  id: string; name: string;
  steps: Array<{ order: number; service: string; action: string }>;
}
interface ParsedArch {
  summary: string;
  branch: string;
  techStack: Array<{ name: string; category: string }>;
  services: ParsedService[];
  connections: ParsedConnection[];
  flows: ParsedFlow[];
  issues: ParsedIssue[];
}

// --- XML Parser ---
function parseArchXml(xml: string): ParsedArch {
  const result: ParsedArch = { summary: '', branch: '', techStack: [], services: [], connections: [], flows: [], issues: [] };

  const branchMatch = xml.match(/branch="([^"]*?)"/);
  if (branchMatch) result.branch = branchMatch[1];

  const summaryMatch = xml.match(/<summary>([\s\S]*?)<\/summary>/);
  if (summaryMatch) result.summary = summaryMatch[1].trim();

  let m;
  const techRegex = /<technology\s+name="([^"]*?)"\s+category="([^"]*?)"\s*\/?\s*>/g;
  while ((m = techRegex.exec(xml)) !== null) result.techStack.push({ name: m[1], category: m[2] });

  const svcRegex = /<service\s+id="([^"]*?)"\s+name="([^"]*?)"\s+type="([^"]*?)"\s+tier="([^"]*?)"[^>]*>([\s\S]*?)<\/service>/g;
  while ((m = svcRegex.exec(xml)) !== null) {
    const body = m[5];
    const descMatch = body.match(/<description>([\s\S]*?)<\/description>/);
    const endpoints: ParsedService['endpoints'] = [];
    const epRegex = /<endpoint\s+method="([^"]*?)"\s+path="([^"]*?)"\s+description="([^"]*?)"\s*\/?\s*>/g;
    let ep;
    while ((ep = epRegex.exec(body)) !== null) endpoints.push({ method: ep[1], path: ep[2], description: ep[3] });
    const databases: ParsedService['databases'] = [];
    const dbRegex = /<database\s+type="([^"]*?)"\s+name="([^"]*?)"\s+purpose="([^"]*?)"\s*\/?\s*>/g;
    let db;
    while ((db = dbRegex.exec(body)) !== null) databases.push({ type: db[1], name: db[2], purpose: db[3] });
    result.services.push({ id: m[1], name: m[2], type: m[3], tier: m[4], description: descMatch?.[1]?.trim() || '', endpoints, databases });
  }

  const connRegex = /<connection\s+from="([^"]*?)"\s+to="([^"]*?)"\s+protocol="([^"]*?)"\s+direction="([^"]*?)"\s+(?:label="([^"]*?)"\s+)?description="([^"]*?)"\s*\/?\s*>/g;
  while ((m = connRegex.exec(xml)) !== null) result.connections.push({ from: m[1], to: m[2], protocol: m[3], direction: m[4], label: m[5] || m[3], description: m[6] });

  const issueRegex = /<issue\s+type="([^"]*?)"\s+severity="([^"]*?)"\s+title="([^"]*?)"(?:\s+file_path="([^"]*?)")?[^>]*>([\s\S]*?)<\/issue>/g;
  while ((m = issueRegex.exec(xml)) !== null) result.issues.push({ type: m[1], severity: m[2], title: m[3], description: m[5]?.trim() || '', filePath: m[4] });

  const flowRegex = /<flow\s+id="([^"]*?)"\s+name="([^"]*?)"[^>]*>([\s\S]*?)<\/flow>/g;
  while ((m = flowRegex.exec(xml)) !== null) {
    const steps: ParsedFlow['steps'] = [];
    const stepRegex = /<step\s+order="([^"]*?)"\s+service="([^"]*?)"\s+action="([^"]*?)"\s*\/?\s*>/g;
    let s;
    while ((s = stepRegex.exec(m[3])) !== null) steps.push({ order: parseInt(s[1]), service: s[2], action: s[3] });
    result.flows.push({ id: m[1], name: m[2], steps: steps.sort((a, b) => a.order - b.order) });
  }

  return result;
}

// --- Colors ---
const tierColors: Record<string, string> = {
  frontend: '#06b6d4', gateway: '#3b82f6', business: '#a855f7', data: '#22c55e', infrastructure: '#6b7280',
  api: '#3b82f6', worker: '#f97316', library: '#8b5cf6', database: '#22c55e', cache: '#ef4444', queue: '#eab308',
};
const protocolColors: Record<string, string> = {
  http: '#3b82f6', grpc: '#a855f7', kafka: '#22c55e', redis: '#ef4444', websocket: '#06b6d4', jdbc: '#6b7280',
};
const severityColors: Record<string, string> = { error: '#ef4444', warning: '#eab308', info: '#3b82f6' };

export default function RepoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [repo, setRepo] = useState<RepoDetail | null>(null);
  const [xml, setXml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [activeTab, setActiveTab] = useState<'graph' | 'flows' | 'issues' | 'xml'>('graph');
  const [selectedService, setSelectedService] = useState<ParsedService | null>(null);
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
      const poll = setInterval(async () => {
        const r = await reposApi.get(id);
        if (r.status === 'ready' || r.status === 'error') { clearInterval(poll); loadData(); setRetrying(false); }
      }, 3000);
    } catch { setRetrying(false); }
  };

  const parsed = useMemo(() => xml ? parseArchXml(xml) : null, [xml]);

  // Build graph
  const { nodes, edges } = useMemo(() => {
    if (!parsed || parsed.services.length === 0) return { nodes: [] as Node[], edges: [] as Edge[] };

    const tierGroups: Record<string, ParsedService[]> = {};
    for (const svc of parsed.services) {
      const t = svc.tier || svc.type || 'other';
      if (!tierGroups[t]) tierGroups[t] = [];
      tierGroups[t].push(svc);
    }

    const tiers = Object.keys(tierGroups);
    const nodes: Node[] = [];

    tiers.forEach((tier, ti) => {
      tierGroups[tier].forEach((svc, si) => {
        const color = tierColors[svc.tier] || tierColors[svc.type] || '#52525b';

        nodes.push({
          id: svc.id || svc.name,
          position: { x: 80 + si * 280, y: 60 + ti * 220 },
          data: { label: svc.name, service: svc },
          style: {
            background: `linear-gradient(135deg, ${color}12, ${color}06)`,
            border: `1.5px solid ${color}40`,
            borderRadius: '14px',
            padding: '14px 18px',
            color: '#fff',
            fontSize: '13px',
            fontWeight: 600,
            minWidth: '180px',
            cursor: 'pointer',
          },
        });
      });
    });

    const edges: Edge[] = parsed.connections.map((conn, i) => ({
      id: `e-${i}`,
      source: conn.from,
      target: conn.to,
      label: conn.label || conn.protocol,
      type: 'smoothstep',
      animated: ['kafka', 'redis', 'websocket', 'events'].includes(conn.protocol.toLowerCase()),
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: protocolColors[conn.protocol.toLowerCase()] || '#52525b' },
      style: { stroke: protocolColors[conn.protocol.toLowerCase()] || '#52525b', strokeWidth: 2 },
      labelStyle: { fill: '#a1a1aa', fontSize: 10, fontWeight: 500 },
      labelBgStyle: { fill: '#18181b', fillOpacity: 0.9 },
      labelBgPadding: [6, 4] as [number, number],
      labelBgBorderRadius: 4,
    }));

    return { nodes, edges };
  }, [parsed]);

  const onNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    const svc = (node.data as { service?: ParsedService }).service;
    if (svc) setSelectedService(svc);
  }, []);

  if (loading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-zinc-500" /></div>;
  if (error || !repo) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-sm text-red-400">{error || 'Not found'}</div>;

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      {/* Nav */}
      <nav className="border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-12 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/dashboard')} className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white"><ArrowLeft className="w-3.5 h-3.5" /> Dashboard</button>
            <span className="text-zinc-700">/</span>
            <span className="text-sm font-semibold">{repo.full_name}</span>
            {repo.status === 'ready' && <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />}
            {repo.status === 'error' && <AlertCircle className="w-3.5 h-3.5 text-red-400" />}
            {repo.status === 'analyzing' && <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleRetry} disabled={retrying} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50">
              {retrying ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Re-analyze
            </button>
            <a href={`https://github.com/${repo.full_name}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-700 text-xs text-zinc-300 hover:bg-zinc-800">
              <ExternalLink className="w-3 h-3" /> GitHub
            </a>
          </div>
        </div>
      </nav>

      {/* Summary */}
      {parsed && (
        <div className="border-b border-zinc-800/50 bg-zinc-900/30">
          <div className="max-w-7xl mx-auto px-6 py-3">
            <p className="text-xs text-zinc-300 mb-2">{parsed.summary}</p>
            <div className="flex flex-wrap items-center gap-4">
              <span className="flex items-center gap-1 text-[11px] text-zinc-400"><Server className="w-3 h-3" /> {parsed.services.length} services</span>
              <span className="flex items-center gap-1 text-[11px] text-zinc-400"><Link2 className="w-3 h-3" /> {parsed.connections.length} connections</span>
              <span className="flex items-center gap-1 text-[11px] text-zinc-400"><AlertCircle className="w-3 h-3" /> {parsed.issues.length} issues</span>
              {parsed.branch && <span className="flex items-center gap-1 text-[11px] text-zinc-400"><GitBranch className="w-3 h-3" /> branch: {parsed.branch}</span>}
              {repo.latest_analysis?.source && (
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                  repo.latest_analysis.source === 'claude-code' ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30' : 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                }`}>{repo.latest_analysis.source === 'claude-code' ? 'Claude Code' : 'Cloudflare AI'}</span>
              )}
              {repo.latest_analysis?.commit_sha && (
                <span className="text-[10px] text-zinc-600 font-mono">{repo.latest_analysis.commit_sha.slice(0, 7)}</span>
              )}
              {parsed.flows.length > 0 && <span className="flex items-center gap-1 text-[11px] text-zinc-400"><Workflow className="w-3 h-3" /> {parsed.flows.length} flows</span>}
              <div className="flex flex-wrap gap-1 ml-auto">
                {parsed.techStack.slice(0, 10).map(t => (
                  <span key={t.name} className="px-1.5 py-0.5 rounded-full bg-zinc-800 text-[9px] text-zinc-400 border border-zinc-700/50">{t.name}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-zinc-800/50">
        <div className="max-w-7xl mx-auto px-6 flex">
          {([['graph', 'Architecture', Server], ['flows', 'User Flows', Workflow], ['issues', 'Issues', AlertCircle], ['xml', 'Raw XML', FileCode2]] as const).map(([key, label, Icon]) => (
            <button key={key} onClick={() => setActiveTab(key)} className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 ${
              activeTab === key ? 'border-blue-500 text-white' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>
              <Icon className="w-3.5 h-3.5" /> {label}
              {key === 'issues' && parsed && parsed.issues.length > 0 && <span className="ml-1 px-1.5 rounded-full bg-yellow-500/20 text-yellow-400 text-[10px]">{parsed.issues.length}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 relative">
        {activeTab === 'graph' && (
          <div className="h-[calc(100vh-200px)]">
            {nodes.length > 0 ? (
              <ReactFlow nodes={nodes} edges={edges} onNodeClick={onNodeClick} fitView fitViewOptions={{ padding: 0.3 }} minZoom={0.3} maxZoom={2}
                defaultEdgeOptions={{ type: 'smoothstep' }} proOptions={{ hideAttribution: true }}>
                <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#27272a" />
                <Controls showInteractive={false} />
                <MiniMap nodeColor="#3b82f6" maskColor="rgba(0,0,0,0.7)" style={{ width: 140, height: 90 }} />
              </ReactFlow>
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-zinc-500">No services detected. Try re-analyzing.</div>
            )}

            {/* Service detail panel */}
            {selectedService && (
              <div className="absolute top-4 right-4 w-80 max-h-[calc(100vh-240px)] overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900/95 backdrop-blur-xl shadow-2xl z-10">
                <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold">{selectedService.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-400">{selectedService.type}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-400">{selectedService.tier}</span>
                    </div>
                  </div>
                  <button onClick={() => setSelectedService(null)} className="p-1 rounded hover:bg-zinc-800"><X className="w-3.5 h-3.5 text-zinc-400" /></button>
                </div>
                <div className="p-4 space-y-4">
                  <p className="text-xs text-zinc-400 leading-relaxed">{selectedService.description}</p>

                  {selectedService.endpoints.length > 0 && (
                    <div>
                      <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Endpoints</h4>
                      <div className="space-y-1">
                        {selectedService.endpoints.map((ep, i) => (
                          <div key={i} className="flex items-start gap-2 text-[11px]">
                            <span className={`px-1 py-0.5 rounded font-mono text-[9px] font-bold flex-shrink-0 ${
                              ep.method === 'GET' ? 'bg-green-500/20 text-green-400' :
                              ep.method === 'POST' ? 'bg-blue-500/20 text-blue-400' :
                              ep.method === 'PUT' ? 'bg-yellow-500/20 text-yellow-400' :
                              'bg-red-500/20 text-red-400'
                            }`}>{ep.method}</span>
                            <span className="text-zinc-300 font-mono">{ep.path}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedService.databases.length > 0 && (
                    <div>
                      <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Databases</h4>
                      <div className="space-y-1">
                        {selectedService.databases.map((db, i) => (
                          <div key={i} className="flex items-center gap-2 text-[11px]">
                            <Database className="w-3 h-3 text-zinc-500" />
                            <span className="text-zinc-300">{db.name}</span>
                            <span className="text-zinc-600">({db.type})</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Show connections for this service */}
                  {parsed && (() => {
                    const related = parsed.connections.filter(c => c.from === selectedService.id || c.to === selectedService.id);
                    return related.length > 0 ? (
                      <div>
                        <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Connections</h4>
                        <div className="space-y-1">
                          {related.map((c, i) => (
                            <div key={i} className="flex items-center gap-2 text-[11px]">
                              <span className="text-zinc-400">{c.from === selectedService.id ? '→' : '←'}</span>
                              <span className="text-zinc-300">{c.from === selectedService.id ? c.to : c.from}</span>
                              <span className="px-1 py-0.5 rounded text-[9px] bg-zinc-800 text-zinc-500">{c.protocol}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null;
                  })()}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'flows' && parsed && (
          <div className="max-w-4xl mx-auto px-6 py-6">
            {parsed.flows.length === 0 ? <div className="text-center py-12 text-sm text-zinc-500">No user flows detected.</div> : (
              <div className="space-y-6">
                {parsed.flows.map(flow => (
                  <div key={flow.id} className="rounded-xl border border-zinc-800 bg-zinc-900/30 overflow-hidden">
                    <div className="px-5 py-3 border-b border-zinc-800 bg-zinc-800/30">
                      <h3 className="text-sm font-semibold">{flow.name}</h3>
                    </div>
                    <div className="p-5">
                      <div className="relative">
                        {flow.steps.map((step, i) => (
                          <div key={i} className="flex items-start gap-4 mb-4 last:mb-0">
                            <div className="flex flex-col items-center">
                              <div className="w-7 h-7 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-[10px] font-bold text-blue-400 flex-shrink-0">{step.order}</div>
                              {i < flow.steps.length - 1 && <div className="w-px h-6 bg-zinc-700 mt-1" />}
                            </div>
                            <div className="pt-1">
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-zinc-800 text-zinc-400 mr-2">{step.service}</span>
                              <span className="text-xs text-zinc-300">{step.action}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'issues' && parsed && (
          <div className="max-w-4xl mx-auto px-6 py-6">
            {parsed.issues.length === 0 ? <div className="text-center py-12 text-sm text-zinc-500">No issues detected.</div> : (
              <div className="space-y-2">
                {parsed.issues.map((issue, i) => (
                  <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ backgroundColor: severityColors[issue.severity] || '#6b7280' }} />
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
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
            <pre className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-xs text-zinc-300 overflow-auto max-h-[calc(100vh-260px)] font-mono leading-relaxed">{xml || 'No XML'}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
