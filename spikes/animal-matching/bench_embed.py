"""
Measures the embedding model's latency on CPU.

The weights are random — fine for this measurement: forward-pass time
depends on the architecture, input size and hardware, not on whether the
weights are trained. The milliseconds here come out the same with real
DINOv2/CLIP weights. Accuracy CANNOT be evaluated with this measurement.
"""
import time
import torch
import torchvision.models as tvm

torch.set_grad_enabled(False)
torch.set_num_threads(4)

MODELS = {
    "ViT-B/16 (86M) — CLIP/DINOv2 base class": lambda: tvm.vit_b_16(weights=None),
    "ViT-B/32 (88M) — CLIP ViT-B/32 class": lambda: tvm.vit_b_32(weights=None),
    "ResNet-50 (25M) — lighter alternative": lambda: tvm.resnet50(weights=None),
    "MobileNetV3-L (5M) — lightest": lambda: tvm.mobilenet_v3_large(weights=None),
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
    return times[len(times) // 2]  # median


print(f"CPU: {torch.get_num_threads()} threads\n")
print(f"{'Model':<44} {'1 photo':>10} {'3 photos (batch)':>16} {'per photo':>11}")
print("-" * 84)

results = {}
for name, build in MODELS.items():
    model = build().eval()
    single = bench(model, 1)
    batch3 = bench(model, 3)
    results[name] = (single, batch3)
    print(f"{name:<44} {single:>8.0f}ms {batch3:>14.0f}ms {batch3 / 3:>9.0f}ms")

print()
print("Total added time per record (3 photos, processed as a batch):")
for name, (_, batch3) in results.items():
    print(f"  {name:<44} {batch3 / 1000:>5.2f} s")
