import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeMouseHandler,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import FileNode from './components/FileNode';
import { useExtensionMessage } from './hooks/useExtensionMessage';
import type { GraphData, GraphNode, GraphEdge, DirectoryGroup } from '../../graph/graph-builder';

const nodeTypes = { fileNode: FileNode };

// Directory colors
const DIR_COLORS = [
  '#3b82f6', '#22c55e', '#a855f7', '#f97316', '#06b6d4',
  '#ec4899', '#eab308', '#14b8a6', '#8b5cf6', '#ef4444',
];

function graphToReactFlow(data: GraphData) {
  const dirColorMap: Record<string, string> = {};
  data.directories.forEach((d, i) => {
    dirColorMap[d.directory] = DIR_COLORS[i % DIR_COLORS.length];
  });

  const nodes: Node[] = data.nodes.map(n => ({
    id: n.id,
    type: 'fileNode',
    position: n.position,
    data: {
      ...n,
      color: dirColorMap[n.directory] || '#6b7280',
    },
  }));

  const edges: Edge[] = data.edges.map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    animated: e.importType === 'dynamic',
    style: {
      stroke: e.inCycle ? '#ef4444' : '#52525b',
      strokeWidth: e.inCycle ? 2.5 : 1.2,
      opacity: 0.6,
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: e.inCycle ? '#ef4444' : '#52525b',
      width: 8,
      height: 8,
    },
    label: e.specifiers.length > 0 && e.specifiers.length <= 3
      ? e.specifiers.join(', ')
      : undefined,
    labelStyle: { fontSize: 8, fill: '#a1a1aa', fontFamily: 'monospace' },
    labelBgStyle: { fill: '#1e1e1e', fillOpacity: 0.9 },
    labelBgPadding: [2, 1] as [number, number],
  }));

  return { nodes, edges };
}

export default function App() {
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedFile, setFocusedFile] = useState<string | null>(null);

  const { postMessage } = useExtensionMessage((message) => {
    switch (message.type) {
      case 'graphData':
        setGraphData(message.data as GraphData);
        setAnalyzing(false);
        setError(null);
        break;
      case 'analyzing':
        setAnalyzing(true);
        setError(null);
        break;
      case 'error':
        setError(message.data as string);
        setAnalyzing(false);
        break;
      case 'focusFile':
        setFocusedFile(message.data as string);
        break;
    }
  });

  const reactFlowData = graphData ? graphToReactFlow(graphData) : null;
  const [nodes, setNodes, onNodesChange] = useNodesState(reactFlowData?.nodes || []);
  const [edges, setEdges, onEdgesChange] = useEdgesState(reactFlowData?.edges || []);

  // Sync when data changes
  const prevKeyRef = useRef('');
  useEffect(() => {
    if (reactFlowData) {
      const key = reactFlowData.nodes.length + '|' + reactFlowData.edges.length;
      if (prevKeyRef.current !== key) {
        prevKeyRef.current = key;
        setNodes(reactFlowData.nodes);
        setEdges(reactFlowData.edges);
      }
    }
  }, [reactFlowData, setNodes, setEdges]);

  const onNodeClick: NodeMouseHandler = useCallback((_event, node) => {
    postMessage({ type: 'openFile', filePath: node.id });
  }, [postMessage]);

  const onRefresh = useCallback(() => {
    postMessage({ type: 'requestAnalysis' });
  }, [postMessage]);

  // Empty state
  if (!graphData && !analyzing && !error) {
    return (
      <div style={styles.emptyState}>
        <div style={styles.logo}>A</div>
        <h2 style={styles.title}>Arcwright</h2>
        <p style={styles.subtitle}>Architecture Intelligence</p>
        <button style={styles.button} onClick={onRefresh}>
          Analyze Workspace
        </button>
      </div>
    );
  }

  // Analyzing state
  if (analyzing) {
    return (
      <div style={styles.emptyState}>
        <div style={styles.spinner} />
        <p style={styles.subtitle}>Analyzing workspace...</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div style={styles.emptyState}>
        <p style={{ ...styles.subtitle, color: '#ef4444' }}>{error}</p>
        <button style={styles.button} onClick={onRefresh}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100vh' }}>
      {/* Stats bar */}
      {graphData && (
        <div style={styles.statsBar}>
          <span style={styles.stat}>{graphData.stats.totalFiles} files</span>
          <span style={styles.statDivider}>·</span>
          <span style={styles.stat}>{graphData.stats.totalImports} imports</span>
          <span style={styles.statDivider}>·</span>
          <span style={styles.stat}>{graphData.stats.totalExports} exports</span>
          <span style={styles.statDivider}>·</span>
          <span style={styles.stat}>{graphData.stats.duration}ms</span>
          <button style={styles.refreshButton} onClick={onRefresh} title="Re-analyze">
            ↻
          </button>
        </div>
      )}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={3}
        defaultEdgeOptions={{ type: 'smoothstep' }}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#333" />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={(node) => {
            const data = node.data as { color?: string };
            return data?.color || '#52525b';
          }}
          maskColor="rgba(0,0,0,0.7)"
          style={{ width: 140, height: 90 }}
        />
      </ReactFlow>

      {/* Directory legend */}
      {graphData && (
        <div style={styles.legend}>
          {graphData.directories.slice(0, 12).map(d => (
            <div key={d.directory} style={styles.legendItem}>
              <span style={{ ...styles.legendDot, backgroundColor: d.color }} />
              <span style={styles.legendLabel}>{d.directory || '.'}</span>
              <span style={styles.legendCount}>{d.fileCount}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    gap: 8,
    fontFamily: 'var(--vscode-font-family, system-ui)',
    color: 'var(--vscode-foreground, #ccc)',
  },
  logo: {
    width: 48,
    height: 48,
    borderRadius: 12,
    background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 24,
    fontWeight: 700,
    color: '#fff',
    marginBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: 600,
    margin: 0,
  },
  subtitle: {
    fontSize: 12,
    opacity: 0.6,
    margin: 0,
  },
  button: {
    marginTop: 12,
    padding: '6px 16px',
    borderRadius: 6,
    border: 'none',
    background: '#3b82f6',
    color: '#fff',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
  },
  spinner: {
    width: 24,
    height: 24,
    border: '2px solid #3b82f6',
    borderTopColor: 'transparent',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  statsBar: {
    position: 'absolute',
    top: 8,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 40,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 12px',
    borderRadius: 8,
    background: 'var(--vscode-editor-background, #1e1e1e)',
    border: '1px solid var(--vscode-panel-border, #333)',
    fontSize: 10,
    fontFamily: 'monospace',
    color: 'var(--vscode-foreground, #ccc)',
  },
  stat: { opacity: 0.8 },
  statDivider: { opacity: 0.3 },
  refreshButton: {
    marginLeft: 4,
    background: 'none',
    border: 'none',
    color: 'var(--vscode-foreground, #ccc)',
    fontSize: 14,
    cursor: 'pointer',
    padding: '0 2px',
    opacity: 0.6,
  },
  legend: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    zIndex: 40,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    padding: '6px 10px',
    borderRadius: 8,
    background: 'var(--vscode-editor-background, #1e1e1e)',
    border: '1px solid var(--vscode-panel-border, #333)',
    fontSize: 9,
    fontFamily: 'monospace',
    maxHeight: 200,
    overflowY: 'auto',
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    flexShrink: 0,
  },
  legendLabel: {
    color: 'var(--vscode-foreground, #ccc)',
    opacity: 0.7,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    maxWidth: 120,
  },
  legendCount: {
    color: 'var(--vscode-foreground, #ccc)',
    opacity: 0.4,
    marginLeft: 'auto',
  },
};
