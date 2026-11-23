# Agent notes

## Godot runtime for local checks

The user has provided a precompiled Linux x86-64 headless Godot binary in their
connected Google Drive named `godot-4.7.2-linuxbsd-headless-f1bee50a8b01.x86_64.gz`.
Use it for local Godot checks; no source build is needed. The current sandbox
may already have it at `/tmp/evo-godot/headless/godot`. That path is temporary
and is not shared reliably between agent chats or sandbox resets. If missing,
use the Google Drive connector to locate and download the named file, decompress
it outside the repository, and make it executable. The decompressed binary's
SHA-256 observed in this session is
`f1bee50a8b010d8631c8ed659791105ecd7135b1a42fc960f8579066fc5d2132`;
it reports `4.7.2.stable.custom_build`. This checksum checks consistency with
the supplied copy, not independent publisher provenance. Do not commit it or
other downloaded binaries to Git.

Run the runtime tests with an isolated user-data directory so tests cannot alter
real pilot saves, for example:

```sh
TEST_DATA=$(mktemp -d)
XDG_DATA_HOME="$TEST_DATA" /tmp/evo-godot/headless/godot --headless --path . --script res://tools/godot-runtime-test.gd
rm -rf "$TEST_DATA"
```

GitHub Actions separately uses the official checksum-verified Godot release.
