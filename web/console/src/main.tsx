import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import '@/styles/global.scss';
import { AIPROXY_FAVICON_16, AIPROXY_FAVICON_32, AIPROXY_BRAND_ASSETS } from '@/assets/identity';
import App from './App.tsx';

function upsertIcon(attrs: { type: string; sizes?: string; href: string }): void {
  const icons = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]'));
  const existing =
    icons.find((link) => {
      if (link.getAttribute('type') !== attrs.type) return false;
      if (attrs.sizes && link.getAttribute('sizes') !== attrs.sizes) return false;
      return true;
    }) ?? null;
  const link = existing ?? document.createElement('link');
  link.rel = 'icon';
  link.type = attrs.type;
  if (attrs.sizes) link.setAttribute('sizes', attrs.sizes);
  link.href = attrs.href;
  if (!link.isConnected) document.head.appendChild(link);
}

function configureDocumentIdentity() {
  document.title = 'AIPROXY';
  document.documentElement.setAttribute('translate', 'no');
  document.documentElement.classList.add('notranslate');

  // Imagine-generated PNG favicons only (no hand SVG mark).
  upsertIcon({ type: 'image/png', sizes: '32x32', href: AIPROXY_FAVICON_32 });
  upsertIcon({ type: 'image/png', sizes: '16x16', href: AIPROXY_FAVICON_16 });

  const apple =
    document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]') ??
    document.createElement('link');
  apple.rel = 'apple-touch-icon';
  apple.href = AIPROXY_BRAND_ASSETS.icon192;
  if (!apple.isConnected) document.head.appendChild(apple);
}

export function bootstrapConsole(rootElement: HTMLElement | null): Root {
  if (!rootElement) throw new Error('AIPROXY console root element is missing.');
  configureDocumentIdentity();
  const root = createRoot(rootElement);
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  );
  return root;
}

const rootElement = document.getElementById('root');
if (rootElement) bootstrapConsole(rootElement);
