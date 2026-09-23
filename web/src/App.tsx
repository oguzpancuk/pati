import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, NavLink, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import {
  fetchUnreadMessageCount,
  onConversationRead,
  UNREAD_POLL_INTERVAL_MS,
} from './api/messages';
import './styles/messages.css';
import { markReturningVisitor, showsAboutAtRoot } from './frontDoor';
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
import NotificationsPage from './pages/NotificationsPage';
import { BadgeAwardProvider } from './badgeAwards';
import { useCareAlerts } from './careAlerts';

// Only signed-out strangers see it, so it stays out of the app's startup
// bundle: its copy, stylesheet and screenshots load on first render.
const AboutPage = lazy(() => import('./pages/AboutPage'));
const aboutPage = (
  <Suspense fallback={null}>
    <AboutPage />
  </Suspense>
);

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
  const { pathname } = useLocation();
  // The unread total on the messages tab (owner, 2026-09-11 demo note 10),
  // mobile parity: once a minute, whenever the page changes, whenever the
  // tab comes back to the front — and, the one that is not a guess about
  // timing, whenever a conversation has actually been marked read.
  const [unreadMessages, setUnreadMessages] = useState(0);
  useEffect(() => {
    let alive = true;
    // A mark-read answers with the count the server computed in the same
    // statement that stamped last_read_at, so it is never stale. A poll can
    // be: one that started BEFORE a read landed still carries the old number,
    // and on a slow count query it arrives after and would overwrite the
    // badge with it until the next interval. The seq makes the read win —
    // a poll only publishes if no read published while it was in flight.
    let readSeq = 0;
    const poll = () => {
      const seq = readSeq;
      fetchUnreadMessageCount()
        .then((count) => {
          if (alive && seq === readSeq) setUnreadMessages(count);
        })
        .catch(() => {
          // A background count; the badge keeps its last number.
        });
    };
    poll();
    const timer = window.setInterval(poll, UNREAD_POLL_INTERVAL_MS);
    const onVisibility = () => {
      if (!document.hidden) poll();
    };
    document.addEventListener('visibilitychange', onVisibility);
    // A read that finishes after the user has already left the conversation
    // still moves the badge, and it moves it to the number the server computed
    // in the same request that did the stamping — no second read to race.
    const unsubscribe = onConversationRead((count) => {
      readSeq += 1;
      if (alive) setUnreadMessages(count);
    });
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      unsubscribe();
    };
  }, [pathname]);

  return (
    <div className="app">
      <Outlet />
      {/* `end` on every link: the light marks where you ARE, not which tab you
          came through (owner, 2026-09-12). Without it /hayvanlar stayed lit
          over an animal profile, claiming you were on the list. Mobile
          discharges the same rule by checking whether its tab stack has moved
          off its own screen. */}
      <nav className="tabbar">
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
          <span className="tab-icon">
            <TabIcon d={ICONS.map} />
          </span>
          harita
        </NavLink>
        <NavLink to="/hayvanlar" end className={({ isActive }) => (isActive ? 'active' : '')}>
          <span className="tab-icon">
            <TabIcon d={ICONS.paw} />
          </span>
          hayvanlar
        </NavLink>
        <NavLink to="/mesajlar" end className={({ isActive }) => (isActive ? 'active' : '')}>
          <span className="tab-icon">
            <TabIcon d={ICONS.chat} />
            {unreadMessages > 0 && (
              <span className="tab-badge" aria-label={`${unreadMessages} okunmamış mesaj`}>
                {unreadMessages > 99 ? '99+' : unreadMessages}
              </span>
            )}
          </span>
          mesajlar
        </NavLink>
        <NavLink to="/profil" end className={({ isActive }) => (isActive ? 'active' : '')}>
          <span className="tab-icon">
            <TabIcon d={ICONS.user} />
          </span>
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
  useEffect(() => {
    if (me) markReturningVisitor();
  }, [me]);

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
        {/* A stranger at pati-app.com meets the introduction, not a bare
            sign-in form; its button leads to /giris. Someone who already
            uses pati keeps `/` on sign-in (frontDoor.ts). */}
        {!me && <Route path="/hakkinda" element={aboutPage} />}
        {!me && <Route path="/giris" element={<LoginPage />} />}
        {!me && showsAboutAtRoot() && <Route path="/" element={aboutPage} />}
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
          <Route path="bildirimler" element={<NotificationsPage />} />
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
        <Route path="/hakkinda" element={aboutPage} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BadgeAwardProvider>
  );
}
