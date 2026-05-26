from __future__ import annotations

import webbrowser


class BrowserService:
    def open_url(self, url: str) -> tuple[bool, str]:
        try:
            opened = webbrowser.open(url, new=2)
        except Exception as exc:
            return False, f"Nao foi possivel abrir o navegador: {str(exc).splitlines()[0]}"
        if not opened:
            return False, "O navegador padrao nao confirmou a abertura da pagina."
        return True, "Pagina aberta no navegador."
