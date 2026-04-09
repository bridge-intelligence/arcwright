import type { AnalysisResult, FileNode, ImportEdge } from '../analyzer/typescript-analyzer';
import * as path from 'path';

export interface GraphNode {
  id: string;
  filePath: string;
  relativePath: string;
  fileName: string;
  directory: string;
  size: number;
  importCount: number;
  importedByCount: number;
  exportCount: number;
  isEntryPoint: boolean;
  fileType: 'ts' | 'tsx' | 'js' | 'jsx' | 'other';
  position: { x: number; y: number };
  // Phase 2 fields
  isDeadCode?: boolean;
  inCycle?: boolean;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  specifiers: string[];
  importType: string;
  inCycle?: boolean;
}

export interface DirectoryGroup {
  directory: string;
  color: string;
  fileCount: number;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  directories: DirectoryGroup[];
  stats: {
    totalFiles: number;
    totalImports: number;
    totalExports: number;
    entryPoints: number;
    avgImportsPerFile: number;
    deepestNesting: number;
    duration: number;
  };
}

// Color palette for directories
const DIR_COLORS = [
  '#3b82f6', '#22c55e', '#a855f7', '#f97316', '#06b6d4',
  '#ec4899', '#eab308', '#14b8a6', '#8b5cf6', '#ef4444',
  '#84cc16', '#f43f5e', '#0ea5e9', '#d946ef', '#facc15',
];

export function buildGraph(analysis: AnalysisResult, rootPath: string): GraphData {
  // Count how many files import each file (importedBy)
  const importedByCount: Record<string, number> = {};
  for (const edge of analysis.edges) {
    importedByCount[edge.target] = (importedByCount[edge.target] || 0) + 1;
  }

  // Discover unique directories and assign colors
  const dirSet = new Set<string>();
  for (const file of analysis.files) {
    dirSet.add(file.directory || '.');
  }
  const directories = [...dirSet].sort();
  const dirColorMap: Record<string, string> = {};
  directories.forEach((dir, i) => {
    dirColorMap[dir] = DIR_COLORS[i % DIR_COLORS.length];
  });

  // Layout: group by directory, files within directory spread horizontally
  const positions = computeLayout(analysis.files, directories);

  // Build nodes
  const nodes: GraphNode[] = analysis.files.map(file => {
    const ext = path.extname(file.fileName).slice(1);
    const fileType = (['ts', 'tsx', 'js', 'jsx'].includes(ext) ? ext : 'other') as GraphNode['fileType'];

    return {
      id: file.filePath,
      filePath: file.filePath,
      relativePath: file.relativePath,
      fileName: file.fileName,
      directory: file.directory || '.',
      size: file.size,
      importCount: file.imports.length,
      importedByCount: importedByCount[file.filePath] || 0,
      exportCount: file.exports.length,
      isEntryPoint: file.isEntryPoint,
      fileType,
      position: positions[file.filePath] || { x: 0, y: 0 },
    };
  });

  // Build edges
  const edges: GraphEdge[] = analysis.edges.map((edge, i) => ({
    id: `e-${i}`,
    source: edge.source,
    target: edge.target,
    specifiers: edge.specifiers,
    importType: edge.importType,
  }));

  // Directory groups
  const dirGroups: DirectoryGroup[] = directories.map(dir => ({
    directory: dir,
    color: dirColorMap[dir],
    fileCount: analysis.files.filter(f => (f.directory || '.') === dir).length,
  }));

  // Stats
  const totalExports = analysis.files.reduce((acc, f) => acc + f.exports.length, 0);
  const deepestNesting = Math.max(0, ...analysis.files.map(f => f.relativePath.split(path.sep).length - 1));

  return {
    nodes,
    edges,
    directories: dirGroups,
    stats: {
      totalFiles: analysis.totalFiles,
      totalImports: analysis.edges.length,
      totalExports,
      entryPoints: analysis.entryPoints.length,
      avgImportsPerFile: analysis.files.length > 0
        ? Math.round((analysis.edges.length / analysis.files.length) * 10) / 10
        : 0,
      deepestNesting,
      duration: analysis.duration,
    },
  };
}

function computeLayout(
  files: FileNode[],
  directories: string[]
): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {};

  // Group files by directory
  const byDir: Record<string, FileNode[]> = {};
  for (const f of files) {
    const dir = f.directory || '.';
    if (!byDir[dir]) byDir[dir] = [];
    byDir[dir].push(f);
  }

  // Layout directories vertically, files within each directory horizontally
  const NODE_WIDTH = 200;
  const NODE_HEIGHT = 80;
  const DIR_GAP = 120;
  const FILE_GAP = 40;

  let currentY = 0;

  for (const dir of directories) {
    const dirFiles = byDir[dir] || [];
    if (dirFiles.length === 0) continue;

    // Sort files: entry points first, then by name
    dirFiles.sort((a, b) => {
      if (a.isEntryPoint !== b.isEntryPoint) return a.isEntryPoint ? -1 : 1;
      return a.fileName.localeCompare(b.fileName);
    });

    // Spread files horizontally
    const totalWidth = dirFiles.length * (NODE_WIDTH + FILE_GAP) - FILE_GAP;
    const startX = Math.max(0, (800 - totalWidth) / 2);

    dirFiles.forEach((file, i) => {
      positions[file.filePath] = {
        x: startX + i * (NODE_WIDTH + FILE_GAP),
        y: currentY,
      };
    });

    currentY += NODE_HEIGHT + DIR_GAP;
  }

  return positions;
}
