import { describe, it, expect, vi, beforeEach } from 'vitest';

import { vertexApi, type VertexImportResponse } from './vertex';
import { apiClient } from './client';

vi.mock('./client', () => ({
  apiClient: {
    postForm: vi.fn(),
  },
}));

const mockedPostForm = vi.mocked(apiClient.postForm);

const makeFile = (name = 'cred.json') =>
  new File(['{"project_id":"p"}'], name, { type: 'application/json' });

beforeEach(() => {
  mockedPostForm.mockReset();
});

describe('vertexApi.importCredential', () => {
  it('posts to the /vertex/import endpoint', async () => {
    mockedPostForm.mockResolvedValue({ status: 'ok' } as VertexImportResponse);

    await vertexApi.importCredential(makeFile());

    expect(mockedPostForm).toHaveBeenCalledWith('/vertex/import', expect.any(FormData));
  });

  it('appends the file to the form data under the file field', async () => {
    mockedPostForm.mockResolvedValue({ status: 'ok' } as VertexImportResponse);
    const file = makeFile('my-cred.json');

    await vertexApi.importCredential(file);

    const formData = mockedPostForm.mock.calls[0][1];
    expect(formData.get('file')).toBe(file);
  });

  it('appends the location field when a location is provided', async () => {
    mockedPostForm.mockResolvedValue({ status: 'ok' } as VertexImportResponse);

    await vertexApi.importCredential(makeFile(), 'us-central1');

    const formData = mockedPostForm.mock.calls[0][1];
    expect(formData.get('location')).toBe('us-central1');
  });

  it('omits the location field when no location is provided', async () => {
    mockedPostForm.mockResolvedValue({ status: 'ok' } as VertexImportResponse);

    await vertexApi.importCredential(makeFile());

    const formData = mockedPostForm.mock.calls[0][1];
    expect(formData.has('location')).toBe(false);
  });

  it('omits the location field when location is an empty string', async () => {
    mockedPostForm.mockResolvedValue({ status: 'ok' } as VertexImportResponse);

    await vertexApi.importCredential(makeFile(), '');

    const formData = mockedPostForm.mock.calls[0][1];
    expect(formData.has('location')).toBe(false);
  });

  it('returns the import response unchanged', async () => {
    const response: VertexImportResponse = {
      status: 'ok',
      project_id: 'proj',
      email: 'svc@example.com',
    };
    mockedPostForm.mockResolvedValue(response);

    const result = await vertexApi.importCredential(makeFile());

    expect(result).toBe(response);
  });

  it('propagates errors raised by the client', async () => {
    mockedPostForm.mockRejectedValue(new Error('import failed'));

    await expect(vertexApi.importCredential(makeFile())).rejects.toThrow('import failed');
  });
});
