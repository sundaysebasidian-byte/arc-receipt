#!/usr/bin/env python3
"""Verify the generated static/source ZIP runtime against the actual acceptance bytes."""
from pathlib import Path
import hashlib,json,zipfile,argparse
root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--output-dir',default='release');args=parser.parse_args();output=Path(args.output_dir)
assert not output.is_absolute() and '..' not in output.parts and output.parts[0]=='release'
release=root/output
manifest=root/'evidence/order-boundary-delivery-validation.json'
if not manifest.exists():manifest=root/'evidence/order-delivery-validation.json'
v=json.loads(manifest.read_text());expected=v['candidateRuntimeFiles'];assert expected==v['acceptanceRuntimeFiles']
checked=[]
for name,digest in expected.items():
 for path in [release/'pages'/name,release/'source/web'/name]:assert hashlib.sha256(path.read_bytes()).hexdigest()==digest,path.name
 for archive,key in [('arc-pages-assets.zip',name),('arc-public-source.zip','web/'+name)]:
  with zipfile.ZipFile(release/archive) as z:assert hashlib.sha256(z.read(key)).hexdigest()==digest,key
 checked.append(name)
audit=json.loads((release/'publication-audit.json').read_text());assert audit['passed'] and not audit['findings']
for candidate,archive in [('pages','arc-pages-assets.zip'),('source','arc-public-source.zip')]:
 with zipfile.ZipFile(release/archive) as z:
  assert set(z.namelist())=={r['path'] for r in audit['files'][candidate]}
  for record in audit['files'][candidate]:assert hashlib.sha256(z.read(record['path'])).hexdigest()==record['sha256'],record['path']
print(json.dumps({'passed':True,'runtimeFiles':len(checked),'sourceFiles':len(audit['files']['source']),'auditedArchiveFiles':sum(len(x) for x in audit['files'].values()),'indexCandidateHash':expected['index.html'],'workingTreeIndexHash':v['workingTreeRuntimeFiles']['index.html'],'actualAcceptanceBytesMatch':True,'published':False}))
