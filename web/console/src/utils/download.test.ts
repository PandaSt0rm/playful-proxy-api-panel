import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { downloadBlob } from './download';

describe('downloadBlob', () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    createObjectURL = vi.fn().mockReturnValue('blob:mock-url');
    revokeObjectURL = vi.fn();
    window.URL.createObjectURL = createObjectURL as unknown as typeof window.URL.createObjectURL;
    window.URL.revokeObjectURL = revokeObjectURL as unknown as typeof window.URL.revokeObjectURL;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates an object URL from the provided blob', () => {
    const blob = new Blob(['data'], { type: 'text/plain' });

    downloadBlob({ filename: 'out.txt', blob });

    expect(createObjectURL).toHaveBeenCalledWith(blob);
  });

  it('triggers a click on an anchor carrying the object URL and filename', () => {
    const blob = new Blob(['data']);
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadBlob({ filename: 'report.csv', blob });

    const clickedAnchor = clickSpy.mock.instances[0] as HTMLAnchorElement;
    expect(clickedAnchor.download).toBe('report.csv');
    expect(clickedAnchor.getAttribute('href')).toBe('blob:mock-url');

    clickSpy.mockRestore();
  });

  it('sets rel="noopener" on the download anchor', () => {
    const blob = new Blob(['data']);
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadBlob({ filename: 'f.bin', blob });

    const clickedAnchor = clickSpy.mock.instances[0] as HTMLAnchorElement;
    expect(clickedAnchor.rel).toBe('noopener');

    clickSpy.mockRestore();
  });

  it('does not revoke the object URL before the delay elapses', () => {
    const blob = new Blob(['data']);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadBlob({ filename: 'f.bin', blob, revokeDelayMs: 1000 });
    vi.advanceTimersByTime(999);

    expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it('revokes the object URL once the default 1000ms delay elapses', () => {
    const blob = new Blob(['data']);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadBlob({ filename: 'f.bin', blob });
    vi.advanceTimersByTime(1000);

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('honours a custom revokeDelayMs', () => {
    const blob = new Blob(['data']);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadBlob({ filename: 'f.bin', blob, revokeDelayMs: 5000 });
    vi.advanceTimersByTime(4999);
    const beforeCount = revokeObjectURL.mock.calls.length;
    vi.advanceTimersByTime(1);

    expect(beforeCount).toBe(0);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it('removes the anchor from the document after the delay elapses', () => {
    const blob = new Blob(['data']);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadBlob({ filename: 'f.bin', blob });
    vi.advanceTimersByTime(1000);

    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('appends the anchor to the document body during the synchronous phase', () => {
    const blob = new Blob(['data']);
    let anchorInDomAtClick = false;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      anchorInDomAtClick = document.body.contains(this);
    });

    downloadBlob({ filename: 'f.bin', blob });

    expect(anchorInDomAtClick).toBe(true);
  });
});
