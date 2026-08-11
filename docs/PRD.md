# Sokak Hayvanları Takip Uygulaması — Ürün Gereksinim Belgesi (PRD)

Hazırlama Tarihi: 10.08.2026

## 1. Özet

Sokak Hayvanları Takip Uygulaması, Türkiye'deki sokak hayvanlarının refahını iyileştirmek
için tasarlanmış bir sosyal etki platformudur. Uygulama, hayvan severler, veterinerler ve
aktivistlerin sokak köpekleri ve kedilerinin beslenme, sağlık ve refah durumunu etkili bir
şekilde koordine etmelerine olanak tanır.

## 2. Sorun Tanımı

Türkiye'deki sokak hayvanları, özellikle beslenme ve tıbbi bakım konusunda önemli
sorunlarla karşı karşıyadır. Mevcut durumda:

- Sokak hayvanlarını beslemek isteyen kişiler, hangi bölgelerin yeterince bakım aldığını bilmezler
- Hayvan sağlık sorunları (hastalık, yaralanma) takip edilemiyor ve sistematik olarak kaydedilmiyor
- Aynı hayvana birden fazla kişi bakıyor, bu da koordinasyon eksikliğine yol açıyor
- Veteriner danışmanlığına kolay ulaşılamıyor ve tedavi bilgileri merkezi olarak saklanmıyor

## 3. Çözüm Yaklaşımı

Sokak Hayvanları Takip Uygulaması, etkileşimli harita, hayvan profil sistemi ve sosyal ağ
bileşenlerini entegre ederek şunları sağlar:

- Bölge bazlı takip ve koordinasyon sistematiği
- Her hayvanın sağlık ve beslenme geçmişinin merkezi olarak saklanması
- Kullanıcı topluluğunun sosyal olarak bağlanması ve işbirliğinin arttırılması

## 4. Temel Özellikler

### 4.1 İnteraktif Harita Sistemi

Uygulamanın ana sayfasında, Türkiye'nin bölgelere ayrılmış bir haritası yer alır. Her bölge,
o bölgedeki hayvan popülasyonu ve bakım düzeyine göre renklendirilir.

**Renk Kodlaması:**

- Yeşil: Yeterli mama/su ve bakım sağlanıyor
- Sarı: Orta düzeyde bakım var
- Kırmızı: Acil yardıma ihtiyaç var

Kullanıcılar, "Mama Bıraktım", "Su Bıraktım" veya "Hayvan Görüldü" gibi aksiyonları
bölgeye ekleyebilirler. Her aksiyonda tarih, saat ve kullanıcı bilgisi kaydedilir.

### 4.2 Hayvan Profil Sistemi

Her kedi ve köpek, benzersiz bir profil sayfasına sahiptir. Bu profil, hayvanın:

- Fotoğrafları ve tanımlayıcı bilgileri (renk, boy, işaretler)
- Sağlık durumu (hastalık, yaralanma, tedavi geçmişi)
- İlaçlandırma kaydı (ne, ne zaman, kim tarafından)
- Beslenme ve su alma bilgileri
- Kullanıcı yorumları ve gözlemleri

Veterinerlerin onayladığı tıbbi bilgiler, kullanıcı yorumlarından ayrı olarak gösterilir.

### 4.3 Hayvan Ekleme Sistemi

Kullanıcılar, "Yeni Hayvan" sayfasında hayvanın fotoğraflarını çekerek uygulamaya
yüklerler. Sistem, yapay zeka kullanarak hayvanı tanıyıp, daha önce kaydedilmiş bir
hayvan olup olmadığını kontrol eder.

- Eğer ilk defa görülüyor: Yeni profil oluşturulur ve kullanıcı temel bilgileri (konum, tarih vb) ekler
- Eğer daha önce kaydedilmiş: Hayvanın mevcut profiline yönlendirilir

### 4.4 Kullanıcı Profili ve Sosyal Ağ

Her kullanıcının, bakım verdiği hayvanların listesini gösteren bir profili vardır. Kullanıcılar:

- Aynı hayvana bakan diğer kişileri görebilir ve onlarla bağlantı kurabilir
- Doğrudan mesajlaşma yoluyla koordinasyon ve bilgi alışverişi yapabilir
- Kendi bakım sayfasında, bakmakla yükümlü olduğu hayvanları ve deneyimlerini paylaşabilir

### 4.5 Bildirim Sistemi

Bir bölgenin durumu "Kırmızı" (acil yardıma ihtiyaç) olduğunda, o bölgede aktif olan tüm
kullanıcılara anında bildirim gönderilir.

## 5. MVP (Minimum Viable Product) Kapsamı

İlk aşamada aşağıdaki özellikler sağlanacaktır:

- Kullanıcı kaydı ve giriş sistemi
- İnteraktif harita ve bölge sistemi
- Mama/Su ekleme ve takibi
- Hayvan profili oluşturma (manuel)
- Hayvan sağlık ve ilaç kaydı
- Basit bildirim sistemi

**Sonraki Faz İçin Planlanan:** Yapay zeka hayvan tanıması, gelişmiş sosyal ağ özellikleri,
oluşturulmuş raporlar ve analitikler.

## 6. Teknik Yaklaşım

Uygulamada modern, skalabilir ve güvenilir teknolojiler kullanılacaktır:

- **Frontend:** Web ve mobil uygulama (React Native)
- **Backend:** Node.js ve Express
- **Veritabanı:** PostgreSQL ve PostGIS (coğrafi sorgular için)
- **Harita:** Leaflet + OpenStreetMap
- **Kimlik doğrulama:** JWT ve şifre şifrelemesi

## 7. Başarı Metrikleri

Uygulamanın başarısı aşağıdaki göstergelerle ölçülecektir:

- Aktif kullanıcı sayısı ve aylık artış oranı
- Kaydedilen hayvan sayısı ve takip kalitesi
- Kızıl alarm saatleri cevap oranı
- Kullanıcı katılım ve sosyal bağlantı kalitesi
- Veteriner ve kuruluş ortaklık sayısı

## 8. Sosyal Etki

Bu uygulama, sokak hayvanlarının yaşam kalitesini doğrudan iyileştirmeyi amaçlar.

**Hedefler:**

- Beslenme ve bakım eksikliklerini azaltmak
- Hayvan sağlık sorunlarının daha hızlı tespit edilmesini sağlamak
- Veteriner hizmetlerine erişimi kolaylaştırmak
- Sokak hayvanlarıyla ilgili toplum bilincini artırmak
