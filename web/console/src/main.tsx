import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import '@/styles/global.scss';
import { AIPROXY_MARK } from '@/assets/identity';
import App from './App.tsx';

function configureDocumentIdentity() {
  document.title = 'AIPROXY';
  document.documentElement.setAttribute('translate', 'no');
  document.documentElement.classList.add('notranslate');

  const favicon =
    document.querySelector<HTMLLinkElement>('link[rel="icon"]') ?? document.createElement('link');
  favicon.rel = 'icon';
  favicon.type = 'image/svg+xml';
  favicon.href = AIPROXY_MARK;
  if (!favicon.isConnected) document.head.appendChild(favicon);
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
