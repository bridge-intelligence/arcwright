import { useState, useEffect, useCallback } from 'react';
import { ecosystemData } from '../data/ecosystem';

type HealthStatus = 'healthy' | 'unhealthy' | 'unknown' | 'checking';

// Map service IDs to their actual health check URLs
// In a real deployment, these would point to actual service endpoints
const HEALTH_ENDPOINTS: Record<string, string> = {
  // These are the external URLs that can be pinged from a browser
  // In practice, CORS may block these — so we treat timeout/error as "unknown"
  'gateway': 'https://api.gateway.service.d.bridgeintelligence.ltd/actuator/health',
  'orchestra': 'https://api.orchestra.service.d.bridgeintelligence.ltd/actuator/health',
  'custody': 'https://api.custody.service.d.bridgeintelligence.ltd/actuator/health',
  'bridge-id': 'https://api.id.service.d.bridgeintelligence.ltd/actuator/health',
  'wallet': 'https://wallet.service.d.bridgeintelligence.ltd/',
  'dlt-console': 'https://dlt.service.d.bridgeintelligence.ltd/',
  'website': 'https://bridgeintelligence.ltd/',
};

export function useHealthChecks() {
  const [statuses, setStatuses] = useState<Record<string, HealthStatus>>(() => {
    const initial: Record<string, HealthStatus> = {};
    ecosystemData.services.forEach(s => {
      initial[s.id] = s.healthCheck || HEALTH_ENDPOINTS[s.id] ? 'unknown' : 'unknown';
    });
    return initial;
  });

  const checkHealth = useCallback(async (serviceId: string, url: string) => {
    setStatuses(prev => ({ ...prev, [serviceId]: 'checking' }));
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(url, {
        method: 'GET',
        mode: 'no-cors', // Will get opaque response but proves server is up
        signal: controller.signal,
      });
      clearTimeout(timeout);
      // With no-cors, we get opaque response (type: "opaque", status: 0)
      // But if fetch succeeds without error, the server is reachable
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
    // Run checks on mount
    runAllChecks();
    // Re-check every 30 seconds
    const interval = setInterval(runAllChecks, 30000);
    return () => clearInterval(interval);
  }, [runAllChecks]);

  return { statuses, runAllChecks };
}
