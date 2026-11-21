import type { ApiErrorResponse, ApiResponse, AuthResponse } from '@try4t/shared';

const CONFIGURED_API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') || 'http://localhost:4000/api/v1';

export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const currentHost = window.location.hostname;
    const isLocalLoopback = currentHost === 'localhost' || currentHost === '127.0.0.1';
    if (!isLocalLoopback && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(CONFIGURED_API_URL)) {
      return CONFIGURED_API_URL.replace(
        /^(https?:\/\/)(localhost|127\.0\.0\.1)/,
        `$1${currentHost}`,
      );
    }
  }
  return CONFIGURED_API_URL;
}

let accessTokenMemory: string | null = null;
let refreshInFlight: Promise<AuthResponse | null> | null = null;
let onAuthUpdated: ((auth: AuthResponse | null) => void) | null = null;

export function setAccessToken(token: string | null) {
  accessTokenMemory = token;
}

export function getAccessToken(): string | null {
  return accessTokenMemory;
}

export function registerAuthSyncHandler(handler: (auth: AuthResponse | null) => void) {
  onAuthUpdated = handler;
}

export class ApiClientError extends Error {
  statusCode: number;
  code?: string;
  errors?: Record<string, string[]>;
  meta?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: number,
    options?: {
      code?: string;
      errors?: Record<string, string[]>;
      meta?: Record<string, unknown>;
    },
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.statusCode = statusCode;
    this.code = options?.code;
    this.errors = options?.errors;
    this.meta = options?.meta;
  }
}

async function performRefresh(): Promise<AuthResponse | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!res.ok) {
          accessTokenMemory = null;
          onAuthUpdated?.(null);
          return null;
        }
        const json = (await res.json()) as ApiResponse<AuthResponse>;
        accessTokenMemory = json.data.accessToken;
        onAuthUpdated?.(json.data);
        return json.data;
      } catch {
        accessTokenMemory = null;
        onAuthUpdated?.(null);
        return null;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  skipAuthRefresh?: boolean;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers, skipAuthRefresh = false, ...rest } = options;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = `${getApiBaseUrl()}${normalizedPath}`;

  const reqHeaders = new Headers(headers);
  if (body !== undefined && !(body instanceof FormData) && !reqHeaders.has('Content-Type')) {
    reqHeaders.set('Content-Type', 'application/json');
  }
  if (accessTokenMemory) {
    reqHeaders.set('Authorization', `Bearer ${accessTokenMemory}`);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...rest,
      headers: reqHeaders,
      credentials: 'include',
      body:
        body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiClientError(
      'Không thể kết nối tới máy chủ Try4T. Kiểm tra lại kết nối mạng hoặc thử lại sau vài giây nhé.',
      0,
      { code: 'NETWORK_ERROR' },
    );
  }

  if (response.status === 401 && !skipAuthRefresh && !normalizedPath.startsWith('/auth/')) {
    const refreshed = await performRefresh();
    if (refreshed?.accessToken) {
      reqHeaders.set('Authorization', `Bearer ${refreshed.accessToken}`);
      const retryResponse = await fetch(url, {
        ...rest,
        headers: reqHeaders,
        credentials: 'include',
        body:
          body === undefined
            ? undefined
            : body instanceof FormData
              ? body
              : JSON.stringify(body),
      });
      return parseResponse<T>(retryResponse);
    }
  }

  return parseResponse<T>(response);
}

async function parseResponse<T>(response: Response): Promise<T> {
  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await response.json() : null;

  if (!response.ok) {
    const errPayload = payload as ApiErrorResponse | null;
    throw new ApiClientError(
      errPayload?.message || `Yêu cầu thất bại (${response.status})`,
      response.status,
      {
        code: errPayload?.code,
        errors: errPayload?.errors,
        meta: errPayload?.meta,
      },
    );
  }

  const apiResp = payload as ApiResponse<T>;
  return apiResp.data;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'DELETE' }),
  refreshSession: performRefresh,
};
