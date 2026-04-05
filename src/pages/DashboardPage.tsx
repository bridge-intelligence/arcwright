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
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { reposApi, type RepoResponse, type GitHubAvailableRepo } from '../services/api';

export default function DashboardPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, signOut, connectGitHub } = useAuth();
  const [repos, setRepos] = useState<RepoResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Check if GitHub was just connected
  useEffect(() => {
    if (searchParams.get('github') === 'connected') {
      // Refresh user to get github_username
      window.history.replaceState({}, '', '/dashboard');
    }
  }, [searchParams]);

  // Load repos
  const loadRepos = useCallback(async () => {
    try {
      setLoading(true);
      const data = await reposApi.list();
      setRepos(data);
    } catch (err) {
      console.error('Failed to load repos:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRepos(); }, [loadRepos]);

  // Poll for analyzing repos
  useEffect(() => {
    const analyzing = repos.some(r => r.status === 'analyzing');
    if (!analyzing) return;
    const interval = setInterval(loadRepos, 5000);
    return () => clearInterval(interval);
  }, [repos, loadRepos]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const filteredRepos = repos.filter(r =>
    r.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
    if (!confirm('Disconnect this repository? Analysis data will be deleted.')) return;
    try {
      await reposApi.disconnect(id);
      setRepos(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      console.error('Failed to disconnect:', err);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Top nav */}
      <nav className="border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
              <Layers className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-bold tracking-tight">Arcwright</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/explore')}
              className="text-xs text-zinc-400 hover:text-white transition-colors px-3 py-1.5"
            >
              Explorer
            </button>
            <button className="text-xs text-zinc-400 hover:text-white transition-colors px-3 py-1.5">
              <Settings className="w-3.5 h-3.5" />
            </button>
            <div className="flex items-center gap-2 pl-3 border-l border-zinc-800">
              {user?.photoURL ? (
                <img src={user.photoURL} alt="" className="w-6 h-6 rounded-full" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-[10px] text-zinc-400">
                  {user?.displayName?.[0] || user?.email?.[0] || '?'}
                </div>
              )}
              <span className="text-xs text-zinc-400 hidden md:block">{user?.displayName || user?.email}</span>
              <button onClick={handleSignOut} className="ml-1 text-zinc-500 hover:text-zinc-300">
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* GitHub connection banner */}
        {user && !user.githubConnected && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <Github className="w-5 h-5 text-yellow-500" />
              <div>
                <p className="text-sm font-medium">Connect your GitHub account</p>
                <p className="text-xs text-zinc-400">Required to connect and analyze repositories.</p>
              </div>
            </div>
            <button
              onClick={connectGitHub}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-sm font-medium transition-colors"
            >
              <Github className="w-4 h-4" />
              Connect GitHub
            </button>
          </motion.div>
        )}

        {/* GitHub connected badge */}
        {user?.githubConnected && (
          <div className="mb-6 flex items-center gap-2 text-xs text-zinc-500">
            <Github className="w-3.5 h-3.5" />
            Connected as <span className="text-zinc-300 font-medium">@{user.githubUsername}</span>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Repositories</h1>
            <p className="text-sm text-zinc-400 mt-1">
              {repos.length} connected · {repos.filter(r => r.status === 'ready').length} analyzed
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={loadRepos}
              className="p-2 rounded-lg border border-zinc-800 hover:bg-zinc-800 transition-colors"
            >
              <RefreshCw className="w-4 h-4 text-zinc-400" />
            </button>
            <button
              onClick={() => user?.githubConnected ? setShowConnectModal(true) : connectGitHub()}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 transition-colors text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              Connect Repo
            </button>
          </div>
        </div>

        {/* Search */}
        {repos.length > 0 && (
          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search repositories..."
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-zinc-800 bg-zinc-900/50 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
            />
          </div>
        )}

        {/* Loading state */}
        {loading && repos.length === 0 && (
          <div className="text-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-500 mx-auto" />
          </div>
        )}

        {/* Empty state */}
        {!loading && repos.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-20"
          >
            <div className="w-16 h-16 rounded-2xl bg-zinc-800/50 border border-zinc-700/50 flex items-center justify-center mx-auto mb-6">
              <FolderGit2 className="w-8 h-8 text-zinc-500" />
            </div>
            <h2 className="text-lg font-semibold mb-2">No repositories connected</h2>
            <p className="text-sm text-zinc-400 mb-6 max-w-md mx-auto">
              Connect your GitHub repositories to start generating AI-powered architecture docs.
            </p>
            <button
              onClick={() => user?.githubConnected ? setShowConnectModal(true) : connectGitHub()}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 transition-colors text-sm font-medium"
            >
              <Github className="w-4 h-4" />
              {user?.githubConnected ? 'Connect Repository' : 'Connect GitHub First'}
            </button>
          </motion.div>
        )}

        {/* Repo grid */}
        {filteredRepos.length > 0 && (
          <div className="grid gap-4">
            {filteredRepos.map((repo, i) => (
              <motion.div
                key={repo.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * i }}
                onClick={() => repo.status === 'ready' && navigate(`/repo/${repo.id}`)}
                className={`group rounded-xl border border-zinc-800 bg-zinc-900/30 p-5 transition-all ${
                  repo.status === 'ready' ? 'hover:border-zinc-600 cursor-pointer' : ''
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <Github className="w-5 h-5 text-zinc-500" />
                    <div>
                      <h3 className="text-sm font-semibold">{repo.full_name}</h3>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="flex items-center gap-1 text-xs text-zinc-500">
                          {statusIcon(repo.status)}
                          {repo.status === 'analyzing' ? 'Analyzing...' :
                           repo.status === 'ready' ? `${repo.services ?? 0} services` :
                           repo.status === 'error' ? 'Analysis failed' :
                           'Pending'}
                        </span>
                        {(repo.issues ?? 0) > 0 && (
                          <span className="flex items-center gap-1 text-xs text-yellow-500">
                            <AlertCircle className="w-3 h-3" />
                            {repo.issues} issues
                          </span>
                        )}
                        {repo.last_analyzed_at && (
                          <span className="flex items-center gap-1 text-xs text-zinc-600">
                            <Clock className="w-3 h-3" />
                            {new Date(repo.last_analyzed_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => handleDisconnect(repo.id, e)}
                      className="p-1.5 rounded-md text-zinc-600 hover:text-red-400 hover:bg-red-400/10 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    {repo.status === 'ready' && (
                      <ExternalLink className="w-4 h-4 text-zinc-600" />
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Connect repo modal */}
      <AnimatePresence>
        {showConnectModal && (
          <ConnectRepoModal
            onClose={() => setShowConnectModal(false)}
            onConnected={() => {
              setShowConnectModal(false);
              loadRepos();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ConnectRepoModal({
  onClose,
  onConnected,
}: {
  onClose: () => void;
  onConnected: () => void;
}) {
  const [available, setAvailable] = useState<GitHubAvailableRepo[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    reposApi.listAvailable()
      .then(setAvailable)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleConnect = async (repo: GitHubAvailableRepo) => {
    setConnecting(repo.full_name);
    setError(null);
    try {
      await reposApi.connect(repo.full_name);
      onConnected();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
      setConnecting(null);
    }
  };

  const filtered = available.filter(r =>
    r.full_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden"
      >
        <div className="p-6 border-b border-zinc-800">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-zinc-800 flex items-center justify-center">
              <Github className="w-4 h-4 text-white" />
            </div>
            <div>
              <h3 className="text-base font-semibold">Connect Repository</h3>
              <p className="text-xs text-zinc-500">Select a repository to analyze</p>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search repositories..."
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-zinc-700 bg-zinc-800/50 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
              autoFocus
            />
          </div>
        </div>

        {error && (
          <div className="px-6 py-3 bg-red-500/10 border-b border-red-500/20 text-xs text-red-400">
            {error}
          </div>
        )}

        <div className="max-h-[400px] overflow-y-auto">
          {loading && (
            <div className="p-8 text-center">
              <Loader2 className="w-5 h-5 animate-spin text-zinc-500 mx-auto" />
              <p className="text-xs text-zinc-500 mt-2">Loading repositories...</p>
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="p-8 text-center text-sm text-zinc-500">
              No repositories found.
            </div>
          )}

          {filtered.map(repo => (
            <div
              key={repo.id}
              className="flex items-center justify-between px-6 py-3 border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                {repo.private ? (
                  <Lock className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                ) : (
                  <Globe className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{repo.full_name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {repo.language && (
                      <span className="text-[10px] text-zinc-500">{repo.language}</span>
                    )}
                    <span className="text-[10px] text-zinc-600">
                      {new Date(repo.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleConnect(repo)}
                disabled={connecting !== null}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-xs font-medium transition-colors flex-shrink-0"
              >
                {connecting === repo.full_name ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <GitBranch className="w-3 h-3" />
                )}
                Connect
              </button>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-zinc-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-zinc-700 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            Close
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
