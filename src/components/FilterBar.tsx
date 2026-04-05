import { useState } from 'react';
import type { ServiceCategory, CommProtocol, ServiceTier } from '../data/ecosystem';
import { categoryColors, protocolColors, tierOrder, tierLabels } from '../data/ecosystem';

interface FilterBarProps {
  activeCategories: Set<ServiceCategory>;
  activeProtocols: Set<CommProtocol>;
  hiddenTiers: Set<ServiceTier>;
  showEdgeLabels: boolean;
  onToggleCategory: (cat: ServiceCategory) => void;
  onToggleProtocol: (prot: CommProtocol) => void;
  onToggleTier: (tier: ServiceTier) => void;
  onToggleEdgeLabels: () => void;
  onResetFilters: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

export default function FilterBar({
  activeCategories, activeProtocols, hiddenTiers, showEdgeLabels,
  onToggleCategory, onToggleProtocol, onToggleTier, onToggleEdgeLabels,
  onResetFilters, searchQuery, onSearchChange,
}: FilterBarProps) {
  const [showLayers, setShowLayers] = useState(false);
  const allCategories = Object.keys(categoryColors) as ServiceCategory[];
  const mainProtocols: CommProtocol[] = ['http', 'kafka', 'redis', 'corda'];

  return (
    <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-1.5">
      {/* Main filter bar */}
      <div className="flex items-center gap-3 bg-zinc-900/90 border border-zinc-800 rounded-lg px-3 py-1.5 backdrop-blur-sm">
        {/* Search */}
        <input
          type="text"
          placeholder="Search services..."
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          className="bg-zinc-800 text-xs text-white px-2 py-1 rounded border border-zinc-700 focus:outline-none focus:border-blue-500 w-36"
        />

        <div className="w-px h-5 bg-zinc-700" />

        {/* Category filters */}
        <div className="flex gap-1">
          {allCategories.map(cat => {
            const active = activeCategories.has(cat);
            return (
              <button
                key={cat}
                onClick={() => onToggleCategory(cat)}
                className="text-[9px] px-1.5 py-0.5 rounded capitalize transition-all"
                style={{
                  background: active ? `${categoryColors[cat]}30` : 'transparent',
                  color: active ? categoryColors[cat] : '#71717a',
                  border: `1px solid ${active ? categoryColors[cat] + '60' : 'transparent'}`,
                }}
              >
                {cat}
              </button>
            );
          })}
        </div>

        <div className="w-px h-5 bg-zinc-700" />

        {/* Protocol filters */}
        <div className="flex gap-1">
          {mainProtocols.map(prot => {
            const active = activeProtocols.has(prot);
            return (
              <button
                key={prot}
                onClick={() => onToggleProtocol(prot)}
                className="text-[9px] px-1.5 py-0.5 rounded uppercase transition-all"
                style={{
                  background: active ? `${protocolColors[prot]}30` : 'transparent',
                  color: active ? protocolColors[prot] : '#71717a',
                  border: `1px solid ${active ? protocolColors[prot] + '60' : 'transparent'}`,
                }}
              >
                {prot}
              </button>
            );
          })}
        </div>

        <div className="w-px h-5 bg-zinc-700" />

        {/* Edge labels toggle */}
        <button
          onClick={onToggleEdgeLabels}
          className="text-[9px] px-1.5 py-0.5 rounded transition-all"
          style={{
            background: showEdgeLabels ? '#3b82f630' : 'transparent',
            color: showEdgeLabels ? '#3b82f6' : '#71717a',
            border: `1px solid ${showEdgeLabels ? '#3b82f660' : 'transparent'}`,
          }}
        >
          Labels
        </button>

        {/* Layer toggle button */}
        <button
          onClick={() => setShowLayers(prev => !prev)}
          className="text-[9px] px-1.5 py-0.5 rounded transition-all"
          style={{
            background: showLayers ? '#a78bfa30' : 'transparent',
            color: showLayers ? '#a78bfa' : '#71717a',
            border: `1px solid ${showLayers ? '#a78bfa60' : 'transparent'}`,
          }}
        >
          Layers
        </button>

        {/* Reset */}
        <button
          onClick={onResetFilters}
          className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 hover:text-white transition-colors"
        >
          Reset
        </button>
      </div>

      {/* Layer/tier toggle panel */}
      {showLayers && (
        <div className="flex items-center gap-1.5 bg-zinc-900/90 border border-zinc-800 rounded-lg px-3 py-1.5 backdrop-blur-sm">
          <span className="text-[9px] text-zinc-500 mr-1">Show layers:</span>
          {tierOrder.map(tier => {
            const visible = !hiddenTiers.has(tier);
            return (
              <button
                key={tier}
                onClick={() => onToggleTier(tier)}
                className="text-[9px] px-2 py-0.5 rounded transition-all"
                style={{
                  background: visible ? '#52525b30' : 'transparent',
                  color: visible ? '#e4e4e7' : '#3f3f46',
                  border: `1px solid ${visible ? '#52525b' : '#27272a'}`,
                  textDecoration: visible ? 'none' : 'line-through',
                }}
              >
                {tierLabels[tier]}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
