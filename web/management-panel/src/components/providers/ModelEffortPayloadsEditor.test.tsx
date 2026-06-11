import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { render, screen, userEvent } from '@/test/utils';
import type { ModelEntry } from '@/components/ui/modelInputListUtils';
import { ModelEffortPayloadsEditor } from './ModelEffortPayloadsEditor';

// Stateful harness so commits round-trip into the entry like ModelInputList
// does, exercising the editor's draft-resync logic. The probe exposes the
// persisted entry shape (JSON.stringify drops undefined fields).
function Harness({ initial }: { initial?: Partial<ModelEntry> }) {
  const [entry, setEntry] = useState<ModelEntry>({ name: 'm1', alias: '', ...initial });
  return (
    <>
      <ModelEffortPayloadsEditor
        entry={entry}
        index={0}
        disabled={false}
        updateEntry={(patch) => setEntry((prev) => ({ ...prev, ...patch }))}
      />
      <pre data-testid="entry-probe">{JSON.stringify(entry)}</pre>
    </>
  );
}

const probedEntry = (): ModelEntry =>
  JSON.parse(screen.getByTestId('entry-probe').textContent ?? '{}') as ModelEntry;

const openEditor = async (user: ReturnType<typeof userEvent.setup>, name = 'effort payloads') => {
  await user.click(screen.getByRole('button', { name }));
};

describe('ModelEffortPayloadsEditor', () => {
  it('renders a bare toggle when no effort config exists and opens the panel', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const toggle = screen.getByRole('button', { name: 'effort payloads' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await user.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    for (const label of ['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'none', 'auto']) {
      expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'false');
    }
    expect(screen.getByRole('button', { name: 'GLM thinking.type' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Qwen enable_thinking' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'OpenRouter reasoning' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'clear' })).toBeDisabled();
  });

  it('toggling a level chip on declares the level and shows its payload row', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openEditor(user);

    await user.click(screen.getByRole('button', { name: 'high' }));

    expect(probedEntry().thinkingLevels).toEqual(['high']);
    expect(probedEntry().thinking?.levels).toEqual(['high']);
    expect(screen.getByRole('button', { name: 'high' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('textbox', { name: 'high payload' })).toHaveValue('');
    expect(screen.getByRole('button', { name: 'effort payloads (1)' })).toBeInTheDocument();
  });

  it('orders toggled levels canonically regardless of click order', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openEditor(user);

    await user.click(screen.getByRole('button', { name: 'max' }));
    await user.click(screen.getByRole('button', { name: 'low' }));

    expect(probedEntry().thinkingLevels).toEqual(['low', 'max']);
  });

  it('commits a payload typed into a level row', async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ thinkingLevels: ['high'], thinking: { levels: ['high'] } }} />);
    await openEditor(user, 'effort payloads (1)');

    const input = screen.getByRole('textbox', { name: 'high payload' });
    await user.click(input);
    await user.paste('{"thinking": {"type": "enabled"}}');

    expect(probedEntry().thinkingPayloads).toEqual({ high: { thinking: { type: 'enabled' } } });
  });

  it('flags invalid per-level payload JSON without committing it', async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ thinkingLevels: ['high'], thinking: { levels: ['high'] } }} />);
    await openEditor(user, 'effort payloads (1)');

    const input = screen.getByRole('textbox', { name: 'high payload' });
    await user.click(input);
    await user.paste('not json');

    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(probedEntry().thinkingPayloads).toBeUndefined();
  });

  it('toggling an active level off removes both the level and its payload', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={{
          thinkingLevels: ['high'],
          thinking: { levels: ['high'] },
          thinkingPayloads: { high: { thinking: { type: 'enabled' } } },
        }}
      />
    );
    await openEditor(user, 'effort payloads (1)');

    await user.click(screen.getByRole('button', { name: 'high' }));

    const entry = probedEntry();
    expect(entry.thinkingLevels).toBeUndefined();
    expect(entry.thinkingPayloads).toBeUndefined();
  });

  it('activates payload-only labels (none) as a row and commits typed payloads', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openEditor(user);

    await user.click(screen.getByRole('button', { name: 'none' }));
    // none is payload-only: no level is declared until a payload is entered.
    expect(probedEntry().thinkingLevels).toBeUndefined();

    const input = screen.getByRole('textbox', { name: 'none payload' });
    await user.click(input);
    await user.paste('{"enable_thinking": false}');

    expect(probedEntry().thinkingPayloads).toEqual({ none: { enable_thinking: false } });
    expect(probedEntry().thinkingLevels).toBeUndefined();
  });

  it('keeps the payload row visible after its text is cleared', async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ thinkingPayloads: { none: { enable_thinking: false } } }} />);
    await openEditor(user, 'effort payloads (1)');

    const input = screen.getByRole('textbox', { name: 'none payload' });
    await user.clear(input);

    expect(probedEntry().thinkingPayloads).toBeUndefined();
    expect(screen.getByRole('textbox', { name: 'none payload' })).toBeInTheDocument();
  });

  it('applies the Qwen template and marks payload-carrying chips active', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openEditor(user);

    await user.click(screen.getByRole('button', { name: 'Qwen enable_thinking' }));

    expect(probedEntry().thinkingPayloads).toEqual({
      none: { enable_thinking: false },
      low: { enable_thinking: true, thinking_budget: 1024 },
      medium: { enable_thinking: true, thinking_budget: 8192 },
      high: { enable_thinking: true, thinking_budget: 24576 },
    });
    for (const label of ['none', 'low', 'medium', 'high']) {
      expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'true');
    }
    expect(screen.getByRole('textbox', { name: 'low payload' })).toHaveValue(
      JSON.stringify({ enable_thinking: true, thinking_budget: 1024 })
    );
  });

  it('clear resets levels and payloads in one step', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={{
          thinkingLevels: ['low', 'high'],
          thinking: { levels: ['low', 'high'] },
          thinkingPayloads: { high: { thinking: { type: 'enabled' } } },
        }}
      />
    );
    await openEditor(user, 'effort payloads (2)');

    await user.click(screen.getByRole('button', { name: 'clear' }));

    const entry = probedEntry();
    expect(entry.thinkingLevels).toBeUndefined();
    expect(entry.thinkingPayloads).toBeUndefined();
    expect(screen.getByRole('button', { name: 'effort payloads' })).toBeInTheDocument();
  });

  it('JSON mode seeds the raw map from the entry and commits edits to it', async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ thinkingPayloads: { high: { a: 1 } } }} />);
    await openEditor(user, 'effort payloads (1)');

    await user.click(screen.getByRole('button', { name: 'JSON' }));

    const textarea = screen.getByRole('textbox', { name: 'effort payloads' });
    expect(textarea).toHaveValue(JSON.stringify({ high: { a: 1 } }, null, 2));

    await user.clear(textarea);
    await user.click(textarea);
    await user.paste('{"low": {"b": 2}}');

    expect(probedEntry().thinkingPayloads).toEqual({ low: { b: 2 } });
    expect(screen.getByRole('button', { name: 'low' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('level chips stay effective in JSON mode and rewrite the JSON text', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openEditor(user);
    await user.click(screen.getByRole('button', { name: 'JSON' }));

    await user.click(screen.getByRole('button', { name: 'high' }));

    expect(probedEntry().thinkingLevels).toEqual(['high']);
    expect(screen.getByRole('button', { name: 'high' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('textbox', { name: 'effort payloads' })).toHaveValue(
      JSON.stringify({ high: {} }, null, 2)
    );

    await user.click(screen.getByRole('button', { name: 'high' }));

    expect(probedEntry().thinkingLevels).toBeUndefined();
    expect(screen.getByRole('textbox', { name: 'effort payloads' })).toHaveValue('');
  });

  it('JSON mode seeds bare levels as {} keys and round-trips them', async () => {
    const user = userEvent.setup();
    render(
      <Harness initial={{ thinkingLevels: ['low', 'high'], thinking: { levels: ['low', 'high'] } }} />
    );
    await openEditor(user, 'effort payloads (2)');
    await user.click(screen.getByRole('button', { name: 'JSON' }));

    expect(screen.getByRole('textbox', { name: 'effort payloads' })).toHaveValue(
      JSON.stringify({ low: {}, high: {} }, null, 2)
    );
  });

  it('typing a bare {} level key in JSON mode declares the level without a payload', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openEditor(user);
    await user.click(screen.getByRole('button', { name: 'JSON' }));

    const textarea = screen.getByRole('textbox', { name: 'effort payloads' });
    await user.click(textarea);
    await user.paste('{"xhigh": {}, "max": {"thinking": {"type": "enabled"}}}');

    const entry = probedEntry();
    expect(entry.thinkingLevels).toEqual(['xhigh', 'max']);
    expect(entry.thinkingPayloads).toEqual({ max: { thinking: { type: 'enabled' } } });
    expect(screen.getByRole('button', { name: 'xhigh' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('clearing the JSON text deactivates all labels', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        initial={{
          thinkingLevels: ['high'],
          thinking: { levels: ['high'] },
          thinkingPayloads: { high: { a: 1 } },
        }}
      />
    );
    await openEditor(user, 'effort payloads (1)');
    await user.click(screen.getByRole('button', { name: 'JSON' }));

    await user.clear(screen.getByRole('textbox', { name: 'effort payloads' }));

    const entry = probedEntry();
    expect(entry.thinkingLevels).toBeUndefined();
    expect(entry.thinkingPayloads).toBeUndefined();
    expect(screen.getByRole('button', { name: 'high' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('applies the DeepSeek template with thinking.type plus reasoning_effort', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openEditor(user);

    await user.click(screen.getByRole('button', { name: 'DeepSeek thinking' }));

    expect(probedEntry().thinkingPayloads).toEqual({
      none: { thinking: { type: 'disabled' } },
      high: { thinking: { type: 'enabled' }, reasoning_effort: 'high' },
      max: { thinking: { type: 'enabled' }, reasoning_effort: 'max' },
    });
  });

  it('applies the vLLM template with chat_template_kwargs', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openEditor(user);

    await user.click(screen.getByRole('button', { name: 'vLLM enable_thinking' }));

    expect(probedEntry().thinkingPayloads).toEqual({
      none: { chat_template_kwargs: { enable_thinking: false } },
      high: { chat_template_kwargs: { enable_thinking: true } },
    });
  });

  it('renders the full template roster', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openEditor(user);

    for (const label of [
      'GLM thinking.type',
      'Qwen enable_thinking',
      'OpenRouter reasoning',
      'DeepSeek thinking',
      'Doubao thinking',
      'Kimi thinking',
      'vLLM enable_thinking',
      'Gemini thinking_config',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('JSON mode rejects maps with unknown labels without committing', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await openEditor(user);
    await user.click(screen.getByRole('button', { name: 'JSON' }));

    const textarea = screen.getByRole('textbox', { name: 'effort payloads' });
    await user.click(textarea);
    await user.paste('{"turbo": {"x": 1}}');

    expect(textarea).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(/Invalid payloads/)).toBeInTheDocument();
    expect(probedEntry().thinkingPayloads).toBeUndefined();
  });
});
