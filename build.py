#!/usr/bin/env python3
"""Build Diffusion Lab's standalone HTML and a clean GitHub Pages payload.

Uses Python's standard library only. Run from any working directory:
    python build.py          # regenerate index.html and dist/
    python build.py --check  # check the committed index.html; do not write

src/ is the source of truth. dist/ is disposable, and is never committed.
"""
from __future__ import annotations

import argparse
from pathlib import Path
import re
import shutil
import sys

ROOT = Path(__file__).resolve().parent
SOURCES = {"CSS": "style.css", "CORE": "optics.js", "WORKER": "worker.js", "SVG": "svg-import.js", "GAMING": "gaming.js", "TAPE_GEOMETRY": "tape-geometry.js", "TAPE_PLACEMENT": "tape-placement.js", "TAPES": "tape-tools.js", "VIEW3D": "view3d.js", "APP": "app.js"}
TOKEN_PATTERN = re.compile(r"/\*__[A-Z_]+__\*/")


def render_html(source_dir: Path) -> str:
    """Embed the stylesheet, solver, worker and UI without changing their code."""
    html = (source_dir / "index.template.html").read_text(encoding="utf-8")
    for token, name in SOURCES.items():
        marker = f"/*__{token}__*/"
        if html.count(marker) != 1:
            raise ValueError(f"Expected exactly one {marker} placeholder")
        content = (source_dir / name).read_text(encoding="utf-8")
        closing_tag = "</style" if name.endswith(".css") else "</script"
        if closing_tag in content.lower():
            raise ValueError(f"Unexpected {closing_tag} tag in {name}")
        html = html.replace(marker, content)
    if TOKEN_PATTERN.search(html):
        raise ValueError("Unresolved template placeholder")
    return html


def site_files(root: Path, html: str) -> dict[str, bytes]:
    """Allowlist: do not publish workflows, tests, logs, or repository secrets."""
    result = {"index.html": html.encode("utf-8"), ".nojekyll": b""}
    for sample in sorted((root / "examples").glob("*.json")):
        if sample.is_symlink():
            raise ValueError(f"Symbolic links are not allowed: {sample.name}")
        result[f"examples/{sample.name}"] = sample.read_bytes()
    return result


def build(root: Path = ROOT, *, check: bool = False) -> bool:
    html = render_html(root / "src")
    index = root / "index.html"
    if check:
        return index.is_file() and index.read_bytes() == html.encode("utf-8")
    # Validate all inputs before replacing previous output.
    files = site_files(root, html)
    dist = root / "dist"
    if dist.is_symlink():
        raise ValueError("Refusing to replace a symlink named dist")
    if index.is_symlink():
        raise ValueError("Refusing to overwrite a symlink named index.html")
    if dist.exists():
        if not dist.is_dir():
            raise ValueError("dist exists but is not a directory")
        shutil.rmtree(dist)
    dist.mkdir()
    for relative, data in files.items():
        destination = dist / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
    index.write_bytes(html.encode("utf-8"))
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Verify index.html matches src/ without modifying files")
    args = parser.parse_args()
    try:
        success = build(check=args.check)
    except (OSError, ValueError) as error:
        print(f"Build failed: {error}", file=sys.stderr)
        return 1
    if not success:
        print("index.html is missing or stale. Run: python build.py", file=sys.stderr)
        return 1
    if args.check:
        print("index.html matches src/.")
    else:
        print(f"Built index.html ({(ROOT / 'index.html').stat().st_size:,} bytes) and dist/.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
