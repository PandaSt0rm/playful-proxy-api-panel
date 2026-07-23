import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { usePageTransitionLayer } from '@/components/common/PageTransitionLayer';
import { useThemeStore } from '@/stores';
import iconGemini from '@/assets/icons/gemini.svg';
import iconOpenaiLight from '@/assets/icons/openai-light.svg';
import iconOpenaiDark from '@/assets/icons/openai-dark.svg';
import iconCodex from '@/assets/icons/codex.svg';
import iconClaude from '@/assets/icons/claude.svg';
import iconVertex from '@/assets/icons/vertex.svg';
import iconGlm from '@/assets/icons/glm.svg';
import iconOpenRouter from '@/assets/icons/openrouter.svg';
import iconOllama from '@/assets/icons/ollama.svg';
import styles from './ProviderNav.module.scss';

export type ProviderId =
  | 'gemini'
  | 'codex'
  | 'interactions'
  | 'xai'
  | 'claude'
  | 'vertex'
  | 'zai'
  | 'openrouter'
  | 'ollama'
  | 'openai';

interface ProviderNavItem {
  id: ProviderId;
  label: string;
  getIcon: (theme: string) => string;
}

const PROVIDERS: ProviderNavItem[] = [
  { id: 'gemini', label: 'Gemini', getIcon: () => iconGemini },
  { id: 'interactions', label: 'Interactions', getIcon: () => iconGemini },
  { id: 'codex', label: 'Codex', getIcon: () => iconCodex },
  {
    id: 'xai',
    label: 'xAI',
    getIcon: (theme) => (theme === 'dark' ? iconOpenaiDark : iconOpenaiLight),
  },
  { id: 'claude', label: 'Claude', getIcon: () => iconClaude },
  { id: 'vertex', label: 'Vertex', getIcon: () => iconVertex },
  { id: 'zai', label: 'Z.AI', getIcon: () => iconGlm },
  { id: 'openrouter', label: 'OpenRouter', getIcon: () => iconOpenRouter },
  { id: 'ollama', label: 'Ollama Cloud', getIcon: () => iconOllama },
  {
    id: 'openai',
    label: 'OpenAI',
    getIcon: (theme) => (theme === 'dark' ? iconOpenaiDark : iconOpenaiLight),
  },
];

const HEADER_OFFSET = 24;
type ScrollContainer = HTMLElement | (Window & typeof globalThis);

export function ProviderNav() {
  const location = useLocation();
  const pageTransitionLayer = usePageTransitionLayer();
  const isCurrentLayer = pageTransitionLayer ? pageTransitionLayer.status === 'current' : true;
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const [activeProvider, setActiveProvider] = useState<ProviderId | null>(null);
  const contentScrollerRef = useRef<HTMLElement | null>(null);

  // Only show this quick-switch overlay on the AI Providers list page.
  // Note: The app uses iOS-style stacked page transitions inside `/ai-providers/*`,
  // so this component can stay mounted while the user is on an edit route.
  const normalizedPathname =
    location.pathname.length > 1 && location.pathname.endsWith('/')
      ? location.pathname.slice(0, -1)
      : location.pathname;
  const shouldShow = isCurrentLayer && normalizedPathname === '/ai-providers';

  const getHeaderHeight = useCallback(() => {
    const header = document.querySelector('.main-header') as HTMLElement | null;
    if (header) return header.getBoundingClientRect().height;

    const raw = getComputedStyle(document.documentElement).getPropertyValue('--header-height');
    const value = Number.parseFloat(raw);
    return Number.isFinite(value) ? value : 0;
  }, []);

  const getContentScroller = useCallback(() => {
    if (contentScrollerRef.current && document.contains(contentScrollerRef.current)) {
      return contentScrollerRef.current;
    }

    const container = document.querySelector('.content') as HTMLElement | null;
    contentScrollerRef.current = container;
    return container;
  }, []);

  const getScrollContainer = useCallback((): ScrollContainer => {
    // Mobile layout uses document scroll (layout switches at 768px); desktop uses the `.content` scroller.
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    if (isMobile) return window;
    return getContentScroller() ?? window;
  }, [getContentScroller]);

  const handleScroll = useCallback(() => {
    const container = getScrollContainer();
    if (!container) return;

    const isElementScroller = container instanceof HTMLElement;
    const headerHeight = isElementScroller ? 0 : getHeaderHeight();
    const containerTop = isElementScroller ? container.getBoundingClientRect().top : 0;
    const activationLine = containerTop + headerHeight + HEADER_OFFSET + 1;
    let currentActive: ProviderId | null = null;

    for (const provider of PROVIDERS) {
      const element = document.getElementById(`provider-${provider.id}`);
      if (!element) continue;

      const rect = element.getBoundingClientRect();
      if (rect.top <= activationLine) {
        currentActive = provider.id;
        continue;
      }

      if (currentActive) break;
    }

    if (!currentActive) {
      const firstVisible = PROVIDERS.find((provider) =>
        document.getElementById(`provider-${provider.id}`)
      );
      currentActive = firstVisible?.id ?? null;
    }

    setActiveProvider(currentActive);
  }, [getHeaderHeight, getScrollContainer]);

  useEffect(() => {
    if (!shouldShow) return;
    const contentScroller = getContentScroller();

    // Listen to both: desktop scroll happens on `.content`; mobile uses `window`.
    window.addEventListener('scroll', handleScroll, { passive: true });
    contentScroller?.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);
    const raf = requestAnimationFrame(handleScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
      contentScroller?.removeEventListener('scroll', handleScroll);
    };
  }, [getContentScroller, handleScroll, shouldShow]);

  const scrollToProvider = (providerId: ProviderId) => {
    const container = getScrollContainer();
    const element = document.getElementById(`provider-${providerId}`);
    if (!element || !container) return;

    setActiveProvider(providerId);

    // Mobile: scroll the document (header is fixed, so offset by header height).
    if (!(container instanceof HTMLElement)) {
      const headerHeight = getHeaderHeight();
      const elementTop = element.getBoundingClientRect().top + window.scrollY;
      const target = Math.max(0, elementTop - headerHeight - HEADER_OFFSET);
      window.scrollTo({ top: target, behavior: 'smooth' });
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const scrollTop = container.scrollTop + (elementRect.top - containerRect.top) - HEADER_OFFSET;

    container.scrollTo({ top: scrollTop, behavior: 'smooth' });
  };

  const navContent = (
    <div className={styles.navContainer}>
      <div className={styles.navList}>
        {PROVIDERS.map((provider) => {
          const isActive = activeProvider === provider.id;
          return (
            <button
              key={provider.id}
              className={`${styles.navItem} ${isActive ? styles.active : ''}`}
              onClick={() => scrollToProvider(provider.id)}
              title={provider.label}
              type="button"
              aria-label={provider.label}
              aria-pressed={isActive}
            >
              <img
                src={provider.getIcon(resolvedTheme)}
                alt={provider.label}
                className={styles.icon}
              />
            </button>
          );
        })}
      </div>
    </div>
  );

  if (!shouldShow) return null;

  return navContent;
}
