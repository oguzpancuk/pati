import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth';

const LINKS = [
  { to: '/', label: 'Gösterge Paneli', end: true },
  { to: '/users', label: 'Kullanıcılar' },
  { to: '/animals', label: 'Hayvanlar' },
  { to: '/care-actions', label: 'Bakım Kayıtları' },
  { to: '/comments', label: 'Yorumlar' },
  { to: '/audit-log', label: 'Denetim Kaydı' },
];

export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="shell">
      <nav className="sidebar">
        <div className="brand">
          Stray
          <small>Yönetim</small>
        </div>

        {LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
          >
            {link.label}
          </NavLink>
        ))}

        <div className="sidebar-footer">
          <div>{user?.name}</div>
          <div className="muted">{user?.email}</div>
          <button className="small" style={{ marginTop: 10 }} onClick={logout}>
            Çıkış Yap
          </button>
        </div>
      </nav>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
