from __future__ import annotations

import tempfile
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

import tkinter as tk
from PIL import Image, ImageEnhance, ImageGrab, ImageTk

from config.paths import CAPTURES_DIR
from models.capture import CaptureResult


class ScreenCaptureService:
    def __init__(self, capture_dir: Path = CAPTURES_DIR) -> None:
        self.capture_dir = capture_dir
        self.temp_dir = Path(tempfile.gettempdir()) / "olheiro"

    def capture_region(self, root: tk.Tk, save_to_captures: bool = True) -> Optional[CaptureResult]:
        root.withdraw()
        root.update()
        time.sleep(0.12)
        try:
            region = self._choose_region(root)
        finally:
            root.deiconify()
            root.lift()

        if not region:
            return None

        image = ImageGrab.grab(bbox=region)
        timestamp = datetime.now()
        target_dir = self.capture_dir if save_to_captures else self.temp_dir
        target_dir.mkdir(parents=True, exist_ok=True)
        image_path = target_dir / f"recorte_{timestamp:%Y%m%d_%H%M%S}.png"
        image.save(image_path)
        return CaptureResult(image_path=image_path, timestamp=timestamp, saved_to_captures=save_to_captures)

    def _choose_region(self, root: tk.Tk) -> Optional[tuple[int, int, int, int]]:
        screenshot = ImageGrab.grab()
        screen_w = root.winfo_screenwidth()
        screen_h = root.winfo_screenheight()
        shot_w, shot_h = screenshot.size

        display_image = screenshot
        if (shot_w, shot_h) != (screen_w, screen_h):
            display_image = screenshot.resize((screen_w, screen_h), Image.Resampling.LANCZOS)
        display_image = ImageEnhance.Brightness(display_image).enhance(0.70)

        overlay = tk.Toplevel(root)
        overlay.title("Selecionar recorte")
        overlay.attributes("-fullscreen", True)
        overlay.attributes("-topmost", True)
        overlay.configure(cursor="crosshair")

        canvas = tk.Canvas(overlay, width=screen_w, height=screen_h, highlightthickness=0)
        canvas.pack(fill="both", expand=True)

        photo = ImageTk.PhotoImage(display_image)
        canvas.image_ref = photo
        canvas.create_image(0, 0, image=photo, anchor="nw")
        canvas.create_rectangle(20, 20, 530, 66, fill="#071d49", outline="")
        canvas.create_text(
            36,
            42,
            anchor="w",
            fill="white",
            font=("Segoe UI", 14, "bold"),
            text="Arraste para selecionar. Esc cancela.",
        )

        state: dict[str, Optional[int | tuple[int, int, int, int]]] = {
            "start_x": None,
            "start_y": None,
            "rect": None,
            "region": None,
        }

        def on_press(event: tk.Event) -> None:
            state["start_x"] = event.x
            state["start_y"] = event.y
            rect = state.get("rect")
            if rect is not None:
                canvas.delete(rect)
            state["rect"] = canvas.create_rectangle(
                event.x,
                event.y,
                event.x,
                event.y,
                outline="#12b9c8",
                width=3,
            )

        def on_drag(event: tk.Event) -> None:
            rect = state.get("rect")
            start_x = state.get("start_x")
            start_y = state.get("start_y")
            if rect is None or start_x is None or start_y is None:
                return
            canvas.coords(rect, start_x, start_y, event.x, event.y)

        def on_release(event: tk.Event) -> None:
            start_x = state.get("start_x")
            start_y = state.get("start_y")
            if start_x is None or start_y is None:
                overlay.destroy()
                return

            left, right = sorted((int(start_x), int(event.x)))
            top, bottom = sorted((int(start_y), int(event.y)))
            if right - left < 10 or bottom - top < 10:
                state["region"] = None
            else:
                scale_x = shot_w / screen_w
                scale_y = shot_h / screen_h
                state["region"] = (
                    round(left * scale_x),
                    round(top * scale_y),
                    round(right * scale_x),
                    round(bottom * scale_y),
                )
            overlay.destroy()

        def cancel(_event: tk.Event | None = None) -> None:
            state["region"] = None
            overlay.destroy()

        canvas.bind("<ButtonPress-1>", on_press)
        canvas.bind("<B1-Motion>", on_drag)
        canvas.bind("<ButtonRelease-1>", on_release)
        overlay.bind("<Escape>", cancel)
        overlay.focus_force()
        overlay.wait_window()
        return state["region"]  # type: ignore[return-value]
