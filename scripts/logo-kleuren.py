"""Kleurt het originele PickMyRide-logo om naar het warme merkpalet, met behoud van vorm en anti-aliasing.
Elke pixel wordt gezien als een menging van wit met één inktkleur (blauw of groen); de mengverhouding wordt alfa.
Gebruik: python3 scripts/logo-kleuren.py"""
import numpy as np
from PIL import Image
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
_orig = Image.open(ROOT / 'docs/merk/logo-origineel.png').convert('RGBA')
_bg = Image.new('RGBA', _orig.size, (255, 255, 255, 255))
src = np.asarray(Image.alpha_composite(_bg, _orig).convert('RGB')).astype(float)   # transparante achtergrond eerst op wit
h, w, _ = src.shape
white = np.array([255., 255., 255.])

def median(mask): return np.median(src[mask], axis=0)
r, g, b = src[..., 0], src[..., 1], src[..., 2]
navy = median((b > r + 30) & (b > g) & (src.sum(-1) < 300))
green = median((g > r + 60) & (g > b + 40) & (src.sum(-1) < 520))
print('blauw in origineel', navy.round(), 'groen', green.round())

def project(ref):
    d = white - ref; q = white - src
    t = (q @ d) / (d @ d)
    res = np.linalg.norm(q - t[..., None] * d, axis=-1)
    return np.clip(t, 0, 1), res
ta, ra = project(navy); tb, rb = project(green)
is_green = rb < ra
alpha = np.where(is_green, tb, ta)
alpha[alpha < 0.04] = 0

def hexrgb(s): return np.array([int(s[i:i + 2], 16) for i in (1, 3, 5)], float)

def render(main, accent, name):
    out = np.zeros((h, w, 4))
    col = np.where(is_green[..., None], hexrgb(accent), hexrgb(main))
    out[..., :3] = col; out[..., 3] = alpha * 255
    img = Image.fromarray(out.round().astype(np.uint8), 'RGBA')
    img = img.crop(img.getbbox())
    img.save(ROOT / f'docs/merk/{name}.png')
    for height, suffix in [(96, ''), (192, '@2x')]:
        img.resize((round(img.width * height / img.height), height), Image.LANCZOS).save(ROOT / f'public/img/{name}{suffix}.png', optimize=True)
    return img

dark = render('#3A2418', '#A88462', 'logo-donker')      # op lichte achtergrond
render('#F3E9D8', '#C4A27E', 'logo-licht')              # op donkerbruine achtergrond (camel iets lichter voor contrast)
render('#032C58', '#2CAE49', 'logo-blauw')              # originele kleuren (blauwe versie), op lichte achtergrond
render('#FFFFFF', '#3CC25A', 'logo-blauw-licht')        # blauwe versie op donkerblauwe achtergrond

# Pin als icoon: linkerdeel tot de eerste lege kolom na de pin
def icons(logo_img, prefix, bg180):
    a = np.asarray(logo_img)[..., 3]
    cols = np.where(a.max(axis=0) == 0)[0]
    cut = cols[cols > 20][0] if len(cols[cols > 20]) else a.shape[1] // 5
    pin = logo_img.crop((0, 0, cut, logo_img.height)); pin = pin.crop(pin.getbbox())
    side = max(pin.size) + 16
    for size in (32, 180, 512):
        canvas = Image.new('RGBA', (side, side), bg180 if size == 180 else (0, 0, 0, 0))
        canvas.paste(pin, ((side - pin.width) // 2, (side - pin.height) // 2), pin)
        canvas.resize((size, size), Image.LANCZOS).save(ROOT / f'public/img/{prefix}-{size}.png', optimize=True)
icons(dark, 'icoon', (250, 246, 241, 255))
icons(Image.open(ROOT / 'docs/merk/logo-blauw.png'), 'icoon-blauw', (255, 255, 255, 255))
print('klaar')
