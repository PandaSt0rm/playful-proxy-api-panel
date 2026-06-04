import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, userEvent, within } from '@/test/utils';
import { VisualConfigEditor } from './VisualConfigEditor';
import { DEFAULT_VISUAL_VALUES } from '@/types/visualConfig';
import type {
  VisualConfigValues,
  VisualConfigValidationErrors,
} from '@/types/visualConfig';
import { useNotificationStore } from '@/stores';

/**
 * Build a fresh, deeply-cloned copy of the default visual config values so each
 * test mutates its own fixture and never leaks shared nested objects/arrays.
 */
function makeValues(overrides: Partial<VisualConfigValues> = {}): VisualConfigValues {
  const base = structuredClone(DEFAULT_VISUAL_VALUES);
  return { ...base, ...overrides };
}

function renderEditor(
  props: Partial<{
    values: VisualConfigValues;
    validationErrors: VisualConfigValidationErrors;
    hasPayloadValidationErrors: boolean;
    disabled: boolean;
    onChange: (patch: Partial<VisualConfigValues>) => void;
  }> = {}
) {
  const onChange = props.onChange ?? vi.fn();
  const utils = render(
    <VisualConfigEditor
      values={props.values ?? makeValues()}
      validationErrors={props.validationErrors}
      hasPayloadValidationErrors={props.hasPayloadValidationErrors}
      disabled={props.disabled}
      onChange={onChange}
    />
  );
  return { onChange, ...utils };
}

beforeEach(() => {
  // ApiKeysCardEditor (a child) reads the notification store; reset it so the
  // singleton does not carry state between tests.
  useNotificationStore.setState({ notifications: [] });
  localStorage.clear();
});

describe('VisualConfigEditor rendering', () => {
  it('renders the server section heading from the fixture', () => {
    renderEditor();

    expect(
      screen.getByRole('heading', { name: 'Server Configuration', level: 2 })
    ).toBeInTheDocument();
  });

  it('renders all ten section headings', () => {
    renderEditor();

    const titles = [
      'Server Configuration',
      'TLS/SSL Configuration',
      'Home Control Plane',
      'Remote Management',
      'Authentication Configuration',
      'System Configuration',
      'Network Configuration',
      'Quota Fallback',
      'Streaming Configuration',
      'Payload Configuration',
    ];
    const found = titles.map(
      (title) => screen.getAllByRole('heading', { name: title, level: 2 }).length
    );

    expect(found).toEqual(titles.map(() => 1));
  });

  it('shows the host value supplied in the fixture', () => {
    renderEditor({ values: makeValues({ host: '0.0.0.0' }) });

    expect(screen.getByLabelText('Host Address')).toHaveValue('0.0.0.0');
  });

  it('shows the port value supplied in the fixture', () => {
    renderEditor({ values: makeValues({ port: '8317' }) });

    expect(screen.getByLabelText('Port')).toHaveValue(8317);
  });

  it('does not show a validation-blocked banner when there are no errors', () => {
    renderEditor();

    expect(
      screen.queryByText('Fix validation errors before saving')
    ).not.toBeInTheDocument();
  });
});

describe('VisualConfigEditor editing text fields', () => {
  it('emits a host patch with the new value when the host field changes', async () => {
    const user = userEvent.setup();
    const { onChange } = renderEditor({ values: makeValues({ host: '' }) });

    await user.type(screen.getByLabelText('Host Address'), 'x');

    expect(onChange).toHaveBeenCalledWith({ host: 'x' });
  });

  it('emits a port patch with the typed digit when the port field changes', async () => {
    const user = userEvent.setup();
    const { onChange } = renderEditor({ values: makeValues({ port: '' }) });

    await user.type(screen.getByLabelText('Port'), '9');

    expect(onChange).toHaveBeenCalledWith({ port: '9' });
  });

  it('emits only the changed field and leaves other top-level fields untouched', async () => {
    const user = userEvent.setup();
    const { onChange } = renderEditor({ values: makeValues({ host: '', port: '8317' }) });

    await user.type(screen.getByLabelText('Host Address'), 'a');

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ host: 'a' });
  });

  it('emits a proxyUrl patch when the network proxy field changes', async () => {
    const user = userEvent.setup();
    const { onChange } = renderEditor();

    await user.type(screen.getByLabelText('Proxy URL'), 'p');

    expect(onChange).toHaveBeenCalledWith({ proxyUrl: 'p' });
  });
});

describe('VisualConfigEditor toggles', () => {
  it('emits debug=true when the debug toggle is turned on from off', async () => {
    const user = userEvent.setup();
    const { onChange } = renderEditor({ values: makeValues({ debug: false }) });

    await user.click(screen.getByRole('checkbox', { name: 'Debug Mode' }));

    expect(onChange).toHaveBeenCalledWith({ debug: true });
  });

  it('emits debug=false when the debug toggle is turned off from on', async () => {
    const user = userEvent.setup();
    const { onChange } = renderEditor({ values: makeValues({ debug: true }) });

    await user.click(screen.getByRole('checkbox', { name: 'Debug Mode' }));

    expect(onChange).toHaveBeenCalledWith({ debug: false });
  });

  it('reflects the checked state of a toggle from the fixture', () => {
    renderEditor({ values: makeValues({ debug: true }) });

    expect(screen.getByRole('checkbox', { name: 'Debug Mode' })).toBeChecked();
  });
});

describe('VisualConfigEditor TLS conditional fields', () => {
  it('hides the certificate field when TLS is disabled', () => {
    renderEditor({ values: makeValues({ tlsEnable: false }) });

    expect(screen.queryByLabelText('Certificate File Path')).not.toBeInTheDocument();
  });

  it('shows the certificate field when TLS is enabled', () => {
    renderEditor({ values: makeValues({ tlsEnable: true, tlsCert: '/cert.pem' }) });

    expect(screen.getByLabelText('Certificate File Path')).toHaveValue('/cert.pem');
  });

  it('emits a tlsCert patch when the certificate field changes', async () => {
    const user = userEvent.setup();
    const { onChange } = renderEditor({
      values: makeValues({ tlsEnable: true, tlsCert: '' }),
    });

    await user.type(screen.getByLabelText('Certificate File Path'), '/');

    expect(onChange).toHaveBeenCalledWith({ tlsCert: '/' });
  });
});

describe('VisualConfigEditor nested config patches', () => {
  it('emits a streaming patch preserving sibling streaming fields when keepalive changes', async () => {
    const user = userEvent.setup();
    const { onChange } = renderEditor({
      values: makeValues({
        streaming: { keepaliveSeconds: '', bootstrapRetries: '3', nonstreamKeepaliveInterval: '5' },
      }),
    });

    await user.type(screen.getByLabelText('Keepalive Seconds'), '9');

    expect(onChange).toHaveBeenCalledWith({
      streaming: { keepaliveSeconds: '9', bootstrapRetries: '3', nonstreamKeepaliveInterval: '5' },
    });
  });

  it('emits a claudeHeaderDefaults patch preserving sibling header fields when user agent changes', async () => {
    const user = userEvent.setup();
    const baseHeader = {
      userAgent: '',
      packageVersion: 'pkg',
      runtimeVersion: 'rt',
      os: 'linux',
      arch: 'x64',
      timeout: '60',
      stabilizeDeviceProfile: true,
      betaFeaturesText: '',
    };
    const { onChange } = renderEditor({
      values: makeValues({ claudeHeaderDefaults: baseHeader }),
    });

    const userAgentInputs = screen.getAllByLabelText('User-Agent');
    await user.type(userAgentInputs[0], 'U');

    expect(onChange).toHaveBeenCalledWith({
      claudeHeaderDefaults: { ...baseHeader, userAgent: 'U' },
    });
  });
});

describe('VisualConfigEditor keepalive disabled pill', () => {
  it('shows the disabled pill in the keepalive section when keepalive is empty', () => {
    renderEditor({
      values: makeValues({
        streaming: { keepaliveSeconds: '', bootstrapRetries: '', nonstreamKeepaliveInterval: '5' },
      }),
    });

    const keepaliveField = screen.getByLabelText('Keepalive Seconds').closest('div');

    expect(within(keepaliveField as HTMLElement).getByText('Disabled')).toBeInTheDocument();
  });

  it('shows the disabled pill when keepalive is exactly "0"', () => {
    renderEditor({
      values: makeValues({
        streaming: { keepaliveSeconds: '0', bootstrapRetries: '', nonstreamKeepaliveInterval: '5' },
      }),
    });

    const keepaliveField = screen.getByLabelText('Keepalive Seconds').closest('div');

    expect(within(keepaliveField as HTMLElement).getByText('Disabled')).toBeInTheDocument();
  });

  it('hides the disabled pill when keepalive is a positive number', () => {
    renderEditor({
      values: makeValues({
        streaming: { keepaliveSeconds: '30', bootstrapRetries: '', nonstreamKeepaliveInterval: '5' },
      }),
    });

    const keepaliveField = screen.getByLabelText('Keepalive Seconds').closest('div');

    expect(within(keepaliveField as HTMLElement).queryByText('Disabled')).not.toBeInTheDocument();
  });
});

describe('VisualConfigEditor disabled state', () => {
  it('disables the host input when the editor is disabled', () => {
    renderEditor({ disabled: true });

    expect(screen.getByLabelText('Host Address')).toBeDisabled();
  });

  it('disables the debug toggle when the editor is disabled', () => {
    renderEditor({ disabled: true });

    expect(screen.getByRole('checkbox', { name: 'Debug Mode' })).toBeDisabled();
  });

  it('disables the Add Limit button when the editor is disabled', () => {
    renderEditor({ disabled: true });

    expect(screen.getByRole('button', { name: 'Add Limit' })).toBeDisabled();
  });
});

describe('VisualConfigEditor upstream provider limits', () => {
  it('shows the empty-state message when there are no provider limits', () => {
    renderEditor({
      values: makeValues({
        upstreamConcurrency: { defaultLimit: '', providerLimits: [], queueTimeoutSeconds: '' },
      }),
    });

    expect(screen.getByText('No provider-specific limits configured.')).toBeInTheDocument();
  });

  it('appends a new empty provider limit entry when Add Limit is clicked', async () => {
    const user = userEvent.setup();
    const { onChange } = renderEditor({
      values: makeValues({
        upstreamConcurrency: { defaultLimit: '', providerLimits: [], queueTimeoutSeconds: '' },
      }),
    });

    await user.click(screen.getByRole('button', { name: 'Add Limit' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const patch = onChange.mock.calls[0][0];
    expect(patch.upstreamConcurrency?.providerLimits).toHaveLength(1);
    expect(patch.upstreamConcurrency?.providerLimits[0]).toMatchObject({
      provider: '',
      limit: '',
    });
  });

  it('renders one limit row per provider entry in the fixture', () => {
    renderEditor({
      values: makeValues({
        upstreamConcurrency: {
          defaultLimit: '',
          queueTimeoutSeconds: '',
          providerLimits: [
            { id: 'a', provider: 'codex', limit: '2' },
            { id: 'b', provider: 'claude', limit: '4' },
          ],
        },
      }),
    });

    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(2);
  });

  it('removes only the targeted provider entry when its Remove button is clicked', async () => {
    const user = userEvent.setup();
    const { onChange } = renderEditor({
      values: makeValues({
        upstreamConcurrency: {
          defaultLimit: '',
          queueTimeoutSeconds: '',
          providerLimits: [
            { id: 'a', provider: 'codex', limit: '2' },
            { id: 'b', provider: 'claude', limit: '4' },
          ],
        },
      }),
    });

    await user.click(screen.getAllByRole('button', { name: 'Remove' })[0]);

    expect(onChange).toHaveBeenCalledWith({
      upstreamConcurrency: {
        defaultLimit: '',
        queueTimeoutSeconds: '',
        providerLimits: [{ id: 'b', provider: 'claude', limit: '4' }],
      },
    });
  });

  it('emits a limit patch for the targeted entry when its limit input changes', async () => {
    const user = userEvent.setup();
    const { onChange } = renderEditor({
      values: makeValues({
        upstreamConcurrency: {
          defaultLimit: '',
          queueTimeoutSeconds: '',
          providerLimits: [{ id: 'a', provider: 'codex', limit: '' }],
        },
      }),
    });

    await user.type(screen.getByLabelText('Limit'), '5');

    expect(onChange).toHaveBeenCalledWith({
      upstreamConcurrency: {
        defaultLimit: '',
        queueTimeoutSeconds: '',
        providerLimits: [{ id: 'a', provider: 'codex', limit: '5' }],
      },
    });
  });
});

describe('VisualConfigEditor validation errors', () => {
  it('shows the port-range message when the port field has a port_range error', () => {
    renderEditor({ validationErrors: { port: 'port_range' } });

    expect(
      screen.getByText('Enter a valid port between 1 and 65535')
    ).toBeInTheDocument();
  });

  it('shows the validation-blocked banner when any field has an error', () => {
    renderEditor({ validationErrors: { port: 'port_range' } });

    expect(
      screen.getByText('Fix validation errors before saving')
    ).toBeInTheDocument();
  });

  it('shows the validation-blocked banner when payload validation errors are present', () => {
    renderEditor({ hasPayloadValidationErrors: true });

    expect(
      screen.getByText('Fix validation errors before saving')
    ).toBeInTheDocument();
  });

  it('renders an error count badge for the section that owns the failing field', () => {
    renderEditor({ validationErrors: { port: 'port_range' } });

    const serverNavButtons = screen.getAllByRole('button', { name: /Server Configuration/ });

    expect(
      serverNavButtons.some((button) => within(button).queryByText('1') !== null)
    ).toBe(true);
  });

  it('renders the upstream providers error message when that path has an error', () => {
    renderEditor({
      validationErrors: { 'upstreamConcurrency.providers': 'provider_limit_duplicate' },
    });

    expect(
      screen.getByText('Provider limits must use unique provider keys')
    ).toBeInTheDocument();
  });
});

describe('VisualConfigEditor payload rules', () => {
  it('shows the no-rules empty state for an empty default rules list', () => {
    renderEditor({ values: makeValues({ payloadDefaultRules: [] }) });

    // Each of the five payload subsections renders its own empty state.
    expect(screen.getAllByText('No rules')).toHaveLength(5);
  });

  it('emits a default-rules patch with one new rule when Add Rule is clicked in the first subsection', async () => {
    const user = userEvent.setup();
    const { onChange } = renderEditor({ values: makeValues({ payloadDefaultRules: [] }) });

    await user.click(screen.getAllByRole('button', { name: 'Add Rule' })[0]);

    expect(onChange).toHaveBeenCalledTimes(1);
    const patch = onChange.mock.calls[0][0];
    expect(patch.payloadDefaultRules).toHaveLength(1);
    expect(patch.payloadDefaultRules?.[0]).toMatchObject({ models: [], params: [] });
  });

  it('removes the targeted default rule when its delete button is clicked', async () => {
    const user = userEvent.setup();
    const { onChange } = renderEditor({
      values: makeValues({
        payloadDefaultRules: [
          { id: 'r1', models: [], params: [] },
          { id: 'r2', models: [], params: [] },
        ],
      }),
    });

    // The first "Delete" button in the default-rules card removes rule 1.
    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0]);

    expect(onChange).toHaveBeenCalledWith({
      payloadDefaultRules: [{ id: 'r2', models: [], params: [] }],
    });
  });

  it('renders the rule card title for each rule in the fixture', () => {
    renderEditor({
      values: makeValues({
        payloadDefaultRules: [{ id: 'r1', models: [], params: [] }],
      }),
    });

    expect(screen.getByText('Rule 1')).toBeInTheDocument();
  });
});

describe('VisualConfigEditor api keys block', () => {
  it('shows the api-keys empty state when no keys are present', () => {
    renderEditor({ values: makeValues({ apiKeysText: '' }) });

    expect(screen.getByText('No API keys')).toBeInTheDocument();
  });

  it('lists each api key line from the fixture text', () => {
    renderEditor({ values: makeValues({ apiKeysText: 'sk-aaa\nsk-bbb' }) });

    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('#2')).toBeInTheDocument();
  });
});

describe('VisualConfigEditor empty config', () => {
  it('renders without crashing for the default empty values', () => {
    renderEditor({ values: makeValues() });

    expect(
      screen.getByRole('heading', { name: 'Server Configuration', level: 2 })
    ).toBeInTheDocument();
  });

  it('renders an empty host input for the default empty values', () => {
    renderEditor({ values: makeValues() });

    expect(screen.getByLabelText('Host Address')).toHaveValue('');
  });
});
