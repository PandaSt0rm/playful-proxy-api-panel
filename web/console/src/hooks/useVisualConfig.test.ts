import { describe, it, expect } from 'vitest';
import { act, renderHook } from '@/test/utils';
import { parse as parseYaml } from 'yaml';

import {
  useVisualConfig,
  getVisualConfigValidationErrors,
  getPayloadParamValidationError,
} from './useVisualConfig';
import { DEFAULT_VISUAL_VALUES } from '@/types/visualConfig';
import type {
  VisualConfigValues,
  PayloadParamEntry,
  UpstreamConcurrencyProviderLimitEntry,
} from '@/types/visualConfig';

// A baseline VisualConfigValues used to build validation inputs by hand.
function baseValues(): VisualConfigValues {
  return structuredClone(DEFAULT_VISUAL_VALUES);
}

function makeParam(overrides: Partial<PayloadParamEntry>): PayloadParamEntry {
  return {
    id: 'p1',
    path: 'temperature',
    valueType: 'string',
    value: '',
    ...overrides,
  };
}

function makeProviderEntry(
  overrides: Partial<UpstreamConcurrencyProviderLimitEntry>
): UpstreamConcurrencyProviderLimitEntry {
  return {
    id: 'e1',
    provider: '',
    limit: '',
    ...overrides,
  };
}

describe('getPayloadParamValidationError', () => {
  it('returns undefined for a non-empty string value', () => {
    const param = makeParam({ valueType: 'string', value: 'anything' });

    const result = getPayloadParamValidationError(param);

    expect(result).toBeUndefined();
  });

  it('returns undefined for an empty string value', () => {
    const param = makeParam({ valueType: 'string', value: '' });

    const result = getPayloadParamValidationError(param);

    expect(result).toBeUndefined();
  });

  it('returns payload_invalid_number when number value is empty', () => {
    const param = makeParam({ valueType: 'number', value: '   ' });

    const result = getPayloadParamValidationError(param);

    expect(result).toBe('payload_invalid_number');
  });

  it('returns undefined for a valid integer number value', () => {
    const param = makeParam({ valueType: 'number', value: '42' });

    const result = getPayloadParamValidationError(param);

    expect(result).toBeUndefined();
  });

  it('returns undefined for a valid negative float number value', () => {
    const param = makeParam({ valueType: 'number', value: '-3.14' });

    const result = getPayloadParamValidationError(param);

    expect(result).toBeUndefined();
  });

  it('returns payload_invalid_number for a non-numeric number value', () => {
    const param = makeParam({ valueType: 'number', value: '12abc' });

    const result = getPayloadParamValidationError(param);

    expect(result).toBe('payload_invalid_number');
  });

  it('returns undefined for boolean value "true" regardless of casing', () => {
    const param = makeParam({ valueType: 'boolean', value: 'TRUE' });

    const result = getPayloadParamValidationError(param);

    expect(result).toBeUndefined();
  });

  it('returns undefined for boolean value "false"', () => {
    const param = makeParam({ valueType: 'boolean', value: 'false' });

    const result = getPayloadParamValidationError(param);

    expect(result).toBeUndefined();
  });

  it('returns payload_invalid_boolean for a non-boolean boolean value', () => {
    const param = makeParam({ valueType: 'boolean', value: 'yes' });

    const result = getPayloadParamValidationError(param);

    expect(result).toBe('payload_invalid_boolean');
  });

  it('returns payload_invalid_json for an empty json value', () => {
    const param = makeParam({ valueType: 'json', value: '   ' });

    const result = getPayloadParamValidationError(param);

    expect(result).toBe('payload_invalid_json');
  });

  it('returns undefined for a parseable json value', () => {
    const param = makeParam({ valueType: 'json', value: '{"a": 1}' });

    const result = getPayloadParamValidationError(param);

    expect(result).toBeUndefined();
  });

  it('returns payload_invalid_json for malformed json', () => {
    const param = makeParam({ valueType: 'json', value: '{not valid}' });

    const result = getPayloadParamValidationError(param);

    expect(result).toBe('payload_invalid_json');
  });
});

describe('getVisualConfigValidationErrors', () => {
  it('returns all-undefined errors for default (empty) values', () => {
    const values = baseValues();

    const errors = getVisualConfigValidationErrors(values);

    expect(errors).toEqual({
      port: undefined,
      'home.port': undefined,
      logsMaxTotalSizeMb: undefined,
      errorLogsMaxFiles: undefined,
      usageStatisticsFlushIntervalSeconds: undefined,
      redisUsageQueueRetentionSeconds: undefined,
      authAutoRefreshWorkers: undefined,
      requestRetry: undefined,
      maxRetryCredentials: undefined,
      maxRetryInterval: undefined,
      'upstreamConcurrency.default': undefined,
      'upstreamConcurrency.providers': undefined,
      'upstreamConcurrency.queueTimeoutSeconds': undefined,
      'streaming.keepaliveSeconds': undefined,
      'streaming.bootstrapRetries': undefined,
      'streaming.nonstreamKeepaliveInterval': undefined,
    });
  });

  it('flags port_range when port is below the valid range', () => {
    const values = baseValues();
    values.port = '0';

    const errors = getVisualConfigValidationErrors(values);

    expect(errors.port).toBe('port_range');
  });

  it('accepts the maximum valid port 65535', () => {
    const values = baseValues();
    values.port = '65535';

    const errors = getVisualConfigValidationErrors(values);

    expect(errors.port).toBeUndefined();
  });

  it('flags port_range when port exceeds 65535', () => {
    const values = baseValues();
    values.port = '65536';

    const errors = getVisualConfigValidationErrors(values);

    expect(errors.port).toBe('port_range');
  });

  it('flags port_range when port contains a non-digit', () => {
    const values = baseValues();
    values.port = '80a';

    const errors = getVisualConfigValidationErrors(values);

    expect(errors.port).toBe('port_range');
  });

  it('flags non_negative_integer when a numeric field is negative', () => {
    const values = baseValues();
    values.logsMaxTotalSizeMb = '-1';

    const errors = getVisualConfigValidationErrors(values);

    expect(errors.logsMaxTotalSizeMb).toBe('non_negative_integer');
  });

  it('accepts zero as a non-negative integer field', () => {
    const values = baseValues();
    values.errorLogsMaxFiles = '0';

    const errors = getVisualConfigValidationErrors(values);

    expect(errors.errorLogsMaxFiles).toBeUndefined();
  });

  it('flags non_negative_integer when a numeric field is a decimal', () => {
    const values = baseValues();
    values.requestRetry = '2.5';

    const errors = getVisualConfigValidationErrors(values);

    expect(errors.requestRetry).toBe('non_negative_integer');
  });

  it('flags provider_limit_provider_required when a limit is set without a provider', () => {
    const values = baseValues();
    values.upstreamConcurrency.providerLimits = [makeProviderEntry({ provider: '', limit: '5' })];

    const errors = getVisualConfigValidationErrors(values);

    expect(errors['upstreamConcurrency.providers']).toBe('provider_limit_provider_required');
  });

  it('flags provider_limit_duplicate when two entries share a provider (case-insensitive)', () => {
    const values = baseValues();
    values.upstreamConcurrency.providerLimits = [
      makeProviderEntry({ id: 'a', provider: 'Gemini', limit: '1' }),
      makeProviderEntry({ id: 'b', provider: 'gemini', limit: '2' }),
    ];

    const errors = getVisualConfigValidationErrors(values);

    expect(errors['upstreamConcurrency.providers']).toBe('provider_limit_duplicate');
  });

  it('flags provider_limit_invalid when a provider has no limit', () => {
    const values = baseValues();
    values.upstreamConcurrency.providerLimits = [
      makeProviderEntry({ provider: 'openai', limit: '' }),
    ];

    const errors = getVisualConfigValidationErrors(values);

    expect(errors['upstreamConcurrency.providers']).toBe('provider_limit_invalid');
  });

  it('flags provider_limit_invalid when a provider limit is negative', () => {
    const values = baseValues();
    values.upstreamConcurrency.providerLimits = [
      makeProviderEntry({ provider: 'openai', limit: '-3' }),
    ];

    const errors = getVisualConfigValidationErrors(values);

    expect(errors['upstreamConcurrency.providers']).toBe('provider_limit_invalid');
  });

  it('ignores fully-empty provider rows', () => {
    const values = baseValues();
    values.upstreamConcurrency.providerLimits = [
      makeProviderEntry({ provider: '', limit: '' }),
      makeProviderEntry({ id: 'ok', provider: 'openai', limit: '4' }),
    ];

    const errors = getVisualConfigValidationErrors(values);

    expect(errors['upstreamConcurrency.providers']).toBeUndefined();
  });

  it('reports the first error among multiple provider rows', () => {
    const values = baseValues();
    values.upstreamConcurrency.providerLimits = [
      makeProviderEntry({ id: 'a', provider: 'openai', limit: '1' }),
      makeProviderEntry({ id: 'b', provider: '', limit: '2' }),
    ];

    const errors = getVisualConfigValidationErrors(values);

    expect(errors['upstreamConcurrency.providers']).toBe('provider_limit_provider_required');
  });
});

describe('useVisualConfig initial state', () => {
  it('exposes the default visual values on mount', () => {
    const { result } = renderHook(() => useVisualConfig());

    expect(result.current.visualValues).toEqual(DEFAULT_VISUAL_VALUES);
  });

  it('is not dirty on mount', () => {
    const { result } = renderHook(() => useVisualConfig());

    expect(result.current.visualDirty).toBe(false);
  });

  it('has no parse error on mount', () => {
    const { result } = renderHook(() => useVisualConfig());

    expect(result.current.visualParseError).toBeNull();
  });

  it('reports no payload validation errors on mount', () => {
    const { result } = renderHook(() => useVisualConfig());

    expect(result.current.visualHasPayloadValidationErrors).toBe(false);
  });
});

describe('useVisualConfig loadVisualValuesFromYaml', () => {
  it('returns ok and populates scalar values from valid YAML', () => {
    const { result } = renderHook(() => useVisualConfig());

    let outcome: { ok: boolean } | undefined;
    act(() => {
      outcome = result.current.loadVisualValuesFromYaml('host: 0.0.0.0\nport: 8317\n');
    });

    expect(outcome).toEqual({ ok: true });
    expect(result.current.visualValues.host).toBe('0.0.0.0');
    expect(result.current.visualValues.port).toBe('8317');
  });

  it('clears dirty state after a successful load', () => {
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      result.current.setVisualValues({ host: 'changed' });
    });
    act(() => {
      result.current.loadVisualValuesFromYaml('host: fresh\n');
    });

    expect(result.current.visualDirty).toBe(false);
  });

  it('coerces a numeric port into a string value', () => {
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      result.current.loadVisualValuesFromYaml('port: 8080\n');
    });

    expect(result.current.visualValues.port).toBe('8080');
  });

  it('parses nested tls booleans and strings', () => {
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      result.current.loadVisualValuesFromYaml(
        'tls:\n  enable: true\n  cert: /c.pem\n  key: /k.pem\n'
      );
    });

    expect(result.current.visualValues.tlsEnable).toBe(true);
    expect(result.current.visualValues.tlsCert).toBe('/c.pem');
    expect(result.current.visualValues.tlsKey).toBe('/k.pem');
  });

  it('defaults quota toggles to true when the quota-exceeded block is absent', () => {
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      result.current.loadVisualValuesFromYaml('host: x\n');
    });

    expect(result.current.visualValues.quotaSwitchProject).toBe(true);
    expect(result.current.visualValues.quotaSwitchPreviewModel).toBe(true);
  });

  it('reads explicit quota-exceeded false values', () => {
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      result.current.loadVisualValuesFromYaml(
        'quota-exceeded:\n  switch-project: false\n  switch-preview-model: false\n'
      );
    });

    expect(result.current.visualValues.quotaSwitchProject).toBe(false);
    expect(result.current.visualValues.quotaSwitchPreviewModel).toBe(false);
  });

  it('parses api-keys from a plain string list', () => {
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      result.current.loadVisualValuesFromYaml('api-keys:\n  - key-one\n  - key-two\n');
    });

    expect(result.current.visualValues.apiKeysText).toBe('key-one\nkey-two');
  });

  it('extracts api-keys from object entries with an api-key field', () => {
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      result.current.loadVisualValuesFromYaml('api-keys:\n  - api-key: obj-key\n  - plain-key\n');
    });

    expect(result.current.visualValues.apiKeysText).toBe('obj-key\nplain-key');
  });

  it('falls back to the config-api-key provider api-key-entries when top-level api-keys is absent', () => {
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      result.current.loadVisualValuesFromYaml(
        'auth:\n  providers:\n    config-api-key:\n      api-key-entries:\n        - nested-key\n'
      );
    });

    expect(result.current.visualValues.apiKeysText).toBe('nested-key');
  });

  it('maps disable-image-generation "chat" to the chat mode', () => {
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      result.current.loadVisualValuesFromYaml('disable-image-generation: chat\n');
    });

    expect(result.current.visualValues.disableImageGeneration).toBe('chat');
  });

  it('maps disable-image-generation "passthrough" to the passthrough mode', () => {
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      result.current.loadVisualValuesFromYaml('disable-image-generation: passthrough\n');
    });

    expect(result.current.visualValues.disableImageGeneration).toBe('passthrough');
  });

  it('maps disable-image-generation true boolean to the "true" mode', () => {
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      result.current.loadVisualValuesFromYaml('disable-image-generation: true\n');
    });

    expect(result.current.visualValues.disableImageGeneration).toBe('true');
  });

  it('maps an unknown disable-image-generation value to "false"', () => {
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      result.current.loadVisualValuesFromYaml('disable-image-generation: nonsense\n');
    });

    expect(result.current.visualValues.disableImageGeneration).toBe('false');
  });

  it('selects fill-first routing strategy when configured', () => {
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      result.current.loadVisualValuesFromYaml('routing:\n  strategy: fill-first\n');
    });

    expect(result.current.visualValues.routingStrategy).toBe('fill-first');
  });

  it('falls back to round-robin for an unrecognized routing strategy', () => {
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      result.current.loadVisualValuesFromYaml('routing:\n  strategy: weird\n');
    });

    expect(result.current.visualValues.routingStrategy).toBe('round-robin');
  });

  it('sorts provider limits alphabetically by provider name', () => {
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      result.current.loadVisualValuesFromYaml(
        'upstream-concurrency:\n  providers:\n    zeta: 3\n    alpha: 1\n'
      );
    });

    const providers = result.current.visualValues.upstreamConcurrency.providerLimits.map(
      (e) => e.provider
    );
    expect(providers).toEqual(['alpha', 'zeta']);
  });

  it('parses payload default rules with typed param values', () => {
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      result.current.loadVisualValuesFromYaml(
        'payload:\n  default:\n    - models:\n        - gpt-4\n      params:\n        temperature: 0.7\n'
      );
    });

    const rule = result.current.visualValues.payloadDefaultRules[0];
    expect(rule.models[0].name).toBe('gpt-4');
    expect(rule.params[0]).toMatchObject({
      path: 'temperature',
      valueType: 'number',
      value: '0.7',
    });
  });

  it('reports a parse error for invalid YAML', () => {
    const { result } = renderHook(() => useVisualConfig());

    let outcome: { ok: boolean; error?: string } | undefined;
    act(() => {
      outcome = result.current.loadVisualValuesFromYaml('foo:\n  - bar\n - baz\n');
    });

    expect(outcome?.ok).toBe(false);
    expect(result.current.visualParseError).not.toBeNull();
  });

  it('treats empty YAML as an empty object and resets to defaults', () => {
    const { result } = renderHook(() => useVisualConfig());

    let outcome: { ok: boolean } | undefined;
    act(() => {
      outcome = result.current.loadVisualValuesFromYaml('');
    });

    expect(outcome).toEqual({ ok: true });
    expect(result.current.visualValues).toEqual(DEFAULT_VISUAL_VALUES);
  });

  it('treats a YAML scalar (non-map) document as an empty object', () => {
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      result.current.loadVisualValuesFromYaml('just-a-string\n');
    });

    expect(result.current.visualValues.host).toBe('');
  });
});

describe('useVisualConfig setVisualValues and dirty tracking', () => {
  it('becomes dirty after changing a top-level field away from baseline', () => {
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      result.current.setVisualValues({ host: '127.0.0.1' });
    });

    expect(result.current.visualDirty).toBe(true);
  });

  it('returns to not-dirty when a field is set back to its baseline value', () => {
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      result.current.setVisualValues({ host: '127.0.0.1' });
    });
    act(() => {
      result.current.setVisualValues({ host: '' });
    });

    expect(result.current.visualDirty).toBe(false);
  });

  it('merges nested streaming patches without dropping sibling fields', () => {
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      result.current.setVisualValues({ streaming: { keepaliveSeconds: '30' } as never });
    });

    expect(result.current.visualValues.streaming.keepaliveSeconds).toBe('30');
    expect(result.current.visualValues.streaming.bootstrapRetries).toBe('');
    expect(result.current.visualValues.streaming.nonstreamKeepaliveInterval).toBe('');
  });

  it('tracks nested streaming dirtiness independently per field', () => {
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      result.current.setVisualValues({ streaming: { keepaliveSeconds: '30' } as never });
    });
    act(() => {
      result.current.setVisualValues({ streaming: { keepaliveSeconds: '' } as never });
    });

    expect(result.current.visualDirty).toBe(false);
  });

  it('merges nested claudeHeaderDefaults patches', () => {
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      result.current.setVisualValues({
        claudeHeaderDefaults: { userAgent: 'agent/1' } as never,
      });
    });

    expect(result.current.visualValues.claudeHeaderDefaults.userAgent).toBe('agent/1');
    expect(result.current.visualValues.claudeHeaderDefaults.os).toBe('');
  });

  it('tracks provider-limit dirtiness via value comparison rather than identity', () => {
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      result.current.setVisualValues({
        upstreamConcurrency: {
          ...DEFAULT_VISUAL_VALUES.upstreamConcurrency,
          providerLimits: [makeProviderEntry({ provider: 'openai', limit: '5' })],
        },
      });
    });

    expect(result.current.visualDirty).toBe(true);
  });

  it('treats provider-limit reordering with the same content as not dirty', () => {
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      result.current.loadVisualValuesFromYaml(
        'upstream-concurrency:\n  providers:\n    alpha: 1\n    zeta: 2\n'
      );
    });
    const loaded = result.current.visualValues.upstreamConcurrency.providerLimits;
    act(() => {
      result.current.setVisualValues({
        upstreamConcurrency: {
          ...result.current.visualValues.upstreamConcurrency,
          providerLimits: [loaded[1], loaded[0]],
        },
      });
    });

    expect(result.current.visualDirty).toBe(false);
  });

  it('recomputes validation errors after a value change', () => {
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      result.current.setVisualValues({ port: '99999' });
    });

    expect(result.current.visualValidationErrors.port).toBe('port_range');
  });

  it('flags payload validation errors after setting an invalid param', () => {
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      result.current.setVisualValues({
        payloadDefaultRules: [
          {
            id: 'r1',
            models: [{ id: 'm1', name: 'gpt-4' }],
            params: [makeParam({ valueType: 'number', value: 'not-a-number' })],
          },
        ],
      });
    });

    expect(result.current.visualHasPayloadValidationErrors).toBe(true);
  });
});

describe('useVisualConfig applyVisualChangesToYaml', () => {
  it('returns the original YAML unchanged when the input is invalid', () => {
    const { result } = renderHook(() => useVisualConfig());
    const invalid = 'foo:\n  - bar\n - baz\n';

    let output = '';
    act(() => {
      output = result.current.applyVisualChangesToYaml(invalid);
    });

    expect(output).toBe(invalid);
  });

  it('writes a changed host into the YAML output', () => {
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      result.current.setVisualValues({ host: '127.0.0.1' });
    });
    let output = '';
    act(() => {
      output = result.current.applyVisualChangesToYaml('host: 0.0.0.0\n');
    });

    expect(parseYaml(output).host).toBe('127.0.0.1');
  });

  it('writes the port as a YAML integer, not a string', () => {
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      result.current.setVisualValues({ port: '9000' });
    });
    let output = '';
    act(() => {
      output = result.current.applyVisualChangesToYaml('port: 8317\n');
    });

    expect(parseYaml(output).port).toBe(9000);
  });

  it('deletes the port key when the port value is cleared', () => {
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      result.current.loadVisualValuesFromYaml('port: 8317\n');
    });
    act(() => {
      result.current.setVisualValues({ port: '' });
    });
    let output = '';
    act(() => {
      output = result.current.applyVisualChangesToYaml('port: 8317\n');
    });

    expect(Object.prototype.hasOwnProperty.call(parseYaml(output) ?? {}, 'port')).toBe(false);
  });

  it('does not write a non-integer port (leaves the original value)', () => {
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      result.current.setVisualValues({ port: '80.5' });
    });
    let output = '';
    act(() => {
      output = result.current.applyVisualChangesToYaml('port: 8317\n');
    });

    expect(parseYaml(output).port).toBe(8317);
  });

  it('serializes api-keys as a plain string sequence', () => {
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      result.current.setVisualValues({ apiKeysText: 'k1\nk2' });
    });
    let output = '';
    act(() => {
      output = result.current.applyVisualChangesToYaml('');
    });

    expect(parseYaml(output)['api-keys']).toEqual(['k1', 'k2']);
  });

  it('trims and drops blank lines when serializing api-keys', () => {
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      result.current.setVisualValues({ apiKeysText: '  k1  \n\n  k2\n   \n' });
    });
    let output = '';
    act(() => {
      output = result.current.applyVisualChangesToYaml('');
    });

    expect(parseYaml(output)['api-keys']).toEqual(['k1', 'k2']);
  });

  it('removes the api-keys key when the text is cleared', () => {
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      result.current.loadVisualValuesFromYaml('api-keys:\n  - k1\n');
    });
    act(() => {
      result.current.setVisualValues({ apiKeysText: '' });
    });
    let output = '';
    act(() => {
      output = result.current.applyVisualChangesToYaml('api-keys:\n  - k1\n');
    });

    expect(Object.prototype.hasOwnProperty.call(parseYaml(output) ?? {}, 'api-keys')).toBe(false);
  });

  it('migrates the legacy config-api-key provider into top-level api-keys', () => {
    const { result } = renderHook(() => useVisualConfig());
    const legacy =
      'auth:\n  providers:\n    config-api-key:\n      api-keys:\n        - legacy-key\n';

    act(() => {
      result.current.loadVisualValuesFromYaml(legacy);
    });
    let output = '';
    act(() => {
      output = result.current.applyVisualChangesToYaml(legacy);
    });

    const parsed = parseYaml(output) ?? {};
    expect(parsed['api-keys']).toEqual(['legacy-key']);
    expect(Object.prototype.hasOwnProperty.call(parsed, 'auth')).toBe(false);
  });

  it('writes disable-image-generation "chat" as the chat string', () => {
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      result.current.setVisualValues({ disableImageGeneration: 'chat' });
    });
    let output = '';
    act(() => {
      output = result.current.applyVisualChangesToYaml('');
    });

    expect(parseYaml(output)['disable-image-generation']).toBe('chat');
  });

  it('writes disable-image-generation "passthrough" as the passthrough string', () => {
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      result.current.setVisualValues({ disableImageGeneration: 'passthrough' });
    });
    let output = '';
    act(() => {
      output = result.current.applyVisualChangesToYaml('');
    });

    expect(parseYaml(output)['disable-image-generation']).toBe('passthrough');
  });

  it('writes disable-image-generation "true" as a boolean true', () => {
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      result.current.setVisualValues({ disableImageGeneration: 'true' });
    });
    let output = '';
    act(() => {
      output = result.current.applyVisualChangesToYaml('');
    });

    expect(parseYaml(output)['disable-image-generation']).toBe(true);
  });

  it('does not create disable-image-generation when untouched and absent', () => {
    const { result } = renderHook(() => useVisualConfig());

    let output = '';
    act(() => {
      output = result.current.applyVisualChangesToYaml('host: x\n');
    });

    expect(
      Object.prototype.hasOwnProperty.call(parseYaml(output) ?? {}, 'disable-image-generation')
    ).toBe(false);
  });

  it('serializes provider limits into a lowercased provider map', () => {
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      result.current.setVisualValues({
        upstreamConcurrency: {
          defaultLimit: '',
          queueTimeoutSeconds: '',
          providerLimits: [makeProviderEntry({ provider: 'OpenAI', limit: '7' })],
        },
      });
    });
    let output = '';
    act(() => {
      output = result.current.applyVisualChangesToYaml('');
    });

    expect(parseYaml(output)['upstream-concurrency'].providers).toEqual({ openai: 7 });
  });

  it('writes routing strategy and session affinity together', () => {
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      result.current.setVisualValues({
        routingStrategy: 'fill-first',
        routingSessionAffinity: true,
        routingSessionAffinityTTL: '60s',
      });
    });
    let output = '';
    act(() => {
      output = result.current.applyVisualChangesToYaml('');
    });

    const routing = parseYaml(output).routing;
    expect(routing).toEqual({
      strategy: 'fill-first',
      'session-affinity': true,
      'session-affinity-ttl': '60s',
    });
  });

  it('serializes payload default rules with coerced number params', () => {
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      result.current.setVisualValues({
        payloadDefaultRules: [
          {
            id: 'r1',
            models: [{ id: 'm1', name: 'gpt-4', protocol: 'openai' }],
            params: [makeParam({ valueType: 'number', value: '0.7' })],
          },
        ],
      });
    });
    let output = '';
    act(() => {
      output = result.current.applyVisualChangesToYaml('');
    });

    expect(parseYaml(output).payload.default).toEqual([
      {
        models: [{ name: 'gpt-4', protocol: 'openai' }],
        params: { temperature: 0.7 },
      },
    ]);
  });

  it('drops payload rules that have no named models from the serialized array', () => {
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      result.current.setVisualValues({
        payloadDefaultRules: [
          {
            id: 'r1',
            models: [{ id: 'm1', name: '   ' }],
            params: [makeParam({ valueType: 'string', value: 'x' })],
          },
        ],
      });
    });
    let output = '';
    act(() => {
      output = result.current.applyVisualChangesToYaml('host: x\n');
    });

    // The blank-named rule is filtered out, but because the outer guard checks the
    // unfiltered rule count the empty `payload.default: []` block is still materialized.
    expect(parseYaml(output).payload).toEqual({ default: [] });
  });
});

describe('useVisualConfig load -> apply roundtrip', () => {
  it('preserves scalar values through a load/serialize cycle', () => {
    const { result } = renderHook(() => useVisualConfig());
    const yaml = 'host: 1.2.3.4\nport: 8317\ndebug: true\nproxy-url: http://proxy:8080\n';

    act(() => {
      result.current.loadVisualValuesFromYaml(yaml);
    });
    let output = '';
    act(() => {
      output = result.current.applyVisualChangesToYaml(yaml);
    });

    expect(parseYaml(output)).toEqual({
      host: '1.2.3.4',
      port: 8317,
      debug: true,
      'proxy-url': 'http://proxy:8080',
    });
  });

  it('preserves nested upstream-concurrency through a load/serialize cycle', () => {
    const { result } = renderHook(() => useVisualConfig());
    const yaml =
      'upstream-concurrency:\n  default: 10\n  queue-timeout-seconds: 30\n  providers:\n    gemini: 5\n    openai: 8\n';

    act(() => {
      result.current.loadVisualValuesFromYaml(yaml);
    });
    let output = '';
    act(() => {
      output = result.current.applyVisualChangesToYaml(yaml);
    });

    expect(parseYaml(output)['upstream-concurrency']).toEqual({
      default: 10,
      'queue-timeout-seconds': 30,
      providers: { gemini: 5, openai: 8 },
    });
  });

  it('preserves payload filter rules through a load/serialize cycle', () => {
    const { result } = renderHook(() => useVisualConfig());
    const yaml =
      'payload:\n  filter:\n    - models:\n        - name: gpt-4\n      params:\n        - top_p\n        - logprobs\n';

    act(() => {
      result.current.loadVisualValuesFromYaml(yaml);
    });
    let output = '';
    act(() => {
      output = result.current.applyVisualChangesToYaml(yaml);
    });

    expect(parseYaml(output).payload.filter).toEqual([
      {
        models: [{ name: 'gpt-4' }],
        params: ['top_p', 'logprobs'],
      },
    ]);
  });

  it('preserves header defaults through a load/serialize cycle', () => {
    const { result } = renderHook(() => useVisualConfig());
    const yaml =
      'claude-header-defaults:\n  user-agent: claude-cli/1.0\n  stabilize-device-profile: true\n';

    act(() => {
      result.current.loadVisualValuesFromYaml(yaml);
    });
    let output = '';
    act(() => {
      output = result.current.applyVisualChangesToYaml(yaml);
    });

    const parsed = parseYaml(output)['claude-header-defaults'];
    expect(parsed['user-agent']).toBe('claude-cli/1.0');
    expect(parsed['stabilize-device-profile']).toBe(true);
  });

  it('preserves quota-exceeded defaults (true) when serializing an empty config', () => {
    const { result } = renderHook(() => useVisualConfig());

    act(() => {
      result.current.loadVisualValuesFromYaml('');
    });
    let output = '';
    act(() => {
      output = result.current.applyVisualChangesToYaml('');
    });

    expect(Object.prototype.hasOwnProperty.call(parseYaml(output) ?? {}, 'quota-exceeded')).toBe(
      false
    );
  });
});
