import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import Layout from './components/Layout';
import Advertisers from './pages/Advertisers';
import Animals from './pages/Animals';
import AuditLog from './pages/AuditLog';
import CareActions from './pages/CareActions';
import Comments from './pages/Comments';
import Reports from './pages/Reports';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Users from './pages/Users';
import Vaccinations from './pages/Vaccinations';

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="login-page">Yükleniyor…</div>;
  }

  // Without a session every path falls through to the login screen. The real
  // authorization check is server-side: every /api/admin request passes
  // through requireAdmin.
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
        <Route path="vaccinations" element={<Vaccinations />} />
        <Route path="comments" element={<Comments />} />
        <Route path="reports" element={<Reports />} />
        <Route path="advertisers" element={<Advertisers />} />
        <Route path="audit-log" element={<AuditLog />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
