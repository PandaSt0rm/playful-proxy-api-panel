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
    expect(document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.type).toBe('image/svg+xml');
  });

  it('updates the existing favicon without replacing it', async () => {
    const favicon = document.createElement('link');
    favicon.rel = 'icon';
    document.head.appendChild(favicon);
    const { bootstrapConsole } = await import('./main');

    bootstrapConsole(document.createElement('div'));

    expect(document.querySelectorAll('link[rel="icon"]')).toHaveLength(1);
    expect(favicon.type).toBe('image/svg+xml');
  });

  it('automatically mounts when the production root exists', async () => {
    const rootElement = document.createElement('div');
    rootElement.id = 'root';
    document.body.appendChild(rootElement);

    await import('./main');

    expect(createRoot).toHaveBeenCalledWith(rootElement);
  });
});
