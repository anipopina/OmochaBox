"""Build window WebPs from preserved originals. Requires Pillow 13.0.0."""
from pathlib import Path
import hashlib
import json
from PIL import Image, ImageOps

root = Path(__file__).resolve().parent.parent
originals = root / 'source-assets/fukifuki-mado'
delivery = root / 'src/fukifuki-mado/assets'
scenes = json.loads((delivery.parent / 'scenes.json').read_text())
record_path = originals / 'provenance.json'
record = json.loads(record_path.read_text())
rows = []
for scene in scenes:
    matches = list(originals.glob(f'{scene["id"]}-original.*'))
    if len(matches) != 1:
        raise ValueError(f'{scene["id"]}: expected exactly one original')
    source = matches[0]
    output = delivery / f'{scene["id"]}.webp'
    with Image.open(source) as original:
        image = ImageOps.exif_transpose(original).convert('RGB')
        image.thumbnail((1360, 1360), Image.Resampling.LANCZOS)
        image.save(output, 'WEBP', quality=86, method=6)
    rows.append({
        'id': scene['id'],
        'original': source.name,
        'sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        'original_bytes': source.stat().st_size,
        'output': output.name,
        'output_bytes': output.stat().st_size,
        'output_size': list(image.size),
        'webp_quality': 86,
    })
record['images'] = rows
record['added_images_source'] = 'Five images supplied by the user on 2026-10-21. Generation tool and third-party license details were not supplied.'
record_path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
for row in rows:
    print(f'{row["id"]}: {row["original_bytes"]:,} -> {row["output_bytes"]:,} bytes')
