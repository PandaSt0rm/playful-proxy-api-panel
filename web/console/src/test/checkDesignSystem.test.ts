import { describe, expect, it } from 'vitest';

import { scanDesignSystemSource } from '../../scripts/check-design-system';

function violationCodes(filePath: string, source: string): string[] {
  return scanDesignSystemSource(filePath, source).map(({ code }) => code);
}

describe('scanDesignSystemSource', () => {
  it.each([
    ['legacy-token', '.panel { color: var(--text-primary); }'],
    ['radius', '.panel { border-radius: 8px; }'],
    ['shadow', '.panel { box-shadow: 0 4px 8px #0004; }'],
    ['shadow', '.panel { filter: drop-shadow(0 2px 2px #0004); }'],
    ['backdrop', '.panel { backdrop-filter: blur(8px); }'],
    ['blur', '.panel { filter: blur(8px); }'],
    ['gradient', '.panel { background: linear-gradient(#fff, #000); }'],
    ['transition-all', '.panel { transition: all 160ms ease; }'],
    ['inline-style', '<div style={{ boxShadow: shadow }} />'],
    ['inline-style', '<div style={{ borderRadius: 8 }} />'],
    ['duplicate-selector', '.pill { padding: 4px; }'],
    ['duplicate-selector', '.status-badge { color: var(--ok); }'],
    ['duplicate-selector', '.global-switch { display: flex; }'],
    ['floating-surface', '.floatingToolbar { position: fixed; background: var(--surface-1); }'],
  ])('reports %s violations', (expectedCode, source) => {
    expect(violationCodes('src/components/Fixture.module.scss', source)).toContain(expectedCode);
  });

  it.each([
    ['.panel { border-radius: 0; }', 'src/components/Panel.module.scss'],
    ['.panel { border-radius: $radius-square; }', 'src/components/Panel.module.scss'],
    ['.spinner { border-radius: $radius-circle; }', 'src/components/Spinner.module.scss'],
    ['.loading-spinner { border-radius: $radius-circle; }', 'src/styles/components.scss'],
    ['.healthDot { border-radius: $radius-circle; }', 'src/components/Status.module.scss'],
    ['.dirtyDot { border-radius: $radius-circle; }', 'src/pages/ConfigPage.module.scss'],
    [
      '.dot { border-radius: $radius-circle; }',
      'src/components/modelAlias/ModelMappingDiagram.module.scss',
    ],
    ['.statusDot { border-radius: $radius-circle; }', 'src/components/Status.module.scss'],
    [
      '.trendPanel { background: linear-gradient(to bottom, transparent 49%, var(--rule) 50%, transparent 51%); }',
      'src/pages/DashboardPage.module.scss',
    ],
    ['.panel { box-shadow: none; text-shadow: none; }', 'src/components/Panel.module.scss'],
    [
      '.panel { transition: color 160ms ease, border-color 160ms ease; }',
      'src/components/Panel.module.scss',
    ],
  ])('accepts the narrow flat-system exception in %s', (source, filePath) => {
    expect(scanDesignSystemSource(filePath, source)).toEqual([]);
  });

  it('reports the exact source line and declaration', () => {
    const violations = scanDesignSystemSource(
      'src/components/Panel.module.scss',
      '.panel {\n  color: var(--ink);\n  border-radius: 12px;\n}'
    );

    expect(violations).toEqual([
      {
        code: 'radius',
        filePath: 'src/components/Panel.module.scss',
        line: 3,
        declaration: 'border-radius: 12px',
      },
    ]);
  });
});
