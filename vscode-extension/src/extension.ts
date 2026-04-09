import * as vscode from 'vscode';
import { ArchitectureViewProvider } from './webview-provider';
import { WorkspaceAnalyzer } from './analyzer/typescript-analyzer';
import { FileWatcher } from './graph/file-watcher';
import { ArcwrightApiClient } from './ai/arcwright-api';
import { ClaudeBridge } from './ai/claude-bridge';

let fileWatcher: FileWatcher | undefined;

export function activate(context: vscode.ExtensionContext) {
  const analyzer = new WorkspaceAnalyzer();
  const apiClient = new ArcwrightApiClient(context);
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
  const claudeBridge = new ClaudeBridge({ workspaceRoot });
  const provider = new ArchitectureViewProvider(context.extensionUri, analyzer, apiClient, claudeBridge);

  // Register webview provider
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'arcwright.architectureView',
      provider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  // --- Core commands ---
  context.subscriptions.push(
    vscode.commands.registerCommand('arcwright.showArchitecture', () => {
      vscode.commands.executeCommand('arcwright.architectureView.focus');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('arcwright.analyzeWorkspace', async () => {
      await provider.analyzeAndUpdate();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('arcwright.focusCurrentFile', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        provider.focusFile(editor.document.uri.fsPath);
      }
    })
  );

  // --- API commands ---
  context.subscriptions.push(
    vscode.commands.registerCommand('arcwright.login', async () => {
      await apiClient.login();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('arcwright.logout', async () => {
      await apiClient.clearToken();
      vscode.window.showInformationMessage('Arcwright: Logged out');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('arcwright.analyzeWithAI', async () => {
      const authenticated = await apiClient.isAuthenticated();
      if (!authenticated) {
        const choice = await vscode.window.showWarningMessage(
          'Arcwright: Not logged in. Login to use AI analysis.',
          'Login'
        );
        if (choice === 'Login') await apiClient.login();
        return;
      }

      const repoId = await vscode.window.showInputBox({
        prompt: 'Enter the Arcwright repo ID to analyze',
        placeHolder: 'repo-uuid',
      });
      if (!repoId) return;

      const source = await vscode.window.showQuickPick(
        ['claude-api', 'cloudflare-ai'],
        { placeHolder: 'Select analysis source' }
      );
      if (!source) return;

      vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Arcwright: Running AI analysis...' },
        async () => {
          const result = await apiClient.analyzeRepo(repoId, source);
          if (result?.ok) {
            vscode.window.showInformationMessage(
              `Arcwright: Analysis complete — ${result.services || 0} services, ${result.issues || 0} issues`
            );
          }
        }
      );
    })
  );

  // --- Claude Code commands ---
  context.subscriptions.push(
    vscode.commands.registerCommand('arcwright.askClaude', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage('Arcwright: No file open');
        return;
      }

      const action = await vscode.window.showQuickPick(
        [
          { label: 'Explain', description: 'Explain architecture and purpose', value: 'explain' as const },
          { label: 'Refactor', description: 'Suggest refactoring improvements', value: 'refactor' as const },
          { label: 'Document', description: 'Add JSDoc documentation', value: 'document' as const },
        ],
        { placeHolder: 'What should Claude do with this file?' }
      );
      if (!action) return;

      const filePath = editor.document.uri.fsPath;
      const relativePath = vscode.workspace.asRelativePath(filePath);
      const prompt = claudeBridge.generateNodePrompt(
        {
          id: filePath,
          filePath,
          relativePath,
          fileName: relativePath.split('/').pop() || '',
          directory: relativePath.split('/').slice(0, -1).join('/'),
          size: 0,
          importCount: 0,
          importedByCount: 0,
          exportCount: 0,
          isEntryPoint: false,
          fileType: 'ts',
          position: { x: 0, y: 0 },
        },
        action.value
      );

      await claudeBridge.sendToClaude(prompt);
    })
  );

  // File watcher for auto-analysis
  const config = vscode.workspace.getConfiguration('arcwright');
  if (config.get<boolean>('autoAnalyze', true)) {
    fileWatcher = new FileWatcher(provider);
    context.subscriptions.push(fileWatcher);
  }

  // Listen for config changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('arcwright.autoAnalyze')) {
        const autoAnalyze = vscode.workspace.getConfiguration('arcwright').get<boolean>('autoAnalyze', true);
        if (autoAnalyze && !fileWatcher) {
          fileWatcher = new FileWatcher(provider);
          context.subscriptions.push(fileWatcher);
        } else if (!autoAnalyze && fileWatcher) {
          fileWatcher.dispose();
          fileWatcher = undefined;
        }
      }
    })
  );

  // Initial analysis on activation
  if (config.get<boolean>('autoAnalyze', true)) {
    setTimeout(() => provider.analyzeAndUpdate(), 1000);
  }
}

export function deactivate() {
  if (fileWatcher) {
    fileWatcher.dispose();
    fileWatcher = undefined;
  }
}
