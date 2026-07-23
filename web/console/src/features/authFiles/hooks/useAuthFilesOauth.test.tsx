import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import i18n from '@/i18n';
import { useNotificationStore } from '@/stores';
import type { AuthFileItem, OAuthModelAliasEntry } from '@/types';
import type { AuthFileModelItem } from '@/features/authFiles/constants';

const getOauthExcludedModels = vi.fn();
const getOauthModelAlias = vi.fn();
const getModelDefinitions = vi.fn<(provider: string) => Promise<AuthFileModelItem[]>>();
const deleteOauthExcludedEntry = vi.fn();
const replaceOauthExcludedModels = vi.fn();
const deleteOauthModelAlias = vi.fn();
const saveOauthModelAlias = vi.fn();

vi.mock('@/services/api', () => ({
  authFilesApi: {
    getOauthExcludedModels: () => getOauthExcludedModels(),
    getOauthModelAlias: () => getOauthModelAlias(),
    getModelDefinitions: (provider: string) => getModelDefinitions(provider),
    deleteOauthExcludedEntry: (provider: string) => deleteOauthExcludedEntry(provider),
    replaceOauthExcludedModels: (map: Record<string, string[]>) => replaceOauthExcludedModels(map),
    deleteOauthModelAlias: (channel: string) => deleteOauthModelAlias(channel),
    saveOauthModelAlias: (channel: string, aliases: OAuthModelAliasEntry[]) =>
      saveOauthModelAlias(channel, aliases),
  },
}));

import { useAuthFilesOauth, type UseAuthFilesOauthOptions } from './useAuthFilesOauth';

const resetNotifications = () => {
  useNotificationStore.setState({
    notifications: [],
    confirmation: { isOpen: false, isLoading: false, options: null },
  });
};

const confirmation = () => useNotificationStore.getState().confirmation;

const runConfirmation = async () => {
  const onConfirm = confirmation().options?.onConfirm;
  if (!onConfirm) throw new Error('expected a confirmation to be open');
  await act(async () => {
    await onConfirm();
  });
};

const setup = (options: Partial<UseAuthFilesOauthOptions> = {}) =>
  renderHook(() =>
    useAuthFilesOauth({
      viewMode: options.viewMode ?? 'list',
      files: options.files ?? [],
    })
  );

beforeEach(() => {
  resetNotifications();
  getOauthExcludedModels.mockReset();
  getOauthModelAlias.mockReset();
  getModelDefinitions.mockReset();
  deleteOauthExcludedEntry.mockReset();
  replaceOauthExcludedModels.mockReset();
  deleteOauthModelAlias.mockReset();
  saveOauthModelAlias.mockReset();
  getModelDefinitions.mockResolvedValue([]);
});

describe('useAuthFilesOauth providerList', () => {
  it('is empty when there are no files and no aliases', () => {
    const { result } = setup({ files: [] });

    expect(result.current.providerList).toEqual([]);
  });

  it('collects lowercased, trimmed file types and providers', () => {
    const files: AuthFileItem[] = [{ name: 'a.json', type: ' Codex ', provider: 'OpenAI' }];

    const { result } = setup({ files });

    expect(result.current.providerList).toEqual(['codex', 'openai']);
  });

  it('deduplicates a provider that appears as both a file type and an alias key', async () => {
    getOauthModelAlias.mockResolvedValue({ codex: [{ name: 'm', alias: 'a' }] });
    const files: AuthFileItem[] = [{ name: 'a.json', type: 'codex' }];
    const { result } = setup({ files });

    await act(async () => {
      await result.current.loadModelAlias();
    });

    expect(result.current.providerList).toEqual(['codex']);
  });
});

describe('useAuthFilesOauth diagram-mode model loading', () => {
  it('does not fetch model definitions in list view', async () => {
    const files: AuthFileItem[] = [{ name: 'a.json', type: 'codex' }];

    setup({ viewMode: 'list', files });
    await act(async () => {
      await Promise.resolve();
    });

    expect(getModelDefinitions).not.toHaveBeenCalled();
  });

  it('loads provider models for each provider in diagram view', async () => {
    getModelDefinitions.mockResolvedValue([{ id: 'gpt-5' }]);
    const files: AuthFileItem[] = [{ name: 'a.json', type: 'codex' }];
    const { result } = setup({ viewMode: 'diagram', files });

    await waitFor(() => {
      expect(result.current.allProviderModels.codex).toEqual([{ id: 'gpt-5' }]);
    });
  });

  it('omits providers that return no models in diagram view', async () => {
    getModelDefinitions.mockResolvedValue([]);
    const files: AuthFileItem[] = [{ name: 'a.json', type: 'codex' }];
    const { result } = setup({ viewMode: 'diagram', files });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.allProviderModels.codex).toBeUndefined();
  });

  it('treats a provider model fetch failure as an empty list', async () => {
    getModelDefinitions.mockRejectedValue(new Error('boom'));
    const files: AuthFileItem[] = [{ name: 'a.json', type: 'codex' }];
    const { result } = setup({ viewMode: 'diagram', files });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.allProviderModels.codex).toBeUndefined();
  });
});

describe('useAuthFilesOauth loadExcluded', () => {
  it('stores the excluded models returned by the api', async () => {
    getOauthExcludedModels.mockResolvedValue({ codex: ['gpt-3'] });
    const { result } = setup();

    await act(async () => {
      await result.current.loadExcluded();
    });

    expect(result.current.excluded).toEqual({ codex: ['gpt-3'] });
    expect(result.current.excludedError).toBeNull();
  });

  it('falls back to an empty map when the api returns null', async () => {
    getOauthExcludedModels.mockResolvedValue(null);
    const { result } = setup();

    await act(async () => {
      await result.current.loadExcluded();
    });

    expect(result.current.excluded).toEqual({});
  });

  it('marks the feature unsupported on a 404 response', async () => {
    getOauthExcludedModels.mockRejectedValue({ status: 404 });
    const { result } = setup();

    await act(async () => {
      await result.current.loadExcluded();
    });

    expect(result.current.excludedError).toBe('unsupported');
  });

  it('shows the upgrade-required warning only once across repeated 404s', async () => {
    getOauthExcludedModels.mockRejectedValue({ status: 404 });
    const { result } = setup();

    await act(async () => {
      await result.current.loadExcluded();
    });
    await act(async () => {
      await result.current.loadExcluded();
    });

    const warnings = useNotificationStore
      .getState()
      .notifications.filter((n) => n.message === i18n.t('oauth_excluded.upgrade_required'));
    expect(warnings).toHaveLength(1);
  });

  it('stays silent on a non-404 error', async () => {
    getOauthExcludedModels.mockRejectedValue(new Error('boom'));
    const { result } = setup();

    await act(async () => {
      await result.current.loadExcluded();
    });

    expect(result.current.excludedError).toBeNull();
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });
});

describe('useAuthFilesOauth loadModelAlias', () => {
  it('stores the model aliases returned by the api', async () => {
    const alias = { codex: [{ name: 'gpt-5', alias: 'fast', fork: true }] };
    getOauthModelAlias.mockResolvedValue(alias);
    const { result } = setup();

    await act(async () => {
      await result.current.loadModelAlias();
    });

    expect(result.current.modelAlias).toEqual(alias);
  });

  it('marks the feature unsupported on a 404 response', async () => {
    getOauthModelAlias.mockRejectedValue({ status: 404 });
    const { result } = setup();

    await act(async () => {
      await result.current.loadModelAlias();
    });

    expect(result.current.modelAliasError).toBe('unsupported');
  });

  it('shows the alias upgrade warning only once across repeated 404s', async () => {
    getOauthModelAlias.mockRejectedValue({ status: 404 });
    const { result } = setup();

    await act(async () => {
      await result.current.loadModelAlias();
    });
    await act(async () => {
      await result.current.loadModelAlias();
    });

    const warnings = useNotificationStore
      .getState()
      .notifications.filter((n) => n.message === i18n.t('oauth_model_alias.upgrade_required'));
    expect(warnings).toHaveLength(1);
  });
});

describe('useAuthFilesOauth deleteExcluded', () => {
  it('deletes the provider entry then reloads and notifies success', async () => {
    getOauthExcludedModels.mockResolvedValue({});
    deleteOauthExcludedEntry.mockResolvedValue(undefined);
    const { result } = setup();

    act(() => {
      result.current.deleteExcluded('Codex');
    });
    await runConfirmation();

    expect(deleteOauthExcludedEntry).toHaveBeenCalledWith('codex');
    expect(useNotificationStore.getState().notifications.at(-1)).toMatchObject({
      message: i18n.t('oauth_excluded.delete_success'),
      type: 'success',
    });
  });

  it('errors out when the provider key normalizes to empty', async () => {
    const { result } = setup();

    act(() => {
      result.current.deleteExcluded('   ');
    });
    await runConfirmation();

    expect(deleteOauthExcludedEntry).not.toHaveBeenCalled();
    expect(useNotificationStore.getState().notifications.at(-1)).toMatchObject({
      message: i18n.t('oauth_excluded.provider_required'),
      type: 'error',
    });
  });

  it('falls back to a full replace when the targeted delete fails', async () => {
    deleteOauthExcludedEntry.mockRejectedValue(new Error('no delete endpoint'));
    getOauthExcludedModels.mockResolvedValue({ codex: ['x'], gemini: ['y'] });
    replaceOauthExcludedModels.mockResolvedValue(undefined);
    const { result } = setup();

    act(() => {
      result.current.deleteExcluded('codex');
    });
    await runConfirmation();

    expect(replaceOauthExcludedModels).toHaveBeenCalledWith({ gemini: ['y'] });
    expect(useNotificationStore.getState().notifications.at(-1)).toMatchObject({
      message: i18n.t('oauth_excluded.delete_success'),
      type: 'success',
    });
  });

  it('reports failure when both the delete and the replace fallback fail', async () => {
    deleteOauthExcludedEntry.mockRejectedValue(new Error('first'));
    getOauthExcludedModels.mockRejectedValue(new Error('cannot list'));
    const { result } = setup();

    act(() => {
      result.current.deleteExcluded('codex');
    });
    await runConfirmation();

    expect(useNotificationStore.getState().notifications.at(-1)).toMatchObject({
      message: `${i18n.t('oauth_excluded.delete_failed')}: cannot list`,
      type: 'error',
    });
  });
});

describe('useAuthFilesOauth deleteModelAlias', () => {
  it('deletes the alias channel then reloads and notifies success', async () => {
    deleteOauthModelAlias.mockResolvedValue(undefined);
    getOauthModelAlias.mockResolvedValue({});
    const { result } = setup();

    act(() => {
      result.current.deleteModelAlias('codex');
    });
    await runConfirmation();

    expect(deleteOauthModelAlias).toHaveBeenCalledWith('codex');
    expect(useNotificationStore.getState().notifications.at(-1)).toMatchObject({
      message: i18n.t('oauth_model_alias.delete_success'),
      type: 'success',
    });
  });

  it('reports failure when the alias channel delete fails', async () => {
    deleteOauthModelAlias.mockRejectedValue(new Error('delete boom'));
    const { result } = setup();

    act(() => {
      result.current.deleteModelAlias('codex');
    });
    await runConfirmation();

    expect(useNotificationStore.getState().notifications.at(-1)).toMatchObject({
      message: `${i18n.t('oauth_model_alias.delete_failed')}: delete boom`,
      type: 'error',
    });
  });
});

describe('useAuthFilesOauth handleMappingUpdate', () => {
  it('ignores a call with a missing alias argument', async () => {
    const { result } = setup();

    await act(async () => {
      await result.current.handleMappingUpdate('codex', 'gpt-5', '');
    });

    expect(saveOauthModelAlias).not.toHaveBeenCalled();
  });

  it('appends a forked mapping and reloads on success', async () => {
    saveOauthModelAlias.mockResolvedValue(undefined);
    getOauthModelAlias.mockResolvedValue({});
    const { result } = setup();

    await act(async () => {
      await result.current.handleMappingUpdate('Codex', '  gpt-5 ', ' fast ');
    });

    expect(saveOauthModelAlias).toHaveBeenCalledWith('codex', [
      { name: 'gpt-5', alias: 'fast', fork: true },
    ]);
    expect(useNotificationStore.getState().notifications.at(-1)).toMatchObject({
      message: i18n.t('oauth_model_alias.save_success'),
      type: 'success',
    });
  });

  it('skips saving when the identical mapping already exists', async () => {
    getOauthModelAlias.mockResolvedValue({ codex: [{ name: 'gpt-5', alias: 'fast' }] });
    const { result } = setup();
    await act(async () => {
      await result.current.loadModelAlias();
    });

    await act(async () => {
      await result.current.handleMappingUpdate('codex', 'gpt-5', 'fast');
    });

    expect(saveOauthModelAlias).not.toHaveBeenCalled();
  });

  it('reports failure when saving the new mapping fails', async () => {
    saveOauthModelAlias.mockRejectedValue(new Error('save boom'));
    getOauthModelAlias.mockResolvedValue({});
    const { result } = setup();

    await act(async () => {
      await result.current.handleMappingUpdate('codex', 'gpt-5', 'fast');
    });

    expect(useNotificationStore.getState().notifications.at(-1)).toMatchObject({
      message: `${i18n.t('oauth_model_alias.save_failed')}: save boom`,
      type: 'error',
    });
  });
});

describe('useAuthFilesOauth handleDeleteLink', () => {
  it('saves the remaining mappings when more than one link exists', async () => {
    getOauthModelAlias.mockResolvedValue({
      codex: [
        { name: 'gpt-5', alias: 'fast' },
        { name: 'gpt-4', alias: 'slow' },
      ],
    });
    saveOauthModelAlias.mockResolvedValue(undefined);
    const { result } = setup();
    await act(async () => {
      await result.current.loadModelAlias();
    });

    act(() => {
      result.current.handleDeleteLink('codex', 'gpt-5', 'fast');
    });
    await runConfirmation();

    expect(saveOauthModelAlias).toHaveBeenCalledWith('codex', [{ name: 'gpt-4', alias: 'slow' }]);
  });

  it('deletes the whole channel when the last link is removed', async () => {
    getOauthModelAlias.mockResolvedValue({ codex: [{ name: 'gpt-5', alias: 'fast' }] });
    deleteOauthModelAlias.mockResolvedValue(undefined);
    const { result } = setup();
    await act(async () => {
      await result.current.loadModelAlias();
    });

    act(() => {
      result.current.handleDeleteLink('codex', 'gpt-5', 'fast');
    });
    await runConfirmation();

    expect(deleteOauthModelAlias).toHaveBeenCalledWith('codex');
    expect(saveOauthModelAlias).not.toHaveBeenCalled();
  });

  it('does nothing when the targeted link is not present', async () => {
    getOauthModelAlias.mockResolvedValue({ codex: [{ name: 'gpt-5', alias: 'fast' }] });
    const { result } = setup();
    await act(async () => {
      await result.current.loadModelAlias();
    });

    act(() => {
      result.current.handleDeleteLink('codex', 'missing', 'none');
    });
    await runConfirmation();

    expect(deleteOauthModelAlias).not.toHaveBeenCalled();
    expect(saveOauthModelAlias).not.toHaveBeenCalled();
  });
});

describe('useAuthFilesOauth handleToggleFork', () => {
  it('sets fork true on the matching mapping and saves', async () => {
    getOauthModelAlias.mockResolvedValue({ codex: [{ name: 'gpt-5', alias: 'fast' }] });
    saveOauthModelAlias.mockResolvedValue(undefined);
    const { result } = setup();
    await act(async () => {
      await result.current.loadModelAlias();
    });

    await act(async () => {
      await result.current.handleToggleFork('codex', 'gpt-5', 'fast', true);
    });

    expect(saveOauthModelAlias).toHaveBeenCalledWith('codex', [
      { name: 'gpt-5', alias: 'fast', fork: true },
    ]);
  });

  it('strips the fork flag from the matching mapping when toggled off', async () => {
    getOauthModelAlias.mockResolvedValue({ codex: [{ name: 'gpt-5', alias: 'fast', fork: true }] });
    saveOauthModelAlias.mockResolvedValue(undefined);
    const { result } = setup();
    await act(async () => {
      await result.current.loadModelAlias();
    });

    await act(async () => {
      await result.current.handleToggleFork('codex', 'gpt-5', 'fast', false);
    });

    expect(saveOauthModelAlias).toHaveBeenCalledWith('codex', [{ name: 'gpt-5', alias: 'fast' }]);
  });

  it('does nothing when no mapping matches', async () => {
    getOauthModelAlias.mockResolvedValue({ codex: [{ name: 'gpt-5', alias: 'fast' }] });
    const { result } = setup();
    await act(async () => {
      await result.current.loadModelAlias();
    });

    await act(async () => {
      await result.current.handleToggleFork('codex', 'unknown', 'none', true);
    });

    expect(saveOauthModelAlias).not.toHaveBeenCalled();
  });
});

describe('useAuthFilesOauth handleRenameAlias', () => {
  it('does nothing when the new alias equals the old alias', async () => {
    getOauthModelAlias.mockResolvedValue({ codex: [{ name: 'gpt-5', alias: 'fast' }] });
    const { result } = setup();
    await act(async () => {
      await result.current.loadModelAlias();
    });

    await act(async () => {
      await result.current.handleRenameAlias('fast', 'fast');
    });

    expect(saveOauthModelAlias).not.toHaveBeenCalled();
  });

  it('renames the alias across every provider that uses it', async () => {
    getOauthModelAlias.mockResolvedValue({
      codex: [{ name: 'gpt-5', alias: 'fast' }],
      gemini: [{ name: 'gem-2', alias: 'fast' }],
    });
    saveOauthModelAlias.mockResolvedValue(undefined);
    const { result } = setup();
    await act(async () => {
      await result.current.loadModelAlias();
    });

    await act(async () => {
      await result.current.handleRenameAlias('fast', 'quick');
    });

    expect(saveOauthModelAlias).toHaveBeenCalledWith('codex', [{ name: 'gpt-5', alias: 'quick' }]);
    expect(saveOauthModelAlias).toHaveBeenCalledWith('gemini', [{ name: 'gem-2', alias: 'quick' }]);
  });

  it('reports an error when one of the rename saves fails', async () => {
    getOauthModelAlias.mockResolvedValue({ codex: [{ name: 'gpt-5', alias: 'fast' }] });
    saveOauthModelAlias.mockRejectedValue(new Error('rename boom'));
    const { result } = setup();
    await act(async () => {
      await result.current.loadModelAlias();
    });

    await act(async () => {
      await result.current.handleRenameAlias('fast', 'quick');
    });

    expect(useNotificationStore.getState().notifications.at(-1)).toMatchObject({
      message: `${i18n.t('oauth_model_alias.save_failed')}: rename boom`,
      type: 'error',
    });
  });
});

describe('useAuthFilesOauth handleDeleteAlias', () => {
  it('does nothing when no provider uses the alias', async () => {
    getOauthModelAlias.mockResolvedValue({ codex: [{ name: 'gpt-5', alias: 'fast' }] });
    const { result } = setup();
    await act(async () => {
      await result.current.loadModelAlias();
    });

    act(() => {
      result.current.handleDeleteAlias('nonexistent');
    });

    expect(confirmation().isOpen).toBe(false);
  });

  it('saves the remaining mappings for a provider with other aliases', async () => {
    getOauthModelAlias.mockResolvedValue({
      codex: [
        { name: 'gpt-5', alias: 'fast' },
        { name: 'gpt-4', alias: 'slow' },
      ],
    });
    saveOauthModelAlias.mockResolvedValue(undefined);
    const { result } = setup();
    await act(async () => {
      await result.current.loadModelAlias();
    });

    act(() => {
      result.current.handleDeleteAlias('fast');
    });
    await runConfirmation();

    expect(saveOauthModelAlias).toHaveBeenCalledWith('codex', [{ name: 'gpt-4', alias: 'slow' }]);
  });

  it('deletes the channel when the alias was its only mapping', async () => {
    getOauthModelAlias.mockResolvedValue({ codex: [{ name: 'gpt-5', alias: 'fast' }] });
    deleteOauthModelAlias.mockResolvedValue(undefined);
    const { result } = setup();
    await act(async () => {
      await result.current.loadModelAlias();
    });

    act(() => {
      result.current.handleDeleteAlias('fast');
    });
    await runConfirmation();

    expect(deleteOauthModelAlias).toHaveBeenCalledWith('codex');
  });

  it('reports an error when one of the deletes fails', async () => {
    getOauthModelAlias.mockResolvedValue({ codex: [{ name: 'gpt-5', alias: 'fast' }] });
    deleteOauthModelAlias.mockRejectedValue(new Error('del boom'));
    const { result } = setup();
    await act(async () => {
      await result.current.loadModelAlias();
    });

    act(() => {
      result.current.handleDeleteAlias('fast');
    });
    await runConfirmation();

    expect(useNotificationStore.getState().notifications.at(-1)).toMatchObject({
      message: `${i18n.t('oauth_model_alias.delete_failed')}: del boom`,
      type: 'error',
    });
  });
});
