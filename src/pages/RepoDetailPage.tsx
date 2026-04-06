import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ReactFlow, Background, Controls, MiniMap, BackgroundVariant, MarkerType,
  useNodesState, useEdgesState,
  type Node, type Edge, type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ArrowLeft, RefreshCw, AlertCircle, CheckCircle2, Loader2, FileCode2,
  Server, ExternalLink, Workflow, X, Database, Search,
} from 'lucide-react';
import { reposApi, type RepoDetail } from '../services/api';
import ArchServiceNode, { type ArchNodeData } from '../components/ArchServiceNode';

// --- Types ---
interface ParsedService {
  id: string; name: string; type: string; tier: string; description: string; port?: number;
  endpoints: Array<{ method: string; path: string; description: string }>;
  databases: Array<{ type: string; name: string; purpose: string }>;
  modules: Array<{ id: string; name: string; prefix: string; endpoints: Array<{ method: string; path: string; description: string }> }>;
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
  summary: string; branch: string;
  techStack: Array<{ name: string; category: string }>;
  services: ParsedService[]; connections: ParsedConnection[];
  flows: ParsedFlow[]; issues: ParsedIssue[];
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

  const svcRegex = /<service\s+id="([^"]*?)"\s+name="([^"]*?)"\s+type="([^"]*?)"\s+tier="([^"]*?)"(?:\s+port="([^"]*?)")?[^>]*>([\s\S]*?)<\/service>/g;
  while ((m = svcRegex.exec(xml)) !== null) {
    const body = m[6];
    const descMatch = body.match(/<description>([\s\S]*?)<\/description>/);
    const endpoints: ParsedService['endpoints'] = [];
    const epRegex = /<endpoint\s+method="([^"]*?)"\s+path="([^"]*?)"\s+description="([^"]*?)"\s*\/?\s*>/g;
    let ep; while ((ep = epRegex.exec(body)) !== null) endpoints.push({ method: ep[1], path: ep[2], description: ep[3] });
    const databases: ParsedService['databases'] = [];
    const dbRegex = /<database\s+type="([^"]*?)"\s+name="([^"]*?)"\s+purpose="([^"]*?)"\s*\/?\s*>/g;
    let db; while ((db = dbRegex.exec(body)) !== null) databases.push({ type: db[1], name: db[2], purpose: db[3] });
    const modules: ParsedService['modules'] = [];
    const modRegex = /<module\s+id="([^"]*?)"\s+name="([^"]*?)"(?:\s+prefix="([^"]*?)")?[^>]*>([\s\S]*?)<\/module>/g;
    let mod; while ((mod = modRegex.exec(body)) !== null) {
      const modEps: ParsedService['endpoints'] = [];
      const mepRegex = /<endpoint\s+method="([^"]*?)"\s+path="([^"]*?)"\s+description="([^"]*?)"\s*\/?\s*>/g;
      let mep; while ((mep = mepRegex.exec(mod[4])) !== null) modEps.push({ method: mep[1], path: mep[2], description: mep[3] });
      modules.push({ id: mod[1], name: mod[2], prefix: mod[3] || '', endpoints: modEps });
    }
    result.services.push({ id: m[1], name: m[2], type: m[3], tier: m[4], port: m[5] ? parseInt(m[5]) : undefined, description: descMatch?.[1]?.trim() || '', endpoints, databases, modules });
  }

  const connRegex = /<connection\s+from="([^"]*?)"\s+to="([^"]*?)"\s+protocol="([^"]*?)"\s+direction="([^"]*?)"\s+(?:label="([^"]*?)"\s+)?description="([^"]*?)"\s*\/?\s*>/g;
  while ((m = connRegex.exec(xml)) !== null) result.connections.push({ from: m[1], to: m[2], protocol: m[3], direction: m[4], label: m[5] || m[3], description: m[6] });

  const issueRegex = /<issue\s+type="([^"]*?)"\s+severity="([^"]*?)"\s+title="([^"]*?)"(?:\s+file_path="([^"]*?)")?[^>]*>([\s\S]*?)<\/issue>/g;
  while ((m = issueRegex.exec(xml)) !== null) result.issues.push({ type: m[1], severity: m[2], title: m[3], description: m[5]?.trim() || '', filePath: m[4] });

  const flowRegex = /<flow\s+id="([^"]*?)"\s+name="([^"]*?)"[^>]*>([\s\S]*?)<\/flow>/g;
  while ((m = flowRegex.exec(xml)) !== null) {
    const steps: ParsedFlow['steps'] = [];
    const stepRegex = /<step\s+order="([^"]*?)"\s+service="([^"]*?)"\s+action="([^"]*?)"\s*\/?\s*>/g;
    let s; while ((s = stepRegex.exec(m[3])) !== null) steps.push({ order: parseInt(s[1]), service: s[2], action: s[3] });
    result.flows.push({ id: m[1], name: m[2], steps: steps.sort((a, b) => a.order - b.order) });
  }
  return result;
}

const protocolColors: Record<string, string> = {
  http: '#3b82f6', prisma: '#a855f7', redis: '#ef4444', bolt: '#f97316',
  mongodb: '#22c55e', kafka: '#22c55e', grpc: '#a855f7', websocket: '#06b6d4', jdbc: '#6b7280',
};
const severityColors: Record<string, string> = { error: '#ef4444', warning: '#eab308', info: '#3b82f6' };
const tierColors: Record<string, string> = {
  frontend: '#06b6d4', gateway: '#3b82f6', business: '#a855f7', data: '#22c55e', infrastructure: '#6b7280',
};

const nodeTypes = { archServiceNode: ArchServiceNode };

export default function RepoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [repo, setRepo] = useState<RepoDetail | null>(null);
  const [xml, setXml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [activeTab, setActiveTab] = useState<'graph' | 'flows' | 'issues' | 'xml'>('graph');
  const [selectedService, setSelectedService] = useState<ParsedService | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTiers, setActiveTiers] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const [repoData, xmlData] = await Promise.all([
        reposApi.get(id), reposApi.getArchitectureXml(id).catch(() => null),
      ]);
      setRepo(repoData); setXml(xmlData);
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to load'); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRetry = async () => {
    if (!id) return; setRetrying(true);
    try {
      await reposApi.retry(id);
      const poll = setInterval(async () => {
        const r = await reposApi.get(id);
        if (r.status === 'ready' || r.status === 'error') { clearInterval(poll); loadData(); setRetrying(false); }
      }, 3000);
    } catch { setRetrying(false); }
  };

  const parsed = useMemo(() => xml ? parseArchXml(xml) : null, [xml]);

  // Build graph nodes/edges with smart layout
  const { graphNodes, graphEdges } = useMemo(() => {
    if (!parsed || parsed.services.length === 0) return { graphNodes: [] as Node[], graphEdges: [] as Edge[] };

    const filteredSvcs = parsed.services.filter(s => {
      if (activeTiers.size > 0 && !activeTiers.has(s.tier)) return false;
      if (searchQuery && !s.name.toLowerCase().includes(searchQuery.toLowerCase()) && !s.type.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
    const filteredIds = new Set(filteredSvcs.map(s => s.id));

    // --- Smart layout: tier ordering + connection-aware horizontal placement ---
    const tierOrder = ['frontend', 'gateway', 'business', 'data', 'infrastructure'];
    const tierGroups: Record<string, ParsedService[]> = {};
    for (const svc of filteredSvcs) {
      const t = svc.tier; if (!tierGroups[t]) tierGroups[t] = [];
      tierGroups[t].push(svc);
    }

    // Sort tiers by defined order, unknowns at end
    const orderedTiers = Object.keys(tierGroups).sort((a, b) => {
      const ai = tierOrder.indexOf(a); const bi = tierOrder.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

    // Build adjacency for horizontal ordering (connected nodes should be near each other)
    const adjCount: Record<string, Record<string, number>> = {};
    for (const conn of parsed.connections) {
      if (!filteredIds.has(conn.from) || !filteredIds.has(conn.to)) continue;
      if (!adjCount[conn.from]) adjCount[conn.from] = {};
      if (!adjCount[conn.to]) adjCount[conn.to] = {};
      adjCount[conn.from][conn.to] = (adjCount[conn.from][conn.to] || 0) + 1;
      adjCount[conn.to][conn.from] = (adjCount[conn.to][conn.from] || 0) + 1;
    }

    // Within each tier, sort services to minimize crossings with adjacent tiers
    const tierPositions: Record<string, number> = {}; // svc.id → horizontal slot
    orderedTiers.forEach((tier, ti) => {
      const svcs = tierGroups[tier];
      if (ti === 0) {
        // First tier: sort by connection count (most connected in center)
        svcs.sort((a, b) => {
          const ac = parsed.connections.filter(c => c.from === a.id || c.to === a.id).length;
          const bc = parsed.connections.filter(c => c.from === b.id || c.to === b.id).length;
          return bc - ac;
        });
        // Place most connected in center
        const reordered: ParsedService[] = [];
        for (let i = 0; i < svcs.length; i++) {
          if (i % 2 === 0) reordered.push(svcs[i]);
          else reordered.unshift(svcs[i]);
        }
        reordered.forEach((s, si) => { tierPositions[s.id] = si; });
        tierGroups[tier] = reordered;
      } else {
        // Subsequent tiers: order by average position of connected nodes in previous tiers
        svcs.sort((a, b) => {
          const aConns = Object.keys(adjCount[a.id] || {}).filter(id => tierPositions[id] !== undefined);
          const bConns = Object.keys(adjCount[b.id] || {}).filter(id => tierPositions[id] !== undefined);
          const aAvg = aConns.length > 0 ? aConns.reduce((s, id) => s + tierPositions[id], 0) / aConns.length : 999;
          const bAvg = bConns.length > 0 ? bConns.reduce((s, id) => s + tierPositions[id], 0) / bConns.length : 999;
          return aAvg - bAvg;
        });
        svcs.forEach((s, si) => { tierPositions[s.id] = si; });
      }
    });

    const NODE_W = 240;
    const NODE_H = 220;
    const nodes: Node[] = [];
    orderedTiers.forEach((tier, ti) => {
      const svcs = tierGroups[tier];
      const tierWidth = svcs.length * NODE_W;
      const startX = Math.max(60, (orderedTiers.reduce((max, t) => Math.max(max, (tierGroups[t]?.length || 0)), 0) * NODE_W - tierWidth) / 2);

      svcs.forEach((svc, si) => {
        const connCount = parsed.connections.filter(c => c.from === svc.id || c.to === svc.id).length;
        nodes.push({
          id: svc.id,
          type: 'archServiceNode',
          position: { x: startX + si * NODE_W, y: 50 + ti * NODE_H },
          data: {
            serviceId: svc.id, label: svc.name, type: svc.type, tier: svc.tier,
            port: svc.port, description: svc.description,
            endpointCount: svc.endpoints.length + svc.modules.reduce((sum, m) => sum + m.endpoints.length, 0),
            databaseCount: svc.databases.length, moduleCount: svc.modules.length, connectionCount: connCount,
          } as ArchNodeData,
        });
      });
    });

    const edges: Edge[] = parsed.connections
      .filter(c => filteredIds.has(c.from) && filteredIds.has(c.to))
      .map((conn, i) => ({
        id: `e-${i}`, source: conn.from, target: conn.to,
        label: conn.label || conn.protocol, type: 'smoothstep',
        animated: ['kafka', 'redis', 'websocket', 'events'].includes(conn.protocol.toLowerCase()),
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: protocolColors[conn.protocol.toLowerCase()] || '#52525b' },
        style: { stroke: protocolColors[conn.protocol.toLowerCase()] || '#52525b', strokeWidth: 1.5 },
        labelStyle: { fill: '#a1a1aa', fontSize: 9, fontWeight: 500 },
        labelBgStyle: { fill: '#18181b', fillOpacity: 0.9 },
        labelBgPadding: [5, 3] as [number, number],
        labelBgBorderRadius: 4,
      }));
    return { graphNodes: nodes, graphEdges: edges };
  }, [parsed, activeTiers, searchQuery]);

  const [nodes, setNodes, onNodesChange] = useNodesState(graphNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(graphEdges);

  // Sync when graph data changes (apply saved positions if available)
  useEffect(() => {
    if (!repo) { setNodes(graphNodes); setEdges(graphEdges); return; }
    // Load saved positions
    let savedPositions: Record<string, { x: number; y: number }> | null = null;
    try {
      const layoutData = (repo as unknown as Record<string, unknown>).layout_data;
      if (layoutData && typeof layoutData === 'string') savedPositions = JSON.parse(layoutData);
    } catch {}

    const positioned = savedPositions
      ? graphNodes.map(n => savedPositions![n.id] ? { ...n, position: savedPositions![n.id] } : n)
      : graphNodes;
    setNodes(positioned);
    setEdges(graphEdges);
  }, [graphNodes, graphEdges, setNodes, setEdges, repo]);

  // Debounced position save on drag
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onNodeDragStop = useCallback(() => {
    if (!id) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const positions: Record<string, { x: number; y: number }> = {};
      nodes.forEach(n => { positions[n.id] = n.position; });
      reposApi.saveLayout(id, positions).catch(() => {});
    }, 1000);
  }, [id, nodes]);

  const onNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    const svc = parsed?.services.find(s => s.id === node.id);
    if (svc) setSelectedService(svc);
  }, [parsed]);

  const toggleTier = (tier: string) => {
    setActiveTiers(prev => { const n = new Set(prev); if (n.has(tier)) n.delete(tier); else n.add(tier); return n; });
  };

  if (loading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-zinc-500" /></div>;
  if (error || !repo) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-sm text-red-400">{error || 'Not found'}</div>;

  const allTiers = [...new Set(parsed?.services.map(s => s.tier) || [])];
  const totalEndpoints = parsed?.services.reduce((s, svc) => s + svc.endpoints.length + svc.modules.reduce((ms, m) => ms + m.endpoints.length, 0), 0) || 0;

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      {/* Nav */}
      <nav className="border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-4 h-12 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/dashboard')} className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white"><ArrowLeft className="w-3.5 h-3.5" /></button>
            <span className="text-sm font-semibold">{repo.full_name}</span>
            {repo.status === 'ready' && <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />}
            {repo.status === 'error' && <AlertCircle className="w-3.5 h-3.5 text-red-400" />}
            {repo.status === 'analyzing' && <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />}
          </div>

          {/* Stats bar */}
          {parsed && (
            <div className="flex items-center gap-4">
              <Stat value={parsed.services.length} label="SERVICES" color="#3b82f6" />
              <Stat value={parsed.connections.length} label="CONNECTIONS" color="#22c55e" />
              <Stat value={totalEndpoints} label="ENDPOINTS" color="#a855f7" />
              <Stat value={parsed.issues.length} label="ISSUES" color={parsed.issues.some(i => i.severity === 'error') ? '#ef4444' : '#eab308'} />
              <Stat value={parsed.flows.length} label="FLOWS" color="#06b6d4" />
            </div>
          )}

          <div className="flex items-center gap-2">
            {repo.latest_analysis?.source && (
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                repo.latest_analysis.source === 'claude-code' ? 'bg-violet-500/20 text-violet-400 border border-violet-500/30' : 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
              }`}>{repo.latest_analysis.source === 'claude-code' ? 'Claude Code' : 'CF AI'}</span>
            )}
            {repo.latest_analysis?.commit_sha && <span className="text-[10px] text-zinc-600 font-mono">{repo.latest_analysis.commit_sha.slice(0, 7)}</span>}
            <button onClick={handleRetry} disabled={retrying} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-700 text-[11px] text-zinc-300 hover:bg-zinc-800 disabled:opacity-50">
              {retrying ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Re-analyze
            </button>
            <a href={`https://github.com/${repo.full_name}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-700 text-[11px] text-zinc-300 hover:bg-zinc-800">
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </nav>

      {/* Filter bar + Tabs */}
      <div className="border-b border-zinc-800/50 bg-zinc-900/30">
        <div className="max-w-[1600px] mx-auto px-4 py-2 flex items-center gap-3">
          {/* Search */}
          <div className="relative w-44">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500" />
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search services..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/50 text-[11px] placeholder-zinc-500 focus:outline-none focus:border-zinc-600" />
          </div>

          {/* Tier filters */}
          <div className="flex items-center gap-1">
            {allTiers.map(tier => (
              <button key={tier} onClick={() => toggleTier(tier)}
                className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                  activeTiers.size === 0 || activeTiers.has(tier)
                    ? 'text-white' : 'text-zinc-600 hover:text-zinc-400'
                }`}
                style={{ backgroundColor: (activeTiers.size === 0 || activeTiers.has(tier)) ? `${tierColors[tier] || '#52525b'}30` : 'transparent' }}>
                {tier}
              </button>
            ))}
            {activeTiers.size > 0 && (
              <button onClick={() => setActiveTiers(new Set())} className="text-[10px] text-zinc-500 hover:text-zinc-300 ml-1">Reset</button>
            )}
          </div>

          <div className="flex-1" />

          {/* Tabs */}
          {([['graph', 'Architecture', Server], ['flows', 'Flows', Workflow], ['issues', 'Issues', AlertCircle], ['xml', 'XML', FileCode2]] as const).map(([key, label, Icon]) => (
            <button key={key} onClick={() => setActiveTab(key)} className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
              activeTab === key ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
              <Icon className="w-3 h-3" /> {label}
              {key === 'issues' && parsed && parsed.issues.length > 0 && <span className="px-1 rounded-full bg-yellow-500/20 text-yellow-400 text-[9px] ml-0.5">{parsed.issues.length}</span>}
              {key === 'flows' && parsed && parsed.flows.length > 0 && <span className="px-1 rounded-full bg-cyan-500/20 text-cyan-400 text-[9px] ml-0.5">{parsed.flows.length}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 relative">
        {activeTab === 'graph' && (
          <div className="h-[calc(100vh-110px)]">
            {nodes.length > 0 ? (
              <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
                onNodeClick={onNodeClick} onNodeDragStop={onNodeDragStop} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.2 }}
                minZoom={0.2} maxZoom={2} defaultEdgeOptions={{ type: 'smoothstep' }} proOptions={{ hideAttribution: true }}>
                <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#27272a" />
                <Controls showInteractive={false} />
                <MiniMap nodeColor={(n) => {
                  const d = n.data as ArchNodeData;
                  return tierColors[d?.tier] || '#52525b';
                }} maskColor="rgba(0,0,0,0.7)" style={{ width: 160, height: 100 }} />
              </ReactFlow>
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-zinc-500">No services detected.</div>
            )}

            {/* Detail panel */}
            {selectedService && parsed && (
              <div className="absolute top-3 right-3 w-80 max-h-[calc(100vh-140px)] overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900/95 backdrop-blur-xl shadow-2xl z-10">
                <div className="p-4 border-b border-zinc-800 flex items-center justify-between sticky top-0 bg-zinc-900/95 backdrop-blur-xl rounded-t-xl">
                  <div>
                    <h3 className="text-sm font-bold">{selectedService.name}</h3>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase" style={{ background: `${tierColors[selectedService.tier] || '#52525b'}20`, color: tierColors[selectedService.tier] || '#52525b' }}>{selectedService.type}</span>
                      <span className="text-[9px] text-zinc-500">{selectedService.tier}</span>
                      {selectedService.port && <span className="text-[9px] font-mono text-zinc-500">:{selectedService.port}</span>}
                    </div>
                  </div>
                  <button onClick={() => setSelectedService(null)} className="p-1 rounded hover:bg-zinc-800"><X className="w-3.5 h-3.5 text-zinc-400" /></button>
                </div>

                <div className="p-4 space-y-4">
                  <p className="text-[11px] text-zinc-400 leading-relaxed">{selectedService.description}</p>

                  {/* Modules */}
                  {selectedService.modules.length > 0 && (
                    <Section title="Modules" count={selectedService.modules.length}>
                      {selectedService.modules.map(mod => (
                        <div key={mod.id} className="mb-2 last:mb-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[11px] font-medium text-zinc-200">{mod.name}</span>
                            {mod.prefix && <span className="text-[9px] font-mono text-zinc-600">{mod.prefix}</span>}
                            <span className="text-[9px] text-zinc-600">{mod.endpoints.length} ep</span>
                          </div>
                          {mod.endpoints.slice(0, 5).map((ep, i) => (
                            <div key={i} className="flex items-center gap-1.5 ml-3 text-[10px]">
                              <MethodBadge method={ep.method} />
                              <span className="text-zinc-400 font-mono truncate">{ep.path}</span>
                            </div>
                          ))}
                          {mod.endpoints.length > 5 && <div className="text-[9px] text-zinc-600 ml-3">+{mod.endpoints.length - 5} more</div>}
                        </div>
                      ))}
                    </Section>
                  )}

                  {/* Endpoints (direct, not in modules) */}
                  {selectedService.endpoints.length > 0 && (
                    <Section title="Endpoints" count={selectedService.endpoints.length}>
                      {selectedService.endpoints.slice(0, 10).map((ep, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-[10px]">
                          <MethodBadge method={ep.method} />
                          <span className="text-zinc-400 font-mono truncate">{ep.path}</span>
                        </div>
                      ))}
                      {selectedService.endpoints.length > 10 && <div className="text-[9px] text-zinc-600">+{selectedService.endpoints.length - 10} more</div>}
                    </Section>
                  )}

                  {/* Databases */}
                  {selectedService.databases.length > 0 && (
                    <Section title="Databases" count={selectedService.databases.length}>
                      {selectedService.databases.map((db, i) => (
                        <div key={i} className="flex items-center gap-2 text-[11px]">
                          <Database className="w-3 h-3 text-zinc-500" />
                          <span className="text-zinc-300 font-medium">{db.name}</span>
                          <span className="text-zinc-600 text-[9px]">({db.type})</span>
                        </div>
                      ))}
                    </Section>
                  )}

                  {/* Connections */}
                  {(() => {
                    const related = parsed.connections.filter(c => c.from === selectedService.id || c.to === selectedService.id);
                    return related.length > 0 ? (
                      <Section title="Connections" count={related.length}>
                        {related.map((c, i) => (
                          <div key={i} className="flex items-center gap-2 text-[11px]">
                            <span className="text-zinc-500">{c.from === selectedService.id ? '→' : '←'}</span>
                            <span className="text-zinc-300">{c.from === selectedService.id ? c.to : c.from}</span>
                            <span className="px-1 py-0.5 rounded text-[8px]" style={{ background: `${protocolColors[c.protocol.toLowerCase()] || '#52525b'}20`, color: protocolColors[c.protocol.toLowerCase()] || '#52525b' }}>{c.protocol}</span>
                          </div>
                        ))}
                      </Section>
                    ) : null;
                  })()}
                </div>
              </div>
            )}

            {/* Legend */}
            <div className="absolute bottom-3 left-3 rounded-xl border border-zinc-800 bg-zinc-900/90 backdrop-blur-sm p-3 z-10 text-[9px]">
              <div className="font-semibold text-zinc-400 mb-1.5 uppercase tracking-wider">Tiers</div>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {Object.entries(tierColors).map(([tier, color]) => (
                  <div key={tier} className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                    <span className="text-zinc-400">{tier}</span>
                  </div>
                ))}
              </div>
              <div className="font-semibold text-zinc-400 mt-2 mb-1 uppercase tracking-wider">Protocols</div>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {Object.entries(protocolColors).map(([proto, color]) => (
                  <div key={proto} className="flex items-center gap-1">
                    <div className="w-3 h-0.5 rounded" style={{ backgroundColor: color }} />
                    <span className="text-zinc-400">{proto}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'flows' && parsed && (
          <div className="max-w-4xl mx-auto px-6 py-6 overflow-y-auto max-h-[calc(100vh-200px)]">
            {parsed.flows.length === 0 ? <div className="text-center py-12 text-sm text-zinc-500">No flows.</div> : (
              <div className="space-y-4">
                {parsed.flows.map(flow => (
                  <div key={flow.id} className="rounded-xl border border-zinc-800 bg-zinc-900/30 overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-zinc-800 bg-zinc-800/30">
                      <h3 className="text-sm font-semibold">{flow.name}</h3>
                    </div>
                    <div className="p-4">
                      {flow.steps.map((step, i) => (
                        <div key={i} className="flex items-start gap-3 mb-3 last:mb-0">
                          <div className="flex flex-col items-center">
                            <div className="w-6 h-6 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-[9px] font-bold text-blue-400">{step.order}</div>
                            {i < flow.steps.length - 1 && <div className="w-px h-5 bg-zinc-700 mt-0.5" />}
                          </div>
                          <div className="pt-0.5">
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-zinc-800 text-zinc-400 mr-1.5">{step.service}</span>
                            <span className="text-[11px] text-zinc-300">{step.action}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'issues' && parsed && (
          <div className="max-w-4xl mx-auto px-6 py-6 overflow-y-auto max-h-[calc(100vh-200px)]">
            {parsed.issues.length === 0 ? <div className="text-center py-12 text-sm text-zinc-500">No issues.</div> : (
              <div className="space-y-2">
                {parsed.issues.map((issue, i) => (
                  <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-2 h-2 rounded-full mt-1.5" style={{ backgroundColor: severityColors[issue.severity] || '#6b7280' }} />
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-sm font-medium">{issue.title}</h4>
                          <span className="px-1.5 py-0.5 rounded text-[9px] bg-zinc-800 text-zinc-400">{issue.type.replace(/_/g, ' ')}</span>
                          <span className="text-[10px]" style={{ color: severityColors[issue.severity] }}>{issue.severity}</span>
                        </div>
                        {issue.description && <p className="text-xs text-zinc-400 mt-1">{issue.description}</p>}
                        {issue.filePath && <p className="text-[10px] text-zinc-600 mt-1 font-mono">{issue.filePath}</p>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'xml' && (
          <div className="max-w-6xl mx-auto px-6 py-6">
            <pre className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-[11px] text-zinc-300 overflow-auto max-h-[calc(100vh-160px)] font-mono leading-relaxed">{xml || 'No XML'}</pre>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Helper Components ---
function Stat({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="text-center">
      <div className="text-sm font-bold" style={{ color }}>{value}</div>
      <div className="text-[8px] text-zinc-500 uppercase tracking-wider">{label}</div>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
        {title} <span className="text-zinc-600">({count})</span>
      </h4>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: 'bg-green-500/20 text-green-400', POST: 'bg-blue-500/20 text-blue-400',
    PUT: 'bg-yellow-500/20 text-yellow-400', PATCH: 'bg-yellow-500/20 text-yellow-400',
    DELETE: 'bg-red-500/20 text-red-400', PROCESS: 'bg-purple-500/20 text-purple-400',
    CRON: 'bg-orange-500/20 text-orange-400', CONSUME: 'bg-green-500/20 text-green-400',
    PAGE: 'bg-cyan-500/20 text-cyan-400',
  };
  return <span className={`px-1 py-0.5 rounded font-mono text-[8px] font-bold flex-shrink-0 ${colors[method] || 'bg-zinc-800 text-zinc-400'}`}>{method}</span>;
}
