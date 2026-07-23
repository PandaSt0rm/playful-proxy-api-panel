import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, userEvent, within, waitFor } from '@/test/utils';
import {
  ApiKeysCardEditor,
  PayloadRulesEditor,
  PayloadFilterRulesEditor,
} from './VisualConfigEditorBlocks';
import { useNotificationStore } from '@/stores';
import type { PayloadRule, PayloadFilterRule } from '@/types/visualConfig';

const resetStores = () => {
  useNotificationStore.setState({
    notifications: [],
    confirmation: { isOpen: false, isLoading: false, options: null },
  });
};

beforeEach(() => {
  resetStores();
  localStorage.clear();
});

describe('ApiKeysCardEditor', () => {
  it('renders the empty state when no keys are present', () => {
    render(<ApiKeysCardEditor value="" onChange={vi.fn()} />);

    expect(screen.getByText('No API keys')).toBeInTheDocument();
  });

  it('renders one row per non-empty trimmed key', () => {
    render(<ApiKeysCardEditor value={'sk-aaaa\nsk-bbbb'} onChange={vi.fn()} />);

    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('#2')).toBeInTheDocument();
  });

  it('ignores blank lines when splitting keys', () => {
    render(<ApiKeysCardEditor value={'sk-aaaa\n\n   \nsk-bbbb'} onChange={vi.fn()} />);

    expect(screen.queryByText('#3')).not.toBeInTheDocument();
  });

  it('masks the displayed key value', () => {
    render(<ApiKeysCardEditor value="sk-abcdef" onChange={vi.fn()} />);

    expect(screen.getByText('sk******ef')).toBeInTheDocument();
  });

  it('opens the add modal with an empty input when Add is clicked', async () => {
    const user = userEvent.setup();

    render(<ApiKeysCardEditor value="" onChange={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Add API Key' }));

    expect(screen.getByRole('textbox', { name: 'API Key' })).toHaveValue('');
  });

  it('shows the add title when opening the add modal', async () => {
    const user = userEvent.setup();

    render(<ApiKeysCardEditor value="" onChange={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Add API Key' }));

    expect(screen.getByText('Add API Key', { selector: '.modal-title' })).toBeInTheDocument();
  });

  it('appends a new key to the existing list on save', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<ApiKeysCardEditor value="sk-existing" onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Add API Key' }));
    await user.type(screen.getByRole('textbox', { name: 'API Key' }), 'sk-new');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(onChange).toHaveBeenCalledWith('sk-existing\nsk-new');
  });

  it('reports an empty-key error and does not call onChange when saving a blank value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<ApiKeysCardEditor value="" onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Add API Key' }));
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(screen.getByText('Please enter an API key')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('reports an invalid-charset error when the key contains a space', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<ApiKeysCardEditor value="" onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Add API Key' }));
    await user.type(screen.getByRole('textbox', { name: 'API Key' }), 'bad key');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(screen.getByText('API key contains invalid characters')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('trims surrounding whitespace from the saved key', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<ApiKeysCardEditor value="" onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Add API Key' }));
    await user.type(screen.getByRole('textbox', { name: 'API Key' }), '  sk-trim  ');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(onChange).toHaveBeenCalledWith('sk-trim');
  });

  it('prefills the input with the existing key when editing', async () => {
    const user = userEvent.setup();

    render(<ApiKeysCardEditor value="sk-original" onChange={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.getByRole('textbox', { name: 'API Key' })).toHaveValue('sk-original');
  });

  it('replaces only the edited key on update', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<ApiKeysCardEditor value={'sk-first\nsk-second'} onChange={onChange} />);
    const secondRow = screen.getByText('#2').closest('.item-row') as HTMLElement;
    await user.click(within(secondRow).getByRole('button', { name: 'Edit' }));
    const input = screen.getByRole('textbox', { name: 'API Key' });
    await user.clear(input);
    await user.type(input, 'sk-updated');
    await user.click(screen.getByRole('button', { name: 'Update' }));

    expect(onChange).toHaveBeenCalledWith('sk-first\nsk-updated');
  });

  it('removes the targeted key on delete', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<ApiKeysCardEditor value={'sk-first\nsk-second'} onChange={onChange} />);
    const firstRow = screen.getByText('#1').closest('.item-row') as HTMLElement;
    await user.click(within(firstRow).getByRole('button', { name: 'Delete' }));

    expect(onChange).toHaveBeenCalledWith('sk-second');
  });

  it('produces an empty string when the only key is deleted', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<ApiKeysCardEditor value="sk-only" onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onChange).toHaveBeenCalledWith('');
  });

  it('generates a key with the sk- prefix and 17-character body when Generate is clicked', async () => {
    const user = userEvent.setup();

    render(<ApiKeysCardEditor value="" onChange={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Add API Key' }));
    await user.click(screen.getByRole('button', { name: 'Generate' }));

    const generated = (screen.getByRole('textbox', { name: 'API Key' }) as HTMLInputElement).value;

    expect(generated).toMatch(/^sk-[A-Za-z0-9]{17}$/);
  });

  it('disables the Add control when the editor is disabled', () => {
    render(<ApiKeysCardEditor value="" onChange={vi.fn()} disabled />);

    expect(screen.getByRole('button', { name: 'Add API Key' })).toBeDisabled();
  });

  it('notifies success after copying a key to the clipboard', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    render(<ApiKeysCardEditor value="sk-copyme" onChange={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Copy' }));

    await waitFor(() =>
      expect(useNotificationStore.getState().notifications.some((n) => n.type === 'success')).toBe(
        true
      )
    );

    if (originalClipboard) {
      Object.defineProperty(navigator, 'clipboard', originalClipboard);
    } else {
      delete (navigator as { clipboard?: unknown }).clipboard;
    }
  });

  it('passes the unmasked key value to the clipboard on copy', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    render(<ApiKeysCardEditor value="sk-copyme" onChange={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Copy' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('sk-copyme'));

    if (originalClipboard) {
      Object.defineProperty(navigator, 'clipboard', originalClipboard);
    } else {
      delete (navigator as { clipboard?: unknown }).clipboard;
    }
  });
});

describe('PayloadRulesEditor', () => {
  const makeRule = (overrides: Partial<PayloadRule> = {}): PayloadRule => ({
    id: 'rule-1',
    models: [],
    params: [],
    ...overrides,
  });

  it('renders the no-rules empty state for an empty value', () => {
    render(<PayloadRulesEditor value={[]} onChange={vi.fn()} />);

    expect(screen.getByText('No rules')).toBeInTheDocument();
  });

  it('adds a rule with empty models and params when Add Rule is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<PayloadRulesEditor value={[]} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Add Rule' }));

    const next = onChange.mock.calls[0][0] as PayloadRule[];
    expect(next).toHaveLength(1);
    expect(next[0].models).toEqual([]);
    expect(next[0].params).toEqual([]);
  });

  it('removes the targeted rule when its Delete button is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const rules = [makeRule({ id: 'r1' }), makeRule({ id: 'r2' })];

    render(<PayloadRulesEditor value={rules} onChange={onChange} />);
    const card = screen.getByText('Rule 1').closest('div')?.parentElement as HTMLElement;
    await user.click(within(card).getAllByRole('button', { name: 'Delete' })[0]);

    const next = onChange.mock.calls[0][0] as PayloadRule[];
    expect(next).toEqual([rules[1]]);
  });

  it('appends a blank model to the rule when Add Model is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<PayloadRulesEditor value={[makeRule()]} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Add Model' }));

    const next = onChange.mock.calls[0][0] as PayloadRule[];
    expect(next[0].models).toHaveLength(1);
    expect(next[0].models[0].name).toBe('');
  });

  it('appends a string-typed param by default when Add Parameter is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<PayloadRulesEditor value={[makeRule()]} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Add Parameter' }));

    const next = onChange.mock.calls[0][0] as PayloadRule[];
    expect(next[0].params[0].valueType).toBe('string');
  });

  it('appends a json-typed param when rawJsonValues is enabled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<PayloadRulesEditor value={[makeRule()]} rawJsonValues onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Add Parameter' }));

    const next = onChange.mock.calls[0][0] as PayloadRule[];
    expect(next[0].params[0].valueType).toBe('json');
  });

  it('updates the param path with the typed character', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const rule = makeRule({
      params: [{ id: 'p1', path: '', valueType: 'string', value: '' }],
    });

    render(<PayloadRulesEditor value={[rule]} onChange={onChange} />);
    await user.type(screen.getByRole('textbox', { name: 'JSON Path (e.g., temperature)' }), 't');

    const next = onChange.mock.calls.at(-1)?.[0] as PayloadRule[];
    expect(next[0].params[0].path).toBe('t');
  });

  it('coerces a string param to boolean true when the type changes to boolean', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const rule = makeRule({
      params: [{ id: 'p1', path: 'x', valueType: 'string', value: 'hello' }],
    });

    render(<PayloadRulesEditor value={[rule]} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Parameter Type' }));
    await user.click(screen.getByRole('option', { name: 'Boolean' }));

    const next = onChange.mock.calls.at(-1)?.[0] as PayloadRule[];
    expect(next[0].params[0]).toMatchObject({ valueType: 'boolean', value: 'true' });
  });

  it('coerces an empty string param to {} when the type changes to json', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const rule = makeRule({
      params: [{ id: 'p1', path: 'x', valueType: 'string', value: '' }],
    });

    render(<PayloadRulesEditor value={[rule]} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Parameter Type' }));
    await user.click(screen.getByRole('option', { name: 'JSON' }));

    const next = onChange.mock.calls.at(-1)?.[0] as PayloadRule[];
    expect(next[0].params[0]).toMatchObject({ valueType: 'json', value: '{}' });
  });

  it('preserves a non-empty value when the type changes to json', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const rule = makeRule({
      params: [{ id: 'p1', path: 'x', valueType: 'string', value: '42' }],
    });

    render(<PayloadRulesEditor value={[rule]} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Parameter Type' }));
    await user.click(screen.getByRole('option', { name: 'JSON' }));

    const next = onChange.mock.calls.at(-1)?.[0] as PayloadRule[];
    expect(next[0].params[0]).toMatchObject({ valueType: 'json', value: '42' });
  });

  it('shows the invalid-number validation error for a non-numeric number param', () => {
    const rule = makeRule({
      params: [{ id: 'p1', path: 'x', valueType: 'number', value: 'abc' }],
    });

    render(<PayloadRulesEditor value={[rule]} onChange={vi.fn()} />);

    expect(screen.getByText('Enter a valid number')).toBeInTheDocument();
  });

  it('shows the invalid-json validation error for malformed json', () => {
    const rule = makeRule({
      params: [{ id: 'p1', path: 'x', valueType: 'json', value: '{bad' }],
    });

    render(<PayloadRulesEditor value={[rule]} onChange={vi.fn()} />);

    expect(screen.getByText('Enter valid JSON')).toBeInTheDocument();
  });

  it('does not show a validation error for a valid number param', () => {
    const rule = makeRule({
      params: [{ id: 'p1', path: 'x', valueType: 'number', value: '0.7' }],
    });

    render(<PayloadRulesEditor value={[rule]} onChange={vi.fn()} />);

    expect(screen.queryByText('Enter a valid number')).not.toBeInTheDocument();
  });

  it('renders a raw JSON textarea instead of a type selector in rawJsonValues mode', () => {
    const rule = makeRule({
      params: [{ id: 'p1', path: 'x', valueType: 'json', value: '{}' }],
    });

    render(<PayloadRulesEditor value={[rule]} rawJsonValues onChange={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'Parameter Type' })).not.toBeInTheDocument();
  });

  it('writes json value type when editing the raw JSON textarea', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const rule = makeRule({
      params: [{ id: 'p1', path: 'x', valueType: 'json', value: '' }],
    });

    render(<PayloadRulesEditor value={[rule]} rawJsonValues onChange={onChange} />);
    await user.type(screen.getByRole('textbox', { name: 'Parameter Value' }), '1');

    const next = onChange.mock.calls.at(-1)?.[0] as PayloadRule[];
    expect(next[0].params[0].valueType).toBe('json');
  });

  it('removes the targeted param when its Delete button is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const rule = makeRule({
      params: [
        { id: 'p1', path: 'a', valueType: 'string', value: '1' },
        { id: 'p2', path: 'b', valueType: 'string', value: '2' },
      ],
    });

    render(<PayloadRulesEditor value={[rule]} onChange={onChange} />);
    const paramRow = screen
      .getAllByRole('textbox', { name: 'JSON Path (e.g., temperature)' })[0]
      .closest('[class*="payloadRuleParamRow"]') as HTMLElement;
    await user.click(within(paramRow).getByRole('button', { name: 'Delete' }));

    const next = onChange.mock.calls[0][0] as PayloadRule[];
    expect(next[0].params).toHaveLength(1);
    expect(next[0].params[0].id).toBe('p2');
  });

  it('renders the protocol selector before the model name when protocolFirst is set', () => {
    const rule = makeRule({
      models: [{ id: 'm1', name: 'gpt-4', protocol: 'openai' }],
    });

    const { container } = render(
      <PayloadRulesEditor value={[rule]} protocolFirst onChange={vi.fn()} />
    );
    const row = container.querySelector('[class*="payloadRuleModelRowProtocolFirst"]');

    expect(row).not.toBeNull();
  });
});

describe('PayloadFilterRulesEditor (StringListEditor coverage)', () => {
  const makeFilterRule = (overrides: Partial<PayloadFilterRule> = {}): PayloadFilterRule => ({
    id: 'fr-1',
    models: [],
    params: [],
    ...overrides,
  });

  it('renders the no-rules empty state for an empty value', () => {
    render(<PayloadFilterRulesEditor value={[]} onChange={vi.fn()} />);

    expect(screen.getByText('No rules')).toBeInTheDocument();
  });

  it('adds a filter rule when Add Rule is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<PayloadFilterRulesEditor value={[]} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Add Rule' }));

    const next = onChange.mock.calls[0][0] as PayloadFilterRule[];
    expect(next).toHaveLength(1);
    expect(next[0].params).toEqual([]);
  });

  it('appends a blank string to the remove-params list when Add is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<PayloadFilterRulesEditor value={[makeFilterRule()]} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Add' }));

    const next = onChange.mock.calls[0][0] as PayloadFilterRule[];
    expect(next[0].params).toEqual(['']);
  });

  it('updates a string-list entry with the typed character', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const rule = makeFilterRule({ params: [''] });

    render(<PayloadFilterRulesEditor value={[rule]} onChange={onChange} />);
    await user.type(
      screen.getByRole('textbox', {
        name: 'JSON Path (gjson/sjson), e.g., generationConfig.thinkingConfig.thinkingBudget',
      }),
      't'
    );

    const next = onChange.mock.calls.at(-1)?.[0] as PayloadFilterRule[];
    expect(next[0].params[0]).toBe('t');
  });

  it('removes the targeted string-list entry on delete', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const rule = makeFilterRule({ params: ['keep', 'remove'] });

    render(<PayloadFilterRulesEditor value={[rule]} onChange={onChange} />);
    const inputs = screen.getAllByRole('textbox', {
      name: 'JSON Path (gjson/sjson), e.g., generationConfig.thinkingConfig.thinkingBudget',
    });
    const secondRow = inputs[1].closest('[class*="stringListRow"]') as HTMLElement;
    await user.click(within(secondRow).getByRole('button', { name: 'Delete' }));

    const next = onChange.mock.calls[0][0] as PayloadFilterRule[];
    expect(next[0].params).toEqual(['keep']);
  });

  it('strips newline characters pasted into a string-list entry', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const rule = makeFilterRule({ params: [''] });

    render(<PayloadFilterRulesEditor value={[rule]} onChange={onChange} />);
    await user.type(
      screen.getByRole('textbox', {
        name: 'JSON Path (gjson/sjson), e.g., generationConfig.thinkingConfig.thinkingBudget',
      }),
      'a{Enter}b'
    );

    const next = onChange.mock.calls.at(-1)?.[0] as PayloadFilterRule[];
    expect(next[0].params[0]).not.toMatch(/[\r\n]/);
  });

  it('adds a model to a filter rule when Add Model is clicked', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<PayloadFilterRulesEditor value={[makeFilterRule()]} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Add Model' }));

    const next = onChange.mock.calls[0][0] as PayloadFilterRule[];
    expect(next[0].models).toHaveLength(1);
  });
});
