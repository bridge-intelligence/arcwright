import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  GitBranch,
  Cpu,
  Layers,
  Zap,
  ArrowRight,
  Github,
  Shield,
  RefreshCw,
  Code2,
  Network,
  FileCode2,
  Search,
  ChevronDown,
} from 'lucide-react';

const features = [
  {
    icon: Github,
    title: 'Connect Your Repos',
    description: 'Link your GitHub repositories with one click. Arcwright scans your codebase and maps every service, module, and dependency.',
  },
  {
    icon: Cpu,
    title: 'AI-Powered Analysis',
    description: 'Cloudflare Workers AI analyzes your code structure, generates architecture diagrams, and identifies integration patterns — all in XML.',
  },
  {
    icon: Network,
    title: 'Interactive Visualizations',
    description: 'Explore your architecture as a live network graph. Filter by service, protocol, tier, and trace data flows across your entire stack.',
  },
  {
    icon: RefreshCw,
    title: 'Live Sync on Commit',
    description: 'Push to GitHub, Arcwright regenerates. Architecture docs stay current with every commit via webhook-driven analysis.',
  },
  {
    icon: Search,
    title: 'Detect Issues',
    description: 'Find dangling code, orphaned services, circular dependencies, and undocumented integrations before they become problems.',
  },
  {
    icon: FileCode2,
    title: 'XML Architecture Docs',
    description: 'Machine-readable XML output for every repo: wiring diagrams, integration maps, service boundaries, and API surface area.',
  },
];

const stats = [
  { value: '30+', label: 'Services Mapped' },
  { value: '<5s', label: 'Analysis Time' },
  { value: 'Live', label: 'Sync on Push' },
  { value: 'XML', label: 'Doc Format' },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const [hoveredFeature, setHoveredFeature] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-zinc-950 text-white overflow-y-auto">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
              <Layers className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight">Arcwright</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/login')}
              className="text-sm text-zinc-400 hover:text-white transition-colors"
            >
              Sign in
            </button>
            <button
              onClick={() => navigate('/login')}
              className="text-sm px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 transition-colors font-medium"
            >
              Get Started
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-zinc-700/50 bg-zinc-900/50 text-xs text-zinc-400 mb-8">
              <Zap className="w-3 h-3 text-yellow-500" />
              AI-powered architecture intelligence
            </div>

            <h1 className="text-5xl md:text-7xl font-bold tracking-tight leading-[1.1] mb-6">
              Your codebase,
              <br />
              <span className="bg-gradient-to-r from-blue-400 via-violet-400 to-cyan-400 bg-clip-text text-transparent">
                architectured.
              </span>
            </h1>

            <p className="text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed">
              Connect your GitHub repos. Arcwright analyzes your code with AI, generates architecture
              diagrams, detects issues, and keeps everything in sync — live, on every commit.
            </p>

            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => navigate('/login')}
                className="group flex items-center gap-2 px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 transition-all font-medium text-sm"
              >
                <Github className="w-4 h-4" />
                Sign in with Google
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </button>
              <button
                onClick={() => navigate('/explore')}
                className="flex items-center gap-2 px-6 py-3 rounded-lg border border-zinc-700 hover:border-zinc-500 transition-colors text-sm text-zinc-300"
              >
                <Code2 className="w-4 h-4" />
                Explore Demo
              </button>
            </div>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl mx-auto"
          >
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-2xl font-bold text-white">{stat.value}</div>
                <div className="text-xs text-zinc-500 mt-1">{stat.label}</div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Architecture Preview */}
      <section className="px-6 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="max-w-6xl mx-auto"
        >
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 overflow-hidden shadow-2xl shadow-blue-500/5">
            {/* Browser chrome */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-800 bg-zinc-900/80">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-zinc-700" />
                <div className="w-3 h-3 rounded-full bg-zinc-700" />
                <div className="w-3 h-3 rounded-full bg-zinc-700" />
              </div>
              <div className="flex-1 flex justify-center">
                <div className="px-4 py-1 rounded-md bg-zinc-800 text-xs text-zinc-500 font-mono">
                  app.arcwright.dev/dashboard
                </div>
              </div>
            </div>
            {/* Content area */}
            <div className="p-8 md:p-12 flex items-center justify-center min-h-[300px]">
              <div className="grid grid-cols-3 md:grid-cols-5 gap-4 w-full max-w-2xl">
                {['Gateway', 'Orchestra', 'Custody', 'Ledger', 'Wallet'].map((name, i) => (
                  <motion.div
                    key={name}
                    initial={{ opacity: 0, scale: 0.8 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: 0.1 * i }}
                    className="aspect-square rounded-xl border border-zinc-700/50 bg-zinc-800/50 flex flex-col items-center justify-center gap-2 p-3"
                  >
                    <div className={`w-3 h-3 rounded-full ${i < 3 ? 'bg-green-500' : 'bg-yellow-500'}`} />
                    <span className="text-[10px] text-zinc-400 text-center leading-tight">{name}</span>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Scroll indicator */}
      <div className="flex justify-center pb-8">
        <motion.div
          animate={{ y: [0, 6, 0] }}
          transition={{ repeat: Infinity, duration: 2 }}
        >
          <ChevronDown className="w-5 h-5 text-zinc-600" />
        </motion.div>
      </div>

      {/* Features */}
      <section className="px-6 py-20 border-t border-zinc-800/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">How it works</h2>
            <p className="text-zinc-400 max-w-xl mx-auto">
              From repo connection to live architecture docs in three steps.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence>
              {features.map((feature, i) => (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: 0.08 * i }}
                  onMouseEnter={() => setHoveredFeature(i)}
                  onMouseLeave={() => setHoveredFeature(null)}
                  className={`group rounded-xl border p-6 transition-all duration-300 ${
                    hoveredFeature === i
                      ? 'border-blue-500/30 bg-blue-500/5 shadow-lg shadow-blue-500/5'
                      : 'border-zinc-800 bg-zinc-900/30 hover:border-zinc-700'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-4 transition-colors ${
                    hoveredFeature === i ? 'bg-blue-500/20' : 'bg-zinc-800'
                  }`}>
                    <feature.icon className={`w-5 h-5 transition-colors ${
                      hoveredFeature === i ? 'text-blue-400' : 'text-zinc-400'
                    }`} />
                  </div>
                  <h3 className="text-base font-semibold mb-2">{feature.title}</h3>
                  <p className="text-sm text-zinc-400 leading-relaxed">{feature.description}</p>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </section>

      {/* How it works steps */}
      <section className="px-6 py-20 border-t border-zinc-800/50">
        <div className="max-w-4xl mx-auto">
          <div className="space-y-12">
            {[
              {
                step: '01',
                icon: Shield,
                title: 'Sign in & connect',
                desc: 'Authenticate with Google SSO, then link your GitHub account. Select which repositories to analyze.',
              },
              {
                step: '02',
                icon: Cpu,
                title: 'AI analyzes your code',
                desc: 'Our AI worker scans your repo structure, parses imports, traces API calls, and generates comprehensive XML architecture docs.',
              },
              {
                step: '03',
                icon: GitBranch,
                title: 'Live architecture, always current',
                desc: 'GitHub webhooks trigger re-analysis on every push. Your architecture diagrams evolve with your code.',
              },
            ].map((item, i) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.1 * i }}
                className="flex gap-6 items-start"
              >
                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-zinc-800 border border-zinc-700 flex items-center justify-center">
                  <span className="text-xs font-bold text-zinc-400">{item.step}</span>
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-1 flex items-center gap-2">
                    <item.icon className="w-4 h-4 text-blue-400" />
                    {item.title}
                  </h3>
                  <p className="text-sm text-zinc-400 leading-relaxed">{item.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-20 border-t border-zinc-800/50">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Stop drawing diagrams.
            <br />
            <span className="text-zinc-500">Start generating them.</span>
          </h2>
          <p className="text-zinc-400 mb-8 max-w-lg mx-auto">
            Arcwright turns your codebase into living architecture documentation. Free for open source.
          </p>
          <button
            onClick={() => navigate('/login')}
            className="group inline-flex items-center gap-2 px-8 py-3.5 rounded-lg bg-blue-600 hover:bg-blue-500 transition-all font-medium"
          >
            Get Started Free
            <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800/50 px-6 py-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
              <Layers className="w-3 h-3 text-white" />
            </div>
            <span className="text-sm font-semibold">Arcwright</span>
          </div>
          <p className="text-xs text-zinc-600">
            Built by Bridge Intelligence
          </p>
        </div>
      </footer>
    </div>
  );
}
