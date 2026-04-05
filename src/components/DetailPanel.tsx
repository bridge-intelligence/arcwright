import {
  X, Server, Globe, Database, Radio, Zap, Shield,
  ExternalLink, ChevronDown, ChevronRight, Code
} from 'lucide-react';
import { useState } from 'react';
import type { EcosystemService } from '../data/ecosystem';
import { categoryColors, statusColors, protocolColors } from '../data/ecosystem';

interface DetailPanelProps {
  service: EcosystemService | null;
  onClose: () => void;
}

function Section({ title, icon, children, defaultOpen = false }: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-zinc-800">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-4 py-2.5 text-left hover:bg-zinc-800/50 transition-colors"
      >
        {open ? <ChevronDown size={14} className="text-zinc-500" /> : <ChevronRight size={14} className="text-zinc-500" />}
        <span className="text-zinc-400">{icon}</span>
        <span className="text-sm font-medium text-zinc-300">{title}</span>
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

export default function DetailPanel({ service, onClose }: DetailPanelProps) {
  if (!service) return null;

  const color = categoryColors[service.category];
  const statusColor = statusColors[service.status];

  return (
    <div className="fixed right-0 top-0 h-full w-[420px] bg-zinc-900 border-l border-zinc-800 z-50 flex flex-col shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800" style={{ background: `linear-gradient(135deg, ${color}10, transparent)` }}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-white truncate">{service.name}</h2>
            <span
              className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded shrink-0"
              style={{ background: `${statusColor}20`, color: statusColor }}
            >
              {service.status}
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-0.5">{service.repo}</p>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        {/* Overview */}
        <div className="px-4 py-3 border-b border-zinc-800">
          <p className="text-xs text-zinc-400 leading-relaxed">{service.description}</p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {service.techStack.map(t => (
              <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">
                {t}
              </span>
            ))}
          </div>
        </div>

        {/* Role */}
        <div className="px-4 py-3 border-b border-zinc-800">
          <h3 className="text-xs font-semibold text-zinc-500 uppercase mb-1">Role</h3>
          <p className="text-xs text-zinc-300 leading-relaxed">{service.role}</p>
        </div>

        {/* Network Info */}
        <div className="px-4 py-3 border-b border-zinc-800">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-zinc-500">Port:</span>
              <span className="ml-1 text-white font-mono">{service.port ?? '—'}</span>
            </div>
            <div>
              <span className="text-zinc-500">K8s Port:</span>
              <span className="ml-1 text-white font-mono">{service.k8sPort ?? '—'}</span>
            </div>
            {service.imageTag && (
              <div className="col-span-2">
                <span className="text-zinc-500">Image:</span>
                <span className="ml-1 text-white font-mono text-[10px]">{service.imageTag}</span>
              </div>
            )}
            {service.externalUrl && (
              <div className="col-span-2 flex items-center gap-1">
                <span className="text-zinc-500">URL:</span>
                <a
                  href={service.externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-1 text-blue-400 text-[10px] font-mono hover:underline flex items-center gap-1"
                >
                  {service.externalUrl} <ExternalLink size={10} />
                </a>
              </div>
            )}
            {service.internalUrl && (
              <div className="col-span-2">
                <span className="text-zinc-500">Internal:</span>
                <span className="ml-1 text-zinc-400 text-[10px] font-mono">{service.internalUrl}</span>
              </div>
            )}
          </div>
        </div>

        {/* Components */}
        {service.components.length > 0 && (
          <Section title={`Components (${service.components.length})`} icon={<Server size={14} />} defaultOpen>
            <div className="space-y-2">
              {service.components.map((c, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-[10px] px-1 py-0.5 rounded bg-zinc-800 text-zinc-500 uppercase shrink-0 mt-0.5">
                    {c.type}
                  </span>
                  <div>
                    <div className="text-xs font-medium text-white">{c.name}</div>
                    <div className="text-[10px] text-zinc-500">{c.description}</div>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* API Endpoints */}
        {service.endpoints.length > 0 && (
          <Section title={`Endpoints (${service.endpoints.length})`} icon={<Globe size={14} />}>
            <div className="space-y-1.5">
              {service.endpoints.map((e, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px]">
                  <span className="font-mono font-bold text-blue-400 w-10 shrink-0 text-right">{e.method}</span>
                  <span className="font-mono text-zinc-300">{e.path}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Kafka Topics */}
        {service.kafkaTopics.length > 0 && (
          <Section title={`Kafka Topics (${service.kafkaTopics.length})`} icon={<Radio size={14} />}>
            <div className="space-y-2">
              {service.kafkaTopics.map((t, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span
                    className="text-[9px] px-1 py-0.5 rounded shrink-0 mt-0.5 font-semibold uppercase"
                    style={{
                      background: t.direction === 'produce' ? '#22c55e20' : '#3b82f620',
                      color: t.direction === 'produce' ? '#22c55e' : '#3b82f6',
                    }}
                  >
                    {t.direction === 'produce' ? 'PUB' : 'SUB'}
                  </span>
                  <div>
                    <div className="text-[11px] font-mono text-white">{t.name}</div>
                    <div className="text-[10px] text-zinc-500">{t.description}</div>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Databases */}
        {service.databases.length > 0 && (
          <Section title={`Databases (${service.databases.length})`} icon={<Database size={14} />}>
            <div className="space-y-2">
              {service.databases.map((d, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-[9px] px-1 py-0.5 rounded bg-zinc-800 text-zinc-500 uppercase shrink-0 mt-0.5">
                    {d.type}
                  </span>
                  <div>
                    <div className="text-[11px] font-mono text-white">{d.database}</div>
                    <div className="text-[10px] text-zinc-500">{d.purpose}</div>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Controllers */}
        {service.controllers.length > 0 && (
          <Section title={`Controllers (${service.controllers.length})`} icon={<Code size={14} />}>
            <div className="flex flex-wrap gap-1">
              {service.controllers.map(c => (
                <span key={c} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">
                  {c}
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* Domain Entities */}
        {service.domainEntities.length > 0 && (
          <Section title={`Domain Entities (${service.domainEntities.length})`} icon={<Shield size={14} />}>
            <div className="flex flex-wrap gap-1">
              {service.domainEntities.map(e => (
                <span key={e} className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">
                  {e}
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* Key Features */}
        {service.keyFeatures.length > 0 && (
          <Section title="Key Features" icon={<Zap size={14} />}>
            <div className="flex flex-wrap gap-1">
              {service.keyFeatures.map(f => (
                <span key={f} className="text-[10px] px-1.5 py-0.5 rounded text-white font-medium"
                  style={{ background: `${color}25`, color }}>
                  {f}
                </span>
              ))}
            </div>
          </Section>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-zinc-800 text-[10px] text-zinc-600">
        Category: {service.category} · {service.components.length} components · {service.endpoints.length} endpoints · {service.kafkaTopics.length} Kafka topics
      </div>
    </div>
  );
}
