import type { EcosystemData } from '../data/ecosystem';

interface StatsBarProps {
  healthStatuses: Record<string, 'healthy' | 'unhealthy' | 'unknown' | 'checking'>;
  data?: EcosystemData;
}

export default function StatsBar({ healthStatuses, data }: StatsBarProps) {
  const total = data?.services.length || 0;
  const active = data?.services.filter(s => s.status === 'active').length || 0;
  const scaffold = data?.services.filter(s => s.status === 'scaffold').length || 0;
  const placeholder = data?.services.filter(s => s.status === 'placeholder').length || 0;
  const healthy = Object.values(healthStatuses).filter(s => s === 'healthy').length;
  const unhealthy = Object.values(healthStatuses).filter(s => s === 'unhealthy').length;
  const totalKafka = data?.services.reduce((acc, s) => acc + s.kafkaTopics.length, 0) || 0;
  const totalEndpoints = data?.services.reduce((acc, s) => acc + s.endpoints.length, 0) || 0;
  const totalConnections = data?.connections.length || 0;

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 bg-zinc-900/95 border border-zinc-800 rounded-xl px-4 py-2 backdrop-blur-sm">
      <div className="text-center">
        <div className="text-lg font-bold text-white">{total}</div>
        <div className="text-[9px] text-zinc-500 uppercase">Services</div>
      </div>
      <div className="w-px h-8 bg-zinc-800" />
      <div className="text-center">
        <div className="text-lg font-bold text-green-400">{active}</div>
        <div className="text-[9px] text-zinc-500 uppercase">Active</div>
      </div>
      <div className="text-center">
        <div className="text-lg font-bold text-zinc-500">{scaffold}</div>
        <div className="text-[9px] text-zinc-500 uppercase">Scaffold</div>
      </div>
      <div className="text-center">
        <div className="text-lg font-bold text-zinc-600">{placeholder}</div>
        <div className="text-[9px] text-zinc-500 uppercase">Planned</div>
      </div>
      <div className="w-px h-8 bg-zinc-800" />
      <div className="text-center">
        <div className="text-lg font-bold text-green-400">{healthy}</div>
        <div className="text-[9px] text-zinc-500 uppercase">Healthy</div>
      </div>
      <div className="text-center">
        <div className="text-lg font-bold text-red-400">{unhealthy}</div>
        <div className="text-[9px] text-zinc-500 uppercase">Down</div>
      </div>
      <div className="w-px h-8 bg-zinc-800" />
      <div className="text-center">
        <div className="text-lg font-bold text-blue-400">{totalConnections}</div>
        <div className="text-[9px] text-zinc-500 uppercase">Connections</div>
      </div>
      <div className="text-center">
        <div className="text-lg font-bold text-cyan-400">{totalEndpoints}</div>
        <div className="text-[9px] text-zinc-500 uppercase">Endpoints</div>
      </div>
      <div className="text-center">
        <div className="text-lg font-bold text-emerald-400">{totalKafka}</div>
        <div className="text-[9px] text-zinc-500 uppercase">Topics</div>
      </div>
    </div>
  );
}
