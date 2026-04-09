import * as vscode from 'vscode';
import { WorkspaceAnalyzer, type AnalysisResult } from './analyzer/typescript-analyzer';
import { buildGraph, type GraphData } from './graph/graph-builder';
import { detectDeadCode } from './analyzer/dead-code-detector';
import { detectCircularDependencies } from './analyzer/circular-detector';
import { parseIntentFile } from './intent/intent-parser';
import { detectDrift } from './intent/drift-detector';
import type { ArcwrightApiClient } from './ai/arcwright-api';
import type { ClaudeBridge } from './ai/claude-bridge';

export class ArchitectureViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private _lastGraph?: GraphData;
  private _lastAnalysis?: AnalysisResult;
  private _diagnostics: vscode.DiagnosticCollection;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _analyzer: WorkspaceAnalyzer,
    private readonly _apiClient: ArcwrightApiClient,
    private readonly _claudeBridge: ClaudeBridge
  ) {
    this._diagnostics = vscode.languages.createDiagnosticCollection('arcwright');
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview'),
      ],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'openFile': {
          const uri = vscode.Uri.file(message.filePath);
          try {
            const doc = await vscode.workspace.openTextDocument(uri);
            await vscode.window.showTextDocument(doc, {
              viewColumn: vscode.ViewColumn.One,
              preserveFocus: false,
            });
          } catch {
            vscode.window.showWarningMessage(`Arcwright: Could not open ${message.filePath}`);
          }
          break;
        }
        case 'requestAnalysis': {
          await this.analyzeAndUpdate();
          break;
        }
        case 'sendToClaudeCode': {
          await this._claudeBridge.sendToClaude(message.prompt);
          break;
        }
        case 'askClaudeAboutNode': {
          if (this._lastGraph) {
            const node = this._lastGraph.nodes.find(n => n.id === message.nodeId);
            if (node) {
              const prompt = this._claudeBridge.generateNodePrompt(node, message.action || 'explain');
              await this._claudeBridge.sendToClaude(prompt);
            }
          }
          break;
        }
        case 'fixCycle': {
          if (message.cycle) {
            const prompt = this._claudeBridge.generateCycleFixPrompt(message.cycle);
            await this._claudeBridge.sendToClaude(prompt);
          }
          break;
        }
      }
    });

    // Send cached data if available
    if (this._lastGraph) {
      this._postMessage({ type: 'graphData', data: this._lastGraph });
    }
  }

  async analyzeAndUpdate() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showWarningMessage('Arcwright: No workspace folder open');
      return;
    }

    this._postMessage({ type: 'analyzing', data: null });

    try {
      const rootPath = workspaceFolders[0].uri.fsPath;
      const config = vscode.workspace.getConfiguration('arcwright');
      const excludePatterns = config.get<string[]>('excludePatterns', []);
      const maxFiles = config.get<number>('maxFiles', 500);

      // Phase 1: Static analysis
      const analysis = await this._analyzer.analyze(rootPath, excludePatterns, maxFiles);
      this._lastAnalysis = analysis;

      // Phase 2: Dead code + circular dependency detection
      const deadCode = detectDeadCode(analysis);
      const circular = detectCircularDependencies(analysis);

      // Build graph with Phase 2 overlays
      const graph = buildGraph(analysis, rootPath);

      // Annotate graph nodes with dead code / cycle info
      for (const node of graph.nodes) {
        node.isDeadCode = deadCode.deadFiles.some(d => d.filePath === node.id);
        node.inCycle = circular.filesInCycles.has(node.id);
      }
      for (const edge of graph.edges) {
        edge.inCycle = circular.edgesInCycles.has(`${edge.source}|${edge.target}`);
      }

      // Add analysis summary to stats
      (graph.stats as Record<string, unknown>).deadFiles = deadCode.deadFileCount;
      (graph.stats as Record<string, unknown>).deadExports = deadCode.deadExportCount;
      (graph.stats as Record<string, unknown>).circularDeps = circular.totalCycles;
      (graph.stats as Record<string, unknown>).cycles = circular.cycles;

      this._lastGraph = graph;
      this._postMessage({ type: 'graphData', data: graph });

      // Phase 3: Intent-based drift detection
      const intent = parseIntentFile(rootPath);
      if (intent && intent.boundaries.length > 0) {
        const drift = detectDrift(analysis, intent, rootPath);
        this._updateDiagnostics(drift.violations, rootPath);

        if (!drift.clean) {
          this._postMessage({
            type: 'driftViolations',
            data: { violations: drift.violations, count: drift.violations.length },
          });
        }
      } else {
        this._diagnostics.clear();
      }

      // Show summary notification
      const parts = [`${analysis.analyzedFiles} files, ${analysis.edges.length} imports`];
      if (deadCode.deadFileCount > 0) parts.push(`${deadCode.deadFileCount} dead files`);
      if (circular.totalCycles > 0) parts.push(`${circular.totalCycles} circular deps`);
      parts.push(`${analysis.duration}ms`);

      vscode.window.setStatusBarMessage(`Arcwright: ${parts.join(' · ')}`, 5000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      vscode.window.showErrorMessage(`Arcwright: Analysis failed — ${msg}`);
      this._postMessage({ type: 'error', data: msg });
    }
  }

  focusFile(filePath: string) {
    this._postMessage({ type: 'focusFile', data: filePath });
  }

  private _updateDiagnostics(
    violations: Array<{ filePath: string; importedRelativePath: string; boundaryName: string; message: string }>,
    _rootPath: string
  ) {
    this._diagnostics.clear();

    // Group violations by file
    const byFile = new Map<string, vscode.Diagnostic[]>();
    for (const v of violations) {
      if (!byFile.has(v.filePath)) byFile.set(v.filePath, []);
      const diag = new vscode.Diagnostic(
        new vscode.Range(0, 0, 0, 0), // Will be refined if we add line tracking
        `Boundary violation: ${v.message}`,
        vscode.DiagnosticSeverity.Warning
      );
      diag.source = 'Arcwright';
      diag.code = v.boundaryName;
      byFile.get(v.filePath)!.push(diag);
    }

    for (const [filePath, diags] of byFile) {
      this._diagnostics.set(vscode.Uri.file(filePath), diags);
    }
  }

  private _postMessage(message: { type: string; data: unknown }) {
    if (this._view) {
      this._view.webview.postMessage(message);
    }
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'assets', 'index.js')
    );

    const nonce = getNonce();

    // CSS is injected inline by the IIFE bundle, so no separate stylesheet needed
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data:; font-src ${webview.cspSource};">
  <title>Arcwright</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
