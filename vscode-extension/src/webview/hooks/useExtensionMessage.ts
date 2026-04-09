import { useEffect, useCallback } from 'react';

// VS Code webview API
declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

let vscodeApi: ReturnType<typeof acquireVsCodeApi> | null = null;

function getVsCodeApi() {
  if (!vscodeApi) {
    try {
      vscodeApi = acquireVsCodeApi();
    } catch {
      // Running outside VS Code (e.g., in dev browser)
      vscodeApi = {
        postMessage: (msg: unknown) => console.log('[arcwright mock postMessage]', msg),
        getState: () => null,
        setState: () => {},
      };
    }
  }
  return vscodeApi;
}

export function useExtensionMessage(
  onMessage: (message: { type: string; data: unknown }) => void
) {
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const message = event.data;
      if (message && typeof message.type === 'string') {
        onMessage(message);
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onMessage]);

  const postMessage = useCallback((message: { type: string; [key: string]: unknown }) => {
    getVsCodeApi().postMessage(message);
  }, []);

  return { postMessage };
}
