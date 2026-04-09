// @arcwright/analyzer — Static analysis engine for TypeScript/JavaScript
export { WorkspaceAnalyzer } from './typescript-analyzer';
export type { FileNode, ExportInfo, ImportEdge, AnalysisResult } from './typescript-analyzer';

export { detectDeadCode } from './dead-code-detector';
export type { DeadExport, DeadFile, DeadCodeResult } from './dead-code-detector';

export { detectCircularDependencies } from './circular-detector';
export type { CircularDependency, CircularDetectionResult } from './circular-detector';

export { parseIntentFile } from './intent-parser';
export type { BoundaryRule, ArchitectureIntent } from './intent-parser';

export { detectDrift } from './drift-detector';
export type { BoundaryViolation, DriftResult } from './drift-detector';

export { minimatch } from './minimatch';
