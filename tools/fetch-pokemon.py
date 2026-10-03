#!/usr/bin/env python3
"""Fetch selected PokéAPI official artwork and store small transparent WebP assets.

Only needed to refresh artwork, never during an ordinary build. Requires Pillow.
The manifest fixes each existing reward key so game registration order cannot
change a child's collection. Names and category flags come from PokéAPI CSV data.
"""
import concurrent.futures
import hashlib
import io
import json
from pathlib import Path
import urllib.request

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'src/pokemon'
manifest = json.loads((ASSETS / 'manifest.json').read_text())


def fetch(entry):
    url = ('https://raw.githubusercontent.com/PokeAPI/sprites/master/'
           f"sprites/pokemon/other/official-artwork/{entry['id']}.png")
    with urllib.request.urlopen(url, timeout=40) as response:
        raw = response.read()
    art = Image.open(io.BytesIO(raw)).convert('RGBA')
    if art.width < 100 or art.height < 100:
        raise ValueError(f"Artwork too small: {entry['id']}")
    art.thumbnail((256, 256), Image.Resampling.LANCZOS)
    destination = ASSETS / entry['file']
    art.save(destination, 'WEBP', quality=85, method=6)
    return entry['id'], url, hashlib.sha256(destination.read_bytes()).hexdigest()


with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    for id, url, checksum in pool.map(fetch, manifest['pokemon'].values()):
        manifest['pokemon'][str(id)].update(source=url, sha256=checksum)
(ASSETS / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
print(f"Saved {len(manifest['pokemon'])} transparent Pokémon illustrations")
