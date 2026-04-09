import { useState, useEffect, useCallback } from 'react';
import type { EcosystemService } from '../data/ecosystem';

type HealthStatus = 'healthy' | 'unhealthy' | 'unknown' | 'checking';

// Map service IDs to their actual health check URLs
const HEALTH_ENDPOINTS: Record<string, string> = {
  'gateway': 'https://api.gateway.service.d.bridgeintelligence.ltd/actuator/health',
  'orchestra': 'https://api.orchestra.service.d.bridgeintelligence.ltd/actuator/health',
  'custody': 'https://api.custody.service.d.bridgeintelligence.ltd/actuator/health',
  'bridge-id': 'https://api.id.service.d.bridgeintelligence.ltd/actuator/health',
  'wallet': 'https://wallet.service.d.bridgeintelligence.ltd/',
  'dlt-console': 'https://dlt.service.d.bridgeintelligence.ltd/',
  'website': 'https://bridgeintelligence.ltd/',
};

export function useHealthChecks(services?: EcosystemService[]) {
  const [statuses, setStatuses] = useState<Record<string, HealthStatus>>(() => {
    const initial: Record<string, HealthStatus> = {};
    if (services) {
      services.forEach(s => {
        initial[s.id] = 'unknown';
      });
    }
    return initial;
  });

  // Re-initialize statuses when services load
  useEffect(() => {
    if (services && services.length > 0) {
      setStatuses(prev => {
        const next: Record<string, HealthStatus> = {};
        services.forEach(s => {
          next[s.id] = prev[s.id] || 'unknown';
        });
        return next;
      });
    }
  }, [services]);

  const checkHealth = useCallback(async (serviceId: string, url: string) => {
    setStatuses(prev => ({ ...prev, [serviceId]: 'checking' }));
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(url, {
        method: 'GET',
        mode: 'no-cors',
        signal: controller.signal,
      });
      clearTimeout(timeout);
      setStatuses(prev => ({ ...prev, [serviceId]: response.type === 'opaque' ? 'healthy' : response.ok ? 'healthy' : 'unhealthy' }));
    } catch {
      setStatuses(prev => ({ ...prev, [serviceId]: 'unhealthy' }));
    }
  }, []);

  const runAllChecks = useCallback(() => {
    Object.entries(HEALTH_ENDPOINTS).forEach(([serviceId, url]) => {
      checkHealth(serviceId, url);
    });
  }, [checkHealth]);

  useEffect(() => {
    if (!services || services.length === 0) return;
    runAllChecks();
    const interval = setInterval(runAllChecks, 30000);
    return () => clearInterval(interval);
  }, [runAllChecks, services]);

  return { statuses, runAllChecks };
}
