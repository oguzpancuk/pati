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
    -- Admin panelinden askıya alınan hesaplar. Silmek yerine askıya alıyoruz ki
    -- kullanıcının bıraktığı bakım kayıtları ve yorumlar (başkalarının gördüğü
    -- veri) kaybolmasın. Dolu ise API 403 döner.
    suspended_at TIMESTAMPTZ,
    suspended_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Hayvanlar
CREATE TABLE IF NOT EXISTS animals (
    id SERIAL PRIMARY KEY,
    species VARCHAR(10) NOT NULL CHECK (species IN ('cat', 'dog')),
    name VARCHAR(120),
    color VARCHAR(120),
    -- Tür/desen. Uygulama türe göre sabit bir liste sunuyor (bkz.
    -- src/utils/taxonomy.js) ama "Diğer" seçilirse kullanıcının yazdığı metin
    -- buraya giriyor; bu yüzden CHECK yok ve alan renkle aynı genişlikte.
    breed VARCHAR(120),
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

-- Sağlık kayıtları: yalnızca HASTALIK ve YARALANMA.
-- Aşı ayrı bir tabloda (vaccinations) tutuluyor: aşının "iyileşti" durumu yok,
-- tekrar tarihi var ve kim yaptı sorusu farklı (belediye/veteriner). Aynı
-- tabloda tutmak iki kaydı da yarım yamalak modellemek olurdu.
-- Takip durumu ayrı bir kolonda değil; "tedaviye başlanmadı / başlandı" ayrımı
-- kayda bağlı yorum olup olmamasından türetiliyor (bkz. animal_comments).
-- Yalnızca "iyileşti" kalıcı bir işaret olduğu için burada saklanıyor.
CREATE TABLE IF NOT EXISTS health_records (
    id SERIAL PRIMARY KEY,
    animal_id INTEGER NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
    record_type VARCHAR(20) NOT NULL CHECK (record_type IN ('illness', 'injury')),
    -- Listeden seçilen başlık ya da "Diğer" seçilmişse kullanıcının yazdığı metin.
    description TEXT NOT NULL,
    vet_verified BOOLEAN NOT NULL DEFAULT false,
    recorded_by INTEGER NOT NULL REFERENCES users(id),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    recovered_at TIMESTAMPTZ,
    recovered_by INTEGER REFERENCES users(id)
);

-- Aşı ve paraziter ilaçlama kayıtları.
-- `vaccine_type` listeden gelen bir değer ya da "Diğer" seçilmişse serbest metin.
-- `next_due_at` bilinmiyorsa NULL: sokak hayvanında bir sonraki dozu kimse
-- garanti edemiyor, zorunlu tutmak sahte veri üretirdi.
CREATE TABLE IF NOT EXISTS vaccinations (
    id SERIAL PRIMARY KEY,
    animal_id INTEGER NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
    vaccine_type VARCHAR(120) NOT NULL,
    note TEXT,
    -- Belediye/veteriner tarafından yapıldıysa işaretleniyor; rozet ve
    -- güvenilirlik açısından kullanıcı beyanından ayrışması gerekiyor.
    vet_verified BOOLEAN NOT NULL DEFAULT false,
    administered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    next_due_at TIMESTAMPTZ,
    recorded_by INTEGER NOT NULL REFERENCES users(id),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vaccinations_animal ON vaccinations (animal_id, administered_at DESC);
CREATE INDEX IF NOT EXISTS idx_vaccinations_recorder ON vaccinations (recorded_by);

-- Hayvan profilindeki sohbet. Bir yorum isteğe bağlı olarak bir sağlık kaydına
-- bağlanabilir; böylece kayda tıklandığında yalnızca o kayda ait yorumlar
-- listelenebiliyor.
-- Aşı kayıtlarının sohbeti YOK: aşı tek seferlik ve doğrulanabilir bir olay,
-- "iyileşti mi, nasıl gidiyor" gibi bir takip süreci yok. Yorum alanı açık
-- kalınca boş duruyor ve sağlık kaydıyla karıştırılıyordu.
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
-- olarak renklendirilir ve "yakınımda bakım var mı" sorgusu buradan hesaplanır
-- (yarıçap ve zaman penceresi care.controller.js içinde: 100m, mama 4sa / su 6sa).
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

-- Admin panelinden yapılan her değişikliğin kaydı. Veri manipüle edilebilen bir
-- panelde bu olmadan "bu hayvanı kim sildi?" sorusu cevaplanamıyor.
-- target_type/target_id serbest metin: yeni bir varlık türü eklenince şema
-- değişmesin diye yabancı anahtar konmadı (kayıt silinse bile iz kalmalı).
CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(60) NOT NULL,
    target_type VARCHAR(40) NOT NULL,
    target_id INTEGER,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_target ON audit_log (target_type, target_id);

-- Reklamverenler. Hazır bir reklam ağı (AdMob vb.) yerine kendi basit reklam
-- sunucumuz: markalar admin panelinden elle giriliyor ve yerleşimler çok
-- spesifik (mama pop-up'ında mama markası, su pop-up'ında su markası, sağlık
-- kaydı eklerken veteriner kliniği).
CREATE TABLE IF NOT EXISTS advertisers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    slot VARCHAR(30) NOT NULL CHECK (slot IN ('food_popup', 'water_popup', 'vet_health_record')),
    headline VARCHAR(120),
    body VARCHAR(200),
    image_url TEXT,
    target_url TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    -- Kampanya tarih aralığı; NULL = sınırsız.
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_advertisers_slot ON advertisers (slot, sort_order, id);

-- Gösterim ve tıklama kayıtları. Markalara "şu kadar gösterim, şu kadar tık"
-- diyebilmek için şart — bu ölçüm olmadan reklam satılamaz.
--
-- slot burada advertisers'tan kopyalanıyor (denormalize): reklamveren silinse
-- bile geçmiş rapor ayakta kalsın ve rotasyon sayacı yerleşim bazında tek
-- indeksle sayılabilsin diye.
CREATE TABLE IF NOT EXISTS ad_events (
    id SERIAL PRIMARY KEY,
    advertiser_id INTEGER REFERENCES advertisers(id) ON DELETE SET NULL,
    slot VARCHAR(30) NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    type VARCHAR(12) NOT NULL CHECK (type IN ('impression', 'click')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Rotasyon sırası kullanıcının o yerleşimdeki gösterim sayısından türetiliyor,
-- bu yüzden bu indeks sıcak yolda (her pop-up açılışında) kullanılıyor.
CREATE INDEX IF NOT EXISTS idx_ad_events_rotation ON ad_events (user_id, slot, type);
CREATE INDEX IF NOT EXISTS idx_ad_events_report ON ad_events (advertiser_id, type);
