from __future__ import annotations

from typing import Callable

from pynput import keyboard


HOTKEYS: dict[str, str] = {
    "<f9>": "capture",
    "<f8>": "scroll_down",
    "<shift>+<f8>": "scroll_up",
    "<f7>": "stop_scroll",
    "<f6>": "quit",
    "<ctrl>+<shift>+s": "capture",
    "<ctrl>+<shift>+c": "copy_ocr",
    "<ctrl>+<shift>+v": "paste_now",
    "<ctrl>+<shift>+<down>": "scroll_down",
    "<ctrl>+<shift>+<up>": "scroll_up",
}


class HotkeyService:
    def __init__(self, on_action: Callable[[str], None]) -> None:
        self.on_action = on_action
        self.listener: keyboard.GlobalHotKeys | None = None

    def start(self) -> tuple[bool, str]:
        try:
            mapping = {combo: self._callback(action) for combo, action in HOTKEYS.items()}
            self.listener = keyboard.GlobalHotKeys(mapping)
            self.listener.start()
        except Exception as exc:
            return False, f"Atalhos globais indisponiveis: {str(exc).splitlines()[0]}"
        return True, "Atalhos globais ativos."

    def stop(self) -> None:
        if self.listener is not None:
            self.listener.stop()
            self.listener = None

    def _callback(self, action: str) -> Callable[[], None]:
        return lambda: self.on_action(action)
