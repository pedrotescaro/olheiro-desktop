from __future__ import annotations

import sys
from io import BytesIO
from pathlib import Path

import tkinter as tk
from PIL import Image


class ClipboardService:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root

    def copy_text(self, text: str) -> tuple[bool, str]:
        if not text.strip():
            return False, "Não há texto para copiar."
        try:
            import pyperclip

            pyperclip.copy(text)
        except Exception:
            self.root.clipboard_clear()
            self.root.clipboard_append(text)
            self.root.update()
        return True, "Texto copiado."

    def copy_image(self, image_path: Path) -> tuple[bool, str]:
        if sys.platform != "win32":
            return False, "Copiar imagem para a área de transferência exige Windows."
        if not image_path.exists():
            return False, "A imagem do recorte não foi encontrada."
        try:
            import win32clipboard
            import win32con
        except Exception:
            return False, "Componente pywin32 ausente para copiar imagem."

        try:
            data = self._image_to_dib(image_path)
            win32clipboard.OpenClipboard()
            try:
                win32clipboard.EmptyClipboard()
                win32clipboard.SetClipboardData(win32con.CF_DIB, data)
            finally:
                win32clipboard.CloseClipboard()
        except Exception as exc:
            return False, f"Não foi possivel copiar a imagem: {str(exc).splitlines()[0]}"
        return True, "Imagem copiada."

    def copy_text_and_image(self, text: str, image_path: Path) -> tuple[bool, str]:
        if sys.platform != "win32":
            self.copy_text(text)
            return False, "Texto copiado. Cópia de imagem junto exige Windows."
        if not image_path.exists():
            return False, "A imagem do recorte não foi encontrada."
        try:
            import win32clipboard
            import win32con
        except Exception:
            self.copy_text(text)
            return False, "Texto copiado. Componente pywin32 ausente para copiar imagem."

        try:
            data = self._image_to_dib(image_path)
            win32clipboard.OpenClipboard()
            try:
                win32clipboard.EmptyClipboard()
                win32clipboard.SetClipboardData(win32con.CF_UNICODETEXT, text)
                win32clipboard.SetClipboardData(win32con.CF_DIB, data)
            finally:
                win32clipboard.CloseClipboard()
        except Exception as exc:
            self.copy_text(text)
            return False, f"Texto copiado. Imagem falhou: {str(exc).splitlines()[0]}"
        return True, "Texto e imagem copiados."

    def copy_for_mode(self, mode: str, prompt: str, ocr_text: str, image_path: Path) -> tuple[bool, str]:
        if mode == "Texto OCR":
            return self.copy_text(ocr_text.strip() or prompt)
        if mode == "Imagem":
            return self.copy_image(image_path)
        if mode == "Prompt":
            return self.copy_text(prompt)
        if mode == "Prompt + imagem":
            return self.copy_text_and_image(prompt, image_path)
        return False, "Modo de cópia desconhecido."

    def _image_to_dib(self, image_path: Path) -> bytes:
        output = BytesIO()
        Image.open(image_path).convert("RGB").save(output, "BMP")
        data = output.getvalue()[14:]
        output.close()
        return data
