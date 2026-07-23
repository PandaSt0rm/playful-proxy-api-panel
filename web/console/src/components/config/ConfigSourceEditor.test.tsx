import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, userEvent } from '@/test/utils';
import ConfigSourceEditor from './ConfigSourceEditor';

// Mock the CodeMirror boundary we own: render a plain textarea that mirrors the
// props the wrapper forwards, so behaviour (value/onChange/editable/placeholder/
// theme passthrough) is observable without instantiating a real editor.
const codeMirrorProps = vi.fn();

vi.mock('@uiw/react-codemirror', () => ({
  __esModule: true,
  default: (props: {
    value: string;
    onChange: (value: string) => void;
    theme: string;
    editable: boolean;
    placeholder: string;
  }) => {
    codeMirrorProps(props);
    return (
      <textarea
        data-testid="cm"
        data-theme={props.theme}
        value={props.value}
        placeholder={props.placeholder}
        readOnly={!props.editable}
        onChange={(e) => props.onChange(e.target.value)}
      />
    );
  },
}));

const baseProps = {
  value: 'port: 8317',
  onChange: vi.fn(),
  theme: 'light' as const,
  editable: true,
  placeholder: 'Enter YAML',
};

describe('ConfigSourceEditor', () => {
  beforeEach(() => {
    codeMirrorProps.mockClear();
    baseProps.onChange = vi.fn();
  });

  it('passes the value through to the editor', () => {
    render(<ConfigSourceEditor {...baseProps} value="host: localhost" />);

    expect(screen.getByTestId('cm')).toHaveValue('host: localhost');
  });

  it('forwards the placeholder to the editor', () => {
    render(<ConfigSourceEditor {...baseProps} placeholder="Paste config here" />);

    expect(screen.getByTestId('cm')).toHaveAttribute('placeholder', 'Paste config here');
  });

  it('forwards the dark theme to the editor', () => {
    render(<ConfigSourceEditor {...baseProps} theme="dark" />);

    expect(screen.getByTestId('cm')).toHaveAttribute('data-theme', 'dark');
  });

  it('forwards the light theme to the editor', () => {
    render(<ConfigSourceEditor {...baseProps} theme="light" />);

    expect(screen.getByTestId('cm')).toHaveAttribute('data-theme', 'light');
  });

  it('renders an editable editor as writable when editable is true', () => {
    render(<ConfigSourceEditor {...baseProps} editable />);

    expect(screen.getByTestId('cm')).not.toHaveAttribute('readonly');
  });

  it('renders a read-only editor when editable is false', () => {
    render(<ConfigSourceEditor {...baseProps} editable={false} />);

    expect(screen.getByTestId('cm')).toHaveAttribute('readonly');
  });

  it('invokes onChange with the typed text', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(<ConfigSourceEditor {...baseProps} value="" onChange={onChange} />);
    await user.type(screen.getByTestId('cm'), 'x');

    expect(onChange).toHaveBeenCalledWith('x');
  });

  it('passes the same memoized extensions array on re-render with unchanged deps', () => {
    const { rerender } = render(<ConfigSourceEditor {...baseProps} value="a" />);
    const firstExtensions = codeMirrorProps.mock.calls[0][0].extensions;

    rerender(<ConfigSourceEditor {...baseProps} value="b" />);
    const secondExtensions = codeMirrorProps.mock.calls[1][0].extensions;

    expect(secondExtensions).toBe(firstExtensions);
  });

  it('configures the editor with four CodeMirror extensions', () => {
    render(<ConfigSourceEditor {...baseProps} />);

    const { extensions } = codeMirrorProps.mock.calls[0][0];

    expect(extensions).toHaveLength(4);
  });

  it('disables autocompletion in the basic setup', () => {
    render(<ConfigSourceEditor {...baseProps} />);

    const { basicSetup } = codeMirrorProps.mock.calls[0][0];

    expect(basicSetup.autocompletion).toBe(false);
  });

  it('enables line numbers in the basic setup', () => {
    render(<ConfigSourceEditor {...baseProps} />);

    const { basicSetup } = codeMirrorProps.mock.calls[0][0];

    expect(basicSetup.lineNumbers).toBe(true);
  });
});
