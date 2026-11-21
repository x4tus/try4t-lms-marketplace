const OAUTH_CHANNEL_NAME = 'try4t_oauth_channel';
const OAUTH_STORAGE_KEY = 'try4t_oauth_result';

export interface OAuthBroadcastPayload {
  id: string;
  status: 'success' | 'error';
  ticket?: string;
  provider?: 'google' | 'github';
  isNew?: boolean;
  message?: string;
}

/**
 * Gui ket qua OAuth tu cua so Pop-up ve cua so chinh thong qua 3 kenh dong thoi
 * (BroadcastChannel + localStorage event + window.opener) de hoat dong 100%
 * ngay ca khi Google/GitHub gui Cross-Origin-Opener-Policy cat window.opener.
 */
export function broadcastOAuthResult(payload: OAuthBroadcastPayload) {
  if (typeof window === 'undefined') return;

  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(OAUTH_CHANNEL_NAME);
      channel.postMessage(payload);
      channel.close();
    }
  } catch {
    // ignore
  }

  try {
    window.localStorage.setItem(OAUTH_STORAGE_KEY, JSON.stringify(payload));
    window.localStorage.removeItem(OAUTH_STORAGE_KEY);
  } catch {
    // ignore
  }

  try {
    if (window.opener && window.opener !== window) {
      window.opener.postMessage({ type: 'TRY4T_OAUTH_RESULT', payload }, window.location.origin);
    }
  } catch {
    // ignore
  }
}

export function subscribeOAuthResult(onResult: (payload: OAuthBroadcastPayload) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handledIds = new Set<string>();
  const dispatchOnce = (payload: OAuthBroadcastPayload | null | undefined) => {
    if (!payload?.id || handledIds.has(payload.id)) return;
    handledIds.add(payload.id);
    onResult(payload);
  };

  let channel: BroadcastChannel | null = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(OAUTH_CHANNEL_NAME);
      channel.onmessage = (event: MessageEvent<OAuthBroadcastPayload>) => {
        dispatchOnce(event.data);
      };
    }
  } catch {
    channel = null;
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== OAUTH_STORAGE_KEY || !event.newValue) return;
    try {
      dispatchOnce(JSON.parse(event.newValue) as OAuthBroadcastPayload);
    } catch {
      // ignore
    }
  };

  const handleWindowMessage = (event: MessageEvent) => {
    if (event.origin !== window.location.origin) return;
    const msg = event.data as { type?: string; payload?: OAuthBroadcastPayload } | undefined;
    if (msg?.type === 'TRY4T_OAUTH_RESULT') {
      dispatchOnce(msg.payload);
    }
  };

  window.addEventListener('storage', handleStorage);
  window.addEventListener('message', handleWindowMessage);

  return () => {
    channel?.close();
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener('message', handleWindowMessage);
  };
}
