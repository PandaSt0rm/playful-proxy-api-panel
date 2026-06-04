import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import i18n from '@/i18n';
import { useNotificationStore } from '@/stores';
import type { AuthFileItem } from '@/types';
import type { AuthFileModelItem } from '@/features/authFiles/constants';

const getModelsForAuthFile = vi.fn<(name: string) => Promise<AuthFileModelItem[]>>();

vi.mock('@/services/api', () => ({
  authFilesApi: {
    getModelsForAuthFile: (name: string) => getModelsForAuthFile(name),
  },
}));

import { useAuthFilesModels } from './useAuthFilesModels';

const resetNotifications = () => {
  useNotificationStore.setState({
    notifications: [],
    confirmation: { isOpen: false, isLoading: false, options: null },
  });
};

const item = (overrides: Partial<AuthFileItem> = {}): AuthFileItem => ({
  name: 'codex.json',
  type: 'codex',
  ...overrides,
});

beforeEach(() => {
  resetNotifications();
  getModelsForAuthFile.mockReset();
});

describe('useAuthFilesModels initial state', () => {
  it('starts with the modal closed and no models loaded', () => {
    const { result } = renderHook(() => useAuthFilesModels());

    expect(result.current.modelsModalOpen).toBe(false);
    expect(result.current.modelsList).toEqual([]);
    expect(result.current.modelsError).toBeNull();
  });
});

describe('useAuthFilesModels showModels happy path', () => {
  it('opens the modal and records the file name and type immediately', async () => {
    getModelsForAuthFile.mockResolvedValue([]);
    const { result } = renderHook(() => useAuthFilesModels());

    await act(async () => {
      await result.current.showModels(item({ name: 'gpt.json', type: 'codex' }));
    });

    expect(result.current.modelsModalOpen).toBe(true);
    expect(result.current.modelsFileName).toBe('gpt.json');
    expect(result.current.modelsFileType).toBe('codex');
  });

  it('uses an empty string for the file type when the item has none', async () => {
    getModelsForAuthFile.mockResolvedValue([]);
    const { result } = renderHook(() => useAuthFilesModels());

    await act(async () => {
      await result.current.showModels(item({ name: 'x.json', type: undefined }));
    });

    expect(result.current.modelsFileType).toBe('');
  });

  it('loads the model list returned by the api', async () => {
    const models: AuthFileModelItem[] = [{ id: 'gpt-5' }, { id: 'gpt-4' }];
    getModelsForAuthFile.mockResolvedValue(models);
    const { result } = renderHook(() => useAuthFilesModels());

    await act(async () => {
      await result.current.showModels(item({ name: 'a.json' }));
    });

    expect(result.current.modelsList).toEqual(models);
  });

  it('clears the loading flag after a successful load', async () => {
    getModelsForAuthFile.mockResolvedValue([{ id: 'gpt-5' }]);
    const { result } = renderHook(() => useAuthFilesModels());

    await act(async () => {
      await result.current.showModels(item());
    });

    expect(result.current.modelsLoading).toBe(false);
  });
});

describe('useAuthFilesModels caching', () => {
  it('serves cached models without calling the api again for the same file', async () => {
    getModelsForAuthFile.mockResolvedValue([{ id: 'gpt-5' }]);
    const { result } = renderHook(() => useAuthFilesModels());

    await act(async () => {
      await result.current.showModels(item({ name: 'same.json' }));
    });
    await act(async () => {
      await result.current.showModels(item({ name: 'same.json' }));
    });

    expect(getModelsForAuthFile).toHaveBeenCalledTimes(1);
  });

  it('calls the api again for a different file name', async () => {
    getModelsForAuthFile.mockResolvedValue([{ id: 'gpt-5' }]);
    const { result } = renderHook(() => useAuthFilesModels());

    await act(async () => {
      await result.current.showModels(item({ name: 'one.json' }));
    });
    await act(async () => {
      await result.current.showModels(item({ name: 'two.json' }));
    });

    expect(getModelsForAuthFile).toHaveBeenCalledTimes(2);
  });
});

describe('useAuthFilesModels error handling', () => {
  it('sets the unsupported error flag on a 404 response', async () => {
    getModelsForAuthFile.mockRejectedValue({ status: 404 });
    const { result } = renderHook(() => useAuthFilesModels());

    await act(async () => {
      await result.current.showModels(item());
    });

    expect(result.current.modelsError).toBe('unsupported');
  });

  it('does not show a notification on a 404 response', async () => {
    getModelsForAuthFile.mockRejectedValue({ status: 404 });
    const { result } = renderHook(() => useAuthFilesModels());

    await act(async () => {
      await result.current.showModels(item());
    });

    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });

  it('shows a load-failed notification carrying the error message for a non-404 error', async () => {
    getModelsForAuthFile.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useAuthFilesModels());

    await act(async () => {
      await result.current.showModels(item());
    });

    const notifications = useNotificationStore.getState().notifications;
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      message: `${i18n.t('notification.load_failed')}: boom`,
      type: 'error',
    });
  });

  it('leaves the unsupported error null for a non-404 error', async () => {
    getModelsForAuthFile.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useAuthFilesModels());

    await act(async () => {
      await result.current.showModels(item());
    });

    expect(result.current.modelsError).toBeNull();
  });

  it('clears the loading flag after an error', async () => {
    getModelsForAuthFile.mockRejectedValue({ status: 404 });
    const { result } = renderHook(() => useAuthFilesModels());

    await act(async () => {
      await result.current.showModels(item());
    });

    expect(result.current.modelsLoading).toBe(false);
  });
});

describe('useAuthFilesModels closeModelsModal', () => {
  it('closes an open modal', async () => {
    getModelsForAuthFile.mockResolvedValue([]);
    const { result } = renderHook(() => useAuthFilesModels());

    await act(async () => {
      await result.current.showModels(item());
    });
    act(() => {
      result.current.closeModelsModal();
    });

    expect(result.current.modelsModalOpen).toBe(false);
  });
});
