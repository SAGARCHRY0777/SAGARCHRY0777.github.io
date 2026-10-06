#!/usr/bin/env python3
"""
build_assets.py
===============
Prepares every binary the site needs, from the originals that live elsewhere
in the JobHunt folder. Re-runnable; overwrites its own output only.

    python scripts/build_assets.py

Produces
  assets/img/portrait.jpg       880px  — the section portrait
  assets/img/portrait-sm.jpg    440px  — inlined into dist/ builds
  assets/img/og.png             1200x630 social card, drawn here
  assets/docs/*.pdf             the six resume variants + credentials
"""

from __future__ import annotations

import shutil
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).parent.parent
REPO = Path(os.environ.get("JOBHUNT", r"G:/My Drive/JobHunt"))  # data lives outside this repo; override with JOBHUNT=
IMG = ROOT / "assets" / "img"
DOCS = ROOT / "assets" / "docs"

SOURCE_PHOTO = REPO / "PHOTO" / "sagar_image.jpg"

# palette — must stay in step with css/tokens.css
VOID = (10, 9, 8)
PANEL = (20, 18, 15)
INK = (239, 234, 225)
DIM = (138, 129, 117)
SODIUM = (255, 122, 24)
TRACE = (53, 214, 196)


def font(size: int, bold: bool = False):
    """Windows ships DejaVu-free, so fall back through what is actually here."""
    candidates = [
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/segoeuib.ttf" if bold else "C:/Windows/Fonts/segoeui.ttf",
    ]
    for c in candidates:
        if Path(c).exists():
            return ImageFont.truetype(c, size)
    return ImageFont.load_default()


def mono(size: int):
    for c in ["C:/Windows/Fonts/consola.ttf", "C:/Windows/Fonts/cour.ttf"]:
        if Path(c).exists():
            return ImageFont.truetype(c, size)
    return ImageFont.load_default()


# --------------------------------------------------------------------------- #
def build_portraits() -> Image.Image:
    im = Image.open(SOURCE_PHOTO).convert("RGB")

    # NO CROP. Every crop of this source loses either the hair or the chin,
    # so the site shows the whole frame and the CSS aspect-ratio is generated
    # to match it exactly — see the printed line below and .portrait img.
    w, h = im.size
    scale = 1060 / h
    out = im.resize((round(w * scale), 1060), Image.LANCZOS)

    IMG.mkdir(parents=True, exist_ok=True)
    out.save(IMG / "portrait.jpg", quality=86, optimize=True)
    out.resize((out.width // 2, out.height // 2), Image.LANCZOS).save(
        IMG / "portrait-sm.jpg", quality=80, optimize=True)
    print(f"  assets/img/portrait.jpg      {out.width}x{out.height} (uncropped from {w}x{h})")
    print(f"  assets/img/portrait-sm.jpg   {out.width // 2}x{out.height // 2}")
    print(f"  -> .portrait img aspect-ratio must be {w} / {h}")
    return im


def duotone(im: Image.Image, dark, light) -> Image.Image:
    """Map luminance onto a two-colour ramp — the site's portrait treatment."""
    g = im.convert("L")
    ramp = []
    for i in range(256):
        t = i / 255
        ramp.append(tuple(int(dark[c] + (light[c] - dark[c]) * t) for c in range(3)))
    out = Image.new("RGB", im.size)
    px = out.load()
    gp = g.load()
    for y in range(im.size[1]):
        for x in range(im.size[0]):
            px[x, y] = ramp[gp[x, y]]
    return out


def build_og(portrait: Image.Image) -> None:
    W, H = 1200, 630
    card = Image.new("RGB", (W, H), VOID)
    d = ImageDraw.Draw(card)

    # --- contour-ish backdrop: concentric warped rings, echoing the hero ----
    import math
    band = Image.new("RGB", (W, H), VOID)
    bd = ImageDraw.Draw(band)
    for i in range(26):
        r = 90 + i * 46
        wob = 16 * math.sin(i * 0.9)
        bd.ellipse(
            [W * 0.72 - r + wob, H * 0.32 - r * 0.78, W * 0.72 + r + wob, H * 0.32 + r * 0.78],
            outline=tuple(int(c * 0.30) for c in SODIUM) if i % 3 else tuple(int(c * 0.22) for c in TRACE),
            width=2,
        )
    band = band.filter(ImageFilter.GaussianBlur(0.6))
    card = Image.blend(card, band, 0.85)
    d = ImageDraw.Draw(card)

    # --- portrait, duotoned, right side ------------------------------------
    # the card runs its own composition, so it crops to 4:5 here rather than
    # distorting the uncropped source
    pw, ph = 336, 420
    sw, sh = portrait.size
    box_h = min(sh, int(sw / (pw / ph)))
    tile = portrait.crop((0, 0, sw, box_h))      # keep the head, drop the chest
    p = duotone(tile.resize((pw, ph), Image.LANCZOS), (14, 12, 10), (255, 178, 112))
    mask = Image.new("L", (pw, ph), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, pw - 1, ph - 1], radius=18, fill=255)
    px, py = W - pw - 64, (H - ph) // 2
    card.paste(p, (px, py), mask)
    d.rounded_rectangle([px, py, px + pw - 1, py + ph - 1], radius=18, outline=SODIUM, width=2)

    # --- type ---------------------------------------------------------------
    x = 72
    d.text((x, 96), "SEC.01 / IDENT", font=mono(22), fill=SODIUM)
    d.text((x, 146), "SAGAR", font=font(96, True), fill=INK)
    d.text((x, 246), "CHAUDHARY", font=font(96, True), fill=INK)

    d.line([x, 380, x + 620, 380], fill=(44, 39, 33), width=2)
    d.text((x, 404), "AI ENGINEER  ·  INDUSTRIAL & MANUFACTURING SYSTEMS",
           font=mono(23), fill=INK)
    d.multiline_text(
        (x, 448),
        "IT-OT pipelines · LSTM anomaly detection\nRAG over technical reports · model serving at scale",
        font=mono(21), fill=DIM, spacing=10,
    )
    d.text((x, 546), "sagarchry0777.github.io", font=mono(22), fill=TRACE)

    # sodium rule along the bottom, like the boot progress bar
    d.rectangle([0, H - 8, W, H], fill=SODIUM)

    card.save(IMG / "og.png", optimize=True)
    print(f"  assets/img/og.png            {W}x{H}")


def copy_resumes() -> None:
    DOCS.mkdir(parents=True, exist_ok=True)
    pairs = [
        ("02_resumes/Sagar_Chaudhary_R0-Master.pdf", "Sagar_Chaudhary_Master.pdf"),
        ("02_resumes/Sagar_Chaudhary_R1-Industrial-IIoT.pdf", "Sagar_Chaudhary_Industrial.pdf"),
        ("02_resumes/Sagar_Chaudhary_R2-GenAI-LLM.pdf", "Sagar_Chaudhary_GenAI.pdf"),
        ("02_resumes/Sagar_Chaudhary_R3-CV-Perception.pdf", "Sagar_Chaudhary_CV.pdf"),
        ("02_resumes/Sagar_Chaudhary_R4-MLOps-Platform.pdf", "Sagar_Chaudhary_MLOps.pdf"),
        ("02_resumes/Sagar_Chaudhary_R5-Backend-ML.pdf", "Sagar_Chaudhary_Backend.pdf"),
    ]
    for src, dst in pairs:
        s = REPO / src
        if s.exists():
            shutil.copy2(s, DOCS / dst)
            print(f"  assets/docs/{dst}")
        else:
            print(f"  MISSING {src} — rebuild resumes first")


def main() -> None:
    print("portraits")
    portrait = build_portraits()
    print("social card")
    build_og(portrait)
    print("resumes")
    copy_resumes()


if __name__ == "__main__":
    main()
