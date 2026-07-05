import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderWithRouter, screen, userEvent } from '@/test/utils';
import { useThemeStore } from '@/stores';
import { ProviderNav } from './ProviderNav';

const PROVIDER_IDS = [
  'gemini',
  'codex',
  'claude',
  'vertex',
  'zai',
  'openrouter',
  'ollama',
  'openai',
] as const;

// scrollToProvider bails out unless a `#provider-<id>` anchor exists in the
// document, so inject them to exercise the active-state behaviour.
function mountProviderAnchors() {
  PROVIDER_IDS.forEach((id) => {
    const el = document.createElement('div');
    el.id = `provider-${id}`;
    document.body.appendChild(el);
  });
}

describe('ProviderNav', () => {
  beforeEach(() => {
    localStorage.clear();
    useThemeStore.setState({ theme: 'light', resolvedTheme: 'light' });
  });

  afterEach(() => {
    PROVIDER_IDS.forEach((id) => document.getElementById(`provider-${id}`)?.remove());
  });

  it('renders nothing when not on the ai-providers list route', () => {
    renderWithRouter(<ProviderNav />, { route: '/settings' });

    expect(screen.queryByRole('button', { name: 'Gemini' })).not.toBeInTheDocument();
  });

  it('renders the quick-switch buttons on the ai-providers list route', () => {
    renderWithRouter(<ProviderNav />, { route: '/ai-providers' });

    expect(screen.getByRole('button', { name: 'Gemini' })).toBeInTheDocument();
  });

  it('renders one nav button per known provider', () => {
    renderWithRouter(<ProviderNav />, { route: '/ai-providers' });

    expect(screen.getAllByRole('button')).toHaveLength(PROVIDER_IDS.length);
  });

  it('renders the Z.AI provider button with its display label', () => {
    renderWithRouter(<ProviderNav />, { route: '/ai-providers' });

    expect(screen.getByRole('button', { name: 'Z.AI' })).toBeInTheDocument();
  });

  it('renders the Ollama Cloud provider button with its display label', () => {
    renderWithRouter(<ProviderNav />, { route: '/ai-providers' });

    expect(screen.getByRole('button', { name: 'Ollama Cloud' })).toBeInTheDocument();
  });

  it('still shows the nav when the route has a trailing slash', () => {
    renderWithRouter(<ProviderNav />, { route: '/ai-providers/' });

    expect(screen.getByRole('button', { name: 'Claude' })).toBeInTheDocument();
  });

  it('does not show the nav on a nested ai-providers edit route', () => {
    renderWithRouter(<ProviderNav />, { route: '/ai-providers/claude/1' });

    expect(screen.queryByRole('button', { name: 'Claude' })).not.toBeInTheDocument();
  });

  it('marks every button as not pressed before any interaction', () => {
    renderWithRouter(<ProviderNav />, { route: '/ai-providers' });

    expect(screen.getByRole('button', { name: 'Gemini' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('marks a provider button as pressed after it is clicked', async () => {
    const user = userEvent.setup();
    mountProviderAnchors();

    renderWithRouter(<ProviderNav />, { route: '/ai-providers' });
    // Flush the mount-time requestAnimationFrame recompute first; otherwise it
    // can land after the click and overwrite the clicked provider state.
    await new Promise((resolve) => requestAnimationFrame(resolve));
    await user.click(screen.getByRole('button', { name: 'Codex' }));

    expect(screen.getByRole('button', { name: 'Codex' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('renders the openai icon source for the light theme', () => {
    useThemeStore.setState({ theme: 'light', resolvedTheme: 'light' });

    renderWithRouter(<ProviderNav />, { route: '/ai-providers' });
    const lightSrc = screen.getByRole('img', { name: 'OpenAI' }).getAttribute('src');

    expect(lightSrc).not.toBeNull();
  });

  it('uses a different openai icon source for the dark theme than the light theme', () => {
    useThemeStore.setState({ theme: 'light', resolvedTheme: 'light' });
    const lightView = renderWithRouter(<ProviderNav />, { route: '/ai-providers' });
    const lightSrc = screen.getByRole('img', { name: 'OpenAI' }).getAttribute('src');
    lightView.unmount();

    useThemeStore.setState({ theme: 'dark', resolvedTheme: 'dark' });
    renderWithRouter(<ProviderNav />, { route: '/ai-providers' });
    const darkSrc = screen.getByRole('img', { name: 'OpenAI' }).getAttribute('src');

    expect(darkSrc).not.toBe(lightSrc);
  });
});
