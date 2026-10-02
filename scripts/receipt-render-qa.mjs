import {chromium} from 'playwright';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createReadableReceipt} from '../web/receipt.mjs';
const root=new URL('../evidence/',import.meta.url);
const receipt=JSON.parse(await readFile(new URL('browser-live-receipt.json',root),'utf8'));
const html=createReadableReceipt(receipt);await writeFile(new URL('readable-public-receipt.html',root),html);
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const checks=[];
try{
 const page=await browser.newPage();let requests=0;page.on('request',()=>requests++);
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:1000});await page.setContent(html);
  const body=await page.locator('body').textContent();assert.ok(body.includes(receipt.transactionHash)&&body.includes(receipt.recipient)&&body.includes(receipt.explorerURL));assert.match(body,/Single-provider unsigned RPC observation/);
  assert.equal(await page.locator('script').count(),0);assert.equal(requests,0);const dimensions=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));assert.ok(dimensions.scrollWidth<=width);
  checks.push({width,...dimensions,fullIdentifiers:true,scriptCount:0,externalRequests:requests});
  if(width===390)await page.screenshot({path:new URL('readable-receipt-mobile.png',root).pathname,fullPage:true});
  if(width===1440)await page.screenshot({path:new URL('readable-receipt-preview.png',root).pathname,fullPage:true});
 }
 await writeFile(new URL('export-render-qa.json',root),JSON.stringify({checkedAt:new Date().toISOString(),source:'current_HTML_generator_with_actual_saved_public_RPC_evidence',transaction:receipt.transactionHash,passed:true,checks,scriptCount:0,externalRequests:requests,noHorizontalOverflow:true},null,2)+'\n');
}finally{await browser.close();}
console.log(JSON.stringify({passed:true,widths:checks.map(c=>c.width),externalRequests:0}));
