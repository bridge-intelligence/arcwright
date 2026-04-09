import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

interface FileNodeData {
  fileName: string;
  directory: string;
  relativePath: string;
  fileType: 'ts' | 'tsx' | 'js' | 'jsx' | 'other';
  importCount: number;
  importedByCount: number;
  exportCount: number;
  isEntryPoint: boolean;
  isDeadCode?: boolean;
  inCycle?: boolean;
  color: string;
  size: number;
}

const FILE_ICONS: Record<string, string> = {
  ts: '⊤',
  tsx: '⊤×',
  js: 'JS',
  jsx: 'J×',
  other: '··',
};

function FileNodeComponent({ data, selected }: NodeProps) {
  const d = data as unknown as FileNodeData;
  const opacity = d.isDeadCode ? 0.4 : 1;
  const borderColor = d.inCycle
    ? '#ef4444'
    : selected
      ? '#3b82f6'
      : d.isEntryPoint
        ? '#eab308'
        : `${d.color}44`;

  return (
    <div
      style={{
        background: '#1e1e1e',
        border: `1.5px solid ${borderColor}`,
        borderRadius: 8,
        padding: '8px 10px',
        minWidth: 160,
        maxWidth: 200,
        opacity,
        boxShadow: selected ? `0 0 0 2px ${d.color}33` : 'none',
        transition: 'box-shadow 0.15s',
      }}
    >
      <Handle type="target" position={Position.Top} style={handleStyle} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
        <span
          style={{
            fontSize: 8,
            fontWeight: 700,
            fontFamily: 'monospace',
            color: d.color,
            background: `${d.color}22`,
            padding: '1px 4px',
            borderRadius: 3,
          }}
        >
          {FILE_ICONS[d.fileType] || '··'}
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: '#e5e5e5',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}
        >
          {d.fileName}
        </span>
        {d.isEntryPoint && (
          <span style={{ fontSize: 7, color: '#eab308', fontWeight: 700 }}>ENTRY</span>
        )}
        {d.inCycle && (
          <span style={{ fontSize: 7, color: '#ef4444', fontWeight: 700 }}>CYCLE</span>
        )}
        {d.isDeadCode && (
          <span style={{ fontSize: 7, color: '#6b7280', fontWeight: 700 }}>DEAD</span>
        )}
      </div>

      {/* Directory */}
      <div
        style={{
          fontSize: 8,
          color: '#737373',
          marginBottom: 4,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontFamily: 'monospace',
        }}
      >
        {d.directory || '.'}
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 8, fontSize: 8, color: '#a3a3a3' }}>
        <span title="Imports">
          <span style={{ color: '#3b82f6' }}>↓</span> {d.importCount}
        </span>
        <span title="Imported by">
          <span style={{ color: '#22c55e' }}>↑</span> {d.importedByCount}
        </span>
        <span title="Exports">
          <span style={{ color: '#a855f7' }}>⊕</span> {d.exportCount}
        </span>
        <span title="Size" style={{ marginLeft: 'auto', opacity: 0.5 }}>
          {formatSize(d.size)}
        </span>
      </div>

      <Handle type="source" position={Position.Bottom} style={handleStyle} />
    </div>
  );
}

const handleStyle: React.CSSProperties = {
  width: 6,
  height: 6,
  background: '#52525b',
  border: '1px solid #333',
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

export default memo(FileNodeComponent);
