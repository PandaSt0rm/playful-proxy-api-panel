import { useCallback, useMemo, useReducer } from 'react';
import { isMap, parse as parseYaml, parseDocument } from 'yaml';
import type {
  PayloadFilterRule,
  PayloadParamEntry,
  PayloadParamValueType,
  PayloadRule,
  VisualConfigValues,
  VisualConfigValidationErrors,
  PayloadParamValidationErrorCode,
  UpstreamConcurrencyProviderLimitEntry,
} from '@/types/visualConfig';
import { DEFAULT_VISUAL_VALUES, makeClientId } from '@/types/visualConfig';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function extractApiKeyValue(raw: unknown): string | null {
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    return trimmed ? trimmed : null;
  }

  const record = asRecord(raw);
  if (!record) return null;

  const candidates = [record['api-key'], record.apiKey, record.key, record.Key];
  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (trimmed) return trimmed;
    }
  }

  return null;
}

function parseApiKeysText(raw: unknown): string {
  if (!Array.isArray(raw)) return '';

  const keys: string[] = [];
  for (const item of raw) {
    const key = extractApiKeyValue(item);
    if (key) keys.push(key);
  }
  return keys.join('\n');
}

function resolveApiKeysText(parsed: Record<string, unknown>): string {
  if (Object.prototype.hasOwnProperty.call(parsed, 'api-keys')) {
    return parseApiKeysText(parsed['api-keys']);
  }

  const auth = asRecord(parsed.auth);
  const providers = asRecord(auth?.providers);
  const configApiKeyProvider = asRecord(providers?.['config-api-key']);
  if (!configApiKeyProvider) return '';

  if (Object.prototype.hasOwnProperty.call(configApiKeyProvider, 'api-key-entries')) {
    return parseApiKeysText(configApiKeyProvider['api-key-entries']);
  }

  return parseApiKeysText(configApiKeyProvider['api-keys']);
}

type YamlDocument = ReturnType<typeof parseDocument>;
type YamlPath = string[];

function docHas(doc: YamlDocument, path: YamlPath): boolean {
  return doc.hasIn(path);
}

function ensureMapInDoc(doc: YamlDocument, path: YamlPath): void {
  const existing = doc.getIn(path, true);
  if (isMap(existing)) return;
  // Use a YAML node here; plain objects are not treated as collections by subsequent `setIn`.
  doc.setIn(path, doc.createNode({}));
}

function deleteIfMapEmpty(doc: YamlDocument, path: YamlPath): void {
  const value = doc.getIn(path, true);
  if (!isMap(value)) return;
  if (value.items.length === 0) doc.deleteIn(path);
}

function setBooleanInDoc(doc: YamlDocument, path: YamlPath, value: boolean): void {
  if (value) {
    doc.setIn(path, true);
    return;
  }
  if (docHas(doc, path)) doc.setIn(path, false);
}

function shouldWriteManagedField(
  doc: YamlDocument,
  path: YamlPath,
  dirtyFields: Set<string>,
  dirtyKey: string
): boolean {
  // Optional fields managed by the visual editor must not be created during unrelated saves.
  // Only materialize them when the YAML already had the key or the user changed that field.
  // Use this guard for future optional visual-editor fields instead of unconditional `setIn`.
  return docHas(doc, path) || dirtyFields.has(dirtyKey);
}

function setStringInDoc(doc: YamlDocument, path: YamlPath, value: unknown): void {
  const safe = typeof value === 'string' ? value : '';
  const trimmed = safe.trim();
  if (trimmed !== '') {
    doc.setIn(path, safe);
    return;
  }
  // Preserve existing empty-string keys to avoid dropping template blocks/comments.
  // Only keep the key when it already exists in the YAML.
  if (docHas(doc, path)) {
    doc.setIn(path, '');
  }
}

function setIntFromStringInDoc(doc: YamlDocument, path: YamlPath, value: unknown): void {
  const safe = typeof value === 'string' ? value : '';
  const trimmed = safe.trim();
  if (trimmed === '') {
    if (docHas(doc, path)) doc.deleteIn(path);
    return;
  }

  if (!/^-?\d+$/.test(trimmed)) {
    return;
  }

  const parsed = Number(trimmed);
  if (Number.isFinite(parsed)) {
    doc.setIn(path, parsed);
    return;
  }
}

function setOptionalIntFromStringInDoc(
  doc: YamlDocument,
  path: YamlPath,
  value: unknown,
  dirtyFields: Set<string>,
  dirtyKey: string
): void {
  if (!shouldWriteManagedField(doc, path, dirtyFields, dirtyKey)) return;
  setIntFromStringInDoc(doc, path, value);
}

function getNonNegativeIntegerError(value: string): 'non_negative_integer' | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!/^-?\d+$/.test(trimmed)) return 'non_negative_integer';
  return Number(trimmed) >= 0 ? undefined : 'non_negative_integer';
}

function getProviderLimitEntriesError(
  entries: UpstreamConcurrencyProviderLimitEntry[]
):
  | 'provider_limit_provider_required'
  | 'provider_limit_duplicate'
  | 'provider_limit_invalid'
  | undefined {
  const seen = new Set<string>();
  for (const entry of entries) {
    const provider = entry.provider.trim().toLowerCase();
    const limit = entry.limit.trim();
    if (!provider && !limit) continue;
    if (!provider) return 'provider_limit_provider_required';
    if (seen.has(provider)) return 'provider_limit_duplicate';
    seen.add(provider);
    if (!limit) return 'provider_limit_invalid';
    if (getNonNegativeIntegerError(limit)) return 'provider_limit_invalid';
  }
  return undefined;
}

function parseDisableImageGenerationMode(
  raw: unknown
): VisualConfigValues['disableImageGeneration'] {
  if (raw === true) return 'true';
  if (raw === false || raw === undefined || raw === null) return 'false';
  const normalized = String(raw).trim().toLowerCase();
  if (normalized === 'true') return 'true';
  if (normalized === 'chat') return 'chat';
  return 'false';
}

function providerLimitsToEntries(raw: unknown): UpstreamConcurrencyProviderLimitEntry[] {
  const record = asRecord(raw);
  if (!record) return [];
  return Object.entries(record)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([provider, value]) => ({
      id: makeClientId(),
      provider,
      limit: String(value ?? ''),
    }));
}

function providerLimitEntriesToRecord(
  entries: UpstreamConcurrencyProviderLimitEntry[]
): Record<string, number> {
  const result: Record<string, number> = {};
  entries.forEach((entry) => {
    const key = entry.provider.trim().toLowerCase();
    const value = entry.limit.trim();
    if (!key || !/^-?\d+$/.test(value)) return;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      result[key] = parsed;
    }
  });
  return result;
}

function providerLimitEntriesComparable(entries: UpstreamConcurrencyProviderLimitEntry[]) {
  return entries
    .map((entry) => ({
      provider: entry.provider.trim().toLowerCase(),
      limit: entry.limit.trim(),
    }))
    .filter((entry) => entry.provider || entry.limit)
    .sort((left, right) => left.provider.localeCompare(right.provider));
}

function areProviderLimitEntriesEqual(
  left: UpstreamConcurrencyProviderLimitEntry[],
  right: UpstreamConcurrencyProviderLimitEntry[]
): boolean {
  return (
    JSON.stringify(providerLimitEntriesComparable(left)) ===
    JSON.stringify(providerLimitEntriesComparable(right))
  );
}

function parseHeaderDefaults(raw: unknown): VisualConfigValues['claudeHeaderDefaults'] {
  const record = asRecord(raw);
  return {
    userAgent: typeof record?.['user-agent'] === 'string' ? record['user-agent'] : '',
    packageVersion:
      typeof record?.['package-version'] === 'string' ? record['package-version'] : '',
    runtimeVersion:
      typeof record?.['runtime-version'] === 'string' ? record['runtime-version'] : '',
    os: typeof record?.os === 'string' ? record.os : '',
    arch: typeof record?.arch === 'string' ? record.arch : '',
    timeout: typeof record?.timeout === 'string' ? record.timeout : '',
    stabilizeDeviceProfile: Boolean(record?.['stabilize-device-profile']),
    betaFeaturesText: typeof record?.['beta-features'] === 'string' ? record['beta-features'] : '',
  };
}

function shouldWriteHeaderDefaults(
  doc: YamlDocument,
  section: string,
  values: VisualConfigValues['claudeHeaderDefaults'],
  dirtyFields: Set<string>,
  dirtyPrefix: string,
  fields: Array<keyof VisualConfigValues['claudeHeaderDefaults']>
): boolean {
  return (
    docHas(doc, [section]) ||
    fields.some((field) => {
      const value = values[field];
      if (typeof value === 'boolean') return value || dirtyFields.has(`${dirtyPrefix}.${field}`);
      return String(value ?? '').trim() || dirtyFields.has(`${dirtyPrefix}.${field}`);
    })
  );
}

function getPortError(value: string): 'port_range' | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!/^\d+$/.test(trimmed)) return 'port_range';
  const parsed = Number(trimmed);
  return parsed >= 1 && parsed <= 65535 ? undefined : 'port_range';
}

export function getVisualConfigValidationErrors(
  values: VisualConfigValues
): VisualConfigValidationErrors {
  return {
    port: getPortError(values.port),
    'home.port': getPortError(values.homePort),
    logsMaxTotalSizeMb: getNonNegativeIntegerError(values.logsMaxTotalSizeMb),
    errorLogsMaxFiles: getNonNegativeIntegerError(values.errorLogsMaxFiles),
    usageStatisticsFlushIntervalSeconds: getNonNegativeIntegerError(
      values.usageStatisticsFlushIntervalSeconds
    ),
    redisUsageQueueRetentionSeconds: getNonNegativeIntegerError(
      values.redisUsageQueueRetentionSeconds
    ),
    authAutoRefreshWorkers: getNonNegativeIntegerError(values.authAutoRefreshWorkers),
    requestRetry: getNonNegativeIntegerError(values.requestRetry),
    maxRetryCredentials: getNonNegativeIntegerError(values.maxRetryCredentials),
    maxRetryInterval: getNonNegativeIntegerError(values.maxRetryInterval),
    'upstreamConcurrency.default': getNonNegativeIntegerError(
      values.upstreamConcurrency.defaultLimit
    ),
    'upstreamConcurrency.providers': getProviderLimitEntriesError(
      values.upstreamConcurrency.providerLimits
    ),
    'upstreamConcurrency.queueTimeoutSeconds': getNonNegativeIntegerError(
      values.upstreamConcurrency.queueTimeoutSeconds
    ),
    'streaming.keepaliveSeconds': getNonNegativeIntegerError(values.streaming.keepaliveSeconds),
    'streaming.bootstrapRetries': getNonNegativeIntegerError(values.streaming.bootstrapRetries),
    'streaming.nonstreamKeepaliveInterval': getNonNegativeIntegerError(
      values.streaming.nonstreamKeepaliveInterval
    ),
  };
}

export function getPayloadParamValidationError(
  param: PayloadParamEntry
): PayloadParamValidationErrorCode | undefined {
  const trimmedValue = param.value.trim();

  switch (param.valueType) {
    case 'number': {
      if (!trimmedValue) return 'payload_invalid_number';
      const parsed = Number(trimmedValue);
      return Number.isFinite(parsed) ? undefined : 'payload_invalid_number';
    }
    case 'boolean': {
      const normalized = trimmedValue.toLowerCase();
      return normalized === 'true' || normalized === 'false'
        ? undefined
        : 'payload_invalid_boolean';
    }
    case 'json': {
      if (!trimmedValue) return 'payload_invalid_json';
      try {
        JSON.parse(param.value);
        return undefined;
      } catch {
        return 'payload_invalid_json';
      }
    }
    default:
      return undefined;
  }
}

function hasPayloadParamValidationErrors(rules: PayloadRule[]): boolean {
  return rules.some((rule) =>
    rule.params.some((param) => Boolean(getPayloadParamValidationError(param)))
  );
}

function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

function arePayloadModelEntriesEqual(
  left: PayloadRule['models'],
  right: PayloadRule['models']
): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    const a = left[i];
    const b = right[i];
    if (!a || !b) return false;
    if (a.id !== b.id || a.name !== b.name || a.protocol !== b.protocol) return false;
  }
  return true;
}

function arePayloadParamEntriesEqual(
  left: PayloadRule['params'],
  right: PayloadRule['params']
): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    const a = left[i];
    const b = right[i];
    if (!a || !b) return false;
    if (a.id !== b.id || a.path !== b.path || a.valueType !== b.valueType || a.value !== b.value) {
      return false;
    }
  }
  return true;
}

function arePayloadRulesEqual(left: PayloadRule[], right: PayloadRule[]): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    const a = left[i];
    const b = right[i];
    if (!a || !b) return false;
    if (a.id !== b.id) return false;
    if (!arePayloadModelEntriesEqual(a.models, b.models)) return false;
    if (!arePayloadParamEntriesEqual(a.params, b.params)) return false;
  }
  return true;
}

function arePayloadFilterRulesEqual(
  left: PayloadFilterRule[],
  right: PayloadFilterRule[]
): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    const a = left[i];
    const b = right[i];
    if (!a || !b) return false;
    if (a.id !== b.id) return false;
    if (!arePayloadModelEntriesEqual(a.models, b.models)) return false;
    if (a.params.length !== b.params.length) return false;
    for (let j = 0; j < a.params.length; j += 1) {
      if (a.params[j] !== b.params[j]) return false;
    }
  }
  return true;
}

function parsePayloadParamValue(raw: unknown): { valueType: PayloadParamValueType; value: string } {
  if (typeof raw === 'number') {
    return { valueType: 'number', value: String(raw) };
  }

  if (typeof raw === 'boolean') {
    return { valueType: 'boolean', value: String(raw) };
  }

  if (raw === null || typeof raw === 'object') {
    try {
      const json = JSON.stringify(raw, null, 2);
      return { valueType: 'json', value: json ?? 'null' };
    } catch {
      return { valueType: 'json', value: String(raw) };
    }
  }

  return { valueType: 'string', value: String(raw ?? '') };
}

function parseRawPayloadParamValue(raw: unknown): string {
  if (typeof raw === 'string') return raw;

  try {
    const json = JSON.stringify(raw, null, 2);
    return json ?? '';
  } catch {
    return String(raw ?? '');
  }
}

function parsePayloadProtocol(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  return raw.trim() ? raw : undefined;
}

function deleteLegacyApiKeysProvider(doc: YamlDocument): void {
  if (docHas(doc, ['auth', 'providers', 'config-api-key', 'api-key-entries'])) {
    doc.deleteIn(['auth', 'providers', 'config-api-key', 'api-key-entries']);
  }
  if (docHas(doc, ['auth', 'providers', 'config-api-key', 'api-keys'])) {
    doc.deleteIn(['auth', 'providers', 'config-api-key', 'api-keys']);
  }
  deleteIfMapEmpty(doc, ['auth', 'providers', 'config-api-key']);
  deleteIfMapEmpty(doc, ['auth', 'providers']);
  deleteIfMapEmpty(doc, ['auth']);
}

function parsePayloadRules(rules: unknown): PayloadRule[] {
  if (!Array.isArray(rules)) return [];

  return rules.map((rule, index) => {
    const record = asRecord(rule) ?? {};

    const modelsRaw = record.models;
    const models = Array.isArray(modelsRaw)
      ? modelsRaw.map((model, modelIndex) => {
          const modelRecord = asRecord(model);
          const nameRaw =
            typeof model === 'string' ? model : (modelRecord?.name ?? modelRecord?.id ?? '');
          const name = typeof nameRaw === 'string' ? nameRaw : String(nameRaw ?? '');
          return {
            id: `model-${index}-${modelIndex}`,
            name,
            protocol: parsePayloadProtocol(modelRecord?.protocol),
          };
        })
      : [];

    const paramsRecord = asRecord(record.params);
    const params = paramsRecord
      ? Object.entries(paramsRecord).map(([path, value], pIndex) => {
          const parsedValue = parsePayloadParamValue(value);
          return {
            id: `param-${index}-${pIndex}`,
            path,
            valueType: parsedValue.valueType,
            value: parsedValue.value,
          };
        })
      : [];

    return { id: `payload-rule-${index}`, models, params };
  });
}

function parsePayloadFilterRules(rules: unknown): PayloadFilterRule[] {
  if (!Array.isArray(rules)) return [];

  return rules.map((rule, index) => {
    const record = asRecord(rule) ?? {};

    const modelsRaw = record.models;
    const models = Array.isArray(modelsRaw)
      ? modelsRaw.map((model, modelIndex) => {
          const modelRecord = asRecord(model);
          const nameRaw =
            typeof model === 'string' ? model : (modelRecord?.name ?? modelRecord?.id ?? '');
          const name = typeof nameRaw === 'string' ? nameRaw : String(nameRaw ?? '');
          return {
            id: `filter-model-${index}-${modelIndex}`,
            name,
            protocol: parsePayloadProtocol(modelRecord?.protocol),
          };
        })
      : [];

    const paramsRaw = record.params;
    const params = Array.isArray(paramsRaw) ? paramsRaw.map(String) : [];

    return { id: `payload-filter-rule-${index}`, models, params };
  });
}

function parseRawPayloadRules(rules: unknown): PayloadRule[] {
  if (!Array.isArray(rules)) return [];

  return rules.map((rule, index) => {
    const record = asRecord(rule) ?? {};

    const modelsRaw = record.models;
    const models = Array.isArray(modelsRaw)
      ? modelsRaw.map((model, modelIndex) => {
          const modelRecord = asRecord(model);
          const nameRaw =
            typeof model === 'string' ? model : (modelRecord?.name ?? modelRecord?.id ?? '');
          const name = typeof nameRaw === 'string' ? nameRaw : String(nameRaw ?? '');
          return {
            id: `raw-model-${index}-${modelIndex}`,
            name,
            protocol: parsePayloadProtocol(modelRecord?.protocol),
          };
        })
      : [];

    const paramsRecord = asRecord(record.params);
    const params = paramsRecord
      ? Object.entries(paramsRecord).map(([path, value], pIndex) => ({
          id: `raw-param-${index}-${pIndex}`,
          path,
          valueType: 'json' as const,
          value: parseRawPayloadParamValue(value),
        }))
      : [];

    return { id: `payload-raw-rule-${index}`, models, params };
  });
}

function serializePayloadRulesForYaml(rules: PayloadRule[]): Array<Record<string, unknown>> {
  return rules
    .map((rule) => {
      const models = (rule.models || [])
        .filter((m) => m.name?.trim())
        .map((m) => {
          const obj: Record<string, unknown> = { name: m.name.trim() };
          if (m.protocol) obj.protocol = m.protocol;
          return obj;
        });

      const params: Record<string, unknown> = {};
      for (const param of rule.params || []) {
        if (!param.path?.trim()) continue;
        let value: unknown = param.value;
        if (param.valueType === 'number') {
          const num = Number(param.value);
          value = Number.isFinite(num) ? num : param.value;
        } else if (param.valueType === 'boolean') {
          value = param.value === 'true';
        } else if (param.valueType === 'json') {
          try {
            value = JSON.parse(param.value);
          } catch {
            value = param.value;
          }
        }
        params[param.path.trim()] = value;
      }

      return { models, params };
    })
    .filter((rule) => rule.models.length > 0);
}

function serializePayloadFilterRulesForYaml(
  rules: PayloadFilterRule[]
): Array<Record<string, unknown>> {
  return rules
    .map((rule) => {
      const models = (rule.models || [])
        .filter((m) => m.name?.trim())
        .map((m) => {
          const obj: Record<string, unknown> = { name: m.name.trim() };
          if (m.protocol) obj.protocol = m.protocol;
          return obj;
        });

      const params = (Array.isArray(rule.params) ? rule.params : [])
        .map((path) => String(path).trim())
        .filter(Boolean);

      return { models, params };
    })
    .filter((rule) => rule.models.length > 0);
}

function serializeRawPayloadRulesForYaml(rules: PayloadRule[]): Array<Record<string, unknown>> {
  return rules
    .map((rule) => {
      const models = (rule.models || [])
        .filter((m) => m.name?.trim())
        .map((m) => {
          const obj: Record<string, unknown> = { name: m.name.trim() };
          if (m.protocol) obj.protocol = m.protocol;
          return obj;
        });

      const params: Record<string, unknown> = {};
      for (const param of rule.params || []) {
        if (!param.path?.trim()) continue;
        params[param.path.trim()] = param.value;
      }

      return { models, params };
    })
    .filter((rule) => rule.models.length > 0);
}

type VisualConfigState = {
  visualValues: VisualConfigValues;
  baselineValues: VisualConfigValues;
  dirtyFields: Set<string>;
  visualParseError: string | null;
};

type VisualConfigAction =
  | {
      type: 'load_success';
      values: VisualConfigValues;
    }
  | {
      type: 'load_error';
      error: string;
    }
  | {
      type: 'set_values';
      values: Partial<VisualConfigValues>;
    };

function createInitialVisualConfigState(): VisualConfigState {
  const initialValues = deepClone(DEFAULT_VISUAL_VALUES);
  return {
    visualValues: initialValues,
    baselineValues: deepClone(initialValues),
    dirtyFields: new Set(),
    visualParseError: null,
  };
}

function mergeVisualConfigValues(
  currentValues: VisualConfigValues,
  patch: Partial<VisualConfigValues>
): VisualConfigValues {
  const nextValues: VisualConfigValues = { ...currentValues, ...patch } as VisualConfigValues;
  if (patch.streaming) {
    nextValues.streaming = { ...currentValues.streaming, ...patch.streaming };
  }
  if (patch.upstreamConcurrency) {
    nextValues.upstreamConcurrency = {
      ...currentValues.upstreamConcurrency,
      ...patch.upstreamConcurrency,
    };
  }
  if (patch.claudeHeaderDefaults) {
    nextValues.claudeHeaderDefaults = {
      ...currentValues.claudeHeaderDefaults,
      ...patch.claudeHeaderDefaults,
    };
  }
  if (patch.codexHeaderDefaults) {
    nextValues.codexHeaderDefaults = {
      ...currentValues.codexHeaderDefaults,
      ...patch.codexHeaderDefaults,
    };
  }
  return nextValues;
}

function getNextDirtyFields(
  currentDirtyFields: Set<string>,
  patch: Partial<VisualConfigValues>,
  nextValues: VisualConfigValues,
  baselineValues: VisualConfigValues
): Set<string> {
  const nextDirtyFields = new Set(currentDirtyFields);
  const updateDirty = (key: string, isEqual: boolean) => {
    if (isEqual) {
      nextDirtyFields.delete(key);
    } else {
      nextDirtyFields.add(key);
    }
  };

  if (Object.prototype.hasOwnProperty.call(patch, 'host')) {
    updateDirty('host', nextValues.host === baselineValues.host);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'port')) {
    updateDirty('port', nextValues.port === baselineValues.port);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'tlsEnable')) {
    updateDirty('tlsEnable', nextValues.tlsEnable === baselineValues.tlsEnable);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'tlsCert')) {
    updateDirty('tlsCert', nextValues.tlsCert === baselineValues.tlsCert);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'tlsKey')) {
    updateDirty('tlsKey', nextValues.tlsKey === baselineValues.tlsKey);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'homeEnabled')) {
    updateDirty('homeEnabled', nextValues.homeEnabled === baselineValues.homeEnabled);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'homeHost')) {
    updateDirty('homeHost', nextValues.homeHost === baselineValues.homeHost);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'homePort')) {
    updateDirty('homePort', nextValues.homePort === baselineValues.homePort);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'homePassword')) {
    updateDirty('homePassword', nextValues.homePassword === baselineValues.homePassword);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'rmAllowRemote')) {
    updateDirty('rmAllowRemote', nextValues.rmAllowRemote === baselineValues.rmAllowRemote);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'rmSecretKey')) {
    updateDirty('rmSecretKey', nextValues.rmSecretKey === baselineValues.rmSecretKey);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'rmDisableControlPanel')) {
    updateDirty(
      'rmDisableControlPanel',
      nextValues.rmDisableControlPanel === baselineValues.rmDisableControlPanel
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'rmDisableAutoUpdatePanel')) {
    updateDirty(
      'rmDisableAutoUpdatePanel',
      nextValues.rmDisableAutoUpdatePanel === baselineValues.rmDisableAutoUpdatePanel
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'rmPanelRepo')) {
    updateDirty('rmPanelRepo', nextValues.rmPanelRepo === baselineValues.rmPanelRepo);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'authDir')) {
    updateDirty('authDir', nextValues.authDir === baselineValues.authDir);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'apiKeysText')) {
    updateDirty('apiKeysText', nextValues.apiKeysText === baselineValues.apiKeysText);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'debug')) {
    updateDirty('debug', nextValues.debug === baselineValues.debug);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'commercialMode')) {
    updateDirty('commercialMode', nextValues.commercialMode === baselineValues.commercialMode);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'loggingToFile')) {
    updateDirty('loggingToFile', nextValues.loggingToFile === baselineValues.loggingToFile);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'requestLog')) {
    updateDirty('requestLog', nextValues.requestLog === baselineValues.requestLog);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'logsMaxTotalSizeMb')) {
    updateDirty(
      'logsMaxTotalSizeMb',
      nextValues.logsMaxTotalSizeMb === baselineValues.logsMaxTotalSizeMb
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'errorLogsMaxFiles')) {
    updateDirty(
      'errorLogsMaxFiles',
      nextValues.errorLogsMaxFiles === baselineValues.errorLogsMaxFiles
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'usageStatisticsEnabled')) {
    updateDirty(
      'usageStatisticsEnabled',
      nextValues.usageStatisticsEnabled === baselineValues.usageStatisticsEnabled
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'usageStatisticsPath')) {
    updateDirty(
      'usageStatisticsPath',
      nextValues.usageStatisticsPath === baselineValues.usageStatisticsPath
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'usageStatisticsFlushIntervalSeconds')) {
    updateDirty(
      'usageStatisticsFlushIntervalSeconds',
      nextValues.usageStatisticsFlushIntervalSeconds ===
        baselineValues.usageStatisticsFlushIntervalSeconds
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'redisUsageQueueRetentionSeconds')) {
    updateDirty(
      'redisUsageQueueRetentionSeconds',
      nextValues.redisUsageQueueRetentionSeconds === baselineValues.redisUsageQueueRetentionSeconds
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'disableCooling')) {
    updateDirty('disableCooling', nextValues.disableCooling === baselineValues.disableCooling);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'authAutoRefreshWorkers')) {
    updateDirty(
      'authAutoRefreshWorkers',
      nextValues.authAutoRefreshWorkers === baselineValues.authAutoRefreshWorkers
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'pprofEnable')) {
    updateDirty('pprofEnable', nextValues.pprofEnable === baselineValues.pprofEnable);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'pprofAddr')) {
    updateDirty('pprofAddr', nextValues.pprofAddr === baselineValues.pprofAddr);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'proxyUrl')) {
    updateDirty('proxyUrl', nextValues.proxyUrl === baselineValues.proxyUrl);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'forceModelPrefix')) {
    updateDirty(
      'forceModelPrefix',
      nextValues.forceModelPrefix === baselineValues.forceModelPrefix
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'passthroughHeaders')) {
    updateDirty(
      'passthroughHeaders',
      nextValues.passthroughHeaders === baselineValues.passthroughHeaders
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'disableImageGeneration')) {
    updateDirty(
      'disableImageGeneration',
      nextValues.disableImageGeneration === baselineValues.disableImageGeneration
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'enableGeminiCliEndpoint')) {
    updateDirty(
      'enableGeminiCliEndpoint',
      nextValues.enableGeminiCliEndpoint === baselineValues.enableGeminiCliEndpoint
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'codexIdentityConfuse')) {
    updateDirty(
      'codexIdentityConfuse',
      nextValues.codexIdentityConfuse === baselineValues.codexIdentityConfuse
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'requestRetry')) {
    updateDirty('requestRetry', nextValues.requestRetry === baselineValues.requestRetry);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'maxRetryCredentials')) {
    updateDirty(
      'maxRetryCredentials',
      nextValues.maxRetryCredentials === baselineValues.maxRetryCredentials
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'maxRetryInterval')) {
    updateDirty(
      'maxRetryInterval',
      nextValues.maxRetryInterval === baselineValues.maxRetryInterval
    );
  }
  if (patch.upstreamConcurrency) {
    const upstreamPatch = patch.upstreamConcurrency;
    if (Object.prototype.hasOwnProperty.call(upstreamPatch, 'defaultLimit')) {
      updateDirty(
        'upstreamConcurrency.defaultLimit',
        nextValues.upstreamConcurrency.defaultLimit ===
          baselineValues.upstreamConcurrency.defaultLimit
      );
    }
    if (Object.prototype.hasOwnProperty.call(upstreamPatch, 'providerLimits')) {
      updateDirty(
        'upstreamConcurrency.providerLimits',
        areProviderLimitEntriesEqual(
          nextValues.upstreamConcurrency.providerLimits,
          baselineValues.upstreamConcurrency.providerLimits
        )
      );
    }
    if (Object.prototype.hasOwnProperty.call(upstreamPatch, 'queueTimeoutSeconds')) {
      updateDirty(
        'upstreamConcurrency.queueTimeoutSeconds',
        nextValues.upstreamConcurrency.queueTimeoutSeconds ===
          baselineValues.upstreamConcurrency.queueTimeoutSeconds
      );
    }
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'wsAuth')) {
    updateDirty('wsAuth', nextValues.wsAuth === baselineValues.wsAuth);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'quotaSwitchProject')) {
    updateDirty(
      'quotaSwitchProject',
      nextValues.quotaSwitchProject === baselineValues.quotaSwitchProject
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'quotaSwitchPreviewModel')) {
    updateDirty(
      'quotaSwitchPreviewModel',
      nextValues.quotaSwitchPreviewModel === baselineValues.quotaSwitchPreviewModel
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'quotaAntigravityCredits')) {
    updateDirty(
      'quotaAntigravityCredits',
      nextValues.quotaAntigravityCredits === baselineValues.quotaAntigravityCredits
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'antigravitySignatureCacheEnabled')) {
    updateDirty(
      'antigravitySignatureCacheEnabled',
      nextValues.antigravitySignatureCacheEnabled ===
        baselineValues.antigravitySignatureCacheEnabled
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'antigravitySignatureBypassStrict')) {
    updateDirty(
      'antigravitySignatureBypassStrict',
      nextValues.antigravitySignatureBypassStrict ===
        baselineValues.antigravitySignatureBypassStrict
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'routingStrategy')) {
    updateDirty('routingStrategy', nextValues.routingStrategy === baselineValues.routingStrategy);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'routingSessionAffinity')) {
    updateDirty(
      'routingSessionAffinity',
      nextValues.routingSessionAffinity === baselineValues.routingSessionAffinity
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'routingSessionAffinityTTL')) {
    updateDirty(
      'routingSessionAffinityTTL',
      nextValues.routingSessionAffinityTTL === baselineValues.routingSessionAffinityTTL
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'payloadDefaultRules')) {
    updateDirty(
      'payloadDefaultRules',
      arePayloadRulesEqual(nextValues.payloadDefaultRules, baselineValues.payloadDefaultRules)
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'payloadDefaultRawRules')) {
    updateDirty(
      'payloadDefaultRawRules',
      arePayloadRulesEqual(nextValues.payloadDefaultRawRules, baselineValues.payloadDefaultRawRules)
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'payloadOverrideRules')) {
    updateDirty(
      'payloadOverrideRules',
      arePayloadRulesEqual(nextValues.payloadOverrideRules, baselineValues.payloadOverrideRules)
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'payloadOverrideRawRules')) {
    updateDirty(
      'payloadOverrideRawRules',
      arePayloadRulesEqual(
        nextValues.payloadOverrideRawRules,
        baselineValues.payloadOverrideRawRules
      )
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'payloadFilterRules')) {
    updateDirty(
      'payloadFilterRules',
      arePayloadFilterRulesEqual(nextValues.payloadFilterRules, baselineValues.payloadFilterRules)
    );
  }
  if (patch.streaming) {
    const streamingPatch = patch.streaming;
    if (Object.prototype.hasOwnProperty.call(streamingPatch, 'keepaliveSeconds')) {
      updateDirty(
        'streaming.keepaliveSeconds',
        nextValues.streaming.keepaliveSeconds === baselineValues.streaming.keepaliveSeconds
      );
    }
    if (Object.prototype.hasOwnProperty.call(streamingPatch, 'bootstrapRetries')) {
      updateDirty(
        'streaming.bootstrapRetries',
        nextValues.streaming.bootstrapRetries === baselineValues.streaming.bootstrapRetries
      );
    }
    if (Object.prototype.hasOwnProperty.call(streamingPatch, 'nonstreamKeepaliveInterval')) {
      updateDirty(
        'streaming.nonstreamKeepaliveInterval',
        nextValues.streaming.nonstreamKeepaliveInterval ===
          baselineValues.streaming.nonstreamKeepaliveInterval
      );
    }
  }
  if (patch.claudeHeaderDefaults) {
    Object.keys(patch.claudeHeaderDefaults).forEach((key) => {
      const field = key as keyof VisualConfigValues['claudeHeaderDefaults'];
      updateDirty(
        `claudeHeaderDefaults.${field}`,
        nextValues.claudeHeaderDefaults[field] === baselineValues.claudeHeaderDefaults[field]
      );
    });
  }
  if (patch.codexHeaderDefaults) {
    Object.keys(patch.codexHeaderDefaults).forEach((key) => {
      const field = key as keyof VisualConfigValues['codexHeaderDefaults'];
      updateDirty(
        `codexHeaderDefaults.${field}`,
        nextValues.codexHeaderDefaults[field] === baselineValues.codexHeaderDefaults[field]
      );
    });
  }

  return nextDirtyFields;
}

function visualConfigReducer(
  state: VisualConfigState,
  action: VisualConfigAction
): VisualConfigState {
  switch (action.type) {
    case 'load_success':
      return {
        visualValues: action.values,
        baselineValues: deepClone(action.values),
        dirtyFields: new Set(),
        visualParseError: null,
      };
    case 'load_error':
      return {
        ...state,
        visualParseError: action.error,
      };
    case 'set_values': {
      const nextValues = mergeVisualConfigValues(state.visualValues, action.values);
      const nextDirtyFields = getNextDirtyFields(
        state.dirtyFields,
        action.values,
        nextValues,
        state.baselineValues
      );

      return {
        ...state,
        visualValues: nextValues,
        dirtyFields: nextDirtyFields,
      };
    }
    default:
      return state;
  }
}

export function useVisualConfig() {
  const [state, dispatch] = useReducer(
    visualConfigReducer,
    undefined,
    createInitialVisualConfigState
  );
  const { visualValues, visualParseError, dirtyFields } = state;
  const visualDirty = dirtyFields.size > 0;
  const visualValidationErrors = useMemo(
    () => getVisualConfigValidationErrors(visualValues),
    [visualValues]
  );
  const visualHasPayloadValidationErrors = useMemo(
    () =>
      hasPayloadParamValidationErrors(visualValues.payloadDefaultRules) ||
      hasPayloadParamValidationErrors(visualValues.payloadDefaultRawRules) ||
      hasPayloadParamValidationErrors(visualValues.payloadOverrideRules) ||
      hasPayloadParamValidationErrors(visualValues.payloadOverrideRawRules),
    [
      visualValues.payloadDefaultRules,
      visualValues.payloadDefaultRawRules,
      visualValues.payloadOverrideRules,
      visualValues.payloadOverrideRawRules,
    ]
  );

  const loadVisualValuesFromYaml = useCallback((yamlContent: string) => {
    try {
      const document = parseDocument(yamlContent);
      if (document.errors.length > 0) {
        throw new Error(document.errors[0]?.message ?? 'Invalid YAML');
      }

      const parsedRaw: unknown = parseYaml(yamlContent) || {};
      const parsed = asRecord(parsedRaw) ?? {};
      const tls = asRecord(parsed.tls);
      const home = asRecord(parsed.home);
      const remoteManagement = asRecord(parsed['remote-management']);
      const pprof = asRecord(parsed.pprof);
      const quotaExceeded = asRecord(parsed['quota-exceeded']);
      const routing = asRecord(parsed.routing);
      const payload = asRecord(parsed.payload);
      const streaming = asRecord(parsed.streaming);
      const upstreamConcurrency = asRecord(parsed['upstream-concurrency']);
      const codex = asRecord(parsed.codex);
      const claudeHeaderDefaults = parseHeaderDefaults(parsed['claude-header-defaults']);
      const codexHeaderDefaults = parseHeaderDefaults(parsed['codex-header-defaults']);

      const newValues: VisualConfigValues = {
        host: typeof parsed.host === 'string' ? parsed.host : '',
        port: String(parsed.port ?? ''),

        tlsEnable: Boolean(tls?.enable),
        tlsCert: typeof tls?.cert === 'string' ? tls.cert : '',
        tlsKey: typeof tls?.key === 'string' ? tls.key : '',

        homeEnabled: Boolean(home?.enabled),
        homeHost: typeof home?.host === 'string' ? home.host : '',
        homePort: String(home?.port ?? ''),
        homePassword: typeof home?.password === 'string' ? home.password : '',

        rmAllowRemote: Boolean(remoteManagement?.['allow-remote']),
        rmSecretKey:
          typeof remoteManagement?.['secret-key'] === 'string'
            ? remoteManagement['secret-key']
            : '',
        rmDisableControlPanel: Boolean(remoteManagement?.['disable-control-panel']),
        rmDisableAutoUpdatePanel: Boolean(remoteManagement?.['disable-auto-update-panel']),
        rmPanelRepo:
          typeof remoteManagement?.['panel-github-repository'] === 'string'
            ? remoteManagement['panel-github-repository']
            : typeof remoteManagement?.['panel-repo'] === 'string'
              ? remoteManagement['panel-repo']
              : '',

        authDir: typeof parsed['auth-dir'] === 'string' ? parsed['auth-dir'] : '',
        apiKeysText: resolveApiKeysText(parsed),

        debug: Boolean(parsed.debug),
        commercialMode: Boolean(parsed['commercial-mode']),
        loggingToFile: Boolean(parsed['logging-to-file']),
        requestLog: Boolean(parsed['request-log']),
        logsMaxTotalSizeMb: String(parsed['logs-max-total-size-mb'] ?? ''),
        errorLogsMaxFiles: String(parsed['error-logs-max-files'] ?? ''),
        usageStatisticsEnabled: Boolean(parsed['usage-statistics-enabled']),
        usageStatisticsPath:
          typeof parsed['usage-statistics-path'] === 'string'
            ? parsed['usage-statistics-path']
            : '',
        usageStatisticsFlushIntervalSeconds: String(
          parsed['usage-statistics-flush-interval-seconds'] ?? ''
        ),
        redisUsageQueueRetentionSeconds: String(
          parsed['redis-usage-queue-retention-seconds'] ?? ''
        ),
        disableCooling: Boolean(parsed['disable-cooling']),
        authAutoRefreshWorkers: String(parsed['auth-auto-refresh-workers'] ?? ''),
        pprofEnable: Boolean(pprof?.enable),
        pprofAddr: typeof pprof?.addr === 'string' ? pprof.addr : '',

        proxyUrl: typeof parsed['proxy-url'] === 'string' ? parsed['proxy-url'] : '',
        forceModelPrefix: Boolean(parsed['force-model-prefix']),
        passthroughHeaders: Boolean(parsed['passthrough-headers']),
        disableImageGeneration: parseDisableImageGenerationMode(parsed['disable-image-generation']),
        enableGeminiCliEndpoint: Boolean(parsed['enable-gemini-cli-endpoint']),
        codexIdentityConfuse: Boolean(codex?.['identity-confuse']),
        requestRetry: String(parsed['request-retry'] ?? ''),
        maxRetryCredentials: String(parsed['max-retry-credentials'] ?? ''),
        maxRetryInterval: String(parsed['max-retry-interval'] ?? ''),
        wsAuth: Boolean(parsed['ws-auth']),
        upstreamConcurrency: {
          defaultLimit: String(upstreamConcurrency?.default ?? ''),
          providerLimits: providerLimitsToEntries(upstreamConcurrency?.providers),
          queueTimeoutSeconds: String(upstreamConcurrency?.['queue-timeout-seconds'] ?? ''),
        },

        quotaSwitchProject: Boolean(quotaExceeded?.['switch-project'] ?? true),
        quotaSwitchPreviewModel: Boolean(quotaExceeded?.['switch-preview-model'] ?? true),
        quotaAntigravityCredits: Boolean(quotaExceeded?.['antigravity-credits'] ?? false),
        antigravitySignatureCacheEnabled: Boolean(parsed['antigravity-signature-cache-enabled']),
        antigravitySignatureBypassStrict: Boolean(parsed['antigravity-signature-bypass-strict']),

        routingStrategy: routing?.strategy === 'fill-first' ? 'fill-first' : 'round-robin',
        routingSessionAffinity: Boolean(
          routing?.['session-affinity'] ?? routing?.sessionAffinity ?? routing?.['sessionAffinity']
        ),
        routingSessionAffinityTTL:
          typeof routing?.['session-affinity-ttl'] === 'string'
            ? routing['session-affinity-ttl']
            : typeof routing?.sessionAffinityTTL === 'string'
              ? routing.sessionAffinityTTL
              : typeof routing?.['sessionAffinityTTL'] === 'string'
                ? routing['sessionAffinityTTL']
                : '',

        payloadDefaultRules: parsePayloadRules(payload?.default),
        payloadDefaultRawRules: parseRawPayloadRules(payload?.['default-raw']),
        payloadOverrideRules: parsePayloadRules(payload?.override),
        payloadOverrideRawRules: parseRawPayloadRules(payload?.['override-raw']),
        payloadFilterRules: parsePayloadFilterRules(payload?.filter),

        streaming: {
          keepaliveSeconds: String(streaming?.['keepalive-seconds'] ?? ''),
          bootstrapRetries: String(streaming?.['bootstrap-retries'] ?? ''),
          nonstreamKeepaliveInterval: String(parsed['nonstream-keepalive-interval'] ?? ''),
        },
        claudeHeaderDefaults,
        codexHeaderDefaults,
      };

      dispatch({ type: 'load_success', values: newValues });
      return { ok: true as const };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Invalid YAML';
      dispatch({ type: 'load_error', error: message });
      return { ok: false as const, error: message };
    }
  }, []);

  const applyVisualChangesToYaml = useCallback(
    (currentYaml: string): string => {
      try {
        const doc = parseDocument(currentYaml);
        if (doc.errors.length > 0) return currentYaml;
        if (!isMap(doc.contents)) {
          doc.contents = doc.createNode({}) as unknown as typeof doc.contents;
        }
        const values = visualValues;

        setStringInDoc(doc, ['host'], values.host);
        setIntFromStringInDoc(doc, ['port'], values.port);

        if (
          docHas(doc, ['tls']) ||
          values.tlsEnable ||
          values.tlsCert.trim() ||
          values.tlsKey.trim()
        ) {
          ensureMapInDoc(doc, ['tls']);
          setBooleanInDoc(doc, ['tls', 'enable'], values.tlsEnable);
          setStringInDoc(doc, ['tls', 'cert'], values.tlsCert);
          setStringInDoc(doc, ['tls', 'key'], values.tlsKey);
          deleteIfMapEmpty(doc, ['tls']);
        }

        if (
          docHas(doc, ['home']) ||
          values.homeEnabled ||
          values.homeHost.trim() ||
          values.homePort.trim() ||
          values.homePassword.trim() ||
          dirtyFields.has('homeEnabled') ||
          dirtyFields.has('homeHost') ||
          dirtyFields.has('homePort') ||
          dirtyFields.has('homePassword')
        ) {
          ensureMapInDoc(doc, ['home']);
          doc.setIn(['home', 'enabled'], values.homeEnabled);
          setStringInDoc(doc, ['home', 'host'], values.homeHost);
          setIntFromStringInDoc(doc, ['home', 'port'], values.homePort);
          setStringInDoc(doc, ['home', 'password'], values.homePassword);
          deleteIfMapEmpty(doc, ['home']);
        }

        if (
          docHas(doc, ['remote-management']) ||
          values.rmAllowRemote ||
          values.rmSecretKey.trim() ||
          values.rmDisableControlPanel ||
          values.rmDisableAutoUpdatePanel ||
          values.rmPanelRepo.trim()
        ) {
          ensureMapInDoc(doc, ['remote-management']);
          setBooleanInDoc(doc, ['remote-management', 'allow-remote'], values.rmAllowRemote);
          setStringInDoc(doc, ['remote-management', 'secret-key'], values.rmSecretKey);
          setBooleanInDoc(
            doc,
            ['remote-management', 'disable-control-panel'],
            values.rmDisableControlPanel
          );
          setBooleanInDoc(
            doc,
            ['remote-management', 'disable-auto-update-panel'],
            values.rmDisableAutoUpdatePanel
          );
          setStringInDoc(doc, ['remote-management', 'panel-github-repository'], values.rmPanelRepo);
          if (docHas(doc, ['remote-management', 'panel-repo'])) {
            doc.deleteIn(['remote-management', 'panel-repo']);
          }
          deleteIfMapEmpty(doc, ['remote-management']);
        }

        setStringInDoc(doc, ['auth-dir'], values.authDir);
        const apiKeys = values.apiKeysText
          .split('\n')
          .map((key) => key.trim())
          .filter(Boolean);
        if (apiKeys.length > 0) {
          doc.setIn(['api-keys'], apiKeys);
        } else if (docHas(doc, ['api-keys'])) {
          doc.deleteIn(['api-keys']);
        }
        deleteLegacyApiKeysProvider(doc);

        setBooleanInDoc(doc, ['debug'], values.debug);

        setBooleanInDoc(doc, ['commercial-mode'], values.commercialMode);
        setBooleanInDoc(doc, ['logging-to-file'], values.loggingToFile);
        if (shouldWriteManagedField(doc, ['request-log'], dirtyFields, 'requestLog')) {
          setBooleanInDoc(doc, ['request-log'], values.requestLog);
        }
        setIntFromStringInDoc(doc, ['logs-max-total-size-mb'], values.logsMaxTotalSizeMb);
        setOptionalIntFromStringInDoc(
          doc,
          ['error-logs-max-files'],
          values.errorLogsMaxFiles,
          dirtyFields,
          'errorLogsMaxFiles'
        );
        if (
          shouldWriteManagedField(
            doc,
            ['usage-statistics-enabled'],
            dirtyFields,
            'usageStatisticsEnabled'
          )
        ) {
          setBooleanInDoc(doc, ['usage-statistics-enabled'], values.usageStatisticsEnabled);
        }
        if (
          shouldWriteManagedField(
            doc,
            ['usage-statistics-path'],
            dirtyFields,
            'usageStatisticsPath'
          )
        ) {
          setStringInDoc(doc, ['usage-statistics-path'], values.usageStatisticsPath);
        }
        setOptionalIntFromStringInDoc(
          doc,
          ['usage-statistics-flush-interval-seconds'],
          values.usageStatisticsFlushIntervalSeconds,
          dirtyFields,
          'usageStatisticsFlushIntervalSeconds'
        );
        setOptionalIntFromStringInDoc(
          doc,
          ['redis-usage-queue-retention-seconds'],
          values.redisUsageQueueRetentionSeconds,
          dirtyFields,
          'redisUsageQueueRetentionSeconds'
        );
        if (shouldWriteManagedField(doc, ['disable-cooling'], dirtyFields, 'disableCooling')) {
          setBooleanInDoc(doc, ['disable-cooling'], values.disableCooling);
        }
        setOptionalIntFromStringInDoc(
          doc,
          ['auth-auto-refresh-workers'],
          values.authAutoRefreshWorkers,
          dirtyFields,
          'authAutoRefreshWorkers'
        );
        if (
          docHas(doc, ['pprof']) ||
          values.pprofEnable ||
          values.pprofAddr.trim() ||
          dirtyFields.has('pprofEnable') ||
          dirtyFields.has('pprofAddr')
        ) {
          ensureMapInDoc(doc, ['pprof']);
          setBooleanInDoc(doc, ['pprof', 'enable'], values.pprofEnable);
          setStringInDoc(doc, ['pprof', 'addr'], values.pprofAddr);
          deleteIfMapEmpty(doc, ['pprof']);
        }

        setStringInDoc(doc, ['proxy-url'], values.proxyUrl);
        setBooleanInDoc(doc, ['force-model-prefix'], values.forceModelPrefix);
        if (
          shouldWriteManagedField(doc, ['passthrough-headers'], dirtyFields, 'passthroughHeaders')
        ) {
          setBooleanInDoc(doc, ['passthrough-headers'], values.passthroughHeaders);
        }
        if (
          shouldWriteManagedField(
            doc,
            ['disable-image-generation'],
            dirtyFields,
            'disableImageGeneration'
          )
        ) {
          if (values.disableImageGeneration === 'chat') {
            doc.setIn(['disable-image-generation'], 'chat');
          } else {
            doc.setIn(['disable-image-generation'], values.disableImageGeneration === 'true');
          }
        }
        if (
          shouldWriteManagedField(
            doc,
            ['enable-gemini-cli-endpoint'],
            dirtyFields,
            'enableGeminiCliEndpoint'
          )
        ) {
          setBooleanInDoc(doc, ['enable-gemini-cli-endpoint'], values.enableGeminiCliEndpoint);
        }
        if (
          shouldWriteManagedField(
            doc,
            ['codex', 'identity-confuse'],
            dirtyFields,
            'codexIdentityConfuse'
          )
        ) {
          setBooleanInDoc(doc, ['codex', 'identity-confuse'], values.codexIdentityConfuse);
        }
        setIntFromStringInDoc(doc, ['request-retry'], values.requestRetry);
        setIntFromStringInDoc(doc, ['max-retry-credentials'], values.maxRetryCredentials);
        setIntFromStringInDoc(doc, ['max-retry-interval'], values.maxRetryInterval);
        setBooleanInDoc(doc, ['ws-auth'], values.wsAuth);

        if (
          docHas(doc, ['upstream-concurrency']) ||
          values.upstreamConcurrency.defaultLimit.trim() ||
          values.upstreamConcurrency.providerLimits.some(
            (entry) => entry.provider.trim() || entry.limit.trim()
          ) ||
          values.upstreamConcurrency.queueTimeoutSeconds.trim() ||
          dirtyFields.has('upstreamConcurrency.defaultLimit') ||
          dirtyFields.has('upstreamConcurrency.providerLimits') ||
          dirtyFields.has('upstreamConcurrency.queueTimeoutSeconds')
        ) {
          ensureMapInDoc(doc, ['upstream-concurrency']);
          setIntFromStringInDoc(
            doc,
            ['upstream-concurrency', 'default'],
            values.upstreamConcurrency.defaultLimit
          );
          const providerLimits = providerLimitEntriesToRecord(values.upstreamConcurrency.providerLimits);
          if (Object.keys(providerLimits).length) {
            doc.setIn(['upstream-concurrency', 'providers'], providerLimits);
          } else if (docHas(doc, ['upstream-concurrency', 'providers'])) {
            doc.deleteIn(['upstream-concurrency', 'providers']);
          }
          setIntFromStringInDoc(
            doc,
            ['upstream-concurrency', 'queue-timeout-seconds'],
            values.upstreamConcurrency.queueTimeoutSeconds
          );
          deleteIfMapEmpty(doc, ['upstream-concurrency']);
        }

        if (
          docHas(doc, ['quota-exceeded']) ||
          !values.quotaSwitchProject ||
          !values.quotaSwitchPreviewModel ||
          shouldWriteManagedField(
            doc,
            ['quota-exceeded', 'antigravity-credits'],
            dirtyFields,
            'quotaAntigravityCredits'
          )
        ) {
          ensureMapInDoc(doc, ['quota-exceeded']);
          const writeQuotaAntigravityCredits = shouldWriteManagedField(
            doc,
            ['quota-exceeded', 'antigravity-credits'],
            dirtyFields,
            'quotaAntigravityCredits'
          );
          doc.setIn(['quota-exceeded', 'switch-project'], values.quotaSwitchProject);
          doc.setIn(['quota-exceeded', 'switch-preview-model'], values.quotaSwitchPreviewModel);
          if (writeQuotaAntigravityCredits) {
            doc.setIn(['quota-exceeded', 'antigravity-credits'], values.quotaAntigravityCredits);
          }
          deleteIfMapEmpty(doc, ['quota-exceeded']);
        }
        if (
          shouldWriteManagedField(
            doc,
            ['antigravity-signature-cache-enabled'],
            dirtyFields,
            'antigravitySignatureCacheEnabled'
          )
        ) {
          setBooleanInDoc(
            doc,
            ['antigravity-signature-cache-enabled'],
            values.antigravitySignatureCacheEnabled
          );
        }
        if (
          shouldWriteManagedField(
            doc,
            ['antigravity-signature-bypass-strict'],
            dirtyFields,
            'antigravitySignatureBypassStrict'
          )
        ) {
          setBooleanInDoc(
            doc,
            ['antigravity-signature-bypass-strict'],
            values.antigravitySignatureBypassStrict
          );
        }

        if (
          docHas(doc, ['routing']) ||
          values.routingStrategy !== 'round-robin' ||
          values.routingSessionAffinity ||
          values.routingSessionAffinityTTL.trim()
        ) {
          ensureMapInDoc(doc, ['routing']);
          doc.setIn(['routing', 'strategy'], values.routingStrategy);
          setBooleanInDoc(doc, ['routing', 'session-affinity'], values.routingSessionAffinity);
          setStringInDoc(
            doc,
            ['routing', 'session-affinity-ttl'],
            values.routingSessionAffinityTTL
          );
          deleteIfMapEmpty(doc, ['routing']);
        }

        const keepaliveSeconds =
          typeof values.streaming?.keepaliveSeconds === 'string'
            ? values.streaming.keepaliveSeconds
            : '';
        const bootstrapRetries =
          typeof values.streaming?.bootstrapRetries === 'string'
            ? values.streaming.bootstrapRetries
            : '';
        const nonstreamKeepaliveInterval =
          typeof values.streaming?.nonstreamKeepaliveInterval === 'string'
            ? values.streaming.nonstreamKeepaliveInterval
            : '';

        const streamingDefined =
          docHas(doc, ['streaming']) || keepaliveSeconds.trim() || bootstrapRetries.trim();
        if (streamingDefined) {
          ensureMapInDoc(doc, ['streaming']);
          setIntFromStringInDoc(doc, ['streaming', 'keepalive-seconds'], keepaliveSeconds);
          setIntFromStringInDoc(doc, ['streaming', 'bootstrap-retries'], bootstrapRetries);
          deleteIfMapEmpty(doc, ['streaming']);
        }

        setIntFromStringInDoc(doc, ['nonstream-keepalive-interval'], nonstreamKeepaliveInterval);

        if (
          shouldWriteHeaderDefaults(
            doc,
            'claude-header-defaults',
            values.claudeHeaderDefaults,
            dirtyFields,
            'claudeHeaderDefaults',
            [
              'userAgent',
              'packageVersion',
              'runtimeVersion',
              'os',
              'arch',
              'timeout',
              'stabilizeDeviceProfile',
            ]
          )
        ) {
          ensureMapInDoc(doc, ['claude-header-defaults']);
          setStringInDoc(
            doc,
            ['claude-header-defaults', 'user-agent'],
            values.claudeHeaderDefaults.userAgent
          );
          setStringInDoc(
            doc,
            ['claude-header-defaults', 'package-version'],
            values.claudeHeaderDefaults.packageVersion
          );
          setStringInDoc(
            doc,
            ['claude-header-defaults', 'runtime-version'],
            values.claudeHeaderDefaults.runtimeVersion
          );
          setStringInDoc(doc, ['claude-header-defaults', 'os'], values.claudeHeaderDefaults.os);
          setStringInDoc(doc, ['claude-header-defaults', 'arch'], values.claudeHeaderDefaults.arch);
          setStringInDoc(
            doc,
            ['claude-header-defaults', 'timeout'],
            values.claudeHeaderDefaults.timeout
          );
          if (
            shouldWriteManagedField(
              doc,
              ['claude-header-defaults', 'stabilize-device-profile'],
              dirtyFields,
              'claudeHeaderDefaults.stabilizeDeviceProfile'
            )
          ) {
            setBooleanInDoc(
              doc,
              ['claude-header-defaults', 'stabilize-device-profile'],
              values.claudeHeaderDefaults.stabilizeDeviceProfile
            );
          }
          deleteIfMapEmpty(doc, ['claude-header-defaults']);
        }

        if (
          shouldWriteHeaderDefaults(
            doc,
            'codex-header-defaults',
            values.codexHeaderDefaults,
            dirtyFields,
            'codexHeaderDefaults',
            ['userAgent', 'betaFeaturesText']
          )
        ) {
          ensureMapInDoc(doc, ['codex-header-defaults']);
          setStringInDoc(
            doc,
            ['codex-header-defaults', 'user-agent'],
            values.codexHeaderDefaults.userAgent
          );
          setStringInDoc(
            doc,
            ['codex-header-defaults', 'beta-features'],
            values.codexHeaderDefaults.betaFeaturesText
          );
          deleteIfMapEmpty(doc, ['codex-header-defaults']);
        }

        if (
          docHas(doc, ['payload']) ||
          values.payloadDefaultRules.length > 0 ||
          values.payloadDefaultRawRules.length > 0 ||
          values.payloadOverrideRules.length > 0 ||
          values.payloadOverrideRawRules.length > 0 ||
          values.payloadFilterRules.length > 0
        ) {
          ensureMapInDoc(doc, ['payload']);
          if (values.payloadDefaultRules.length > 0) {
            doc.setIn(
              ['payload', 'default'],
              serializePayloadRulesForYaml(values.payloadDefaultRules)
            );
          } else if (docHas(doc, ['payload', 'default'])) {
            doc.deleteIn(['payload', 'default']);
          }
          if (values.payloadDefaultRawRules.length > 0) {
            doc.setIn(
              ['payload', 'default-raw'],
              serializeRawPayloadRulesForYaml(values.payloadDefaultRawRules)
            );
          } else if (docHas(doc, ['payload', 'default-raw'])) {
            doc.deleteIn(['payload', 'default-raw']);
          }
          if (values.payloadOverrideRules.length > 0) {
            doc.setIn(
              ['payload', 'override'],
              serializePayloadRulesForYaml(values.payloadOverrideRules)
            );
          } else if (docHas(doc, ['payload', 'override'])) {
            doc.deleteIn(['payload', 'override']);
          }
          if (values.payloadOverrideRawRules.length > 0) {
            doc.setIn(
              ['payload', 'override-raw'],
              serializeRawPayloadRulesForYaml(values.payloadOverrideRawRules)
            );
          } else if (docHas(doc, ['payload', 'override-raw'])) {
            doc.deleteIn(['payload', 'override-raw']);
          }
          if (values.payloadFilterRules.length > 0) {
            doc.setIn(
              ['payload', 'filter'],
              serializePayloadFilterRulesForYaml(values.payloadFilterRules)
            );
          } else if (docHas(doc, ['payload', 'filter'])) {
            doc.deleteIn(['payload', 'filter']);
          }
          deleteIfMapEmpty(doc, ['payload']);
        }

        return doc.toString({ indent: 2, lineWidth: 120, minContentWidth: 0 });
      } catch {
        return currentYaml;
      }
    },
    [dirtyFields, visualValues]
  );

  const setVisualValues = useCallback((newValues: Partial<VisualConfigValues>) => {
    dispatch({ type: 'set_values', values: newValues });
  }, []);

  return {
    visualValues,
    visualDirty,
    visualParseError,
    visualValidationErrors,
    visualHasPayloadValidationErrors,
    loadVisualValuesFromYaml,
    applyVisualChangesToYaml,
    setVisualValues,
  };
}

export const VISUAL_CONFIG_PROTOCOL_OPTIONS = [
  {
    value: '',
    labelKey: 'config_management.visual.payload_rules.provider_default',
    defaultLabel: 'Default',
  },
  {
    value: 'openai',
    labelKey: 'config_management.visual.payload_rules.provider_openai',
    defaultLabel: 'OpenAI',
  },
  {
    value: 'openai-response',
    labelKey: 'config_management.visual.payload_rules.provider_openai_response',
    defaultLabel: 'OpenAI Response',
  },
  {
    value: 'gemini',
    labelKey: 'config_management.visual.payload_rules.provider_gemini',
    defaultLabel: 'Gemini',
  },
  {
    value: 'claude',
    labelKey: 'config_management.visual.payload_rules.provider_claude',
    defaultLabel: 'Claude',
  },
  {
    value: 'codex',
    labelKey: 'config_management.visual.payload_rules.provider_codex',
    defaultLabel: 'Codex',
  },
  {
    value: 'antigravity',
    labelKey: 'config_management.visual.payload_rules.provider_antigravity',
    defaultLabel: 'Antigravity',
  },
] as const;

export const VISUAL_CONFIG_PAYLOAD_VALUE_TYPE_OPTIONS = [
  {
    value: 'string',
    labelKey: 'config_management.visual.payload_rules.value_type_string',
    defaultLabel: 'String',
  },
  {
    value: 'number',
    labelKey: 'config_management.visual.payload_rules.value_type_number',
    defaultLabel: 'Number',
  },
  {
    value: 'boolean',
    labelKey: 'config_management.visual.payload_rules.value_type_boolean',
    defaultLabel: 'Boolean',
  },
  {
    value: 'json',
    labelKey: 'config_management.visual.payload_rules.value_type_json',
    defaultLabel: 'JSON',
  },
] as const satisfies ReadonlyArray<{
  value: PayloadParamValueType;
  labelKey: string;
  defaultLabel: string;
}>;
