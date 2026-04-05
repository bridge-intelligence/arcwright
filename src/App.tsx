import { useCallback, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  type NodeMouseHandler,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import ServiceNode from './components/ServiceNode';
import DetailPanel from './components/DetailPanel';
import Legend from './components/Legend';
import StatsBar from './components/StatsBar';
import FilterBar from './components/FilterBar';
import { useHealthChecks } from './hooks/useHealthChecks';
import { useEcosystemGraph } from './hooks/useEcosystemGraph';
import { ecosystemData, categoryColors } from './data/ecosystem';
import type { ServiceCategory, CommProtocol, ServiceTier, EcosystemService } from './data/ecosystem';

const nodeTypes = { serviceNode: ServiceNode };

export default function App() {
  const [selectedService, setSelectedService] = useState<EcosystemService | null>(null);
  const [activeCategories, setActiveCategories] = useState<Set<ServiceCategory>>(new Set());
  const [activeProtocols, setActiveProtocols] = useState<Set<CommProtocol>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [hiddenTiers, setHiddenTiers] = useState<Set<ServiceTier>>(new Set());
  const [showEdgeLabels, setShowEdgeLabels] = useState(false);

  const { statuses: healthStatuses } = useHealthChecks();

  const { nodes: graphNodes, edges: graphEdges } = useEcosystemGraph(
    healthStatuses, activeCategories, activeProtocols, hiddenTiers, searchQuery, showEdgeLabels,
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(graphNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(graphEdges);

  // Sync when graph data changes
  const prevKeyRef = useRef('');
  const nodesKey = graphNodes.map(n => n.id).join(',') + '|' + graphEdges.map(e => e.id).join(',');
  if (prevKeyRef.current !== nodesKey) {
    prevKeyRef.current = nodesKey;
    setNodes(graphNodes);
    setEdges(graphEdges);
  }

  const onNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    const service = ecosystemData.services.find(s => s.id === node.id);
    if (service) setSelectedService(service);
  }, []);

  const toggleCategory = useCallback((cat: ServiceCategory) => {
    setActiveCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  const toggleProtocol = useCallback((prot: CommProtocol) => {
    setActiveProtocols(prev => {
      const next = new Set(prev);
      if (next.has(prot)) next.delete(prot);
      else next.add(prot);
      return next;
    });
  }, []);

  const toggleTier = useCallback((tier: ServiceTier) => {
    setHiddenTiers(prev => {
      const next = new Set(prev);
      if (next.has(tier)) next.delete(tier);
      else next.add(tier);
      return next;
    });
  }, []);

  const resetFilters = useCallback(() => {
    setActiveCategories(new Set());
    setActiveProtocols(new Set());
    setHiddenTiers(new Set());
    setSearchQuery('');
    setShowEdgeLabels(false);
  }, []);

  return (
    <div className="w-full h-full relative">
      {/* Title */}
      <div className="absolute top-4 left-4 z-40">
        <h1 className="text-sm font-bold text-white flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          Bridge Ecosystem Architecture
        </h1>
        <p className="text-[10px] text-zinc-500 mt-0.5">
          Interactive microservice network map · {ecosystemData.services.length} services · {ecosystemData.connections.length} connections
        </p>
      </div>

      <StatsBar healthStatuses={healthStatuses} />

      <FilterBar
        activeCategories={activeCategories}
        activeProtocols={activeProtocols}
        hiddenTiers={hiddenTiers}
        showEdgeLabels={showEdgeLabels}
        onToggleCategory={toggleCategory}
        onToggleProtocol={toggleProtocol}
        onToggleTier={toggleTier}
        onToggleEdgeLabels={() => setShowEdgeLabels(prev => !prev)}
        onResetFilters={resetFilters}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.2}
        maxZoom={2}
        defaultEdgeOptions={{ type: 'smoothstep' }}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#27272a" />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={(node) => {
            const data = node.data as { category?: ServiceCategory };
            return data?.category ? categoryColors[data.category] : '#52525b';
          }}
          maskColor="rgba(0,0,0,0.7)"
          style={{ width: 180, height: 120 }}
        />
      </ReactFlow>

      <Legend />

      <DetailPanel
        service={selectedService}
        onClose={() => setSelectedService(null)}
      />
    </div>
  );
}
