-- Stray - Başlangıç veritabanı şeması
-- PostGIS uzantısını etkinleştir (coğrafi sorgular için)
CREATE EXTENSION IF NOT EXISTS postgis;

-- Kullanıcılar
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'vet', 'admin')),
    avatar_url TEXT,
    -- Profilde öne çıkarılacak en fazla 3 rozetin anahtarı (örn. "breed:Tekir").
    -- Rozetler hesaplanmış veriden türetildiği için burada yalnızca seçim saklanıyor.
    featured_badges JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- Rozet kazanma popup'ında "eski sıralaman / yeni sıralaman" gösterebilmek için
    -- en son hesaplanan sıralama ve puanın anlık görüntüsü. Sıralama başkalarının
    -- puan kazanmasıyla da değiştiği için geçmişe dönük hesaplanamaz.
    last_rank INTEGER,
    last_points INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Hayvanlar
CREATE TABLE IF NOT EXISTS animals (
    id SERIAL PRIMARY KEY,
    species VARCHAR(10) NOT NULL CHECK (species IN ('cat', 'dog')),
    name VARCHAR(120),
    color VARCHAR(120),
    -- Serbest metin: mobil uygulama türe göre (kedi/köpek) sabit bir seçenek listesi
    -- sunar (Tekir, Sarman, Kangal, Melez vb.), burada CHECK kısıtlaması yok ki yeni
    -- bir tür eklemek migrasyon gerektirmesin.
    breed VARCHAR(50),
    markings TEXT,
    -- Hayvanın en son görüldüğü konum. Biri "bu hayvan zaten kayıtlı" diyerek
    -- görüldü bildirdiğinde bu alan güncellenir, yani sabit bir kayıt yeri değil
    -- güncel konumu tutar.
    location GEOGRAPHY(POINT, 4326) NOT NULL,
    location_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_animals_location ON animals USING GIST (location);

-- Hayvan fotoğrafları
CREATE TABLE IF NOT EXISTS animal_photos (
    id SERIAL PRIMARY KEY,
    animal_id INTEGER NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    uploaded_by INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sağlık ve ilaçlandırma kayıtları.
-- Takip durumu ayrı bir kolonda tutulmuyor; "tedaviye başlanmadı / başlandı"
-- ayrımı kayda bağlı yorum olup olmamasından türetiliyor (bkz. animal_comments).
-- Yalnızca "iyileşti" kalıcı bir işaret olduğu için burada saklanıyor.
CREATE TABLE IF NOT EXISTS health_records (
    id SERIAL PRIMARY KEY,
    animal_id INTEGER NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
    record_type VARCHAR(20) NOT NULL CHECK (record_type IN ('illness', 'injury', 'treatment', 'vaccination', 'medication')),
    description TEXT NOT NULL,
    vet_verified BOOLEAN NOT NULL DEFAULT false,
    recorded_by INTEGER NOT NULL REFERENCES users(id),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    recovered_at TIMESTAMPTZ,
    recovered_by INTEGER REFERENCES users(id)
);

-- Hayvan profilindeki sohbet. Bir yorum isteğe bağlı olarak bir sağlık kaydına
-- bağlanabilir (örn. "şu hastalık için ilacını verdim"); böylece sağlık kaydına
-- tıklandığında o hastalıkla ilgili tüm yorumlar listelenebiliyor.
CREATE TABLE IF NOT EXISTS animal_comments (
    id SERIAL PRIMARY KEY,
    animal_id INTEGER NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    health_record_id INTEGER REFERENCES health_records(id) ON DELETE SET NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_animal_comments_animal ON animal_comments (animal_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_animal_comments_health_record ON animal_comments (health_record_id);

-- Kullanıcı ile hayvan arasındaki bakım (takip) ilişkisi
CREATE TABLE IF NOT EXISTS user_animal_care (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    animal_id INTEGER NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, animal_id)
);

-- Bakım noktaları: kullanıcıların mama/su bıraktığı tam konumlar.
-- Bölge/idari sınır kavramı yok; harita bu noktaların yoğunluğuna göre ısı haritası
-- olarak renklendirilir ve "son 24 saatte 500m içinde bakım var mı" sorgusu buradan hesaplanır.
CREATE TABLE IF NOT EXISTS care_actions (
    id SERIAL PRIMARY KEY,
    location GEOGRAPHY(POINT, 4326) NOT NULL,
    user_id INTEGER NOT NULL REFERENCES users(id),
    action_type VARCHAR(20) NOT NULL CHECK (action_type IN ('food', 'water')),
    photo_url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_care_actions_location ON care_actions USING GIST (location);

-- Arkadaşlık istekleri/ilişkileri. 'pending' durumundaki bir satır iken karşı taraf
-- da istek gönderirse uygulama katmanında otomatik 'accepted' yapılır (bkz.
-- friendship.controller.js). Kabul edilmiş bir ilişki, iki yönden de sorgulanabilir
-- olması için requester/addressee ayrımı yalnızca isteği kimin başlattığını gösterir.
CREATE TABLE IF NOT EXISTS friendships (
    id SERIAL PRIMARY KEY,
    requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    addressee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    responded_at TIMESTAMPTZ,
    CHECK (requester_id <> addressee_id),
    UNIQUE (requester_id, addressee_id)
);

-- Kazanılan rozetlerin anı. Rozetin kendisi türetilmiş veri (bkz. utils/badges.js),
-- ama "yeni rozet kazandın" popupını

-- Kazanılan rozetlerin anı. Rozetin kendisi türetilmiş veri (bkz. utils/badges.js),
-- ama "yeni rozet kazandın" popup'ını gösterebilmek için rozetin ilk kez ne zaman
-- kazanıldığını ve o andaki puan/sıralama/seviye bilgisini saklamak gerekiyor —
-- bu bilgi sonradan yeniden hesaplanamaz.
CREATE TABLE IF NOT EXISTS user_badge_awards (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge_key VARCHAR(160) NOT NULL,
    tier VARCHAR(20) NOT NULL CHECK (tier IN ('bronze', 'silver', 'gold', 'diamond')),
    label VARCHAR(200) NOT NULL,
    points_awarded INTEGER NOT NULL DEFAULT 0,
    points_before INTEGER,
    points_after INTEGER,
    rank_before INTEGER,
    rank_after INTEGER,
    level_before INTEGER,
    level_after INTEGER,
    -- Popup gösterildikten sonra doldurulur; NULL olanlar "henüz gösterilmedi".
    seen_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, badge_key, tier)
);

CREATE INDEX IF NOT EXISTS idx_user_badge_awards_unseen
    ON user_badge_awards (user_id, created_at DESC) WHERE seen_at IS NULL;

-- Bir kullanıcının son yorumlarını profilinde listeleyebilmek için.
CREATE INDEX IF NOT EXISTS idx_animal_comments_user ON animal_comments (user_id, created_at DESC);
