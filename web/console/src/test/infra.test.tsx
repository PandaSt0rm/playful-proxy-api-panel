// Infrastructure probe: proves the test harness handles the cross-cutting
// concerns every component test depends on — SCSS-module imports, SVG imports,
// i18n initialization, and rendering a real style-importing component.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import selectStyles from '@/components/ui/Select.module.scss';
import claudeIcon from '@/assets/icons/claude.svg';

function TranslationProbe() {
  const { t } = useTranslation();
  return <span>{t('common.confirm')}</span>;
}

describe('test infrastructure', () => {
  it('resolves SCSS-module imports without throwing', () => {
    expect(selectStyles).toBeDefined();
  });

  it('resolves SVG imports to a string URL', () => {
    expect(typeof claudeIcon).toBe('string');
  });

  it('initializes i18n so translation keys resolve to real strings', () => {
    const { container } = render(<TranslationProbe />);

    expect(container.textContent).toBeTruthy();
    expect(container.textContent).not.toBe('common.confirm');
  });

  it('renders a SCSS-importing component (Modal) into the DOM', () => {
    render(
      <Modal open onClose={() => {}} title="Probe Title">
        Probe Body
      </Modal>
    );

    expect(screen.getByText('Probe Title')).toBeInTheDocument();
    expect(screen.getByText('Probe Body')).toBeInTheDocument();
  });
});
