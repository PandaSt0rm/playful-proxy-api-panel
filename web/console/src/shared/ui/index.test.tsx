import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, userEvent } from '@/test/utils';
import {
  Badge,
  Checkbox,
  CodeBlock,
  CodeMirrorSurface,
  ConfirmationDialog,
  DataTable,
  DiffView,
  Drawer,
  Field,
  IconButton,
  Pagination,
  PasswordInput,
  ProgressMeter,
  SegmentedControl,
  Skeleton,
  Surface,
  Tabs,
  Textarea,
  Toast,
  Toggle,
} from './index';

const codeMirrorChange = vi.fn<(value: string) => void>();

vi.mock('@uiw/react-codemirror', () => ({
  default: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <button type="button" onClick={() => onChange(`${value}!`)}>
      Mock editor
    </button>
  ),
}));

vi.mock('@codemirror/lang-yaml', () => ({ yaml: () => ({ extension: 'yaml' }) }));

vi.mock('@/components/ui/Modal', () => ({
  Modal: ({
    open,
    title,
    onClose,
    className,
    width,
    children,
  }: {
    open: boolean;
    title: string;
    onClose: () => void;
    className?: string;
    // The real Modal applies `width` as an inline style, which is the only reason
    // Drawer's size prop works at all — the mock has to reproduce that.
    width?: number | string;
    children: React.ReactNode;
  }) =>
    open ? (
      <div role="dialog" aria-label={title} className={className} style={{ width }}>
        <button type="button" onClick={onClose}>
          Close modal
        </button>
        {children}
      </div>
    ) : null,
}));

beforeEach(() => codeMirrorChange.mockReset());

describe('Route Foundry operator primitives', () => {
  it('preserves button semantics, busy state, and password visibility', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <>
        <IconButton label="Run" busy className="custom">
          R
        </IconButton>
        <PasswordInput aria-label="Secret" className="secret" defaultValue="value" />
      </>
    );
    const icon = screen.getByRole('button', { name: 'Run' });
    expect(icon).toHaveAttribute('type', 'button');
    expect(icon).toHaveAttribute('aria-busy', 'true');
    expect(icon).toHaveClass('rf-icon-button', 'custom');
    const input = screen.getByLabelText('Secret');
    expect(input).toHaveAttribute('type', 'password');
    expect(input).toHaveClass('rf-input', 'secret');
    await user.click(screen.getByRole('button', { name: 'Show value' }));
    expect(input).toHaveAttribute('type', 'text');
    await user.click(screen.getByRole('button', { name: 'Hide value' }));
    expect(input).toHaveAttribute('type', 'password');

    rerender(
      <IconButton label="Submit" type="submit" busy={false}>
        S
      </IconButton>
    );
    expect(screen.getByRole('button', { name: 'Submit' })).toHaveAttribute('type', 'submit');
    expect(screen.getByRole('button', { name: 'Submit' })).not.toHaveAttribute('aria-busy');
  });

  it('wraps textarea and checkbox attributes without losing caller classes', () => {
    render(
      <>
        <Textarea aria-label="Notes" className="notes" />
        <Checkbox aria-label="Enabled" className="enabled" defaultChecked />
      </>
    );
    expect(screen.getByLabelText('Notes')).toHaveClass('rf-textarea', 'notes');
    expect(screen.getByLabelText('Enabled')).toHaveClass('rf-checkbox', 'enabled');
    expect(screen.getByLabelText('Enabled')).toBeChecked();
  });

  it('changes toggle and segmented values through their accessible controls', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    const onSegment = vi.fn();
    render(
      <>
        <Toggle checked={false} onChange={onToggle} label="Enabled" />
        <Toggle checked onChange={onToggle} label="Locked" disabled />
        <SegmentedControl
          label="Range"
          value="day"
          options={[
            { value: 'day', label: 'Day' },
            { value: 'week', label: 'Week' },
          ]}
          onChange={onSegment}
        />
      </>
    );
    await user.click(screen.getByRole('switch', { name: 'Enabled' }));
    expect(onToggle).toHaveBeenCalledWith(true);
    expect(screen.getByRole('switch', { name: 'Locked' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Day' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Week' }));
    expect(onSegment).toHaveBeenCalledWith('week');
  });

  it('supports click and complete keyboard navigation for tabs', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <Tabs
        label="Views"
        value="one"
        tabs={[
          { id: 'one', label: 'One', panel: 'Panel one' },
          { id: 'two', label: 'Two', panel: 'Panel two' },
          { id: 'three', label: 'Three', panel: 'Panel three' },
        ]}
        onChange={onChange}
      />
    );
    const one = screen.getByRole('tab', { name: 'One' });
    const two = screen.getByRole('tab', { name: 'Two' });
    const three = screen.getByRole('tab', { name: 'Three' });
    expect(one).toHaveAttribute('tabindex', '0');
    expect(two).toHaveAttribute('tabindex', '-1');
    await user.click(two);
    expect(onChange).toHaveBeenCalledWith('two');
    fireEvent.keyDown(one, { key: 'ArrowRight' });
    expect(two).toHaveFocus();
    fireEvent.keyDown(one, { key: 'ArrowLeft' });
    expect(three).toHaveFocus();
    fireEvent.keyDown(two, { key: 'Home' });
    expect(one).toHaveFocus();
    fireEvent.keyDown(one, { key: 'End' });
    expect(three).toHaveFocus();
    fireEvent.keyDown(one, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledTimes(5);
    expect(screen.getByRole('tabpanel', { name: 'One' })).toBeVisible();
    expect(document.getElementById('panel-two')).not.toBeVisible();
  });

  it('renders badges, progress, code, skeleton, and toast semantics', () => {
    const { rerender } = render(
      <>
        <Badge>Neutral</Badge>
        <Badge tone="danger">Danger</Badge>
        <ProgressMeter label="Used" value={25} />
        <ProgressMeter label="Custom" value={1} max={4} />
        <CodeBlock>const x = 1</CodeBlock>
        <Skeleton />
        <Skeleton label="Fetching" />
        <Toast>Ready</Toast>
        <Toast tone="success">Saved</Toast>
      </>
    );
    expect(screen.getByText('Neutral')).toHaveClass('rf-badge--neutral');
    expect(screen.getByText('Danger')).toHaveClass('rf-badge--danger');
    expect(screen.getAllByText('25%')).toHaveLength(2);
    expect(screen.getByText('const x = 1').tagName).toBe('CODE');
    expect(screen.getByText('Loading')).toBeInTheDocument();
    expect(screen.getByText('Fetching')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toHaveAttribute('role', 'status');
    expect(screen.getByText('Saved')).toHaveAttribute('role', 'status');

    rerender(<Toast tone="error">Failed</Toast>);
    expect(screen.getByRole('alert')).toHaveAttribute('aria-live', 'assertive');
  });

  it('enforces pagination bounds and emits adjacent pages', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<Pagination page={1} pages={3} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(onChange).toHaveBeenCalledWith(2);
    rerender(<Pagination page={3} pages={3} onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Previous' }));
    expect(onChange).toHaveBeenLastCalledWith(2);
  });

  it('wires confirmation pending behavior and drawer closure', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    const { rerender } = render(
      <ConfirmationDialog open title="Delete" onClose={onClose} onConfirm={onConfirm}>
        Delete item?
      </ConfirmationDialog>
    );
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onConfirm).toHaveBeenCalledOnce();

    rerender(
      <ConfirmationDialog
        open
        title="Delete"
        pending
        onClose={onClose}
        onConfirm={onConfirm}
        cancelLabel="Keep"
        confirmLabel="Deleting"
      >
        Delete item?
      </ConfirmationDialog>
    );
    expect(screen.getByRole('button', { name: 'Keep' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Close modal' }));
    expect(onClose).toHaveBeenCalledOnce();

    rerender(
      <Drawer open title="Details" onClose={onClose}>
        Drawer body
      </Drawer>
    );
    const drawer = screen.getByRole('dialog', { name: 'Details' });
    expect(drawer).toHaveClass('rf-drawer');
    expect(drawer).not.toHaveClass('rf-drawer--wide');
    // Width has to arrive as a prop: Modal renders it inline, which beats any class rule.
    expect(drawer).toHaveStyle({ width: '560px' });
    await user.click(screen.getByRole('button', { name: 'Close modal' }));
    expect(onClose).toHaveBeenCalledTimes(2);

    rerender(
      <Drawer open title="Details" onClose={onClose} size="wide">
        Drawer body
      </Drawer>
    );
    const wideDrawer = screen.getByRole('dialog', { name: 'Details' });
    expect(wideDrawer).toHaveClass('rf-drawer--wide');
    expect(wideDrawer).toHaveStyle({ width: '1080px' });
  });

  it('renders diff, editor, table sort metadata, and stable row fallbacks', async () => {
    const user = userEvent.setup();
    render(
      <>
        <DiffView diff="- old\n+ new" />
        <CodeMirrorSurface value="key: value" onChange={codeMirrorChange} />
        <CodeMirrorSurface value="other: value" label="Policy editor" onChange={codeMirrorChange} />
        <DataTable
          caption="Events"
          headers={[
            { key: 'name', label: 'Name', sort: 'ascending' },
            { key: 'status', label: 'Status' },
          ]}
          rows={[
            { id: 'row-a', name: 'Alpha', status: 'Ready' },
            { name: 'Beta', status: 'Waiting' },
          ]}
        />
      </>
    );
    expect(screen.getByLabelText('Configuration diff')).toHaveTextContent('+ new');
    expect(screen.getByLabelText('YAML editor')).toBeInTheDocument();
    expect(screen.getByLabelText('Policy editor')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Mock editor' })[0]);
    expect(codeMirrorChange).toHaveBeenCalledWith('key: value!');
    expect(screen.getByRole('columnheader', { name: 'Name' })).toHaveAttribute(
      'aria-sort',
      'ascending'
    );
    expect(screen.getByRole('columnheader', { name: 'Status' })).not.toHaveAttribute('aria-sort');
    expect(screen.getByRole('table', { name: 'Events' })).toHaveTextContent('Beta');
  });

  it('associates field labels and hints and supports section and div surfaces', () => {
    const { rerender } = render(
      <Field label="Name" hint="Required">
        {({ inputId, descriptionId }) => <input id={inputId} aria-describedby={descriptionId} />}
      </Field>
    );
    const input = screen.getByLabelText('Name');
    const hint = screen.getByText('Required');
    expect(input).toHaveAttribute('aria-describedby', hint.id);

    rerender(
      <>
        <Field label="Optional">
          {({ inputId, descriptionId }) => <input id={inputId} data-description={descriptionId} />}
        </Field>
        <Surface label="Summary">Section</Surface>
        <Surface as="div" label="Details" className="custom" data-kind="detail">
          Div
        </Surface>
      </>
    );
    expect(screen.getByLabelText('Optional')).not.toHaveAttribute('data-description');
    expect(screen.getByRole('region', { name: 'Summary' }).tagName).toBe('SECTION');
    expect(screen.getByLabelText('Details')).toHaveClass('rf-surface', 'custom');
    expect(screen.getByLabelText('Details')).toHaveAttribute('data-kind', 'detail');
  });
});
