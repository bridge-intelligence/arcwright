import { categoryColors, statusColors, protocolColors } from '../data/ecosystem';

export default function Legend() {
  return (
    <div className="absolute bottom-4 left-4 z-40 bg-zinc-900/95 border border-zinc-800 rounded-xl p-3 backdrop-blur-sm max-w-xs">
      <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Service Categories</h3>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-3">
        {Object.entries(categoryColors).map(([cat, col]) => (
          <div key={cat} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: col }} />
            <span className="text-[10px] text-zinc-400 capitalize">{cat}</span>
          </div>
        ))}
      </div>

      <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Status</h3>
      <div className="flex flex-wrap gap-2 mb-3">
        {Object.entries(statusColors).map(([status, col]) => (
          <div key={status} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: col }} />
            <span className="text-[10px] text-zinc-400 capitalize">{status}</span>
          </div>
        ))}
      </div>

      <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Connections</h3>
      <div className="flex flex-wrap gap-2">
        {Object.entries(protocolColors).filter(([p]) => ['http', 'kafka', 'redis'].includes(p)).map(([prot, col]) => (
          <div key={prot} className="flex items-center gap-1">
            <div className="w-4 h-0.5 rounded" style={{ backgroundColor: col }} />
            <span className="text-[10px] text-zinc-400 uppercase">{prot}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
