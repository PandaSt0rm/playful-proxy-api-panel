import { describe, it, expect, beforeEach } from 'vitest';

import { useClaudeEditDraftStore } from './useClaudeEditDraftStore';
import type { ClaudeEditBaseline } from './useClaudeEditDraftStore';
import type { ProviderFormState } from '@/components/providers/types';

// The store is a module-level singleton. Reset it to a known-empty state before
// each test so tests stay isolated and order-independent.
beforeEach(() => {
  useClaudeEditDraftStore.setState({ drafts: {}, refCounts: {} });
});

const get = () => useClaudeEditDraftStore.getState();

const buildBaseline = (overrides: Partial<ClaudeEditBaseline> = {}): ClaudeEditBaseline => ({
  apiKey: 'sk-ant-123',
  priority: 5,
  prefix: 'pre',
  baseUrl: 'https://api.anthropic.com',
  proxyUrl: '',
  headers: [{ key: 'X-Test', value: '1' }],
  models: [{ name: 'claude-3', alias: 'c3' }],
  excludedModels: ['old-model'],
  disableCooling: false,
  experimentalCCHSigning: null,
  cloak: null,
  ...overrides,
});

const EMPTY_FORM: ProviderFormState = {
  apiKey: '',
  prefix: '',
  baseUrl: '',
  proxyUrl: '',
  headers: [],
  models: [],
  excludedModels: [],
  modelEntries: [{ name: '', alias: '' }],
  excludedText: '',
  disableCooling: undefined,
  experimentalCCHSigning: undefined,
};

describe('useClaudeEditDraftStore initial state', () => {
  it('starts with no drafts', () => {
    const { drafts } = get();

    expect(drafts).toEqual({});
  });

  it('starts with no ref counts', () => {
    const { refCounts } = get();

    expect(refCounts).toEqual({});
  });
});

describe('useClaudeEditDraftStore acquireDraft', () => {
  it('creates an empty uninitialized draft on first acquire', () => {
    get().acquireDraft('claude:new');

    expect(get().drafts['claude:new']).toEqual({
      initialized: false,
      baseline: null,
      form: EMPTY_FORM,
      testModel: '',
      testStatus: 'idle',
      testMessage: '',
    });
  });

  it('sets the ref count to 1 on first acquire', () => {
    get().acquireDraft('claude:new');

    expect(get().refCounts['claude:new']).toBe(1);
  });

  it('increments the ref count to 2 on second acquire', () => {
    get().acquireDraft('claude:new');
    get().acquireDraft('claude:new');

    expect(get().refCounts['claude:new']).toBe(2);
  });

  it('preserves the existing draft contents across a second acquire', () => {
    get().acquireDraft('claude:0');
    get().setDraftTestModel('claude:0', 'claude-3-opus');

    get().acquireDraft('claude:0');

    expect(get().drafts['claude:0'].testModel).toBe('claude-3-opus');
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

describe('useClaudeEditDraftStore releaseDraft', () => {
  it('decrements the ref count from 2 to 1', () => {
    get().acquireDraft('claude:0');
    get().acquireDraft('claude:0');

    get().releaseDraft('claude:0');

    expect(get().refCounts['claude:0']).toBe(1);
  });

  it('keeps the draft alive while the ref count is above zero', () => {
    get().acquireDraft('claude:0');
    get().acquireDraft('claude:0');

    get().releaseDraft('claude:0');

    expect(get().drafts['claude:0']).toBeDefined();
  });

  it('deletes the draft when the last reference is released', () => {
    get().acquireDraft('claude:0');

    get().releaseDraft('claude:0');

    expect(get().drafts['claude:0']).toBeUndefined();
  });

  it('deletes the ref count entry when the last reference is released', () => {
    get().acquireDraft('claude:0');

    get().releaseDraft('claude:0');

    expect(get().refCounts['claude:0']).toBeUndefined();
  });

  it('is a no-op when releasing an unknown key', () => {
    get().acquireDraft('claude:0');

    get().releaseDraft('claude:unknown');

    expect(get().refCounts['claude:0']).toBe(1);
  });

  it('ignores an empty key', () => {
    get().acquireDraft('claude:0');

    get().releaseDraft('');

    expect(get().refCounts['claude:0']).toBe(1);
  });
});

describe('useClaudeEditDraftStore ensureDraft', () => {
  it('creates an empty draft when none exists', () => {
    get().ensureDraft('claude:0');

    expect(get().drafts['claude:0']).toEqual({
      initialized: false,
      baseline: null,
      form: EMPTY_FORM,
      testModel: '',
      testStatus: 'idle',
      testMessage: '',
    });
  });

  it('does not register a ref count', () => {
    get().ensureDraft('claude:0');

    expect(get().refCounts['claude:0']).toBeUndefined();
  });

  it('preserves an existing draft instead of replacing it', () => {
    get().acquireDraft('claude:0');
    get().setDraftTestMessage('claude:0', 'hello');

    get().ensureDraft('claude:0');

    expect(get().drafts['claude:0'].testMessage).toBe('hello');
  });

  it('ignores an empty key', () => {
    get().ensureDraft('');

    expect(get().drafts).toEqual({});
  });
});

describe('useClaudeEditDraftStore initDraft', () => {
  it('stores the provided draft fields marked as initialized', () => {
    const baseline = buildBaseline();

    get().initDraft('claude:0', {
      baseline,
      form: { ...EMPTY_FORM, apiKey: 'sk-ant-123' },
      testModel: 'claude-3',
      testStatus: 'idle',
      testMessage: '',
    });

    expect(get().drafts['claude:0']).toEqual({
      initialized: true,
      baseline,
      form: { ...EMPTY_FORM, apiKey: 'sk-ant-123' },
      testModel: 'claude-3',
      testStatus: 'idle',
      testMessage: '',
    });
  });

  it('does not overwrite an already-initialized draft', () => {
    get().initDraft('claude:0', {
      baseline: buildBaseline({ apiKey: 'first' }),
      form: EMPTY_FORM,
      testModel: 'first-model',
      testStatus: 'idle',
      testMessage: '',
    });

    get().initDraft('claude:0', {
      baseline: buildBaseline({ apiKey: 'second' }),
      form: EMPTY_FORM,
      testModel: 'second-model',
      testStatus: 'idle',
      testMessage: '',
    });

    expect(get().drafts['claude:0'].testModel).toBe('first-model');
  });

  it('initializes a draft that was only acquired (uninitialized) before', () => {
    get().acquireDraft('claude:0');

    get().initDraft('claude:0', {
      baseline: null,
      form: EMPTY_FORM,
      testModel: 'late-init',
      testStatus: 'idle',
      testMessage: '',
    });

    expect(get().drafts['claude:0'].testModel).toBe('late-init');
  });

  it('ignores an empty key', () => {
    get().initDraft('', {
      baseline: null,
      form: EMPTY_FORM,
      testModel: 'x',
      testStatus: 'idle',
      testMessage: '',
    });

    expect(get().drafts).toEqual({});
  });
});

describe('useClaudeEditDraftStore setDraftBaseline', () => {
  it('sets the baseline on a fresh draft', () => {
    const baseline = buildBaseline();

    get().setDraftBaseline('claude:0', baseline);

    expect(get().drafts['claude:0'].baseline).toEqual(baseline);
  });

  it('marks the draft as initialized', () => {
    get().setDraftBaseline('claude:0', buildBaseline());

    expect(get().drafts['claude:0'].initialized).toBe(true);
  });

  it('leaves the form at its empty default when creating the draft', () => {
    get().setDraftBaseline('claude:0', buildBaseline());

    expect(get().drafts['claude:0'].form).toEqual(EMPTY_FORM);
  });

  it('ignores an empty key', () => {
    get().setDraftBaseline('', buildBaseline());

    expect(get().drafts).toEqual({});
  });
});

describe('useClaudeEditDraftStore setDraftForm', () => {
  it('replaces the form with a direct value', () => {
    const nextForm: ProviderFormState = { ...EMPTY_FORM, apiKey: 'sk-direct' };

    get().setDraftForm('claude:0', nextForm);

    expect(get().drafts['claude:0'].form).toEqual(nextForm);
  });

  it('applies a functional updater against the previous form', () => {
    get().setDraftForm('claude:0', { ...EMPTY_FORM, prefix: 'base' });

    get().setDraftForm('claude:0', (prev) => ({ ...prev, baseUrl: 'https://x' }));

    expect(get().drafts['claude:0'].form).toEqual({
      ...EMPTY_FORM,
      prefix: 'base',
      baseUrl: 'https://x',
    });
  });

  it('applies the functional updater against the empty default for a missing draft', () => {
    get().setDraftForm('claude:0', (prev) => ({ ...prev, apiKey: 'from-default' }));

    expect(get().drafts['claude:0'].form).toEqual({ ...EMPTY_FORM, apiKey: 'from-default' });
  });

  it('marks the draft as initialized', () => {
    get().setDraftForm('claude:0', EMPTY_FORM);

    expect(get().drafts['claude:0'].initialized).toBe(true);
  });

  it('ignores an empty key', () => {
    get().setDraftForm('', EMPTY_FORM);

    expect(get().drafts).toEqual({});
  });
});

describe('useClaudeEditDraftStore setDraftTestModel', () => {
  it('sets the test model with a direct value', () => {
    get().setDraftTestModel('claude:0', 'claude-3-haiku');

    expect(get().drafts['claude:0'].testModel).toBe('claude-3-haiku');
  });

  it('applies a functional updater against the previous value', () => {
    get().setDraftTestModel('claude:0', 'claude');

    get().setDraftTestModel('claude:0', (prev) => `${prev}-3`);

    expect(get().drafts['claude:0'].testModel).toBe('claude-3');
  });

  it('ignores an empty key', () => {
    get().setDraftTestModel('', 'x');

    expect(get().drafts).toEqual({});
  });
});

describe('useClaudeEditDraftStore setDraftTestStatus', () => {
  it('sets the test status with a direct value', () => {
    get().setDraftTestStatus('claude:0', 'loading');

    expect(get().drafts['claude:0'].testStatus).toBe('loading');
  });

  it('applies a functional updater against the previous status', () => {
    get().setDraftTestStatus('claude:0', 'loading');

    get().setDraftTestStatus('claude:0', (prev) => (prev === 'loading' ? 'success' : 'error'));

    expect(get().drafts['claude:0'].testStatus).toBe('success');
  });

  it('ignores an empty key', () => {
    get().setDraftTestStatus('', 'error');

    expect(get().drafts).toEqual({});
  });
});

describe('useClaudeEditDraftStore setDraftTestMessage', () => {
  it('sets the test message with a direct value', () => {
    get().setDraftTestMessage('claude:0', 'all good');

    expect(get().drafts['claude:0'].testMessage).toBe('all good');
  });

  it('applies a functional updater against the previous message', () => {
    get().setDraftTestMessage('claude:0', 'ok');

    get().setDraftTestMessage('claude:0', (prev) => `${prev}!`);

    expect(get().drafts['claude:0'].testMessage).toBe('ok!');
  });

  it('ignores an empty key', () => {
    get().setDraftTestMessage('', 'x');

    expect(get().drafts).toEqual({});
  });
});

describe('useClaudeEditDraftStore clearDraft', () => {
  it('removes the draft entry', () => {
    get().acquireDraft('claude:0');

    get().clearDraft('claude:0');

    expect(get().drafts['claude:0']).toBeUndefined();
  });

  it('removes the ref count entry regardless of count', () => {
    get().acquireDraft('claude:0');
    get().acquireDraft('claude:0');

    get().clearDraft('claude:0');

    expect(get().refCounts['claude:0']).toBeUndefined();
  });

  it('leaves other drafts untouched', () => {
    get().acquireDraft('claude:0');
    get().acquireDraft('claude:1');

    get().clearDraft('claude:0');

    expect(get().drafts['claude:1']).toBeDefined();
  });

  it('is a no-op when neither a draft nor a ref count exists for the key', () => {
    const before = get().drafts;

    get().clearDraft('claude:never');

    expect(get().drafts).toBe(before);
  });

  it('ignores an empty key', () => {
    get().acquireDraft('claude:0');

    get().clearDraft('');

    expect(get().drafts['claude:0']).toBeDefined();
  });
});

describe('useClaudeEditDraftStore key isolation', () => {
  it('keeps independent drafts per key', () => {
    get().setDraftTestModel('claude:0', 'model-a');
    get().setDraftTestModel('claude:1', 'model-b');

    expect(get().drafts['claude:0'].testModel).toBe('model-a');
  });

  it('does not leak a value from one key into another', () => {
    get().setDraftTestModel('claude:0', 'model-a');
    get().setDraftTestModel('claude:1', 'model-b');

    expect(get().drafts['claude:1'].testModel).toBe('model-b');
  });
});
