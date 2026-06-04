import { describe, it, expect, vi, afterEach } from 'vitest';

import { copyToClipboard } from './clipboard';

describe('copyToClipboard', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('writes the text via the async clipboard API and returns true', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    const result = await copyToClipboard('hello');

    expect(result).toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('falls back to execCommand and returns its result when the clipboard API rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const execCommand = vi.fn().mockReturnValue(true);
    document.execCommand = execCommand as unknown as typeof document.execCommand;

    const result = await copyToClipboard('fallback-text');

    expect(result).toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
  });

  it('returns false when the execCommand fallback reports failure', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    document.execCommand = vi.fn().mockReturnValue(false) as unknown as typeof document.execCommand;

    const result = await copyToClipboard('text');

    expect(result).toBe(false);
  });

  it('uses the execCommand fallback when the async clipboard API is absent', async () => {
    vi.stubGlobal('navigator', {});
    const execCommand = vi.fn().mockReturnValue(true);
    document.execCommand = execCommand as unknown as typeof document.execCommand;

    const result = await copyToClipboard('no-async-api');

    expect(result).toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
  });

  it('puts the requested text into the temporary textarea before copying', async () => {
    vi.stubGlobal('navigator', {});
    let copiedValue: string | null = null;
    document.execCommand = vi.fn(() => {
      const textarea = document.querySelector('textarea');
      copiedValue = textarea ? textarea.value : null;
      return true;
    }) as unknown as typeof document.execCommand;

    await copyToClipboard('captured-content');

    expect(copiedValue).toBe('captured-content');
  });

  it('removes the temporary textarea after the fallback copy completes', async () => {
    vi.stubGlobal('navigator', {});
    document.execCommand = vi.fn().mockReturnValue(true) as unknown as typeof document.execCommand;

    await copyToClipboard('cleanup');

    expect(document.querySelector('textarea')).toBeNull();
  });

  it('restores focus to the previously active element after the fallback copy', async () => {
    vi.stubGlobal('navigator', {});
    document.execCommand = vi.fn().mockReturnValue(true) as unknown as typeof document.execCommand;
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    await copyToClipboard('refocus');

    expect(document.activeElement).toBe(input);

    input.remove();
  });

  it('returns false when execCommand throws during the fallback', async () => {
    vi.stubGlobal('navigator', {});
    document.execCommand = vi.fn(() => {
      throw new Error('boom');
    }) as unknown as typeof document.execCommand;

    const result = await copyToClipboard('throws');

    expect(result).toBe(false);
  });
});
