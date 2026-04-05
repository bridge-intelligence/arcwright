import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  Globe, Server, Database, Shield, Cpu, Layout,
  Link, BookOpen, BarChart3, Zap
} from 'lucide-react';
import type { ServiceCategory, ServiceStatus } from '../data/ecosystem';
import { categoryColors, statusColors } from '../data/ecosystem';

const categoryIcons: Record<ServiceCategory, React.ReactNode> = {
  gateway: <Globe size={16} />,
  orchestration: <Cpu size={16} />,
  financial: <BarChart3 size={16} />,
  identity: <Shield size={16} />,
  blockchain: <Link size={16} />,
  frontend: <Layout size={16} />,
  infrastructure: <Server size={16} />,
  connector: <Zap size={16} />,
  library: <BookOpen size={16} />,
  analytics: <Database size={16} />,
};

const statusLabels: Record<ServiceStatus, string> = {
  active: 'Active',
  inactive: 'Down',
  partial: 'Partial',
  placeholder: 'Planned',
  scaffold: 'Scaffold',
};

export interface ServiceNodeData {
  serviceId: string;
  label: string;
  shortName: string;
  category: ServiceCategory;
  status: ServiceStatus;
  port: number | null;
  imageTag: string | null;
  componentCount: number;
  endpointCount: number;
  kafkaTopicCount: number;
  healthStatus: 'healthy' | 'unhealthy' | 'unknown' | 'checking';
  [key: string]: unknown;
}

function ServiceNode({ data, selected }: NodeProps & { data: ServiceNodeData }) {
  const color = categoryColors[data.category];
  const statusColor = statusColors[data.status];
  const icon = categoryIcons[data.category];

  const healthDotColor = {
    healthy: '#22c55e',
    unhealthy: '#ef4444',
    unknown: '#6b7280',
    checking: '#eab308',
  }[data.healthStatus];

  const healthDotClass = data.healthStatus === 'healthy'
    ? 'pulse-dot'
    : data.healthStatus === 'unhealthy'
      ? 'pulse-dot'
      : '';

  return (
    <div
      className="relative"
      style={{
        minWidth: 180,
        maxWidth: 220,
      }}
    >
      {/* Handles */}
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !bg-zinc-500 !border-zinc-700" />
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !bg-zinc-500 !border-zinc-700" />
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-zinc-500 !border-zinc-700" />
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-zinc-500 !border-zinc-700" />

      {/* Node Card */}
      <div
        className="rounded-xl border-2 transition-all duration-200"
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
          {/* Health dot */}
          <div
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${healthDotClass}`}
            style={{ backgroundColor: healthDotColor }}
          />
          {/* Icon */}
          <div style={{ color }}>{icon}</div>
          {/* Name */}
          <div className="font-bold text-xs text-white truncate flex-1">{data.shortName}</div>
          {/* Port badge */}
          {data.port && (
            <span
              className="text-[9px] font-mono px-1.5 py-0.5 rounded"
              style={{ background: `${color}20`, color }}
            >
              :{data.port}
            </span>
          )}
        </div>

        {/* Body */}
        <div className="px-3 py-2 space-y-1">
          {/* Status badge */}
          <div className="flex items-center gap-1.5">
            <span
              className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded"
              style={{ background: `${statusColor}20`, color: statusColor }}
            >
              {statusLabels[data.status]}
            </span>
            <span className="text-[9px] text-zinc-500 font-mono">{data.category}</span>
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-2 text-[9px] text-zinc-400">
            {data.componentCount > 0 && (
              <span>{data.componentCount} components</span>
            )}
            {data.endpointCount > 0 && (
              <span>· {data.endpointCount} APIs</span>
            )}
            {data.kafkaTopicCount > 0 && (
              <span>· {data.kafkaTopicCount} topics</span>
            )}
          </div>

          {/* Image tag */}
          {data.imageTag && (
            <div className="text-[8px] font-mono text-zinc-500 truncate">
              {data.imageTag}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(ServiceNode);
