import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { Logo } from '../brand';
import '../styles/about.css';
// Downscaled from the App Store set (docs/store/screenshots 01, 02, 05) to
// 720 px WebP with sharp; 03 is left out for the reason APP-STORE.md gives
// (its photo strip is placeholder squares).
import mapShot from '../assets/about/map.webp';
import animalsShot from '../assets/about/animals.webp';
import profileShot from '../assets/about/profile.webp';

/**
 * The App Store listing. Null until Apple approves the app: the page shows
 * a "coming soon" line instead of a link that would lead nowhere. Once the
 * listing is live, put its URL here (https://apps.apple.com/app/id…).
 */
export const APP_STORE_URL: string | null = null;

type Lang = 'en' | 'tr';

const LANG_KEY = 'pati-about-lang';

// This page is the front door of pati-app.com, which is linked from outside
// Türkiye too, so it speaks both languages; the rest of the product stays
// Turkish. The browser's language picks the first one.
function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'en' || saved === 'tr') return saved;
  } catch {
    // Storage can be blocked (private mode); the browser language decides.
  }
  return navigator.language.toLowerCase().startsWith('tr') ? 'tr' : 'en';
}

const COPY = {
  en: {
    title: 'pati: street cats and dogs, looked after together',
    headline: 'Street cats and dogs, looked after together.',
    lead:
      'pati is a free app for the people who feed and care for street animals in Türkiye. ' +
      'It puts every bowl of food and water on a shared map, gives each animal in the ' +
      'neighbourhood a profile and a health record, and lets everyone looking after the ' +
      'same animal talk to each other.',
    openWeb: 'Open the web app',
    openSignedIn: 'Open pati',
    appStore: 'Download on the App Store',
    appStoreSoon: 'The iPhone app is coming to the App Store.',
    shotsHeading: 'What is inside',
    shots: [
      {
        title: 'The map',
        body:
          'Food and water left around the neighbourhood. Each ring empties as the drop ' +
          'gets older, so the gaps are easy to spot.',
        alt: 'The pati map: food and water markers with green rings around a neighbourhood, and animal faces between them.',
      },
      {
        title: 'The animals',
        body:
          'Cats and dogs nearby, nearest first. Each one has photos, a health and ' +
          'vaccination record, and a chat for its carers.',
        alt: 'The animals list: cats and dogs with their colour or breed and distance, nearest first.',
      },
      {
        title: 'The carers',
        body: 'Points, tiered badges and a leaderboard for the neighbours who keep showing up.',
        alt: 'A profile: points, rank and level, featured badges and the animals this person cares for.',
      },
    ],
    privacy: 'Privacy notice (Turkish)',
    terms: 'Terms of use (Turkish)',
  },
  tr: {
    title: 'pati: sokak hayvanlarına birlikte bakıyoruz',
    headline: 'Sokaktaki kedi ve köpeklere birlikte bakıyoruz.',
    lead:
      'pati, sokak hayvanlarını besleyen ve onlara bakan insanlar için ücretsiz bir uygulama. ' +
      'Bırakılan her mama ve su kabını ortak bir haritaya koyar, mahalledeki her hayvana ' +
      'bir profil ve sağlık kaydı açar, aynı hayvana bakanları birbiriyle konuşturur.',
    openWeb: 'Web uygulamasını aç',
    openSignedIn: "pati'yi aç",
    appStore: "App Store'dan indir",
    appStoreSoon: "iPhone uygulaması yakında App Store'da.",
    shotsHeading: 'İçinde neler var',
    shots: [
      {
        title: 'Harita',
        body:
          'Mahallede bırakılan mama ve su. Her halka kayıt eskidikçe boşalır; boş kalan ' +
          'yerler hemen göze çarpar.',
        alt: 'pati haritası: bir mahallede yeşil halkalı mama ve su işaretleri, aralarında hayvan yüzleri.',
      },
      {
        title: 'Hayvanlar',
        body:
          'Yakındaki kedi ve köpekler, en yakından uzağa. Her birinin fotoğrafları, sağlık ve ' +
          'aşı kaydı, bakıcılarının sohbeti var.',
        alt: 'Hayvan listesi: renk ya da ırk ve mesafeyle kedi ve köpekler, en yakından uzağa.',
      },
      {
        title: 'Bakım verenler',
        body: 'Düzenli gelen komşular için puan, basamaklı rozetler ve liderlik tablosu.',
        alt: 'Bir profil: puan, sıra ve seviye, öne çıkan rozetler ve bakım verilen hayvanlar.',
      },
    ],
    privacy: 'Aydınlatma Metni',
    terms: 'Kullanım Koşulları',
  },
} as const;

const SHOTS = [mapShot, animalsShot, profileShot];

/**
 * The public introduction at pati-app.com: what pati is, three screens from
 * the app, and where to get it. A signed-out stranger meets it at `/`
 * (frontDoor.ts decides who counts), and it stays reachable at `/hakkinda`
 * for everyone. Web only:
 * the native app is what this page points to, so it has no mobile twin.
 */
export default function AboutPage() {
  const { me } = useAuth();
  const [lang, setLang] = useState<Lang>(initialLang);
  const t = COPY[lang];

  useEffect(() => {
    const root = document.documentElement;
    const previous = { lang: root.lang, title: document.title };
    root.lang = lang;
    document.title = t.title;
    return () => {
      root.lang = previous.lang;
      document.title = previous.title;
    };
  }, [lang, t.title]);

  function choose(next: Lang) {
    setLang(next);
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {
      // Not remembered; the toggle still works for this visit.
    }
  }

  // Signed out, /giris is the sign-in form; once signed in it falls through
  // to the map.
  const appPath = me ? '/' : '/giris';

  return (
    <div className="about">
      <header className="about-bar">
        <div className="about-brand">
          <Logo size={34} />
          <span>pati</span>
        </div>
        <div className="about-lang" role="group" aria-label="Language / Dil">
          <button type="button" aria-pressed={lang === 'en'} onClick={() => choose('en')}>
            English
          </button>
          <button type="button" aria-pressed={lang === 'tr'} onClick={() => choose('tr')}>
            Türkçe
          </button>
        </div>
      </header>

      <main>
        <section className="about-hero">
          <Logo size={96} />
          <h1>{t.headline}</h1>
          <p className="about-lead">{t.lead}</p>
          <div className="about-actions">
            <Link to={appPath} className="btn">
              {me ? t.openSignedIn : t.openWeb}
            </Link>
            {APP_STORE_URL ? (
              <a className="btn secondary" href={APP_STORE_URL}>
                {t.appStore}
              </a>
            ) : (
              <p className="about-soon">{t.appStoreSoon}</p>
            )}
          </div>
        </section>

        <section className="about-shots" aria-labelledby="about-shots-heading">
          <h2 id="about-shots-heading">{t.shotsHeading}</h2>
          <ul>
            {t.shots.map((shot, i) => (
              <li key={shot.title}>
                <img
                  src={SHOTS[i]}
                  alt={shot.alt}
                  width={720}
                  height={1564}
                  loading={i === 0 ? 'eager' : 'lazy'}
                />
                <h3>{shot.title}</h3>
                <p>{shot.body}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="about-footer">
        <nav>
          <Link to="/gizlilik">{t.privacy}</Link>
          <Link to="/kosullar">{t.terms}</Link>
          <a href="mailto:iletisim@pati-app.com">iletisim@pati-app.com</a>
        </nav>
        <p>© {new Date().getFullYear()} Oğuz Pançuk</p>
      </footer>
    </div>
  );
}
