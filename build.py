"""打包未签名 wgt：python3 build.py → dist/BiliTV-<版本>-unsigned.wgt。
签名交给 Apps2Samsung（装到电视时用你自己的三星证书）。"""
import re, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
APP = ROOT / 'app'
ver = re.search(r'version="([^"]+)" viewmodes', (APP / 'config.xml').read_text()).group(1)
out = ROOT / 'dist'
out.mkdir(exist_ok=True)
wgt = out / f'BiliTV-{ver}-unsigned.wgt'
with zipfile.ZipFile(wgt, 'w', compression=zipfile.ZIP_DEFLATED) as z:
    for f in sorted(APP.rglob('*')):
        if f.is_file() and not f.name.startswith('.'):
            z.write(f, f.relative_to(APP).as_posix())
print(wgt)
