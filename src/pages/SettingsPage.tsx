import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Layers, ArrowLeft, User, Building2, Users, CreditCard, BarChart3,
  Shield, Loader2, CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL ||
  (window.location.hostname === 'localhost' ? 'http://localhost:8787/api' : 'https://arcwright-api.hamza-dastagir.workers.dev/api');

function getToken() { return localStorage.getItem('arcwright_token'); }

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options?.headers },
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}

type Tab = 'profile' | 'org' | 'team' | 'billing' | 'usage' | 'audit';

export default function SettingsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('profile');

  const tabs: Array<{ id: Tab; label: string; icon: typeof User }> = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'org', label: 'Organization', icon: Building2 },
    { id: 'team', label: 'Team', icon: Users },
    { id: 'billing', label: 'Billing', icon: CreditCard },
    { id: 'usage', label: 'Usage', icon: BarChart3 },
    { id: 'audit', label: 'Audit Log', icon: Shield },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <nav className="border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-12 flex items-center gap-3">
          <button onClick={() => navigate('/dashboard')} className="text-zinc-400 hover:text-white"><ArrowLeft className="w-4 h-4" /></button>
          <Layers className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-semibold">Settings</span>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-6 flex gap-6">
        {/* Sidebar */}
        <div className="w-48 flex-shrink-0 space-y-1">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${tab === t.id ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:bg-zinc-800/50'}`}>
              <t.icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {tab === 'profile' && <ProfileTab />}
          {tab === 'org' && <OrgTab />}
          {tab === 'team' && <TeamTab />}
          {tab === 'billing' && <BillingTab />}
          {tab === 'usage' && <UsageTab />}
          {tab === 'audit' && <AuditTab />}
        </div>
      </div>
    </div>
  );
}

function ProfileTab() {
  const { user } = useAuth();
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Profile</h2>
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-6 space-y-4">
        <div className="flex items-center gap-4">
          {user?.photoURL ? <img src={user.photoURL} className="w-12 h-12 rounded-full" /> : <div className="w-12 h-12 rounded-full bg-zinc-700" />}
          <div>
            <div className="text-sm font-medium">{user?.displayName || 'User'}</div>
            <div className="text-xs text-zinc-400">{user?.email}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div><span className="text-zinc-500">GitHub:</span> <span className="text-zinc-300">{user?.githubConnected ? `@${user.githubUsername}` : 'Not connected'}</span></div>
          <div><span className="text-zinc-500">Role:</span> <span className="text-zinc-300">{user?.role || 'member'}</span></div>
          <div><span className="text-zinc-500">Tenant:</span> <span className="text-zinc-300 font-mono text-[10px]">{user?.tenantId?.slice(0, 8)}</span></div>
        </div>
      </div>
    </div>
  );
}

function OrgTab() {
  const [org, setOrg] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api<Record<string, unknown>>('/settings/org').then(setOrg).finally(() => setLoading(false)); }, []);
  if (loading) return <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />;
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Organization</h2>
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-6 space-y-3">
        {org ? (
          <>
            <div className="text-xs"><span className="text-zinc-500">Name:</span> <span className="text-zinc-200 font-medium">{org.name as string}</span></div>
            <div className="text-xs"><span className="text-zinc-500">Plan:</span> <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${org.plan === 'pro' ? 'bg-blue-500/20 text-blue-400' : org.plan === 'team' ? 'bg-purple-500/20 text-purple-400' : 'bg-zinc-800 text-zinc-400'}`}>{(org.plan as string || 'free').toUpperCase()}</span></div>
            <div className="text-xs"><span className="text-zinc-500">Repos limit:</span> <span className="text-zinc-300">{org.max_repos as number}</span></div>
            <div className="text-xs"><span className="text-zinc-500">Analyses/mo:</span> <span className="text-zinc-300">{org.max_analyses_per_month as number}</span></div>
            <div className="text-xs"><span className="text-zinc-500">Claude/mo:</span> <span className="text-zinc-300">{org.max_claude_analyses as number}</span></div>
          </>
        ) : <p className="text-xs text-zinc-500">No organization found.</p>}
      </div>
    </div>
  );
}

function TeamTab() {
  const [members, setMembers] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api<Array<Record<string, unknown>>>('/settings/team').then(setMembers).finally(() => setLoading(false)); }, []);
  if (loading) return <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />;
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Team</h2>
      </div>
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 divide-y divide-zinc-800">
        {members.length === 0 ? <div className="p-6 text-xs text-zinc-500">No team members. You're the only one.</div> : (
          members.map((m, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3">
              <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-[10px] text-zinc-400">{(m.display_name as string)?.[0] || '?'}</div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium">{m.display_name as string || m.email as string}</div>
                <div className="text-[10px] text-zinc-500">{m.email as string}</div>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{m.role as string}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function BillingTab() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api<Record<string, unknown>>('/settings/billing').then(setData).finally(() => setLoading(false)); }, []);
  if (loading) return <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />;
  if (!data) return <div className="text-xs text-zinc-500">Failed to load billing.</div>;

  const plans = (data.plans as Array<{ id: string; name: string; price: number; repos: number; analyses: number; claude: number; team: number }>) || [];
  const current = data.current as Record<string, number>;
  const limits = data.limits as Record<string, number>;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Billing & Plans</h2>

      {/* Current plan */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <span className="text-sm font-medium">Current Plan: </span>
            <span className="px-2 py-0.5 rounded text-xs font-bold bg-blue-500/20 text-blue-400">{(data.plan as string || 'free').toUpperCase()}</span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4 text-xs">
          <UsageMeter label="Repos" used={current?.repos || 0} limit={limits?.repos || 3} />
          <UsageMeter label="Analyses/mo" used={current?.analyses || 0} limit={limits?.analyses || 10} />
          <UsageMeter label="Cost this month" used={current?.cost || 0} limit={-1} prefix="$" />
        </div>
      </div>

      {/* Plans */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {plans.map(plan => (
          <div key={plan.id} className={`rounded-xl border p-4 ${data.plan === plan.id ? 'border-blue-500/50 bg-blue-500/5' : 'border-zinc-800 bg-zinc-900/30'}`}>
            <h3 className="text-sm font-semibold mb-1">{plan.name}</h3>
            <div className="text-lg font-bold mb-3">{plan.price === 0 ? 'Free' : plan.price === -1 ? 'Custom' : `$${plan.price}/mo`}</div>
            <div className="space-y-1 text-[10px] text-zinc-400">
              <div>{plan.repos === -1 ? 'Unlimited' : plan.repos} repos</div>
              <div>{plan.analyses === -1 ? 'Unlimited' : plan.analyses} analyses/mo</div>
              <div>{plan.claude === -1 ? 'Unlimited' : plan.claude === 0 ? '—' : plan.claude} Claude analyses</div>
              <div>{plan.team === -1 ? 'Unlimited' : plan.team} team members</div>
            </div>
            {data.plan === plan.id ? (
              <div className="mt-3 text-[10px] text-blue-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Current</div>
            ) : (
              <button className="mt-3 w-full px-2 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-[10px] font-medium text-zinc-300">
                {plan.price === -1 ? 'Contact Us' : plan.price > (plans.find(p => p.id === data.plan)?.price || 0) ? 'Upgrade' : 'Downgrade'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function UsageMeter({ label, used, limit, prefix }: { label: string; used: number; limit: number; prefix?: string }) {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const color = pct > 80 ? '#ef4444' : pct > 60 ? '#eab308' : '#22c55e';
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-zinc-500">{label}</span>
        <span className="text-zinc-300 font-medium">{prefix}{typeof used === 'number' ? (prefix === '$' ? used.toFixed(4) : used) : 0}{limit > 0 ? ` / ${limit}` : ''}</span>
      </div>
      {limit > 0 && <div className="h-1.5 rounded-full bg-zinc-800"><div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} /></div>}
    </div>
  );
}

function UsageTab() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api<Record<string, unknown>>('/settings/usage').then(setData).finally(() => setLoading(false)); }, []);
  if (loading) return <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />;
  if (!data) return <div className="text-xs text-zinc-500">Failed to load usage.</div>;

  const summary = data.summary as Record<string, number> || {};
  const daily = (data.daily as Array<Record<string, unknown>>) || [];
  const byModel = (data.byModel as Array<Record<string, unknown>>) || [];
  const quota = data.quota as Record<string, number> || {};

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Usage (Last 30 Days)</h2>

      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Analyses" value={summary.total_analyses || 0} />
        <StatCard label="Tokens In" value={(summary.total_tokens_in || 0).toLocaleString()} />
        <StatCard label="Tokens Out" value={(summary.total_tokens_out || 0).toLocaleString()} />
        <StatCard label="Total Cost" value={`$${(summary.total_cost || 0).toFixed(4)}`} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <UsageMeter label="Analyses used" used={quota.analyses_used || 0} limit={quota.analyses_limit || 10} />
      </div>

      {byModel.length > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
          <h3 className="text-xs font-semibold text-zinc-400 mb-3">By Model</h3>
          <div className="space-y-2">
            {byModel.map((m, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-zinc-300 font-mono">{m.model as string || 'unknown'}</span>
                <span className="text-zinc-400">{m.count as number} runs · ${((m.cost as number) || 0).toFixed(4)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {daily.length > 0 && (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
          <h3 className="text-xs font-semibold text-zinc-400 mb-3">Daily</h3>
          <div className="space-y-1">
            {daily.slice(0, 14).map((d, i) => (
              <div key={i} className="flex items-center justify-between text-[11px]">
                <span className="text-zinc-400 font-mono">{d.day as string}</span>
                <span className="text-zinc-300">{d.count as number} analyses · ${((d.cost as number) || 0).toFixed(4)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3 text-center">
      <div className="text-lg font-bold text-zinc-200">{value}</div>
      <div className="text-[9px] text-zinc-500 uppercase">{label}</div>
    </div>
  );
}

function AuditTab() {
  const [logs, setLogs] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api<Array<Record<string, unknown>>>('/settings/audit').then(setLogs).finally(() => setLoading(false)); }, []);
  if (loading) return <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />;
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Audit Log</h2>
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 divide-y divide-zinc-800">
        {logs.length === 0 ? <div className="p-6 text-xs text-zinc-500">No audit events yet.</div> : (
          logs.map((log, i) => (
            <div key={i} className="px-5 py-3 flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs"><span className="text-zinc-300 font-medium">{log.action as string}</span> <span className="text-zinc-500">on {log.resource_type as string}</span></div>
                {log.details ? <div className="text-[10px] text-zinc-500 truncate">{String(log.details)}</div> : null}
              </div>
              <div className="text-[10px] text-zinc-600">{String(log.display_name || log.email || '')}</div>
              <div className="text-[10px] text-zinc-600">{new Date(log.created_at as string).toLocaleDateString()}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
