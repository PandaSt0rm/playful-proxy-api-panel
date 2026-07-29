import { beforeEach, describe, expect, it, vi } from 'vitest';
// Dynamic imports re-evaluate the entry module's auto-mount side effect for each isolated scenario.

const rootDouble = vi.hoisted(() => ({ render: vi.fn(), unmount: vi.fn() }));
const createRoot = vi.hoisted(() => vi.fn(() => rootDouble));

vi.mock('react-dom/client', () => ({ createRoot }));
vi.mock('./App.tsx', () => ({ default: () => null }));

describe('bootstrapConsole', () => {
  beforeEach(() => {
    vi.resetModules();
    createRoot.mockClear();
    rootDouble.render.mockClear();
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });

  it('fails clearly when the root element is missing', async () => {
    const { bootstrapConsole } = await import('./main');

    expect(() => bootstrapConsole(null)).toThrow('AIPROXY console root element is missing.');
  });

  it('mounts the app and configures document identity', async () => {
    const rootElement = document.createElement('div');
    const { bootstrapConsole } = await import('./main');

    const root = bootstrapConsole(rootElement);

    expect(root).toBe(rootDouble);
    expect(createRoot).toHaveBeenCalledWith(rootElement);
    expect(rootDouble.render).toHaveBeenCalledTimes(1);
    expect(document.title).toBe('AIPROXY');
    expect(document.documentElement).toHaveAttribute('translate', 'no');
    const icons = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]'));
    expect(icons.length).toBeGreaterThanOrEqual(1);
    expect(icons.every((link) => link.type === 'image/png')).toBe(true);
  });

  it('updates matching favicon links without duplicating type/size pairs', async () => {
    const png32 = document.createElement('link');
    png32.rel = 'icon';
    png32.setAttribute('type', 'image/png');
    png32.setAttribute('sizes', '32x32');
    document.head.appendChild(png32);
    const png16 = document.createElement('link');
    png16.rel = 'icon';
    png16.setAttribute('type', 'image/png');
    png16.setAttribute('sizes', '16x16');
    document.head.appendChild(png16);
    const { bootstrapConsole } = await import('./main');

    bootstrapConsole(document.createElement('div'));

    const icons = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]'));
    expect(icons.filter((link) => link.getAttribute('sizes') === '32x32')).toHaveLength(1);
    expect(icons.filter((link) => link.getAttribute('sizes') === '16x16')).toHaveLength(1);
    expect(png32.getAttribute('href')).toBeTruthy();
    expect(png16.getAttribute('href')).toBeTruthy();
  });

  it('automatically mounts when the production root exists', async () => {
    const rootElement = document.createElement('div');
    rootElement.id = 'root';
    document.body.appendChild(rootElement);

    await import('./main');

    expect(createRoot).toHaveBeenCalledWith(rootElement);
  });
});
