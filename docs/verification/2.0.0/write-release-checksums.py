#!/usr/bin/env python3
"""Write binary-mode release checksums without changing any asset bytes.

With filenames, write only their .sha256 sidecars. With --plan, require every
non-checksum artifact in that JSON plan and also write the complete SHA256SUMS.
Existing sidecars must already identify the same bytes. Atomic replacement
preserves historical sidecars that happen to share an inode with final outputs.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import tempfile


def safe_name(name):
    assert re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._+-]*', name), 'Unsafe asset filename'
    return name


def digest(path):
    assert path.is_file() and not path.is_symlink(), 'Asset must be a regular file'
    result = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            result.update(block)
    return result.hexdigest()


def binary_rows(values):
    return ''.join(f'{value} *{name}\n' for name, value in sorted(values.items()))


def replace_inventory(path, values):
    assert not path.is_symlink(), 'Checksum output must not be a symlink'
    if path.exists():
        for line in path.read_text().splitlines():
            row = re.fullmatch(r'([0-9a-f]{64}) [ *](.+)', line)
            assert row and values.get(row[2]) == row[1], 'Existing checksum identifies different assets'
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', encoding='ascii', newline='\n',
                                         dir=path.parent, prefix='.release-checksums-', delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(binary_rows(values))
        temporary.chmod(0o644)
        os.replace(temporary, path)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', required=True, type=Path)
    parser.add_argument('--plan', type=Path)
    parser.add_argument('filenames', nargs='*')
    args = parser.parse_args()
    directory = args.directory.resolve(strict=True)
    assert directory.is_dir()
    names = args.filenames
    if args.plan:
        assert not names, 'Use either --plan or explicit filenames'
        plan = json.loads(args.plan.read_text())
        names = [asset['filename'] for asset in plan['artifacts'] if asset['kind'] != 'checksums']
    assert names and len(set(names)) == len(names), 'Missing or duplicate assets'
    assert 'SHA256SUMS' not in names, 'The checksum inventory cannot be its own input'
    assert not any(name + '.sha256' in names for name in names), 'Asset and checksum output overlap'
    values = {safe_name(name): digest(directory / safe_name(name)) for name in names}
    for name, value in values.items():
        replace_inventory(directory / (name + '.sha256'), {name: value})
        # The calculator packager originally used this shorter checksum name.
        legacy = directory / (name[:-4] + '.sha256') if name.endswith('.zip') else None
        if legacy is not None and legacy.exists():
            replace_inventory(legacy, {name: value})
    if args.plan:
        replace_inventory(directory / 'SHA256SUMS', values)
    assert values == {name: digest(directory / name) for name in names}, 'Asset changed during checksum assembly'
    print(json.dumps({'format': 'SHA-256 binary marker', 'assets': values,
                      'globalInventoryWritten': bool(args.plan), 'assetBytesChanged': False}, indent=2))


if __name__ == '__main__':
    main()
