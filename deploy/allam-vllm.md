# Serving ALLaM for Captain Adel

Captain Adel reaches ALLaM through an **OpenAI-compatible** `/v1/chat/completions`
endpoint. Any server that exposes that shape works — vLLM and TGI both do. The
Adel service only needs `ALLAM_BASE_URL` (and optionally `ALLAM_API_KEY`).

## Data boundary (PDPL)

Real user questions are personal data. The ALLaM endpoint **must run in a KSA
region** (in-Kingdom GPU, or a Kingdom cloud region) — never the EU staging VPS.
This is the main reason to self-host ALLaM rather than call a third-party API:
the question text never leaves the Kingdom.

## vLLM (recommended)

```bash
# GPU host, in-Kingdom. ~14 GB VRAM at fp16; quantize to fit ~5-8 GB.
pip install vllm
vllm serve humain-ai/ALLaM-7B-Instruct-preview \
  --max-model-len 4096 \
  --port 8000
# -> OpenAI-compatible API at http://<host>:8000/v1
```

Quantized (fits an L4 / A10 / single consumer GPU):

```bash
vllm serve humain-ai/ALLaM-7B-Instruct-preview \
  --quantization awq --max-model-len 4096 --port 8000
```

Then point the Adel service at it:

```bash
ALLAM_BASE_URL=http://<allam-host>:8000/v1
ALLAM_MODEL=humain-ai/ALLaM-7B-Instruct-preview
MODEL_PROVIDER=auto         # Arabic -> ALLaM, English -> Gemini
```

## Sizing

- fp16: ~14 GB VRAM. AWQ/GPTQ 4-bit: ~5-8 GB.
- A single L4 (24 GB) or A10 comfortably serves the preview model for an
  educational chat load. Keep `--max-model-len` modest (4096) — retrieve-then-read
  passes only the retrieved passages, not the whole corpus.

## Gating before you route real traffic to it

```bash
ALLAM_BASE_URL=http://localhost:8000/v1  node ../evals/run.js --provider allam
```

Enable Arabic routing (`MODEL_PROVIDER=auto`) only once ALLaM matches-or-beats
Gemini on the citation / refusal / injection cases in **both** languages. Until
then keep `MODEL_PROVIDER=gemini`; ALLaM stays available as a manual
`provider:"allam"` override and as the cross-provider fallback.

## Local dev with a GPU

`deploy/docker-compose.yml` brings up the Adel service plus a vLLM sidecar
(`vllm/vllm-openai`). It needs an NVIDIA GPU + the container toolkit. On a
CPU-only box, drop the `allam` service and run Gemini-only.

## Jais (second Arabic model)

Jais (Inception/G42) uses the exact same OpenAI-compatible serving — both
providers are built from `src/brain/providers/openai-compatible.js`. Serve it
with vLLM the same way (swap the model id), then point the Adel service at it:

```bash
JAIS_BASE_URL=http://<jais-host>:8000/v1
JAIS_MODEL=inceptionai/jais-13b-chat
# optional: JAIS_API_KEY=…
```

Smoke + gate it the same way before routing real traffic:

```bash
JAIS_BASE_URL=http://localhost:8000/v1  node ../evals/jais-smoke.js
JAIS_BASE_URL=http://localhost:8000/v1  node ../evals/run.js --provider jais
```

Jais is selectable explicitly (`provider:"jais"` or `MODEL_PROVIDER=jais`).
`auto` still prefers ALLaM for Arabic; set `ARABIC_PROVIDER=jais` to make `auto`
prefer Jais instead.

## A note on fine-tuning ("make Adel learn")

ALLaM is Apache-2.0, so a LoRA/QLoRA fine-tune is permitted and is a good later
step for Arabic aviation tone, the exact citation format, and refusal
discipline — seeded from the corpus + the eval set. It is **out of scope** for
this service: keep RAG as the source of truth for the facts. Fine-tuning shapes
*how* Adel speaks, not *what* regulation is true.
