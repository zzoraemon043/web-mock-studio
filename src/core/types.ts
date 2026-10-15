import type { JsonSchema } from './schema/types.ts';

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];
export type RuleMethod = HttpMethod | 'ANY';

export interface KeyValue {
  key: string;
  value: string;
  enabled: boolean;
}

export type QueryMatchMode = 'equals' | 'present' | 'absent' | 'regex';

export interface QueryMatcher {
  key: string;
  value: string;
  mode: QueryMatchMode;
}

export type LatencyProfile = 'none' | 'fast-4g' | '4g' | '3g' | 'slow-3g' | 'custom';

export type FailureOutcome = 400 | 401 | 403 | 404 | 429 | 500 | 502 | 503 | 'network-error';

export interface NetworkSimulation {
  latency: LatencyProfile;
  customDelayMs: number;
  jitterMs: number;
  failureRate: number;
  failureOutcomes: FailureOutcome[];
}

export type BodyMode = 'inline' | 'dataset';

export type DatasetEnvelope = 'array' | 'paginated' | 'item';

export interface DatasetBinding {
  templateId: string;
  count: number;
  envelope: DatasetEnvelope;
}

export interface MockResponse {
  status: number;
  headers: KeyValue[];
  bodyMode: BodyMode;
  body: string;
  dataset: DatasetBinding;
}

export interface MockRule {
  id: string;
  name: string;
  enabled: boolean;
  method: RuleMethod;
  pattern: string;
  query: QueryMatcher[];
  response: MockResponse;
  network: NetworkSimulation;
  createdAt: number;
  updatedAt: number;
}

export interface DataTemplate {
  id: string;
  name: string;
  sample: string;
  schema: JsonSchema;
  createdAt: number;
  updatedAt: number;
}

export interface SavedRequest {
  id: string;
  name: string;
  method: HttpMethod;
  url: string;
  headers: KeyValue[];
  body: string;
  createdAt: number;
}

export type ThemeMode = 'light' | 'dark' | 'system';

export interface WorkspaceSettings {
  theme: ThemeMode;
  interceptionEnabled: boolean;
  passthroughUnmatched: boolean;
  logLimit: number;
}

export interface WorkspaceData {
  rules: MockRule[];
  templates: DataTemplate[];
  requests: SavedRequest[];
  settings: WorkspaceSettings;
}

export interface InterceptedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
}

export type MockDecision =
  | { kind: 'passthrough'; reason: 'no-match' | 'disabled' }
  | {
      kind: 'respond';
      ruleId: string;
      status: number;
      headers: Record<string, string>;
      body: string | null;
      delayMs: number;
      injected: boolean;
    }
  | { kind: 'network-error'; ruleId: string; delayMs: number };
