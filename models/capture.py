from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path


@dataclass
class CaptureResult:
    image_path: Path
    timestamp: datetime
    saved_to_captures: bool = True
    ocr_text: str = ""
    ocr_status: str = "Aguardando OCR"
    prompt: str = ""
    error: str = ""

    @property
    def file_name(self) -> str:
        return self.image_path.name

    @property
    def time_label(self) -> str:
        return self.timestamp.strftime("%H:%M:%S")
