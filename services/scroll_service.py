from __future__ import annotations

import threading
import time
from typing import Callable, Optional

from pynput.mouse import Controller as MouseController


class ScrollService:
    def __init__(self, on_status: Callable[[str], None]) -> None:
        self.on_status = on_status
        self.mouse = MouseController()
        self.stop_event = threading.Event()
        self.thread: Optional[threading.Thread] = None
        self.direction: Optional[str] = None

    def start(self, direction: str, speed: int) -> None:
        if self.is_running and self.direction == direction:
            self.stop()
            return
        self.stop()
        self.stop_event.clear()
        self.direction = direction
        amount = -max(1, speed) if direction == "down" else max(1, speed)
        interval = max(0.045, 0.24 - (max(1, min(speed, 10)) * 0.012))
        self.thread = threading.Thread(target=self._loop, args=(amount, interval), daemon=True)
        self.thread.start()
        label = "baixo" if direction == "down" else "cima"
        self.on_status(f"Scroll ativo para {label}.")

    def stop(self) -> None:
        if self.thread and self.thread.is_alive():
            self.stop_event.set()
            self.thread.join(timeout=0.35)
            self.on_status("Scroll parado.")
        self.thread = None
        self.direction = None

    @property
    def is_running(self) -> bool:
        return self.thread is not None and self.thread.is_alive()

    def _loop(self, amount: int, interval: float) -> None:
        while not self.stop_event.is_set():
            if not cursor_is_over_olheiro():
                self.mouse.scroll(0, amount)
            time.sleep(interval)


def cursor_is_over_olheiro() -> bool:
    try:
        import ctypes
        from ctypes import wintypes
    except Exception:
        return False

    try:
        user32 = ctypes.windll.user32
        point = wintypes.POINT()
        if not user32.GetCursorPos(ctypes.byref(point)):
            return False
        hwnd = user32.WindowFromPoint(point)
        if not hwnd:
            return False
        root = user32.GetAncestor(hwnd, 2) or hwnd
        length = user32.GetWindowTextLengthW(root)
        if length <= 0:
            return False
        buffer = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(root, buffer, length + 1)
        return "olheiro" in buffer.value.lower()
    except Exception:
        return False
