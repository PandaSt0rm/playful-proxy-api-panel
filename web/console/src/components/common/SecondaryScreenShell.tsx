import { forwardRef, type ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { IconChevronLeft } from '@/components/ui/icons';
import { usePageTransitionLayer } from './PageTransitionLayer';
import styles from './SecondaryScreenShell.module.scss';

export type SecondaryScreenShellProps = {
  title: ReactNode;
  onBack?: () => void;
  backLabel?: string;
  backAriaLabel?: string;
  rightAction?: ReactNode;
  hideTopBarBackButton?: boolean;
  hideTopBarRightAction?: boolean;
  actionBar?: ReactNode;
  isLoading?: boolean;
  loadingLabel?: ReactNode;
  className?: string;
  contentClassName?: string;
  children?: ReactNode;
};

export const SecondaryScreenShell = forwardRef<HTMLDivElement, SecondaryScreenShellProps>(
  function SecondaryScreenShell(
    {
      title,
      onBack,
      backLabel = 'Back',
      backAriaLabel,
      rightAction,
      hideTopBarBackButton = false,
      hideTopBarRightAction = false,
      actionBar,
      isLoading = false,
      loadingLabel = 'Loading...',
      className = '',
      contentClassName = '',
      children,
    },
    ref
  ) {
    const containerClassName = [styles.container, className].filter(Boolean).join(' ');
    const contentClasses = [styles.content, contentClassName].filter(Boolean).join(' ');
    const titleTooltip = typeof title === 'string' ? title : undefined;
    const resolvedBackAriaLabel = backAriaLabel ?? backLabel;
    const pageTransitionLayer = usePageTransitionLayer();
    const isCurrentLayer = pageTransitionLayer ? pageTransitionLayer.isCurrentLayer : true;
    const shouldRenderActionBar = Boolean(actionBar) && isCurrentLayer;

    return (
      <div className={containerClassName} ref={ref}>
        <div className={styles.topBar}>
          {onBack && !hideTopBarBackButton ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onBack}
              className={styles.backButton}
              aria-label={resolvedBackAriaLabel}
            >
              <span className={styles.backIcon}>
                <IconChevronLeft size={18} />
              </span>
              <span className={styles.backText}>{backLabel}</span>
            </Button>
          ) : (
            <div />
          )}
          <h1 className={styles.topBarTitle} title={titleTooltip}>
            {title}
          </h1>
          <div className={styles.rightSlot}>{hideTopBarRightAction ? null : rightAction}</div>
        </div>

        {isLoading ? (
          <div className={styles.loadingState}>
            <LoadingSpinner size={16} />
            <span>{loadingLabel}</span>
          </div>
        ) : (
          <div className={contentClasses}>{children}</div>
        )}

        {shouldRenderActionBar && (
          <div className={styles.actionBar}>
            <div className={styles.actionBarSurface}>{actionBar}</div>
          </div>
        )}
      </div>
    );
  }
);
