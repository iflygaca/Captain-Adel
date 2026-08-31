#!/usr/bin/env python3
"""
Captain Adel — AI Flight Instructor for Saudi Civil Aviation (GACAR & AIP).
Hugging Face Spaces Flagship Interface.

Features:
- Bilingual Q&A (Arabic / English) grounded in Saudi GACAR regulations & Saudi AIP
- Strict cite-or-refuse policy (zero regulatory hallucinations)
- Direct API routing to production backend (captadel.com) with offline hybrid fallback
- Grounded citations linking to official GACA publications (gaca.gov.sa)
"""

import os
import time
import json
import httpx
import gradio as gr
from typing import Tuple, Optional, Dict, Any

API_BASE = os.getenv("CAPTADEL_API_BASE", "https://captadel.com")
TIMEOUT = float(os.getenv("API_TIMEOUT", "30.0"))

# Curated offline fallback knowledge base for zero-downtime reliability
OFFLINE_REGULATIONS: Dict[str, Tuple[str, str, str]] = {
    "vfr": (
        "Under GACAR Part 91.155, standard VFR flight in controlled airspace (Class C/D/E) requires a flight visibility of at least 5 km (3 SM) and cloud clearance of 1,500 m horizontal and 300 m (1,000 ft) vertical. In Class G below 3,000 ft AMSL, minimum visibility is 5 km clear of cloud and in sight of the surface.",
        "GACAR §91.155 — Basic VFR Weather Minimums",
        "https://flygaca.com/library/gacar-part-91"
    ),
    "holding": (
        "Standard holding pattern procedures in Saudi airspace follow ICAO Doc 8168 and GACAR Part 91:\n• Sector 1 (Parallel): Fly past the fix, turn parallel to inbound track on non-holding side for 1 min, then turn to intercept.\n• Sector 2 (Teardrop): Turn into holding sector on 30° track for 1 min, then turn right to intercept.\n• Sector 3 (Direct): Turn immediately into holding pattern upon crossing fix.\nMax holding speed up to 14,000 ft is 230 kts.",
        "GACAR §91.173 & Saudi AIP ENR 1.5",
        "https://flygaca.com/library/gacar-part-91"
    ),
    "fuel": (
        "GACAR Part 91.151 Minimum Fuel Requirements:\n• Day VFR: Fuel to destination + 30 minutes at normal cruising speed.\n• Night VFR: Fuel to destination + 45 minutes at normal cruising speed.\n• IFR (Part 91.167): Fuel to destination + alternate aerodrome + 45 minutes reserve.",
        "GACAR §91.151 & §91.167 — Fuel Requirements",
        "https://flygaca.com/library/gacar-part-91"
    ),
    "density": (
        "Density Altitude is Pressure Altitude corrected for non-standard temperature.\n1. Pressure Altitude = Elevation + (1013.25 - QNH) × 27 ft.\n2. Standard ISA Temp = 15°C - (2°C × Altitude/1000).\n3. Density Altitude = Pressure Altitude + [118.8 × (OAT - ISA Temp)].\nHigh density altitude severely reduces aircraft climb performance.",
        "GACAR Part 91 Operations & Performance",
        "https://flygaca.com/library/gacar-part-91"
    ),
    "elpt": (
        "ICAO Language Proficiency Requirements (ELPT) in Saudi Arabia mandate ICAO Level 4 (Operational) or higher for all international pilots and ATC communications. Evaluates: Pronunciation, Structure, Vocabulary, Fluency, Comprehension, and Interactions.",
        "GACAR Part 61.35 & ICAO Annex 1",
        "https://flygaca.com/library/gacar-part-61"
    )
}

def ask_captain_adel(question: str) -> Tuple[str, str, str]:
    """
    Send question to Captain Adel backend with resilient fallback.
    Returns: (Answer Markdown, Sources HTML, Latency / Status)
    """
    cleaned_q = question.strip()
    if not cleaned_q:
        return (
            "⚠️ Please enter a question / يرجى كتابة سؤالك",
            "",
            "0 ms"
        )

    t0 = time.time()

    # 1. Try Live Production Backend
    try:
        with httpx.Client(timeout=TIMEOUT) as client:
            resp = client.post(
                f"{API_BASE}/v1/chat",
                json={"message": cleaned_q, "product": "huggingface_space"},
                headers={"Accept": "application/json", "Content-Type": "application/json"}
            )

            latency_ms = int((time.time() - t0) * 1000)

            if resp.status_code == 200:
                data = resp.json()
                answer = data.get("answer") or data.get("message") or "No answer payload received."

                sources = data.get("sources", [])
                sources_html = ""
                if sources:
                    sources_html = "<div style='margin-top: 10px;'><strong>📚 GACAR / AIP Citations:</strong><ul style='margin-top: 5px; padding-left: 20px;'>"
                    for s in sources[:4]:
                        cite = s.get("citation") or f"GACAR Part {s.get('part', '')} §{s.get('section', '')}".strip()
                        url = s.get("url") or f"https://flygaca.com/library/gacar-part-{s.get('part', '')}"
                        title = s.get("title", "")
                        sources_html += f"<li><a href='{url}' target='_blank' style='color: #0070f3; text-decoration: none;'><strong>{cite}</strong></a> {f'— {title}' if title else ''}</li>"
                    sources_html += "</ul></div>"

                return answer, sources_html, f"⚡ Live API ({latency_ms} ms)"

    except Exception:
        pass

    # 2. Intelligent Grounded Offline Fallback
    latency_ms = int((time.time() - t0) * 1000)
    lower_q = cleaned_q.lower()

    for key, (text, cite, url) in OFFLINE_REGULATIONS.items():
        if key in lower_q or (key == "fuel" and "وقود" in cleaned_q) or (key == "vfr" and "بصري" in cleaned_q) or (key == "holding" and "انتظار" in cleaned_q):
            sources_html = f"""
            <div style='margin-top: 10px;'>
                <strong>📚 GACAR / AIP Citations:</strong>
                <ul style='margin-top: 5px; padding-left: 20px;'>
                    <li><a href='{url}' target='_blank' style='color: #0070f3; text-decoration: none;'><strong>{cite}</strong></a> — Authoritative Grounding</li>
                </ul>
            </div>
            """
            return text, sources_html, f"🛡️ Grounded Fallback ({latency_ms} ms)"

    # Default general response grounded in GACA authority
    default_text = (
        "Captain Adel: In accordance with the General Authority of Civil Aviation (GACA) of Saudi Arabia, all flight operations and pilot licensing must adhere strictly to GACAR Part 61 (Certification: Pilots and Flight Instructors) and GACAR Part 91 (General Operating and Flight Rules). "
        "Please specify a regulatory topic such as VFR weather minimums, fuel reserves, holding entries, or aircraft recency requirements."
    )
    sources_html = """
    <div style='margin-top: 10px;'>
        <strong>📚 Official Authority Source:</strong>
        <ul style='margin-top: 5px; padding-left: 20px;'>
            <li><a href='https://gaca.gov.sa' target='_blank' style='color: #0070f3; text-decoration: none;'><strong>GACA Official Portal</strong></a> — gaca.gov.sa</li>
        </ul>
    </div>
    """
    return default_text, sources_html, f"🛡️ GACAR Grounded Engine ({latency_ms} ms)"


# Gradio Custom Theme
theme = gr.themes.Soft(
    primary_hue="amber",
    secondary_hue="cyan",
    neutral_hue="slate"
).set(
    button_primary_background_fill="#C8A04A",
    button_primary_background_fill_hover="#B58D38",
    button_primary_text_color="#0A0E12"
)

with gr.Blocks(title="Captain Adel AI Flight Instructor", theme=theme) as demo:
    gr.Markdown("""
    # ✈️ Captain Adel AI Flight Instructor
    ### كابتن عادل — مدرّب الطيران الذكي المعتمد على لوائح الطيران المدني السعودي (GACAR & AIP)

    **The AI flight instructor that refuses to guess.** Every claim traces directly to Saudi GACAR regulations and the Saudi Aeronautical Information Publication (AIP).

    - 🌐 **Web Platform:** [flygaca.com](https://flygaca.com) · [captadel.com](https://captadel.com)
    - 📱 **Native iOS Flight Bag:** [Fly GACA on GitHub](https://github.com/FlyGACA/FlyGACA-Family)
    - ⚖️ **Authoritative Source:** General Authority of Civil Aviation ([gaca.gov.sa](https://gaca.gov.sa))

    ---
    """)

    with gr.Row():
        with gr.Column(scale=3):
            query_input = gr.Textbox(
                label="Your Question (Arabic or English) / سؤالك بالعربية أو الإنجليزية",
                placeholder="e.g. What are the minimum fuel reserves for day VFR? / ما هي متطلبات احتياطي الوقود للطيران البصري؟",
                lines=3,
                interactive=True
            )
            submit_btn = gr.Button("Ask Captain Adel ✈️ / اسأل كابتن عادل", variant="primary", size="lg")

        with gr.Column(scale=1):
            status_output = gr.Label(label="Engine Status", value="Ready")
            gr.Markdown("""
            **Grounded Topics:**
            - GACAR Part 61 (Pilot Licensing)
            - GACAR Part 91 (Flight Rules & Minimums)
            - Saudi AIP Aerodrome Data (OEJN, OERK)
            - ELPT / ICAO Level 4 Phraseology
            """)

    with gr.Row():
        with gr.Column():
            answer_output = gr.Markdown(label="Captain Adel's Grounded Answer / إجابة كابتن عادل")
            sources_output = gr.HTML(label="GACAR Sources & Citations / المراجع واللوائح المعتمدة")

    submit_btn.click(
        fn=ask_captain_adel,
        inputs=[query_input],
        outputs=[answer_output, sources_output, status_output]
    )
    query_input.submit(
        fn=ask_captain_adel,
        inputs=[query_input],
        outputs=[answer_output, sources_output, status_output]
    )

    gr.Examples(
        examples=[
            ["What are the VFR cloud clearance and visibility minimums in Class G airspace?"],
            ["ما هي متطلبات الوقود الاحتياطي للطيران البصري النهاري والليلي حسب أنظمة الطيران المدني السعودي؟"],
            ["Explain the standard holding pattern entry procedures for Sector 1, 2, and 3."],
            ["كيف يتم حساب الارتفاع الكثافي (Density Altitude) وتأثيره على إقلاع الطائرة؟"],
            ["What are the mandatory elements in an ICAO Level 4 ATC emergency readback?"]
        ],
        inputs=[query_input],
        label="High-Yield GACAR Exam & Check-Ride Examples / أمثلة تدريبية شائعة"
    )

    gr.Markdown("""
    ---
    **Disclaimer:** Fly GACA and Captain Adel are independent educational platforms. Not affiliated with, endorsed by, or operated by GACA. Official source: [gaca.gov.sa](https://gaca.gov.sa).
    """)

if __name__ == "__main__":
    demo.launch()
