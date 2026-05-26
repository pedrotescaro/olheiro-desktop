from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from config.paths import SETTINGS_PATH
from config.providers import DEFAULT_PASTE_MODE, DEFAULT_PROVIDER, PASTE_MODES, PROVIDERS_BY_NAME


DEFAULT_PROMPT_TEMPLATE = (
    "Estou estudando este conteúdo. Explique em português, passo a passo, "
    "os conceitos principais do recorte. Se parecer questão de avaliação, "
    "não responda apenas com a alternativa final: me ajude a entender o raciocínio."
)


@dataclass
class AppSettings:
    ai_provider: str = DEFAULT_PROVIDER
    study_profile: str = "Geral"
    paste_mode: str = DEFAULT_PASTE_MODE
    paste_delay_seconds: int = 5
    auto_open_after_capture: bool = True
    auto_copy_after_capture: bool = True
    auto_paste_after_delay: bool = False
    save_captures: bool = True
    prompt_template: str = DEFAULT_PROMPT_TEMPLATE
    ocr_language: str = "por+eng"
    ocr_preprocess: str = "balanced"
    scroll_speed: int = 4
    history_limit: int = 8
    reuse_ai_tab: bool = False
    privacy_auto_delete_days: int = 0
    mini_panel: bool = True
    theme: str = "system"   # "light", "dark", "system"
    language: str = "pt"    # "pt" or "en"

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "AppSettings":
        settings = cls()
        for key in asdict(settings):
            if key in data:
                setattr(settings, key, data[key])
        settings.normalize()
        return settings

    def normalize(self) -> None:
        if self.ai_provider not in PROVIDERS_BY_NAME:
            self.ai_provider = DEFAULT_PROVIDER
        if self.paste_mode not in PASTE_MODES:
            self.paste_mode = DEFAULT_PASTE_MODE
        self.paste_delay_seconds = clamp_int(self.paste_delay_seconds, 1, 20, 5)
        self.scroll_speed = clamp_int(self.scroll_speed, 1, 10, 4)
        self.history_limit = clamp_int(self.history_limit, 3, 20, 8)
        self.privacy_auto_delete_days = clamp_int(self.privacy_auto_delete_days, 0, 365, 0)
        self.prompt_template = str(self.prompt_template or DEFAULT_PROMPT_TEMPLATE).strip()
        self.study_profile = str(self.study_profile or "Geral").strip() or "Geral"
        if self.ocr_language not in ("por+eng", "por", "eng", "spa", "eng+por"):
            self.ocr_language = "por+eng"
        if self.ocr_preprocess not in ("balanced", "high_contrast", "raw"):
            self.ocr_preprocess = "balanced"
        if self.theme not in ("light", "dark", "system"):
            self.theme = "system"
        if self.language not in ("pt", "en"):
            self.language = "pt"


def clamp_int(value: Any, minimum: int, maximum: int, fallback: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return fallback
    return max(minimum, min(maximum, parsed))


def load_settings(path: Path = SETTINGS_PATH) -> AppSettings:
    if not path.exists():
        return AppSettings()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return AppSettings()
    if not isinstance(data, dict):
        return AppSettings()
    return AppSettings.from_dict(data)


def save_settings(settings: AppSettings, path: Path = SETTINGS_PATH) -> None:
    settings.normalize()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(asdict(settings), indent=2, ensure_ascii=False), encoding="utf-8")
