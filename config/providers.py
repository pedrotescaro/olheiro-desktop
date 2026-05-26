from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from config.paths import ICONS_DIR


@dataclass(frozen=True)
class AIProvider:
    name: str
    url: str
    icon_path: Path


AI_PROVIDERS: tuple[AIProvider, ...] = (
    AIProvider("Gemini", "https://gemini.google.com/app", ICONS_DIR / "gemini.png"),
    AIProvider("ChatGPT", "https://chatgpt.com/", ICONS_DIR / "chatgpt.png"),
    AIProvider("Claude", "https://claude.ai/new", ICONS_DIR / "claude.png"),
    AIProvider("Copilot", "https://copilot.microsoft.com/", ICONS_DIR / "copilot.png"),
    AIProvider("Perplexity", "https://www.perplexity.ai/", ICONS_DIR / "perplexity.png"),
)

PROVIDERS_BY_NAME = {provider.name: provider for provider in AI_PROVIDERS}
DEFAULT_PROVIDER = "Gemini"

PASTE_MODES = ("Texto OCR", "Imagem", "Prompt", "Prompt + imagem")
DEFAULT_PASTE_MODE = "Texto OCR"
