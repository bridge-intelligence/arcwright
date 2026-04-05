const API_BASE = import.meta.env.VITE_API_URL || '/api';
const TOKEN_KEY = 'arcwright_token';

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers as Record<string, string>,
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    clearToken();
    localStorage.removeItem('arcwright_user');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((body as { error?: string }).error || res.statusText);
  }

  return res.json();
}

// --- Auth ---
export const authApi = {
  getGoogleAuthUrl: () => `${API_BASE}/auth/google`,
  getGitHubAuthUrl: () => `${API_BASE}/auth/github`,
  getMe: () => request<{
    id: string;
    tenant_id: string;
    email: string;
    display_name: string | null;
    photo_url: string | null;
    github_username: string | null;
    role: string;
  }>('/auth/me'),
};

// --- Repos ---
export interface RepoResponse {
  id: string;
  tenant_id: string;
  full_name: string;
  name: string;
  status: 'pending' | 'analyzing' | 'ready' | 'error';
  services: number | null;
  issues: number | null;
  last_analyzed_at: string | null;
  created_at: string;
}

export interface GitHubAvailableRepo {
  id: number;
  name: string;
  full_name: string;
  default_branch: string;
  private: boolean;
  language: string | null;
  description: string | null;
  updated_at: string;
}

export interface RepoDetail extends Omit<RepoResponse, 'issues'> {
  latest_analysis: {
    id: string;
    status: string;
    services_count: number;
    issues_count: number;
    summary: string | null;
    completed_at: string | null;
  } | null;
  issues: Array<{
    id: string;
    type: string;
    severity: string;
    title: string;
    description: string | null;
    file_path: string | null;
    line_number: number | null;
  }>;
}

export const reposApi = {
  list: () => request<RepoResponse[]>('/repos'),
  get: (id: string) => request<RepoDetail>(`/repos/${id}`),
  connect: (fullName: string) => request<{ id: string; status: string }>('/repos/connect', {
    method: 'POST',
    body: JSON.stringify({ full_name: fullName }),
  }),
  getArchitectureXml: async (id: string): Promise<string> => {
    const token = getToken();
    const res = await fetch(`${API_BASE}/repos/${id}/architecture.xml`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error('Failed to fetch architecture XML');
    return res.text();
  },
  disconnect: (id: string) => request<{ ok: boolean }>(`/repos/${id}`, { method: 'DELETE' }),
  listAvailable: () => request<GitHubAvailableRepo[]>('/repos/github/available'),
};
