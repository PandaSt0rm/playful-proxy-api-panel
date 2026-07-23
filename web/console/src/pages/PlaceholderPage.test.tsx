/**
 * Behaviour tests for PlaceholderPage.
 *
 * PlaceholderPage renders a Card titled with the resolved translation of the
 * provided `titleKey`, with a fixed "loading" body. i18n is pinned to English
 * in the global test setup, so we assert against the English strings.
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@/test/utils';
import { PlaceholderPage } from './PlaceholderPage';

describe('PlaceholderPage', () => {
  it('renders the title from the translated titleKey', () => {
    render(<PlaceholderPage titleKey="title.login" />);

    expect(screen.getByText('AIPROXY')).toBeInTheDocument();
  });

  it('renders the loading body text', () => {
    render(<PlaceholderPage titleKey="title.login" />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders the raw key as the title when the key is unknown', () => {
    render(<PlaceholderPage titleKey="nonexistent.title.key" />);

    expect(screen.getByText('nonexistent.title.key')).toBeInTheDocument();
  });

  it('still renders the loading body when the title key is unknown', () => {
    render(<PlaceholderPage titleKey="nonexistent.title.key" />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });
});
