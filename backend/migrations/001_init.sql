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
    location GEOGRAPHY(POINT, 4326) NOT NULL,
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

-- Sağlık ve ilaçlandırma kayıtları
CREATE TABLE IF NOT EXISTS health_records (
    id SERIAL PRIMARY KEY,
    animal_id INTEGER NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
    record_type VARCHAR(20) NOT NULL CHECK (record_type IN ('illness', 'injury', 'treatment', 'vaccination', 'medication')),
    description TEXT NOT NULL,
    vet_verified BOOLEAN NOT NULL DEFAULT false,
    recorded_by INTEGER NOT NULL REFERENCES users(id),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
