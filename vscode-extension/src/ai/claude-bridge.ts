import * as vscode from 'vscode';
import { exec } from 'child_process';
import * as path from 'path';
import type { GraphNode } from '../graph/graph-builder';
import type { CircularDependency } from '../analyzer/circular-detector';
import type { DeadExport, DeadFile } from '../analyzer/dead-code-detector';

export interface ClaudeBridgeOptions {
  workspaceRoot: string;
}

/**
 * Bidirectional bridge to Claude Code CLI.
 * Generates context-aware prompts from architecture visualization
 * and sends them to Claude Code for execution.
 */
export class ClaudeBridge {
  private _claudeAvailable: boolean | null = null;

  constructor(private readonly _options: ClaudeBridgeOptions) {}

  /**
   * Check if Claude Code CLI is installed
   */
  async isAvailable(): Promise<boolean> {
    if (this._claudeAvailable !== null) return this._claudeAvailable;

    return new Promise((resolve) => {
      exec('which claude', (err) => {
        this._claudeAvailable = !err;
        resolve(this._claudeAvailable);
      });
    });
  }

  /**
   * Generate a prompt about a specific file/node
   */
  generateNodePrompt(node: GraphNode, action: 'explain' | 'refactor' | 'document'): string {
    const context = [
      `File: ${node.relativePath}`,
      `Directory: ${node.directory}`,
      `Imports: ${node.importCount} files`,
      `Imported by: ${node.importedByCount} files`,
      `Exports: ${node.exportCount} symbols`,
      node.isEntryPoint ? 'This is an entry point.' : '',
      node.isDeadCode ? 'WARNING: This file appears to be dead code (no importers).' : '',
      node.inCycle ? 'WARNING: This file is involved in a circular dependency.' : '',
    ].filter(Boolean).join('\n');

    switch (action) {
      case 'explain':
        return `Explain the architecture and purpose of ${node.relativePath}.\n\nContext from static analysis:\n${context}`;
      case 'refactor':
        return `Suggest refactoring improvements for ${node.relativePath}.\n\nContext from static analysis:\n${context}\n\nFocus on reducing coupling and improving cohesion.`;
      case 'document':
        return `Add JSDoc documentation to the public exports in ${node.relativePath}.\n\nContext from static analysis:\n${context}`;
      default:
        return `Analyze ${node.relativePath}.\n\n${context}`;
    }
  }

  /**
   * Generate a fix prompt for a circular dependency
   */
  generateCycleFixPrompt(cycle: CircularDependency): string {
    const files = cycle.relativeCycle.join(' → ') + ' → ' + cycle.relativeCycle[0];
    return `Break the circular dependency: ${files}\n\nExtract shared types/interfaces into a separate file that both modules can import from. Do not change the public API of either module.`;
  }

  /**
   * Generate a cleanup prompt for dead code
   */
  generateDeadCodePrompt(deadFiles: DeadFile[], deadExports: DeadExport[]): string {
    const parts: string[] = ['Clean up the following dead code:'];

    if (deadFiles.length > 0) {
      parts.push('\nOrphan files (not imported by anything):');
      for (const f of deadFiles.slice(0, 10)) {
        parts.push(`  - ${f.relativePath}`);
      }
    }

    if (deadExports.length > 0) {
      parts.push('\nUnused exports:');
      for (const e of deadExports.slice(0, 15)) {
        parts.push(`  - ${e.relativePath}: ${e.export.name} (${e.export.kind}, line ${e.export.line})`);
      }
    }

    parts.push('\nFor each item: verify it is truly unused, then either remove it or add a comment explaining why it should be kept.');
    return parts.join('\n');
  }

  /**
   * Generate a boundary violation fix prompt
   */
  generateBoundaryFixPrompt(
    filePath: string,
    importedPath: string,
    boundaryName: string
  ): string {
    return `The import of "${importedPath}" in "${filePath}" violates the "${boundaryName}" architectural boundary.\n\nRefactor this dependency. Options:\n1. Move the shared code to an allowed location\n2. Create an interface/abstraction that respects the boundary\n3. If the boundary rule is wrong, explain why it should be updated`;
  }

  /**
   * Send a prompt to Claude Code via terminal
   */
  async sendToClaude(prompt: string): Promise<void> {
    const available = await this.isAvailable();
    if (!available) {
      vscode.window.showErrorMessage(
        'Claude Code CLI not found. Install it from https://claude.ai/claude-code'
      );
      return;
    }

    // Escape the prompt for shell
    const escaped = prompt.replace(/'/g, "'\\''");

    const terminal = vscode.window.createTerminal({
      name: 'Arcwright → Claude',
      cwd: this._options.workspaceRoot,
    });
    terminal.sendText(`claude -p '${escaped}'`);
    terminal.show();
  }
}
