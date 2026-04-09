import { useMemo } from 'react';
import type { Node, Edge } from '@xyflow/react';
import { MarkerType } from '@xyflow/react';
import { protocolColors } from '../data/ecosystem';
import type { EcosystemData, ServiceCategory, CommProtocol, ServiceTier } from '../data/ecosystem';
import type { ServiceNodeData } from '../components/ServiceNode';

// Tier-based Y positions with generous spacing
const TIER_Y: Record<ServiceTier, number> = {
  frontend: 0,
  gateway: 220,
  orchestration: 420,
  business: 640,
  blockchain: 860,
  connector: 1060,
  infrastructure: 640,
  library: 900,
};

// Place services within tiers, spreading horizontally
function computePositions(services: EcosystemData['services'], hiddenTiers: Set<ServiceTier>) {
  const positions: Record<string, { x: number; y: number }> = {};

  // Group services by tier
  const byTier: Record<string, string[]> = {};
  for (const s of services) {
    if (hiddenTiers.has(s.tier)) continue;
    if (!byTier[s.tier]) byTier[s.tier] = [];
    byTier[s.tier].push(s.id);
  }

  // Separate infra/library to the right
  const leftTiers: ServiceTier[] = ['frontend', 'gateway', 'orchestration', 'business', 'blockchain', 'connector'];
  const rightTiers: ServiceTier[] = ['infrastructure', 'library'];

  for (const tier of leftTiers) {
    const ids = byTier[tier] || [];
    const y = TIER_Y[tier];
    const spacing = 240;
    const startX = Math.max(0, (900 - ids.length * spacing) / 2);
    ids.forEach((id, i) => {
      positions[id] = { x: startX + i * spacing, y };
    });
  }

  for (const tier of rightTiers) {
    const ids = byTier[tier] || [];
    const y = TIER_Y[tier];
    const startX = 1200;
    const spacing = 200;
    ids.forEach((id, i) => {
      positions[id] = { x: startX + (i % 3) * spacing, y: y + Math.floor(i / 3) * 180 };
    });
  }

  return positions;
}

export function useEcosystemGraph(
  data: EcosystemData,
  healthStatuses: Record<string, 'healthy' | 'unhealthy' | 'unknown' | 'checking'>,
  activeCategories: Set<ServiceCategory>,
  activeProtocols: Set<CommProtocol>,
  hiddenTiers: Set<ServiceTier>,
  searchQuery: string,
  showEdgeLabels: boolean,
) {
  const { nodes, edges } = useMemo(() => {
    const lowerQuery = searchQuery.toLowerCase();
    const positions = computePositions(data.services, hiddenTiers);

    const nodes: Node<ServiceNodeData>[] = data.services
      .filter(s => {
        if (hiddenTiers.has(s.tier)) return false;
        if (activeCategories.size > 0 && !activeCategories.has(s.category)) return false;
        if (lowerQuery && !s.name.toLowerCase().includes(lowerQuery) && !s.shortName.toLowerCase().includes(lowerQuery) && !s.category.includes(lowerQuery) && !s.id.includes(lowerQuery)) return false;
        return true;
      })
      .map(s => ({
        id: s.id,
        type: 'serviceNode',
        position: positions[s.id] || { x: 0, y: 0 },
        data: {
          serviceId: s.id,
          label: s.name,
          shortName: s.shortName,
          category: s.category,
          status: s.status,
          port: s.port,
          imageTag: s.imageTag,
          componentCount: s.components.length,
          endpointCount: s.endpoints.length,
          kafkaTopicCount: s.kafkaTopics.length,
          healthStatus: healthStatuses[s.id] || 'unknown',
        },
      }));

    const visibleIds = new Set(nodes.map(n => n.id));

    const edges: Edge[] = data.connections
      .filter(c => {
        if (!visibleIds.has(c.source) || !visibleIds.has(c.target)) return false;
        if (activeProtocols.size > 0 && !activeProtocols.has(c.protocol)) return false;
        return true;
      })
      .map(c => {
        const color = protocolColors[c.protocol] || '#52525b';
        const isKafka = c.protocol === 'kafka';
        const isCorda = c.protocol === 'corda';
        const isEvent = c.direction === 'event' || c.direction === 'trigger';
        return {
          id: c.id,
          source: c.source,
          target: c.target,
          animated: c.animated,
          label: showEdgeLabels ? c.label : undefined,
          labelStyle: { fontSize: 8, fill: '#a1a1aa', fontFamily: 'monospace' },
          labelBgStyle: { fill: '#18181b', fillOpacity: 0.9 },
          labelBgPadding: [3, 1] as [number, number],
          style: {
            stroke: color,
            strokeWidth: isCorda ? 3 : isKafka ? 2.5 : 1.5,
            strokeDasharray: isEvent ? '6 3' : isCorda ? '8 4' : undefined,
            opacity: 0.65,
          },
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 10, height: 10 },
          ...(c.direction === 'two-way' && {
            markerStart: { type: MarkerType.ArrowClosed, color, width: 8, height: 8 },
          }),
        };
      });

    return { nodes, edges };
  }, [data, healthStatuses, activeCategories, activeProtocols, hiddenTiers, searchQuery, showEdgeLabels]);

  return { nodes, edges };
}
