import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// ── Lock viewport height ────────────────────────────────────────
const setAppHeight = () => {
  // visualViewport refleja el área realmente visible en PWA iOS
  // (innerHeight a veces incluye zonas que ocupa el sistema)
  const h = (window.visualViewport && window.visualViewport.height) || window.innerHeight;
  document.documentElement.style.setProperty('--app-height', `${Math.round(h)}px`);
};
setAppHeight();

// Recalcular cuando el viewport visible cambie (barras del sistema, etc.)
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', setAppHeight);
}
window.addEventListener('resize', setAppHeight);

// ── Lock orientation to portrait ────────────────────────────────
const lockPortrait = async () => {
  try {
    // Modern API
    if (screen.orientation && (screen.orientation as any).lock) {
      await (screen.orientation as any).lock('portrait');
    }
    // iOS Safari fallback (no API available, handled via CSS)
  } catch {
    // Silently fail — iOS Safari doesn't support lock
  }
};
lockPortrait();

// ── Show/hide landscape warning overlay ─────────────────────────
const applyOrientationOverlay = () => {
  const isLandscape = window.innerWidth > window.innerHeight;
  let overlay = document.getElementById('orientation-overlay');

  if (isLandscape) {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'orientation-overlay';
      overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 99999;
        background: #0A0B0E;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        gap: 16px;
        font-family: 'Inter', sans-serif;
      `;
      overlay.innerHTML = `
        <div style="font-size: 48px; animation: spin 2s linear infinite;">📱</div>
        <p style="color: white; font-size: 15px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.15em; text-align: center; margin: 0; padding: 0 32px;">
          Gira el dispositivo
        </p>
        <p style="color: #64748b; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; text-align: center; margin: 0; padding: 0 32px;">
          Futsal Commander Pro requiere modo vertical
        </p>
        <style>
          @keyframes spin {
            0% { transform: rotate(0deg); }
            25% { transform: rotate(90deg); }
            50% { transform: rotate(90deg); }
            75% { transform: rotate(0deg); }
            100% { transform: rotate(0deg); }
          }
        </style>
      `;
      document.body.appendChild(overlay);
    }
    // Update height variable for landscape (prevent layout bugs)
    setAppHeight();
  } else {
    if (overlay) {
      overlay.remove();
    }
    setAppHeight();
  }
};

// Listen for orientation changes
window.addEventListener('orientationchange', () => {
  setTimeout(applyOrientationOverlay, 100);
});
window.addEventListener('resize', applyOrientationOverlay);

// Check on load
applyOrientationOverlay();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
