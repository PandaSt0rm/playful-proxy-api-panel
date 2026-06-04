import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  authFilesApi,
  isAuthFileInvalidJsonObjectError,
  AUTH_FILE_INVALID_JSON_OBJECT_ERROR,
} from './authFiles';
import { apiClient } from './client';

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    post: vi.fn(),
    postForm: vi.fn(),
    getRaw: vi.fn(),
  },
}));

const mockedGet = vi.mocked(apiClient.get);
const mockedPut = vi.mocked(apiClient.put);
const mockedPatch = vi.mocked(apiClient.patch);
const mockedDelete = vi.mocked(apiClient.delete);
const mockedPostForm = vi.mocked(apiClient.postForm);
const mockedGetRaw = vi.mocked(apiClient.getRaw);

beforeEach(() => {
  mockedGet.mockReset();
  mockedPut.mockReset();
  mockedPatch.mockReset();
  mockedDelete.mockReset();
  mockedPostForm.mockReset();
  mockedGetRaw.mockReset();
});

describe('authFilesApi.list deduplication', () => {
  it('collapses entries that share a name into one merged entry', async () => {
    mockedGet.mockResolvedValue({
      files: [
        { name: 'a.json', source: 'file', path: '/a.json' },
        { name: 'a.json', note: 'extra note' },
      ],
    });

    const result = await authFilesApi.list();

    expect(result.files).toHaveLength(1);
  });

  it('fills missing fields on the primary entry from secondary duplicates', async () => {
    mockedGet.mockResolvedValue({
      files: [
        { name: 'a.json', source: 'file', path: '/a.json' },
        { name: 'a.json', note: 'extra note' },
      ],
    });

    const result = await authFilesApi.list();

    expect(result.files[0].note).toBe('extra note');
  });

  it('does not overwrite a meaningful field on the primary entry', async () => {
    mockedGet.mockResolvedValue({
      files: [
        { name: 'a.json', source: 'file', path: '/a.json', note: 'primary' },
        { name: 'a.json', note: 'secondary' },
      ],
    });

    const result = await authFilesApi.list();

    expect(result.files[0].note).toBe('primary');
  });

  it('reports the deduplicated count in total', async () => {
    mockedGet.mockResolvedValue({
      files: [{ name: 'b.json' }, { name: 'a.json' }, { name: 'a.json' }],
    });

    const result = await authFilesApi.list();

    expect(result.total).toBe(2);
  });

  it('sorts the deduplicated files by name', async () => {
    mockedGet.mockResolvedValue({
      files: [{ name: 'c.json' }, { name: 'a.json' }, { name: 'b.json' }],
    });

    const result = await authFilesApi.list();

    expect(result.files.map((f) => f.name)).toEqual(['a.json', 'b.json', 'c.json']);
  });

  it('treats nameless entries as distinct via their JSON shape', async () => {
    mockedGet.mockResolvedValue({
      files: [{ source: 'file' }, { source: 'memory' }],
    });

    const result = await authFilesApi.list();

    expect(result.files).toHaveLength(2);
  });

  it('returns an empty file list when files is not an array', async () => {
    mockedGet.mockResolvedValue({ files: 'oops' });

    const result = await authFilesApi.list();

    expect(result).toMatchObject({ files: [], total: 0 });
  });

  it('preserves unrelated top-level payload fields', async () => {
    mockedGet.mockResolvedValue({ files: [{ name: 'a.json' }], extra: 'keep-me' });

    const result = await authFilesApi.list();

    expect((result as Record<string, unknown>).extra).toBe('keep-me');
  });

  it('keeps a file-sourced entry as primary over a runtime-only duplicate', async () => {
    mockedGet.mockResolvedValue({
      files: [
        { name: 'a.json', runtime_only: true, note: 'runtime' },
        { name: 'a.json', source: 'file', path: '/a.json' },
      ],
    });

    const result = await authFilesApi.list();

    expect(result.files[0].path).toBe('/a.json');
  });
});

describe('authFilesApi.uploadFiles batch normalization', () => {
  it('short-circuits to an empty ok result when no files are given', async () => {
    const result = await authFilesApi.uploadFiles([]);

    expect(result).toEqual({ status: 'ok', uploaded: 0, files: [], failed: [] });
  });

  it('does not call the client when there are no files', async () => {
    await authFilesApi.uploadFiles([]);

    expect(mockedPostForm).not.toHaveBeenCalled();
  });

  it('posts a multipart form to /auth-files', async () => {
    mockedPostForm.mockResolvedValue({ status: 'ok', uploaded: 1, files: ['a.json'] });

    await authFilesApi.uploadFiles([new File(['{}'], 'a.json')]);

    expect(mockedPostForm).toHaveBeenCalledWith('/auth-files', expect.any(FormData));
  });

  it('returns the uploaded file names reported by the server', async () => {
    mockedPostForm.mockResolvedValue({ status: 'ok', uploaded: 2, files: ['a.json', 'b.json'] });

    const result = await authFilesApi.uploadFiles([
      new File(['{}'], 'a.json'),
      new File(['{}'], 'b.json'),
    ]);

    expect(result).toEqual({ status: 'ok', uploaded: 2, files: ['a.json', 'b.json'], failed: [] });
  });

  it('infers a single successful upload when the server omits counts', async () => {
    mockedPostForm.mockResolvedValue({});

    const result = await authFilesApi.uploadFiles([new File(['{}'], 'only.json')]);

    expect(result).toEqual({ status: 'ok', uploaded: 1, files: ['only.json'], failed: [] });
  });

  it('derives uploaded file names from the requested names when all succeed', async () => {
    mockedPostForm.mockResolvedValue({ uploaded: 2 });

    const result = await authFilesApi.uploadFiles([
      new File(['{}'], 'a.json'),
      new File(['{}'], 'b.json'),
    ]);

    expect(result.files).toEqual(['a.json', 'b.json']);
  });

  it('normalizes failures and excludes failed files from the derived success list', async () => {
    mockedPostForm.mockResolvedValue({
      uploaded: 1,
      failed: [{ name: 'b.json', error: 'bad json' }],
    });

    const result = await authFilesApi.uploadFiles([
      new File(['{}'], 'a.json'),
      new File(['{}'], 'b.json'),
    ]);

    expect(result).toEqual({
      status: 'partial',
      uploaded: 1,
      files: ['a.json'],
      failed: [{ name: 'b.json', error: 'bad json' }],
    });
  });

  it('reads a failure message from the message field when error is absent', async () => {
    mockedPostForm.mockResolvedValue({
      uploaded: 0,
      failed: [{ name: 'a.json', message: 'rejected' }],
    });

    const result = await authFilesApi.uploadFiles([new File(['{}'], 'a.json')]);

    expect(result.failed).toEqual([{ name: 'a.json', error: 'rejected' }]);
  });

  it('substitutes a default error message when a failure has a name but no error text', async () => {
    mockedPostForm.mockResolvedValue({
      uploaded: 0,
      failed: [{ name: 'a.json' }],
    });

    const result = await authFilesApi.uploadFiles([new File(['{}'], 'a.json')]);

    expect(result.failed).toEqual([{ name: 'a.json', error: 'Unknown error' }]);
  });

  it('counts uploaded from server file names when the numeric count is absent', async () => {
    mockedPostForm.mockResolvedValue({ files: ['a.json', 'b.json'] });

    const result = await authFilesApi.uploadFiles([
      new File(['{}'], 'a.json'),
      new File(['{}'], 'b.json'),
    ]);

    expect(result.uploaded).toBe(2);
  });
});

describe('authFilesApi.deleteFiles batch normalization', () => {
  it('short-circuits to an empty ok result when names are blank or duplicated away', async () => {
    const result = await authFilesApi.deleteFiles(['', '   ']);

    expect(result).toEqual({ status: 'ok', deleted: 0, files: [], failed: [] });
  });

  it('does not call the client when the normalized name list is empty', async () => {
    await authFilesApi.deleteFiles(['', '  ']);

    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it('sends the deduplicated, trimmed names in the request body', async () => {
    mockedDelete.mockResolvedValue({ status: 'ok', deleted: 2 });

    await authFilesApi.deleteFiles(['  a.json ', 'a.json', 'b.json']);

    expect(mockedDelete).toHaveBeenCalledWith('/auth-files', {
      data: { names: ['a.json', 'b.json'] },
    });
  });

  it('derives deleted file names from requested names when all succeed', async () => {
    mockedDelete.mockResolvedValue({ deleted: 2 });

    const result = await authFilesApi.deleteFiles(['a.json', 'b.json']);

    expect(result).toEqual({
      status: 'ok',
      deleted: 2,
      files: ['a.json', 'b.json'],
      failed: [],
    });
  });

  it('reports a partial status with failures', async () => {
    mockedDelete.mockResolvedValue({ deleted: 1, failed: [{ name: 'b.json', error: 'locked' }] });

    const result = await authFilesApi.deleteFiles(['a.json', 'b.json']);

    expect(result).toEqual({
      status: 'partial',
      deleted: 1,
      files: ['a.json'],
      failed: [{ name: 'b.json', error: 'locked' }],
    });
  });

  it('infers a single delete when one name is requested and the server omits counts', async () => {
    mockedDelete.mockResolvedValue({});

    const result = await authFilesApi.deleteFiles(['only.json']);

    expect(result).toEqual({ status: 'ok', deleted: 1, files: ['only.json'], failed: [] });
  });
});

describe('authFilesApi.deleteAll', () => {
  it('deletes with an all=true query param', async () => {
    mockedDelete.mockResolvedValue(undefined);

    await authFilesApi.deleteAll();

    expect(mockedDelete).toHaveBeenCalledWith('/auth-files', { params: { all: true } });
  });
});

describe('authFilesApi.cleanupDisabled', () => {
  it('uses the server-reported files as the requested names for normalization', async () => {
    mockedDelete.mockResolvedValue({ deleted: 2, files: ['a.json', 'b.json'] });

    const result = await authFilesApi.cleanupDisabled();

    expect(result).toEqual({
      status: 'ok',
      deleted: 2,
      files: ['a.json', 'b.json'],
      failed: [],
    });
  });

  it('requests the disabled cleanup endpoint', async () => {
    mockedDelete.mockResolvedValue({ deleted: 0 });

    await authFilesApi.cleanupDisabled();

    expect(mockedDelete).toHaveBeenCalledWith('/auth-files/disabled');
  });
});

describe('authFilesApi.setStatus / patchFields', () => {
  it('patches the status endpoint with name and disabled', async () => {
    mockedPatch.mockResolvedValue({ status: 'ok', disabled: true });

    await authFilesApi.setStatus('a.json', true);

    expect(mockedPatch).toHaveBeenCalledWith('/auth-files/status', {
      name: 'a.json',
      disabled: true,
    });
  });

  it('patches the fields endpoint with name spread alongside the patch fields', async () => {
    mockedPatch.mockResolvedValue(undefined);

    await authFilesApi.patchFields('a.json', { prefix: 'p', priority: 3 });

    expect(mockedPatch).toHaveBeenCalledWith('/auth-files/fields', {
      name: 'a.json',
      prefix: 'p',
      priority: 3,
    });
  });
});

describe('authFilesApi.downloadText / downloadJsonObject', () => {
  it('returns the blob text from a URL-encoded download endpoint', async () => {
    mockedGetRaw.mockResolvedValue({ data: new Blob(['hello']) } as never);

    const text = await authFilesApi.downloadText('my file.json');

    expect(text).toBe('hello');
  });

  it('encodes the file name in the download query', async () => {
    mockedGetRaw.mockResolvedValue({ data: new Blob(['{}']) } as never);

    await authFilesApi.downloadText('a b.json');

    expect(mockedGetRaw).toHaveBeenCalledWith('/auth-files/download?name=a%20b.json', {
      responseType: 'blob',
    });
  });

  it('parses a valid JSON object download into a record', async () => {
    mockedGetRaw.mockResolvedValue({ data: new Blob(['{"a":1}']) } as never);

    const result = await authFilesApi.downloadJsonObject('a.json');

    expect(result).toEqual({ a: 1 });
  });

  it('throws the invalid-json-object error for malformed JSON', async () => {
    mockedGetRaw.mockResolvedValue({ data: new Blob(['not json']) } as never);

    await expect(authFilesApi.downloadJsonObject('a.json')).rejects.toThrow(
      AUTH_FILE_INVALID_JSON_OBJECT_ERROR
    );
  });

  it('throws the invalid-json-object error when the JSON is an array', async () => {
    mockedGetRaw.mockResolvedValue({ data: new Blob(['[1,2,3]']) } as never);

    await expect(authFilesApi.downloadJsonObject('a.json')).rejects.toThrow(
      AUTH_FILE_INVALID_JSON_OBJECT_ERROR
    );
  });

  it('throws the invalid-json-object error when the JSON is a primitive', async () => {
    mockedGetRaw.mockResolvedValue({ data: new Blob(['42']) } as never);

    await expect(authFilesApi.downloadJsonObject('a.json')).rejects.toThrow(
      AUTH_FILE_INVALID_JSON_OBJECT_ERROR
    );
  });
});

describe('isAuthFileInvalidJsonObjectError', () => {
  it('returns true for the sentinel error', () => {
    expect(
      isAuthFileInvalidJsonObjectError(new Error(AUTH_FILE_INVALID_JSON_OBJECT_ERROR))
    ).toBe(true);
  });

  it('returns false for an unrelated error', () => {
    expect(isAuthFileInvalidJsonObjectError(new Error('something else'))).toBe(false);
  });

  it('returns false for a non-error value', () => {
    expect(isAuthFileInvalidJsonObjectError('a string')).toBe(false);
  });
});

describe('authFilesApi.saveText / saveJsonObject', () => {
  it('uploads a file built from the provided text', async () => {
    mockedPostForm.mockResolvedValue({ status: 'ok', uploaded: 1, files: ['a.json'] });

    await authFilesApi.saveText('a.json', '{"x":1}');

    expect(mockedPostForm).toHaveBeenCalledWith('/auth-files', expect.any(FormData));
  });

  it('serializes the json object to text before uploading', async () => {
    mockedPostForm.mockResolvedValue({ status: 'ok', uploaded: 1, files: ['a.json'] });

    await authFilesApi.saveJsonObject('a.json', { x: 1 });

    const formArg = mockedPostForm.mock.calls[0][1] as FormData;
    const file = formArg.get('file') as File;
    const text = await file.text();

    expect(text).toBe('{"x":1}');
  });
});

describe('authFilesApi.getOauthExcludedModels', () => {
  it('lower-cases provider keys and trims model names', async () => {
    mockedGet.mockResolvedValue({
      'oauth-excluded-models': { OpenAI: ['  gpt-4 ', 'gpt-3.5'] },
    });

    const result = await authFilesApi.getOauthExcludedModels();

    expect(result).toEqual({ openai: ['gpt-4', 'gpt-3.5'] });
  });

  it('splits a comma/newline separated string into a model list', async () => {
    mockedGet.mockResolvedValue({
      'oauth-excluded-models': { gemini: 'a,b\nc' },
    });

    const result = await authFilesApi.getOauthExcludedModels();

    expect(result).toEqual({ gemini: ['a', 'b', 'c'] });
  });

  it('deduplicates models case-insensitively while keeping the first casing', async () => {
    mockedGet.mockResolvedValue({
      'oauth-excluded-models': { claude: ['Opus', 'opus', 'Sonnet'] },
    });

    const result = await authFilesApi.getOauthExcludedModels();

    expect(result).toEqual({ claude: ['Opus', 'Sonnet'] });
  });

  it('reads from the items fallback key', async () => {
    mockedGet.mockResolvedValue({ items: { foo: ['bar'] } });

    const result = await authFilesApi.getOauthExcludedModels();

    expect(result).toEqual({ foo: ['bar'] });
  });

  it('returns an empty map for a null payload', async () => {
    mockedGet.mockResolvedValue(null);

    const result = await authFilesApi.getOauthExcludedModels();

    expect(result).toEqual({});
  });

  it('drops blank provider keys', async () => {
    mockedGet.mockResolvedValue({ 'oauth-excluded-models': { '   ': ['x'], real: ['y'] } });

    const result = await authFilesApi.getOauthExcludedModels();

    expect(result).toEqual({ real: ['y'] });
  });
});

describe('authFilesApi.getOauthModelAlias', () => {
  it('normalizes channel keys to lower case and keeps name/alias pairs', async () => {
    mockedGet.mockResolvedValue({
      'oauth-model-alias': { Codex: [{ name: 'gpt-4', alias: 'smart' }] },
    });

    const result = await authFilesApi.getOauthModelAlias();

    expect(result).toEqual({ codex: [{ name: 'gpt-4', alias: 'smart' }] });
  });

  it('drops mappings missing a name or alias', async () => {
    mockedGet.mockResolvedValue({
      'oauth-model-alias': {
        codex: [{ name: 'gpt-4', alias: '' }, { name: '', alias: 'x' }, { name: 'g', alias: 'a' }],
      },
    });

    const result = await authFilesApi.getOauthModelAlias();

    expect(result).toEqual({ codex: [{ name: 'g', alias: 'a' }] });
  });

  it('preserves a fork flag when set to true', async () => {
    mockedGet.mockResolvedValue({
      'oauth-model-alias': { codex: [{ name: 'g', alias: 'a', fork: true }] },
    });

    const result = await authFilesApi.getOauthModelAlias();

    expect(result).toEqual({ codex: [{ name: 'g', alias: 'a', fork: true }] });
  });

  it('deduplicates identical name/alias/fork triples', async () => {
    mockedGet.mockResolvedValue({
      'oauth-model-alias': {
        codex: [
          { name: 'g', alias: 'a' },
          { name: 'G', alias: 'A' },
        ],
      },
    });

    const result = await authFilesApi.getOauthModelAlias();

    expect(result).toEqual({ codex: [{ name: 'g', alias: 'a' }] });
  });

  it('falls back to id then model for the entry name', async () => {
    mockedGet.mockResolvedValue({
      'oauth-model-alias': {
        codex: [
          { id: 'from-id', alias: 'a' },
          { model: 'from-model', alias: 'b' },
        ],
      },
    });

    const result = await authFilesApi.getOauthModelAlias();

    expect(result).toEqual({
      codex: [
        { name: 'from-id', alias: 'a' },
        { name: 'from-model', alias: 'b' },
      ],
    });
  });

  it('omits channels whose mappings is not an array', async () => {
    mockedGet.mockResolvedValue({
      'oauth-model-alias': { codex: 'not-an-array', real: [{ name: 'g', alias: 'a' }] },
    });

    const result = await authFilesApi.getOauthModelAlias();

    expect(result).toEqual({ real: [{ name: 'g', alias: 'a' }] });
  });

  it('omits channels that end up with no valid mappings', async () => {
    mockedGet.mockResolvedValue({
      'oauth-model-alias': { codex: [{ name: '', alias: '' }] },
    });

    const result = await authFilesApi.getOauthModelAlias();

    expect(result).toEqual({});
  });
});

describe('authFilesApi.saveOauthModelAlias', () => {
  it('patches the lower-cased channel with normalized aliases', async () => {
    mockedPatch.mockResolvedValue(undefined);

    await authFilesApi.saveOauthModelAlias('Codex', [{ name: 'gpt-4', alias: 'smart' }]);

    expect(mockedPatch).toHaveBeenCalledWith('/oauth-model-alias', {
      channel: 'codex',
      aliases: [{ name: 'gpt-4', alias: 'smart' }],
    });
  });

  it('sends an empty aliases array when all entries are invalid', async () => {
    mockedPatch.mockResolvedValue(undefined);

    await authFilesApi.saveOauthModelAlias('codex', [{ name: '', alias: '' }]);

    expect(mockedPatch).toHaveBeenCalledWith('/oauth-model-alias', {
      channel: 'codex',
      aliases: [],
    });
  });
});

describe('authFilesApi.deleteOauthModelAlias', () => {
  it('patches an empty aliases array for the channel by default', async () => {
    mockedPatch.mockResolvedValue(undefined);

    await authFilesApi.deleteOauthModelAlias('Codex');

    expect(mockedPatch).toHaveBeenCalledWith('/oauth-model-alias', {
      channel: 'codex',
      aliases: [],
    });
  });

  it('falls back to a DELETE request when the patch returns 405', async () => {
    mockedPatch.mockRejectedValue({ status: 405 });
    mockedDelete.mockResolvedValue(undefined);

    await authFilesApi.deleteOauthModelAlias('Codex');

    expect(mockedDelete).toHaveBeenCalledWith('/oauth-model-alias?channel=codex');
  });

  it('rethrows a non-405 patch error without falling back to DELETE', async () => {
    mockedPatch.mockRejectedValue({ status: 500 });

    await expect(authFilesApi.deleteOauthModelAlias('codex')).rejects.toEqual({ status: 500 });
    expect(mockedDelete).not.toHaveBeenCalled();
  });
});

describe('authFilesApi.replaceOauthExcludedModels', () => {
  it('puts a normalized excluded-models map', async () => {
    mockedPut.mockResolvedValue(undefined);

    await authFilesApi.replaceOauthExcludedModels({ OpenAI: ['  gpt-4 '] });

    expect(mockedPut).toHaveBeenCalledWith('/oauth-excluded-models', { openai: ['gpt-4'] });
  });
});

describe('authFilesApi.getModelsForAuthFile', () => {
  it('returns the models array from the response', async () => {
    mockedGet.mockResolvedValue({ models: [{ id: 'gpt-4' }, { id: 'gpt-3.5' }] });

    const result = await authFilesApi.getModelsForAuthFile('a.json');

    expect(result).toEqual([{ id: 'gpt-4' }, { id: 'gpt-3.5' }]);
  });

  it('encodes the file name in the request URL', async () => {
    mockedGet.mockResolvedValue({ models: [] });

    await authFilesApi.getModelsForAuthFile('a b.json');

    expect(mockedGet).toHaveBeenCalledWith('/auth-files/models?name=a%20b.json');
  });

  it('returns an empty array when models is not an array', async () => {
    mockedGet.mockResolvedValue({ models: 'nope' });

    const result = await authFilesApi.getModelsForAuthFile('a.json');

    expect(result).toEqual([]);
  });
});

describe('authFilesApi.getModelDefinitions', () => {
  it('returns an empty array for a blank channel without calling the client', async () => {
    const result = await authFilesApi.getModelDefinitions('   ');

    expect(result).toEqual([]);
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it('requests a URL-encoded lower-cased channel path', async () => {
    mockedGet.mockResolvedValue({ models: [] });

    await authFilesApi.getModelDefinitions('Gemini CLI');

    expect(mockedGet).toHaveBeenCalledWith('/model-definitions/gemini%20cli');
  });

  it('returns the models array from the response', async () => {
    mockedGet.mockResolvedValue({ models: [{ id: 'm1' }] });

    const result = await authFilesApi.getModelDefinitions('codex');

    expect(result).toEqual([{ id: 'm1' }]);
  });
});

describe('authFilesApi.exportArchive', () => {
  it('requests the export endpoint as a blob with a 60s timeout', async () => {
    mockedGetRaw.mockResolvedValue({ data: new Blob([]) } as never);

    await authFilesApi.exportArchive();

    expect(mockedGetRaw).toHaveBeenCalledWith('/auth-files/export', {
      responseType: 'blob',
      timeout: 60_000,
    });
  });
});
