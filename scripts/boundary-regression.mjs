// Uses the exact independent-review fixture. Four fresh read-only public requests.
import {chromium} from 'playwright';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=new URL('../',import.meta.url),file=new URL('evidence/boundary-100000.csv',root),bytes=await readFile(file);assert.equal(bytes.length,100000);
process.env.PORT='4334';const {server}=await import('./server.mjs');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});const page=await browser.newPage({viewport:{width:390,height:844}}),requests=[],errors=[];let passed=false;
page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(new URL(r.url()).origin==='https://rpc.mainnet.arc.io')requests.push(r.postDataJSON());});
try{
 await page.goto('http://127.0.0.1:4334');await page.locator('#batch-panel>summary').click();await page.locator('#batch-file').setInputFiles(file.pathname);await page.waitForFunction(()=>document.querySelectorAll('.batch-row').length===1);assert.equal(await page.locator('.batch-state').textContent(),'Ready');assert.equal(requests.length,0);await page.locator('#batch-run').click();await page.waitForFunction(()=>document.getElementById('batch-cancel').hidden,{}, {timeout:65000});assert.equal(await page.locator('.batch-state').textContent(),'Expected net matched');assert.equal(requests.length,4);assert.equal(await page.locator('#batch-error').isVisible(),false);assert.deepEqual(errors,[]);await page.screenshot({path:new URL('evidence/boundary-regression.png',root).pathname,fullPage:true});passed=true;
}finally{await writeFile(new URL('evidence/boundary-regression.json',root),JSON.stringify({checkedAt:new Date().toISOString(),passed,source:'exact_independent_review_fixture_then_actual_public_RPC',fixtureBytes:bytes.length,fixtureSHA256:createHash('sha256').update(bytes).digest('hex'),requests,actualRPCReads:requests.length,errors,writes:0,limits:'Third-party public sample; not user earnings or invoice settlement.'},null,2)+'\n');await browser.close();server.close();}
console.log(JSON.stringify({passed,fixtureBytes:bytes.length,actualRPCReads:requests.length}));
