"""
Gömme (embedding) modelinin CPU üzerindeki gecikmesini ölçer.

Ağırlıklar rastgele — bu ölçüm için sorun değil: ileri geçişin süresi mimariye,
girdi boyutuna ve donanıma bağlı, ağırlıkların eğitilmiş olup olmamasına değil.
Yani buradaki milisaniyeler gerçek DINOv2/CLIP ağırlıklarıyla da aynı olur.
İsabet (doğruluk) bu ölçümle DEĞERLENDİRİLEMEZ.
"""
import time
import torch
import torchvision.models as tvm

torch.set_grad_enabled(False)
torch.set_num_threads(4)

MODELS = {
    "ViT-B/16 (86M) — CLIP/DINOv2 base sinifi": lambda: tvm.vit_b_16(weights=None),
    "ViT-B/32 (88M) — CLIP ViT-B/32 sinifi": lambda: tvm.vit_b_32(weights=None),
    "ResNet-50 (25M) — hafif alternatif": lambda: tvm.resnet50(weights=None),
    "MobileNetV3-L (5M) — en hafif": lambda: tvm.mobilenet_v3_large(weights=None),
}

WARMUP = 3
RUNS = 12


def bench(model, batch):
    x = torch.randn(batch, 3, 224, 224)
    for _ in range(WARMUP):
        model(x)
    times = []
    for _ in range(RUNS):
        t0 = time.perf_counter()
        model(x)
        times.append((time.perf_counter() - t0) * 1000)
    times.sort()
    return times[len(times) // 2]  # medyan


print(f"CPU: {torch.get_num_threads()} is parcacigi\n")
print(f"{'Model':<44} {'1 foto':>10} {'3 foto (toplu)':>16} {'foto basi':>11}")
print("-" * 84)

results = {}
for name, build in MODELS.items():
    model = build().eval()
    single = bench(model, 1)
    batch3 = bench(model, 3)
    results[name] = (single, batch3)
    print(f"{name:<44} {single:>8.0f}ms {batch3:>14.0f}ms {batch3 / 3:>9.0f}ms")

print()
print("Kayit basi toplam ek sure (3 fotograf, toplu islenirse):")
for name, (_, batch3) in results.items():
    print(f"  {name:<44} {batch3 / 1000:>5.2f} sn")
