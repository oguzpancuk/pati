import { Navigate, NavLink, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import AnimalPage from './pages/AnimalPage';
import AnimalsPage from './pages/AnimalsPage';
import AddAnimalPage from './pages/AddAnimalPage';
import LoginPage from './pages/LoginPage';
import MapPage from './pages/MapPage';
import ProfilePage from './pages/ProfilePage';

function TabIcon({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

// Mobil uygulamadaki brand/Icon path'leriyle aynı dil: ince çizgi, yuvarlak uç.
const ICONS = {
  map: 'M12 21c0 0 7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z M12 12.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2Z',
  paw: 'M6.4 12.7a2.1 2.1 0 1 0 0-4.2 2.1 2.1 0 0 0 0 4.2Z M9.9 9.4a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z M14.1 9.4a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z M17.6 12.7a2.1 2.1 0 1 0 0-4.2 2.1 2.1 0 0 0 0 4.2Z M12 12.2c2.6 0 5 2.1 5 4.5 0 1.8-1.4 2.9-3 2.9-.9 0-1.4-.4-2-.4s-1.1.4-2 .4c-1.6 0-3-1.1-3-2.9 0-2.4 2.4-4.5 5-4.5Z',
  user: 'M12 11.8a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2Z M4.6 20a7.4 7.4 0 0 1 14.8 0',
};

function Shell() {
  return (
    <div className="app">
      <Outlet />
      <nav className="tabbar">
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
          <TabIcon d={ICONS.map} />
          Harita
        </NavLink>
        <NavLink to="/hayvanlar" className={({ isActive }) => (isActive ? 'active' : '')}>
          <TabIcon d={ICONS.paw} />
          Hayvanlar
        </NavLink>
        <NavLink to="/profil" className={({ isActive }) => (isActive ? 'active' : '')}>
          <TabIcon d={ICONS.user} />
          Profilim
        </NavLink>
      </nav>
    </div>
  );
}

export default function App() {
  const { me, loading } = useAuth();

  if (loading) {
    return (
      <div className="app" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <p className="muted">Yükleniyor…</p>
      </div>
    );
  }

  if (!me) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Shell />}>
        <Route index element={<MapPage />} />
        <Route path="hayvanlar" element={<AnimalsPage />} />
        <Route path="hayvanlar/yeni" element={<AddAnimalPage />} />
        <Route path="hayvanlar/:id" element={<AnimalPage />} />
        <Route path="profil" element={<ProfilePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
