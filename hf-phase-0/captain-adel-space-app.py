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
