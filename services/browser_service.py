from __future__ import annotations

import time
import webbrowser

from pynput import keyboard


AI_TITLE_HINTS = (
    "chatgpt",
    "gemini",
    "claude",
    "copilot",
    "perplexity",
    "deepseek",
)

BROWSER_TITLE_HINTS = (
    "google chrome",
    "microsoft edge",
    "mozilla firefox",
    "brave",
    "opera",
    "vivaldi",
    "arc",
)


class BrowserService:
    def __init__(self) -> None:
        self.last_ai_hwnd: int | None = None

    def open_url(self, url: str, reuse_tab: bool = False) -> tuple[bool, str]:
        if reuse_tab:
            ok, message = self._reuse_active_ai_browser_tab(url)
            if ok:
                return True, message

        try:
            opened = webbrowser.open(url, new=1 if reuse_tab else 2)
        except Exception as exc:
            return False, f"Nao foi possivel abrir o navegador: {str(exc).splitlines()[0]}"
        if not opened:
            return False, "O navegador padrao nao confirmou a abertura da pagina."
        if reuse_tab:
            self.last_ai_hwnd = wait_for_ai_browser_window()
            return True, "Abri a guia inicial da IA. As proximas aberturas vao reutilizar esta janela."
        return True, "Pagina aberta no navegador."

    def _reuse_active_ai_browser_tab(self, url: str) -> tuple[bool, str]:
        hwnd = self._remembered_window()
        if hwnd is None:
            hwnd = find_active_ai_browser_window()
        if hwnd is None:
            return False, "Nenhuma guia ativa de IA encontrada."
        try:
            focus_window(hwnd)
            navigate_focused_tab(url)
        except Exception as exc:
            return False, f"Nao foi possivel reutilizar a guia: {str(exc).splitlines()[0]}"
        self.last_ai_hwnd = hwnd
        return True, "Guia da IA reutilizada na mesma janela."

    def _remembered_window(self) -> int | None:
        if self.last_ai_hwnd is None:
            return None
        if is_browser_window(self.last_ai_hwnd):
            return self.last_ai_hwnd
        self.last_ai_hwnd = None
        return None


def find_active_ai_browser_window() -> int | None:
    try:
        import win32gui
    except Exception:
        return None

    candidates: list[int] = []

    def collect(hwnd: int, _extra: object) -> None:
        if is_ai_browser_window(hwnd):
            candidates.append(hwnd)

    win32gui.EnumWindows(collect, None)
    return candidates[0] if candidates else None


def wait_for_ai_browser_window(timeout: float = 5.0) -> int | None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        hwnd = find_active_ai_browser_window()
        if hwnd is not None:
            return hwnd
        time.sleep(0.25)
    return None


def is_ai_browser_window(hwnd: int) -> bool:
    try:
        import win32gui
    except Exception:
        return False
    if not is_browser_window(hwnd):
        return False
    title = win32gui.GetWindowText(hwnd).strip().lower()
    return any(hint in title for hint in AI_TITLE_HINTS)


def is_browser_window(hwnd: int) -> bool:
    try:
        import win32gui
    except Exception:
        return False
    if not hwnd or not win32gui.IsWindow(hwnd) or not win32gui.IsWindowVisible(hwnd):
        return False
    title = win32gui.GetWindowText(hwnd).strip().lower()
    return bool(title) and any(hint in title for hint in BROWSER_TITLE_HINTS)


def focus_window(hwnd: int) -> None:
    import win32con
    import win32gui

    if win32gui.IsIconic(hwnd):
        win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
    else:
        win32gui.ShowWindow(hwnd, win32con.SW_SHOW)

    try:
        import win32com.client

        shell = win32com.client.Dispatch("WScript.Shell")
        shell.SendKeys("%")
    except Exception:
        pass

    win32gui.SetForegroundWindow(hwnd)
    time.sleep(0.25)


def navigate_focused_tab(url: str) -> None:
    controller = keyboard.Controller()
    controller.press(keyboard.Key.ctrl_l)
    controller.press("l")
    controller.release("l")
    controller.release(keyboard.Key.ctrl_l)
    time.sleep(0.08)
    controller.type(url)
    time.sleep(0.04)
    controller.press(keyboard.Key.enter)
    controller.release(keyboard.Key.enter)
