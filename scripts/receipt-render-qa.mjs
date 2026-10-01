import {chromium} from 'playwright';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const root=new URL('../evidence/',import.meta.url);
const html=await readFile(new URL('readable-public-receipt.html',root),'utf8');
const receipt=JSON.parse(await readFile(new URL('browser-live-receipt.json',root),'utf8'));
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1000,height:1100}});let requests=0;page.on('request',()=>requests++);await page.setContent(html);assert.match(await page.locator('body').textContent(),new RegExp(receipt.transactionHash));assert.equal(await page.locator('script').count(),0);assert.equal(requests,0);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:new URL('readable-receipt-preview.png',root).pathname,fullPage:true});await writeFile(new URL('export-render-qa.json',root),JSON.stringify({checkedAt:new Date().toISOString(),source:'actual_saved_public_rpc_export',transaction:receipt.transactionHash,passed:true,scriptCount:0,externalRequests:requests,noHorizontalOverflow:true},null,2)+'\n');
}finally{await browser.close();}
console.log('Readable HTML rendered; no scripts or external requests.');
