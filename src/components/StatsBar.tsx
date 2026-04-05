import { ecosystemData } from '../data/ecosystem';

interface StatsBarProps {
  healthStatuses: Record<string, 'healthy' | 'unhealthy' | 'unknown' | 'checking'>;
}

export default function StatsBar({ healthStatuses }: StatsBarProps) {
  const total = ecosystemData.services.length;
  const active = ecosystemData.services.filter(s => s.status === 'active').length;
  const scaffold = ecosystemData.services.filter(s => s.status === 'scaffold').length;
  const placeholder = ecosystemData.services.filter(s => s.status === 'placeholder').length;
  const healthy = Object.values(healthStatuses).filter(s => s === 'healthy').length;
  const unhealthy = Object.values(healthStatuses).filter(s => s === 'unhealthy').length;
  const totalKafka = ecosystemData.services.reduce((acc, s) => acc + s.kafkaTopics.length, 0);
  const totalEndpoints = ecosystemData.services.reduce((acc, s) => acc + s.endpoints.length, 0);
  const totalConnections = ecosystemData.connections.length;

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
