from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any


class ExportService:
    def export_session(self, course_state: dict[str, Any], output_format: str = "md") -> dict[str, Any]:
        fmt = output_format.lower().strip(".") if output_format else "md"
        if fmt not in ("md", "txt", "json"):
            fmt = "md"

        lesson_dir = Path(course_state.get("paths", {}).get("currentLessonDir", "."))
        lesson_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        target = lesson_dir / f"resumo_sessao_{stamp}.{fmt}"

        if fmt == "json":
            target.write_text(json.dumps(course_state, indent=2, ensure_ascii=False), encoding="utf-8")
        elif fmt == "txt":
            target.write_text(render_plain_text(course_state), encoding="utf-8")
        else:
            target.write_text(render_markdown(course_state), encoding="utf-8")

        return {"ok": True, "message": f"Sessao exportada em {target}", "path": str(target)}


def render_markdown(course_state: dict[str, Any]) -> str:
    context = course_state.get("context", {})
    stats = course_state.get("stats", {})
    session = course_state.get("session", {})
    notes = course_state.get("notes", [])
    captures = session.get("captures", [])

    lines = [
        "# Resumo da sessao de estudo",
        "",
        f"- Curso: {context.get('courseName', '')}",
        f"- Modulo: {context.get('moduleName', '')}",
        f"- Aula: {context.get('lessonName', '')}",
        f"- Tipo: {context.get('contentType', '')}",
        f"- Status manual: {context.get('status', '')}",
        f"- Data: {datetime.now().isoformat(timespec='seconds')}",
        f"- Tempo de sessao: {stats.get('sessionSeconds', 0)} segundos",
        "",
        "## Principais pontos / notas",
        "",
    ]
    if notes:
        for note in notes[:10]:
            lines.extend([f"### {note.get('title', 'Nota')}", note.get("text", "") or "_Sem texto._", ""])
    else:
        lines.append("_Nenhuma nota salva nesta sessao._")
        lines.append("")

    lines.extend(["## Capturas feitas", ""])
    if captures:
        lines.extend(f"- {path}" for path in captures[:20])
    else:
        lines.append("_Nenhuma captura registrada._")
    lines.append("")
    lines.extend([
        "## Uso responsavel",
        "",
        "O Olheiro apoiou apenas OCR, organizacao, anotacoes e prompts locais. "
        "Nenhuma acao de plataforma de curso deve ser automatizada.",
        "",
    ])
    return "\n".join(lines)


def render_plain_text(course_state: dict[str, Any]) -> str:
    markdown = render_markdown(course_state)
    return markdown.replace("# ", "").replace("## ", "").replace("### ", "")
