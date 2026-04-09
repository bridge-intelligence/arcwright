/**
 * Simple glob matching for architectural boundary patterns.
 * Supports: **, *, and literal path segments.
 */
export function minimatch(filePath: string, pattern: string): boolean {
  // Normalize separators
  const normalized = filePath.replace(/\\/g, '/');
  const normalizedPattern = pattern.replace(/\\/g, '/');

  // Convert glob pattern to regex
  let regex = normalizedPattern
    // Escape special regex chars (except * and ?)
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    // Convert ** to match any path
    .replace(/\*\*/g, '⚡GLOBSTAR⚡')
    // Convert * to match within a segment
    .replace(/\*/g, '[^/]*')
    // Convert globstar back
    .replace(/⚡GLOBSTAR⚡/g, '.*');

  // Anchor the pattern
  regex = `^${regex}$`;

  try {
    return new RegExp(regex).test(normalized);
  } catch {
    return false;
  }
}
