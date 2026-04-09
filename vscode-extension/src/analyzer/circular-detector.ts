import type { AnalysisResult } from './typescript-analyzer';

export interface CircularDependency {
  cycle: string[];           // absolute file paths forming the cycle
  relativeCycle: string[];   // relative paths for display
  length: number;
  severity: 'error' | 'warning';
}

export interface CircularDetectionResult {
  cycles: CircularDependency[];
  totalCycles: number;
  filesInCycles: Set<string>;
  edgesInCycles: Set<string>; // "source|target" pairs
}

/**
 * Detect circular dependencies using iterative DFS with Tarjan-inspired approach.
 * Direct A→B→A cycles are errors; longer cycles are warnings.
 */
export function detectCircularDependencies(
  analysis: AnalysisResult
): CircularDetectionResult {
  // Build adjacency list
  const graph = new Map<string, Set<string>>();
  for (const file of analysis.files) {
    graph.set(file.filePath, new Set());
  }
  for (const edge of analysis.edges) {
    const targets = graph.get(edge.source);
    if (targets) targets.add(edge.target);
  }

  // Build relativePath lookup
  const relPathMap = new Map<string, string>();
  for (const file of analysis.files) {
    relPathMap.set(file.filePath, file.relativePath);
  }

  const cycles: CircularDependency[] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const stack: string[] = [];

  // Dedup cycles by sorted string representation
  const seenCycles = new Set<string>();

  function dfs(node: string) {
    visited.add(node);
    inStack.add(node);
    stack.push(node);

    const neighbors = graph.get(node) || new Set();
    for (const neighbor of neighbors) {
      if (inStack.has(neighbor)) {
        // Found a cycle — extract it
        const cycleStart = stack.indexOf(neighbor);
        if (cycleStart >= 0) {
          const cycle = stack.slice(cycleStart);
          const key = [...cycle].sort().join('|');
          if (!seenCycles.has(key)) {
            seenCycles.add(key);
            cycles.push({
              cycle: [...cycle],
              relativeCycle: cycle.map(f => relPathMap.get(f) || f),
              length: cycle.length,
              severity: cycle.length <= 2 ? 'error' : 'warning',
            });
          }
        }
      } else if (!visited.has(neighbor)) {
        dfs(neighbor);
      }
    }

    stack.pop();
    inStack.delete(node);
  }

  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      dfs(node);
    }
  }

  // Collect files and edges involved in cycles
  const filesInCycles = new Set<string>();
  const edgesInCycles = new Set<string>();

  for (const cycle of cycles) {
    for (let i = 0; i < cycle.cycle.length; i++) {
      filesInCycles.add(cycle.cycle[i]);
      const next = cycle.cycle[(i + 1) % cycle.cycle.length];
      edgesInCycles.add(`${cycle.cycle[i]}|${next}`);
    }
  }

  return {
    cycles,
    totalCycles: cycles.length,
    filesInCycles,
    edgesInCycles,
  };
}
