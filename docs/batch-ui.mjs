import { parseBatchCSV, runBatch, exportBatchCSV, CSV_HEADER, PUBLIC_BATCH_CSV, BATCH_LABELS, MAX_CSV_BYTES } from './batch.mjs';
const $=id=>document.getElementById(id);
const element=(tag,text,className)=>{const el=document.createElement(tag);if(text!=null)el.textContent=text;if(className)el.className=className;return el;};
const save=(text,name)=>{const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));const a=element('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
export function initBatch({onReceipt,onBusy,isBusy=()=>false}) {
  let rows=[],controller=null,reads=0,loadSequence=0;
  const controls=busy=>{for(const id of ['batch-import','batch-example','batch-run','batch-template'])$(id).disabled=busy; $('batch-cancel').hidden=!controller;$('batch-run').disabled=busy||!rows.some(r=>r.status!=='invalid'&&r.status!=='duplicate');$('batch-export').disabled=busy||!rows.length;};
  const render=(message=null)=>{
    const counts={};for(const r of rows)counts[r.status]=(counts[r.status]??0)+1;
    $('batch-summary').textContent=message??`${rows.length} records · ${Object.entries(counts).map(([k,n])=>`${n} ${BATCH_LABELS[k].toLowerCase()}`).join(' · ')} · ${reads} RPC reads`;
    $('batch-rows').replaceChildren();
    for(const r of rows){
      const card=element('li',null,'batch-row');const head=element('div',null,'batch-row-head');head.append(element('strong',`Record ${r.record}`),element('span',BATCH_LABELS[r.status],'batch-state '+r.status));card.append(head);
      const input=element('details');input.append(element('summary','Transaction, address & expected net'));for(const [label,value] of [['TX HASH',r.raw.tx_hash],['ADDRESS',r.raw.address],['EXPECTED NET / USDC',r.raw.expected_net_usdc]]){const p=element('p');p.append(element('span',label),element('code',value||'(empty)'));input.append(p);}card.append(input);
      if(r.certificate){const amounts=element('dl',null,'batch-amounts');for(const [label,key] of [['Incoming','incomingUSDC'],['Outgoing','outgoingUSDC'],['Transaction net','netReceivedUSDC'],['Net − expected','differenceUSDC']]){const div=element('div');div.append(element('dt',label),element('dd',r.certificate[key]+' USDC'));amounts.append(div);}card.append(amounts);const button=element('button','Open receipt & evidence ↗','text-button');button.type='button';button.dataset.openEvidence='true';button.disabled=!!controller||isBusy();button.addEventListener('click',()=>onReceipt(r.certificate));card.append(button);}
      if(r.note)card.append(element('p',r.note,'batch-note'));$('batch-rows').append(card);
    }
    controls(!!controller||isBusy());
  };
  const load=text=>{if(controller||isBusy())return;loadSequence++;try{rows=parseBatchCSV(text);reads=0;$('batch-error').hidden=true;render();}catch(error){render(rows.length?'Previous batch retained.':'No batch loaded.');$('batch-error').textContent=error.message;$('batch-error').hidden=false;}};
  $('batch-import').addEventListener('click',()=>$('batch-file').click());
  $('batch-file').addEventListener('change',async()=>{const file=$('batch-file').files?.[0];$('batch-file').value='';if(!file||controller||isBusy())return;const request=++loadSequence;try{if(file.size>MAX_CSV_BYTES)throw new Error('Choose a UTF-8 CSV smaller than 100 KB.');const text=await file.text();if(request===loadSequence&&!controller)load(text);}catch(error){if(request!==loadSequence)return;render(rows.length?'Previous batch retained.':'No batch loaded.');$('batch-error').textContent=error.message;$('batch-error').hidden=false;}});
  $('batch-template').addEventListener('click',()=>save(CSV_HEADER.join(',')+'\r\n','arc-receipt-batch-template.csv'));
  $('batch-example').addEventListener('click',()=>load(PUBLIC_BATCH_CSV));
  $('batch-run').addEventListener('click',async()=>{
    if(controller||isBusy()||!rows.length)return;loadSequence++;controller=new AbortController();onBusy(true);$('batch-error').hidden=true;render();
    try{const report=await runBatch(rows,{signal:controller.signal,onUpdate:(next,info)=>{rows=next;reads=info.rpcReads;render();}});rows=report.rows;reads=report.rpcReads;}
    catch(error){$('batch-error').textContent=error.message;$('batch-error').hidden=false;}
    finally{controller=null;onBusy(false);render();}
  });
  $('batch-cancel').addEventListener('click',()=>controller?.abort());
  $('batch-export').addEventListener('click',()=>save(exportBatchCSV(rows),'arc-receipt-exceptions.csv'));
  render('Import your local CSV, or load the five-record public example. Nothing is queried until you choose Review batch.');
  return {refreshControls:()=>controls(!!controller||isBusy())};
}
