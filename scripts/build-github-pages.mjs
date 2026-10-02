// Generate static GitHub Pages assets; never registers, authenticates or publishes.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root=new URL('../',import.meta.url),target=new URL('docs/',root);
const names=['index.html','style.css','app.mjs','verifier.mjs','receipt.mjs','sample.mjs','live-example.mjs','batch.mjs','batch-ui.mjs','orders.mjs','orders-ui.mjs','favicon.svg'];
await mkdir(target,{recursive:true});
const files=[];
for(const name of names){
  const bytes=await readFile(new URL('web/'+name,root));
  await writeFile(new URL(name,target),bytes);
  files.push({path:name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
await writeFile(new URL('.nojekyll',target),'');
const manifest={schema:'arc-receipt/static-assets-v1',reviewedBaseline:'efb49dd369c29562b9882d3b039556d536129909',source:'web/',files,qualification:'Read-only grant eligibility unconfirmed; hosting is not organizer acceptance.'};
await writeFile(new URL('asset-manifest.json',target),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({passed:true,files:names.length,publishingFolder:'docs/',reviewedBaseline:manifest.reviewedBaseline,published:false}));
