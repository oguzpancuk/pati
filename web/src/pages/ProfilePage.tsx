import { useRef, useState } from 'react';
import { AVATAR_VARIANTS } from '@mobile/avatars';
import { patiAvatarSvg } from '@shared/avatarSvg';
import { setAvatarKey, uploadAvatar } from '../api';
import { useAuth } from '../auth';
import { UserAvatar } from '../avatars';

export default function ProfilePage() {
  const { me, logout, applyMe } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [group, setGroup] = useState<'female' | 'male'>('female');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!me) return null;

  async function pickAvatar(key: string) {
    setBusy(true);
    setError(null);
    try {
      applyMe(await setAvatarKey(key));
      setPickerOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kaydedilemedi');
    } finally {
      setBusy(false);
    }
  }

  async function pickPhoto(file: File) {
    setBusy(true);
    setError(null);
    try {
      applyMe(await uploadAvatar(file));
      setPickerOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Yüklenemedi');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      {error && <div className="error">{error}</div>}

      {/* Kartın tamamı tıklanabilir: "dokun" diyen yazının kendisi de
          dokunulabilir olmalı, yalnızca avatar değil. */}
      <div
        className="card row"
        role="button"
        style={{ cursor: 'pointer' }}
        onClick={() => setPickerOpen(true)}
      >
        <UserAvatar avatarUrl={me.avatar_url} name={me.name} size={64} />
        <div className="grow">
          <h1 style={{ margin: 0, fontSize: 22 }}>{me.name}</h1>
          <div className="muted">{me.email}</div>
          <div className="subtle" style={{ color: 'var(--brand)', fontWeight: 800 }}>
            DOKUN, AVATARINI SEÇ
          </div>
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <div className="label" style={{ margin: 0 }}>
              SEVİYE {me.level.level}
            </div>
            <strong style={{ fontSize: 18 }}>{me.level.title}</strong>
          </div>
          <strong style={{ color: 'var(--brand)' }}>{me.points.total} puan</strong>
        </div>
        <div
          style={{
            height: 8,
            borderRadius: 99,
            background: 'var(--disabled)',
            marginTop: 12,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${Math.round(me.level.progress * 100)}%`,
              height: '100%',
              background: 'var(--brand)',
            }}
          />
        </div>
        {me.rank && (
          <div className="muted" style={{ marginTop: 8 }}>
            Sıralaman: {me.rank.rank}. / {me.rank.totalUsers}
          </div>
        )}
      </div>

      <div className="card row" style={{ justifyContent: 'space-around', textAlign: 'center' }}>
        {(
          [
            [me.stats.foodCount, 'Mama'],
            [me.stats.waterCount, 'Su'],
            [me.stats.animalCount, 'Hayvan'],
          ] as const
        ).map(([count, label]) => (
          <div key={label}>
            <strong style={{ fontSize: 20 }}>{count}</strong>
            <div className="subtle">{label}</div>
          </div>
        ))}
      </div>

      <button className="btn secondary full" onClick={logout}>
        Çıkış yap
      </button>

      {pickerOpen && (
        <div className="backdrop" onClick={() => !busy && setPickerOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2>Avatarını seç</h2>
            <p className="muted">İstersen kendi fotoğrafını da yükleyebilirsin.</p>
            <div className="chiprow" style={{ justifyContent: 'center' }}>
              {(
                [
                  ['female', 'Kadın'],
                  ['male', 'Erkek'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  className={`chip ${group === value ? 'selected' : ''}`}
                  onClick={() => setGroup(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="avatar-grid">
              {AVATAR_VARIANTS.filter((v) => v.group === group).map((v) => {
                const selected = me.avatar_url === `pati-avatar:${v.key}`;
                return (
                  <button
                    key={v.key}
                    className={selected ? 'selected' : ''}
                    disabled={busy}
                    onClick={() => pickAvatar(v.key)}
                    dangerouslySetInnerHTML={{
                      __html: patiAvatarSvg(`pati-avatar:${v.key}`, 58) ?? '',
                    }}
                  />
                );
              })}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) pickPhoto(file);
                e.target.value = '';
              }}
            />
            <button
              className="btn secondary full"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              Kendi fotoğrafımı yükle
            </button>
            <button className="btn ghost full" disabled={busy} onClick={() => setPickerOpen(false)}>
              Kapat
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
