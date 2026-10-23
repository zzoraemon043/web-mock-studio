import type { Rng } from '../random.ts';
import type { FailureOutcome, LatencyProfile, NetworkSimulation } from '../types.ts';

export const LATENCY_PROFILES: Record<LatencyProfile, { label: string; baseMs: number }> = {
  none: { label: 'No delay', baseMs: 0 },
  'fast-4g': { label: 'Fast 4G', baseMs: 80 },
  '4g': { label: '4G', baseMs: 180 },
  '3g': { label: '3G', baseMs: 650 },
  'slow-3g': { label: 'Slow 3G', baseMs: 2000 },
  custom: { label: 'Custom', baseMs: 0 },
};

export const FAILURE_OUTCOMES: { value: FailureOutcome; label: string }[] = [
  { value: 400, label: '400 Bad Request' },
  { value: 401, label: '401 Unauthorized' },
  { value: 403, label: '403 Forbidden' },
  { value: 404, label: '404 Not Found' },
  { value: 429, label: '429 Too Many Requests' },
  { value: 500, label: '500 Internal Server Error' },
  { value: 502, label: '502 Bad Gateway' },
  { value: 503, label: '503 Service Unavailable' },
  { value: 'network-error', label: 'Network failure' },
];

export const MAX_DELAY_MS = 60_000;

export function computeDelay(network: NetworkSimulation, rng: Rng): number {
  const base = network.latency === 'custom' ? network.customDelayMs : LATENCY_PROFILES[network.latency].baseMs;
  if (network.latency === 'none') return 0;
  const jitter = Math.max(0, network.jitterMs);
  const delay = base + (jitter > 0 ? rng.int(-jitter, jitter) : 0);
  return Math.min(MAX_DELAY_MS, Math.max(0, Math.round(delay)));
}

export function pickFailure(network: NetworkSimulation, rng: Rng): FailureOutcome | null {
  const rate = Math.min(100, Math.max(0, network.failureRate));
  if (rate === 0 || network.failureOutcomes.length === 0) return null;
  if (rng.next() * 100 >= rate) return null;
  return rng.pick(network.failureOutcomes);
}

const STATUS_TEXT: Record<number, string> = {
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  204: 'No Content',
  301: 'Moved Permanently',
  302: 'Found',
  304: 'Not Modified',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  409: 'Conflict',
  422: 'Unprocessable Entity',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
};

export function statusText(status: number): string {
  return STATUS_TEXT[status] ?? '';
}

export const COMMON_STATUSES = Object.keys(STATUS_TEXT).map(Number);

/** Reads a typed status code; anything outside 200..599 is not a status yet. */
export function parseStatus(text: string): number | null {
  if (!/^\d{3}$/.test(text.trim())) return null;
  const status = Number(text);
  return status >= 200 && status <= 599 ? status : null;
}

/** Statuses whose responses must not carry a body; the Response constructor throws otherwise. */
export function isNullBodyStatus(status: number): boolean {
  return status === 101 || status === 103 || status === 204 || status === 205 || status === 304;
}
