import type { ReactNode } from 'react';
import styles from './workspace.module.scss';

export interface WorkspacePageProps {
  eyebrow?: ReactNode;
  title: string;
  description?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
  width?: 'wide' | 'reading' | 'full';
  children: ReactNode;
}

export function WorkspacePage({
  eyebrow,
  title,
  description,
  status,
  actions,
  width = 'wide',
  children,
}: WorkspacePageProps) {
  return (
    <article className={`${styles.workspace} ${styles[width]}`}>
      <header className={styles.masthead}>
        <div className={styles.heading}>
          {eyebrow && <div className={styles.eyebrow}>{eyebrow}</div>}
          <h1>{title}</h1>
          {description && <div className={styles.description}>{description}</div>}
        </div>
        {(status || actions) && (
          <div className={styles.mastheadTools}>
            {status && <div className={styles.status}>{status}</div>}
            {actions && <div className={styles.actions}>{actions}</div>}
          </div>
        )}
      </header>
      <div className={styles.content}>{children}</div>
    </article>
  );
}
