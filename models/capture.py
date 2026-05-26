from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any


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

    def to_dict(self) -> dict[str, Any]:
        return {
            "image_path": str(self.image_path),
            "timestamp": self.timestamp.isoformat(),
            "saved_to_captures": self.saved_to_captures,
            "ocr_text": self.ocr_text,
            "ocr_status": self.ocr_status,
            "prompt": self.prompt,
            "error": self.error,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "CaptureResult":
        return cls(
            image_path=Path(data["image_path"]),
            timestamp=datetime.fromisoformat(data["timestamp"]),
            saved_to_captures=data.get("saved_to_captures", True),
            ocr_text=data.get("ocr_text", ""),
            ocr_status=data.get("ocr_status", ""),
            prompt=data.get("prompt", ""),
            error=data.get("error", ""),
        )
