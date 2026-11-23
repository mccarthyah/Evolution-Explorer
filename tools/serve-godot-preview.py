#!/usr/bin/env python3
"""Serve a Godot Web export, or accept an Actions artifact from the browser."""
import argparse
import functools
import http.server
import os
from pathlib import Path
import shutil
import tempfile
import zipfile

MAX_ARCHIVE = 64 * 1024 * 1024
MAX_EXTRACTED = 128 * 1024 * 1024
UPLOAD_PAGE = b'''<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Godot preview setup</title><style>body{font:16px system-ui;background:#0b1423;color:#e5f6fa;max-width:42rem;margin:12vh auto;padding:1.5rem}button{padding:.7rem 1.2rem;cursor:pointer}input{margin:1rem 0}a{color:#65d9ed}#status{white-space:pre-wrap}</style>
<h1>Start the Godot preview</h1><p>Choose the <b>godot-web-preview.zip</b> file downloaded from GitHub Actions. It stays in this preview workspace and is not committed to Git.</p>
<form id="form"><input id="file" type="file" accept=".zip,application/zip" required><br><button>Load Godot preview</button></form><p id="status"></p>
<script>document.querySelector('#form').onsubmit=async e=>{e.preventDefault();const f=document.querySelector('#file').files[0],s=document.querySelector('#status');s.textContent='Uploading and extracting...';try{const r=await fetch('/__godot_preview_upload',{method:'POST',body:f});if(!r.ok)throw new Error(await r.text());location.reload()}catch(err){s.textContent='Could not load the export: '+err.message}};</script></html>'''


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.split('?', 1)[0] == '/' and not (Path(self.directory) / 'index.html').is_file():
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(UPLOAD_PAGE)))
            self.end_headers()
            self.wfile.write(UPLOAD_PAGE)
            return
        super().do_GET()

    def do_POST(self):
        if self.path != '/__godot_preview_upload':
            self.send_error(404)
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            self.send_error(400, 'Invalid content length')
            return
        if not 0 < length <= MAX_ARCHIVE:
            self.send_error(413, 'ZIP must be at most 64 MB')
            return
        root = Path(self.directory)
        root.mkdir(parents=True, exist_ok=True)
        try:
            with tempfile.TemporaryDirectory(prefix='.incoming-', dir=root) as temp:
                temp = Path(temp)
                archive = temp / 'artifact.zip'
                with archive.open('wb') as f:
                    remaining = length
                    while remaining:
                        chunk = self.rfile.read(min(1024 * 1024, remaining))
                        if not chunk:
                            raise ValueError('Incomplete upload')
                        f.write(chunk)
                        remaining -= len(chunk)
                extracted = temp / 'files'
                extracted.mkdir()
                with zipfile.ZipFile(archive) as z:
                    infos = z.infolist()
                    names = [info.filename for info in infos]
                    if (not infos or len(infos) > 32 or len(names) != len(set(names)) or
                            sum(info.file_size for info in infos) > MAX_EXTRACTED):
                        raise ValueError('Invalid or oversized export')
                    if not {'index.html', 'index.wasm', 'index.pck'}.issubset(names):
                        raise ValueError('Not a Godot Web preview artifact')
                    for info in infos:
                        name = info.filename
                        if (not name.startswith('index.') or Path(name).name != name or
                                '/' in name or '\\' in name or info.is_dir() or
                                (info.external_attr >> 16) & 0o170000 == 0o120000):
                            raise ValueError('Unexpected filename in artifact')
                        with z.open(info) as src, (extracted / name).open('wb') as dst:
                            shutil.copyfileobj(src, dst)
                for child in extracted.iterdir():
                    os.replace(child, root / child.name)
            self.send_response(200)
            self.send_header('Content-Length', '0')
            self.end_headers()
        except (OSError, ValueError, zipfile.BadZipFile, RuntimeError) as exc:
            self.send_error(400, str(exc))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', nargs='?', default='build/godot-web', help='directory for extracted export')
    parser.add_argument('--port', type=int, default=8001)
    args = parser.parse_args()
    root = Path(args.directory).resolve()
    root.mkdir(parents=True, exist_ok=True)
    handler = functools.partial(Handler, directory=str(root))
    with http.server.ThreadingHTTPServer(('0.0.0.0', args.port), handler) as server:
        print(f'Godot preview on port {args.port}; export directory {root}', flush=True)
        server.serve_forever()


if __name__ == '__main__':
    main()
