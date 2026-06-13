"""
Captain Adel — minimal runnable starter for the Fly GACA assistant.

Wires together:
  - Gemini system instruction loaded from captain_adel_system_prompt.md
  - Three function-calling tools (search_library, lookup_citation,
    list_changes) backed by the BM25 retriever in assistant/rag.py, which
    reads the same corpus the production Cloud Function ships
    (functions/rag/_chunks.json.gz + _index.json.gz).
  - A simple agent loop with tool-call resolution
  - Streaming output to the terminal

Single-file prototype with a terminal UI. Promote to FastAPI + Cloud Run
when you're ready (see gemini_integration.md §7).

Setup:
    pip install google-genai

    # AI Studio (prototype)
    export GEMINI_API_KEY=...

    # Vertex AI (production)
    export GOOGLE_GENAI_USE_VERTEXAI=true
    export GOOGLE_CLOUD_PROJECT=flygaca-prod
    export GOOGLE_CLOUD_LOCATION=me-central2
    gcloud auth application-default login

Run:
    python captain_adel.py
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path
from typing import Any, Callable

from google import genai
from google.genai import types

# Local sibling module — the BM25 retriever over functions/rag/_chunks.json.gz.
sys.path.insert(0, str(Path(__file__).resolve().parent))
import rag  # noqa: E402


# ────────────────────────────────────────────────────────────────────────
# Paths
# ────────────────────────────────────────────────────────────────────────

ROOT = Path(__file__).resolve().parent.parent  # /Fly GACA/
SYSTEM_PROMPT_PATH = ROOT / "assistant" / "captain_adel_system_prompt.md"
CORPUS_DIR = ROOT  # PDFs sit at the workspace root


# ────────────────────────────────────────────────────────────────────────
# System instruction — extract the paste-ready block from the .md file
# ────────────────────────────────────────────────────────────────────────


def load_system_instruction() -> str:
    """
    Pull the Gemini-formatted block out of the system_prompt markdown file.
    Falls back to the full file if the marker isn't found.
    """
    text = SYSTEM_PROMPT_PATH.read_text(encoding="utf-8")
    # The .md file ends with a fenced ```text block containing the
    # paste-ready system_instruction.
    match = re.search(r"```text\n(.*?)```", text, re.DOTALL)
    return match.group(1).strip() if match else text


# ────────────────────────────────────────────────────────────────────────
# Tool implementations — backed by assistant/rag.py, which loads the same
# BM25 corpus the production Cloud Function serves (functions/rag/).
# ────────────────────────────────────────────────────────────────────────

# Dispatch table — kept in sync with the function_declarations below.
TOOL_FUNCTIONS: dict[str, Callable[..., Any]] = {
    "search_library": rag.search_library,
    "lookup_citation": rag.lookup_citation,
    "list_changes": rag.list_changes,
}


# ────────────────────────────────────────────────────────────────────────
# Tool declarations (Gemini function-calling schema)
# ────────────────────────────────────────────────────────────────────────


TOOLS = types.Tool(
    function_declarations=[
        types.FunctionDeclaration(
            name="search_library",
            description=(
                "Semantic search over GACA Aviation Regulations and topical "
                "books. Returns the most relevant section passages with "
                "citations and page links. Use this for any regulatory "
                "question where you don't already have an exact section "
                "in mind."
            ),
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "query": types.Schema(
                        type=types.Type.STRING,
                        description=(
                            "Focused search query. Prefer technical terms "
                            "from the regulation."
                        ),
                    ),
                    "top_k": types.Schema(
                        type=types.Type.INTEGER,
                        description="Number of passages to return (1–12).",
                    ),
                    "filter_part": types.Schema(
                        type=types.Type.STRING,
                        description=(
                            "Optional GACAR Part to scope search to "
                            "(e.g. '91', '121')."
                        ),
                    ),
                },
                required=["query"],
            ),
        ),
        types.FunctionDeclaration(
            name="lookup_citation",
            description=(
                "Exact lookup of a specific section by Part and section "
                "number. Use when the user names a section directly."
            ),
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "part": types.Schema(type=types.Type.STRING),
                    "section": types.Schema(type=types.Type.STRING),
                },
                required=["part", "section"],
            ),
        ),
        types.FunctionDeclaration(
            name="list_changes",
            description=(
                "Return Change_History entries for a Part since a given "
                "version. Use when the user asks 'what changed'."
            ),
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "part": types.Schema(type=types.Type.STRING),
                    "since_version": types.Schema(type=types.Type.STRING),
                },
                required=["part"],
            ),
        ),
    ]
)


# ────────────────────────────────────────────────────────────────────────
# Client
# ────────────────────────────────────────────────────────────────────────


def make_client() -> genai.Client:
    if os.environ.get("GOOGLE_GENAI_USE_VERTEXAI", "").lower() == "true":
        return genai.Client(
            vertexai=True,
            project=os.environ["GOOGLE_CLOUD_PROJECT"],
            location=os.environ.get("GOOGLE_CLOUD_LOCATION", "me-central2"),
        )
    return genai.Client(api_key=os.environ["GEMINI_API_KEY"])


MODEL = os.environ.get("CAPTAIN_ADEL_MODEL", "gemini-2.5-pro")

# Load once at startup — avoids re-reading and parsing the file on every turn.
SYSTEM_INSTRUCTION = load_system_instruction()


# ────────────────────────────────────────────────────────────────────────
# Agent loop
# ────────────────────────────────────────────────────────────────────────


def run_tool(name: str, args: dict) -> dict:
    fn = TOOL_FUNCTIONS.get(name)
    if not fn:
        return {"error": f"unknown tool: {name}"}
    try:
        result = fn(**args)
        return {"result": result}
    except Exception as exc:  # noqa: BLE001
        return {"error": str(exc)}


def chat_turn(
    client: genai.Client,
    history: list[types.Content],
    user_message: str,
    max_tool_rounds: int = 5,
) -> str:
    """
    One conversational turn. Streams text to stdout, resolves any tool
    calls Gemini emits, returns the assembled assistant reply.
    """
    history.append(
        types.Content(role="user", parts=[types.Part(text=user_message)])
    )

    config = types.GenerateContentConfig(
        system_instruction=SYSTEM_INSTRUCTION,
        tools=[TOOLS],
        temperature=0.3,  # captains don't improvise
        max_output_tokens=4096,
    )

    rounds = 0
    while True:
        rounds += 1
        if rounds > max_tool_rounds:
            print("\n[captain_adel] tool-loop limit hit; stopping.\n")
            break

        response_text_parts: list[str] = []
        tool_calls: list[types.FunctionCall] = []

        for chunk in client.models.generate_content_stream(
            model=MODEL,
            contents=history,
            config=config,
        ):
            for cand in chunk.candidates or []:
                for part in (cand.content.parts or []) if cand.content else []:
                    if part.text:
                        response_text_parts.append(part.text)
                        sys.stdout.write(part.text)
                        sys.stdout.flush()
                    if part.function_call:
                        tool_calls.append(part.function_call)

        if not tool_calls:
            # Final answer.
            full_text = "".join(response_text_parts)
            history.append(
                types.Content(
                    role="model",
                    parts=[types.Part(text=full_text)],
                )
            )
            print()  # newline after stream
            return full_text

        # Gemini wants tool results — execute and append.
        history.append(
            types.Content(
                role="model",
                parts=[types.Part(function_call=fc) for fc in tool_calls],
            )
        )
        tool_response_parts = []
        for fc in tool_calls:
            args = dict(fc.args) if fc.args else {}
            name = fc.name or ""
            print(f"\n[tool] {name}({args})")
            outcome = run_tool(name, args)
            tool_response_parts.append(
                types.Part(
                    function_response=types.FunctionResponse(
                        name=name,
                        response=outcome,
                    )
                )
            )
        history.append(
            types.Content(role="user", parts=tool_response_parts)
        )
        # Loop back: re-call the model with the tool results in context.

    return ""


def repl() -> None:
    client = make_client()
    history: list[types.Content] = []
    print("Captain Adel is on the line. (Ctrl-D to end the brief.)\n")
    while True:
        try:
            user = input("you > ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nFly safe.")
            return
        if not user:
            continue
        print("captain > ", end="")
        chat_turn(client, history, user)
        print()


if __name__ == "__main__":
    repl()
