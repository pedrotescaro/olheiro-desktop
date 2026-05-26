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
    def open_url(self, url: str, reuse_tab: bool = False) -> tuple[bool, str]:
        if reuse_tab:
            ok, message = self._reuse_active_ai_browser_tab(url)
            if ok:
                return True, message

        try:
            opened = webbrowser.open(url, new=2)
        except Exception as exc:
            return False, f"Nao foi possivel abrir o navegador: {str(exc).splitlines()[0]}"
        if not opened:
            return False, "O navegador padrao nao confirmou a abertura da pagina."
        if reuse_tab:
            return True, "Nenhuma guia ativa de IA foi encontrada. Abri uma nova guia."
        return True, "Pagina aberta no navegador."

    def _reuse_active_ai_browser_tab(self, url: str) -> tuple[bool, str]:
        hwnd = find_active_ai_browser_window()
        if hwnd is None:
            return False, "Nenhuma guia ativa de IA encontrada."
        try:
            focus_window(hwnd)
            navigate_focused_tab(url)
        except Exception as exc:
            return False, f"Nao foi possivel reutilizar a guia: {str(exc).splitlines()[0]}"
        return True, "Guia ativa da IA reutilizada."


def find_active_ai_browser_window() -> int | None:
    try:
        import win32gui
    except Exception:
        return None

    candidates: list[int] = []

    def collect(hwnd: int, _extra: object) -> None:
        if not win32gui.IsWindowVisible(hwnd):
            return
        title = win32gui.GetWindowText(hwnd).strip().lower()
        if not title:
            return
        has_ai = any(hint in title for hint in AI_TITLE_HINTS)
        has_browser = any(hint in title for hint in BROWSER_TITLE_HINTS)
        if has_ai and has_browser:
            candidates.append(hwnd)

    win32gui.EnumWindows(collect, None)
    return candidates[0] if candidates else None


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
