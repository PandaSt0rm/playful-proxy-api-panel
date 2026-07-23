import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ChangeEvent } from 'react';
import i18n from '@/i18n';
import { useNotificationStore } from '@/stores';
import type { AuthFileItem } from '@/types';
import { MAX_AUTH_FILE_SIZE } from '@/utils/constants';
import { formatFileSize } from '@/utils/format';

const list = vi.fn();
const uploadFiles = vi.fn();
const deleteFile = vi.fn();
const deleteFiles = vi.fn();
const deleteAll = vi.fn();
const setStatus = vi.fn();
const getRaw = vi.fn();
const downloadBlob = vi.fn();

vi.mock('@/services/api', () => ({
  authFilesApi: {
    list: () => list(),
    uploadFiles: (files: File[]) => uploadFiles(files),
    deleteFile: (name: string) => deleteFile(name),
    deleteFiles: (names: string[]) => deleteFiles(names),
    deleteAll: () => deleteAll(),
    setStatus: (name: string, disabled: boolean) => setStatus(name, disabled),
  },
}));

vi.mock('@/services/api/client', () => ({
  apiClient: {
    getRaw: (url: string, opts: unknown) => getRaw(url, opts),
  },
}));

vi.mock('@/utils/download', () => ({
  downloadBlob: (opts: unknown) => downloadBlob(opts),
}));

import { useAuthFilesData } from './useAuthFilesData';

const resetNotifications = () => {
  useNotificationStore.setState({
    notifications: [],
    confirmation: { isOpen: false, isLoading: false, options: null },
  });
};

const notifications = () => useNotificationStore.getState().notifications;
const confirmation = () => useNotificationStore.getState().confirmation;

const runConfirmation = async () => {
  const onConfirm = confirmation().options?.onConfirm;
  if (!onConfirm) throw new Error('expected a confirmation to be open');
  await act(async () => {
    await onConfirm();
  });
};

const item = (overrides: Partial<AuthFileItem>): AuthFileItem => ({
  name: 'file.json',
  type: 'codex',
  ...overrides,
});

const jsonFile = (name: string, size = 10): File => {
  const file = new File([JSON.stringify({})], name, { type: 'application/json' });
  Object.defineProperty(file, 'size', { value: size });
  return file;
};

const changeEventFor = (files: File[]): ChangeEvent<HTMLInputElement> => {
  const input = { files, value: 'x' } as unknown as HTMLInputElement;
  return { target: input } as unknown as ChangeEvent<HTMLInputElement>;
};

const renderLoaded = async (files: AuthFileItem[]) => {
  list.mockResolvedValue({ files });
  const rendered = renderHook(() => useAuthFilesData());
  await act(async () => {
    await rendered.result.current.loadFiles();
  });
  return rendered;
};

beforeEach(() => {
  resetNotifications();
  list.mockReset();
  uploadFiles.mockReset();
  deleteFile.mockReset();
  deleteFiles.mockReset();
  deleteAll.mockReset();
  setStatus.mockReset();
  getRaw.mockReset();
  downloadBlob.mockReset();
  list.mockResolvedValue({ files: [] });
});

describe('useAuthFilesData loadFiles', () => {
  it('loads the file list on mount and clears the loading flag', async () => {
    const files = [item({ name: 'a.json' })];

    const { result } = await renderLoaded(files);

    expect(result.current.files).toEqual(files);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe('');
  });

  it('treats a null response as an empty file list', async () => {
    list.mockResolvedValue(null);
    const { result } = renderHook(() => useAuthFilesData());

    await act(async () => {
      await result.current.loadFiles();
    });

    expect(result.current.files).toEqual([]);
  });

  it('captures the error message when the list call rejects', async () => {
    list.mockRejectedValue(new Error('list boom'));
    const { result } = renderHook(() => useAuthFilesData());

    await act(async () => {
      await result.current.loadFiles();
    });

    expect(result.current.error).toBe('list boom');
  });

  it('falls back to the refresh-failed message for a non-Error rejection', async () => {
    list.mockRejectedValue('weird');
    const { result } = renderHook(() => useAuthFilesData());

    await act(async () => {
      await result.current.loadFiles();
    });

    expect(result.current.error).toBe(i18n.t('notification.refresh_failed'));
  });

  it('initializes with the loading flag set before any load runs', () => {
    const { result } = renderHook(() => useAuthFilesData());

    expect(result.current.loading).toBe(true);
  });
});

describe('useAuthFilesData selection helpers', () => {
  it('toggles a file into the selection', async () => {
    const { result } = await renderLoaded([item({ name: 'a.json' })]);

    act(() => {
      result.current.toggleSelect('a.json');
    });

    expect(result.current.selectionCount).toBe(1);
    expect(result.current.selectedFiles.has('a.json')).toBe(true);
  });

  it('toggles a file back out of the selection', async () => {
    const { result } = await renderLoaded([item({ name: 'a.json' })]);
    act(() => {
      result.current.toggleSelect('a.json');
    });

    act(() => {
      result.current.toggleSelect('a.json');
    });

    expect(result.current.selectionCount).toBe(0);
  });

  it('selects all visible non-runtime files', async () => {
    const visible = [item({ name: 'a.json' }), item({ name: 'b.json' })];
    const { result } = await renderLoaded(visible);

    act(() => {
      result.current.selectAllVisible(visible);
    });

    expect(result.current.selectionCount).toBe(2);
  });

  it('excludes runtime-only files from select-all', async () => {
    const visible = [item({ name: 'a.json' }), item({ name: 'rt.json', runtime_only: true })];
    const { result } = await renderLoaded(visible);

    act(() => {
      result.current.selectAllVisible(visible);
    });

    expect(result.current.selectedFiles.has('rt.json')).toBe(false);
    expect(result.current.selectionCount).toBe(1);
  });

  it('inverts the visible selection', async () => {
    const visible = [item({ name: 'a.json' }), item({ name: 'b.json' })];
    const { result } = await renderLoaded(visible);
    act(() => {
      result.current.toggleSelect('a.json');
    });

    act(() => {
      result.current.invertVisibleSelection(visible);
    });

    expect(result.current.selectedFiles.has('a.json')).toBe(false);
    expect(result.current.selectedFiles.has('b.json')).toBe(true);
  });

  it('clears the entire selection with deselectAll', async () => {
    const { result } = await renderLoaded([item({ name: 'a.json' })]);
    act(() => {
      result.current.toggleSelect('a.json');
    });

    act(() => {
      result.current.deselectAll();
    });

    expect(result.current.selectionCount).toBe(0);
  });

  it('prunes selected names that no longer exist after a reload', async () => {
    const { result } = await renderLoaded([item({ name: 'a.json' }), item({ name: 'b.json' })]);
    act(() => {
      result.current.toggleSelect('a.json');
      result.current.toggleSelect('b.json');
    });

    list.mockResolvedValue({ files: [item({ name: 'a.json' })] });
    await act(async () => {
      await result.current.loadFiles();
    });

    await waitFor(() => {
      expect(result.current.selectedFiles.has('b.json')).toBe(false);
    });
    expect(result.current.selectedFiles.has('a.json')).toBe(true);
  });
});

describe('useAuthFilesData handleFileChange validation', () => {
  it('rejects non-json files with an error notification', async () => {
    const { result } = await renderLoaded([]);

    await act(async () => {
      await result.current.handleFileChange(changeEventFor([jsonFile('not-json.txt')]));
    });

    expect(uploadFiles).not.toHaveBeenCalled();
    expect(notifications().at(-1)).toMatchObject({
      message: i18n.t('auth_files.upload_error_json'),
      type: 'error',
    });
  });

  it('rejects oversized files with a size-error notification', async () => {
    const { result } = await renderLoaded([]);

    await act(async () => {
      await result.current.handleFileChange(
        changeEventFor([jsonFile('big.json', MAX_AUTH_FILE_SIZE + 1)])
      );
    });

    expect(uploadFiles).not.toHaveBeenCalled();
    expect(notifications().at(-1)).toMatchObject({
      message: i18n.t('auth_files.upload_error_size', {
        maxSize: formatFileSize(MAX_AUTH_FILE_SIZE),
      }),
      type: 'error',
    });
  });

  it('does nothing when the file list is empty', async () => {
    const { result } = await renderLoaded([]);

    await act(async () => {
      await result.current.handleFileChange(changeEventFor([]));
    });

    expect(uploadFiles).not.toHaveBeenCalled();
  });
});

describe('useAuthFilesData handleFileChange upload', () => {
  it('uploads valid files and reloads on full success', async () => {
    uploadFiles.mockResolvedValue({ status: 'ok', uploaded: 1, files: ['a.json'], failed: [] });
    const { result } = await renderLoaded([]);
    list.mockResolvedValue({ files: [item({ name: 'a.json' })] });

    await act(async () => {
      await result.current.handleFileChange(changeEventFor([jsonFile('a.json')]));
    });

    expect(uploadFiles).toHaveBeenCalledTimes(1);
    expect(notifications().some((n) => n.message === i18n.t('auth_files.upload_success'))).toBe(
      true
    );
  });

  it('shows a count suffix when multiple files are uploaded', async () => {
    uploadFiles.mockResolvedValue({
      status: 'ok',
      uploaded: 2,
      files: ['a.json', 'b.json'],
      failed: [],
    });
    const { result } = await renderLoaded([]);

    await act(async () => {
      await result.current.handleFileChange(
        changeEventFor([jsonFile('a.json'), jsonFile('b.json')])
      );
    });

    expect(
      notifications().some((n) => n.message === `${i18n.t('auth_files.upload_success')} (2/2)`)
    ).toBe(true);
  });

  it('reports per-file failures with a detail notification', async () => {
    uploadFiles.mockResolvedValue({
      status: 'partial',
      uploaded: 1,
      files: ['a.json'],
      failed: [{ name: 'b.json', error: 'bad' }],
    });
    const { result } = await renderLoaded([]);

    await act(async () => {
      await result.current.handleFileChange(
        changeEventFor([jsonFile('a.json'), jsonFile('b.json')])
      );
    });

    expect(
      notifications().some(
        (n) => n.message === `${i18n.t('notification.upload_failed')}: b.json: bad`
      )
    ).toBe(true);
  });

  it('reports an upload exception as an error notification', async () => {
    uploadFiles.mockRejectedValue(new Error('upload boom'));
    const { result } = await renderLoaded([]);

    await act(async () => {
      await result.current.handleFileChange(changeEventFor([jsonFile('a.json')]));
    });

    expect(notifications().at(-1)).toMatchObject({
      message: `${i18n.t('notification.upload_failed')}: upload boom`,
      type: 'error',
    });
  });
});

describe('useAuthFilesData handleDelete', () => {
  it('opens a confirmation that names the file', async () => {
    const { result } = await renderLoaded([item({ name: 'a.json' })]);

    act(() => {
      result.current.handleDelete('a.json');
    });

    expect(confirmation().isOpen).toBe(true);
    expect(confirmation().options?.message).toBe(
      `${i18n.t('auth_files.delete_confirm')} "a.json" ?`
    );
  });

  it('removes the file and notifies success when confirmed', async () => {
    deleteFile.mockResolvedValue({ status: 'ok', deleted: 1, files: ['a.json'], failed: [] });
    const { result } = await renderLoaded([item({ name: 'a.json' }), item({ name: 'b.json' })]);

    act(() => {
      result.current.handleDelete('a.json');
    });
    await runConfirmation();

    expect(result.current.files.map((f) => f.name)).toEqual(['b.json']);
    expect(notifications().some((n) => n.message === i18n.t('auth_files.delete_success'))).toBe(
      true
    );
  });

  it('reports a delete failure with the error message', async () => {
    deleteFile.mockRejectedValue(new Error('delete boom'));
    const { result } = await renderLoaded([item({ name: 'a.json' })]);

    act(() => {
      result.current.handleDelete('a.json');
    });
    await runConfirmation();

    expect(notifications().at(-1)).toMatchObject({
      message: `${i18n.t('notification.delete_failed')}: delete boom`,
      type: 'error',
    });
  });
});

describe('useAuthFilesData handleDeleteAll', () => {
  const options = (
    overrides: Partial<Parameters<ReturnType<typeof useAuthFilesData>['handleDeleteAll']>[0]> = {}
  ) => ({
    filter: 'all',
    problemOnly: false,
    disabledOnly: false,
    onResetFilterToAll: vi.fn(),
    onResetProblemOnly: vi.fn(),
    onResetDisabledOnly: vi.fn(),
    ...overrides,
  });

  it('deletes everything except runtime-only files in the unfiltered case', async () => {
    deleteAll.mockResolvedValue(undefined);
    const { result } = await renderLoaded([
      item({ name: 'a.json' }),
      item({ name: 'rt.json', runtime_only: true }),
    ]);

    act(() => {
      result.current.handleDeleteAll(options());
    });
    await runConfirmation();

    expect(deleteAll).toHaveBeenCalledTimes(1);
    expect(result.current.files.map((f) => f.name)).toEqual(['rt.json']);
  });

  it('only deletes files matching the active type filter', async () => {
    deleteFiles.mockResolvedValue({
      status: 'ok',
      deleted: 1,
      files: ['claude.json'],
      failed: [],
    });
    const onResetFilterToAll = vi.fn();
    const { result } = await renderLoaded([
      item({ name: 'claude.json', type: 'claude' }),
      item({ name: 'codex.json', type: 'codex' }),
    ]);

    act(() => {
      result.current.handleDeleteAll(options({ filter: 'claude', onResetFilterToAll }));
    });
    await runConfirmation();

    expect(deleteFiles).toHaveBeenCalledWith(['claude.json']);
    expect(onResetFilterToAll).toHaveBeenCalledTimes(1);
  });

  it('shows an info notification when no files match the filter', async () => {
    const { result } = await renderLoaded([item({ name: 'codex.json', type: 'codex' })]);

    act(() => {
      result.current.handleDeleteAll(options({ filter: 'claude' }));
    });
    await runConfirmation();

    expect(deleteFiles).not.toHaveBeenCalled();
    expect(notifications().at(-1)).toMatchObject({
      message: i18n.t('auth_files.delete_filtered_none', {
        type: i18n.t('auth_files.filter_claude'),
      }),
      type: 'info',
    });
  });

  it('reports a partial result with success and failure counts', async () => {
    deleteFiles.mockResolvedValue({
      status: 'partial',
      deleted: 1,
      files: ['claude.json'],
      failed: [{ name: 'claude2.json', error: 'busy' }],
    });
    const { result } = await renderLoaded([
      item({ name: 'claude.json', type: 'claude' }),
      item({ name: 'claude2.json', type: 'claude' }),
    ]);

    act(() => {
      result.current.handleDeleteAll(options({ filter: 'claude' }));
    });
    await runConfirmation();

    expect(notifications().at(-1)).toMatchObject({
      message: i18n.t('auth_files.delete_filtered_partial', {
        success: 1,
        failed: 1,
        type: i18n.t('auth_files.filter_claude'),
      }),
      type: 'warning',
    });
  });
});

describe('useAuthFilesData handleDownload', () => {
  it('downloads a blob and notifies success', async () => {
    getRaw.mockResolvedValue({ data: new Blob(['x']) });
    const { result } = await renderLoaded([item({ name: 'a.json' })]);

    await act(async () => {
      await result.current.handleDownload('a.json');
    });

    expect(downloadBlob).toHaveBeenCalledWith(expect.objectContaining({ filename: 'a.json' }));
    expect(notifications().at(-1)).toMatchObject({
      message: i18n.t('auth_files.download_success'),
      type: 'success',
    });
  });

  it('reports a download failure with the error message', async () => {
    getRaw.mockRejectedValue(new Error('dl boom'));
    const { result } = await renderLoaded([item({ name: 'a.json' })]);

    await act(async () => {
      await result.current.handleDownload('a.json');
    });

    expect(notifications().at(-1)).toMatchObject({
      message: `${i18n.t('notification.download_failed')}: dl boom`,
      type: 'error',
    });
  });
});

describe('useAuthFilesData handleStatusToggle', () => {
  it('reflects the server-confirmed disabled state and notifies success', async () => {
    setStatus.mockResolvedValue({ status: 'ok', disabled: true });
    const { result } = await renderLoaded([item({ name: 'a.json', disabled: false })]);

    await act(async () => {
      await result.current.handleStatusToggle(item({ name: 'a.json', disabled: false }), false);
    });

    expect(result.current.files[0].disabled).toBe(true);
    expect(
      notifications().some(
        (n) => n.message === i18n.t('auth_files.status_disabled_success', { name: 'a.json' })
      )
    ).toBe(true);
  });

  it('rolls back to the previous disabled state on failure', async () => {
    setStatus.mockRejectedValue(new Error('toggle boom'));
    const { result } = await renderLoaded([item({ name: 'a.json', disabled: false })]);

    await act(async () => {
      await result.current.handleStatusToggle(item({ name: 'a.json', disabled: false }), false);
    });

    expect(result.current.files[0].disabled).toBe(false);
    expect(notifications().at(-1)).toMatchObject({
      message: `${i18n.t('notification.update_failed')}: toggle boom`,
      type: 'error',
    });
  });
});

describe('useAuthFilesData batchSetStatus', () => {
  it('updates every targeted file and notifies success when all succeed', async () => {
    setStatus.mockResolvedValue({ status: 'ok', disabled: true });
    const { result } = await renderLoaded([
      item({ name: 'a.json', disabled: false }),
      item({ name: 'b.json', disabled: false }),
    ]);

    await act(async () => {
      await result.current.batchSetStatus(['a.json', 'b.json'], false);
    });

    expect(setStatus).toHaveBeenCalledTimes(2);
    expect(notifications().at(-1)).toMatchObject({
      message: i18n.t('auth_files.batch_status_success', { count: 2 }),
      type: 'success',
    });
  });

  it('counts failures and rolls back only the failed files', async () => {
    setStatus.mockImplementation((name: string) =>
      name === 'b.json'
        ? Promise.reject(new Error('b failed'))
        : Promise.resolve({ status: 'ok', disabled: true })
    );
    const { result } = await renderLoaded([
      item({ name: 'a.json', disabled: false }),
      item({ name: 'b.json', disabled: false }),
    ]);

    await act(async () => {
      await result.current.batchSetStatus(['a.json', 'b.json'], false);
    });

    const byName = Object.fromEntries(result.current.files.map((f) => [f.name, f.disabled]));
    expect(byName['a.json']).toBe(true);
    expect(byName['b.json']).toBe(false);
    expect(notifications().at(-1)).toMatchObject({
      message: i18n.t('auth_files.batch_status_partial', { success: 1, failed: 1 }),
      type: 'warning',
    });
  });

  it('does nothing when no names are supplied', async () => {
    const { result } = await renderLoaded([item({ name: 'a.json' })]);

    await act(async () => {
      await result.current.batchSetStatus([], false);
    });

    expect(setStatus).not.toHaveBeenCalled();
  });

  it('ignores names that are not part of the loaded file list', async () => {
    const { result } = await renderLoaded([item({ name: 'a.json' })]);

    await act(async () => {
      await result.current.batchSetStatus(['ghost.json'], false);
    });

    expect(setStatus).not.toHaveBeenCalled();
  });
});

describe('useAuthFilesData batchDownload', () => {
  it('downloads each unique file and notifies success when all succeed', async () => {
    getRaw.mockResolvedValue({ data: new Blob(['x']) });
    const { result } = await renderLoaded([item({ name: 'a.json' }), item({ name: 'b.json' })]);

    await act(async () => {
      await result.current.batchDownload(['a.json', 'b.json', 'a.json']);
    });

    expect(downloadBlob).toHaveBeenCalledTimes(2);
    expect(notifications().at(-1)).toMatchObject({
      message: i18n.t('auth_files.batch_download_success', { count: 2 }),
      type: 'success',
    });
  });

  it('counts failures and reports a partial download result', async () => {
    getRaw.mockImplementation((url: string) =>
      url.includes('b.json')
        ? Promise.reject(new Error('no'))
        : Promise.resolve({ data: new Blob(['x']) })
    );
    const { result } = await renderLoaded([item({ name: 'a.json' }), item({ name: 'b.json' })]);

    await act(async () => {
      await result.current.batchDownload(['a.json', 'b.json']);
    });

    expect(notifications().at(-1)).toMatchObject({
      message: i18n.t('auth_files.batch_download_partial', { success: 1, failed: 1 }),
      type: 'warning',
    });
  });

  it('does nothing when no names are supplied', async () => {
    const { result } = await renderLoaded([item({ name: 'a.json' })]);

    await act(async () => {
      await result.current.batchDownload([]);
    });

    expect(getRaw).not.toHaveBeenCalled();
  });
});

describe('useAuthFilesData batchDelete', () => {
  it('opens a confirmation citing the unique file count', async () => {
    const { result } = await renderLoaded([item({ name: 'a.json' }), item({ name: 'b.json' })]);

    act(() => {
      result.current.batchDelete(['a.json', 'b.json', 'a.json']);
    });

    expect(confirmation().options?.message).toBe(
      i18n.t('auth_files.batch_delete_confirm', { count: 2 })
    );
  });

  it('deletes the files and notifies success when all succeed', async () => {
    deleteFiles.mockResolvedValue({
      status: 'ok',
      deleted: 2,
      files: ['a.json', 'b.json'],
      failed: [],
    });
    const { result } = await renderLoaded([item({ name: 'a.json' }), item({ name: 'b.json' })]);

    act(() => {
      result.current.batchDelete(['a.json', 'b.json']);
    });
    await runConfirmation();

    expect(deleteFiles).toHaveBeenCalledWith(['a.json', 'b.json']);
    expect(notifications().at(-1)).toMatchObject({
      message: `${i18n.t('auth_files.delete_all_success')} (2)`,
      type: 'success',
    });
  });

  it('reports a partial batch delete with success and failure counts', async () => {
    deleteFiles.mockResolvedValue({
      status: 'partial',
      deleted: 1,
      files: ['a.json'],
      failed: [{ name: 'b.json', error: 'busy' }],
    });
    const { result } = await renderLoaded([item({ name: 'a.json' }), item({ name: 'b.json' })]);

    act(() => {
      result.current.batchDelete(['a.json', 'b.json']);
    });
    await runConfirmation();

    expect(notifications().at(-1)).toMatchObject({
      message: i18n.t('auth_files.delete_filtered_partial', {
        success: 1,
        failed: 1,
        type: i18n.t('auth_files.filter_all'),
      }),
      type: 'warning',
    });
  });

  it('does nothing when no names are supplied', async () => {
    const { result } = await renderLoaded([item({ name: 'a.json' })]);

    act(() => {
      result.current.batchDelete([]);
    });

    expect(confirmation().isOpen).toBe(false);
  });
});
