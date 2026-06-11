import { describe, it, expect, beforeEach } from 'vitest';

import { useOpenAIEditDraftStore } from './useOpenAIEditDraftStore';
import type { OpenAIEditBaseline, KeyTestStatus } from './useOpenAIEditDraftStore';
import type { OpenAIFormState } from '@/components/providers/types';

// The store is a module-level singleton. Reset it to a known-empty state before
// each test so tests stay isolated and order-independent.
beforeEach(() => {
  useOpenAIEditDraftStore.setState({ drafts: {}, refCounts: {} });
});

const get = () => useOpenAIEditDraftStore.getState();

// buildEmptyForm seeds a single empty ApiKeyEntry via buildApiKeyEntry() and a
// single blank model entry, computed independently from the source defaults.
const EMPTY_FORM: OpenAIFormState = {
  name: '',
  prefix: '',
  baseUrl: '',
  headers: [],
  apiKeyEntries: [{ apiKey: '', proxyUrl: '', headers: {} }],
  modelEntries: [{ name: '', alias: '' }],
  testModel: undefined,
  disableCooling: undefined,
};

const buildBaseline = (overrides: Partial<OpenAIEditBaseline> = {}): OpenAIEditBaseline => ({
  name: 'My Provider',
  priority: 3,
  prefix: 'pre',
  baseUrl: 'https://api.openai.com',
  headers: [{ key: 'X-Test', value: '1' }],
  apiKeyEntries: [{ apiKey: 'sk-1', proxyUrl: '', headers: [] }],
  models: [{ name: 'gpt-4', alias: 'g4' }],
  testModel: 'gpt-4',
  disableCooling: false,
  ...overrides,
});

describe('useOpenAIEditDraftStore initial state', () => {
  it('starts with no drafts', () => {
    const { drafts } = get();

    expect(drafts).toEqual({});
  });

  it('starts with no ref counts', () => {
    const { refCounts } = get();

    expect(refCounts).toEqual({});
  });
});

describe('useOpenAIEditDraftStore acquireDraft', () => {
  it('creates an empty uninitialized draft on first acquire', () => {
    get().acquireDraft('openai:new');

    expect(get().drafts['openai:new']).toEqual({
      initialized: false,
      baseline: null,
      form: EMPTY_FORM,
      testModel: '',
      testStatus: 'idle',
      testMessage: '',
      keyTestStatuses: [],
    });
  });

  it('sets the ref count to 1 on first acquire', () => {
    get().acquireDraft('openai:new');

    expect(get().refCounts['openai:new']).toBe(1);
  });

  it('increments the ref count to 2 on second acquire', () => {
    get().acquireDraft('openai:new');
    get().acquireDraft('openai:new');

    expect(get().refCounts['openai:new']).toBe(2);
  });

  it('preserves the existing draft contents across a second acquire', () => {
    get().acquireDraft('openai:0');
    get().setDraftTestModel('openai:0', 'gpt-4o');

    get().acquireDraft('openai:0');

    expect(get().drafts['openai:0'].testModel).toBe('gpt-4o');
  });

  it('does not create a draft for an empty key', () => {
    get().acquireDraft('');

    expect(get().drafts).toEqual({});
  });

  it('does not register a ref count for an empty key', () => {
    get().acquireDraft('');

    expect(get().refCounts).toEqual({});
  });
});

describe('useOpenAIEditDraftStore releaseDraft', () => {
  it('decrements the ref count from 2 to 1', () => {
    get().acquireDraft('openai:0');
    get().acquireDraft('openai:0');

    get().releaseDraft('openai:0');

    expect(get().refCounts['openai:0']).toBe(1);
  });

  it('keeps the draft alive while the ref count is above zero', () => {
    get().acquireDraft('openai:0');
    get().acquireDraft('openai:0');

    get().releaseDraft('openai:0');

    expect(get().drafts['openai:0']).toBeDefined();
  });

  it('deletes the draft when the last reference is released', () => {
    get().acquireDraft('openai:0');

    get().releaseDraft('openai:0');

    expect(get().drafts['openai:0']).toBeUndefined();
  });

  it('deletes the ref count entry when the last reference is released', () => {
    get().acquireDraft('openai:0');

    get().releaseDraft('openai:0');

    expect(get().refCounts['openai:0']).toBeUndefined();
  });

  it('is a no-op when releasing an unknown key', () => {
    get().acquireDraft('openai:0');

    get().releaseDraft('openai:unknown');

    expect(get().refCounts['openai:0']).toBe(1);
  });

  it('ignores an empty key', () => {
    get().acquireDraft('openai:0');

    get().releaseDraft('');

    expect(get().refCounts['openai:0']).toBe(1);
  });
});

describe('useOpenAIEditDraftStore ensureDraft', () => {
  it('creates an empty draft when none exists', () => {
    get().ensureDraft('openai:0');

    expect(get().drafts['openai:0']).toEqual({
      initialized: false,
      baseline: null,
      form: EMPTY_FORM,
      testModel: '',
      testStatus: 'idle',
      testMessage: '',
      keyTestStatuses: [],
    });
  });

  it('does not register a ref count', () => {
    get().ensureDraft('openai:0');

    expect(get().refCounts['openai:0']).toBeUndefined();
  });

  it('preserves an existing draft instead of replacing it', () => {
    get().acquireDraft('openai:0');
    get().setDraftTestMessage('openai:0', 'hello');

    get().ensureDraft('openai:0');

    expect(get().drafts['openai:0'].testMessage).toBe('hello');
  });

  it('ignores an empty key', () => {
    get().ensureDraft('');

    expect(get().drafts).toEqual({});
  });
});

describe('useOpenAIEditDraftStore initDraft', () => {
  it('stores the provided draft fields marked as initialized', () => {
    const baseline = buildBaseline();

    get().initDraft('openai:0', {
      baseline,
      form: { ...EMPTY_FORM, name: 'My Provider' },
      testModel: 'gpt-4',
      testStatus: 'idle',
      testMessage: '',
      keyTestStatuses: [],
    });

    expect(get().drafts['openai:0']).toEqual({
      initialized: true,
      baseline,
      form: { ...EMPTY_FORM, name: 'My Provider' },
      testModel: 'gpt-4',
      testStatus: 'idle',
      testMessage: '',
      keyTestStatuses: [],
    });
  });

  it('does not overwrite an already-initialized draft', () => {
    get().initDraft('openai:0', {
      baseline: buildBaseline({ name: 'first' }),
      form: EMPTY_FORM,
      testModel: 'first-model',
      testStatus: 'idle',
      testMessage: '',
      keyTestStatuses: [],
    });

    get().initDraft('openai:0', {
      baseline: buildBaseline({ name: 'second' }),
      form: EMPTY_FORM,
      testModel: 'second-model',
      testStatus: 'idle',
      testMessage: '',
      keyTestStatuses: [],
    });

    expect(get().drafts['openai:0'].testModel).toBe('first-model');
  });

  it('initializes a draft that was only acquired (uninitialized) before', () => {
    get().acquireDraft('openai:0');

    get().initDraft('openai:0', {
      baseline: null,
      form: EMPTY_FORM,
      testModel: 'late-init',
      testStatus: 'idle',
      testMessage: '',
      keyTestStatuses: [],
    });

    expect(get().drafts['openai:0'].testModel).toBe('late-init');
  });

  it('ignores an empty key', () => {
    get().initDraft('', {
      baseline: null,
      form: EMPTY_FORM,
      testModel: 'x',
      testStatus: 'idle',
      testMessage: '',
      keyTestStatuses: [],
    });

    expect(get().drafts).toEqual({});
  });
});

describe('useOpenAIEditDraftStore setDraftBaseline', () => {
  it('sets the baseline on a fresh draft', () => {
    const baseline = buildBaseline();

    get().setDraftBaseline('openai:0', baseline);

    expect(get().drafts['openai:0'].baseline).toEqual(baseline);
  });

  it('marks the draft as initialized', () => {
    get().setDraftBaseline('openai:0', buildBaseline());

    expect(get().drafts['openai:0'].initialized).toBe(true);
  });

  it('leaves the form at its empty default when creating the draft', () => {
    get().setDraftBaseline('openai:0', buildBaseline());

    expect(get().drafts['openai:0'].form).toEqual(EMPTY_FORM);
  });

  it('ignores an empty key', () => {
    get().setDraftBaseline('', buildBaseline());

    expect(get().drafts).toEqual({});
  });
});

describe('useOpenAIEditDraftStore setDraftForm', () => {
  it('replaces the form with a direct value', () => {
    const nextForm: OpenAIFormState = { ...EMPTY_FORM, name: 'Direct' };

    get().setDraftForm('openai:0', nextForm);

    expect(get().drafts['openai:0'].form).toEqual(nextForm);
  });

  it('applies a functional updater against the previous form', () => {
    get().setDraftForm('openai:0', { ...EMPTY_FORM, prefix: 'base' });

    get().setDraftForm('openai:0', (prev) => ({ ...prev, baseUrl: 'https://x' }));

    expect(get().drafts['openai:0'].form).toEqual({
      ...EMPTY_FORM,
      prefix: 'base',
      baseUrl: 'https://x',
    });
  });

  it('applies the functional updater against the empty default for a missing draft', () => {
    get().setDraftForm('openai:0', (prev) => ({ ...prev, name: 'from-default' }));

    expect(get().drafts['openai:0'].form).toEqual({ ...EMPTY_FORM, name: 'from-default' });
  });

  it('marks the draft as initialized', () => {
    get().setDraftForm('openai:0', EMPTY_FORM);

    expect(get().drafts['openai:0'].initialized).toBe(true);
  });

  it('ignores an empty key', () => {
    get().setDraftForm('', EMPTY_FORM);

    expect(get().drafts).toEqual({});
  });
});

describe('useOpenAIEditDraftStore setDraftTestModel', () => {
  it('sets the test model with a direct value', () => {
    get().setDraftTestModel('openai:0', 'gpt-4o-mini');

    expect(get().drafts['openai:0'].testModel).toBe('gpt-4o-mini');
  });

  it('applies a functional updater against the previous value', () => {
    get().setDraftTestModel('openai:0', 'gpt');

    get().setDraftTestModel('openai:0', (prev) => `${prev}-4`);

    expect(get().drafts['openai:0'].testModel).toBe('gpt-4');
  });

  it('ignores an empty key', () => {
    get().setDraftTestModel('', 'x');

    expect(get().drafts).toEqual({});
  });
});

describe('useOpenAIEditDraftStore setDraftTestStatus', () => {
  it('sets the test status with a direct value', () => {
    get().setDraftTestStatus('openai:0', 'loading');

    expect(get().drafts['openai:0'].testStatus).toBe('loading');
  });

  it('applies a functional updater against the previous status', () => {
    get().setDraftTestStatus('openai:0', 'loading');

    get().setDraftTestStatus('openai:0', (prev) => (prev === 'loading' ? 'success' : 'error'));

    expect(get().drafts['openai:0'].testStatus).toBe('success');
  });

  it('ignores an empty key', () => {
    get().setDraftTestStatus('', 'error');

    expect(get().drafts).toEqual({});
  });
});

describe('useOpenAIEditDraftStore setDraftTestMessage', () => {
  it('sets the test message with a direct value', () => {
    get().setDraftTestMessage('openai:0', 'all good');

    expect(get().drafts['openai:0'].testMessage).toBe('all good');
  });

  it('applies a functional updater against the previous message', () => {
    get().setDraftTestMessage('openai:0', 'ok');

    get().setDraftTestMessage('openai:0', (prev) => `${prev}!`);

    expect(get().drafts['openai:0'].testMessage).toBe('ok!');
  });

  it('ignores an empty key', () => {
    get().setDraftTestMessage('', 'x');

    expect(get().drafts).toEqual({});
  });
});

describe('useOpenAIEditDraftStore setDraftKeyTestStatus', () => {
  it('sets the status at the given index on a fresh draft', () => {
    const status: KeyTestStatus = { status: 'success', message: 'ok' };

    get().setDraftKeyTestStatus('openai:0', 0, status);

    expect(get().drafts['openai:0'].keyTestStatuses[0]).toEqual(status);
  });

  it('stores the full response detail fields alongside the status', () => {
    const status: KeyTestStatus = {
      status: 'error',
      message: '400 Unknown Model',
      detail: '{"error":"Unknown Model"}',
      statusCode: 400,
      durationMs: 245,
      model: 'gpt-4o',
    };

    get().setDraftKeyTestStatus('openai:0', 0, status);

    expect(get().drafts['openai:0'].keyTestStatuses[0]).toEqual(status);
  });

  it('marks the draft as initialized', () => {
    get().setDraftKeyTestStatus('openai:0', 0, { status: 'loading', message: '' });

    expect(get().drafts['openai:0'].initialized).toBe(true);
  });

  it('updates only the targeted index, leaving earlier entries intact', () => {
    get().setDraftKeyTestStatus('openai:0', 0, { status: 'success', message: 'first' });

    get().setDraftKeyTestStatus('openai:0', 1, { status: 'error', message: 'second' });

    expect(get().drafts['openai:0'].keyTestStatuses[0]).toEqual({
      status: 'success',
      message: 'first',
    });
  });

  it('overwrites an existing entry at the same index', () => {
    get().setDraftKeyTestStatus('openai:0', 0, { status: 'loading', message: '' });

    get().setDraftKeyTestStatus('openai:0', 0, { status: 'error', message: 'failed' });

    expect(get().drafts['openai:0'].keyTestStatuses[0]).toEqual({
      status: 'error',
      message: 'failed',
    });
  });

  it('creates holes when assigning past the current length', () => {
    get().setDraftKeyTestStatus('openai:0', 2, { status: 'success', message: 'idx2' });

    expect(get().drafts['openai:0'].keyTestStatuses.length).toBe(3);
  });

  it('ignores an empty key', () => {
    get().setDraftKeyTestStatus('', 0, { status: 'success', message: 'ok' });

    expect(get().drafts).toEqual({});
  });
});

describe('useOpenAIEditDraftStore resetDraftKeyTestStatuses', () => {
  it('builds an array of idle statuses of the requested length', () => {
    get().resetDraftKeyTestStatuses('openai:0', 3);

    expect(get().drafts['openai:0'].keyTestStatuses).toEqual([
      { status: 'idle', message: '' },
      { status: 'idle', message: '' },
      { status: 'idle', message: '' },
    ]);
  });

  it('produces an empty array for a count of zero', () => {
    get().resetDraftKeyTestStatuses('openai:0', 0);

    expect(get().drafts['openai:0'].keyTestStatuses).toEqual([]);
  });

  it('discards previously-set per-key statuses', () => {
    get().setDraftKeyTestStatus('openai:0', 0, { status: 'success', message: 'old' });

    get().resetDraftKeyTestStatuses('openai:0', 2);

    expect(get().drafts['openai:0'].keyTestStatuses).toEqual([
      { status: 'idle', message: '' },
      { status: 'idle', message: '' },
    ]);
  });

  it('marks the draft as initialized', () => {
    get().resetDraftKeyTestStatuses('openai:0', 1);

    expect(get().drafts['openai:0'].initialized).toBe(true);
  });

  it('ignores an empty key', () => {
    get().resetDraftKeyTestStatuses('', 2);

    expect(get().drafts).toEqual({});
  });
});

describe('useOpenAIEditDraftStore clearDraft', () => {
  it('removes the draft entry', () => {
    get().acquireDraft('openai:0');

    get().clearDraft('openai:0');

    expect(get().drafts['openai:0']).toBeUndefined();
  });

  it('removes the ref count entry regardless of count', () => {
    get().acquireDraft('openai:0');
    get().acquireDraft('openai:0');

    get().clearDraft('openai:0');

    expect(get().refCounts['openai:0']).toBeUndefined();
  });

  it('leaves other drafts untouched', () => {
    get().acquireDraft('openai:0');
    get().acquireDraft('openai:1');

    get().clearDraft('openai:0');

    expect(get().drafts['openai:1']).toBeDefined();
  });

  it('is a no-op when neither a draft nor a ref count exists for the key', () => {
    const before = get().drafts;

    get().clearDraft('openai:never');

    expect(get().drafts).toBe(before);
  });

  it('ignores an empty key', () => {
    get().acquireDraft('openai:0');

    get().clearDraft('');

    expect(get().drafts['openai:0']).toBeDefined();
  });
});

describe('useOpenAIEditDraftStore key isolation', () => {
  it('keeps independent drafts per key', () => {
    get().setDraftTestModel('openai:0', 'model-a');
    get().setDraftTestModel('openai:1', 'model-b');

    expect(get().drafts['openai:0'].testModel).toBe('model-a');
  });

  it('does not leak a value from one key into another', () => {
    get().setDraftKeyTestStatus('openai:0', 0, { status: 'success', message: 'a' });
    get().setDraftKeyTestStatus('openai:1', 0, { status: 'error', message: 'b' });

    expect(get().drafts['openai:1'].keyTestStatuses[0]).toEqual({ status: 'error', message: 'b' });
  });
});
