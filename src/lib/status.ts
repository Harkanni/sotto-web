/** What the web app knows about the API, shown on the status page and (later) the offline banner. */
export type ApiStatus =
  | {
      state: 'ok' | 'degraded';
      version: string;
      commit: string;
      environment: string;
      uptimeSeconds: number;
      checks: Record<string, boolean>;
    }
  | { state: 'unreachable'; reason: 'timeout' | 'network' | 'bad_response' };

interface StatusBody {
  service: string;
  version: string;
  commit: string;
  environment: string;
  uptimeSeconds: number;
  ready: boolean;
  checks: Record<string, boolean>;
}

function isStatusBody(value: unknown): value is StatusBody {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.service === 'sotto-api' &&
    typeof v.version === 'string' &&
    typeof v.ready === 'boolean' &&
    typeof v.checks === 'object' &&
    v.checks !== null
  );
}

/**
 * Fetch /api/v1/status with a hard timeout. Never throws: the page renders whatever comes back,
 * so a down API shows a calm message instead of an error page.
 */
export async function fetchApiStatus(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 2_000,
): Promise<ApiStatus> {
  try {
    const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/api/v1/status`, {
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });
    const body: unknown = await response.json().catch(() => null);
    if (!isStatusBody(body)) return { state: 'unreachable', reason: 'bad_response' };
    return {
      state: body.ready ? 'ok' : 'degraded',
      version: body.version,
      commit: body.commit,
      environment: body.environment,
      uptimeSeconds: body.uptimeSeconds,
      checks: body.checks,
    };
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === 'TimeoutError';
    return { state: 'unreachable', reason: timedOut ? 'timeout' : 'network' };
  }
}

const LABELS: Record<string, string> = {
  database: 'Database',
  redis: 'Cache',
  queue: 'Job queue',
};

export function checkLabel(name: string): string {
  return LABELS[name] ?? name.charAt(0).toUpperCase() + name.slice(1);
}

export function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d`;
}
