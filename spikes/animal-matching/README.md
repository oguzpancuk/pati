# Spike: Yapay zekâ ile hayvan eşleştirme

Bu klasör, [YOL_HARITASI.md madde 1](../../docs/YOL_HARITASI.md) için yapılan
ölçümlerin scriptlerini tutar. Amaç iki soruyu cevaplamak:

1. **Maliyet ve hız** — binlerce kullanıcıda ne kadar sürer, ne kadara mal olur?
   → ✅ Ölçüldü, sonuçlar yol haritasında.
2. **İsabet** — model sokak koşullarında aynı hayvanı tanıyabiliyor mu?
   → ⏳ Henüz ölçülemedi (aşağıya bakın).

## 1. Gömme modeli hızı — `bench_embed.py`

Fotoğrafı vektöre çevirmenin CPU üzerinde ne kadar sürdüğünü ölçer.

```bash
python3 -m venv venv
./venv/bin/pip install torch torchvision
./venv/bin/python bench_embed.py
```

**Ağırlıklar rastgele.** Bu ölçüm için sorun değil: ileri geçişin süresi
mimariye, girdi boyutuna ve donanıma bağlı — ağırlıkların eğitilmiş olup
olmamasına değil. Yani buradaki milisaniyeler gerçek DINOv2/CLIP ağırlıklarıyla
da aynı çıkar. **İsabet bu scriptle ölçülemez.**

Ölçülen (4 çekirdek CPU, GPU yok), kayıt başına 3 fotoğraf:

| Model | 3 fotoğraf |
| --- | --- |
| ViT-B/16 (DINOv2 base sınıfı) | 335 ms |
| ViT-B/32 (CLIP ViT-B/32 sınıfı) | 84 ms |
| ResNet-50 | 101 ms |
| MobileNetV3-L | 28 ms |

## 2. Vektör araması hızı — `bench_search.js`

Gerçek ölçekte "1 km içindeki adaylar arasında en benzer 5 hayvan" sorgusunun
süresini ölçer. `pgvector` eklentisi gerekiyor.

```bash
# pgvector kurulu bir PostgreSQL gerekiyor:
#   apt-get install postgresql-16-pgvector
#   psql -d stray -c "CREATE EXTENSION vector;"

ANIMALS=25000 node bench_search.js
```

Ölçülen (25.000 hayvan × 3 fotoğraf = 75.000 vektör, 768 boyut, 309 MB):

| Aday kümesi | Vektör | Süre |
| --- | --- | --- |
| 1 km yarıçap | ~300 | **4 ms** |
| 3 km yarıçap | ~2.850 | 20 ms |
| 10 km yarıçap | ~31.400 | 261 ms |
| Coğrafi daraltma yok | 75.000 | 309 ms |

**En önemli bulgu:** coğrafi daraltma 75 kat fark yaratıyor. PostGIS ile önce
daraltmak mimarinin kritik parçası.

## 3. İsabet ölçümü — henüz yapılmadı

Asıl risk maliyet değil, modelin **sokak koşullarında aynı hayvanı tanıyıp
tanımaması**: kötü ışık, uzaktan çekim, hareket hâlindeki hayvan, farklı açı.

Bu ölçüm geliştirme ortamında yapılamadı — ağ politikası model ağırlığı ve veri
seti sunucularını (huggingface.co, download.pytorch.org, GitHub release, GCS)
engelliyor; yalnızca PyPI açık, yani paket kurulabiliyor ama eğitilmiş ağırlık
indirilemiyor.

**Yapılması gereken:** ağ erişimi olan bir makinede, gerçek ağırlıklarla:

1. 10–20 hayvan × 3–4 fotoğraf (aynı hayvanın farklı zaman/açılardan çekilmiş
   fotoğrafları) toplanır — gerçek sokak fotoğrafları tercih edilir, yoksa
   kimlik etiketli açık veri setleri kullanılır
2. Her fotoğrafın vektörü çıkarılır
3. Her fotoğraf sırayla "sorgu" yapılır, kalanlar arasında en benzer 5 bulunur
4. **Metrik:** aynı hayvanın başka bir fotoğrafı ilk 5'te çıkıyor mu? (top-5 isabet)
5. Ayrıca farklı hayvanların skor dağılımına bakılır — eşik belirlemek için

Sonuç yeterliyse `pgvector` + PostGIS ile tam entegrasyona geçilir. Yetersizse
akış baştan farklı tasarlanır (örn. yalnızca "yakındakileri göster" listesini
sıralamak, otomatik eşleştirme iddiası olmadan).
