import { Navigate, NavLink, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import AnimalPage from './pages/AnimalPage';
import AnimalsPage from './pages/AnimalsPage';
import AddAnimalPage from './pages/AddAnimalPage';
import LoginPage from './pages/LoginPage';
import MapPage from './pages/MapPage';
import ProfilePage from './pages/ProfilePage';
import UserProfilePage from './pages/UserProfilePage';
import FindFriendsPage from './pages/FindFriendsPage';
import LeaderboardPage from './pages/LeaderboardPage';
import UserCommentsPage from './pages/UserCommentsPage';
import PrivacyPage from './pages/PrivacyPage';
import TermsPage from './pages/TermsPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import MessagesPage from './pages/MessagesPage';
import NewConversationPage from './pages/NewConversationPage';
import ConversationPage from './pages/ConversationPage';
import GroupSettingsPage from './pages/GroupSettingsPage';
import { BadgeAwardProvider } from './badgeAwards';
import { useCareAlerts } from './careAlerts';

function TabIcon({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

// Same language as the mobile app's brand/Icon paths: thin stroke, round caps.
const ICONS = {
  map: 'M12 21c0 0 7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z M12 12.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2Z',
  paw: 'M6.4 12.7a2.1 2.1 0 1 0 0-4.2 2.1 2.1 0 0 0 0 4.2Z M9.9 9.4a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z M14.1 9.4a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z M17.6 12.7a2.1 2.1 0 1 0 0-4.2 2.1 2.1 0 0 0 0 4.2Z M12 12.2c2.6 0 5 2.1 5 4.5 0 1.8-1.4 2.9-3 2.9-.9 0-1.4-.4-2-.4s-1.1.4-2 .4c-1.6 0-3-1.1-3-2.9 0-2.4 2.4-4.5 5-4.5Z',
  user: 'M12 11.8a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2Z M4.6 20a7.4 7.4 0 0 1 14.8 0',
  chat: 'M20.2 11.8a7.6 7.6 0 0 1-11.2 6.7L4 20l1.6-4.5a7.6 7.6 0 1 1 14.6-3.7Z',
};

function Shell() {
  return (
    <div className="app">
      <Outlet />
      <nav className="tabbar">
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
          <TabIcon d={ICONS.map} />
          harita
        </NavLink>
        <NavLink to="/hayvanlar" className={({ isActive }) => (isActive ? 'active' : '')}>
          <TabIcon d={ICONS.paw} />
          hayvanlar
        </NavLink>
        <NavLink to="/mesajlar" className={({ isActive }) => (isActive ? 'active' : '')}>
          <TabIcon d={ICONS.chat} />
          mesajlar
        </NavLink>
        <NavLink to="/profil" className={({ isActive }) => (isActive ? 'active' : '')}>
          <TabIcon d={ICONS.user} />
          profilim
        </NavLink>
      </nav>
    </div>
  );
}

export default function App() {
  const { me, loading } = useAuth();
  // Care alerts only run while signed in — and verified: the server would
  // refuse the poll otherwise.
  useCareAlerts(!!me && !me.email_verification_pending);

  if (loading) {
    return (
      <div className="app" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <p className="muted">Yükleniyor…</p>
      </div>
    );
  }

  if (!me || me.email_verification_pending) {
    return (
      <Routes>
        {/* The register form links here, so both must open without a session. */}
        <Route path="/gizlilik" element={<PrivacyPage />} />
        <Route path="/kosullar" element={<TermsPage />} />
        {/* An unverified e-mail gets the code page and nothing else: the
            server would refuse every other request anyway (ADR-0004). */}
        <Route path="*" element={me ? <VerifyEmailPage /> : <LoginPage />} />
      </Routes>
    );
  }

  return (
    // The badge celebration sits above navigation: whichever page it is
    // earned on, it shows from the same place.
    <BadgeAwardProvider>
      <Routes>
        <Route path="/" element={<Shell />}>
          <Route index element={<MapPage />} />
          <Route path="hayvanlar" element={<AnimalsPage />} />
          <Route path="hayvanlar/yeni" element={<AddAnimalPage />} />
          <Route path="hayvanlar/:id" element={<AnimalPage />} />
          <Route path="profil" element={<ProfilePage />} />
          <Route path="kullanici/:id" element={<UserProfilePage />} />
          <Route path="kullanici/:id/yorumlar" element={<UserCommentsPage />} />
          <Route path="yorumlarim" element={<UserCommentsPage />} />
          <Route path="arkadas-bul" element={<FindFriendsPage />} />
          <Route path="siralama" element={<LeaderboardPage />} />
          <Route path="mesajlar" element={<MessagesPage />} />
          <Route path="mesajlar/yeni" element={<NewConversationPage />} />
          <Route path="mesajlar/:id" element={<ConversationPage />} />
          <Route path="mesajlar/:id/ayarlar" element={<GroupSettingsPage />} />
          <Route path="gizlilik" element={<PrivacyPage />} />
          <Route path="kosullar" element={<TermsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BadgeAwardProvider>
  );
}
