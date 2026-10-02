import { parseCSV, csvCell, createPacedReader, MAX_BATCH_ROWS, MAX_CSV_BYTES } from './batch.mjs';
import { validateInput, parseAmount, formatAmount, verifyTransaction, verifyEvidence, VerificationError } from './verifier.mjs';
import { REVIEW_SCOPE, reviewObservation } from './receipt.mjs';
export const ORDER_HEADER=['order_id','order_total_usdc','tx_hash','address'];
export const ORDER_SCOPE='User-supplied order association. Sum of selected-address transaction nets, not proof of commercial settlement, address control or customer intent.';
export const ORDER_LABELS={matched:'Aggregate net matched',under:'Below supplied order total',over:'Above supplied order total',incomplete:'Incomplete observations',allocation_conflict:'Allocation conflict',definition_conflict:'Order total conflict'};
export const PAYMENT_LABELS={ready:'Ready',checking:'Checking',observed:'Observed',duplicate:'Repeated input · counted once',invalid:'Invalid input',allocation_conflict:'Allocation conflict',definition_conflict:'Order total conflict',unverifiable:'Could not verify',cancelled:'Cancelled',not_checked:'Not checked'};
const fail=message=>{throw new VerificationError('invalid_order_csv',message);};
const quoteRow=cells=>cells.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',');
const netUnits=value=>{const negative=value.startsWith('-'),[whole,fraction='']=(negative?value.slice(1):value).split('.');return (BigInt(whole)*10n**18n+BigInt(fraction.padEnd(18,'0')))*(negative?-1n:1n);};

export function prepareOrderRows(source) {
  if(!Array.isArray(source)||!source.length||source.length>MAX_BATCH_ROWS)fail('Use 1–20 nonempty payment records.');
  if(source.reduce((n,r)=>n+ORDER_HEADER.reduce((m,k)=>m+new TextEncoder().encode(String(r?.raw?.[k]??'')).length,0)+(Array.isArray(r?.extraFields)?r.extraFields:[]).reduce((m,v)=>m+new TextEncoder().encode(String(v)).length,0),0)>MAX_CSV_BYTES)fail('Decoded order fields exceed the 100 KB input limit.');
  const rows=source.map((source,index)=>{
    const raw=Object.fromEntries(ORDER_HEADER.map(k=>[k,String(source?.raw?.[k]??'')]));
    const extraFields=(Array.isArray(source?.extraFields)?source.extraFields:[]).map(String);
    const normalizedHash=/^0x[0-9a-fA-F]{64}$/.test(raw.tx_hash.trim())?raw.tx_hash.trim().toLowerCase():null;
    const row={record:Number.isInteger(source?.record)&&source.record>=2?source.record:index+2,raw,extraFields,txHash:normalizedHash,orderId:null,orderTotal:null,input:null,status:'ready',note:'',fieldError:!!source?.fieldError||extraFields.length>0},errors=[];
    const id=raw.order_id.trim();if(!id||id.length>80||/[\x00-\x1f\x7f]/.test(id))errors.push('Order ID must be 1–80 characters without control characters.');else row.orderId=id;
    try{row.orderTotal=formatAmount(parseAmount(raw.order_total_usdc.trim()));}catch{errors.push('Order total must be a positive decimal with up to 18 fractional digits. Repeat the same total for every row of that order.');}
    try{row.input=validateInput({txHash:raw.tx_hash.trim(),recipient:raw.address.trim(),expectedAmount:'',minConfirmations:1});}catch(e){errors.push(e.message);}
    if(row.fieldError)errors.push('Each payment record needs exactly four fields.');
    if(errors.length){row.status='invalid';row.note=errors.join(' ');}
    return row;
  });
  const orders=new Map(),hashes=new Map();
  for(const row of rows){if(row.orderId){if(!orders.has(row.orderId))orders.set(row.orderId,[]);orders.get(row.orderId).push(row);}if(row.txHash){if(!hashes.has(row.txHash))hashes.set(row.txHash,[]);hashes.get(row.txHash).push(row);}}
  for(const group of orders.values())if(new Set(group.map(r=>r.orderTotal).filter(Boolean)).size>1){for(const row of group){row.definitionConflict=true;if(row.status!=='invalid')row.status='definition_conflict';row.note+=' Same order ID has conflicting totals; no complete comparison is made.';}}
  for(const group of hashes.values()){
    const targets=new Set(group.map(r=>(r.orderId??'UNASSIGNED:'+r.record)+':'+(r.input?.recipient??'UNRESOLVED_ADDRESS:'+r.record)));
    if(targets.size>1){for(const row of group){row.allocationConflict=true;if(row.status!=='invalid')row.status='allocation_conflict';row.note+=' This hash appears under different orders or addresses. Whole-transaction allocation is blocked; output-level splitting is not supported.';}continue;}
    const ready=group.filter(r=>r.status==='ready');for(const row of ready.slice(1)){row.status='duplicate';row.duplicateOf=ready[0].record;row.note=`Same order, hash and address as record ${ready[0].record}; counted once, not an additional chain payment.`;}
  }
  return rows;
}

export function parseOrderCSV(text) {
  const records=parseCSV(text);if(!records.length)fail('CSV is empty. Download the four-column order template.');
  const header=records[0].map(v=>v.trim().toLowerCase());if(header.length!==4||new Set(header).size!==4||ORDER_HEADER.some(k=>!header.includes(k)))fail('Required columns: order_id,order_total_usdc,tx_hash,address. Use exactly these four columns in any order.');
  // Count nonempty records before projecting known columns, including malformed extras.
  const source=records.slice(1).map((values,index)=>({values,record:index+2})).filter(r=>r.values.some(v=>v.trim()!==''))
    .map(({values,record})=>({record,fieldError:values.length!==4,extraFields:values.slice(4),raw:Object.fromEntries(ORDER_HEADER.map(k=>[k,values[header.indexOf(k)]??'']))}));
  return prepareOrderRows(source);
}

export function aggregateOrders(rows) {
  const groups=new Map();for(const row of rows)if(row.orderId){if(!groups.has(row.orderId))groups.set(row.orderId,[]);groups.get(row.orderId).push(row);}
  return [...groups].map(([orderId,group])=>{
    const totals=[...new Set(group.map(r=>r.orderTotal).filter(Boolean))],expected=totals.length===1?totals[0]:null;
    const observed=group.filter(r=>r.status==='observed'&&r.certificate&&!r.allocationConflict&&!r.definitionConflict),sum=observed.reduce((n,r)=>n+netUnits(r.certificate.netReceivedUSDC),0n);
    const allocation=group.some(r=>r.allocationConflict),definition=group.some(r=>r.definitionConflict),complete=!!expected&&!allocation&&!definition&&group.every(r=>['observed','duplicate'].includes(r.status));
    const difference=complete?sum-parseAmount(expected):null;
    const status=allocation?'allocation_conflict':definition?'definition_conflict':!complete?'incomplete':difference===0n?'matched':difference<0n?'under':'over';
    const warnings=[];if(group.some(r=>r.status==='duplicate'))warnings.push('Repeated input was counted once.');if(observed.some(r=>netUnits(r.certificate.netReceivedUSDC)<=0n))warnings.push('Contains zero or outgoing net. Review routing, returns and account roles independently.');
    return {orderId,expectedTotalUSDC:expected,observedNetUSDC:formatAmount(sum),differenceUSDC:difference===null?null:formatAmount(difference),status,complete,observedPayments:observed.length,inputRecords:group.length,records:group.map(r=>r.record),warnings,demo:orderId.startsWith('DEMO-'),scope:ORDER_SCOPE};
  });
}

export async function runOrderReview(source,{signal,rpc,onUpdate=()=>{},requestDelayMs=350}={}) {
  const rows=prepareOrderRows(source),reader=createPacedReader({signal,rpc,requestDelayMs});let stopReason=null;
  const update=()=>onUpdate({rows:rows.map(r=>({...r})),orders:aggregateOrders(rows),rpcReads:reader.reads});
  for(const row of rows){
    if(row.status!=='ready')continue;
    if(signal?.aborted||stopReason){row.status='not_checked';row.note='Not queried. Earlier observations are retained; order comparison remains incomplete.';row.errorCode=stopReason??'cancelled';update();continue;}
    row.status='checking';update();
    try{const c=await verifyTransaction(row.input,reader.read);if(signal?.aborted)throw new VerificationError('cancelled','Order review cancelled.');row.certificate={...c,mode:'live_rpc',reviewScope:REVIEW_SCOPE};if(!c.confirmationPolicyMet){row.status='unverifiable';row.errorCode='observation_policy';row.note='Included-block policy not met.';}else{row.status='observed';row.note='Observed transaction net only; this order association is supplied by the CSV. '+(reviewObservation(c).caseContext??'');}}
    catch(e){row.status=e.code==='cancelled'?'cancelled':'unverifiable';row.errorCode=e.code??'verification_error';row.note=e.message??'Observation did not complete.';if(['rate_limited','wrong_chain','cancelled'].includes(row.errorCode))stopReason=row.errorCode;}
    update();
  }
  return {rows,orders:aggregateOrders(rows),rpcReads:reader.reads,stopReason:stopReason??(signal?.aborted?'cancelled':null),checkedAt:new Date().toISOString(),scope:ORDER_SCOPE};
}

export function exportOrderCSV(report,{exceptionsOnly=false}={}) {
  const header=['order_id','comparison_status','supplied_order_total_usdc','observed_net_usdc','difference_usdc','complete','observed_payments','input_records','warnings','scope'];
  const data=report.orders.filter(o=>!exceptionsOnly||o.status!=='matched'||o.warnings.length).map(o=>[o.orderId,ORDER_LABELS[o.status],o.expectedTotalUSDC,o.observedNetUSDC,o.differenceUSDC,o.complete,o.observedPayments,o.inputRecords,o.warnings.join(' '),ORDER_SCOPE+(o.demo?' DEMO: illustrative labels/totals over unrelated public transactions, not customer invoices.':'')]);
  return [header,...data].map(c=>c.map(csvCell).join(',')).join('\r\n')+'\r\n';
}
export function exportOrderBundle(report) {
  return JSON.stringify({schema:'arc-receipt/order-review-v1',scope:ORDER_SCOPE,checkedAt:report.checkedAt,inputRows:report.rows.map(r=>({record:r.record,raw:r.raw,fieldError:!!r.fieldError,extraFields:r.extraFields})),claimedOrders:report.orders,receipts:report.rows.filter(r=>r.certificate).map(r=>({record:r.record,certificate:r.certificate})),limits:'Order inputs and associations are unverified. No cross-file reuse ledger, output splitting or commercial settlement proof. Open a row for an individual recheckable receipt.'},null,2)+'\n';
}
export function recomputeOrderBundle(text) {
  if(typeof text!=='string'||new TextEncoder().encode(text).length>10_000_000)fail('Order evidence bundle must be smaller than 10 MB.');
  let bundle;try{bundle=JSON.parse(text);}catch{fail('Invalid evidence JSON.');}if(bundle?.schema!=='arc-receipt/order-review-v1'||!Array.isArray(bundle.receipts)||bundle.receipts.length>20)fail('Choose an Arc Receipt order-review bundle with up to20 receipts.');
  const rows=prepareOrderRows(bundle.inputRows),byRecord=new Map(bundle.receipts.map(item=>[item.record,item.certificate]));
  for(const row of rows){if(row.status!=='ready')continue;const saved=byRecord.get(row.record);if(!saved){row.status='unverifiable';row.note='No saved evidence for this record; no absence/payment conclusion follows.';continue;}
    try{if(saved.mode==='synthetic_offline_example'||saved.schema!=='arc-receipt/v1')throw new VerificationError('invalid_import','Synthetic or unknown receipt cannot serve as saved chain evidence.');const c=verifyEvidence(row.input,saved.evidence);row.alteredFields=['netReceivedUSDC','incomingUSDC','outgoingUSDC','blockHash','transactionHash','recipient'].filter(k=>saved[k]!==c[k]);row.certificate={...c,evidence:saved.evidence,mode:'live_rpc',reviewScope:REVIEW_SCOPE};row.status=c.confirmationPolicyMet?'observed':'unverifiable';row.note='Offline recomputation from unsigned saved evidence; order inputs remain unverified.';}
    catch(e){row.status='unverifiable';row.note=e.message;}
  }
  return {rows,orders:aggregateOrders(rows),scope:ORDER_SCOPE,mode:'offline_recomputed',claimedOrdersTrusted:false};
}

const DIRECT='0x68e75b9710c19c0caf34d6cb440202ba5fffaef10dbcf13e5f49ee0d216dff2a',SWAP='0x1732bf16a26831ba5a7d183ceb35c893bb9053630f9549ed99269985ab62d7d8',ADDRESS='0xa818cfe3d358dc65a7a1a21514faeefacf2ec4b3',FINAL='0x870c73c98a14b6956b79247e1a1cdc68ba0060ee';
export const SPLIT_ORDER_DEMO=[ORDER_HEADER,...[['DEMO-SPLIT','1558.043036',DIRECT,ADDRESS],['DEMO-SPLIT','1558.043036',SWAP,FINAL],['DEMO-SPLIT','1558.043036',DIRECT,ADDRESS],['DEMO-MISSING','10','0x'+'0'.repeat(64),ADDRESS]]].map(quoteRow).join('\r\n')+'\r\n';
export const CONFLICT_ORDER_DEMO=[ORDER_HEADER,...[['DEMO-CONFLICT-A','100.01',DIRECT,ADDRESS],['DEMO-CONFLICT-B','100.01',DIRECT,ADDRESS],['DEMO-INDEPENDENT','1458.033036',SWAP,FINAL]]].map(quoteRow).join('\r\n')+'\r\n';
