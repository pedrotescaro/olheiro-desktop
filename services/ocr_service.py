from __future__ import annotations

import shutil
import sys
from dataclasses import dataclass
from pathlib import Path

from PIL import Image


@dataclass
class OCRResult:
    text: str
    status: str
    ok: bool


class OCRService:
    def __init__(self, lang: str = "por+eng") -> None:
        self.lang = lang
        self.status = self.configure()

    def configure(self) -> str:
        try:
            import pytesseract
        except Exception:
            self.status = "OCR indisponivel: pytesseract nao foi encontrado."
            return self.status

        found = shutil.which("tesseract")
        bundle_dir = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parents[1]))
        candidates = [
            found,
            bundle_dir / "tesseract" / "tesseract.exe",
            Path(__file__).resolve().parents[1] / "vendor" / "tesseract" / "tesseract.exe",
            r"C:\Program Files\Tesseract-OCR\tesseract.exe",
            r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        ]
        for candidate in candidates:
            if candidate and Path(candidate).exists():
                pytesseract.pytesseract.tesseract_cmd = str(candidate)
                self.status = "OCR pronto."
                return self.status

        self.status = "OCR instalado, mas tesseract.exe nao foi localizado."
        return self.status

    def extract_text(self, image_path: Path) -> OCRResult:
        try:
            import pytesseract
        except Exception:
            return OCRResult("", "OCR indisponivel: pytesseract nao foi encontrado.", False)

        try:
            image = Image.open(image_path)
        except Exception as exc:
            return OCRResult("", f"Nao foi possivel abrir o recorte: {str(exc).splitlines()[0]}", False)

        errors: list[str] = []
        for lang in (self.lang, "eng", ""):
            try:
                kwargs = {"lang": lang} if lang else {}
                text = pytesseract.image_to_string(image, **kwargs).strip()
                if text:
                    return OCRResult(text, "OCR concluido.", True)
                return OCRResult("", "OCR concluido, mas nenhum texto foi detectado.", True)
            except Exception as exc:
                errors.append(str(exc).splitlines()[0])

        detail = " | ".join(errors[:2]) if errors else "erro desconhecido"
        return OCRResult("", f"Erro no OCR: {detail}", False)
