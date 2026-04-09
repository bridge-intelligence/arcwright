import * as vscode from 'vscode';
import type { ArchitectureViewProvider } from '../webview-provider';

export class FileWatcher implements vscode.Disposable {
  private _watcher: vscode.FileSystemWatcher;
  private _debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly _debounceMs = 800;

  constructor(private readonly _provider: ArchitectureViewProvider) {
    this._watcher = vscode.workspace.createFileSystemWatcher(
      '**/*.{ts,tsx,js,jsx}',
      false, // create
      false, // change
      false  // delete
    );

    this._watcher.onDidChange(() => this._scheduleUpdate());
    this._watcher.onDidCreate(() => this._scheduleUpdate());
    this._watcher.onDidDelete(() => this._scheduleUpdate());
  }

  private _scheduleUpdate() {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
    }
    this._debounceTimer = setTimeout(() => {
      this._provider.analyzeAndUpdate();
    }, this._debounceMs);
  }

  dispose() {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
    }
    this._watcher.dispose();
  }
}
