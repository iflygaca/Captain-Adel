"""
Python BM25 retriever over the same corpus the production Cloud Function
serves — lets the prototype Captain Adel agent (captain_adel.py) cite real
GACAR sections instead of hard-coded fixtures.

Loads src/brain/_chunks.json.gz (the corpus the deployed brain serves) and the
precomputed _index.json.gz if present. Mirrors the algorithm in src/brain/bm25.js
so the Python and JS retrievers return matching results for the same query.
"""

from __future__ import annotations

import gzip
import json
import math
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent  # repo root (authoring/ -> ..)
CHUNKS_PATH = ROOT / "src" / "brain" / "_chunks.json.gz"
INDEX_PATH = ROOT / "src" / "brain" / "_index.json.gz"

# Mirror the stopword sets from functions/rag/bm25.js so tokenization stays
# consistent across the JS and Python retrievers.
_EN_STOPWORDS = """
a an the and or but of for on in to from by at as is are was were be been being
this that these those it its they them there their this which who whom whose
have has had do does did will would shall should may might can could must
not no nor yes if then so because while when where why how about into onto
upon over under above below between within without through with against
i you he she we us our your his her my mine ours yours hers theirs himself
herself ourselves yourselves themselves itself than just very also too only
any all some each every both either neither one ones up down out off
""".split()

_AR_STOPWORDS = """
في من الى على عن مع هو هي هم هن نحن انت انتم انا انت كان كانت ما لا
لم لن قد لقد ثم او ام او ل ب ك حتى لكن ايضا فقط بعض كل بعد قبل
الى بين تحت فوق هذا هذه هذان هاتان هؤلاء ذلك تلك اولئك الذي التي الذين
اللاتي التي اللاتي هل اين كيف ماذا متى لماذا
""".split()

# Arabic normalization — fold orthographic variants so a query and the corpus
# match regardless of spelling. Mirrors normalizeArabic() in
# src/brain/bm25.js in the standalone FlyGACA/Captain-Adel repo
# (github.com/FlyGACA/Captain-Adel) (and functions/rag/bm25.js); applied symmetrically
# in tokenize(), so it needs no corpus rebuild. ASCII text is untouched.
_AR_TASHKEEL = re.compile(r"[ً-ٰٟ]")  # diacritics + superscript alef
_AR_FOLDS = [
    ("ـ", ""),                                   # tatweel
    ("آ", "ا"), ("أ", "ا"),       # آ أ → ا
    ("إ", "ا"), ("ٱ", "ا"),       # إ ٱ → ا
    ("ى", "ي"),                             # ى → ي
    ("ة", "ه"),                             # ة → ه
    ("ؤ", "و"),                             # ؤ → و
    ("ئ", "ي"),                             # ئ → ي
    ("ء", ""),                                   # bare hamza ء → removed
]


def _normalize_arabic(s: str) -> str:
    s = _AR_TASHKEEL.sub("", s)
    for src, dst in _AR_FOLDS:
        s = s.replace(src, dst)
    return s


# Stopwords are matched on the normalized token, so fold the sets too.
STOPWORDS = {_normalize_arabic(w) for w in (set(_EN_STOPWORDS) | set(_AR_STOPWORDS))}

# Aviation-domain synonym expansion — copied verbatim from bm25.js so a query
# like "drone" still hits "unmanned aircraft" chunks.
SYNONYMS: dict[str, list[str]] = {
    "drone":   ["drone", "unmanned", "uas"],
    "drones":  ["drones", "unmanned", "uas"],
    "uav":     ["uav", "unmanned", "uas"],
    "atpl":    ["atpl", "airline", "transport", "pilot"],
    "cpl":     ["cpl", "commercial"],
    "ppl":     ["ppl", "private"],
    "cfi":     ["cfi", "instructor", "flight"],
    "cfii":    ["cfii", "instrument", "instructor"],
    "me":      ["me", "multi", "engine", "multi-engine"],
    "medical": ["medical", "medicals"],
    "rvsm":    ["rvsm", "reduced", "vertical", "separation"],
    "fuel":    ["fuel", "reserve", "reserves"],
    "aoc":     ["aoc", "operator", "certificate"],
    "mel":     ["mel", "minimum", "equipment", "list"],
    "ifr":     ["ifr", "instrument"],
    "vfr":     ["vfr", "visual"],
    "notam":   ["notam", "notams"],
    "metar":   ["metar", "taf", "weather"],
}

# Split on anything that isn't a Unicode letter, digit, §, or '.'.
# Python 3 \w is already Unicode-aware (covers Arabic too); it does include '_'
# which the JS regex doesn't, but underscores are vanishingly rare in the
# regulatory corpus so the tokenization stays effectively identical.
_TOKEN_SPLIT = re.compile(r"[^\w§.]+", re.UNICODE)


def tokenize(text: str | None) -> list[str]:
    if not text:
        return []
    lower = _normalize_arabic(text.lower())
    out: list[str] = []
    for tok in _TOKEN_SPLIT.split(lower):
        if not tok or tok in STOPWORDS:
            continue
        tok = tok.strip(".")
        if tok:
            out.append(tok)
    return out


def expand_query(tokens: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for t in tokens:
        for v in SYNONYMS.get(t, [t]):
            if v not in seen:
                seen.add(v)
                out.append(v)
    return out


# ────────────────────────────────────────────────────────────────────────
# Index loading — prefer the precomputed _index.json.gz; fall back to
# building from chunks at first call if it's missing.
# ────────────────────────────────────────────────────────────────────────


def _load_gz_json(path: Path) -> Any:
    return json.loads(gzip.decompress(path.read_bytes()))


def _deserialize_index(obj: dict) -> dict:
    if obj.get("v") != 1:
        raise ValueError(f"Unsupported index version: {obj.get('v')!r}")
    postings: dict[str, dict[int, int]] = {}
    idf: dict[str, float] = {}
    terms: list[str] = obj["terms"]
    raw_postings: list[list[int]] = obj["postings"]
    raw_idf: list[float] = obj["idf"]
    for term, flat, term_idf in zip(terms, raw_postings, raw_idf):
        # flat is [docIdx, tf, docIdx, tf, ...]
        postings[term] = dict(zip(flat[0::2], flat[1::2]))
        idf[term] = term_idf
    return {
        "N": obj["N"],
        "k1": obj["k1"],
        "b": obj["b"],
        "avgdl": obj["avgdl"],
        "docLen": obj["docLen"],
        "postings": postings,
        "idf": idf,
    }


def _build_index(chunks: list[dict], k1: float = 1.5, b: float = 0.75) -> dict:
    """Fallback when no precomputed index is present. ~1-3 s on 30k chunks."""
    n = len(chunks)
    doc_len = [0] * n
    postings: dict[str, dict[int, int]] = {}
    total_len = 0
    for d, c in enumerate(chunks):
        text = " ".join((c.get("t") or "", c.get("st") or "", c.get("dt") or "", c.get("db") or ""))
        toks = tokenize(text)
        doc_len[d] = len(toks)
        total_len += len(toks)
        tf: dict[str, int] = {}
        for tok in toks:
            tf[tok] = tf.get(tok, 0) + 1
        for tok, count in tf.items():
            postings.setdefault(tok, {})[d] = count
    avgdl = total_len / max(1, n)
    idf: dict[str, float] = {}
    for tok, posting in postings.items():
        n_t = len(posting)
        idf[tok] = math.log(1 + (n - n_t + 0.5) / (n_t + 0.5))
    return {"N": n, "k1": k1, "b": b, "avgdl": avgdl, "docLen": doc_len, "postings": postings, "idf": idf}


_state: dict | None = None


def _load() -> dict:
    """Load corpus + index once, memoized for the process lifetime."""
    global _state
    if _state is not None:
        return _state
    if not CHUNKS_PATH.exists():
        raise FileNotFoundError(
            f"Corpus not found at {CHUNKS_PATH}. "
            f"Expected the deployed brain's corpus at src/brain/_chunks.json.gz."
        )
    corpus = _load_gz_json(CHUNKS_PATH)
    chunks: list[dict] = corpus["chunks"]
    docs: list[dict] = corpus["docs"]
    if INDEX_PATH.exists():
        idx = _deserialize_index(_load_gz_json(INDEX_PATH))
    else:
        idx = _build_index(chunks)
    # Index by (slug, section_id) so lookup_section is O(1) per call.
    by_section: dict[tuple[str, str], list[int]] = {}
    for i, c in enumerate(chunks):
        by_section.setdefault((c.get("ds") or "", c.get("si") or ""), []).append(i)
    _state = {"chunks": chunks, "docs": docs, "idx": idx, "by_section": by_section}
    return _state


# ────────────────────────────────────────────────────────────────────────
# BM25 search + boosts — direct port of search() / topChunks() in bm25.js
# ────────────────────────────────────────────────────────────────────────


_REF_RE = re.compile(r"§\s*\d+\.\d+(?:\.\d+)?")
_PART_RE = re.compile(r"\bpart\s+(\d+)\b", re.IGNORECASE)


def _bm25_search(idx: dict, chunks: list[dict], query: str, top_k: int) -> list[tuple[int, float]]:
    q_tokens = tokenize(query)
    expanded = expand_query(q_tokens)
    if not expanded:
        return []

    ref_match = _REF_RE.search(query)
    wanted_ref = re.sub(r"\s+", "", ref_match.group(0)).lower() if ref_match else None
    part_match = _PART_RE.search(query)
    wanted_part = part_match.group(1) if part_match else None
    orig_set = set(q_tokens)

    postings = idx["postings"]
    idf_map = idx["idf"]
    doc_len = idx["docLen"]
    avgdl = idx["avgdl"] or 1.0
    k1 = idx["k1"]
    b = idx["b"]

    scores: dict[int, float] = {}
    for tok in expanded:
        posting = postings.get(tok)
        if not posting:
            continue
        idf_t = idf_map[tok]
        for d, tf in posting.items():
            dl = doc_len[d]
            denom = tf + k1 * (1 - b + b * dl / avgdl)
            scores[d] = scores.get(d, 0.0) + idf_t * (tf * (k1 + 1)) / denom

    # Wider candidate pool, then re-rank with section/part/title boosts.
    candidates = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)[: top_k * 6]
    boosted: list[tuple[int, float]] = []
    for d, s in candidates:
        c = chunks[d]
        boost = 1.0
        if wanted_ref:
            ref = re.sub(r"\s+", "", c.get("gr") or "").lower()
            if ref and ref == wanted_ref:
                boost *= 1.7
        if wanted_part:
            badge = (c.get("db") or "").lower()
            if f"part {wanted_part}" in badge:
                boost *= 1.4
        stitle = (c.get("st") or "").lower()
        title_hits = sum(1 for t in orig_set if len(t) >= 3 and t in stitle)
        if title_hits:
            boost *= 1 + 0.25 * title_hits
        boosted.append((d, s * boost))
    boosted.sort(key=lambda kv: kv[1], reverse=True)
    return boosted[:top_k]


# ────────────────────────────────────────────────────────────────────────
# Public API — formats results so captain_adel.py can hand them back to
# Gemini's function-calling layer with stable field names.
# ────────────────────────────────────────────────────────────────────────


def _citation(c: dict) -> str:
    """Best-effort human citation: 'GACAR Part 91, §91.155' or fall back."""
    badge = c.get("db") or ""
    ref = c.get("gr") or ""
    if badge and ref:
        return f"GACAR {badge.title()}, {ref}"
    if ref:
        return ref
    sec = c.get("st") or ""
    title = c.get("dt") or ""
    return f"{title} — {sec}".strip(" —") if sec else title


def _page_url(c: dict) -> str:
    """Deeplink the SPA reader if we have a section id, else fall back to PDF."""
    html = c.get("ht") or ""
    sec = c.get("si") or ""
    if html and sec:
        return f"{html}#{sec}"
    pdf = c.get("pd") or ""
    page = c.get("pg")
    if pdf and page:
        return f"library/PDFs/{pdf}#page={page}"
    return f"library/PDFs/{pdf}" if pdf else ""


def _format_hit(c: dict) -> dict:
    return {
        "citation": _citation(c),
        "text": c.get("t") or "",
        "page_url": _page_url(c),
        "section_title": c.get("st") or "",
        "page": c.get("pg"),
        "doc_badge": c.get("db") or "",
    }


def search_library(query: str, top_k: int = 6, filter_part: str | None = None) -> list[dict]:
    """Top-k BM25 hits over the whole corpus, optionally scoped to a Part.

    Hits are deduplicated by (doc, section): section text is sliced into
    multiple overlapping chunks at index-build time, so the same section can
    otherwise dominate the top results.
    """
    s = _load()
    chunks = s["chunks"]
    # Wider pool covers both section dedup and Part filtering shrinkage.
    pool_k = top_k * 6
    hits = _bm25_search(s["idx"], chunks, query, pool_k)
    out: list[dict] = []
    seen_sections: set[tuple[str, str]] = set()
    for d, _ in hits:
        c = chunks[d]
        if filter_part:
            badge = (c.get("db") or "").lower()
            if f"part {filter_part.lower()}" not in badge:
                continue
        key = (c.get("ds") or "", c.get("si") or "")
        if key in seen_sections:
            continue
        seen_sections.add(key)
        out.append(_format_hit(c))
        if len(out) >= top_k:
            break
    return out


def lookup_citation(part: str, section: str) -> dict:
    """Exact-section lookup. Section may be '91.155' or '§91.155' or '91.155(a)'."""
    s = _load()
    # Normalize the user-supplied section to the form stored in chunk['gr'].
    sec_norm = re.sub(r"\s+", "", section).lstrip("§").lower()
    sec_root = re.sub(r"\([^)]*\)$", "", sec_norm)  # drop trailing (a), (b)…
    part_token = f"part {part.lower()}"

    matches: list[dict] = []
    for c in s["chunks"]:
        badge = (c.get("db") or "").lower()
        if part_token not in badge:
            continue
        ref = re.sub(r"\s+", "", c.get("gr") or "").lstrip("§").lower()
        if not ref:
            continue
        if ref == sec_norm or ref == sec_root or ref.startswith(sec_root + "("):
            matches.append(c)

    if not matches:
        return {
            "citation": f"GACAR Part {part}, §{section}",
            "text": "",
            "page_url": "",
            "found": False,
        }
    # Concatenate text from all chunks in the same section so the agent sees
    # the full passage, not just the first ~800 chars.
    full = "\n\n".join(c.get("t") or "" for c in matches)
    head = matches[0]
    return {
        "citation": _citation(head),
        "text": full,
        "page_url": _page_url(head),
        "section_title": head.get("st") or "",
        "page": head.get("pg"),
        "found": True,
    }


# A change-history section title is a date only when it parses as one —
# otherwise it's a §-ref or topic header carried over from chunking. Match
# either "(16 FEB 2026)" or "16/06/2024" / "16-06-2024" / etc.
_DATE_TITLE_RE = re.compile(r"\(?\s*\d{1,2}[\s/\-][A-Za-z0-9]{2,4}[\s/\-]\d{2,4}\s*\)?")
# Inline dates anywhere in the chunk text — used as a fallback when the
# section title isn't itself a date.
_INLINE_DATE_RE = re.compile(r"\b\d{1,2}/\d{1,2}/\d{2,4}\b")


def list_changes(part: str, since_version: str | None = None) -> list[dict]:
    """Return Change_History entries that mention the given Part.

    Each entry has version (e.g. 'v104'), an effective_date if one can be
    parsed out of the section header or chunk body, the chunk text as
    summary, and a deeplink. Returns [] if the requested Part wasn't
    touched in the available change-history doc.
    """
    s = _load()
    needle = f"part {part.lower()}"
    out: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for c in s["chunks"]:
        slug = (c.get("ds") or "").lower()
        if not slug.startswith("change-history"):
            continue
        text = (c.get("t") or "")
        if needle not in text.lower():
            continue
        sec_title = c.get("st") or ""
        date_match = _DATE_TITLE_RE.search(sec_title) or _INLINE_DATE_RE.search(text)
        version_match = re.search(r"\(v(\d+)\)", c.get("dt") or "")
        version = f"v{version_match.group(1)}" if version_match else ""
        if since_version and version and version <= since_version:
            continue
        # Dedupe on (section, first 80 chars) so we don't return overlapping
        # slices of the same passage as separate entries.
        key = (c.get("si") or "", text[:80])
        if key in seen:
            continue
        seen.add(key)
        out.append({
            "version": version,
            "effective_date": date_match.group(0).strip("() ") if date_match else None,
            "section_context": sec_title,
            "summary": text,
            "page_url": _page_url(c),
        })
    return out
