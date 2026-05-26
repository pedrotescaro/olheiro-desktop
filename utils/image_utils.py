from __future__ import annotations

from pathlib import Path
from typing import Optional

from PIL import Image, ImageChops, ImageTk


def trim_light_border(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    rgb = rgba.convert("RGB")
    white = Image.new("RGB", rgb.size, (255, 255, 255))
    diff = ImageChops.difference(rgb, white).convert("L")
    mask = diff.point(lambda value: 255 if value > 18 else 0)
    bbox = mask.getbbox()
    if not bbox:
        return rgba
    return rgba.crop(bbox)


def load_photo(path: Path, size: tuple[int, int], trim: bool = False) -> Optional[ImageTk.PhotoImage]:
    if not path.exists():
        return None
    image = Image.open(path).convert("RGBA")
    if trim:
        image = trim_light_border(image)
    image.thumbnail(size, Image.Resampling.LANCZOS)
    return ImageTk.PhotoImage(image)
