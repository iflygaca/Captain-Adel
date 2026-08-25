# authoring/

Human-authored **source of truth** for Captain Adel's persona, system prompt and
knowledge-base scope, plus a small Python reference prototype. Moved here from the
Fly GACA repo (`flygaca/assistant/`) so the authoring source lives in the same
repo as the deployed brain (`src/brain/system-prompt.js`, `tenants.js`).

| File | Role |
|---|---|
| `captain_adel_system_prompt.md` | The system instruction — source of truth. Keep `src/brain/system-prompt.js` in step with it. Conservative, always cites sources, defers to GACA as the sole authority, refuses to substitute for a POH/AFM. |
| `knowledge_base_scope.md` | Defines the corpus bounds (which GACAR Parts / handbooks are in scope) and what is deliberately out of scope (live NOTAMs/weather). |
| `rag.py` | Python BM25 retriever — a reference twin of `src/brain/bm25.js`, used by the `captain_adel.py` prototype to cite real GACAR sections. |
| `captain_adel.py` | Single-file terminal prototype of the agent loop (Gemini + the three function-calling tools over `rag.py`). |

> **Note on the Python prototype paths.** `rag.py` / `captain_adel.py` were written
> against the original Fly GACA layout — `rag.py` loads the corpus from
> `functions/rag/_chunks.json.gz` and reads the prompt from a sibling
> `captain_adel_system_prompt.md`. In this repo the corpus lives at
> `src/brain/_chunks.json.gz`; adjust `CHUNKS_PATH` / `INDEX_PATH` in `rag.py`
> before running the prototype here. These files are **reference**, not part of the
> deployed Node service.

The brand/character art stays in the Fly GACA product repo as Fly GACA branding — today that is
[`ay2m/FlyGACA`](https://github.com/ay2m/FlyGACA) under `public/img/captain/` (avatars, poses and
the `scenes/` set). The `flygaca/assistant/` path this file used to name is from the original
pre-rebuild layout and no longer exists.
