from __future__ import annotations

import shutil
import sys
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageEnhance


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
            self.status = "OCR indisponível: pytesseract não foi encontrado."
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

        self.status = "OCR instalado, mas tesseract.exe não foi localizado."
        return self.status

    def extract_text(self, image_path: Path, lang: str | None = None, preprocess: str = "balanced") -> OCRResult:
        try:
            import pytesseract
        except Exception:
            return OCRResult("", "OCR indisponível: pytesseract não foi encontrado.", False)

        try:
            image = Image.open(image_path)
        except Exception as exc:
            return OCRResult("", f"Não foi possivel abrir o recorte: {str(exc).splitlines()[0]}", False)

        image = self._preprocess(image, preprocess)

        errors: list[str] = []
        preferred_lang = lang or self.lang
        fallback_langs = [preferred_lang, "eng", ""]
        if preferred_lang == "eng+por":
            fallback_langs = ["eng+por", "por+eng", "eng", ""]
        for current_lang in fallback_langs:
            try:
                kwargs = {"lang": current_lang} if current_lang else {}
                text = pytesseract.image_to_string(image, **kwargs).strip()
                if text:
                    return OCRResult(text, "OCR concluído.", True)
                return OCRResult("", "OCR concluído, mas nenhum texto foi detectado.", True)
            except Exception as exc:
                errors.append(str(exc).splitlines()[0])

        detail = " | ".join(errors[:2]) if errors else "erro desconhecido"
        return OCRResult("", f"Erro no OCR: {detail}", False)

    def _preprocess(self, image: Image.Image, mode: str = "balanced") -> Image.Image:
        """Pre-process image to improve OCR accuracy."""
        if mode == "raw":
            return image

        # Convert to grayscale
        gray = image.convert("L")

        # Upscale small images (< 300px height) by 2x for better OCR
        width, height = gray.size
        if height < 300:
            gray = gray.resize((width * 2, height * 2), Image.Resampling.LANCZOS)

        # Increase contrast
        contrast = 2.4 if mode == "high_contrast" else 1.8
        gray = ImageEnhance.Contrast(gray).enhance(contrast)

        # Increase sharpness
        from PIL import ImageFilter
        gray = gray.filter(ImageFilter.SHARPEN)

        if mode == "high_contrast":
            gray = gray.point(lambda x: 255 if x > 140 else 0, "1")

        return gray.convert("L")
