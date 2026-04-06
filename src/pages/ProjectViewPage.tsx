import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ReactFlow, Background, Controls, MiniMap, BackgroundVariant, MarkerType,
  useNodesState, useEdgesState,
  type Node, type Edge, type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ArrowLeft, RefreshCw, Loader2, Search, Server, FolderOpen,
} from 'lucide-react';
import { projectsApi, reposApi, type ProjectResponse, type RepoResponse } from '../services/api';
import ArchServiceNode, { type ArchNodeData } from '../components/ArchServiceNode';

// Reuse the parser from RepoDetailPage
interface ParsedService {
  id: string; name: string; type: string; tier: string; description: string; port?: number;
  endpoints: Array<{ method: string; path: string; description: string }>;
  databases: Array<{ type: string; name: string; purpose: string }>;
  modules: Array<{ id: string; name: string; prefix: string; endpoints: Array<{ method: string; path: string; description: string }> }>;
}
interface ParsedConnection { from: string; to: string; protocol: string; direction: string; label: string; description: string; }
interface ParsedIssue { type: string; severity: string; title: string; description: string; }

interface RepoArch {
  repoId: string;
  repoName: string;
  services: ParsedService[];
  connections: ParsedConnection[];
  issues: ParsedIssue[];
  techStack: Array<{ name: string; category: string }>;
}

function parseXml(xml: string): { services: ParsedService[]; connections: ParsedConnection[]; issues: ParsedIssue[]; techStack: Array<{ name: string; category: string }> } {
  const services: ParsedService[] = [];
  const connections: ParsedConnection[] = [];
  const issues: ParsedIssue[] = [];
  const techStack: Array<{ name: string; category: string }> = [];

  let m;
  const techRegex = /<technology\s+name="([^"]*?)"\s+category="([^"]*?)"\s*\/?\s*>/g;
  while ((m = techRegex.exec(xml)) !== null) techStack.push({ name: m[1], category: m[2] });

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
    services.push({ id: m[1], name: m[2], type: m[3], tier: m[4], port: m[5] ? parseInt(m[5]) : undefined, description: descMatch?.[1]?.trim() || '', endpoints, databases, modules });
  }

  const connRegex = /<connection\s+from="([^"]*?)"\s+to="([^"]*?)"\s+protocol="([^"]*?)"\s+direction="([^"]*?)"\s+(?:label="([^"]*?)"\s+)?description="([^"]*?)"\s*\/?\s*>/g;
  while ((m = connRegex.exec(xml)) !== null) connections.push({ from: m[1], to: m[2], protocol: m[3], direction: m[4], label: m[5] || m[3], description: m[6] });

  const issueRegex = /<issue\s+type="([^"]*?)"\s+severity="([^"]*?)"\s+title="([^"]*?)"[^>]*>([\s\S]*?)<\/issue>/g;
  while ((m = issueRegex.exec(xml)) !== null) issues.push({ type: m[1], severity: m[2], title: m[3], description: m[4]?.trim() || '' });

  return { services, connections, issues, techStack };
}

const tierColors: Record<string, string> = { frontend: '#06b6d4', gateway: '#3b82f6', business: '#a855f7', data: '#22c55e', infrastructure: '#6b7280' };
const protocolColors: Record<string, string> = { http: '#3b82f6', prisma: '#a855f7', redis: '#ef4444', bolt: '#f97316', mongodb: '#22c55e', kafka: '#22c55e', grpc: '#a855f7', websocket: '#06b6d4', jdbc: '#6b7280' };
// Color per repo for visual grouping
const repoColors = ['#3b82f6', '#22c55e', '#f97316', '#a855f7', '#06b6d4', '#ef4444', '#eab308', '#ec4899'];

const nodeTypes = { archServiceNode: ArchServiceNode };

export default function ProjectViewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<(ProjectResponse & { repos: RepoResponse[] }) | null>(null);
  const [repoArchs, setRepoArchs] = useState<RepoArch[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeRepo, setActiveRepo] = useState<string | null>(null); // null = all repos

  const loadData = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const proj = await projectsApi.get(id);
      setProject(proj);

      // Fetch XML for each ready repo
      const archs: RepoArch[] = [];
      for (const repo of proj.repos) {
        if (repo.status !== 'ready') continue;
        try {
          const xml = await reposApi.getArchitectureXml(repo.id);
          const parsed = parseXml(xml);
          archs.push({ repoId: repo.id, repoName: repo.full_name.split('/').pop() || repo.full_name, ...parsed });
        } catch { /* skip repos without XML */ }
      }
      setRepoArchs(archs);
    } catch (err) {
      console.error('Failed to load project:', err);
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { loadData(); }, [loadData]);

  // Build combined graph
  const { graphNodes, graphEdges } = useMemo(() => {
    const filtered = activeRepo ? repoArchs.filter(r => r.repoId === activeRepo) : repoArchs;
    const allSvcs: Array<ParsedService & { repoIdx: number; repoName: string; repoId: string }> = [];
    const allConns: ParsedConnection[] = [];

    filtered.forEach((arch, ri) => {
      arch.services.forEach(svc => {
        // Prefix service IDs with repo name to avoid collisions
        const prefixed = { ...svc, id: `${arch.repoName}/${svc.id}` };
        if (searchQuery && !svc.name.toLowerCase().includes(searchQuery.toLowerCase())) return;
        allSvcs.push({ ...prefixed, repoIdx: ri, repoName: arch.repoName, repoId: arch.repoId });
      });
      arch.connections.forEach(conn => {
        allConns.push({ ...conn, from: `${arch.repoName}/${conn.from}`, to: `${arch.repoName}/${conn.to}` });
      });
    });

    // Group by tier
    const tierGroups: Record<string, typeof allSvcs> = {};
    for (const svc of allSvcs) {
      const t = svc.tier; if (!tierGroups[t]) tierGroups[t] = [];
      tierGroups[t].push(svc);
    }

    const tiers = Object.keys(tierGroups);
    const nodes: Node[] = [];
    tiers.forEach((tier, ti) => {
      tierGroups[tier].forEach((svc, si) => {
        const connCount = allConns.filter(c => c.from === svc.id || c.to === svc.id).length;
        const repoColor = repoColors[svc.repoIdx % repoColors.length];
        nodes.push({
          id: svc.id, type: 'archServiceNode',
          position: { x: 60 + si * 230, y: 50 + ti * 210 },
          data: {
            serviceId: svc.id, label: svc.name, type: svc.type, tier: svc.tier,
            port: svc.port, description: `[${svc.repoName}] ${svc.description}`,
            endpointCount: svc.endpoints.length + svc.modules.reduce((s, m) => s + m.endpoints.length, 0),
            databaseCount: svc.databases.length, moduleCount: svc.modules.length, connectionCount: connCount,
          } as ArchNodeData,
          // Add subtle repo border color
          style: { outline: `2px solid ${repoColor}30`, outlineOffset: '2px', borderRadius: '14px' },
        });
      });
    });

    const svcIds = new Set(nodes.map(n => n.id));
    const edges: Edge[] = allConns
      .filter(c => svcIds.has(c.from) && svcIds.has(c.to))
      .map((conn, i) => ({
        id: `e-${i}`, source: conn.from, target: conn.to,
        label: conn.label || conn.protocol, type: 'smoothstep',
        animated: ['kafka', 'redis', 'websocket'].includes(conn.protocol.toLowerCase()),
        markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: protocolColors[conn.protocol.toLowerCase()] || '#52525b' },
        style: { stroke: protocolColors[conn.protocol.toLowerCase()] || '#52525b', strokeWidth: 1.5 },
        labelStyle: { fill: '#a1a1aa', fontSize: 9 },
        labelBgStyle: { fill: '#18181b', fillOpacity: 0.9 },
        labelBgPadding: [5, 3] as [number, number],
        labelBgBorderRadius: 4,
      }));

    return { graphNodes: nodes, graphEdges: edges };
  }, [repoArchs, activeRepo, searchQuery]);

  const [nodes, setNodes, onNodesChange] = useNodesState(graphNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(graphEdges);
  useEffect(() => { setNodes(graphNodes); setEdges(graphEdges); }, [graphNodes, graphEdges, setNodes, setEdges]);

  const onNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    // Navigate to the repo detail page
    const repoName = node.id.split('/')[0];
    const arch = repoArchs.find(r => r.repoName === repoName);
    if (arch) navigate(`/repo/${arch.repoId}`);
  }, [repoArchs, navigate]);

  const [showDashboard, setShowDashboard] = useState(true);

  // Aggregate stats
  const totalServices = repoArchs.reduce((s, r) => s + r.services.length, 0);
  const totalConnections = repoArchs.reduce((s, r) => s + r.connections.length, 0);
  const totalIssues = repoArchs.reduce((s, r) => s + r.issues.length, 0);
  const totalEndpoints = repoArchs.reduce((s, r) => s + r.services.reduce((es, svc) => es + svc.endpoints.length + svc.modules.reduce((ms, m) => ms + m.endpoints.length, 0), 0), 0);
  const allTech = [...new Set(repoArchs.flatMap(r => r.techStack.map(t => t.name)))];
  const serviceTypes = repoArchs.flatMap(r => r.services.map(s => s.type)).reduce((acc, t) => { acc[t] = (acc[t] || 0) + 1; return acc; }, {} as Record<string, number>);
  const errorIssues = repoArchs.reduce((s, r) => s + r.issues.filter(i => i.severity === 'error').length, 0);
  const warningIssues = repoArchs.reduce((s, r) => s + r.issues.filter(i => i.severity === 'warning').length, 0);

  if (loading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-zinc-500" /></div>;
  if (!project) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-sm text-red-400">Project not found</div>;

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      {/* Nav */}
      <nav className="border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-[1600px] mx-auto px-4 h-12 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/dashboard')} className="text-zinc-400 hover:text-white"><ArrowLeft className="w-3.5 h-3.5" /></button>
            <FolderOpen className="w-4 h-4 text-zinc-400" />
            <span className="text-sm font-semibold">{project.name}</span>
            <span className="text-[10px] text-zinc-500">{repoArchs.length} repos analyzed</span>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-5">
            <div className="text-center"><div className="text-sm font-bold text-blue-400">{totalServices}</div><div className="text-[8px] text-zinc-500 uppercase">Services</div></div>
            <div className="text-center"><div className="text-sm font-bold text-green-400">{totalConnections}</div><div className="text-[8px] text-zinc-500 uppercase">Connections</div></div>
            <div className="text-center"><div className="text-sm font-bold text-yellow-400">{totalIssues}</div><div className="text-[8px] text-zinc-500 uppercase">Issues</div></div>
            <div className="text-center"><div className="text-sm font-bold text-purple-400">{repoArchs.length}</div><div className="text-[8px] text-zinc-500 uppercase">Repos</div></div>
          </div>

          <button onClick={() => setShowDashboard(p => !p)} className={`px-2.5 py-1.5 rounded-lg text-[10px] font-medium transition-colors ${showDashboard ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300 border border-zinc-800'}`}>Dashboard</button>
          <button onClick={loadData} className="p-2 rounded-lg border border-zinc-800 hover:bg-zinc-800"><RefreshCw className="w-3.5 h-3.5 text-zinc-400" /></button>
        </div>
      </nav>

      {/* Filter bar */}
      <div className="border-b border-zinc-800/50 bg-zinc-900/30">
        <div className="max-w-[1600px] mx-auto px-4 py-2 flex items-center gap-3">
          <div className="relative w-44">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500" />
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search services..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/50 text-[11px] placeholder-zinc-500 focus:outline-none focus:border-zinc-600" />
          </div>

          {/* Repo filter chips */}
          <button onClick={() => setActiveRepo(null)}
            className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors ${!activeRepo ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}>
            All repos
          </button>
          {repoArchs.map((arch, i) => (
            <button key={arch.repoId} onClick={() => setActiveRepo(activeRepo === arch.repoId ? null : arch.repoId)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors ${
                activeRepo === arch.repoId ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`} style={{ backgroundColor: activeRepo === arch.repoId ? `${repoColors[i % repoColors.length]}30` : 'transparent' }}>
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: repoColors[i % repoColors.length] }} />
              {arch.repoName}
              <span className="text-zinc-600">{arch.services.length}</span>
            </button>
          ))}

          <div className="flex-1" />

          {/* Tech stack badges */}
          <div className="flex flex-wrap gap-1 max-w-[400px] overflow-hidden">
            {allTech.slice(0, 12).map(t => (
              <span key={t} className="px-1.5 py-0.5 rounded-full bg-zinc-800 text-[8px] text-zinc-400 border border-zinc-700/50">{t}</span>
            ))}
            {allTech.length > 12 && <span className="text-[9px] text-zinc-600">+{allTech.length - 12}</span>}
          </div>
        </div>
      </div>

      {/* Graph */}
      {/* Ecosystem Dashboard */}
      {showDashboard && repoArchs.length > 0 && (
        <div className="border-b border-zinc-800/50 bg-zinc-900/20">
          <div className="max-w-[1600px] mx-auto px-4 py-4">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {/* Per-repo breakdown */}
              {repoArchs.map((arch, i) => (
                <div key={arch.repoId} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                  <div className="flex items-center gap-1.5 mb-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: repoColors[i % repoColors.length] }} />
                    <span className="text-[11px] font-medium truncate">{arch.repoName}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-center">
                    <div><div className="text-sm font-bold text-zinc-200">{arch.services.length}</div><div className="text-[7px] text-zinc-600">SVC</div></div>
                    <div><div className="text-sm font-bold text-zinc-200">{arch.connections.length}</div><div className="text-[7px] text-zinc-600">CONN</div></div>
                    <div><div className="text-sm font-bold text-zinc-200">{arch.issues.length}</div><div className="text-[7px] text-zinc-600">ISSUES</div></div>
                  </div>
                </div>
              ))}
              {/* Service types */}
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                <div className="text-[9px] text-zinc-500 uppercase tracking-wider mb-2">Service Types</div>
                <div className="space-y-1">
                  {Object.entries(serviceTypes).sort(([,a],[,b]) => b - a).slice(0, 5).map(([type, count]) => (
                    <div key={type} className="flex items-center justify-between text-[10px]">
                      <span className="text-zinc-400">{type}</span>
                      <span className="text-zinc-300 font-medium">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Issue summary */}
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
                <div className="text-[9px] text-zinc-500 uppercase tracking-wider mb-2">Issues</div>
                <div className="space-y-1">
                  {errorIssues > 0 && <div className="flex items-center justify-between text-[10px]"><span className="text-red-400">Errors</span><span className="text-red-400 font-bold">{errorIssues}</span></div>}
                  {warningIssues > 0 && <div className="flex items-center justify-between text-[10px]"><span className="text-yellow-400">Warnings</span><span className="text-yellow-400 font-bold">{warningIssues}</span></div>}
                  <div className="flex items-center justify-between text-[10px]"><span className="text-zinc-400">Total</span><span className="text-zinc-300 font-bold">{totalIssues}</span></div>
                  <div className="flex items-center justify-between text-[10px]"><span className="text-zinc-400">Endpoints</span><span className="text-zinc-300 font-bold">{totalEndpoints}</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Graph */}
      <div className={`flex-1 ${showDashboard && repoArchs.length > 0 ? 'h-[calc(100vh-250px)]' : 'h-[calc(100vh-110px)]'}`}>
        {nodes.length > 0 ? (
          <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.15 }}
            minZoom={0.15} maxZoom={2} defaultEdgeOptions={{ type: 'smoothstep' }} proOptions={{ hideAttribution: true }}>
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#27272a" />
            <Controls showInteractive={false} />
            <MiniMap nodeColor={(n) => {
              const d = n.data as ArchNodeData;
              return tierColors[d?.tier] || '#52525b';
            }} maskColor="rgba(0,0,0,0.7)" style={{ width: 160, height: 100 }} />
          </ReactFlow>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <Server className="w-10 h-10 text-zinc-700" />
            <p className="text-sm text-zinc-500">{project.repos?.length > 0 ? 'No repos analyzed yet. Click a repo to analyze it.' : 'No repos in this project.'}</p>
            <button onClick={() => navigate('/dashboard')} className="text-xs text-blue-400 hover:text-blue-300">Go to dashboard</button>
          </div>
        )}

        {/* Legend */}
        <div className="absolute bottom-3 left-3 rounded-xl border border-zinc-800 bg-zinc-900/90 backdrop-blur-sm p-3 z-10 text-[9px]">
          <div className="font-semibold text-zinc-400 mb-1.5 uppercase tracking-wider">Repos</div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2">
            {repoArchs.map((arch, i) => (
              <div key={arch.repoId} className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: repoColors[i % repoColors.length] }} />
                <span className="text-zinc-400">{arch.repoName}</span>
              </div>
            ))}
          </div>
          <div className="font-semibold text-zinc-400 mb-1 uppercase tracking-wider">Protocols</div>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {Object.entries(protocolColors).map(([p, c]) => (
              <div key={p} className="flex items-center gap-1"><div className="w-3 h-0.5 rounded" style={{ backgroundColor: c }} /><span className="text-zinc-400">{p}</span></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
