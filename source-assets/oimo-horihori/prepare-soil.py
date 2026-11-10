"""Pillowで調整済み原本から配信用の土を作る。原本は変更しない。"""
from pathlib import Path
import hashlib
import json
import math
from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter

source_dir = Path(__file__).resolve().parent
output_dir = source_dir.parent.parent / 'src/oimo-horihori/assets'
original = source_dir / 'soil-original.jpg'
image = Image.open(original).convert('RGB').resize((1024, 1024), Image.Resampling.LANCZOS)
# 両端を同じ値に寄せ、繰り返し境界の明暗差だけを抑える。
pixels = image.load()
for axis in (0, 1):
    for position in range(1024):
        for offset in range(48):
            a = (offset, position) if axis == 0 else (position, offset)
            b = (1023-offset, position) if axis == 0 else (position, 1023-offset)
            left, right = pixels[a], pixels[b]
            weight = (1-offset/48)**2 * 0.5
            pixels[a] = tuple(round(l*(1-weight)+r*weight) for l,r in zip(left,right))
            pixels[b] = tuple(round(r*(1-weight)+l*weight) for l,r in zip(left,right))
surface = ImageEnhance.Contrast(image).enhance(0.85)
surface = ImageEnhance.Brightness(surface).enhance(1.65)
surface = Image.blend(surface, Image.new('RGB', surface.size, '#c18b50'), 0.12)
surface.save(output_dir / 'soil-surface.webp', quality=82, method=6)
depth = ImageEnhance.Contrast(image).enhance(0.65)
depth = ImageEnhance.Brightness(depth).enhance(0.9)
depth = Image.blend(depth, Image.new('RGB', depth.size, '#815438'), 0.25)
depth.save(output_dir / 'soil-depth.webp', quality=78, method=6)
# 異なる位置を切り出して不規則な輪郭と陰影を付ける。各セルは透過の余白を含む。
sheet = Image.new('RGBA', (384, 96))
for i, (x,y) in enumerate(((90,120), (610,240), (350,700), (780,800))):
    crop = surface.crop((x,y,x+96,y+96)).convert('RGBA')
    mask = Image.new('L', (96,96))
    points = []
    for n in range(14):
        angle = n*math.tau/14
        radius = 31 + 6*math.sin(n*2.7+i*1.9)
        points.append((48+radius*math.cos(angle), 48+radius*0.8*math.sin(angle)))
    ImageDraw.Draw(mask).polygon(points, fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(0.65))
    light = Image.new('RGB', (96,96))
    draw = ImageDraw.Draw(light)
    for row in range(96):
        value = round(255-row*0.95)
        draw.line((0,row,96,row), fill=(value,value,value))
    crop = ImageChops.multiply(crop, light.convert('RGBA'))
    crop.putalpha(mask)
    sheet.paste(crop, (96*i,0))
sheet.save(output_dir / 'soil-clods.webp', quality=85, method=6)
files = [original] + [output_dir / name for name in ('soil-surface.webp','soil-depth.webp','soil-clods.webp')]
records = []
for path in files:
    with Image.open(path) as asset:
        records.append({'file': str(path.relative_to(source_dir.parent.parent)), 'width': asset.width, 'height': asset.height, 'bytes': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
(source_dir / 'soil-provenance.json').write_text(json.dumps({'source': 'https://polyhaven.com/a/farm_soil', 'author': 'Amal Kumar', 'license': 'CC0-1.0', 'license_url': 'https://polyhaven.com/license', 'original': 'User-adjusted diffuse image; upstream unmodified image is not included.', 'files': records}, ensure_ascii=False, indent=2)+'\n')
print(json.dumps(records, indent=2))
