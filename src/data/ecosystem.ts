// ============================================================================
// BRIDGE ECOSYSTEM TYPE DEFINITIONS & CONSTANTS
// Data is served from the authenticated API — only types and visual constants here
// ============================================================================

export type ServiceStatus = 'active' | 'inactive' | 'partial' | 'placeholder' | 'scaffold';
export type ServiceCategory =
  | 'gateway' | 'orchestration' | 'financial' | 'identity'
  | 'blockchain' | 'frontend' | 'infrastructure' | 'connector'
  | 'library' | 'analytics' | 'dlt';
export type ServiceTier = 'frontend' | 'gateway' | 'orchestration' | 'business' | 'blockchain' | 'connector' | 'infrastructure' | 'library';
export type CommDirection = 'one-way' | 'two-way' | 'event' | 'trigger';
export type CommProtocol = 'http' | 'kafka' | 'redis' | 'grpc' | 'websocket' | 'corda' | 'rpc' | 'jdbc' | 'library';

export interface ServiceEndpoint { method: string; path: string; description: string; }
export interface KafkaTopic { name: string; direction: 'produce' | 'consume'; description: string; }
export interface DatabaseConnection { type: string; database: string; purpose: string; }
export interface ServiceComponent { name: string; type: string; description: string; }

export interface EcosystemService {
  id: string; name: string; shortName: string;
  category: ServiceCategory; tier: ServiceTier; status: ServiceStatus;
  description: string; role: string; techStack: string[];
  port: number | null; k8sPort: number | null;
  internalUrl: string | null; externalUrl: string | null;
  imageTag: string | null; repo: string;
  components: ServiceComponent[]; endpoints: ServiceEndpoint[];
  kafkaTopics: KafkaTopic[]; databases: DatabaseConnection[];
  healthCheck: { url: string; method: string; expectedStatus: number } | null;
  controllers: string[]; domainEntities: string[]; keyFeatures: string[];
}

export interface ServiceConnection {
  id: string; source: string; target: string;
  protocol: CommProtocol; direction: CommDirection;
  label: string; description: string; dataFlow: string; animated: boolean;
}

export interface EcosystemData { services: EcosystemService[]; connections: ServiceConnection[]; }

// Visual constants (used by components)
export const categoryColors: Record<ServiceCategory, string> = {
  gateway: '#3b82f6', orchestration: '#a855f7', financial: '#22c55e',
  identity: '#eab308', blockchain: '#f97316', frontend: '#06b6d4',
  infrastructure: '#6b7280', connector: '#ec4899', library: '#8b5cf6',
  analytics: '#14b8a6', dlt: '#ef4444',
};
export const statusColors: Record<ServiceStatus, string> = {
  active: '#22c55e', inactive: '#ef4444', partial: '#eab308',
  placeholder: '#4b5563', scaffold: '#6b7280',
};
export const protocolColors: Record<CommProtocol, string> = {
  http: '#3b82f6', kafka: '#22c55e', redis: '#ef4444', grpc: '#a855f7',
  websocket: '#06b6d4', corda: '#f97316', rpc: '#eab308', jdbc: '#6b7280', library: '#8b5cf6',
};
export const tierOrder: ServiceTier[] = ['frontend', 'gateway', 'orchestration', 'business', 'blockchain', 'connector', 'infrastructure', 'library'];
export const tierLabels: Record<ServiceTier, string> = {
  frontend: 'Frontend Apps', gateway: 'API Gateway', orchestration: 'Orchestration & Identity',
  business: 'Business Services', blockchain: 'Blockchain & DLT', connector: 'Connectors',
  infrastructure: 'Infrastructure', library: 'Libraries & Analytics',
};
