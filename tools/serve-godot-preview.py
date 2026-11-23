#!/usr/bin/env python3
"""Serve an extracted Godot Web export for a local or Arena browser preview."""
import argparse
import functools
import http.server
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("directory", nargs="?", default="build/godot-web", help="directory containing index.html")
parser.add_argument("--port", type=int, default=8001)
args = parser.parse_args()
root = Path(args.directory).resolve()
if not (root / "index.html").is_file():
    parser.error(f"{root} has no index.html; extract the godot-web-preview artifact there first")
handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root))
with http.server.ThreadingHTTPServer(("0.0.0.0", args.port), handler) as server:
    print(f"Serving Godot Web export from {root} on port {args.port}", flush=True)
    server.serve_forever()
