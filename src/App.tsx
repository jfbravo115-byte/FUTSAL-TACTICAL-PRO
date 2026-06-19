import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider } from './lib/AuthContext';
import PreMatch from './pages/PreMatch';
import MatchTracker from './pages/MatchTracker';
import Dashboard from './pages/Dashboard';
import MatchAnalysis from './pages/MatchAnalysis';
import TacticalBoard from './pages/TacticalBoard';
import LiveTracking from './pages/LiveTracking';

// En un arranque fresco de la app (cerrar y reabrir la PWA), iOS restaura la
// última URL visitada (p.ej. /match). Esto fuerza a empezar siempre en la
// pantalla de preparar partido. Durante la navegación interna normal,
// 'app_session_active' ya existe en sessionStorage, así que no redirige.
function StartupRedirect() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const isFreshLaunch = !sessionStorage.getItem('app_session_active');
    if (isFreshLaunch) {
      sessionStorage.setItem('app_session_active', '1');
      if (location.pathname !== '/') {
        navigate('/', { replace: true });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <StartupRedirect />
        <Routes>
          <Route path="/" element={<PreMatch />} />
          <Route path="/match" element={<MatchTracker />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/analysis/:matchId" element={<MatchAnalysis />} />
          <Route path="/tactical-board" element={<TacticalBoard />} />
          <Route path="/live-tracking" element={<LiveTracking />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
