"""Reproduce delivery images; originals are never overwritten. Requires Pillow."""
from pathlib import Path
from PIL import Image, ImageDraw
import json
root = Path(__file__).resolve().parent.parent
out = root / 'src/games/hikari-no-oekaki/assets'
comparison = root / 'test-results/asset-comparison'
comparison.mkdir(parents=True, exist_ok=True)
rows=[]
for p in sorted((root/'source-assets/hikari-no-oekaki').glob('*.png')):
    im=Image.open(p).convert('RGBA'); small=im.resize((660,660),Image.Resampling.LANCZOS)
    png=comparison/p.name; small.save(png,optimize=True)
    webp=out/(p.stem+'.webp'); small.save(webp,format='WEBP',quality=88,method=6)
    lossless=comparison/(p.stem+'-lossless.webp'); small.save(lossless,format='WEBP',lossless=True,method=6)
    rows.append(dict(name=p.name,original=p.stat().st_size,png660=png.stat().st_size,webp660=webp.stat().st_size,lossless660=lossless.stat().st_size))
    if p.stem=='leaves-top-left':
        panel=Image.new('RGB',(990,370),'#15273b'); d=ImageDraw.Draw(panel)
        for i,(label,img) in enumerate([('Original / 330 CSS px',im),('660 PNG',small),('660 WebP q88',Image.open(webp))]):
            img=img.resize((330,330),Image.Resampling.LANCZOS); panel.paste(img,(i*330,40),img);d.text((i*330+10,12),label,fill='white')
        panel.save(comparison/'comparison.png')
(root/'source-assets/hikari-no-oekaki/optimization.json').write_text(json.dumps(rows,indent=2)+'\n')
print(json.dumps(rows,indent=2))
