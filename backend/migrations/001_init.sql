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
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bölgeler (harita üzerindeki bakım/durum alanları)
CREATE TABLE IF NOT EXISTS regions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    boundary GEOGRAPHY(POLYGON, 4326) NOT NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'yellow' CHECK (status IN ('green', 'yellow', 'red')),
    status_updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_regions_boundary ON regions USING GIST (boundary);

-- Hayvanlar
CREATE TABLE IF NOT EXISTS animals (
    id SERIAL PRIMARY KEY,
    species VARCHAR(10) NOT NULL CHECK (species IN ('cat', 'dog')),
    name VARCHAR(120),
    color VARCHAR(120),
    size VARCHAR(20) CHECK (size IN ('small', 'medium', 'large')),
    markings TEXT,
    location GEOGRAPHY(POINT, 4326) NOT NULL,
    region_id INTEGER REFERENCES regions(id) ON DELETE SET NULL,
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

-- Kullanıcı ile hayvan arasındaki bakım (kaydırma/takip) ilişkisi
CREATE TABLE IF NOT EXISTS user_animal_care (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    animal_id INTEGER NOT NULL REFERENCES animals(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, animal_id)
);

-- Bölge aksiyonları: "Mama Bıraktım", "Su Bıraktım", "Hayvan Görüldü"
CREATE TABLE IF NOT EXISTS feeding_actions (
    id SERIAL PRIMARY KEY,
    region_id INTEGER NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
    animal_id INTEGER REFERENCES animals(id) ON DELETE SET NULL,
    user_id INTEGER NOT NULL REFERENCES users(id),
    action_type VARCHAR(20) NOT NULL CHECK (action_type IN ('food', 'water', 'sighting')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bildirimler
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    region_id INTEGER REFERENCES regions(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
