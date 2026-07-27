import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, userEvent, within } from '@/test/utils';
import type { ApiCallRequest, ApiCallResult } from '@/services/api';
import type { DebugTarget } from '@/features/providerDebug/types';
import { ProviderDebugDrawer } from './ProviderDebugDrawer';

const LIVE_KEY = 'sk-proj-abcdefghijklmnopqrstuvwxyz0123456789';

const request = vi.fn();
vi.mock('@/services/api', () => ({
  apiCallApi: { request: (...args: unknown[]) => request(...args) },
  getApiCallErrorMessage: (result: { statusCode: number; body: unknown }) => {
    const body = result.body as { error?: { message?: string } } | null;
    return `${result.statusCode} ${body?.error?.message ?? ''}`.trim();
  },
  getApiErrorDetail: () => '',
}));

const showNotification = vi.fn();
vi.mock('@/stores', () => ({ useNotificationStore: () => ({ showNotification }) }));

const copyToClipboard = vi.fn(() => Promise.resolve(true));
vi.mock('@/utils/clipboard', () => ({ copyToClipboard: (text: string) => copyToClipboard(text) }));

const MODELS_OK: ApiCallResult = {
  statusCode: 200,
  header: { 'content-type': ['application/json'] },
  bodyText: '{"data":[{"id":"gpt-4o"}]}',
  body: { data: [{ id: 'gpt-4o' }] },
};

const UNAUTHORIZED: ApiCallResult = {
  statusCode: 401,
  header: { 'content-type': ['application/json'] },
  bodyText: '{"error":{"message":"Incorrect API key provided"}}',
  body: { error: { message: 'Incorrect API key provided' } },
};

const buildTarget = (overrides: Partial<DebugTarget> = {}): DebugTarget => ({
  providerLabel: 'openrouter',
  family: 'openai',
  baseUrl: 'https://api.example.com/v1',
  headers: {},
  keys: [{ apiKey: LIVE_KEY }],
  models: ['gpt-4o'],
  ...overrides,
});

const renderDrawer = (target = buildTarget()) =>
  render(<ProviderDebugDrawer open onClose={vi.fn()} target={target} />);

/**
 * Runs the bench and waits for it to settle. While a run is in flight the action reads
 * "Cancel", so its return to "Run checks" is the signal that every unit has resolved.
 */
const runAndSettle = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'Run checks' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Run checks' })).toBeEnabled());
};

beforeEach(() => {
  request.mockReset();
  showNotification.mockReset();
  copyToClipboard.mockClear();
  // Unauthenticated reachability succeeds; anything carrying the key is rejected.
  request.mockImplementation((payload: ApiCallRequest) =>
    Promise.resolve(payload.header?.Authorization ? UNAUTHORIZED : MODELS_OK)
  );
});

describe('ProviderDebugDrawer', () => {
  it('offers every check, selected by default, with the key count in view', () => {
    renderDrawer(buildTarget({ keys: [{ apiKey: LIVE_KEY }, { apiKey: LIVE_KEY }] }));

    expect(screen.getByRole('checkbox', { name: /Reachability/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Key/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Model catalog/ })).toBeChecked();
    expect(screen.getByText('2 keys configured')).toBeInTheDocument();
  });

  it('says nothing has run yet before the first run', () => {
    renderDrawer();
    expect(screen.getByText(/No checks run yet/)).toBeInTheDocument();
  });

  it('runs the selected checks and lists one rail row per unit', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await runAndSettle(user);

    // Scoped to the rail: the check labels also appear on the selection checkboxes.
    const rail = screen.getByRole('list');
    expect(within(rail).getByRole('button', { name: /Reachability/ })).toBeInTheDocument();
    expect(within(rail).getByRole('button', { name: /Key · key #1/ })).toBeInTheDocument();
    expect(within(rail).getByRole('button', { name: /Model catalog/ })).toBeInTheDocument();
  });

  it('lands on the first failure so the operator does not have to hunt for it', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await runAndSettle(user);

    expect(screen.getByText(/Key rejected/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Key · key #1/ })).toHaveAttribute(
      'aria-current',
      'true'
    );
  });

  it('shows the wire exchange with the credential masked', async () => {
    const user = userEvent.setup();
    const { container } = renderDrawer();

    await runAndSettle(user);

    expect(screen.getByText('Request')).toBeInTheDocument();
    expect(screen.getByText(/> GET https:\/\/api\.example\.com\/v1\/models/)).toBeInTheDocument();
    expect(screen.getByText(/< HTTP 401/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(LIVE_KEY);
    expect(container.ownerDocument.body.textContent).toContain('sk-proj-••••6789');
  });

  it('renders the hop chain so the request path is legible', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await runAndSettle(user);

    expect(screen.getByText('you')).toBeInTheDocument();
    expect(screen.getByText('api.example.com')).toBeInTheDocument();
  });

  it('copies a transcript that carries no live credential', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await runAndSettle(user);
    await user.click(screen.getByRole('button', { name: 'Copy trace' }));

    const copied = copyToClipboard.mock.calls[0][0] as unknown as string;
    expect(copied).toContain('> GET https://api.example.com/v1/models');
    expect(copied).not.toContain(LIVE_KEY);
    expect(showNotification).toHaveBeenCalledWith('Trace copied', 'success');
  });

  it('lets the operator open a different check', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await runAndSettle(user);
    await user.click(within(screen.getByRole('list')).getByRole('button', { name: /Reachability/ }));

    expect(screen.getByText(/Provider responded with HTTP 200/)).toBeInTheDocument();
  });

  it('will not run with every check deselected', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.click(screen.getByRole('checkbox', { name: /Reachability/ }));
    await user.click(screen.getByRole('checkbox', { name: /^Key/ }));
    await user.click(screen.getByRole('checkbox', { name: /Model catalog/ }));

    expect(screen.getByRole('button', { name: 'Run checks' })).toBeDisabled();
    expect(request).not.toHaveBeenCalled();
  });

  it('reports a missing base url instead of calling out', async () => {
    const user = userEvent.setup();
    renderDrawer(buildTarget({ baseUrl: '' }));

    await runAndSettle(user);

    expect(screen.getByText('Set a base URL before running checks.')).toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
  });
});

describe('ProviderDebugDrawer — cost gate', () => {
  it('leaves the billable checks unselected, so the default run cannot spend anything', async () => {
    const user = userEvent.setup();
    renderDrawer();

    expect(screen.getByRole('checkbox', { name: /Completion/ })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Vision/ })).not.toBeChecked();

    await runAndSettle(user);
    expect(screen.queryByRole('dialog', { name: 'Run billable checks' })).not.toBeInTheDocument();
  });

  it('will not start a billable run without a counted confirmation', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.click(screen.getByRole('checkbox', { name: /Completion/ }));
    await user.click(screen.getByRole('checkbox', { name: /Tool calling/ }));
    await user.click(screen.getByRole('button', { name: 'Run checks' }));

    // The number is the point: a cost gate without one is a shrug.
    expect(screen.getByText(/This sends 2 real requests/)).toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
  });

  it('runs only after the operator confirms the spend', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.click(screen.getByRole('checkbox', { name: /Completion/ }));
    await user.click(screen.getByRole('button', { name: 'Run checks' }));
    await user.click(screen.getByRole('button', { name: 'Run and bill' }));

    await waitFor(() => expect(request).toHaveBeenCalled());
  });

  it('spends nothing when the operator backs out', async () => {
    const user = userEvent.setup();
    renderDrawer();

    await user.click(screen.getByRole('checkbox', { name: /Completion/ }));
    await user.click(screen.getByRole('button', { name: 'Run checks' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    // The dialog stays mounted through its close animation.
    await waitFor(() => expect(screen.queryByText(/This sends/)).not.toBeInTheDocument());
    expect(request).not.toHaveBeenCalled();
  });
});

describe('ProviderDebugDrawer — model matrix', () => {
  const matrixTarget = () =>
    buildTarget({
      keys: [{ apiKey: LIVE_KEY }, { apiKey: 'sk-second-key-value-here' }],
      models: ['gpt-4o', 'gpt-4o-mini'],
    });

  it('shows the cell count on the action, because every cell is billed', async () => {
    const user = userEvent.setup();
    renderDrawer(matrixTarget());

    await user.click(screen.getByRole('button', { name: 'Model matrix' }));

    expect(screen.getByRole('button', { name: 'Run 4 cells' })).toBeInTheDocument();
  });

  it('lays models against keys so a bad row or column is visible at a glance', async () => {
    const user = userEvent.setup();
    renderDrawer(matrixTarget());

    await user.click(screen.getByRole('button', { name: 'Model matrix' }));

    const grid = screen.getByRole('table');
    expect(within(grid).getByRole('rowheader', { name: 'gpt-4o' })).toBeInTheDocument();
    expect(within(grid).getByRole('rowheader', { name: 'gpt-4o-mini' })).toBeInTheDocument();
    expect(within(grid).getByRole('columnheader', { name: 'key #1' })).toBeInTheDocument();
    expect(within(grid).getByRole('columnheader', { name: 'key #2' })).toBeInTheDocument();
  });

  it('gates the matrix behind the same counted confirmation', async () => {
    const user = userEvent.setup();
    renderDrawer(matrixTarget());

    await user.click(screen.getByRole('button', { name: 'Model matrix' }));
    await user.click(screen.getByRole('button', { name: 'Run 4 cells' }));

    expect(screen.getByText(/This sends 4 real requests/)).toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
  });

  it('tells the operator when there is nothing to build a matrix from', async () => {
    const user = userEvent.setup();
    renderDrawer(buildTarget({ models: [] }));

    await user.click(screen.getByRole('button', { name: 'Model matrix' }));

    expect(screen.getByText(/Add at least one model and one API key/)).toBeInTheDocument();
  });
});
