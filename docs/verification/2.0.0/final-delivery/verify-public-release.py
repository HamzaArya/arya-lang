#!/usr/bin/env python3
"""Verify every public release download against the exact final inventory."""
import concurrent.futures
import datetime
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path.cwd()
EVIDENCE = ROOT / '.build/release-2.0.0/generation-2/evidence'
EXPECTED_COMMIT = 'd9669bff18e035b06c2d775be703e9a2d798bd1b'
inventory = json.loads((EVIDENCE / 'final-delivery-inventory.json').read_text())
release = json.loads(subprocess.check_output(['gh', 'api', 'repos/HamzaArya/arya-lang/releases/tags/v2.0.0'], text=True))
assert release['tag_name'] == 'v2.0.0' and not release['draft'] and not release['prerelease']
assert release['target_commitish'] == EXPECTED_COMMIT
assets = {asset['name']: asset for asset in release['assets']}
assert set(assets) == set(inventory['uploads']) and len(assets) == 17
record = {'status': 'in-progress', 'releaseID': release['id'], 'releaseURL': release['html_url'],
          'tag': release['tag_name'], 'sourceCommit': EXPECTED_COMMIT,
          'publishedAt': release['published_at'], 'draft': False, 'prerelease': False,
          'downloads': [], 'authenticationUsedForDownloads': False}

def save():
    (EVIDENCE / 'public-release-verification.json').write_text(json.dumps(record, indent=2) + '\n')

def verify(name):
    expected = inventory['uploads'][name]
    asset = assets[name]
    assert asset['state'] == 'uploaded' and asset['size'] == expected['bytes']
    if asset.get('digest'):
        assert asset['digest'] == 'sha256:' + expected['sha256']
    url = asset['browser_download_url']
    assert url == 'https://github.com/HamzaArya/arya-lang/releases/download/v2.0.0/' + name
    command = ['curl', '--fail', '--location', '--silent', '--show-error', '--retry', '2',
               '--retry-delay', '1', '--connect-timeout', '30', '--max-time', '300',
               '--proto', '=https', url]
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    digest = hashlib.sha256(); size = 0
    while True:
        block = process.stdout.read(1024 * 1024)
        if not block:
            break
        digest.update(block); size += len(block)
    error = process.stderr.read().decode(errors='replace')
    assert process.wait() == 0, name + ': ' + error
    assert size == expected['bytes'] and digest.hexdigest() == expected['sha256'], name + ': public bytes differ'
    return {'filename': name, 'url': url, 'bytes': size, 'sha256': digest.hexdigest(),
            'assetID': asset['id'], 'status': 'passed'}

save()
try:
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        pending = {pool.submit(verify, name): name for name in assets}
        for result in concurrent.futures.as_completed(pending):
            row = result.result(); record['downloads'].append(row); save()
            print('Verified public bytes: ' + row['filename'], flush=True)
    assert len(record['downloads']) == 17
    record['downloads'].sort(key=lambda row: row['filename'])
    record['status'] = 'passed'
    record['verifiedAtUTC'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
except BaseException as error:
    record['status'] = 'failed'; record['error'] = str(error)
    raise
finally:
    save()
print('All 17 unauthenticated HTTPS downloads match the final release inventory.', flush=True)
