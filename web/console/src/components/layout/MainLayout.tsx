import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AIPROXY_MARK } from '@/assets/identity';
import { PageTransition } from '@/components/common/PageTransition';
import { IconChevronDown, IconRefreshCw, IconX } from '@/components/ui/icons';
import { triggerHeaderRefresh } from '@/hooks/useHeaderRefresh';
import { MainRoutes } from '@/router/MainRoutes';
import {
  CONSOLE_MODULES,
  getConsoleRouteOrder,
  resolveConsoleDestination,
  type ConsoleModule,
  type ConsoleModuleId,
} from '@/router/consoleRoutes';
import {
  useAuthStore,
  useConfigStore,
  useLanguageStore,
  useNotificationStore,
  useThemeStore,
} from '@/stores';
import type { Theme } from '@/types';
import { LANGUAGE_LABEL_KEYS, LANGUAGE_ORDER } from '@/utils/constants';

const THEMES: readonly Theme[] = ['auto', 'white', 'light', 'dark'];
const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const update = () => setMatches(mediaQuery.matches);
    update();
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, [query]);

  return matches;
}

function getTransitionVariant(fromPathname: string, toPathname: string) {
  const isNestedFamily = (pathname: string, family: string) =>
    pathname === family || pathname.startsWith(`${family}/`);
  if (
    (isNestedFamily(fromPathname, '/auth-files') && isNestedFamily(toPathname, '/auth-files')) ||
    (isNestedFamily(fromPathname, '/ai-providers') && isNestedFamily(toPathname, '/ai-providers'))
  ) {
    return 'ios' as const;
  }
  return 'vertical' as const;
}

interface PopoverProps {
  open: boolean;
  label: string;
  children: ReactNode;
}

function Popover({ open, label, children }: PopoverProps) {
  if (!open) return null;
  return (
    <div className="route-popover" role="menu" aria-label={label}>
      {children}
    </div>
  );
}

export function MainLayout() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const isTablet = useMediaQuery('(min-width: 769px) and (max-width: 1279px)');
  const logout = useAuthStore((state) => state.logout);
  const fetchConfig = useConfigStore((state) => state.fetchConfig);
  const clearCache = useConfigStore((state) => state.clearCache);
  const showNotification = useNotificationStore((state) => state.showNotification);
  const language = useLanguageStore((state) => state.language);
  const setLanguage = useLanguageStore((state) => state.setLanguage);
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);

  const [navigationOpen, setNavigationOpen] = useState(false);
  const [contextModuleId, setContextModuleId] = useState<ConsoleModuleId>('monitor');
  const [utilityMenuOpen, setUtilityMenuOpen] = useState(false);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const drawerRef = useRef<HTMLElement | null>(null);
  const navigationTriggerRef = useRef<HTMLButtonElement | null>(null);
  const utilityRef = useRef<HTMLDivElement | null>(null);
  const languageRef = useRef<HTMLDivElement | null>(null);
  const themeRef = useRef<HTMLDivElement | null>(null);

  const destination = resolveConsoleDestination(location.pathname);
  const activeModule = useMemo(
    () => CONSOLE_MODULES.find((module) => module.id === destination?.module) ?? null,
    [destination]
  );
  const contextModule =
    CONSOLE_MODULES.find(
      (module) => module.id === (isTablet ? contextModuleId : activeModule?.id)
    ) ?? CONSOLE_MODULES[0];
  const routeLabel =
    location.pathname === '/onboarding'
      ? t('routeFoundry.shell.readiness')
      : destination
        ? t(destination.labelKey)
        : t('routeFoundry.destinations.overview');
  const breadcrumbs = destination?.breadcrumb?.(location.pathname) ?? [];

  useEffect(() => {
    if (activeModule) setContextModuleId(activeModule.id);
  }, [activeModule]);

  useEffect(() => {
    fetchConfig().catch(() => undefined);
  }, [fetchConfig]);

  useEffect(() => {
    setNavigationOpen(false);
    setUtilityMenuOpen(false);
    setLanguageMenuOpen(false);
    setThemeMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!navigationOpen || !isMobile) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const drawer = drawerRef.current;
    const navigationTrigger = navigationTriggerRef.current;
    const focusable = drawer?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    focusable?.[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setNavigationOpen(false);
        return;
      }
      if (event.key !== 'Tab' || !drawer) return;
      const targets = [...drawer.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)];
      if (targets.length === 0) return;
      const first = targets[0];
      const last = targets[targets.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      navigationTrigger?.focus();
    };
  }, [isMobile, navigationOpen]);

  useEffect(() => {
    if (!navigationOpen || !isTablet) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setNavigationOpen(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isTablet, navigationOpen]);

  useEffect(() => {
    const closeMenus = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!utilityRef.current?.contains(target)) setUtilityMenuOpen(false);
      if (!languageRef.current?.contains(target)) setLanguageMenuOpen(false);
      if (!themeRef.current?.contains(target)) setThemeMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setUtilityMenuOpen(false);
      setLanguageMenuOpen(false);
      setThemeMenuOpen(false);
    };
    document.addEventListener('mousedown', closeMenus);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeMenus);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  const refreshAll = useCallback(async () => {
    setIsRefreshing(true);
    try {
      clearCache();
      const results = await Promise.allSettled([
        fetchConfig(undefined, true),
        triggerHeaderRefresh(),
      ]);
      const failed = results.find((result) => result.status === 'rejected');
      if (failed?.status === 'rejected') {
        const message =
          typeof failed.reason === 'string'
            ? failed.reason
            : failed.reason instanceof Error
              ? failed.reason.message
              : '';
        showNotification(
          `${t('notification.refresh_failed')}${message ? `: ${message}` : ''}`,
          'error'
        );
      } else {
        showNotification(t('notification.data_refreshed'), 'success');
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [clearCache, fetchConfig, showNotification, t]);

  const selectLanguage = (nextLanguage: string) => {
    setLanguage(nextLanguage);
    setLanguageMenuOpen(false);
    setUtilityMenuOpen(false);
  };

  const selectTheme = (nextTheme: Theme) => {
    setTheme(nextTheme);
    setThemeMenuOpen(false);
    setUtilityMenuOpen(false);
  };

  const selectModule = (module: ConsoleModule) => {
    if (isTablet) {
      setContextModuleId(module.id);
      setNavigationOpen(true);
      return;
    }
    navigate(module.destinations[0].path);
  };

  const destinationLinks = (module: ConsoleModule, close: () => void) => (
    <div className="route-destination-list">
      {module.destinations.map((item) => {
        const DestinationIcon = item.icon;
        const selected = item.matches(location.pathname);
        return (
          <NavLink
            key={item.id}
            to={item.path}
            className={`route-destination ${selected ? 'is-active' : ''}`}
            aria-current={selected ? 'page' : undefined}
            onClick={close}
          >
            <DestinationIcon size={18} />
            <span>{t(item.labelKey)}</span>
          </NavLink>
        );
      })}
    </div>
  );

  const languageOptions = LANGUAGE_ORDER.map((item) => (
    <button
      key={item}
      type="button"
      role="menuitemradio"
      aria-checked={language === item}
      className={language === item ? 'is-selected' : undefined}
      onClick={() => selectLanguage(item)}
    >
      {t(LANGUAGE_LABEL_KEYS[item])}
    </button>
  ));

  const themeOptions = THEMES.map((item) => (
    <button
      key={item}
      type="button"
      role="menuitemradio"
      aria-checked={theme === item}
      className={theme === item ? 'is-selected' : undefined}
      onClick={() => selectTheme(item)}
    >
      {t(`theme.${item}`)}
    </button>
  ));

  return (
    <div className="route-shell">
      <aside className="module-rail" aria-label={t('routeFoundry.shell.navigation')}>
        <div className="module-mark">
          <img src={AIPROXY_MARK} alt="AIPROXY" />
        </div>
        <div className="module-list">
          {CONSOLE_MODULES.map((module) => {
            const ModuleIcon = module.icon;
            const selected = activeModule?.id === module.id;
            return (
              <button
                key={module.id}
                type="button"
                className={`module-button ${selected ? 'is-active' : ''}`}
                aria-label={t(module.labelKey)}
                aria-pressed={selected}
                aria-expanded={
                  isTablet && contextModuleId === module.id ? navigationOpen : undefined
                }
                aria-controls={isTablet ? 'tablet-context-navigation' : undefined}
                onClick={() => selectModule(module)}
              >
                <ModuleIcon size={21} />
                <span>{t(module.labelKey)}</span>
              </button>
            );
          })}
        </div>
      </aside>

      <aside className="context-navigation" aria-label={t('routeFoundry.shell.contextNavigation')}>
        <div className="context-title">{t(contextModule.labelKey)}</div>
        {destinationLinks(contextModule, () => undefined)}
      </aside>

      <header className="main-header route-topbar">
        <div className="mobile-route-identity">
          <button
            ref={navigationTriggerRef}
            type="button"
            className="shell-icon-button mobile-navigation-trigger"
            aria-label={t('routeFoundry.shell.openNavigation')}
            aria-controls="mobile-primary-navigation"
            aria-expanded={isMobile ? navigationOpen : undefined}
            onClick={() => setNavigationOpen(true)}
          >
            <span aria-hidden="true">☰</span>
          </button>
          <img src={AIPROXY_MARK} alt="" />
          <strong>{routeLabel}</strong>
        </div>

        <nav className="route-breadcrumb" aria-label={t('routeFoundry.shell.contextNavigation')}>
          <span>{activeModule ? t(activeModule.labelKey) : t('routeFoundry.shell.readiness')}</span>
          {destination && <span>{t(destination.labelKey)}</span>}
          {breadcrumbs.map((breadcrumb) => (
            <span key={breadcrumb}>{t(breadcrumb)}</span>
          ))}
        </nav>

        <div className="route-toolbar">
          <button
            type="button"
            className="shell-icon-button refresh-control"
            aria-label={t('routeFoundry.shell.refresh')}
            title={t('routeFoundry.shell.refresh')}
            aria-busy={isRefreshing || undefined}
            disabled={isRefreshing}
            onClick={() => void refreshAll()}
          >
            <IconRefreshCw size={19} />
            <span>{t('routeFoundry.shell.refresh')}</span>
          </button>

          <div className="desktop-utility" ref={languageRef}>
            <button
              type="button"
              className="shell-icon-button"
              aria-haspopup="menu"
              aria-expanded={languageMenuOpen}
              onClick={() => {
                setLanguageMenuOpen((open) => !open);
                setThemeMenuOpen(false);
              }}
            >
              <span>{t('routeFoundry.shell.language')}</span>
              <IconChevronDown size={16} />
            </button>
            <Popover open={languageMenuOpen} label={t('routeFoundry.shell.language')}>
              {languageOptions}
            </Popover>
          </div>

          <div className="desktop-utility" ref={themeRef}>
            <button
              type="button"
              className="shell-icon-button"
              aria-haspopup="menu"
              aria-expanded={themeMenuOpen}
              onClick={() => {
                setThemeMenuOpen((open) => !open);
                setLanguageMenuOpen(false);
              }}
            >
              <span>{t('routeFoundry.shell.theme')}</span>
              <IconChevronDown size={16} />
            </button>
            <Popover open={themeMenuOpen} label={t('routeFoundry.shell.theme')}>
              {themeOptions}
            </Popover>
          </div>

          <button type="button" className="shell-icon-button desktop-utility" onClick={logout}>
            {t('routeFoundry.shell.logout')}
          </button>

          <div className="compact-utility" ref={utilityRef}>
            <button
              type="button"
              className="shell-icon-button"
              aria-label={t('routeFoundry.shell.utilities')}
              aria-haspopup="menu"
              aria-expanded={utilityMenuOpen}
              onClick={() => setUtilityMenuOpen((open) => !open)}
            >
              <span aria-hidden="true">•••</span>
            </button>
            <Popover open={utilityMenuOpen} label={t('routeFoundry.shell.utilities')}>
              <div
                className="utility-group"
                role="group"
                aria-label={t('routeFoundry.shell.language')}
              >
                <strong>{t('routeFoundry.shell.language')}</strong>
                {languageOptions}
              </div>
              <div
                className="utility-group"
                role="group"
                aria-label={t('routeFoundry.shell.theme')}
              >
                <strong>{t('routeFoundry.shell.theme')}</strong>
                {themeOptions}
              </div>
              <button type="button" role="menuitem" onClick={logout}>
                {t('routeFoundry.shell.logout')}
              </button>
            </Popover>
          </div>
        </div>
      </header>

      {isTablet && navigationOpen && (
        <>
          <button
            type="button"
            className="shell-scrim tablet-scrim"
            aria-label={t('routeFoundry.shell.closeNavigation')}
            onClick={() => setNavigationOpen(false)}
          />
          <aside
            id="tablet-context-navigation"
            className="tablet-context-overlay"
            aria-label={t('routeFoundry.shell.contextNavigation')}
          >
            <div className="context-title">{t(contextModule.labelKey)}</div>
            {destinationLinks(contextModule, () => setNavigationOpen(false))}
          </aside>
        </>
      )}

      {isMobile && navigationOpen && (
        <>
          <button
            type="button"
            className="shell-scrim mobile-scrim"
            aria-label={t('routeFoundry.shell.closeNavigation')}
            onClick={() => setNavigationOpen(false)}
          />
          <aside
            ref={drawerRef}
            id="mobile-primary-navigation"
            className="mobile-navigation-drawer"
            aria-label={t('routeFoundry.shell.navigation')}
          >
            <div className="mobile-drawer-header">
              <img src={AIPROXY_MARK} alt="AIPROXY" />
              <button
                type="button"
                className="shell-icon-button"
                aria-label={t('routeFoundry.shell.closeNavigation')}
                onClick={() => setNavigationOpen(false)}
              >
                <IconX size={20} />
              </button>
            </div>
            {CONSOLE_MODULES.map((module) => (
              <section
                key={module.id}
                className="mobile-module-group"
                aria-labelledby={`mobile-${module.id}`}
              >
                <h2 id={`mobile-${module.id}`}>{t(module.labelKey)}</h2>
                {destinationLinks(module, () => setNavigationOpen(false))}
              </section>
            ))}
          </aside>
        </>
      )}

      <div className="route-workspace" ref={workspaceRef}>
        <PageTransition
          render={(routeLocation) => <MainRoutes location={routeLocation} />}
          getRouteOrder={getConsoleRouteOrder}
          getTransitionVariant={getTransitionVariant}
          scrollContainerRef={isMobile ? undefined : workspaceRef}
        />
      </div>
    </div>
  );
}
