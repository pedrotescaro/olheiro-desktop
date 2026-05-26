from __future__ import annotations

import json
import os
import threading
import time
import urllib.parse
from dataclasses import asdict
from datetime import datetime
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any, Optional

import tkinter as tk

from config.paths import ASSETS_DIR, CAPTURES_DIR, ROOT_DIR
from config.providers import AI_PROVIDERS, DEFAULT_PROVIDER, PROVIDERS_BY_NAME
from config.settings import AppSettings, load_settings, save_settings
from models.capture import CaptureResult
from services.browser_service import BrowserService
from services.capture_service import ScreenCaptureService
from services.clipboard_service import ClipboardService
from services.ocr_service import OCRService
from services.scroll_service import ScrollService
from utils.platform_utils import beep, paste_hotkey, set_dpi_awareness


HOST = "127.0.0.1"
PORT = 8765


class BackendState:
    def __init__(self) -> None:
        set_dpi_awareness()
        self.settings = load_settings()
        self.capture_service = ScreenCaptureService()
        self.ocr_service = OCRService()
        self.browser_service = BrowserService()
        self.clipboard_root = tk.Tk()
        self.clipboard_root.withdraw()
        self.clipboard_service = ClipboardService(self.clipboard_root)
        self.scroll_service = ScrollService(self._log)
        self.current: Optional[CaptureResult] = None
        self.history: list[CaptureResult] = []
        self.logs: list[str] = []

    def close(self) -> None:
        self.scroll_service.stop()
        self.clipboard_root.destroy()

    def _log(self, message: str) -> None:
        stamp = datetime.now().strftime("%H:%M:%S")
        self.logs.insert(0, f"[{stamp}] {message}")
        self.logs = self.logs[:40]

    def serialize(self) -> dict[str, Any]:
        return {
            "settings": asdict(self.settings),
            "providers": [
                {
                    "name": provider.name,
                    "url": provider.url,
                    "icon": f"/assets/icons/{provider.icon_path.name}",
                }
                for provider in AI_PROVIDERS
            ],
            "current": self._serialize_capture(self.current),
            "history": [self._serialize_capture(item) for item in self.history],
            "system": {
                "ocr": self.ocr_service.status,
                "captures": str(CAPTURES_DIR),
                "scroll": self.scroll_label,
                "backend": f"http://{HOST}:{PORT}",
            },
            "logs": self.logs,
        }

    @property
    def scroll_label(self) -> str:
        if not self.scroll_service.is_running:
            return "Parado"
        if self.scroll_service.direction == "down":
            return "Ativo para baixo"
        if self.scroll_service.direction == "up":
            return "Ativo para cima"
        return "Ativo"

    def update_settings(self, payload: dict[str, Any]) -> dict[str, Any]:
        settings_data = asdict(self.settings)
        settings_data.update(payload)
        self.settings = AppSettings.from_dict(settings_data)
        save_settings(self.settings)
        return self.serialize()

    def capture(self) -> dict[str, Any]:
        self._log("Aguardando recorte.")
        root = tk.Tk()
        root.withdraw()
        try:
            result = self.capture_service.capture_region(root, self.settings.save_captures)
        finally:
            root.destroy()

        if result is None:
            self._log("Recorte cancelado.")
            return {"cancelled": True, "state": self.serialize()}

        self._log("Processando OCR.")
        ocr = self.ocr_service.extract_text(result.image_path)
        result.ocr_text = ocr.text
        result.ocr_status = ocr.status
        result.prompt = build_prompt(self.settings.prompt_template, result, result.ocr_text)
        self.current = result
        self.history.insert(0, result)
        self.history = self.history[: self.settings.history_limit]
        self._log(result.ocr_status)

        if self.settings.auto_copy_after_capture:
            self.copy_content(self.settings.paste_mode, result.ocr_text, result.prompt)
        if self.settings.auto_open_after_capture:
            self.open_ai(self.settings.ai_provider)
        if self.settings.auto_paste_after_delay:
            self.schedule_paste(self.settings.paste_mode, result.ocr_text, result.prompt)
        beep()
        return {"cancelled": False, "state": self.serialize()}

    def copy_content(self, mode: str, ocr_text: str | None = None, prompt: str | None = None) -> dict[str, Any]:
        result = self.current
        if result is None:
            return self._message(False, "Nenhum recorte pronto.")
        text = ocr_text if ocr_text is not None else result.ocr_text
        prompt_text = prompt if prompt is not None else build_prompt(self.settings.prompt_template, result, text)
        ok, message = self.clipboard_service.copy_for_mode(mode, prompt_text, text, result.image_path)
        self._log(message)
        return self._message(ok, message)

    def paste_content(self, mode: str, ocr_text: str | None = None, prompt: str | None = None) -> dict[str, Any]:
        result = self.current
        if result is None:
            return self._message(False, "Nenhum recorte pronto.")
        text = ocr_text if ocr_text is not None else result.ocr_text
        prompt_text = prompt if prompt is not None else build_prompt(self.settings.prompt_template, result, text)

        if mode == "Prompt + imagem":
            ok, message = self.clipboard_service.copy_image(result.image_path)
            self._log(message)
            if ok:
                paste_hotkey()
                time.sleep(0.9)
                self.clipboard_service.copy_text(prompt_text)
                paste_hotkey()
                self._log("Imagem e prompt colados. Enter nao foi enviado.")
                return self._message(True, "Imagem e prompt colados.")
            return self._message(False, message)

        copy_result = self.copy_content(mode, text, prompt_text)
        paste_hotkey()
        self._log("Ctrl+V enviado. Enter nao foi enviado.")
        return copy_result

    def schedule_paste(self, mode: str, ocr_text: str | None = None, prompt: str | None = None) -> dict[str, Any]:
        delay = max(1, int(self.settings.paste_delay_seconds))
        self._log(f"Auto-colar em {delay}s. Clique no campo da IA.")
        threading.Thread(target=self._delayed_paste, args=(delay, mode, ocr_text, prompt), daemon=True).start()
        return self._message(True, f"Auto-colar agendado para {delay}s.")

    def _delayed_paste(self, delay: int, mode: str, ocr_text: str | None, prompt: str | None) -> None:
        time.sleep(delay)
        self.paste_content(mode, ocr_text, prompt)

    def open_ai(self, provider_name: str) -> dict[str, Any]:
        provider = PROVIDERS_BY_NAME.get(provider_name, PROVIDERS_BY_NAME[DEFAULT_PROVIDER])
        ok, message = self.browser_service.open_url(provider.url)
        self._log(f"{provider.name}: {message}")
        return self._message(ok, message)

    def open_current_image(self, image_path: str | None = None) -> dict[str, Any]:
        path = Path(image_path) if image_path else (self.current.image_path if self.current else None)
        if path is None or not path.exists():
            return self._message(False, "Imagem nao encontrada.")
        try:
            if os.name == "nt":
                os.startfile(path)  # type: ignore[attr-defined]
            else:
                self.browser_service.open_url(path.resolve().as_uri())
        except Exception as exc:
            return self._message(False, f"Nao foi possivel abrir a imagem: {str(exc).splitlines()[0]}")
        return self._message(True, "Imagem aberta.")

    def start_scroll(self, direction: str, speed: int | None = None) -> dict[str, Any]:
        parsed_speed = int(speed or self.settings.scroll_speed)
        self.scroll_service.start(direction, parsed_speed)
        self.settings.scroll_speed = parsed_speed
        save_settings(self.settings)
        return self._message(True, self.scroll_label)

    def stop_scroll(self) -> dict[str, Any]:
        self.scroll_service.stop()
        return self._message(True, "Scroll parado.")

    def _message(self, ok: bool, message: str) -> dict[str, Any]:
        return {"ok": ok, "message": message, "state": self.serialize()}

    def _serialize_capture(self, result: Optional[CaptureResult]) -> Optional[dict[str, Any]]:
        if result is None:
            return None
        return {
            "imagePath": str(result.image_path),
            "imageUrl": f"/image?path={urllib.parse.quote(str(result.image_path))}",
            "fileName": result.file_name,
            "time": result.time_label,
            "ocrText": result.ocr_text,
            "ocrStatus": result.ocr_status,
            "prompt": result.prompt,
            "savedToCaptures": result.saved_to_captures,
        }


def build_prompt(template: str, result: CaptureResult, ocr_text: str) -> str:
    text_block = ocr_text.strip() or "[Nenhum texto OCR detectado.]"
    return (
        f"{template.strip()}\n\n"
        f"Arquivo do recorte salvo em:\n{result.image_path.resolve()}\n\n"
        f"Texto extraido por OCR:\n{text_block}\n"
    )


def start_parent_watchdog() -> None:
    parent_pid = os.getenv("OLHEIRO_PARENT_PID")
    if not parent_pid:
        return
    try:
        pid = int(parent_pid)
    except ValueError:
        return

    def watch() -> None:
        while True:
            time.sleep(1.5)
            if process_is_running(pid):
                continue
            try:
                STATE.close()
            finally:
                os._exit(0)

    threading.Thread(target=watch, daemon=True).start()


def process_is_running(pid: int) -> bool:
    if os.name != "nt":
        try:
            os.kill(pid, 0)
        except OSError:
            return False
        return True

    try:
        import ctypes
        from ctypes import wintypes
    except Exception:
        return True

    process_query_limited_information = 0x1000
    still_active = 259
    kernel32 = ctypes.windll.kernel32
    handle = kernel32.OpenProcess(process_query_limited_information, False, pid)
    if not handle:
        return False
    exit_code = wintypes.DWORD()
    ok = kernel32.GetExitCodeProcess(handle, ctypes.byref(exit_code))
    kernel32.CloseHandle(handle)
    return bool(ok) and exit_code.value == still_active


STATE = BackendState()


class OlheiroHandler(BaseHTTPRequestHandler):
    server_version = "OlheiroBackend/1.0"

    def do_OPTIONS(self) -> None:
        self._send_empty()

    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/health":
            self._send_json({"ok": True})
            return
        if parsed.path == "/api/state":
            self._send_json(STATE.serialize())
            return
        if parsed.path.startswith("/assets/"):
            self._send_file(ASSETS_DIR / parsed.path.removeprefix("/assets/"))
            return
        if parsed.path == "/image":
            query = urllib.parse.parse_qs(parsed.query)
            image_path = Path(query.get("path", [""])[0])
            if not self._is_allowed_image(image_path):
                self._send_json({"ok": False, "message": "Imagem bloqueada."}, status=403)
                return
            self._send_file(image_path)
            return
        self._send_json({"ok": False, "message": "Rota nao encontrada."}, status=404)

    def do_POST(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        payload = self._read_json()
        routes = {
            "/api/settings": lambda: STATE.update_settings(payload),
            "/api/capture": STATE.capture,
            "/api/copy": lambda: STATE.copy_content(payload.get("mode", STATE.settings.paste_mode), payload.get("ocrText"), payload.get("prompt")),
            "/api/paste": lambda: STATE.paste_content(payload.get("mode", STATE.settings.paste_mode), payload.get("ocrText"), payload.get("prompt")),
            "/api/open-ai": lambda: STATE.open_ai(payload.get("provider", STATE.settings.ai_provider)),
            "/api/open-image": lambda: STATE.open_current_image(payload.get("imagePath")),
            "/api/scroll/start": lambda: STATE.start_scroll(payload.get("direction", "down"), payload.get("speed")),
            "/api/scroll/stop": STATE.stop_scroll,
        }
        action = routes.get(parsed.path)
        if action is None:
            self._send_json({"ok": False, "message": "Rota nao encontrada."}, status=404)
            return
        try:
            self._send_json(action())
        except Exception as exc:
            STATE._log(f"Erro no backend: {str(exc).splitlines()[0]}")
            self._send_json({"ok": False, "message": str(exc).splitlines()[0], "state": STATE.serialize()}, status=500)

    def log_message(self, _format: str, *_args: Any) -> None:
        return

    def _read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0") or 0)
        if length <= 0:
            return {}
        try:
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except json.JSONDecodeError:
            return {}

    def _send_json(self, payload: dict[str, Any], status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self._common_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_file(self, path: Path) -> None:
        try:
            resolved = path.resolve()
        except OSError:
            self._send_json({"ok": False, "message": "Arquivo invalido."}, status=404)
            return
        allowed_roots = (ASSETS_DIR.resolve(), CAPTURES_DIR.resolve(), (Path(__file__).resolve().parent / "captures").resolve(), Path(os.getenv("TEMP", ".")).resolve())
        if not any(str(resolved).startswith(str(root)) for root in allowed_roots):
            self._send_json({"ok": False, "message": "Arquivo bloqueado."}, status=403)
            return
        if not resolved.exists() or not resolved.is_file():
            self._send_json({"ok": False, "message": "Arquivo nao encontrado."}, status=404)
            return
        content = resolved.read_bytes()
        content_type = "image/png" if resolved.suffix.lower() == ".png" else "application/octet-stream"
        self.send_response(200)
        self._common_headers()
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def _send_empty(self) -> None:
        self.send_response(204)
        self._common_headers()
        self.end_headers()

    def _common_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _is_allowed_image(self, path: Path) -> bool:
        try:
            resolved = path.resolve()
        except OSError:
            return False
        roots = [CAPTURES_DIR.resolve(), (ROOT_DIR / "captures").resolve(), Path(os.getenv("TEMP", ".")).resolve()]
        return resolved.suffix.lower() == ".png" and any(str(resolved).startswith(str(root)) for root in roots)


def main() -> None:
    start_parent_watchdog()
    server = HTTPServer((HOST, PORT), OlheiroHandler)
    print(f"Olheiro backend em http://{HOST}:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        STATE.close()
        server.server_close()


if __name__ == "__main__":
    main()
