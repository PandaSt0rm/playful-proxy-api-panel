import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import i18n from '@/i18n';
import { useNotificationStore } from '@/stores';
import type { AuthFileItem } from '@/types';
import type { AuthFileFieldsPatch } from '@/services/api';

const downloadText = vi.fn<(name: string) => Promise<string>>();
const patchFields = vi.fn<(name: string, fields: AuthFileFieldsPatch) => Promise<unknown>>();

vi.mock('@/services/api', () => ({
  authFilesApi: {
    downloadText: (name: string) => downloadText(name),
    patchFields: (name: string, fields: AuthFileFieldsPatch) => patchFields(name, fields),
  },
}));

import { useAuthFilesPrefixProxyEditor } from './useAuthFilesPrefixProxyEditor';

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void; reject: (reason?: unknown) => void };

const defer = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const resetNotifications = () => {
  useNotificationStore.setState({
    notifications: [],
    confirmation: { isOpen: false, isLoading: false, options: null },
  });
};

const file = (name: string): AuthFileItem => ({ name });

const setup = (overrides: { disableControls?: boolean; loadFiles?: () => Promise<void> } = {}) => {
  const loadFiles = overrides.loadFiles ?? vi.fn().mockResolvedValue(undefined);
  const rendered = renderHook(() =>
    useAuthFilesPrefixProxyEditor({
      disableControls: overrides.disableControls ?? false,
      loadFiles,
    })
  );
  return { ...rendered, loadFiles };
};

beforeEach(() => {
  resetNotifications();
  downloadText.mockReset();
  patchFields.mockReset();
});

describe('useAuthFilesPrefixProxyEditor open guarded by disableControls', () => {
  it('does not open the editor when controls are disabled', async () => {
    downloadText.mockResolvedValue('{}');
    const { result } = setup({ disableControls: true });

    await act(async () => {
      await result.current.openPrefixProxyEditor(file('a.json'));
    });

    expect(result.current.prefixProxyEditor).toBeNull();
  });

  it('does not call downloadText when controls are disabled', async () => {
    downloadText.mockResolvedValue('{}');
    const { result } = setup({ disableControls: true });

    await act(async () => {
      await result.current.openPrefixProxyEditor(file('a.json'));
    });

    expect(downloadText).not.toHaveBeenCalled();
  });
});

describe('useAuthFilesPrefixProxyEditor open toggle behaviour', () => {
  it('closes the editor when opening the file that is already open', async () => {
    downloadText.mockResolvedValue('{"prefix":"p"}');
    const { result } = setup();
    await act(async () => {
      await result.current.openPrefixProxyEditor(file('a.json'));
    });

    await act(async () => {
      await result.current.openPrefixProxyEditor(file('a.json'));
    });

    expect(result.current.prefixProxyEditor).toBeNull();
  });
});

describe('useAuthFilesPrefixProxyEditor open success parsing', () => {
  it('populates prefix, proxyUrl, priority and note from the downloaded JSON', async () => {
    downloadText.mockResolvedValue(
      JSON.stringify({ prefix: 'pre', proxy_url: 'http://proxy', priority: 5, note: 'hi' })
    );
    const { result } = setup();

    await act(async () => {
      await result.current.openPrefixProxyEditor(file('a.json'));
    });

    const editor = result.current.prefixProxyEditor;
    expect(editor?.prefix).toBe('pre');
    expect(editor?.proxyUrl).toBe('http://proxy');
    expect(editor?.priority).toBe('5');
    expect(editor?.note).toBe('hi');
  });

  it('renders the headers object as pretty-printed text', async () => {
    const headers = { 'X-Token': 'abc' };
    downloadText.mockResolvedValue(JSON.stringify({ headers }));
    const { result } = setup();

    await act(async () => {
      await result.current.openPrefixProxyEditor(file('a.json'));
    });

    expect(result.current.prefixProxyEditor?.headersText).toBe(JSON.stringify(headers, null, 2));
  });

  it('clears the loading flag once the JSON is parsed', async () => {
    downloadText.mockResolvedValue('{"prefix":"pre"}');
    const { result } = setup();

    await act(async () => {
      await result.current.openPrefixProxyEditor(file('a.json'));
    });

    expect(result.current.prefixProxyEditor?.loading).toBe(false);
  });

  it('reports an invalid-json error when the downloaded text is not parseable', async () => {
    downloadText.mockResolvedValue('not json');
    const { result } = setup();

    await act(async () => {
      await result.current.openPrefixProxyEditor(file('a.json'));
    });

    expect(result.current.prefixProxyEditor?.error).toBe(
      i18n.t('auth_files.prefix_proxy_invalid_json')
    );
  });

  it('reports an invalid-json error when the downloaded JSON is an array', async () => {
    downloadText.mockResolvedValue('[1,2,3]');
    const { result } = setup();

    await act(async () => {
      await result.current.openPrefixProxyEditor(file('a.json'));
    });

    expect(result.current.prefixProxyEditor?.error).toBe(
      i18n.t('auth_files.prefix_proxy_invalid_json')
    );
  });

  it('surfaces a download failure as an error and notification', async () => {
    downloadText.mockRejectedValue(new Error('network down'));
    const { result } = setup();

    await act(async () => {
      await result.current.openPrefixProxyEditor(file('a.json'));
    });

    expect(result.current.prefixProxyEditor?.error).toBe('network down');
    expect(useNotificationStore.getState().notifications[0]).toMatchObject({
      message: `${i18n.t('notification.download_failed')}: network down`,
      type: 'error',
    });
  });
});

describe('useAuthFilesPrefixProxyEditor stale-file race guard', () => {
  it('discards a download result whose editor was closed mid-flight', async () => {
    const deferred = defer<string>();
    downloadText.mockReturnValue(deferred.promise);
    const { result } = setup();

    let openPromise: Promise<void>;
    act(() => {
      openPromise = result.current.openPrefixProxyEditor(file('a.json'));
    });
    act(() => {
      result.current.closePrefixProxyEditor();
    });
    await act(async () => {
      deferred.resolve('{"prefix":"late"}');
      await openPromise;
    });

    expect(result.current.prefixProxyEditor).toBeNull();
  });

  it('does not overwrite a different file opened while the first download is pending', async () => {
    const firstDownload = defer<string>();
    const secondDownload = defer<string>();
    downloadText
      .mockReturnValueOnce(firstDownload.promise)
      .mockReturnValueOnce(secondDownload.promise);
    const { result } = setup();

    let firstOpen: Promise<void>;
    act(() => {
      firstOpen = result.current.openPrefixProxyEditor(file('a.json'));
    });
    let secondOpen: Promise<void>;
    act(() => {
      secondOpen = result.current.openPrefixProxyEditor(file('b.json'));
    });
    await act(async () => {
      secondDownload.resolve('{"prefix":"second"}');
      await secondOpen;
      firstDownload.resolve('{"prefix":"first"}');
      await firstOpen;
    });

    expect(result.current.prefixProxyEditor?.fileName).toBe('b.json');
    expect(result.current.prefixProxyEditor?.prefix).toBe('second');
  });
});

describe('useAuthFilesPrefixProxyEditor change handling and dirty tracking', () => {
  it('is not dirty immediately after opening an unmodified file', async () => {
    downloadText.mockResolvedValue(JSON.stringify({ prefix: 'pre' }));
    const { result } = setup();

    await act(async () => {
      await result.current.openPrefixProxyEditor(file('a.json'));
    });

    expect(result.current.prefixProxyDirty).toBe(false);
  });

  it('becomes dirty after the prefix is changed', async () => {
    downloadText.mockResolvedValue(JSON.stringify({ prefix: 'pre' }));
    const { result } = setup();
    await act(async () => {
      await result.current.openPrefixProxyEditor(file('a.json'));
    });

    act(() => {
      result.current.handlePrefixProxyChange('prefix', 'changed');
    });

    expect(result.current.prefixProxyDirty).toBe(true);
  });

  it('marks the note as touched when the note field changes', async () => {
    downloadText.mockResolvedValue('{}');
    const { result } = setup();
    await act(async () => {
      await result.current.openPrefixProxyEditor(file('a.json'));
    });

    act(() => {
      result.current.handlePrefixProxyChange('note', 'a note');
    });

    expect(result.current.prefixProxyEditor?.noteTouched).toBe(true);
  });

  it('records a headers validation error when invalid JSON is typed', async () => {
    downloadText.mockResolvedValue('{}');
    const { result } = setup();
    await act(async () => {
      await result.current.openPrefixProxyEditor(file('a.json'));
    });

    act(() => {
      result.current.handlePrefixProxyChange('headersText', '{bad');
    });

    expect(result.current.prefixProxyEditor?.headersError).toBe(
      i18n.t('auth_files.headers_invalid_json')
    );
  });

  it('blanks the updated-text preview while a headers validation error is active', async () => {
    downloadText.mockResolvedValue('{}');
    const { result } = setup();
    await act(async () => {
      await result.current.openPrefixProxyEditor(file('a.json'));
    });

    act(() => {
      result.current.handlePrefixProxyChange('headersText', '{bad');
    });

    expect(result.current.prefixProxyUpdatedText).toBe('');
  });

  it('produces an updated-text preview with the changed prefix serialized', async () => {
    downloadText.mockResolvedValue(JSON.stringify({ prefix: 'old' }));
    const { result } = setup();
    await act(async () => {
      await result.current.openPrefixProxyEditor(file('a.json'));
    });

    act(() => {
      result.current.handlePrefixProxyChange('prefix', 'fresh');
    });

    expect(JSON.parse(result.current.prefixProxyUpdatedText)).toEqual({ prefix: 'fresh' });
  });
});

describe('useAuthFilesPrefixProxyEditor save', () => {
  it('patches only the changed prefix field', async () => {
    downloadText.mockResolvedValue(JSON.stringify({ prefix: 'old', proxy_url: 'http://p' }));
    patchFields.mockResolvedValue(undefined);
    const { result } = setup();
    await act(async () => {
      await result.current.openPrefixProxyEditor(file('a.json'));
    });
    act(() => {
      result.current.handlePrefixProxyChange('prefix', 'new');
    });

    await act(async () => {
      await result.current.handlePrefixProxySave();
    });

    expect(patchFields).toHaveBeenCalledWith('a.json', { prefix: 'new' });
  });

  it('reloads the file list and closes the editor after a successful save', async () => {
    downloadText.mockResolvedValue(JSON.stringify({ prefix: 'old' }));
    patchFields.mockResolvedValue(undefined);
    const loadFiles = vi.fn().mockResolvedValue(undefined);
    const { result } = setup({ loadFiles });
    await act(async () => {
      await result.current.openPrefixProxyEditor(file('a.json'));
    });
    act(() => {
      result.current.handlePrefixProxyChange('prefix', 'new');
    });

    await act(async () => {
      await result.current.handlePrefixProxySave();
    });

    expect(loadFiles).toHaveBeenCalledTimes(1);
    expect(result.current.prefixProxyEditor).toBeNull();
  });

  it('shows a success notification with the file name after saving', async () => {
    downloadText.mockResolvedValue(JSON.stringify({ prefix: 'old' }));
    patchFields.mockResolvedValue(undefined);
    const { result } = setup();
    await act(async () => {
      await result.current.openPrefixProxyEditor(file('a.json'));
    });
    act(() => {
      result.current.handlePrefixProxyChange('prefix', 'new');
    });

    await act(async () => {
      await result.current.handlePrefixProxySave();
    });

    expect(useNotificationStore.getState().notifications[0]).toMatchObject({
      message: i18n.t('auth_files.prefix_proxy_saved_success', { name: 'a.json' }),
      type: 'success',
    });
  });

  it('does not call patchFields when there are no changes to save', async () => {
    downloadText.mockResolvedValue(JSON.stringify({ prefix: 'old' }));
    const { result } = setup();
    await act(async () => {
      await result.current.openPrefixProxyEditor(file('a.json'));
    });

    await act(async () => {
      await result.current.handlePrefixProxySave();
    });

    expect(patchFields).not.toHaveBeenCalled();
  });

  it('keeps the editor open with saving cleared after a failed save', async () => {
    downloadText.mockResolvedValue(JSON.stringify({ prefix: 'old' }));
    patchFields.mockRejectedValue(new Error('save boom'));
    const loadFiles = vi.fn().mockResolvedValue(undefined);
    const { result } = setup({ loadFiles });
    await act(async () => {
      await result.current.openPrefixProxyEditor(file('a.json'));
    });
    act(() => {
      result.current.handlePrefixProxyChange('prefix', 'new');
    });

    await act(async () => {
      await result.current.handlePrefixProxySave();
    });

    expect(result.current.prefixProxyEditor?.fileName).toBe('a.json');
    expect(result.current.prefixProxyEditor?.saving).toBe(false);
    expect(loadFiles).not.toHaveBeenCalled();
  });

  it('shows an update-failed notification carrying the error message after a failed save', async () => {
    downloadText.mockResolvedValue(JSON.stringify({ prefix: 'old' }));
    patchFields.mockRejectedValue(new Error('save boom'));
    const { result } = setup();
    await act(async () => {
      await result.current.openPrefixProxyEditor(file('a.json'));
    });
    act(() => {
      result.current.handlePrefixProxyChange('prefix', 'new');
    });

    await act(async () => {
      await result.current.handlePrefixProxySave();
    });

    expect(useNotificationStore.getState().notifications[0]).toMatchObject({
      message: `${i18n.t('notification.update_failed')}: save boom`,
      type: 'error',
    });
  });
});
