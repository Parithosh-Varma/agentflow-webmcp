import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthPage } from './pages/AuthPage';
import { AccessGate } from './pages/AccessGate';

function AuthLandingRedirect() {
  return <Navigate to="/auth" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<AuthLandingRedirect />} />
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/access" element={<AccessGate />} />
      <Route path="*" element={<Navigate to="/auth" replace />} />
    </Routes>
  );
}
