"""Build a standalone Windows x64 ZIP on a connected build machine (Python stdlib only)."""
import argparse, hashlib, json, pathlib, tempfile, urllib.request, zipfile
VERSION = '24.21.0'
ARCHIVE = f'node-v{VERSION}-win-x64.zip'
SHA256 = '158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541'
URL = f'https://nodejs.org/dist/v{VERSION}/{ARCHIVE}'
ROOT = pathlib.Path(__file__).resolve().parent.parent

def build(out, runtime_zip=None):
    out = pathlib.Path(out).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as temp:
        archive = pathlib.Path(runtime_zip) if runtime_zip else pathlib.Path(temp) / ARCHIVE
        if not runtime_zip:
            with urllib.request.urlopen(URL, timeout=120) as response:
                archive.write_bytes(response.read())
        if hashlib.sha256(archive.read_bytes()).hexdigest() != SHA256:
            raise ValueError('Node.js archive SHA256 mismatch')
        # Confirm all required local engines exist; never silently ship a partial app.
        manifest = json.loads((ROOT/'public/vendor/manifest.json').read_text())
        for entry in manifest.get('files', []):
            name = entry['path'] if isinstance(entry, dict) else entry
            asset = ROOT / name if name.startswith('public/') else ROOT / 'public/vendor' / name.lstrip('/')
            if not asset.is_file():
                raise FileNotFoundError(f'Missing bundled asset: {asset}')
            if isinstance(entry, dict) and hashlib.sha256(asset.read_bytes()).hexdigest() != entry['sha256']:
                raise ValueError(f'Bundled asset digest mismatch: {asset}')
        with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as target:
            prefix='DailyNote/'
            for folder in ['public', 'src']:
                for file in sorted((ROOT/folder).rglob('*')):
                    if file.is_file(): target.write(file, prefix+file.relative_to(ROOT).as_posix())
            for name in ['Start_DailyNote.bat','Create_DailyNote_Shortcut.bat','scripts/portable-start.cjs','docs/LOCAL-PORTABLE.md']:
                target.write(ROOT/name, prefix+name)
            target.writestr(prefix+'config.json',json.dumps({'PORT':3000,'TOKEN_EXPIRES_HOURS':24},indent=2))
            target.writestr(prefix+'data/',b'')
            target.writestr(prefix+'uploads/',b'')
            target.writestr(prefix+'README.txt',(ROOT/'docs/LOCAL-PORTABLE.md').read_bytes())
            with zipfile.ZipFile(archive) as node:
                for name in ['node.exe','LICENSE']:
                    target.writestr(prefix+'runtime/'+name,node.read(f'node-v{VERSION}-win-x64/{name}'))
            target.writestr(prefix+'runtime/SOURCE.json',json.dumps({'version':VERSION,'url':URL,'archiveSha256':SHA256},indent=2))
    print(str(out))
    return out

if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--out',default=str(ROOT/'dist/DailyNote-Windows-x64.zip'))
    parser.add_argument('--runtime-zip',help='Previously downloaded official Node ZIP; digest is still verified')
    args=parser.parse_args()
    build(args.out,args.runtime_zip)
