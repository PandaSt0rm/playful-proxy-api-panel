import { describe, it, expect } from 'vitest';
import { render } from '@/test/utils';
import { QuotaProgressBar } from './QuotaProgressBar';

const getFill = (container: HTMLElement): HTMLElement => {
  const fill = container.querySelector('[class*="quotaBarFill"]');
  if (!(fill instanceof HTMLElement)) throw new Error('expected a fill element');
  return fill;
};

describe('QuotaProgressBar width', () => {
  it('rounds a fractional percent down to the nearest whole percent for the width', () => {
    const { container } = render(
      <QuotaProgressBar percent={42.4} highThreshold={80} mediumThreshold={40} />
    );

    expect(getFill(container).style.width).toBe('42%');
  });

  it('rounds a fractional percent up at the .5 boundary', () => {
    const { container } = render(
      <QuotaProgressBar percent={42.5} highThreshold={80} mediumThreshold={40} />
    );

    expect(getFill(container).style.width).toBe('43%');
  });

  it('clamps a percent above 100 to a width of 100%', () => {
    const { container } = render(
      <QuotaProgressBar percent={150} highThreshold={80} mediumThreshold={40} />
    );

    expect(getFill(container).style.width).toBe('100%');
  });

  it('clamps a negative percent to a width of 0%', () => {
    const { container } = render(
      <QuotaProgressBar percent={-20} highThreshold={80} mediumThreshold={40} />
    );

    expect(getFill(container).style.width).toBe('0%');
  });

  it('renders a width of 0% when percent is null', () => {
    const { container } = render(
      <QuotaProgressBar percent={null} highThreshold={80} mediumThreshold={40} />
    );

    expect(getFill(container).style.width).toBe('0%');
  });
});

describe('QuotaProgressBar fill color tier', () => {
  it('uses the high tier class when the percent is at or above the high threshold', () => {
    const { container } = render(
      <QuotaProgressBar percent={80} highThreshold={80} mediumThreshold={40} />
    );

    expect(getFill(container).className).toContain('quotaBarFillHigh');
  });

  it('uses the medium tier class when the percent is between the medium and high thresholds', () => {
    const { container } = render(
      <QuotaProgressBar percent={60} highThreshold={80} mediumThreshold={40} />
    );

    expect(getFill(container).className).toContain('quotaBarFillMedium');
  });

  it('uses the low tier class when the percent is below the medium threshold', () => {
    const { container } = render(
      <QuotaProgressBar percent={10} highThreshold={80} mediumThreshold={40} />
    );

    expect(getFill(container).className).toContain('quotaBarFillLow');
  });

  it('uses the medium tier class when percent is null', () => {
    const { container } = render(
      <QuotaProgressBar percent={null} highThreshold={80} mediumThreshold={40} />
    );

    expect(getFill(container).className).toContain('quotaBarFillMedium');
  });
});
