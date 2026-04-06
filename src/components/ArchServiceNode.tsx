import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  Globe, Server, Database, Cpu, Layout,
  Zap, BookOpen, Radio, Cloud, CreditCard,
} from 'lucide-react';

export interface ArchNodeData {
  serviceId: string;
  label: string;
  type: string;
  tier: string;
  port?: number;
  description: string;
  endpointCount: number;
  databaseCount: number;
  moduleCount: number;
  connectionCount: number;
  [key: string]: unknown;
}

const tierColors: Record<string, string> = {
  frontend: '#06b6d4',
  gateway: '#3b82f6',
  business: '#a855f7',
  data: '#22c55e',
  infrastructure: '#6b7280',
};

const typeIcons: Record<string, React.ReactNode> = {
  api: <Globe size={14} />,
  frontend: <Layout size={14} />,
  worker: <Cpu size={14} />,
  database: <Database size={14} />,
  cache: <Zap size={14} />,
  queue: <Radio size={14} />,
  library: <BookOpen size={14} />,
  external_service: <Cloud size={14} />,
  infrastructure: <Server size={14} />,
  payment: <CreditCard size={14} />,
};

const typeLabels: Record<string, string> = {
  api: 'API',
  frontend: 'Frontend',
  worker: 'Worker',
  database: 'Database',
  cache: 'Cache',
  queue: 'Queue',
  library: 'Library',
  external_service: 'External',
  infrastructure: 'Infra',
};

function ArchServiceNode({ data, selected }: NodeProps & { data: ArchNodeData }) {
  const color = tierColors[data.tier] || tierColors[data.type] || '#52525b';
  const icon = typeIcons[data.type] || <Server size={14} />;
  const typeLabel = typeLabels[data.type] || data.type;

  return (
    <div className="relative" style={{ minWidth: 180, maxWidth: 240 }}>
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-zinc-500 !border-zinc-700" />
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-zinc-500 !border-zinc-700" />
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-zinc-500 !border-zinc-700" />
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-zinc-500 !border-zinc-700" />

      <div
        className="rounded-xl border-2 transition-all duration-200 cursor-pointer"
        style={{
          background: `linear-gradient(135deg, ${color}08, ${color}15)`,
          borderColor: selected ? color : `${color}40`,
          boxShadow: selected
            ? `0 0 20px ${color}30, 0 4px 12px rgba(0,0,0,0.5)`
            : `0 2px 8px rgba(0,0,0,0.3)`,
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: `${color}20` }}>
          <div className="w-2.5 h-2.5 rounded-full shrink-0 pulse-dot" style={{ backgroundColor: color }} />
          <div style={{ color }}>{icon}</div>
          <div className="font-bold text-xs text-white truncate flex-1">{data.label}</div>
          {data.port ? (
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ background: `${color}20`, color }}>
              :{data.port}
            </span>
          ) : null}
        </div>

        {/* Body */}
        <div className="px-3 py-2 space-y-1">
          {/* Type + tier badges */}
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded" style={{ background: `${color}20`, color }}>
              {typeLabel}
            </span>
            <span className="text-[9px] text-zinc-500">{data.tier}</span>
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-1.5 text-[9px] text-zinc-400 flex-wrap">
            {data.moduleCount > 0 && <span>{data.moduleCount} modules</span>}
            {data.endpointCount > 0 && <span>· {data.endpointCount} endpoints</span>}
            {data.databaseCount > 0 && <span>· {data.databaseCount} DBs</span>}
            {data.connectionCount > 0 && <span>· {data.connectionCount} conn</span>}
          </div>

          {/* Description preview */}
          {data.description && (
            <div className="text-[8px] text-zinc-500 line-clamp-2 leading-relaxed">
              {data.description.slice(0, 80)}{data.description.length > 80 ? '...' : ''}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(ArchServiceNode);
