"""Build standalone Windows/macOS ZIPs on a connected build machine (Python stdlib only)."""
import argparse, hashlib, json, pathlib, tempfile, urllib.request, zipfile, tarfile, stat
VERSION = '24.21.0'
ARCHIVE = f'node-v{VERSION}-win-x64.zip'
SHA256 = '158f7685b44de51f6c0df1d153526cbcd3e1bc739a8dfc607721cef75de9e541'
URL = f'https://nodejs.org/dist/v{VERSION}/{ARCHIVE}'
MAC_SHA256 = {
    'darwin-arm64': 'bed7eea5325e1108f32ce5228ddd6a5f0f08a499ee42aa7442aea583702f6057',
    'darwin-x64': '1462cb3b3046b815cf8ea436d3da450ec1a9f11dac7e5a46b0ada5305d7e8097',
}
ROOT = pathlib.Path(__file__).resolve().parent.parent

def build(out, runtime_zip=None, platform='win-x64'):
    if platform not in ['win-x64', *MAC_SHA256]:
        raise ValueError('Unsupported platform')
    archive_name = ARCHIVE if platform == 'win-x64' else f'node-v{VERSION}-{platform}.tar.gz'
    digest = SHA256 if platform == 'win-x64' else MAC_SHA256[platform]
    url = f'https://nodejs.org/dist/v{VERSION}/{archive_name}'
    out = pathlib.Path(out).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as temp:
        archive = pathlib.Path(runtime_zip) if runtime_zip else pathlib.Path(temp) / archive_name
        if not runtime_zip:
            with urllib.request.urlopen(url, timeout=120) as response:
                archive.write_bytes(response.read())
        if hashlib.sha256(archive.read_bytes()).hexdigest() != digest:
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
            launchers = ['Start_DailyNote.bat','Create_DailyNote_Shortcut.bat'] if platform == 'win-x64' else ['Start_DailyNote.command']
            for name in launchers + ['scripts/portable-start.cjs','docs/LOCAL-PORTABLE.md','LICENSE']:
                if name.endswith('.command'):
                    info = zipfile.ZipInfo(prefix+name)
                    info.create_system = 3
                    info.compress_type = zipfile.ZIP_DEFLATED
                    info.external_attr = (stat.S_IFREG | 0o755) << 16
                    target.writestr(info, (ROOT/name).read_bytes())
                else:
                    target.write(ROOT/name, prefix+name)
            target.writestr(prefix+'config.json',json.dumps({'PORT':3000,'TOKEN_EXPIRES_HOURS':24},indent=2))
            target.writestr(prefix+'data/',b'')
            target.writestr(prefix+'uploads/',b'')
            target.writestr(prefix+'README.txt',(ROOT/'docs/LOCAL-PORTABLE.md').read_bytes())
            if platform == 'win-x64':
                with zipfile.ZipFile(archive) as node:
                    for name in ['node.exe','LICENSE']:
                        target.writestr(prefix+'runtime/'+name,node.read(f'node-v{VERSION}-win-x64/{name}'))
            else:
                with tarfile.open(archive, 'r:gz') as node:
                    for name in ['bin/node', 'LICENSE']:
                        member = node.getmember(f'node-v{VERSION}-{platform}/{name}')
                        if not member.isfile():
                            raise ValueError('Expected regular runtime file')
                        info = zipfile.ZipInfo(prefix+f'runtime/{platform}/'+name)
                        info.create_system = 3
                        info.compress_type = zipfile.ZIP_DEFLATED
                        info.external_attr = (stat.S_IFREG | (0o755 if name == 'bin/node' else 0o644)) << 16
                        with node.extractfile(member) as source:
                            target.writestr(info, source.read())
            target.writestr(prefix+'runtime/SOURCE.json',json.dumps({'version':VERSION,'url':url,'archiveSha256':digest},indent=2))
    print(str(out))
    return out

if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--platform', choices=['win-x64', *MAC_SHA256], default='win-x64')
    parser.add_argument('--out')
    parser.add_argument('--runtime-zip',help='Previously downloaded official Node ZIP/tar.gz; digest is still verified')
    args=parser.parse_args()
    filename = 'DailyNote-Windows-x64.zip' if args.platform == 'win-x64' else f'DailyNote-macOS-{args.platform.removeprefix("darwin-")}.zip'
    build(args.out or ROOT/'dist'/filename,args.runtime_zip,args.platform)

