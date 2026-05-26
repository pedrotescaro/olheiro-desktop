from __future__ import annotations

import webbrowser


class BrowserService:
    def open_url(self, url: str, reuse_tab: bool = False) -> tuple[bool, str]:
        try:
            opened = webbrowser.open(url, new=0 if reuse_tab else 2)
        except Exception as exc:
            return False, f"Não foi possivel abrir o navegador: {str(exc).splitlines()[0]}"
        if not opened:
            return False, "O navegador padrão não confirmou a abertura da página."
        return True, "Pagina aberta no navegador."
