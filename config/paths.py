from __future__ import annotations

import os
import sys
from pathlib import Path


IS_FROZEN = bool(getattr(sys, "frozen", False))
BUNDLE_DIR = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parents[1]))
APP_DIR = Path(sys.executable).resolve().parent if IS_FROZEN else Path(__file__).resolve().parents[1]
DATA_DIR = Path(os.getenv("LOCALAPPDATA", APP_DIR)) / "Olheiro" if IS_FROZEN else APP_DIR

ROOT_DIR = APP_DIR
ASSETS_DIR = BUNDLE_DIR / "assets"
ICONS_DIR = ASSETS_DIR / "icons"
CAPTURES_DIR = DATA_DIR / "captures"
SETTINGS_PATH = DATA_DIR / "settings.json"
HISTORY_PATH = DATA_DIR / "history.json"
FAVICON_PATH = ASSETS_DIR / "favicon.png"
LOGO_PATH = ASSETS_DIR / "olheiro.png"
