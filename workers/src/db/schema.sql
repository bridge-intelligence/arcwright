-- Arcwright D1 Schema
-- Multi-tenant architecture: tenant → users → repos → analyses

CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'free',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  photo_url TEXT,
  google_id TEXT UNIQUE,
  github_id TEXT UNIQUE,
  github_token TEXT,
  github_username TEXT,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS repos (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  connected_by TEXT NOT NULL REFERENCES users(id),
  github_repo_id INTEGER,
  full_name TEXT NOT NULL,
  name TEXT NOT NULL,
  default_branch TEXT NOT NULL DEFAULT 'main',
  webhook_id INTEGER,
  webhook_secret TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  last_analyzed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS analyses (
  id TEXT PRIMARY KEY,
  repo_id TEXT NOT NULL REFERENCES repos(id),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  commit_sha TEXT,
  branch TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  services_count INTEGER DEFAULT 0,
  issues_count INTEGER DEFAULT 0,
  xml_key TEXT,
  summary TEXT,
  started_at TEXT,
  completed_at TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS analysis_issues (
  id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL REFERENCES analyses(id),
  repo_id TEXT NOT NULL REFERENCES repos(id),
  type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  description TEXT,
  file_path TEXT,
  line_number INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_google ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_users_github ON users(github_id);
CREATE INDEX IF NOT EXISTS idx_repos_tenant ON repos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_repos_full_name ON repos(full_name);
CREATE INDEX IF NOT EXISTS idx_analyses_repo ON analyses(repo_id);
CREATE INDEX IF NOT EXISTS idx_analyses_tenant ON analyses(tenant_id);
CREATE INDEX IF NOT EXISTS idx_analyses_status ON analyses(status);
CREATE INDEX IF NOT EXISTS idx_issues_analysis ON analysis_issues(analysis_id);
