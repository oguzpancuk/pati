import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import Layout from './components/Layout';
import Animals from './pages/Animals';
import AuditLog from './pages/AuditLog';
import CareActions from './pages/CareActions';
import Comments from './pages/Comments';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Users from './pages/Users';

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="login-page">Yükleniyor…</div>;
  }

  // Giriş yapılmamışsa tüm yollar giriş ekranına düşer. Asıl yetki kontrolü
  // sunucuda: her /api/admin isteği requireAdmin'den geçiyor.
  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="users" element={<Users />} />
        <Route path="animals" element={<Animals />} />
        <Route path="care-actions" element={<CareActions />} />
        <Route path="comments" element={<Comments />} />
        <Route path="audit-log" element={<AuditLog />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
