import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface ConnectedRepo {
  id: string;
  name: string;
  fullName: string;
  lastAnalyzed: string | null;
  status: 'analyzing' | 'ready' | 'error' | 'pending';
  services: number;
  issues: number;
}

// Mock data — will be replaced with real API calls
const mockRepos: ConnectedRepo[] = [];

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [repos, setRepos] = useState<ConnectedRepo[]>(mockRepos);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  const filteredRepos = repos.filter(r =>
    r.fullName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const statusIcon = (status: ConnectedRepo['status']) => {
    switch (status) {
      case 'analyzing': return <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />;
      case 'ready': return <CheckCircle2 className="w-4 h-4 text-green-400" />;
      case 'error': return <AlertCircle className="w-4 h-4 text-red-400" />;
      case 'pending': return <Clock className="w-4 h-4 text-zinc-500" />;
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
            <button
              onClick={() => {}}
              className="text-xs text-zinc-400 hover:text-white transition-colors px-3 py-1.5"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
            <div className="flex items-center gap-2 pl-3 border-l border-zinc-800">
              {user?.photoURL ? (
                <img src={user.photoURL} alt="" className="w-6 h-6 rounded-full" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-zinc-700" />
              )}
              <span className="text-xs text-zinc-400 hidden md:block">{user?.displayName || user?.email}</span>
              <button onClick={handleSignOut} className="ml-1 text-zinc-500 hover:text-zinc-300">
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Repositories</h1>
            <p className="text-sm text-zinc-400 mt-1">
              {repos.length} connected · {repos.filter(r => r.status === 'ready').length} analyzed
            </p>
          </div>
          <button
            onClick={() => setShowConnectModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Connect Repo
          </button>
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

        {/* Empty state */}
        {repos.length === 0 && (
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
              onClick={() => setShowConnectModal(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 transition-colors text-sm font-medium"
            >
              <Github className="w-4 h-4" />
              Connect GitHub Repository
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
                className={`rounded-xl border border-zinc-800 bg-zinc-900/30 p-5 transition-all ${
                  repo.status === 'ready' ? 'hover:border-zinc-600 cursor-pointer' : ''
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <Github className="w-5 h-5 text-zinc-500" />
                    <div>
                      <h3 className="text-sm font-semibold">{repo.fullName}</h3>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="flex items-center gap-1 text-xs text-zinc-500">
                          {statusIcon(repo.status)}
                          {repo.status === 'analyzing' ? 'Analyzing...' :
                           repo.status === 'ready' ? `${repo.services} services` :
                           repo.status === 'error' ? 'Analysis failed' :
                           'Pending'}
                        </span>
                        {repo.issues > 0 && (
                          <span className="flex items-center gap-1 text-xs text-yellow-500">
                            <AlertCircle className="w-3 h-3" />
                            {repo.issues} issues
                          </span>
                        )}
                        {repo.lastAnalyzed && (
                          <span className="flex items-center gap-1 text-xs text-zinc-600">
                            <Clock className="w-3 h-3" />
                            {repo.lastAnalyzed}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {repo.status === 'ready' && (
                    <ExternalLink className="w-4 h-4 text-zinc-600" />
                  )}
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
            onConnect={(repo) => {
              setRepos(prev => [...prev, repo]);
              setShowConnectModal(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ConnectRepoModal({
  onClose,
  onConnect,
}: {
  onClose: () => void;
  onConnect: (repo: ConnectedRepo) => void;
}) {
  const [repoUrl, setRepoUrl] = useState('');
  const [loading, setLoading] = useState(false);

  const handleConnect = async () => {
    if (!repoUrl.trim()) return;
    setLoading(true);

    // Extract owner/repo from URL or direct input
    const match = repoUrl.match(/(?:github\.com\/)?([^/]+\/[^/]+)/);
    const fullName = match ? match[1].replace(/\.git$/, '') : repoUrl.trim();
    const name = fullName.split('/').pop() || fullName;

    // TODO: Replace with real GitHub API + webhook setup
    const newRepo: ConnectedRepo = {
      id: crypto.randomUUID(),
      name,
      fullName,
      lastAnalyzed: null,
      status: 'analyzing',
      services: 0,
      issues: 0,
    };

    // Simulate analysis starting
    setTimeout(() => setLoading(false), 500);
    onConnect(newRepo);
  };

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
        className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6"
      >
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-lg bg-zinc-800 flex items-center justify-center">
            <Github className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <h3 className="text-base font-semibold">Connect Repository</h3>
            <p className="text-xs text-zinc-500">Enter the GitHub repository URL or owner/repo</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-zinc-400 mb-1.5 block">Repository</label>
            <div className="flex items-center gap-2">
              <div className="flex-shrink-0 px-3 py-2.5 rounded-l-lg border border-r-0 border-zinc-700 bg-zinc-800 text-xs text-zinc-400">
                <GitBranch className="w-3.5 h-3.5" />
              </div>
              <input
                type="text"
                value={repoUrl}
                onChange={e => setRepoUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleConnect()}
                placeholder="owner/repository or GitHub URL"
                className="flex-1 px-3 py-2.5 rounded-r-lg border border-zinc-700 bg-zinc-800/50 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
                autoFocus
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-lg border border-zinc-700 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConnect}
              disabled={!repoUrl.trim() || loading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Connect
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
