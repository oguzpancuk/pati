# Spike: AI-based animal matching

This folder holds the measurement scripts for
[ROADMAP.md item 1](../../docs/ROADMAP.md). The goal is to answer two
questions:

1. **Cost and speed** — how long does it take and what does it cost with
   thousands of users? → ✅ Measured; results are in the roadmap.
2. **Accuracy** — can the model recognize the same animal under street
   conditions? → ⏳ Not yet measured (see below).

## 1. Embedding model speed — `bench_embed.py`

Measures how long turning a photo into a vector takes on CPU.

```bash
python3 -m venv venv
./venv/bin/pip install torch torchvision
./venv/bin/python bench_embed.py
```

**The weights are random.** That's fine for this measurement: forward-pass
time depends on the architecture, input size and hardware — not on whether
the weights are trained. The milliseconds here come out the same with real
DINOv2/CLIP weights. **Accuracy cannot be measured with this script.**

Measured (4-core CPU, no GPU), 3 photos per record:

| Model | 3 photos |
| --- | --- |
| ViT-B/16 (DINOv2 base class) | 335 ms |
| ViT-B/32 (CLIP ViT-B/32 class) | 84 ms |
| ResNet-50 | 101 ms |
| MobileNetV3-L | 28 ms |

## 2. Vector search speed — `bench_search.js`

Measures the "top 5 most similar among candidates within 1 km" query at
realistic scale. Requires the `pgvector` extension.

```bash
# Needs PostgreSQL with pgvector installed:
#   apt-get install postgresql-16-pgvector
#   psql -d stray -c "CREATE EXTENSION vector;"

ANIMALS=25000 node bench_search.js
```

Measured (25,000 animals × 3 photos = 75,000 vectors, 768 dimensions, 309 MB):

| Candidate set | Vectors | Time |
| --- | --- | --- |
| 1 km radius | ~300 | **4 ms** |
| 3 km radius | ~2,850 | 20 ms |
| 10 km radius | ~31,400 | 261 ms |
| No geographic narrowing | 75,000 | 309 ms |

**Key finding:** geographic narrowing makes a 75× difference. Narrowing
first with PostGIS is a critical part of the architecture.

## 3. Accuracy measurement — not done yet

The real risk isn't cost but whether the model **recognizes the same animal
under street conditions**: bad light, distant shots, a moving animal,
different angles.

This measurement couldn't be done in the development environment — the
network policy blocks the model-weight and dataset hosts (huggingface.co,
download.pytorch.org, GitHub releases, GCS); only PyPI is open, so packages
install but trained weights can't be downloaded.

**What needs to happen:** on a machine with network access, with real
weights:

1. Collect 10–20 animals × 3–4 photos (photos of the same animal from
   different times/angles) — real street photos preferred, otherwise
   identity-labeled open datasets
2. Extract each photo's vector
3. Query with each photo in turn, find the top 5 most similar among the rest
4. **Metric:** does another photo of the same animal appear in the top 5?
   (top-5 hit rate)
5. Also examine the score distribution across different animals — to pick a
   threshold

If the result is good enough, proceed to full `pgvector` + PostGIS
integration. If not, redesign the flow from scratch (e.g. only ranking the
"show nearby" list, with no automatic-matching claim).
