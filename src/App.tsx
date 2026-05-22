import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './lib/AuthContext';
import MatchTracker from './pages/MatchTracker';
import Dashboard from './pages/Dashboard';
import MatchAnalysis from './pages/MatchAnalysis';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<MatchTracker />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/analysis/:matchId" element={<MatchAnalysis />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
