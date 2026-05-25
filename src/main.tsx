import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Lock viewport height ONCE at load — prevents iOS Safari from
// resizing the layout when toolbar appears/disappears
const h = window.innerHeight;
document.documentElement.style.setProperty('--app-height', `${h}px`);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
