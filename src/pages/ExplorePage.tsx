import { useCallback, useRef, useState, useEffect } from 'react';
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

import ServiceNode from '../components/ServiceNode';
import DetailPanel from '../components/DetailPanel';
import Legend from '../components/Legend';
import StatsBar from '../components/StatsBar';
import FilterBar from '../components/FilterBar';
import { useHealthChecks } from '../hooks/useHealthChecks';
import { useEcosystemGraph } from '../hooks/useEcosystemGraph';
import { categoryColors } from '../data/ecosystem';
import type { EcosystemData, EcosystemService, ServiceCategory, CommProtocol, ServiceTier } from '../data/ecosystem';
import { exploreApi } from '../services/api';

const nodeTypes = { serviceNode: ServiceNode };

export default function ExplorePage() {
  const [ecosystemData, setEcosystemData] = useState<EcosystemData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedService, setSelectedService] = useState<EcosystemService | null>(null);
  const [activeCategories, setActiveCategories] = useState<Set<ServiceCategory>>(new Set());
  const [activeProtocols, setActiveProtocols] = useState<Set<CommProtocol>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [hiddenTiers, setHiddenTiers] = useState<Set<ServiceTier>>(new Set());
  const [showEdgeLabels, setShowEdgeLabels] = useState(false);

  // Fetch ecosystem data from API
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    exploreApi.getEcosystem()
      .then(data => {
        if (!cancelled) {
          setEcosystemData(data);
          setLoading(false);
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err.message || 'Failed to load ecosystem data');
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  const { statuses: healthStatuses } = useHealthChecks(ecosystemData?.services);

  const emptyData: EcosystemData = { services: [], connections: [] };
  const { nodes: graphNodes, edges: graphEdges } = useEcosystemGraph(
    ecosystemData || emptyData, healthStatuses, activeCategories, activeProtocols, hiddenTiers, searchQuery, showEdgeLabels,
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
    if (!ecosystemData) return;
    const service = ecosystemData.services.find(s => s.id === node.id);
    if (service) setSelectedService(service);
  }, [ecosystemData]);

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

  // Loading state
  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-zinc-950">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-sm text-zinc-400">Loading ecosystem data...</p>
        </div>
      </div>
    );
  }

  // Access denied / error state
  if (error) {
    const isAccessDenied = error.includes('Access restricted') || error.includes('403');
    return (
      <div className="w-full h-full flex items-center justify-center bg-zinc-950">
        <div className="text-center max-w-md">
          <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {isAccessDenied ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              )}
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-white mb-2">
            {isAccessDenied ? 'Access Restricted' : 'Error Loading Data'}
          </h2>
          <p className="text-sm text-zinc-400 mb-4">
            {isAccessDenied
              ? 'The ecosystem explorer is restricted to authorized Binari Digital organization members.'
              : error}
          </p>
          {isAccessDenied && (
            <p className="text-xs text-zinc-500">
              Sign in with your @binari.digital account to access this page.
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full relative">
      {/* Title */}
      <div className="absolute top-4 left-4 z-40">
        <h1 className="text-sm font-bold text-white flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          Bridge Ecosystem Architecture
        </h1>
        <p className="text-[10px] text-zinc-500 mt-0.5">
          Interactive microservice network map · {ecosystemData?.services.length || 0} services · {ecosystemData?.connections.length || 0} connections
        </p>
      </div>

      <StatsBar healthStatuses={healthStatuses} data={ecosystemData || undefined} />

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
