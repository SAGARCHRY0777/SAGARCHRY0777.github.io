#!/usr/bin/env python3
"""
build_artifact.py
=================
Flattens the multi-file site into ONE self-contained HTML file.

Two outputs, from the same source:

  dist/standalone.html   a complete document — open it straight off disk,
                         e-mail it, or drop it anywhere. No server needed.
  dist/artifact.html     the same page as a body fragment, for publishing as
                         a Claude Artifact (which supplies its own wrapper).

    python scripts/build_artifact.py

ES-module imports are resolved by concatenating the modules in dependency
order and stripping the import/export keywords — the module graph is small,
flat, and has no name collisions, which is checked below.
"""

from __future__ import annotations

import base64
import mimetypes
import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
DIST = ROOT / "dist"

ARTIFACT_TITLE = "Sagar Chaudhary"

CSS_ORDER = ["tokens", "themes", "base", "layout", "components", "instruments", "motion"]

# dependency order — data first (query.js indexes it at load), utils next
JS_ORDER = [
    "data", "utils", "theme", "scroll", "preloader", "grain", "cursor",
    "effects", "hero-gl", "signal", "archive", "marquee", "render", "patchbay", "bench", "historian", "instruments", "visits", "nametype", "match", "query", "main",
]

# handles both single-line and multi-line `import { a, b } from './x.js';`
IMPORT_RE = re.compile(
    r'^[ \t]*import\s+[\w*{}\s,$]+?\s*from\s*["\'][^"\']+["\'];?[ \t]*\n',
    re.M,
)
EXPORT_RE = re.compile(r"^\s*export\s+(?=(const|let|var|function|class|async))", re.M)


def data_uri(path: Path) -> str:
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}"


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def flatten_js() -> str:
    chunks = []
    declared: dict[str, str] = {}

    for name in JS_ORDER:
        src = read(ROOT / "js" / f"{name}.js")
        src = IMPORT_RE.sub("", src)
        src = EXPORT_RE.sub("", src)

        # guard against two modules declaring the same top-level name
        for m in re.finditer(r"^(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)",
                             src, re.M):
            sym = m.group(1)
            if sym in declared:
                sys.exit(f"name collision: '{sym}' declared in "
                         f"{declared[sym]}.js and {name}.js — rename one before inlining")
            declared[sym] = name

        chunks.append(f"/* ---- {name}.js ---- */\n{src.strip()}\n")

    return "\n".join(chunks)


def flatten_css() -> str:
    return "\n".join(
        f"/* ---- {n}.css ---- */\n{read(ROOT / 'css' / f'{n}.css').strip()}"
        for n in CSS_ORDER
    )


def main() -> None:
    html = read(ROOT / "index.html")
    css = flatten_css()
    js = flatten_js()

    # --- swap the linked css/js for inline blocks --------------------------
    html = re.sub(r'\s*<link rel="stylesheet" href="css/[^"]+">', "", html)
    html = html.replace(
        '<script type="module" src="js/main.js"></script>',
        f'<script type="module">\n{js}\n</script>',
    )
    head_close = html.index("</head>")
    html = html[:head_close] + f"<style>\n{css}\n</style>\n" + html[head_close:]

    # assets that only exist once the folder is deployed
    html = re.sub(r'\s*<link rel="icon"[^>]*>', "", html)
    html = re.sub(r'\s*<link rel="manifest"[^>]*>', "", html)

    DIST.mkdir(exist_ok=True)
    (DIST / "standalone.html").write_text(html, encoding="utf-8")

    # ---- artifact-only surgery -------------------------------------------
    # 1. the portrait becomes a data URI: a single-file build has no /assets
    art = html.replace("assets/img/portrait.jpg", data_uri(ROOT / "assets/img/portrait-sm.jpg"))
    art = art.replace('width="880" height="880"', 'width="440" height="440"')

    # 2. the sandboxed viewer cannot start a download, so the PDF links would
    #    silently do nothing. Say where to get them instead of pretending.
    art = art.replace("renderDownloads();", "renderDownloadsNotice();")
    art = re.sub(
        r'href="assets/docs/\$\{escapeHtml\(pdfFor\(r\.variant\)\)\}" download',
        'href="https://github.com/SAGARCHRY0777" target="_blank" rel="noopener"',
        art,
    )
    art = art.replace("<span>Download this variant</span>",
                      "<span>Variant: this one</span>")

    # 3. neutralise the dead renderDownloads() template too — the viewer's
    #    scanner reads the source, not the call graph, and a `download`
    #    attribute anywhere reads as an offer the sandbox cannot honour.
    art = art.replace('href="assets/docs/${r.file}" download', 'data-pdf="${r.file}"')
    assert "assets/docs/" not in art, "a download link survived into the artifact build"

    # --- artifact variant: body fragment, title first ----------------------
    # The deployed site wants an SEO title; an Artifact gallery wants a name.
    title = ARTIFACT_TITLE
    style = re.search(r"<style>.*?</style>", art, re.S).group(0)
    fonts = re.search(r'<link rel="stylesheet" href="https://fonts\.googleapis[^>]*>', art).group(0)
    ld = re.search(r'<script type="application/ld\+json">.*?</script>', art, re.S).group(0)
    body = re.search(r"<body>(.*?)</body>", art, re.S).group(1)

    fragment = (
        f"<title>{title}</title>\n"
        # the head-level no-js -> js stamp is lost with the head; restore it
        '<script>document.documentElement.classList.remove("no-js");'
        'document.documentElement.classList.add("js");</script>\n'
        f"{fonts}\n"
        f"{style}\n"
        f"{ld}\n"
        f"{body.strip()}\n"
    )
    (DIST / "artifact.html").write_text(fragment, encoding="utf-8")

    kb = lambda p: f"{p.stat().st_size / 1024:.0f} KB"
    print(f"dist/standalone.html  {kb(DIST / 'standalone.html')}")
    print(f"dist/artifact.html    {kb(DIST / 'artifact.html')}")
    print(f"{len(JS_ORDER)} modules, {len(CSS_ORDER)} stylesheets inlined")


if __name__ == "__main__":
    main()
