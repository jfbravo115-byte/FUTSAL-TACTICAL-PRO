import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// ─── iOS VIEWPORT LOCK ─────────────────────────────────────────
// Capture height ONCE at load. Never update it.
// This prevents iOS Safari from resizing the layout when the
// toolbar appears/disappears on button tap.
const lockViewport = () => {
  const h = window.innerHeight;
  document.documentElement.style.setProperty('--app-height', `${h}px`);
};

lockViewport();

// Prevent body scroll entirely (iOS rubber-band / viewport shift)
document.addEventListener('touchmove', (e) => {
  if ((e.target as HTMLElement).closest('.allow-scroll')) return;
  e.preventDefault();
}, { passive: false });

// Do NOT re-run on resize — locking is intentional
// ──────────────────────────────────────────────────────────────

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
