import { describe, it, expect, vi, beforeEach } from 'vitest';

import { saveProviderConcurrencyDraft } from './providerConcurrency';
import { configApi } from './config';

vi.mock('./config', () => ({
  configApi: {
    updateUpstreamConcurrencyProvider: vi.fn(),
    deleteUpstreamConcurrencyProvider: vi.fn(),
  },
}));

const mockedUpdate = vi.mocked(configApi.updateUpstreamConcurrencyProvider);
const mockedDelete = vi.mocked(configApi.deleteUpstreamConcurrencyProvider);

beforeEach(() => {
  mockedUpdate.mockReset();
  mockedDelete.mockReset();
  mockedUpdate.mockResolvedValue(undefined);
  mockedDelete.mockResolvedValue(undefined);
});

describe('saveProviderConcurrencyDraft create path', () => {
  it('updates the normalized provider with the parsed limit', async () => {
    await saveProviderConcurrencyDraft({ providerKey: '  OpenAI  ', draftLimit: '5' });

    expect(mockedUpdate).toHaveBeenCalledWith('openai', 5);
  });

  it('does not delete any provider when there is no baseline', async () => {
    await saveProviderConcurrencyDraft({ providerKey: 'openai', draftLimit: '5' });

    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it('parses a zero limit and forwards it as 0', async () => {
    await saveProviderConcurrencyDraft({ providerKey: 'openai', draftLimit: '0' });

    expect(mockedUpdate).toHaveBeenCalledWith('openai', 0);
  });
});

describe('saveProviderConcurrencyDraft no-op cases', () => {
  it('does nothing when the provider key is blank', async () => {
    await saveProviderConcurrencyDraft({ providerKey: '   ', draftLimit: '5' });

    expect(mockedUpdate).not.toHaveBeenCalled();
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it('does nothing when the provider and draft are unchanged from the baseline', async () => {
    await saveProviderConcurrencyDraft({
      providerKey: 'openai',
      draftLimit: '5',
      baselineProviderKey: 'openai',
      baselineDraftLimit: '5',
    });

    expect(mockedUpdate).not.toHaveBeenCalled();
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it('does not delete when clearing a draft that was already empty for the same provider', async () => {
    await saveProviderConcurrencyDraft({
      providerKey: 'openai',
      draftLimit: '   ',
      baselineProviderKey: 'openai',
      baselineDraftLimit: '',
    });

    expect(mockedDelete).not.toHaveBeenCalled();
    expect(mockedUpdate).not.toHaveBeenCalled();
  });
});

describe('saveProviderConcurrencyDraft clear path', () => {
  it('deletes the provider when clearing a previously non-empty draft', async () => {
    await saveProviderConcurrencyDraft({
      providerKey: 'openai',
      draftLimit: '',
      baselineProviderKey: 'openai',
      baselineDraftLimit: '5',
    });

    expect(mockedDelete).toHaveBeenCalledTimes(1);
    expect(mockedDelete).toHaveBeenCalledWith('openai');
  });

  it('does not update when clearing a draft', async () => {
    await saveProviderConcurrencyDraft({
      providerKey: 'openai',
      draftLimit: '',
      baselineProviderKey: 'openai',
      baselineDraftLimit: '5',
    });

    expect(mockedUpdate).not.toHaveBeenCalled();
  });
});

describe('saveProviderConcurrencyDraft provider rename path', () => {
  it('deletes the previous provider before updating the new one', async () => {
    await saveProviderConcurrencyDraft({
      providerKey: 'anthropic',
      draftLimit: '3',
      baselineProviderKey: 'openai',
      baselineDraftLimit: '5',
    });

    expect(mockedDelete).toHaveBeenCalledWith('openai');
    expect(mockedUpdate).toHaveBeenCalledWith('anthropic', 3);
  });

  it('does not delete the previous provider when its baseline draft was empty', async () => {
    await saveProviderConcurrencyDraft({
      providerKey: 'anthropic',
      draftLimit: '3',
      baselineProviderKey: 'openai',
      baselineDraftLimit: '',
    });

    expect(mockedDelete).not.toHaveBeenCalled();
    expect(mockedUpdate).toHaveBeenCalledWith('anthropic', 3);
  });

  it('updates the new provider even when the draft value matches the previous draft', async () => {
    await saveProviderConcurrencyDraft({
      providerKey: 'anthropic',
      draftLimit: '5',
      baselineProviderKey: 'openai',
      baselineDraftLimit: '5',
    });

    expect(mockedDelete).toHaveBeenCalledWith('openai');
    expect(mockedUpdate).toHaveBeenCalledWith('anthropic', 5);
  });
});

describe('saveProviderConcurrencyDraft invalid limit', () => {
  it('throws an error for a non-numeric draft limit', async () => {
    await expect(
      saveProviderConcurrencyDraft({ providerKey: 'openai', draftLimit: 'abc' })
    ).rejects.toThrow('invalid concurrency limit');
  });

  it('does not call update or delete for a non-numeric draft limit', async () => {
    await saveProviderConcurrencyDraft({ providerKey: 'openai', draftLimit: 'abc' }).catch(
      () => undefined
    );

    expect(mockedUpdate).not.toHaveBeenCalled();
    expect(mockedDelete).not.toHaveBeenCalled();
  });
});

describe('saveProviderConcurrencyDraft baseline defaulting', () => {
  it('treats the providerKey as its own baseline when no baseline is supplied', async () => {
    await saveProviderConcurrencyDraft({ providerKey: 'openai', draftLimit: '7' });

    expect(mockedDelete).not.toHaveBeenCalled();
    expect(mockedUpdate).toHaveBeenCalledWith('openai', 7);
  });
});
