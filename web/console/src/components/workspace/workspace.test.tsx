import { describe, expect, it } from 'vitest';
import { render, screen } from '@/test/utils';
import { SectionPanel } from './SectionPanel';
import { WorkspacePage } from './WorkspacePage';
import { LegacyWorkspaceRoute } from './LegacyWorkspaceRoute';

describe('workspace primitives', () => {
  it('renders one route masthead with status, actions, and content', () => {
    render(
      <WorkspacePage
        eyebrow="Monitor"
        title="Live traffic"
        description="Current routing state"
        status={<span>Live</span>}
        actions={<button type="button">Refresh</button>}
      >
        <p>Workspace content</p>
      </WorkspacePage>
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Live traffic' })).toBeInTheDocument();
    expect(screen.getByText('Current routing state')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
    expect(screen.getByText('Workspace content')).toBeInTheDocument();
  });

  it('associates a semantic section with its title and description', () => {
    render(
      <SectionPanel
        id="traffic"
        title="Traffic now"
        description="Last hour"
        status={<span>Fresh</span>}
        actions={<button type="button">Retry</button>}
      >
        <p>Panel content</p>
      </SectionPanel>
    );

    const section = screen.getByRole('region', { name: 'Traffic now' });
    expect(section).toHaveAttribute('aria-describedby', 'traffic-description');
    expect(section).toHaveTextContent('Last hour');
    expect(section).toHaveTextContent('Panel content');
  });

  it('adapts a mature route to the shared masthead and content surface', () => {
    render(
      <LegacyWorkspaceRoute titleKey="routeFoundry.destinations.config" width="full">
        <p>Legacy content</p>
      </LegacyWorkspaceRoute>
    );

    expect(screen.getByRole('heading', { level: 1, name: 'Config' })).toBeInTheDocument();
    expect(screen.getByText('Legacy content')).toBeInTheDocument();
  });
});
