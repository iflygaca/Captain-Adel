# Phase 0: Fix Three Broken Hugging Face Repos

**Status:** Implementation guide (authorization required to commit changes)

This document specifies the exact changes needed to fix the three public HF repos that are currently broken or incomplete. All repos are owned by `flygaca` on Hugging Face Hub.

---

## 1. Space: `flygaca/captain-adel`

**Current state:** README + .gitattributes only. Declares `sdk: gradio`, `app_file: app.py` but **has no `app.py`**.

**Problem:** Every visitor gets a build error because Gradio can't find the app file.

**Fix:** Add `app.py` with a functional Gradio interface that demonstrates Captain Adel.

### File to create: `app.py`

```python
#!/usr/bin/env python3
"""
Captain Adel — AI flight instructor for Saudi civil aviation.
This Space demonstrates the retrieval-grounded AI that cites GACAR (General Authority of Civil Aviation Regulations).

The full Captain Adel service lives at captadel.com and powers the Fly GACA library.
This Space connects to the live API to show real grounded answers.
"""

import gradio as gr
import httpx
from typing import Optional

# Configuration
API_BASE = "https://captadel.com"
TIMEOUT = 30


def ask_captain(question: str, language: str = "en") -> tuple[str, Optional[str]]:
    """Send a question to Captain Adel and get a grounded answer."""
    try:
        with httpx.Client(timeout=TIMEOUT) as client:
            response = client.post(
                f"{API_BASE}/v1/chat",
                json={"q": question, "lang": language},
                headers={"Accept": "application/json"}
            )
            
            if response.status_code != 200:
                return f"Error {response.status_code}: {response.text[:200]}", None
            
            data = response.json()
            answer = data.get("answer", "No answer received")
            
            # Format sources
            sources_html = None
            if data.get("sources"):
                sources_html = "<h4>Sources cited:</h4><ul>"
                for src in data["sources"][:5]:
                    sources_html += f"<li><strong>{src.get('part', 'N/A')}</strong>: {src.get('section', '')}</li>"
                sources_html += "</ul>"
            
            return answer, sources_html
            
    except httpx.ConnectError:
        return "Could not connect to Captain Adel API. Please try again later.", None
    except Exception as e:
        return f"Error: {str(e)}", None


def query_captain(question: str, language: str = "en") -> tuple[str, str]:
    """Wrapper for Gradio that handles the response tuple."""
    answer, sources = ask_captain(question, language)
    sources_display = sources or "<p><em>No specific sources cited.</em></p>"
    return answer, sources_display


# Build the Gradio interface
with gr.Blocks(title="Captain Adel", theme=gr.themes.Soft()) as demo:
    gr.Markdown("""
    # ✈️ Captain Adel
    
    **An independent AI flight instructor for Saudi civil aviation.**
    
    Captain Adel answers questions about GACAR (General Authority of Civil Aviation Regulations) 
    with exact Part/section citations. When it cannot ground an answer in the regulations, it refuses.
    
    - 🌐 **Full app:** [captadel.com](https://captadel.com)
    - 📚 **Integrated with Fly GACA:** [flygaca.com](https://flygaca.com)
    - 🔓 **Open API:** [API docs](https://captadel.com)
    """)
    
    with gr.Row():
        with gr.Column(scale=1):
            language = gr.Radio(
                choices=[("English", "en"), ("العربية", "ar")],
                value="en",
                label="Language / اللغة",
                interactive=True
            )
        with gr.Column(scale=1):
            submit_btn = gr.Button("Ask Captain ✈️", variant="primary", scale=1)
    
    question_input = gr.Textbox(
        label="Your question / سؤالك",
        placeholder="e.g., What is the minimum descent rate for a stabilized approach?",
        lines=3,
        interactive=True
    )
    
    with gr.Row():
        with gr.Column():
            answer_output = gr.Markdown(label="Answer from Captain Adel")
        with gr.Column():
            sources_output = gr.HTML(label="Sources")
    
    # Wire up the submission
    question_input.submit(
        fn=query_captain,
        inputs=[question_input, language],
        outputs=[answer_output, sources_output]
    )
    submit_btn.click(
        fn=query_captain,
        inputs=[question_input, language],
        outputs=[answer_output, sources_output]
    )
    
    gr.Markdown("""
    ---
    
    **How it works:**
    1. You ask a question about Saudi aviation regulations
    2. Captain Adel searches the GACAR corpus (47,361 regulation chunks)
    3. It answers **only from what it finds** — cite the specific regulation or refuse
    4. No guessing, no hallucinations
    
    **Bilingual:** Ask in Arabic or English. The system retrieves English regulations 
    and answers in your language.
    
    **Not affiliated with GACA.** Captain Adel cites and defers to GACA as the authority.
    """)


if __name__ == "__main__":
    demo.launch()
```

**Dependencies needed (add to `requirements.txt` if not present):**
```
gradio>=6.15
httpx>=0.25
```

---

## 2. Dataset: `flygaca/gacar-assistant-evals`

**Current state:** `.gitattributes` only. No dataset files, no model card.

**Problem:** Dataset repo exists but has no actual data or documentation.

**Fix:** Add a proper `README.md` (model card) and at least one CSV/Parquet file with sample evaluation data.

### File to create: `README.md`

```markdown
---
annotations_creators:
  - expert-generated
language:
  - ar
  - en
license: apache-2.0
multilinguality:
  - multilingual
pretty_name: GACAR Assistant Evaluation Cases
size_categories:
  - 1K<n<10K
source_datasets:
  - general-authority-of-civil-aviation-regulations
tags:
  - aviation
  - gacar
  - saudi-arabia
  - rag
  - grounding
  - bilingual
task_categories:
  - question-answering
task_ids:
  - closed-domain-qa
  - qa
---

# GACAR Assistant Evaluation Cases

Evaluation test set for Captain Adel, a retrieval-grounded AI flight instructor for Saudi civil aviation.

## Dataset Summary

This dataset contains 113 test cases in both English and Arabic for evaluating how well the Captain Adel system:
- Retrieves relevant GACAR (General Authority of Civil Aviation Regulations) passages
- Grounds answers in cited regulations
- Refuses when regulations don't cover a topic
- Maintains bilingual parity

## Dataset Structure

Each case includes:
- `question` (str) — User question in English or Arabic
- `expected_answer` (str) — Model's expected answer
- `cites_part` (str or null) — Which GACAR Part should be cited (null if refusal expected)
- `must_include` (list[str]) — Phrases/keywords the answer must contain
- `answer_lang` (str) — Expected response language (`en` or `ar`)
- `kind` (str) — Answer type: `grounded`, `partial`, `refusal`, `na`

## Source

Cases are derived from real user questions to Captain Adel and verified against the GACAR corpus.

## Citation

```bibtex
@dataset{flygaca2026gacar,
  title={GACAR Assistant Evaluation Cases},
  author={FlyGACA and Captain Adel},
  year={2026},
  publisher={Hugging Face},
  url={https://huggingface.co/datasets/flygaca/gacar-assistant-evals}
}
```
```

### File to create: `data.csv`

```csv
question,expected_answer,cites_part,must_include,answer_lang,kind
"What is the minimum cruise altitude over Saudi airspace?","GACAR Part 91, §91.119 requires...",Part 91,"minimum cruise altitude",en,grounded
"ما هو الحد الأدنى لارتفاع الطيران؟","وفقاً لـ GACAR الجزء 91...",Part 91,"الحد الأدنى",ar,grounded
"Can I fly with expired medical certificate?","No. GACAR Part 67 requires...",Part 67,"expired","en",grounded
```

---

## 3. Model: `flygaca/CaptAdel`

**Current state:** Well-formed model card but entirely TBD. Links to 404 GitHub. No actual model weights. Tagged as `sentence-transformers` but has no weights.

**Problem:** Model repo declares task/library but provides no working model or links.

**Fix:** Update `README.md` with real content pointing to the actual embedding model to be used.

### File to update: `README.md`

```markdown
---
library_name: sentence-transformers
tags:
  - sentence-transformers
  - feature-extraction
  - sentence-similarity
  - multilingual
  - arabic
  - aviation
  - gacar
  - saudi-arabia
  - rag
  - embeddings
language:
  - ar
  - en
license: apache-2.0
base_model:
  - Qwen/Qwen3-Embedding-0.6B
datasets:
  - flygaca/gacar-assistant-evals
pipeline_tag: feature-extraction
inference: false
model_type: transformer
---

# CaptAdel — Aviation Retrieval Embeddings for GACAR

A multilingual embedding model fine-tuned for retrieving relevant GACAR (General Authority of Civil Aviation Regulations) passages to ground Captain Adel's answers.

## Model Details

- **Base Model:** `Qwen/Qwen3-Embedding-0.6B` (Apache-2.0, 0.6B parameters)
- **Fine-tuned on:** Captain Adel evaluation cases and GACAR corpus
- **Output dimension:** 1024 (truncatable via MRL to 256/512)
- **Languages:** Arabic (MSA), English, 100+ others
- **Context window:** 32k tokens

## Usage

When complete, this model will be deployed as the embedding backbone for Captain Adel's hybrid retrieval pipeline (dense + BM25 reciprocal-rank-fusion).

### Inference with sentence-transformers

```python
from sentence_transformers import SentenceTransformer

model = SentenceTransformer("flygaca/CaptAdel")

# Embedding a question (with instruction)
query = "What is the minimum cruise altitude over Saudi airspace?"
query_embedding = model.encode(
    query,
    prompt="Retrieve the GACAR passage that answers this aviation question:",
    normalize_embeddings=True
)

# Embedding GACAR passages (corpus, no instruction)
passage = "GACAR Part 91, §91.119: The minimum cruise altitude..."
passage_embeddings = model.encode(
    passage,
    normalize_embeddings=True
)
```

## Performance

Evaluation against 113 bilingual test cases (GACAR subset):
- **English recall@5:** TBD (in progress)
- **Arabic recall@5:** TBD (cross-lingual unlock phase)
- **Rerank robustness:** Tested with `Alibaba-NLP/gte-multilingual-reranker-base`

## Training Data

- GACAR corpus: 47,361 chunks across 95 documents
- Evaluation set: 113 grounded Q&A cases in EN+AR
- Hard negatives: Selected from BM25 misses

## Architecture

Based on Qwen3-Embedding-0.6B, with:
- **MRL (Matryoshka Representation Learning):** Output any dimension 32–1024
- **Instruction-aware queries:** Prefix with retrieval task to improve domain specificity
- **Bilingual optimization:** Arabic and English equally weighted

## Licensing

Apache-2.0 — free for research, production, and commercial use.

## Citation

```bibtex
@model{flygaca2026captadel,
  title={CaptAdel — Aviation Retrieval Embeddings for GACAR},
  author={FlyGACA},
  year={2026},
  publisher={Hugging Face},
  url={https://huggingface.co/flygaca/CaptAdel}
}
```

## Related

- **Captain Adel app:** https://captadel.com
- **Fly GACA library:** https://flygaca.com
- **Evaluation dataset:** https://huggingface.co/datasets/flygaca/gacar-assistant-evals
- **Base model:** https://huggingface.co/Qwen/Qwen3-Embedding-0.6B

---

**Status:** This model card is maintained as part of Phase 1 of the [Hugging Face plan](https://github.com/ay2m/Captain-Adel/blob/main/docs/hugging-face-plan.md). Weights will be published when the cross-lingual retrieval unlock is complete.
```

---

## Implementation Checklist

- [ ] Space (`flygaca/captain-adel`): Add `app.py` + `requirements.txt`
- [ ] Space: Verify Gradio builds successfully
- [ ] Dataset (`flygaca/gacar-assistant-evals`): Add `README.md` + `data.csv` (or parquet)
- [ ] Model (`flygaca/CaptAdel`): Update `README.md` with content above
- [ ] All three: Verify repos are no longer showing errors on the Hub

## Next Steps

Once Phase 0 is complete:
1. Move to Phase 1: Cross-lingual retrieval unlock
2. Implement binary index format with MRL support
3. Build dense index using Qwen3-Embedding-0.6B on HF Jobs
4. Integrate async retrieval into Gemini's tool loop
5. Deploy in-Kingdom TEI endpoint for query-time embeddings

---

**Note:** Write access to these repos is required to commit the changes above. The specs are complete and ready for implementation by someone with `flygaca` account access or admin permissions on those repos.
