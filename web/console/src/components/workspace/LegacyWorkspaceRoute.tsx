import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { WorkspacePage } from './WorkspacePage';
import styles from './workspace.module.scss';

interface LegacyWorkspaceRouteProps {
  titleKey: string;
  width?: 'wide' | 'reading' | 'full';
  children: ReactNode;
}

export function LegacyWorkspaceRoute({
  titleKey,
  width = 'wide',
  children,
}: LegacyWorkspaceRouteProps) {
  const { t } = useTranslation();
  return (
    <WorkspacePage title={t(titleKey)} width={width}>
      <div className={styles.legacyBody}>{children}</div>
    </WorkspacePage>
  );
}
