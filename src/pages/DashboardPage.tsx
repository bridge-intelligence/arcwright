import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Layers,
  Plus,
  Github,
  GitBranch,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
  Search,
  LogOut,
  Settings,
  FolderGit2,
  RefreshCw,
  Trash2,
  Lock,
  Globe,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  Building2,
  User,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { reposApi, projectsApi, type RepoResponse, type ProjectResponse, type GitHubAvailableRepo } from '../services/api';

export default function DashboardPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, signOut, connectGitHub } = useAuth();
  const [repos, setRepos] = useState<RepoResponse[]>([]);
  const [projects, setProjects] = useState<ProjectResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get('github') === 'connected') {
      window.history.replaceState({}, '', '/dashboard');
    }
  }, [searchParams]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [repoData, projectData] = await Promise.all([
        reposApi.list(),
        projectsApi.list(),
      ]);
      setRepos(repoData);
      setProjects(projectData);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!repos.some(r => r.status === 'analyzing')) return;
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [repos, loadData]);

  const handleSignOut = async () => { await signOut(); navigate('/'); };

  const visibleRepos = repos.filter(r => {
    if (!r.full_name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (selectedProjectId === null) return true;
    if (selectedProjectId === 'unassigned') return !r.project_id;
    return r.project_id === selectedProjectId;
  });

  const unassignedCount = repos.filter(r => !r.project_id).length;

  const statusIcon = (status: RepoResponse['status']) => {
    switch (status) {
      case 'analyzing': return <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />;
      case 'ready': return <CheckCircle2 className="w-4 h-4 text-green-400" />;
      case 'error': return <AlertCircle className="w-4 h-4 text-red-400" />;
      case 'pending': return <Clock className="w-4 h-4 text-zinc-500" />;
    }
  };

  const handleDisconnect = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Disconnect this repository?')) return;
    try { await reposApi.disconnect(id); setRepos(prev => prev.filter(r => r.id !== id)); } catch {}
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <nav className="border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center"><Layers className="w-3.5 h-3.5 text-white" /></div>
            <span className="text-sm font-bold tracking-tight">Arcwright</span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/explore')} className="text-xs text-zinc-400 hover:text-white px-3 py-1.5">Explorer</button>
            <button className="text-xs text-zinc-400 hover:text-white px-3 py-1.5"><Settings className="w-3.5 h-3.5" /></button>
            <div className="flex items-center gap-2 pl-3 border-l border-zinc-800">
              {user?.photoURL ? <img src={user.photoURL} alt="" className="w-6 h-6 rounded-full" /> :
                <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-[10px] text-zinc-400">{user?.displayName?.[0] || '?'}</div>}
              <span className="text-xs text-zinc-400 hidden md:block">{user?.displayName || user?.email}</span>
              <button onClick={handleSignOut} className="ml-1 text-zinc-500 hover:text-zinc-300"><LogOut className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {user && !user.githubConnected && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            className="mb-6 rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Github className="w-5 h-5 text-yellow-500" />
              <div><p className="text-sm font-medium">Connect your GitHub account</p><p className="text-xs text-zinc-400">Required to connect and analyze repositories.</p></div>
            </div>
            <button onClick={connectGitHub} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-sm font-medium">
              <Github className="w-4 h-4" /> Connect GitHub
            </button>
          </motion.div>
        )}
        {user?.githubConnected && (
          <div className="mb-6 flex items-center gap-2 text-xs text-zinc-500">
            <Github className="w-3.5 h-3.5" /> Connected as <span className="text-zinc-300 font-medium">@{user.githubUsername}</span>
          </div>
        )}

        <div className="flex gap-8">
          {/* Sidebar */}
          <div className="w-52 flex-shrink-0">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Projects</h2>
              <button onClick={() => setShowNewProject(true)} className="text-zinc-500 hover:text-zinc-300"><Plus className="w-3.5 h-3.5" /></button>
            </div>
            <div className="space-y-0.5">
              <button onClick={() => setSelectedProjectId(null)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${selectedProjectId === null ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-800/50'}`}>
                <FolderGit2 className="w-3.5 h-3.5" /> All <span className="ml-auto text-zinc-600">{repos.length}</span>
              </button>
              {projects.map(p => (
                <button key={p.id} onClick={() => setSelectedProjectId(p.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${selectedProjectId === p.id ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-800/50'}`}>
                  <FolderOpen className="w-3.5 h-3.5" /> <span className="truncate">{p.name}</span> <span className="ml-auto text-zinc-600">{p.repo_count}</span>
                </button>
              ))}
              {unassignedCount > 0 && (
                <button onClick={() => setSelectedProjectId('unassigned')}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${selectedProjectId === 'unassigned' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-800/50'}`}>
                  <GitBranch className="w-3.5 h-3.5" /> Unassigned <span className="ml-auto text-zinc-600">{unassignedCount}</span>
                </button>
              )}
            </div>
          </div>

          {/* Main */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h1 className="text-xl font-bold">
                  {selectedProjectId === null ? 'All Repositories' : selectedProjectId === 'unassigned' ? 'Unassigned' : projects.find(p => p.id === selectedProjectId)?.name || 'Repositories'}
                </h1>
                <p className="text-xs text-zinc-400 mt-0.5">{visibleRepos.length} repos · {visibleRepos.filter(r => r.status === 'ready').length} analyzed</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={loadData} className="p-2 rounded-lg border border-zinc-800 hover:bg-zinc-800"><RefreshCw className="w-3.5 h-3.5 text-zinc-400" /></button>
                <button onClick={() => user?.githubConnected ? setShowConnectModal(true) : connectGitHub()}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-medium"><Plus className="w-3.5 h-3.5" /> Connect Repos</button>
              </div>
            </div>

            {repos.length > 3 && (
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search..."
                  className="w-full pl-9 pr-4 py-2 rounded-lg border border-zinc-800 bg-zinc-900/50 text-xs placeholder-zinc-500 focus:outline-none focus:border-zinc-600" />
              </div>
            )}

            {loading && repos.length === 0 && <div className="text-center py-16"><Loader2 className="w-5 h-5 animate-spin text-zinc-500 mx-auto" /></div>}

            {!loading && visibleRepos.length === 0 && (
              <div className="text-center py-16">
                <FolderGit2 className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                <p className="text-xs text-zinc-500 mb-4">No repositories here yet.</p>
                <button onClick={() => user?.githubConnected ? setShowConnectModal(true) : connectGitHub()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-medium"><Plus className="w-3.5 h-3.5" /> Connect Repos</button>
              </div>
            )}

            <div className="grid gap-2">
              {visibleRepos.map((repo, i) => (
                <motion.div key={repo.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.02 * i }}
                  className="group rounded-lg border border-zinc-800 bg-zinc-900/30 p-3.5 hover:border-zinc-700 transition-all cursor-pointer"
                  onClick={() => navigate(`/repo/${repo.id}`)}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Github className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                      <div className="min-w-0">
                        <h3 className="text-sm font-medium truncate">{repo.full_name}</h3>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="flex items-center gap-1 text-[11px] text-zinc-500">{statusIcon(repo.status)}
                            {repo.status === 'analyzing' ? 'Analyzing...' : repo.status === 'ready' ? `${repo.services ?? 0} services` : repo.status === 'error' ? 'Failed' : 'Pending'}
                          </span>
                          {(repo.issues ?? 0) > 0 && <span className="flex items-center gap-1 text-[11px] text-yellow-500"><AlertCircle className="w-3 h-3" />{repo.issues}</span>}
                          {repo.last_analyzed_at && <span className="text-[11px] text-zinc-600">{new Date(repo.last_analyzed_at).toLocaleDateString()}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {repo.status === 'error' && (
                        <button onClick={async (e) => { e.stopPropagation(); await reposApi.retry(repo.id); loadData(); }}
                          className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-blue-400 hover:bg-blue-400/10 border border-blue-500/20">
                          <RefreshCw className="w-3 h-3" /> Retry
                        </button>
                      )}
                      <button onClick={(e) => handleDisconnect(repo.id, e)} className="p-1 rounded text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100"><Trash2 className="w-3 h-3" /></button>
                      {repo.status === 'ready' && <ExternalLink className="w-3.5 h-3.5 text-zinc-600" />}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showNewProject && <NewProjectModal onClose={() => setShowNewProject(false)} onCreated={p => { setProjects(prev => [p, ...prev]); setSelectedProjectId(p.id); setShowNewProject(false); }} />}
      </AnimatePresence>
      <AnimatePresence>
        {showConnectModal && <ConnectRepoModal projects={projects} selectedProjectId={selectedProjectId !== 'unassigned' ? selectedProjectId : null}
          onClose={() => setShowConnectModal(false)} onConnected={() => { setShowConnectModal(false); loadData(); }} />}
      </AnimatePresence>
    </div>
  );
}

function NewProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: (p: ProjectResponse) => void }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [loading, setLoading] = useState(false);
  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const r = await projectsApi.create(name.trim(), desc.trim() || undefined);
      onCreated({ ...r, description: desc.trim() || null, repo_count: 0, analyzed_count: 0, created_at: new Date().toISOString() });
    } catch {} finally { setLoading(false); }
  };
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-6" onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
        onClick={e => e.stopPropagation()} className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6">
        <h3 className="text-sm font-semibold mb-4">New Project</h3>
        <div className="space-y-3">
          <div><label className="text-[11px] text-zinc-400 mb-1 block">Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Bridge Ecosystem"
              className="w-full px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-800/50 text-sm placeholder-zinc-500 focus:outline-none focus:border-zinc-500" autoFocus /></div>
          <div><label className="text-[11px] text-zinc-400 mb-1 block">Description</label>
            <input type="text" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Group of related repos"
              className="w-full px-3 py-2 rounded-lg border border-zinc-700 bg-zinc-800/50 text-sm placeholder-zinc-500 focus:outline-none focus:border-zinc-500" /></div>
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-zinc-700 text-sm text-zinc-300 hover:bg-zinc-800">Cancel</button>
            <button onClick={handleCreate} disabled={!name.trim() || loading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm font-medium">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4" /> Create</>}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function ConnectRepoModal({ projects, selectedProjectId, onClose, onConnected }: {
  projects: ProjectResponse[]; selectedProjectId: string | null; onClose: () => void; onConnected: () => void;
}) {
  const [orgs, setOrgs] = useState<Array<{ name: string; is_personal: boolean; repos: GitHubAvailableRepo[] }>>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<Set<string>>(new Set());
  const [connected, setConnected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [expandedOrgs, setExpandedOrgs] = useState<Set<string>>(new Set());
  const [projectId, setProjectId] = useState<string | null>(selectedProjectId);

  useEffect(() => {
    reposApi.listAvailable()
      .then(data => { setOrgs(data.organizations); setExpandedOrgs(new Set(data.organizations.map(o => o.name))); })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleConnect = async (repo: GitHubAvailableRepo) => {
    setConnecting(prev => new Set(prev).add(repo.full_name));
    setError(null);
    try {
      await reposApi.connect(repo.full_name, projectId || undefined);
      setConnected(prev => new Set(prev).add(repo.full_name));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
    } finally {
      setConnecting(prev => { const n = new Set(prev); n.delete(repo.full_name); return n; });
    }
  };

  const toggleOrg = (name: string) => setExpandedOrgs(prev => { const n = new Set(prev); if (n.has(name)) n.delete(name); else n.add(name); return n; });

  const filteredOrgs = orgs.map(o => ({ ...o, repos: o.repos.filter(r => !connected.has(r.full_name) && r.full_name.toLowerCase().includes(search.toLowerCase())) })).filter(o => o.repos.length > 0);
  const addedCount = connected.size;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-6" onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }}
        onClick={e => e.stopPropagation()} className="w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden">
        <div className="p-5 border-b border-zinc-800">
          <div className="flex items-center gap-3 mb-3">
            <Github className="w-5 h-5 text-white" />
            <div><h3 className="text-sm font-semibold">Connect Repositories</h3><p className="text-[11px] text-zinc-500">Select repos to analyze</p></div>
          </div>
          <div className="flex items-center gap-2 mb-3">
            <label className="text-[11px] text-zinc-500">Project:</label>
            <select value={projectId || ''} onChange={e => setProjectId(e.target.value || null)}
              className="px-2 py-1 rounded-md border border-zinc-700 bg-zinc-800 text-xs focus:outline-none">
              <option value="">None</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search repos..."
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-zinc-700 bg-zinc-800/50 text-xs placeholder-zinc-500 focus:outline-none focus:border-zinc-500" autoFocus />
          </div>
        </div>
        {error && <div className="px-5 py-2 bg-red-500/10 border-b border-red-500/20 text-[11px] text-red-400">{error}</div>}
        <div className="max-h-[400px] overflow-y-auto">
          {loading && <div className="p-8 text-center"><Loader2 className="w-5 h-5 animate-spin text-zinc-500 mx-auto" /></div>}
          {!loading && filteredOrgs.length === 0 && <div className="p-8 text-center text-xs text-zinc-500">No repos found.</div>}
          {filteredOrgs.map(org => (
            <div key={org.name}>
              <button onClick={() => toggleOrg(org.name)}
                className="w-full flex items-center gap-2 px-5 py-2 bg-zinc-800/50 border-b border-zinc-800/50 hover:bg-zinc-800">
                {expandedOrgs.has(org.name) ? <ChevronDown className="w-3 h-3 text-zinc-500" /> : <ChevronRight className="w-3 h-3 text-zinc-500" />}
                {org.is_personal ? <User className="w-3.5 h-3.5 text-zinc-400" /> : <Building2 className="w-3.5 h-3.5 text-zinc-400" />}
                <span className="text-xs font-medium text-zinc-300">{org.name}</span>
                <span className="text-[10px] text-zinc-600 ml-auto">{org.repos.length}</span>
              </button>
              {expandedOrgs.has(org.name) && org.repos.map(repo => (
                <div key={repo.id} className="flex items-center justify-between px-5 py-2 border-b border-zinc-800/30 hover:bg-zinc-800/20">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {repo.private ? <Lock className="w-3 h-3 text-zinc-600" /> : <Globe className="w-3 h-3 text-zinc-600" />}
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{repo.name}</p>
                      <div className="flex items-center gap-2">
                        {repo.language && <span className="text-[10px] text-zinc-500">{repo.language}</span>}
                        {repo.description && <span className="text-[10px] text-zinc-600 truncate max-w-[180px]">{repo.description}</span>}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => handleConnect(repo)} disabled={connecting.size > 0}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-[11px] font-medium flex-shrink-0">
                    {connecting.has(repo.full_name) ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />} Add
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="p-3 border-t border-zinc-800 flex justify-between items-center">
          {addedCount > 0 ? <span className="text-[11px] text-green-400">{addedCount} repo{addedCount > 1 ? 's' : ''} added</span> : <span />}
          <div className="flex gap-2">
            {addedCount > 0 && <button onClick={onConnected} className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-medium">Done</button>}
            <button onClick={addedCount > 0 ? onConnected : onClose} className="px-3 py-1.5 rounded-lg border border-zinc-700 text-xs text-zinc-300 hover:bg-zinc-800">
              {addedCount > 0 ? 'Close' : 'Cancel'}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
