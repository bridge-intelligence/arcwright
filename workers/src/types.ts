export interface Env {
  DB: D1Database;
  STORAGE: R2Bucket;
  AI: Ai;
  ENVIRONMENT: string;
  APP_URL: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  JWT_SECRET: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
  tenant_id: string;
  role: string;
  exp: number;
  iat: number;
}

export interface GoogleTokenResponse {
  access_token: string;
  id_token: string;
  token_type: string;
  expires_in: number;
}

export interface GoogleUserInfo {
  id: string;
  email: string;
  name: string;
  picture: string;
}

export interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

export interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string;
  email: string | null;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  default_branch: string;
  private: boolean;
  language: string | null;
  description: string | null;
  updated_at: string;
}
