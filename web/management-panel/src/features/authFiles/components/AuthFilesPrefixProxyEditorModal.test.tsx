import { describe, it, expect, vi } from 'vitest';
import { render, screen, userEvent, within } from '@/test/utils';
import { AuthFilesPrefixProxyEditorModal } from './AuthFilesPrefixProxyEditorModal';
import type { PrefixProxyEditorState } from '@/features/authFiles/hooks/useAuthFilesPrefixProxyEditor';

const buildEditor = (overrides: Partial<PrefixProxyEditorState> = {}): PrefixProxyEditorState => ({
  fileName: 'codex.json',
  fileInfoText: 'info text',
  loading: false,
  saving: false,
  error: null,
  originalText: '{}',
  rawText: '{}',
  json: { foo: 'bar' },
  prefix: 'pfx',
  proxyUrl: 'http://proxy',
  priority: '5',
  note: 'a note',
  noteTouched: false,
  headersText: '{}',
  headersTouched: false,
  headersError: null,
  ...overrides,
});

type ModalProps = Parameters<typeof AuthFilesPrefixProxyEditorModal>[0];

const baseProps = (overrides: Partial<ModalProps> = {}): ModalProps => ({
  disableControls: false,
  editor: buildEditor(),
  updatedText: '{}',
  dirty: false,
  onClose: vi.fn(),
  onCopyText: vi.fn(),
  onSave: vi.fn(),
  onChange: vi.fn(),
  ...overrides,
});

const getSaveButton = () => screen.getByRole('button', { name: 'Save' });

describe('AuthFilesPrefixProxyEditorModal visibility', () => {
  it('renders nothing when editor is null', () => {
    render(<AuthFilesPrefixProxyEditorModal {...baseProps({ editor: null })} />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('uses the file-name-specific title when a file name is present', () => {
    render(
      <AuthFilesPrefixProxyEditorModal
        {...baseProps({ editor: buildEditor({ fileName: 'codex.json' }) })}
      />
    );

    expect(screen.getByText('Auth File Details / Edit - codex.json')).toBeInTheDocument();
  });

  it('falls back to the prefix-proxy title when there is no file name', () => {
    render(
      <AuthFilesPrefixProxyEditorModal
        {...baseProps({ editor: buildEditor({ fileName: '' }) })}
      />
    );

    expect(screen.getByText('Auth File Details / Edit')).toBeInTheDocument();
  });

  it('shows the loading state and hides the fields while the editor is loading', () => {
    render(
      <AuthFilesPrefixProxyEditorModal
        {...baseProps({ editor: buildEditor({ loading: true }) })}
      />
    );

    expect(screen.getByText('Loading auth file...')).toBeInTheDocument();
  });

  it('shows the editor error message when present', () => {
    render(
      <AuthFilesPrefixProxyEditorModal
        {...baseProps({ editor: buildEditor({ error: 'Failed to load file' }) })}
      />
    );

    expect(screen.getByText('Failed to load file')).toBeInTheDocument();
  });
});

describe('AuthFilesPrefixProxyEditorModal preview formatting', () => {
  const getSourcePreview = (): HTMLTextAreaElement => {
    const label = screen.getByText('Auth file JSON (preview)');
    const wrapper = label.closest('div');
    const textarea = wrapper?.querySelector('textarea');
    if (!(textarea instanceof HTMLTextAreaElement)) throw new Error('expected a source textarea');
    return textarea;
  };

  it('pretty-prints valid JSON in the source preview textarea', () => {
    render(
      <AuthFilesPrefixProxyEditorModal
        {...baseProps({ updatedText: '{"a":1,"b":2}' })}
      />
    );

    expect(getSourcePreview().value).toBe('{\n  "a": 1,\n  "b": 2\n}');
  });

  it('leaves non-JSON text unchanged in the source preview textarea', () => {
    render(
      <AuthFilesPrefixProxyEditorModal {...baseProps({ updatedText: 'not json' })} />
    );

    expect(getSourcePreview().value).toBe('not json');
  });
});

describe('AuthFilesPrefixProxyEditorModal footer button labels', () => {
  it('labels the secondary footer button "Close" when not dirty', () => {
    render(<AuthFilesPrefixProxyEditorModal {...baseProps({ dirty: false })} />);
    const footer = screen.getByRole('dialog').querySelector('.modal-footer');
    if (!(footer instanceof HTMLElement)) throw new Error('expected a footer');

    expect(within(footer).getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });

  it('labels the secondary footer button "Cancel" when dirty', () => {
    render(<AuthFilesPrefixProxyEditorModal {...baseProps({ dirty: true })} />);
    const footer = screen.getByRole('dialog').querySelector('.modal-footer');
    if (!(footer instanceof HTMLElement)) throw new Error('expected a footer');

    expect(within(footer).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });
});

describe('AuthFilesPrefixProxyEditorModal save gating', () => {
  it('disables save when not dirty', () => {
    render(<AuthFilesPrefixProxyEditorModal {...baseProps({ dirty: false })} />);

    expect(getSaveButton()).toBeDisabled();
  });

  it('enables save when dirty with valid json and no header error', () => {
    render(<AuthFilesPrefixProxyEditorModal {...baseProps({ dirty: true })} />);

    expect(getSaveButton()).toBeEnabled();
  });

  it('disables save when controls are disabled even if dirty', () => {
    render(
      <AuthFilesPrefixProxyEditorModal {...baseProps({ dirty: true, disableControls: true })} />
    );

    expect(getSaveButton()).toBeDisabled();
  });

  it('disables save when the editor has no parsed json', () => {
    render(
      <AuthFilesPrefixProxyEditorModal
        {...baseProps({ dirty: true, editor: buildEditor({ json: null }) })}
      />
    );

    expect(getSaveButton()).toBeDisabled();
  });

  it('disables save when headers are touched and contain an error', () => {
    render(
      <AuthFilesPrefixProxyEditorModal
        {...baseProps({
          dirty: true,
          editor: buildEditor({ headersTouched: true, headersError: 'Invalid JSON' }),
        })}
      />
    );

    expect(getSaveButton()).toBeDisabled();
  });

  it('keeps save enabled when there is a header error but headers were not touched', () => {
    render(
      <AuthFilesPrefixProxyEditorModal
        {...baseProps({
          dirty: true,
          editor: buildEditor({ headersTouched: false, headersError: 'Invalid JSON' }),
        })}
      />
    );

    expect(getSaveButton()).toBeEnabled();
  });
});

describe('AuthFilesPrefixProxyEditorModal interactions', () => {
  it('invokes onSave when the enabled save button is clicked', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<AuthFilesPrefixProxyEditorModal {...baseProps({ dirty: true, onSave })} />);

    await user.click(getSaveButton());

    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('invokes onCopyText with the updated text when copy is clicked', async () => {
    const user = userEvent.setup();
    const onCopyText = vi.fn();
    render(
      <AuthFilesPrefixProxyEditorModal
        {...baseProps({ updatedText: '{"x":1}', onCopyText })}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Copy' }));

    expect(onCopyText).toHaveBeenCalledWith('{"x":1}');
  });

  it('disables copy when there is no updated text', () => {
    render(<AuthFilesPrefixProxyEditorModal {...baseProps({ updatedText: '' })} />);

    expect(screen.getByRole('button', { name: 'Copy' })).toBeDisabled();
  });

  it('invokes onChange for the prefix field with the new value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <AuthFilesPrefixProxyEditorModal
        {...baseProps({ editor: buildEditor({ prefix: '' }), onChange })}
      />
    );

    await user.type(screen.getByLabelText('Prefix (prefix)'), 'x');

    expect(onChange).toHaveBeenCalledWith('prefix', 'x');
  });
});
