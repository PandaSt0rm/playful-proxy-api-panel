import { describe, it, expect } from 'vitest';
import { render, screen, userEvent } from '@/test/utils';
import type { StatusBarData, StatusBlockDetail } from '@/utils/recentRequests';
import { ProviderStatusBar } from './ProviderStatusBar';

// Identity-style styles module so class names are deterministic, observable
// strings in the DOM (production SCSS modules resolve to {} under css:false).
const STYLES: Record<string, string> = {
  statusBar: 'statusBar',
  statusBlocks: 'statusBlocks',
  statusBlockWrapper: 'statusBlockWrapper',
  statusBlockActive: 'statusBlockActive',
  statusBlock: 'statusBlock',
  statusBlockIdle: 'statusBlockIdle',
  statusRate: 'statusRate',
  statusRateHigh: 'statusRateHigh',
  statusRateMedium: 'statusRateMedium',
  statusRateLow: 'statusRateLow',
  statusTooltip: 'statusTooltip',
  statusTooltipLeft: 'statusTooltipLeft',
  statusTooltipRight: 'statusTooltipRight',
  tooltipTime: 'tooltipTime',
  tooltipStats: 'tooltipStats',
  tooltipSuccess: 'tooltipSuccess',
  tooltipFailure: 'tooltipFailure',
  tooltipRate: 'tooltipRate',
};

function makeDetail(overrides: Partial<StatusBlockDetail> = {}): StatusBlockDetail {
  return {
    success: 0,
    failure: 0,
    rate: -1,
    startTime: 0,
    endTime: 600000,
    ...overrides,
  };
}

function makeStatusData(overrides: Partial<StatusBarData> = {}): StatusBarData {
  return {
    blocks: [],
    blockDetails: [],
    successRate: 100,
    totalSuccess: 0,
    totalFailure: 0,
    ...overrides,
  };
}

describe('ProviderStatusBar', () => {
  it('renders a double dash placeholder when there is no request data', () => {
    const data = makeStatusData({ totalSuccess: 0, totalFailure: 0, blockDetails: [makeDetail()] });

    render(<ProviderStatusBar statusData={data} styles={STYLES} />);

    expect(screen.getByText('--')).toBeInTheDocument();
  });

  it('renders a whole-number success rate without a trailing .0', () => {
    const data = makeStatusData({ successRate: 100, totalSuccess: 5, totalFailure: 0 });

    render(<ProviderStatusBar statusData={data} styles={STYLES} />);

    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('renders a fractional success rate rounded to one decimal place', () => {
    const data = makeStatusData({ successRate: 66.6666, totalSuccess: 2, totalFailure: 1 });

    render(<ProviderStatusBar statusData={data} styles={STYLES} />);

    expect(screen.getByText('66.7%')).toBeInTheDocument();
  });

  it('renders an integral 50 percent success rate without a trailing .0', () => {
    const data = makeStatusData({ successRate: 50, totalSuccess: 1, totalFailure: 1 });

    render(<ProviderStatusBar statusData={data} styles={STYLES} />);

    expect(screen.getByText('50%')).toBeInTheDocument();
  });

  it('renders one block wrapper per block detail entry', () => {
    const data = makeStatusData({
      totalSuccess: 1,
      blockDetails: [makeDetail(), makeDetail(), makeDetail()],
    });

    const { container } = render(<ProviderStatusBar statusData={data} styles={STYLES} />);

    expect(container.querySelectorAll('.statusBlockWrapper')).toHaveLength(3);
  });

  it('marks idle blocks (rate -1) with the idle class and no background colour', () => {
    const data = makeStatusData({ blockDetails: [makeDetail({ rate: -1 })] });

    const { container } = render(<ProviderStatusBar statusData={data} styles={STYLES} />);

    const block = container.querySelector('.statusBlock');
    expect(block).toHaveClass('statusBlockIdle');
  });

  it('does not mark active blocks with the idle class', () => {
    const data = makeStatusData({
      totalSuccess: 4,
      blockDetails: [makeDetail({ success: 4, failure: 0, rate: 1 })],
    });

    const { container } = render(<ProviderStatusBar statusData={data} styles={STYLES} />);

    const block = container.querySelector('.statusBlock');
    expect(block).not.toHaveClass('statusBlockIdle');
  });

  it('colours a fully successful block green via rgb interpolation', () => {
    const data = makeStatusData({
      totalSuccess: 4,
      blockDetails: [makeDetail({ success: 4, failure: 0, rate: 1 })],
    });

    const { container } = render(<ProviderStatusBar statusData={data} styles={STYLES} />);

    const block = container.querySelector('.statusBlock') as HTMLElement;
    expect(block).toHaveStyle({ backgroundColor: 'rgb(34, 197, 94)' });
  });

  it('colours a fully failed block red via rgb interpolation', () => {
    const data = makeStatusData({
      totalFailure: 4,
      blockDetails: [makeDetail({ success: 0, failure: 4, rate: 0 })],
    });

    const { container } = render(<ProviderStatusBar statusData={data} styles={STYLES} />);

    const block = container.querySelector('.statusBlock') as HTMLElement;
    expect(block).toHaveStyle({ backgroundColor: 'rgb(239, 68, 68)' });
  });

  it('colours a half-success block the midpoint gold via rgb interpolation', () => {
    const data = makeStatusData({
      totalSuccess: 1,
      totalFailure: 1,
      blockDetails: [makeDetail({ success: 1, failure: 1, rate: 0.5 })],
    });

    const { container } = render(<ProviderStatusBar statusData={data} styles={STYLES} />);

    const block = container.querySelector('.statusBlock') as HTMLElement;
    expect(block).toHaveStyle({ backgroundColor: 'rgb(250, 204, 21)' });
  });

  it('applies the high rate class when the success rate is at least 90', () => {
    const data = makeStatusData({ successRate: 95, totalSuccess: 19, totalFailure: 1 });

    render(<ProviderStatusBar statusData={data} styles={STYLES} />);

    expect(screen.getByText('95%')).toHaveClass('statusRateHigh');
  });

  it('applies the medium rate class when the success rate is between 50 and 90', () => {
    const data = makeStatusData({ successRate: 75, totalSuccess: 3, totalFailure: 1 });

    render(<ProviderStatusBar statusData={data} styles={STYLES} />);

    expect(screen.getByText('75%')).toHaveClass('statusRateMedium');
  });

  it('applies the low rate class when the success rate is below 50', () => {
    const data = makeStatusData({ successRate: 25, totalSuccess: 1, totalFailure: 3 });

    render(<ProviderStatusBar statusData={data} styles={STYLES} />);

    expect(screen.getByText('25%')).toHaveClass('statusRateLow');
  });

  it('shows a tooltip with success and failure counts when a populated block is hovered', async () => {
    const user = userEvent.setup();
    const data = makeStatusData({
      totalSuccess: 3,
      totalFailure: 1,
      blockDetails: [makeDetail({ success: 3, failure: 1, rate: 0.75 })],
    });

    const { container } = render(<ProviderStatusBar statusData={data} styles={STYLES} />);
    await user.hover(container.querySelector('.statusBlockWrapper') as HTMLElement);

    expect(screen.getByText('✓ 3')).toBeInTheDocument();
  });

  it('shows the no-requests tooltip text when an empty block is hovered', async () => {
    const user = userEvent.setup();
    const data = makeStatusData({ blockDetails: [makeDetail({ success: 0, failure: 0, rate: -1 })] });

    const { container } = render(<ProviderStatusBar statusData={data} styles={STYLES} />);
    await user.hover(container.querySelector('.statusBlockWrapper') as HTMLElement);

    expect(screen.getByText('No requests')).toBeInTheDocument();
  });
});
