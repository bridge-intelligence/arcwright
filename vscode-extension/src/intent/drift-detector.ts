import * as path from 'path';
import { minimatch } from './minimatch';
import type { AnalysisResult } from '../analyzer/typescript-analyzer';
import type { BoundaryRule, ArchitectureIntent } from './intent-parser';

export interface BoundaryViolation {
  filePath: string;
  relativePath: string;
  importedPath: string;
  importedRelativePath: string;
  boundaryName: string;
  ruleType: 'must_not_import' | 'not_in_may_import';
  message: string;
  line?: number;
}

export interface DriftResult {
  violations: BoundaryViolation[];
  totalChecked: number;
  boundariesChecked: number;
  clean: boolean;
}

/**
 * Compare actual import graph against .arcwright.yml architectural boundaries.
 * Reports violations where imports cross declared boundaries.
 */
export function detectDrift(
  analysis: AnalysisResult,
  intent: ArchitectureIntent,
  rootPath: string
): DriftResult {
  const violations: BoundaryViolation[] = [];
  let totalChecked = 0;

  for (const boundary of intent.boundaries) {
    // Find files that belong to this boundary
    const boundaryFiles = analysis.files.filter(f =>
      boundary.includes.some(pattern => minimatch(f.relativePath, pattern))
    );

    for (const file of boundaryFiles) {
      for (const importPath of file.imports) {
        const importRelPath = path.relative(rootPath, importPath);
        totalChecked++;

        // Check must_not_import rules
        if (boundary.must_not_import.length > 0) {
          const forbidden = boundary.must_not_import.some(pattern =>
            minimatch(importRelPath, pattern)
          );
          if (forbidden) {
            violations.push({
              filePath: file.filePath,
              relativePath: file.relativePath,
              importedPath: importPath,
              importedRelativePath: importRelPath,
              boundaryName: boundary.name,
              ruleType: 'must_not_import',
              message: `"${file.relativePath}" imports "${importRelPath}" which violates "${boundary.name}" boundary (must_not_import)`,
            });
          }
        }

        // Check may_import rules (if defined, only listed patterns are allowed)
        if (boundary.may_import.length > 0) {
          // Skip imports within the same boundary
          const isInSameBoundary = boundary.includes.some(pattern =>
            minimatch(importRelPath, pattern)
          );
          if (isInSameBoundary) continue;

          // Skip node_modules / external
          if (importRelPath.includes('node_modules')) continue;

          const allowed = boundary.may_import.some(pattern =>
            minimatch(importRelPath, pattern)
          );
          if (!allowed) {
            violations.push({
              filePath: file.filePath,
              relativePath: file.relativePath,
              importedPath: importPath,
              importedRelativePath: importRelPath,
              boundaryName: boundary.name,
              ruleType: 'not_in_may_import',
              message: `"${file.relativePath}" imports "${importRelPath}" which is not in the allowed imports for "${boundary.name}" boundary`,
            });
          }
        }
      }
    }
  }

  return {
    violations,
    totalChecked,
    boundariesChecked: intent.boundaries.length,
    clean: violations.length === 0,
  };
}
