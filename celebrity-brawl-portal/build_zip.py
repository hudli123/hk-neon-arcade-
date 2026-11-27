#!/usr/bin/env python3
"""Zip celebrity-brawl-portal/ for a later Poki or CrazyGames upload.

The folder itself is the game. This script only packs it. It does not upload,
and it leaves GitHub Pages, the Zhao Yun campaign, and hkcity untouched.

Usage (from the repo root or from this folder):
  python3 celebrity-brawl-portal/build_zip.py
  python3 build_zip.py

Writes celebrity-brawl-portal.zip next to this folder and prints the size.
The zip root is index.html plus the assets that entry fetches. build_zip.py
itself is not included.
"""
import zipfile
from pathlib import Path

here = Path(__file__).resolve().parent
out = here.parent / "celebrity-brawl-portal.zip"
skip = {"build_zip.py", "celebrity-brawl-portal.zip"}

with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as z:
    for path in sorted(here.rglob("*")):
        if not path.is_file() or path.name in skip:
            continue
        z.write(path, path.relative_to(here).as_posix())

size = out.stat().st_size
print(f"{out}  {size} bytes  ({size / (1024 * 1024):.1f} MiB)")
if size > 50 * 1024 * 1024:
    raise SystemExit("zip is over CrazyGames' 50MB initial-download cap")
