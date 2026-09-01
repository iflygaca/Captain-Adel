<div align="center">

# ✍️ Captain Adel — Authoring & Persona Architecture
### The Source of Truth for Prompt Engineering, Knowledge Scope & Agent Behavior
#### هندسة التوجيهات · شخصية كابتن عادل · نطاق المعرفة واللوائح

<p align="center">
  <img src="https://img.shields.io/badge/Made%20in-Saudi%20Arabia-006C35?style=for-the-badge&labelColor=0a0e12" alt="صنع في السعودية" />
  <img src="https://img.shields.io/badge/Persona-Captain%20Adel-C8A04A?style=for-the-badge&labelColor=0a0e12" alt="Captain Adel" />
  <img src="https://img.shields.io/badge/Corpus-74%20GACAR%20Parts-0D96F6?style=for-the-badge&labelColor=0a0e12" alt="74 GACAR Parts" />
  <img src="https://img.shields.io/badge/Language-Bilingual%20Prompting-8E75B2?style=for-the-badge&labelColor=0a0e12" alt="Bilingual" />
</p>

</div>

---

## 🧭 Purpose & Architecture

The `authoring/` directory represents the **human-authored source of truth** for Captain Adel's identity, system prompt instructions, knowledge-base boundaries, and reference agent loops.

It maintains the canonical definition of how Captain Adel behaves, reasons, cites, and refuses before those rules are compiled into the production Node.js service (`src/brain/system-prompt.js` and `tenants.js`).

```
┌──────────────────────────────────────────────┐
│           authoring/ (Source of Truth)       │
├──────────────────────────────────────────────┤
│ • captain_adel_system_prompt.md              │
│ • knowledge_base_scope.md                    │
│ • rag.py (Reference Python BM25)             │
│ • captain_adel.py (Single-file Agent Loop)   │
└──────────────────────┬───────────────────────┘
                       │ Synchronized with
                       ▼
┌──────────────────────────────────────────────┐
│          src/brain/ (Production Engine)      │
├──────────────────────────────────────────────┤
│ • system-prompt.js                           │
│ • bm25.js & retrieve.js                      │
│ • grounding.js & router.js                   │
└──────────────────────────────────────────────┘
```

---

## 📂 Core Files & Specifications

| File | Purpose | Key Responsibilities |
|:---|:---|:---|
| **[`captain_adel_system_prompt.md`](./captain_adel_system_prompt.md)** | Canonical System Prompt | Defines the instructor persona, formatting rules, mandatory citation structure, refusal criteria, and bilingual behavior. |
| **[`knowledge_base_scope.md`](./knowledge_base_scope.md)** | Corpus Boundaries | Exhaustive list of included GACAR Parts, advisory circulars, and handbooks, as well as explicitly excluded domains. |
| **[`rag.py`](./rag.py)** | Python BM25 Retriever | Reference Python implementation of the BM25 retrieval engine, mirroring `src/brain/bm25.js`. |
| **[`captain_adel.py`](./captain_adel.py)** | CLI Prototype | Standalone Python terminal loop demonstrating Gemini function calling over `rag.py`. |

---

## 👨‍✈️ Persona & Grounding Principles

Captain Adel is designed around 5 core operational doctrines:

1. **The Flight Instructor Tone:** Calm, authoritative, concise, and pedagogical. Answers speak directly to student pilots, commercial pilots, and flight instructors.
2. **Mandatory Citations:** Every assertion must reference the exact GACAR Part and section (e.g. `GACAR Part 91, §91.155`). Unsubstantiated claims are strictly prohibited.
3. **Active Refusals:** When a regulatory topic is outside the 74 GACAR Parts or unverified in the retrieved passages, Captain Adel explicitly states: *"I cannot find this in official GACAR regulations"* rather than guessing.
4. **POH/AFM Boundary:** Never substitutes for an aircraft-specific Pilot's Operating Handbook or Airplane Flight Manual (e.g. Cessna 172 rotation speed, Boeing 737 flap limits).
5. **GACA Deference:** Always reinforces that GACA ([gaca.gov.sa](https://gaca.gov.sa)) is the sole regulatory authority in the Kingdom of Saudi Arabia.

---

## 📚 Knowledge Base Scope & Boundaries

### In Scope (Grounded Corpus)
- **All 74 GACAR Parts** (General Authority of Civil Aviation Regulations).
- **Saudi AIP (Aeronautical Information Publication)** — Airspace classification, aerodrome data, transition altitudes.
- **Aeronautical Information Manual (AIM)** — Flight principles, navigation aids, and standard phraseology.
- **GACA Advisory Circulars (ACs)** — Approved training standards and guidance materials.

### Deliberately Out of Scope
- **Live NOTAMs & Weather:** Pilots are instructed to consult official AIS and Saudi meteorology channels.
- **Specific Aircraft V-speeds & Weights:** Instructs pilots to consult the specific POH/AFM.
- **Non-Aviation Queries:** Direct refusals for political, financial, or general trivia questions.

---

## 🐍 Running the Reference Python Prototype

The Python prototype allows researchers and prompt engineers to experiment with system instructions without running the full Node.js web server.

### 1. Setup Python Environment
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install google-genai rank-bm25
```

### 2. Run Interactive Terminal Session
```bash
export GEMINI_API_KEY="your_api_key_here"
python captain_adel.py
```

---

<div align="center">

<sub>🇸🇦 صنع في السعودية · Made in Saudi Arabia</sub>

</div>
