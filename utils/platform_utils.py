from __future__ import annotations

import ctypes
import sys

from pynput import keyboard


def set_dpi_awareness() -> None:
    if sys.platform != "win32":
        return
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(2)
    except Exception:
        try:
            ctypes.windll.user32.SetProcessDPIAware()
        except Exception:
            pass


def beep() -> None:
    if sys.platform != "win32":
        return
    try:
        import winsound

        winsound.MessageBeep()
    except Exception:
        pass


def paste_hotkey() -> None:
    controller = keyboard.Controller()
    controller.press(keyboard.Key.ctrl_l)
    controller.press("v")
    controller.release("v")
    controller.release(keyboard.Key.ctrl_l)
