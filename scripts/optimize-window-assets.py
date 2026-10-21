"""Build window WebPs from preserved originals. Requires Pillow 13.0.0."""
from pathlib import Path
import hashlib
import json
import random
from PIL import Image, ImageDraw, ImageFilter, ImageOps

root = Path(__file__).resolve().parent.parent
originals = root / 'source-assets/fukifuki-mado'
delivery = root / 'src/fukifuki-mado/assets'
scenes = json.loads((delivery.parent / 'scenes.json').read_text())
record_path = originals / 'provenance.json'
record = json.loads(record_path.read_text())
fog_delivery = delivery / 'fog'
fog_delivery.mkdir(exist_ok=True)

# A shared, reproducible condensation texture. All radii use this 680px reference.
fog_size = 680
veil_rgb = (248, 252, 252)
veil_center_alpha = 105
veil_edge_alpha = 135
rng = random.Random(20261021)
noise = Image.new('L', (85, 85))
noise.putdata([rng.randrange(256) for _ in range(85 * 85)])
noise = noise.resize((fog_size, fog_size), Image.Resampling.BICUBIC).filter(
    ImageFilter.GaussianBlur(16))
veil = Image.new('RGBA', (fog_size, fog_size), (*veil_rgb, 0))
alpha = []
for y in range(fog_size):
    for x in range(fog_size):
        edge = max(abs(x / (fog_size - 1) * 2 - 1), abs(y / (fog_size - 1) * 2 - 1))
        alpha.append(round(veil_center_alpha + edge ** 3 * (veil_edge_alpha - veil_center_alpha)
                           + (noise.getpixel((x, y)) - 128) * 0.3))
veil.putalpha(Image.frombytes('L', (fog_size, fog_size), bytes(alpha)))
drops = Image.new('RGBA', veil.size)
draw = ImageDraw.Draw(drops)
for _ in range(90):
    x, y = rng.uniform(5, 675), rng.uniform(5, 675)
    radius = rng.uniform(1.2, 3.5)
    bounds = (x - radius, y - radius * 1.35, x + radius, y + radius * 1.35)
    draw.ellipse(bounds, fill=(255, 255, 255, 13))
    draw.arc(bounds, 35, 155, fill=(103, 148, 155, 35), width=1)
    draw.arc(bounds, 210, 300, fill=(255, 255, 255, 95), width=1)

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
    # Pre-render blur and condensation so wiping needs only Canvas compositing.
    fog = image.copy()
    fog.thumbnail((fog_size, fog_size), Image.Resampling.LANCZOS)
    blur_radius = 34 * max(fog.size) / fog_size
    fog = fog.filter(ImageFilter.GaussianBlur(blur_radius)).convert('RGBA')
    fog = Image.alpha_composite(fog, veil.resize(fog.size, Image.Resampling.LANCZOS))
    fog = Image.alpha_composite(fog, drops.resize(fog.size, Image.Resampling.LANCZOS))
    fog_output = fog_delivery / f'{scene["id"]}.webp'
    fog.convert('RGB').save(fog_output, 'WEBP', quality=82, method=6)
    rows.append({
        'id': scene['id'],
        'original': source.name,
        'sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        'original_bytes': source.stat().st_size,
        'output': output.name,
        'output_bytes': output.stat().st_size,
        'output_size': list(image.size),
        'webp_quality': 86,
        'fog': {
            'output': f'fog/{fog_output.name}',
            'output_bytes': fog_output.stat().st_size,
            'sha256': hashlib.sha256(fog_output.read_bytes()).hexdigest(),
            'output_size': list(fog.size),
            'blur_radius': blur_radius,
            'webp_quality': 82,
            'texture_seed': 20261021,
            'veil_rgb': list(veil_rgb),
            'veil_center_alpha': veil_center_alpha,
            'veil_edge_alpha': veil_edge_alpha,
        },
    })
record['images'] = rows
record['added_images_source'] = 'Five images supplied by the user on 2026-10-21. Generation tool and third-party license details were not supplied.'
record_path.write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
for row in rows:
    print(f'{row["id"]}: {row["original_bytes"]:,} -> {row["output_bytes"]:,} bytes; fog {row["fog"]["output_bytes"]:,} bytes')
