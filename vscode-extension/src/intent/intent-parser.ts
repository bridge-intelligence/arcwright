import * as fs from 'fs';
import * as path from 'path';

export interface BoundaryRule {
  name: string;
  includes: string[];       // glob patterns for files in this boundary
  may_import: string[];     // allowed import targets (glob patterns)
  must_not_import: string[]; // forbidden import targets (glob patterns)
  description?: string;
}

export interface ArchitectureIntent {
  boundaries: BoundaryRule[];
}

/**
 * Parse .arcwright.yml from workspace root.
 *
 * Example .arcwright.yml:
 * ```yaml
 * boundaries:
 *   - name: "API Layer"
 *     includes:
 *       - "src/api/**"
 *       - "src/routes/**"
 *     may_import:
 *       - "src/services/**"
 *       - "src/types/**"
 *     must_not_import:
 *       - "src/components/**"
 *       - "src/pages/**"
 *
 *   - name: "UI Layer"
 *     includes:
 *       - "src/components/**"
 *       - "src/pages/**"
 *     must_not_import:
 *       - "src/api/**"
 * ```
 */
export function parseIntentFile(workspaceRoot: string): ArchitectureIntent | null {
  const candidates = ['.arcwright.yml', '.arcwright.yaml', 'arcwright.yml'];
  let filePath: string | null = null;

  for (const name of candidates) {
    const p = path.join(workspaceRoot, name);
    if (fs.existsSync(p)) {
      filePath = p;
      break;
    }
  }

  if (!filePath) return null;

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return parseYaml(content);
  } catch {
    return null;
  }
}

/**
 * Simple YAML parser for the .arcwright.yml format.
 * Handles the specific structure we need without a full YAML library.
 */
function parseYaml(content: string): ArchitectureIntent {
  const boundaries: BoundaryRule[] = [];
  const lines = content.split('\n');

  let currentBoundary: Partial<BoundaryRule> | null = null;
  let currentArray: string | null = null;

  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');

    // Skip empty lines and comments
    if (line.trim() === '' || line.trim().startsWith('#')) continue;

    // Top-level "boundaries:" — just a section header
    if (line.match(/^boundaries:\s*$/)) continue;

    // New boundary item: "  - name: ..."
    const nameMatch = line.match(/^\s+-\s+name:\s*"?([^"]+)"?\s*$/);
    if (nameMatch) {
      if (currentBoundary && currentBoundary.name) {
        boundaries.push(normalizeBoundary(currentBoundary));
      }
      currentBoundary = { name: nameMatch[1].trim() };
      currentArray = null;
      continue;
    }

    // Description: "    description: ..."
    const descMatch = line.match(/^\s+description:\s*"?([^"]*)"?\s*$/);
    if (descMatch && currentBoundary) {
      currentBoundary.description = descMatch[1].trim();
      continue;
    }

    // Array key: "    includes:", "    may_import:", "    must_not_import:"
    const arrayKeyMatch = line.match(/^\s+(includes|may_import|must_not_import):\s*$/);
    if (arrayKeyMatch && currentBoundary) {
      currentArray = arrayKeyMatch[1];
      if (!currentBoundary[currentArray as keyof BoundaryRule]) {
        (currentBoundary as Record<string, string[]>)[currentArray] = [];
      }
      continue;
    }

    // Array item: "      - "src/api/**""
    const itemMatch = line.match(/^\s+-\s+"?([^"]+)"?\s*$/);
    if (itemMatch && currentBoundary && currentArray) {
      const arr = (currentBoundary as Record<string, string[]>)[currentArray];
      if (arr) arr.push(itemMatch[1].trim());
      continue;
    }
  }

  // Push last boundary
  if (currentBoundary && currentBoundary.name) {
    boundaries.push(normalizeBoundary(currentBoundary));
  }

  return { boundaries };
}

function normalizeBoundary(partial: Partial<BoundaryRule>): BoundaryRule {
  return {
    name: partial.name || 'unnamed',
    includes: partial.includes || [],
    may_import: partial.may_import || [],
    must_not_import: partial.must_not_import || [],
    description: partial.description,
  };
}
