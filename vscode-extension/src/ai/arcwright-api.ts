import * as vscode from 'vscode';

interface AnalysisResponse {
  ok: boolean;
  status: string;
  source: string;
  services?: number;
  issues?: number;
  cost?: {
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
    model: string;
  };
}

/**
 * Client for the Arcwright cloud API.
 * Used for AI-powered deep analysis via Claude/Cloudflare AI.
 */
export class ArcwrightApiClient {
  private _token: string | null = null;

  constructor(private readonly _context: vscode.ExtensionContext) {}

  private get _apiUrl(): string {
    return vscode.workspace.getConfiguration('arcwright').get<string>(
      'apiUrl',
      'https://arcwright-api.hamza-dastagir.workers.dev/api'
    );
  }

  async getToken(): Promise<string | null> {
    if (this._token) return this._token;
    this._token = await this._context.secrets.get('arcwright.token') || null;
    return this._token;
  }

  async setToken(token: string): Promise<void> {
    this._token = token;
    await this._context.secrets.store('arcwright.token', token);
  }

  async clearToken(): Promise<void> {
    this._token = null;
    await this._context.secrets.delete('arcwright.token');
  }

  async isAuthenticated(): Promise<boolean> {
    const token = await this.getToken();
    if (!token) return false;

    try {
      const res = await fetch(`${this._apiUrl}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Login by prompting user for their Arcwright token
   */
  async login(): Promise<boolean> {
    const token = await vscode.window.showInputBox({
      prompt: 'Enter your Arcwright API token',
      placeHolder: 'eyJhbGciOiJ...',
      password: true,
      ignoreFocusOut: true,
    });

    if (!token) return false;

    // Verify the token
    try {
      const res = await fetch(`${this._apiUrl}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        await this.setToken(token);
        vscode.window.showInformationMessage('Arcwright: Logged in successfully');
        return true;
      } else {
        vscode.window.showErrorMessage('Arcwright: Invalid token');
        return false;
      }
    } catch (err) {
      vscode.window.showErrorMessage('Arcwright: Failed to connect to API');
      return false;
    }
  }

  /**
   * Trigger AI analysis for a connected repo
   */
  async analyzeRepo(
    repoId: string,
    source: string = 'claude-api',
    branch?: string
  ): Promise<AnalysisResponse | null> {
    const token = await this.getToken();
    if (!token) {
      vscode.window.showWarningMessage('Arcwright: Not logged in. Use "Arcwright: Login" command.');
      return null;
    }

    try {
      const res = await fetch(`${this._apiUrl}/repos/${repoId}/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ source, branch }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error((body as { error?: string }).error || res.statusText);
      }

      return await res.json();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      vscode.window.showErrorMessage(`Arcwright: Analysis failed — ${msg}`);
      return null;
    }
  }

  /**
   * Get architecture XML for a repo
   */
  async getArchitectureXml(repoId: string): Promise<string | null> {
    const token = await this.getToken();
    if (!token) return null;

    try {
      const res = await fetch(`${this._apiUrl}/repos/${repoId}/architecture.xml`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) return null;
      return await res.text();
    } catch {
      return null;
    }
  }
}
