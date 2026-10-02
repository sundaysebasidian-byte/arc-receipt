// Read-only comparison of public Explorer screens. No account/session/wallet reuse.
import {chromium} from 'playwright';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
const dir=new URL('../evidence/explorer-review/',import.meta.url);await mkdir(dir,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
const direct=JSON.parse(await readFile(new URL('../evidence/direct-native-example.json',import.meta.url),'utf8'));
const cases=[['direct',direct.transactionHash],['swap','0x1732bf16a26831ba5a7d183ceb35c893bb9053630f9549ed99269985ab62d7d8']];
const report={checkedAt:new Date().toISOString(),source:'Official Explorer, real fresh browser navigation; not a user study',cases:[]};
try{
 for(const [name,hash] of cases){
  const url='https://explorer.arc.io/tx/'+hash;await page.goto(url,{waitUntil:'domcontentloaded',timeout:45000});
  await page.getByText('Transaction details',{exact:false}).first().waitFor({timeout:35000}).catch(()=>{});
  await page.waitForTimeout(2500);
  const text=await page.locator('body').innerText();await writeFile(new URL(name+'-overview.txt',dir),text);
  await page.screenshot({path:new URL(name+'-overview.png',dir).pathname,fullPage:true});
  const controls=await page.locator('button,a,[role=tab]').allTextContents();
  const entry={name,hash,url,title:await page.title(),controls:controls.map(s=>s.trim()).filter(Boolean),capturedText:name+'-overview.txt',screenshot:name+'-overview.png',tabs:[]};
  report.cases.push(entry);
  for(const tab of ['Token transfers','State','Logs']){
   const link=page.getByText(tab,{exact:true}).first();await link.click();await page.waitForTimeout(2000);
   const body=await page.locator('body').innerText();const slug=tab.toLowerCase().replaceAll(' ','-');await writeFile(new URL(name+'-'+slug+'.txt',dir),body);await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:new URL(name+'-'+slug+'.png',dir).pathname,fullPage:true});
   entry.tabs.push({tab,url:page.url(),text:name+'-'+slug+'.txt',screenshot:name+'-'+slug+'.png'});
   console.log(JSON.stringify({name,tab,url:page.url(),text:body.slice(0,18000)}));
  }
  console.log(JSON.stringify({name,title:await page.title(),text:text.slice(0,16000),controls:controls.map(s=>s.trim()).filter(Boolean).slice(0,70)}));
 }
}finally{await writeFile(new URL('navigation.json',dir),JSON.stringify(report,null,2)+'\n');await browser.close();}
