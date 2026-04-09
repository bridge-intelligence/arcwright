import type { AnalysisResult, ExportInfo } from './typescript-analyzer';

export interface DeadExport {
  filePath: string;
  relativePath: string;
  export: ExportInfo;
}

export interface DeadFile {
  filePath: string;
  relativePath: string;
  reason: 'no-importers' | 'only-types';
}

export interface DeadCodeResult {
  deadExports: DeadExport[];
  deadFiles: DeadFile[];
  totalExports: number;
  deadExportCount: number;
  deadFileCount: number;
}

/**
 * Find unused exports and orphan files.
 * An export is "dead" if no other analyzed file imports it.
 * A file is "dead" if no other file imports it AND it's not an entry point.
 */
export function detectDeadCode(analysis: AnalysisResult): DeadCodeResult {
  const entrySet = new Set(analysis.entryPoints);

  // Build reverse import map: which files import from each target?
  const importedBy = new Map<string, Set<string>>();
  for (const edge of analysis.edges) {
    if (!importedBy.has(edge.target)) {
      importedBy.set(edge.target, new Set());
    }
    importedBy.get(edge.target)!.add(edge.source);
  }

  // Build map: which named specifiers are imported from each file?
  const importedSpecifiers = new Map<string, Set<string>>();
  for (const edge of analysis.edges) {
    if (!importedSpecifiers.has(edge.target)) {
      importedSpecifiers.set(edge.target, new Set());
    }
    for (const spec of edge.specifiers) {
      importedSpecifiers.get(edge.target)!.add(spec);
    }
  }

  const deadExports: DeadExport[] = [];
  const deadFiles: DeadFile[] = [];
  let totalExports = 0;

  for (const file of analysis.files) {
    const importers = importedBy.get(file.filePath);
    const isImported = importers && importers.size > 0;
    const isEntry = entrySet.has(file.filePath);

    // Dead file: not imported by anyone and not an entry point
    if (!isImported && !isEntry) {
      deadFiles.push({
        filePath: file.filePath,
        relativePath: file.relativePath,
        reason: 'no-importers',
      });
    }

    // Check individual exports
    const specs = importedSpecifiers.get(file.filePath) || new Set();
    const hasWildcardImport = specs.has('*');

    for (const exp of file.exports) {
      totalExports++;

      // Skip if entry point (exports are public API)
      if (isEntry) continue;

      // Skip if someone does `import * from ...`
      if (hasWildcardImport) continue;

      // Check if this specific export is imported
      const isUsed = specs.has(exp.name) ||
        (exp.kind === 'default' && specs.has('default'));

      if (!isUsed && isImported) {
        deadExports.push({
          filePath: file.filePath,
          relativePath: file.relativePath,
          export: exp,
        });
      }
    }
  }

  return {
    deadExports,
    deadFiles,
    totalExports,
    deadExportCount: deadExports.length,
    deadFileCount: deadFiles.length,
  };
}
