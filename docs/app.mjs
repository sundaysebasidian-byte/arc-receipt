import { ARC, createRPC, verifyTransaction, verifyEvidence, validateInput } from './verifier.mjs';
import { createReadableReceipt, recheckReceiptFile, parseReceiptFile, reviewObservation, REVIEW_SCOPE } from './receipt.mjs';
import { SAMPLE_INPUT, sampleEvidence } from './sample.mjs';
import { LIVE_EXAMPLE } from './live-example.mjs';
import { initBatch } from './batch-ui.mjs';
import { initOrders } from './orders-ui.mjs';
const $ = id => document.getElementById(id);
const ROUNDTRIP = { txHash: '0x1732bf16a26831ba5a7d183ceb35c893bb9053630f9549ed99269985ab62d7d8', recipient: '0xe9fae1c386c6f45b1fb3c3ef01ade424dad4bccf', expectedAmount: '', minConfirmations: 1 };
let current = null, sequence = 0, controller = null, toastTimer, batchBusy=false;

const errors = {
  invalid_input: ['Check the transaction details', 'Correct the highlighted field. Amounts use decimal notation, with up to 18 fractional digits.'],
  invalid_import: ['This receipt cannot be rechecked', 'Choose an unmodified live Arc Receipt JSON export. Offline examples are synthetic and cannot serve as chain evidence.'],
  failed_transaction: ['The transaction reverted', 'A successful submission is not a successful payment. Ask the sender for the hash of a completed transfer. Gas spent on a failed transaction is not a payment.'],
  not_mined: ['No mined receipt was found', 'Check the hash and network. An absent receipt can mean a pending transaction, an unknown hash or a transaction on another chain. Wait for inclusion, then recheck.'],
  wrong_chain: ['The node reports another chain', 'This verifier accepts Arc mainnet (5042) only. No receipt is issued from a testnet or another network.'],
  rate_limited: ['The public node is busy', 'Wait briefly and try again. No payment conclusion has been made. The public endpoint may rate-limit requests.'],
  rpc_timeout: ['The node took too long', 'Check your connection and retry. A timeout says nothing about whether the payment happened.'],
  rpc_unavailable: ['Arc RPC is unavailable', 'Check your network and try again. The previous receipt has been cleared; no new payment result is available.'],
  rpc_error: ['The node returned an error', 'Retry or compare the public transaction in Arc’s explorer. The response was not accepted as payment evidence.'],
  invalid_evidence: ['The evidence is incomplete or inconsistent', 'Recheck the transaction or compare it in Arc’s explorer. This tool will not issue a receipt from malformed RPC data.'],
  inconsistent_streams: ['The USDC event streams disagree', 'The 6-decimal ERC-20 event has no matching 18-decimal system event. No receipt is issued; inspect the raw transaction and retry a trusted node.'],
  reorg_or_inconsistent: ['The receipt and block disagree', 'Arc settles committed blocks with deterministic finality. This mismatch signals incomplete or inconsistent node data; do not rely on this observation.']
};
function state(name) { for (const id of ['empty','loading','error','result']) $(id).hidden = id !== name; }
function clearFields() { for (const id of ['tx','recipient','amount','confirmations']) { $(id).removeAttribute('aria-invalid'); $(id+'-error').hidden = true; } }
function invalidate() { sequence++; controller?.abort(); controller = null; current = null; state('empty'); $('verify').disabled = batchBusy; clearFields(); }
function notify(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false; toastTimer = setTimeout(()=>$('toast').hidden=true,2400); }
function stage(name) {
  const stages = ['chain','receipt','block','analysis'];
  const titles = ['Checking network…','Reading transaction outcome…','Matching the canonical block…','Reconciling USDC movements…'];
  const index = stages.indexOf(name); $('loading-title').textContent = titles[index]; $('loading-progress').style.width = `${25*(index+1)}%`;
  for (const [i,el] of [...$('loading-steps').children].entries()) el.className = i<index?'done':i===index?'active':'';
}
function normalizeHash(value) {
  if (!value.startsWith('https://')) return value;
  try { const url=new URL(value);if(url.origin===ARC.explorer && /^\/tx\/0x[0-9a-fA-F]{64}\/?$/.test(url.pathname)) return url.pathname.split('/')[2]; } catch {}
  return value;
}
function readInput() {
  const txHash = normalizeHash($('tx').value.trim());
  const input = validateInput({txHash,recipient:$('recipient').value.trim(),expectedAmount:$('amount').value.trim(),minConfirmations:Number($('confirmations').value)});
  if (txHash !== $('tx').value.trim()) $('tx').value=txHash;
  return input;
}
function fillInput(input) { $('tx').value=input.txHash; $('recipient').value=input.recipient; $('amount').value=input.expectedAmount||''; $('confirmations').value=input.minConfirmations??1; }
function showError(error) {
  const [title,next] = errors[error.code] || ['Verification did not complete','Retry the check. No receipt was issued.'];
  $('error-title').textContent=title; $('error-detail').textContent=error.message; $('error-next').textContent=next; $('error-code').textContent=error.code||'verification_error'; $('retry').hidden=error.code==='invalid_import';
  if(error.code==='invalid_input') {
    const field=/hash/.test(error.message)?'tx':/address/.test(error.message)?'recipient':/Confirmations/.test(error.message)?'confirmations':'amount';
    $(field).setAttribute('aria-invalid','true');$(field+'-error').textContent=error.message;$(field+'-error').hidden=false;
    if(field==='confirmations') document.querySelector('.policy-settings').open=true;
    $(field).focus();
  }
  state('error');
}
function make(tag,text,className) {const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
const utc = value => value ? value.replace('T',' · ').replace(/\.\d{3}Z$/,' UTC').replace(/Z$/,' UTC') : 'Not recorded';
function show(certificate,mock=false) {
  current=mock?{...certificate,mode:'synthetic_offline_example',network:'Synthetic fixture (not on-chain)',explorerURL:null,rpcURL:null,checkedAt:null}:{...certificate,mode:'live_rpc'};
  const c=current;const review=reviewObservation(c);current.reviewScope=REVIEW_SCOPE;const positive=['matched','verified_transfer'].includes(c.status);
  $('mode').textContent=mock?'SYNTHETIC EXAMPLE · NOT A REAL PAYMENT':'LIVE READ · ARC MAINNET · THIRD-PARTY EXAMPLES ARE NOT EARNINGS';$('mode').className='mode'+(mock?' mock':'');
  $('status').textContent=review.label;$('status').className='status'+(positive?'':' warning');$('summary-mark').textContent=positive?'✓':'!';$('summary-mark').className='summary-mark'+(positive?'':' warning');
  $('net').textContent=c.netReceivedUSDC;$('incoming').textContent=c.incomingUSDC;$('outgoing').textContent=c.outgoingUSDC;
  $('net-equation').textContent=`${c.incomingUSDC} incoming − ${c.outgoingUSDC} outgoing = ${c.netReceivedUSDC} USDC`;
  $('explanation').textContent=review.explanation;
  $('amount-comparison').hidden=false;$('amount-comparison').textContent=review.comparison;$('amount-comparison').className='comparison'+(c.amountComparison==='exact'?' exact':c.amountComparison==='not_requested'?' neutral':'');
  $('case-context').hidden=!review.caseContext;$('case-context').textContent=review.caseContext??'';
  $('mint-notice').hidden=!review.mintNotice;$('mint-notice').textContent=review.mintNotice??'';
  $('checks').replaceChildren();
  for(const check of review.checks) {const li=make('li',undefined,check.state);li.append(make('span',check.state==='passed'?'✓':check.state==='not_requested'?'−':'!', 'check-icon'));const body=make('div');body.append(make('strong',check.label),make('small',check.detail));li.append(body);$('checks').append(li);}
  $('check-count').textContent=`${c.checks.filter(check=>check.state==='passed').length} / ${c.checks.length} checks passed`;
  $('expected-basis').textContent=c.expectedAmountUSDC===null?'Expected net not set · incoming − outgoing in this transaction.':`Expected net ${c.expectedAmountUSDC} USDC · incoming − outgoing in this transaction.`;
  $('recipient-full').textContent=c.recipient;$('hash-full').textContent=c.transactionHash;$('block-time').textContent=utc(c.transferTimeUTC);$('checked-time').textContent=mock?'Synthetic fixture':utc(c.checkedAt);
  const rows=[['Chain ID',String(c.chainId)],['Canonical block',c.blockNumber],['Block hash',c.blockHash],['Observed head',c.observedHead],['Included blocks observed',`${c.confirmations} / ${c.minConfirmations} requested`],['System emitter',c.emitter],['RPC',mock?'No network read':ARC.rpc]];
  $('details').replaceChildren();for(const [key,value] of rows)$('details').append(make('dt',key),make('dd',value));
  const relevant=c.movements.filter(m=>m.to===c.recipient||m.from===c.recipient);
  $('movement-count').textContent=`${relevant.length} relevant event(s)`;$('movements').replaceChildren();
  for(const m of relevant) {
    const card=make('div',undefined,'movement');const direction=m.kind==='transfer'?(m.to===c.recipient?'Incoming':'Outgoing'):m.kind==='burn'?'Outgoing burn':m.kind==='mint'?'Mint · excluded':'Not a payment';
    const head=make('div',undefined,'movement-head');head.append(make('span',`LOG ${m.logIndex} / ${direction}`),make('strong',m.amountUSDC+' USDC'));
    const from=make('div',undefined,'movement-address');from.append(make(m.from===c.recipient?'b':'span',m.from));const to=make('div',undefined,'movement-address');to.append(make(m.to===c.recipient?'b':'span',m.to));card.append(head,from,make('div','↓','movement-arrow'),to);$('movements').append(card);
  }
  if(!relevant.length)$('movements').append(make('p','No qualifying system movement for this recipient.'));
  $('stream-note').textContent=`${c.ignoredDuplicateStreamLogs} ERC-20 stream log(s) excluded from totals. The raw precision comparison below explains the matched movements.`;
  const pairs=(c.streamPairs??[]).filter(p=>p.from===c.recipient||p.to===c.recipient);
  $('pair-count').textContent=`${pairs.length} matched pair(s)`;$('stream-pairs').replaceChildren();
  for(const p of pairs.slice(0,12)) {
    const card=make('div',undefined,'precision-pair');
    card.append(make('strong',`${p.amountUSDC} USDC · one ${p.kind} movement`));
    const grid=make('div',undefined,'precision-grid');
    for(const [label,units,formula] of [[`System log ${p.systemLogIndex} · 18 decimals`,p.systemUnits,`${p.systemUnits} ÷ 10^18`],[`ERC-20 log ${p.erc20LogIndex} · 6 decimals`,p.erc20Units,`${p.erc20Units} ÷ 10^6`]]){
      const part=make('div');part.append(make('span',label),make('code',units),make('small',`${formula} = ${p.amountUSDC} USDC`));grid.append(part);
    }
    const effect=p.kind==='transfer'?(p.to===c.recipient?'Incoming transfer counted once; intent is not inferred.':'Outgoing transfer deducted once.'):p.kind==='burn'?'Outgoing burn deducted once.':'Incoming mint excluded from payment total.';
    card.append(grid,make('p','Exact match: ERC-20 units × 10^12 = system units. '+effect));$('stream-pairs').append(card);
  }
  if(pairs.length>12)$('stream-pairs').append(make('p',`Showing 12 of ${pairs.length} recipient-related pairs; all pairs are included in Evidence JSON.`));
  if(!pairs.length)$('stream-pairs').append(make('p','No nonzero paired ERC-20 movement involves this selected address. Native-only sends can still be valid.'));
  const native=c.movements.filter(m=>(c.nativeOnlyLogIndices??[]).includes(m.logIndex)&&(m.from===c.recipient||m.to===c.recipient));
  for(const m of native.slice(0,12)){const card=make('div',undefined,'native-trace');card.append(make('strong',`${m.amountUSDC} USDC · native-only transfer`));const grid=make('div',undefined,'precision-grid');const part=make('div');part.append(make('span',`System log ${m.logIndex} · 18 decimals`),make('code',m.units),make('small',`${m.units} ÷ 10^18 = ${m.amountUSDC} USDC`));grid.append(part);card.append(grid,make('p','No ERC-20 mirror is present; the canonical system movement contributes once.'));$('stream-pairs').append(card);}
  $('native-note').textContent=native.length?`${native.length} native-only transfer event(s) for this recipient have no ERC-20 mirror and are evaluated from the system stream.`:'All recipient transfer events with ERC-20 mirrors were matched individually. Non-payment log kinds still follow the exclusions below.';
  $('import-result').hidden=mock;
  $('handoff-help').textContent=mock?'Offline exports are synthetic examples; they cannot be rechecked as chain evidence.':'Download Raw evidence (JSON), then choose Recheck saved JSON here. Saved claims are recomputed before a fresh read from the official RPC. A live recheck alone does not test your saved file.';
  $('explorer').hidden=mock;$('recheck').hidden=mock;if(!mock)$('explorer').href=c.explorerURL;
  $('recheck-note').hidden=!c.recheck;
  if(c.recheck){const altered=[...c.recheck.alteredFields,...c.recheck.changedFields];$('recheck-note').className='recheck-note'+(altered.length?' warning':'');$('recheck-note').textContent=altered.length?`Saved claims differ (${altered.join(', ')}). The result below is freshly recomputed from mainnet; the imported claims were not trusted.`:'Recheck consistent · saved evidence recomputed, then transaction fetched fresh from the official mainnet RPC.';}
  state('result');
}
async function run(importText=null) {
  if(batchBusy){notify('Cancel the active batch or order review before starting another chain check.');return;}
  const runId=++sequence;controller?.abort();controller=new AbortController();current=null;clearFields();state('loading');stage('chain');$('verify').disabled=true;
  try {
    const input=importText===null?readInput():parseReceiptFile(importText).input;
    if(importText!==null)fillInput(input);
    const rpc=createRPC(ARC.rpc,globalThis.fetch,{signal:controller.signal});
    const progress=name=>{if(runId===sequence)stage(name);};
    const c=importText===null?await verifyTransaction(input,rpc,progress):await recheckReceiptFile(importText,rpc,progress);
    if(runId===sequence){show(c);if(matchMedia('(max-width:700px)').matches)$('result').scrollIntoView({behavior:'instant',block:'start'});}
  } catch(error){if(runId===sequence&&error.code!=='cancelled')showError(error);}
  finally{if(runId===sequence){$('verify').disabled=false;controller=null;}}
}
$('verify-form').addEventListener('input',invalidate);
$('verify-form').addEventListener('submit',event=>{event.preventDefault();run();});
$('cancel').addEventListener('click',()=>{invalidate();notify('Verification cancelled. No receipt issued.');});
$('retry').addEventListener('click',()=>run());
$('start-review').addEventListener('click',()=>$('live-example').click());
$('live-example').addEventListener('click',()=>{invalidate();fillInput({...LIVE_EXAMPLE,minConfirmations:1});run();});
$('difference-example').addEventListener('click',()=>{invalidate();fillInput({...LIVE_EXAMPLE,expectedAmount:'100.010001',minConfirmations:1});run();});
$('roundtrip-example').addEventListener('click',()=>{invalidate();fillInput(ROUNDTRIP);run();});
$('sample').addEventListener('click',()=>{invalidate();fillInput(SAMPLE_INPUT);const evidence=sampleEvidence();show({...verifyEvidence(SAMPLE_INPUT,evidence),evidence},true);});
$('recheck').addEventListener('click',()=>run());
for (const id of ['import','import-result']) $(id).addEventListener('click',()=>$('receipt-file').click());
$('receipt-file').addEventListener('change',async()=>{
  const file=$('receipt-file').files?.[0];$('receipt-file').value='';if(!file)return;
  invalidate();const readSequence=sequence;
  if(file.size>2_000_000){showError({code:'invalid_import',message:'Choose a receipt JSON file smaller than 2 MB.'});return;}
  try {const text=await file.text();if(readSequence===sequence)await run(text);}
  catch {if(readSequence===sequence)showError({code:'invalid_import',message:'This file could not be read. Choose a valid receipt JSON export.'});}
});
function download(body,type,name){const url=URL.createObjectURL(new Blob([body],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('download').addEventListener('click',()=>{if(current)download(JSON.stringify(current,null,2)+'\n','application/json',`${current.mode==='synthetic_offline_example'?'SYNTHETIC-':''}arc-receipt-${current.transactionHash.slice(2,14)}.json`);});
$('download-readable').addEventListener('click',()=>{if(current)download(createReadableReceipt(current),'text/html',`${current.mode==='synthetic_offline_example'?'SYNTHETIC-':''}arc-receipt-${current.transactionHash.slice(2,14)}.html`);});
for(const [id,key] of [['copy-recipient','recipient'],['copy-hash','transactionHash']])$(id).addEventListener('click',async()=>{if(!current)return;try{await navigator.clipboard.writeText(current[key]);notify('Copied the full '+(key==='recipient'?'recipient address':'transaction hash')+'.');}catch{notify('Copy unavailable. Select the full value above.');}});

let batchControls,orderControls;
const setReviewBusy=busy=>{batchBusy=busy;if(busy)invalidate();for(const id of ['verify','start-review','live-example','difference-example','roundtrip-example','sample','import','import-result','recheck'])$(id).disabled=busy;batchControls?.refreshControls();orderControls?.refreshControls();for(const button of document.querySelectorAll('[data-open-evidence]'))button.disabled=busy;};
const openObservation=c=>{if(batchBusy){notify('Cancel the active review before opening another observation.');return;}invalidate();fillInput({txHash:c.transactionHash,recipient:c.recipient,expectedAmount:c.expectedAmountUSDC,minConfirmations:c.minConfirmations});show(c);$('batch-panel').open=false;$('order-panel').open=false;$('result').scrollIntoView({behavior:'instant',block:'start'});};
batchControls=initBatch({onBusy:setReviewBusy,isBusy:()=>batchBusy,onReceipt:openObservation});
orderControls=initOrders({onBusy:setReviewBusy,isBusy:()=>batchBusy,onReceipt:openObservation});
