#!/usr/bin/env python3
"""Build audited publication candidates offline; never creates accounts or publishes."""
import hashlib, json, re, shutil, stat, zipfile, argparse
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'release'
RUNTIME=['index.html','style.css','app.mjs','verifier.mjs','receipt.mjs','sample.mjs','live-example.mjs','batch.mjs','batch-ui.mjs','orders.mjs','orders-ui.mjs','_headers']
SOURCE=["LICENSE","package.json","package-lock.json",".gitignore","scripts/server.mjs","scripts/verify.mjs","scripts/probe.mjs","scripts/capture-roundtrip.mjs","scripts/browser-qa.mjs","scripts/receipt-render-qa.mjs","scripts/prepare-publication.py","scripts/deploy-pages.mjs","scripts/ui-quality-qa.mjs","scripts/record-demo.mjs","scripts/workflow-qa.mjs","scripts/explorer-review.mjs","scripts/find-direct-example.mjs","test/verifier.test.mjs","test/receipt.test.mjs","test/review-scope.test.mjs","test/batch.test.mjs","scripts/batch-qa.mjs","evidence/batch-validation.json","evidence/batch-delivery-validation.json","docs/batch-review.md","evidence/public-batch-example.csv","evidence/batch-exceptions.csv","evidence/desktop-batch.png","evidence/mobile-batch.png","evidence/browser-live-receipt.json","evidence/mainnet-roundtrip.json","evidence/mainnet-input.json","evidence/direct-native-example.json","evidence/paired-stream-fixture.json","evidence/browser-qa.json","evidence/unit-test.log","evidence/core-preservation.json","evidence/scope-validation.json","evidence/guided-review-validation.json","evidence/ui-frozen-baseline.json","evidence/ui-quality-qa.json","evidence/export-render-qa.json","evidence/readable-public-receipt.html","evidence/readable-receipt-preview.png","evidence/desktop-mainnet.png","evidence/desktop-zero-net.png","evidence/desktop-precision.png","evidence/mobile-precision.png","evidence/mobile-receipt.png","evidence/desktop-empty.png","evidence/desktop-loading.png","evidence/desktop-rpc-busy.png","evidence/desktop-offline.png","evidence/desktop-decision-guide.png","evidence/zero-net-precision.png","evidence/workflows/acceptance.json","evidence/workflows/direct-evidence.json","evidence/workflows/direct-readable.html","evidence/workflows/01-direct.png","evidence/workflows/02-exact-difference.png","evidence/workflows/03-normal-swap.png","evidence/workflows/04-evidence-handoff.png","evidence/explorer-review/navigation.json","docs/reviewer-guide.md","docs/workflow-comparison.md","docs/release-approval.md","docs/user-validation-plan.md","docs/user-feedback-template.csv","docs/demo-review.md","evidence/explorer-review/direct-overview.png","evidence/explorer-review/direct-overview.txt","evidence/explorer-review/direct-token-transfers.png","evidence/explorer-review/direct-token-transfers.txt","evidence/explorer-review/direct-state.png","evidence/explorer-review/direct-state.txt","evidence/explorer-review/direct-logs.png","evidence/explorer-review/direct-logs.txt","evidence/explorer-review/swap-overview.png","evidence/explorer-review/swap-overview.txt","evidence/explorer-review/swap-token-transfers.png","evidence/explorer-review/swap-token-transfers.txt","evidence/explorer-review/swap-state.png","evidence/explorer-review/swap-state.txt","evidence/explorer-review/swap-logs.png","evidence/explorer-review/swap-logs.txt"]+['web/'+x for x in RUNTIME]
SOURCE=[x for x in SOURCE if x not in ['evidence/batch-delivery-validation.json','evidence/scope-validation.json','evidence/guided-review-validation.json']]+['test/orders.test.mjs','scripts/order-qa.mjs','scripts/audit-order-bundle.mjs','scripts/boundary-regression.mjs','docs/order-review.md','evidence/order-validation.json','evidence/order-delivery-validation.json','evidence/order-independent-audit.json','evidence/order-demo-bundle.json','evidence/order-comparisons.csv','evidence/order-row-receipt.json','evidence/desktop-orders.png','evidence/mobile-orders.png','evidence/order-allocation-conflicts.png','evidence/boundary-100000.csv']
SOURCE+=['scripts/check-order-delivery.py','evidence/order-candidate-runs.json','evidence/boundary-regression.json','evidence/boundary-regression.png','evidence/export-render-qa.json','evidence/readable-receipt-mobile.png','evidence/desktop-orders-full.png','evidence/mobile-orders-full.png']+['evidence/order-candidate-'+x+'.log' for x in ['unit','browser','ui','workflow','batch','order','boundary','html','raw-system-audit']]
SOURCE=list(dict.fromkeys(SOURCE))
SOURCE+=['scripts/external-order-regression.mjs','evidence/independent-invalid-address-conflict.csv','evidence/independent-extra-only-records.csv','evidence/help-scope-clarification.json']
SOURCE=[x for x in SOURCE if x not in ['evidence/order-delivery-validation.json','evidence/help-scope-clarification.json']]+['evidence/order-boundary-delivery-validation.json','evidence/external-order-offline-results.json','evidence/order-boundary-external-regression.log']
SOURCE+=['evidence/order-malformed-bundle.json','evidence/order-candidate-external-offline.log']
PUBLIC_README=(ROOT/'README.md').read_text().replace('Prior scope/counts are preserved under `evidence/before-scope-20261002/` and previous Git/Library versions; they are not proof of this revision.', 'Prior scope/counts remain in previous Git/Library versions; they are not proof of this revision.').replace('[Unsent qualification question](docs/qualification-followup.md)', '[Qualification and publication decisions](docs/release-approval.md)')
DEPLOYMENT='''# Static deployment instructions\n\nThis folder is a candidate, not an existing deployment. No credentials are included. The owner previously approved the public MIT baseline at https://github.com/sundaysebasidian-byte/arc-receipt. This enhanced candidate has not been pushed. Publication of these new changes, website hosting and its account/terms require separate authorization. No organizer message or email is authorized. This script does not publish anything.\n\n1. Run `python3 scripts/prepare-publication.py`. Keep `release/pages/` or `release/arc-pages-assets.zip` for Cloudflare Pages Free Direct Upload. It contains exactly twelve files at the ZIP root, with no backend or Functions.\n2. After publication approval, the owner can upload that ZIP/folder in the Cloudflare dashboard following https://developers.cloudflare.com/pages/get-started/direct-upload/. Registration/login or new terms remain owner controlled. Estimated free static hosting is $0/month; no paid domain or verification gas is required. Free-plan/RPC limits may change.\n3. Optional CLI route after approval: install or invoke the official pinned `wrangler@4.145.0` (Node >=22), complete owner-controlled login, choose the exact approved account/project, then `node scripts/deploy-pages.mjs --project YOUR_PROJECT --account APPROVED_ACCOUNT_ID --publish-approved`. The default invocation only prints instructions. The script does not create a project or log in. If Wrangler requests a new account/project or terms unexpectedly, stop for the owner.\n4. In a fresh source checkout, create a new Git repository and upload only this source candidate to the approved GitHub destination. Do not upload an older local Git history.\n5. Verify the deployed root URL loads, the twelve runtime assets return successful responses, _headers were applied, and the browser can read the official Arc RPC. Re-run all four workflows in docs/reviewer-guide.md and download/reimport evidence. Never treat successful hosting as grant qualification.\n\nDirect Upload cannot later be switched into Git integration without a new project. Wrangler accepts a folder; the dashboard accepts a folder or ZIP. Ordinary GitHub Pages project subpaths require URL adjustment because runtime assets currently use root-relative paths.\n'''
RULES=[('private_key_pem',rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),('aws_access_key',rb'AKIA[0-9A-Z]{16}'),('github_token',rb'(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})'),('openai_key',rb'sk-proj-[A-Za-z0-9_-]{20,}'),('jwt',rb'eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}'),('private_key_assignment',rb'(?i)(?:private[_-]?key|secret[_-]?key)\s*[:=]\s*["\x27](?:0x)?[0-9a-f]{64}["\x27]'),('local_user_path',rb'(?:/Users|/home)/[A-Za-z0-9_.-]+/'),('library_identity',rb'(?:libfile_[a-z0-9]{32}|file_000[0-9a-z]{20,})')]
def audit(path):
 hits=[];files=[]
 for p in sorted(path.rglob('*')):
  if p.is_symlink():raise RuntimeError('Symlink excluded: '+str(p.relative_to(path)))
  if not p.is_file():continue
  b=p.read_bytes();name=p.relative_to(path).as_posix();files.append({'path':name,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()})
  if p.suffix.lower() not in ['.png']:
   for label,pattern in RULES:
    if re.search(pattern,b):hits.append({'path':name,'rule':label})
 return files,hits

def write_zip(folder,path):
 with zipfile.ZipFile(path,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
  for p in sorted(folder.rglob('*')):
   if p.is_file():
    info=zipfile.ZipInfo(p.relative_to(folder).as_posix(),date_time=(2026,9,30,0,0,0));info.external_attr=(stat.S_IFREG|0o644)<<16;info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,p.read_bytes())

def main():
 global OUT
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output-dir',default='release',help='Separate generated directory under release; no publication.');args=parser.parse_args()
 path=Path(args.output_dir)
 if path.is_absolute() or '..' in path.parts or not path.parts or path.parts[0]!='release':raise RuntimeError('Output must be a relative path beneath release.')
 OUT=ROOT/path
 if OUT.is_symlink():raise RuntimeError('Release output must not be a symlink.')
 OUT.mkdir(parents=True,exist_ok=True)
 for name in ['pages','source']:
  folder=OUT/name
  if folder.exists():
   if folder.is_symlink() or not ((OUT/(name+'.arc-generated')).is_file() or (folder/'.arc-generated').is_file()):raise RuntimeError('Refuse to overwrite unmanaged output '+name)
   shutil.rmtree(folder)
  folder.mkdir();(OUT/(name+'.arc-generated')).write_text('generated locally; not published\n')
 for name in RUNTIME:shutil.copyfile(ROOT/'web'/name,OUT/'pages'/name)
 for name in SOURCE:
  origin=ROOT/name
  if origin.is_symlink() or not origin.is_file():raise RuntimeError('Expected regular source file '+name)
  dst=OUT/'source'/name;dst.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(origin,dst)
 for base in [OUT/'pages',OUT/'source'/'web']:
  p=base/'index.html';p.write_text(p.read_text().replace('Local review · public deployment pending','Read-only prototype · public mainnet examples'))
 (OUT/'source'/'README.md').write_text(PUBLIC_README)
 (OUT/'source'/'DEPLOYMENT.md').write_text(DEPLOYMENT)
 records={};findings=[]
 for name in ['pages','source']:
  records[name],hits=audit(OUT/name);findings.extend([{'candidate':name,**x} for x in hits])
 report={'passed':not findings,'method':'explicit file allowlist plus contextual credential/private-path patterns and human review','scope':'candidate bytes only; no wallet, credential directories, user environment or Git history read','findings':findings,'publications':0,'files':records,'limitations':'This audit does not prove absence of every secret. Public tx/block/topic/data hashes and package-lock integrity values are legitimate and were reviewed by context. Earlier MIT baseline was approved and published; current enhanced source and website hosting remain pending. No organizer contact or application is authorized. This script performs no publication.'}
 (OUT/'publication-audit.json').write_text(json.dumps(report,indent=2)+'\n')
 if findings:raise RuntimeError('Audit failed; inspect rule names in publication-audit.json (no matched secret text printed).')
 for name,zipname in [('pages','arc-pages-assets.zip'),('source','arc-public-source.zip')]:write_zip(OUT/name,OUT/zipname)
 checksums={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [OUT/'arc-pages-assets.zip',OUT/'arc-public-source.zip']}
 (OUT/'checksums.json').write_text(json.dumps(checksums,indent=2)+'\n')
 print(json.dumps({'passed':True,'runtimeFiles':len(records['pages']),'sourceFiles':len(records['source']),'findings':0,'zipSHA256':checksums,'published':False},indent=2))
if __name__=='__main__':main()
