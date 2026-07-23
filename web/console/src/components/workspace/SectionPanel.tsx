import type { ReactNode } from 'react';
import styles from './workspace.module.scss';

export interface SectionPanelProps {
  id: string;
  title: string;
  description?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

export function SectionPanel({
  id,
  title,
  description,
  status,
  actions,
  children,
}: SectionPanelProps) {
  const titleId = `${id}-title`;
  const descriptionId = description ? `${id}-description` : undefined;

  return (
    <section
      id={id}
      className={styles.panel}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
    >
      <header className={styles.panelHeader}>
        <div className={styles.panelHeading}>
          <h2 id={titleId}>{title}</h2>
          {description && (
            <div id={descriptionId} className={styles.panelDescription}>
              {description}
            </div>
          )}
        </div>
        {(status || actions) && (
          <div className={styles.panelTools}>
            {status}
            {actions}
          </div>
        )}
      </header>
      <div className={styles.panelBody}>{children}</div>
    </section>
  );
}
