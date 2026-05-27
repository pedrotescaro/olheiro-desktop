from __future__ import annotations

import json
import re
import shutil
import time
from dataclasses import asdict
from datetime import datetime
from pathlib import Path
from typing import Any, Callable

from config.paths import COURSE_STATE_PATH, COURSES_DIR
from config.prompts import COURSE_PROMPTS, PROMPT_LABELS
from models.capture import CaptureResult
from models.course import CourseContext, CourseNote


class CourseService:
    def __init__(self, on_log: Callable[[str], None], courses_dir: Path = COURSES_DIR) -> None:
        self.on_log = on_log
        self.courses_dir = courses_dir
        self.context = CourseContext()
        self.notes: list[CourseNote] = []
        self.session_started_at: float | None = None
        self.session_total_seconds = 0
        self.completed_lessons: set[str] = set()
        self.reviewed_modules: set[str] = set()
        self.session_captures: list[str] = []
        self._load()

    def serialize(self) -> dict[str, Any]:
        return {
            "context": self._serialize_context(),
            "notes": [note.to_dict() for note in self.notes[:20]],
            "session": self._serialize_session(),
            "stats": self.stats(),
            "paths": {
                "coursesDir": str(self.courses_dir),
                "currentLessonDir": str(self.current_lesson_dir()),
            },
            "promptLabels": PROMPT_LABELS,
        }

    def update_context(self, payload: dict[str, Any]) -> dict[str, Any]:
        data = self.context.to_dict()
        for key in data:
            camel = snake_to_camel(key)
            if camel in payload:
                data[key] = payload[camel]
            elif key in payload:
                data[key] = payload[key]
        self.context = CourseContext.from_dict(data)
        self._track_progress()
        self._save()
        return self.serialize()

    def build_prompt(self, prompt_type: str, ocr_text: str = "", extra_text: str = "") -> str:
        prompt_key = prompt_type if prompt_type in COURSE_PROMPTS else "text_lesson"
        self.context.last_prompt_type = prompt_key
        content_parts = [ocr_text.strip(), self.context.video_notes.strip(), extra_text.strip()]
        content = "\n\n".join(part for part in content_parts if part)
        if not content:
            content = "[Cole aqui o texto OCR, anotacao ou transcricao que voce quer estudar.]"
        video_line = f"\nMinuto do video: {self.context.video_minute}" if self.context.video_minute else ""
        prompt = (
            f"{COURSE_PROMPTS[prompt_key]}\n\n"
            f"Contexto do estudo:\n"
            f"- Curso: {self.context.course_name}\n"
            f"- Modulo: {self.context.module_name}\n"
            f"- Aula: {self.context.lesson_name}\n"
            f"- Tipo de conteudo: {self.context.content_type}{video_line}\n\n"
            f"Conteudo capturado/anotado:\n{content}\n\n"
            "Importante: mantenha o foco em estudo, explicacao e raciocinio. "
            "Nao automatize respostas, nao tente burlar a plataforma e nao avance nada por mim."
        )
        self.context.last_prompt = prompt
        self._save()
        return prompt

    def attach_capture(self, result: CaptureResult, prompt: str = "") -> dict[str, Any]:
        target_dir = self.current_lesson_dir()
        target_dir.mkdir(parents=True, exist_ok=True)
        stem = result.image_path.stem
        image_target = target_dir / f"{stem}.png"
        text_target = target_dir / f"{stem}.txt"
        meta_target = target_dir / f"{stem}.json"

        try:
            shutil.copy2(result.image_path, image_target)
        except OSError:
            image_target = result.image_path

        metadata = {
            "course": self.context.course_name,
            "module": self.context.module_name,
            "lesson": self.context.lesson_name,
            "content_type": self.context.content_type,
            "status": self.context.status,
            "image_path": str(image_target),
            "source_image_path": str(result.image_path),
            "ocr_text": result.ocr_text,
            "ocr_status": result.ocr_status,
            "prompt_used": prompt,
            "created_at": result.timestamp.isoformat(),
        }
        text_target.write_text(result.ocr_text or "", encoding="utf-8")
        meta_target.write_text(json.dumps(metadata, indent=2, ensure_ascii=False), encoding="utf-8")
        self.session_captures.insert(0, str(image_target))
        self.session_captures = self.session_captures[:100]
        self._save()
        self.on_log(f"Modo Curso salvou captura em {target_dir}.")
        return metadata

    def save_note(self, payload: dict[str, Any]) -> dict[str, Any]:
        note_id = datetime.now().strftime("%Y%m%d_%H%M%S")
        kind = str(payload.get("kind", "nota") or "nota")
        title = str(payload.get("title", PROMPT_LABELS.get(kind, "Nota")) or "Nota")
        text = str(payload.get("text", "") or "")
        response = str(payload.get("response", "") or "")
        prompt = str(payload.get("prompt", self.context.last_prompt) or "")
        image_path = str(payload.get("imagePath", "") or "")
        note = CourseNote(note_id, title, kind, text, response, prompt, image_path)
        self.notes.insert(0, note)
        self.notes = self.notes[:100]

        target_dir = self.current_lesson_dir()
        target_dir.mkdir(parents=True, exist_ok=True)
        base = target_dir / f"{note_id}_{slugify(kind)}"
        md = render_note_markdown(self.context, note)
        (base.with_suffix(".md")).write_text(md, encoding="utf-8")
        (base.with_suffix(".json")).write_text(json.dumps(note.to_dict(), indent=2, ensure_ascii=False), encoding="utf-8")
        self._save()
        self.on_log(f"Nota salva no Modo Curso: {title}.")
        return {"ok": True, "message": "Nota salva.", "note": note.to_dict(), "course": self.serialize()}

    def start_session(self) -> dict[str, Any]:
        if self.session_started_at is None:
            self.session_started_at = time.time()
            self.on_log("Sessao de estudo iniciada.")
            self._save()
        return self.serialize()

    def pause_session(self) -> dict[str, Any]:
        if self.session_started_at is not None:
            self.session_total_seconds += int(time.time() - self.session_started_at)
            self.session_started_at = None
            self.on_log("Sessao de estudo pausada.")
            self._save()
        return self.serialize()

    def stats(self) -> dict[str, Any]:
        capture_count = len(list(self.courses_dir.glob("**/recorte_*.png"))) if self.courses_dir.exists() else 0
        note_count = len(list(self.courses_dir.glob("**/*.md"))) if self.courses_dir.exists() else 0
        return {
            "totalCaptures": capture_count,
            "totalNotes": note_count,
            "reviewedModules": len(self.reviewed_modules),
            "completedLessons": len(self.completed_lessons),
            "sessionSeconds": self._session_seconds(),
        }

    def current_lesson_dir(self) -> Path:
        return (
            self.courses_dir
            / slugify(self.context.course_name)
            / slugify(self.context.module_name, prefix="modulo")
            / slugify(self.context.lesson_name, prefix="aula")
        )

    def _serialize_context(self) -> dict[str, Any]:
        data = self.context.to_dict()
        return {snake_to_camel(key): value for key, value in data.items()}

    def _serialize_session(self) -> dict[str, Any]:
        return {
            "running": self.session_started_at is not None,
            "startedAt": datetime.fromtimestamp(self.session_started_at).isoformat(timespec="seconds") if self.session_started_at else "",
            "totalSeconds": self._session_seconds(),
            "captures": self.session_captures[:20],
        }

    def _session_seconds(self) -> int:
        current = int(time.time() - self.session_started_at) if self.session_started_at is not None else 0
        return self.session_total_seconds + current

    def _track_progress(self) -> None:
        lesson_key = f"{self.context.course_name}|{self.context.module_name}|{self.context.lesson_name}"
        module_key = f"{self.context.course_name}|{self.context.module_name}"
        if self.context.status == "concluido":
            self.completed_lessons.add(lesson_key)
        if self.context.status in ("revisado", "concluido"):
            self.reviewed_modules.add(module_key)

    def _load(self) -> None:
        if not COURSE_STATE_PATH.exists():
            return
        try:
            data = json.loads(COURSE_STATE_PATH.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return
        if not isinstance(data, dict):
            return
        self.context = CourseContext.from_dict(data.get("context", {}))
        self.notes = [CourseNote.from_dict(item) for item in data.get("notes", []) if isinstance(item, dict)]
        self.session_total_seconds = int(data.get("session_total_seconds", 0) or 0)
        self.completed_lessons = set(str(item) for item in data.get("completed_lessons", []))
        self.reviewed_modules = set(str(item) for item in data.get("reviewed_modules", []))
        self.session_captures = [str(item) for item in data.get("session_captures", [])]

    def _save(self) -> None:
        COURSE_STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "context": self.context.to_dict(),
            "notes": [note.to_dict() for note in self.notes],
            "session_total_seconds": self._session_seconds() if self.session_started_at is None else self.session_total_seconds,
            "completed_lessons": sorted(self.completed_lessons),
            "reviewed_modules": sorted(self.reviewed_modules),
            "session_captures": self.session_captures,
        }
        COURSE_STATE_PATH.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


def render_note_markdown(context: CourseContext, note: CourseNote) -> str:
    return (
        f"# {note.title}\n\n"
        f"- Curso: {context.course_name}\n"
        f"- Modulo: {context.module_name}\n"
        f"- Aula: {context.lesson_name}\n"
        f"- Tipo: {context.content_type}\n"
        f"- Criado em: {note.created_at}\n\n"
        f"## Texto/nota\n\n{note.text or '_Sem texto manual._'}\n\n"
        f"## Prompt usado\n\n```text\n{note.prompt or ''}\n```\n\n"
        f"## Resposta/manual do ChatGPT\n\n{note.response or '_Nao informada._'}\n"
    )


def slugify(value: str, prefix: str | None = None) -> str:
    clean = value.strip().lower()
    clean = clean.replace("ç", "c").replace("ã", "a").replace("á", "a").replace("à", "a").replace("â", "a")
    clean = clean.replace("é", "e").replace("ê", "e").replace("í", "i").replace("ó", "o").replace("ô", "o").replace("õ", "o").replace("ú", "u")
    clean = re.sub(r"[^a-z0-9]+", "_", clean).strip("_")
    clean = clean or "sem_nome"
    if prefix and not clean.startswith(f"{prefix}_"):
        return f"{prefix}_{clean}"
    return clean


def snake_to_camel(value: str) -> str:
    first, *rest = value.split("_")
    return first + "".join(part.capitalize() for part in rest)
