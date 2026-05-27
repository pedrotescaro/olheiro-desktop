from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any


@dataclass
class CourseContext:
    course_name: str = "Cisco Networking Academy"
    module_name: str = "Modulo atual"
    lesson_name: str = "Aula atual"
    content_type: str = "texto"
    status: str = "em_andamento"
    video_minute: str = ""
    video_notes: str = ""
    last_prompt_type: str = "text_lesson"
    last_prompt: str = ""

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "CourseContext":
        context = cls()
        for key in asdict(context):
            if key in data:
                setattr(context, key, str(data[key] or ""))
        context.normalize()
        return context

    def normalize(self) -> None:
        self.course_name = self.course_name.strip() or "Curso sem nome"
        self.module_name = self.module_name.strip() or "Modulo atual"
        self.lesson_name = self.lesson_name.strip() or "Aula atual"
        if self.content_type not in ("texto", "video", "atividade", "quiz_estudo", "recurso"):
            self.content_type = "texto"
        if self.status not in ("nao_iniciado", "em_andamento", "revisado", "concluido"):
            self.status = "em_andamento"
        self.video_minute = self.video_minute.strip()
        self.video_notes = self.video_notes.strip()
        self.last_prompt_type = self.last_prompt_type.strip() or "text_lesson"

    def to_dict(self) -> dict[str, Any]:
        self.normalize()
        return asdict(self)


@dataclass
class CourseNote:
    id: str
    title: str
    kind: str
    text: str
    response: str
    prompt: str
    image_path: str = ""
    created_at: str = field(default_factory=lambda: datetime.now().isoformat(timespec="seconds"))

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "CourseNote":
        return cls(
            id=str(data.get("id", "")),
            title=str(data.get("title", "")),
            kind=str(data.get("kind", "nota")),
            text=str(data.get("text", "")),
            response=str(data.get("response", "")),
            prompt=str(data.get("prompt", "")),
            image_path=str(data.get("image_path", "")),
            created_at=str(data.get("created_at", datetime.now().isoformat(timespec="seconds"))),
        )

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def path_to_str(path: Path | str) -> str:
    return str(path)
