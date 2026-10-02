import { validateInput, verifyTransaction, createRPC, VerificationError } from './verifier.mjs';
import { reviewObservation } from './receipt.mjs';

export const MAX_BATCH_ROWS = 20;
export const MAX_CSV_BYTES = 100_000;
export const CSV_HEADER = ['tx_hash', 'address', 'expected_net_usdc'];
export const BATCH_LABELS = Object.freeze({ ready:'Ready', checking:'Checking', matched:'Expected net matched', under:'Below expected net', over:'Above expected net', duplicate:'Repeated input', invalid:'Invalid input', unverifiable:'Could not verify', cancelled:'Cancelled', not_checked:'Not checked' });
const fail = message => { throw new VerificationError('invalid_csv', message); };

// RFC-style quoted fields, doubled quotes, CRLF and embedded newlines. No evaluation.
export function parseCSV(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_CSV_BYTES) fail('Choose a UTF-8 CSV smaller than 100 KB.');
  text = text.replace(/^\uFEFF/, '');
  const records = []; let cells = [], cell = '', quoted = false, closed = false;
  const field = () => { cells.push(cell); cell = ''; closed = false; };
  const record = () => { field(); records.push(cells); cells = []; };
  for (let i=0; i<text.length; i++) {
    const char=text[i];
    if (quoted) { if (char==='"') { if (text[i+1]==='"') { cell+='"'; i++; } else { quoted=false; closed=true; } } else cell+=char; continue; }
    if (char===',') { field(); continue; }
    if (char==='\r'||char==='\n') { if(char==='\r'&&text[i+1]==='\n')i++; record(); continue; }
    if (closed) fail('Unexpected character after a closing quote. Use commas between fields.');
    if (char==='"') { if(cell!=='')fail('Quotes must enclose the entire CSV field.'); quoted=true; } else cell+=char;
  }
  if (quoted) fail('A quoted field is unfinished. Close it with a double quote.');
  if (cell!==''||cells.length||closed) record();
  return records;
}

export function parseBatchCSV(text) {
  const records=parseCSV(text);
  if(!records.length)fail('CSV is empty. Use the three-column template.');
  const header=records[0].map(c=>c.trim().toLowerCase());
  if(header.length!==3||new Set(header).size!==3||CSV_HEADER.some(k=>!header.includes(k))) fail('Required header: tx_hash,address,expected_net_usdc. Use exactly these three columns, in any order.');
  const nonempty=records.slice(1).map((values,index)=>({values,record:index+2})).filter(r=>r.values.some(c=>c.trim()!==''));
  if(!nonempty.length)fail('CSV has no data rows. Add a transaction hash, nonzero address and positive expected net.');
  if(nonempty.length>MAX_BATCH_ROWS)fail('Maximum 20 data rows per batch. Split this file into smaller batches.');
  return prepareBatchRows(nonempty.map(({values,record})=>({record,fieldError:values.length!==3,raw:Object.fromEntries(CSV_HEADER.map(k=>[k,values[header.indexOf(k)]??'']))})));
}

// Validate decoded fields directly. CSV serialization overhead is not input-file size.
export function prepareBatchRows(source) {
  if(!Array.isArray(source)||!source.length||source.length>MAX_BATCH_ROWS)fail('Use 1–20 nonempty batch records.');
  const decodedBytes=source.reduce((n,r)=>n+CSV_HEADER.reduce((m,k)=>m+new TextEncoder().encode(String(r?.raw?.[k]??'')).length,0),0);
  if(decodedBytes>MAX_CSV_BYTES)fail('Decoded batch fields exceed the 100 KB input limit.');
  const seen=new Map();
  return source.map((source,index)=>{
    const raw=Object.fromEntries(CSV_HEADER.map(k=>[k,String(source?.raw?.[k]??'')]));
    const record=Number.isInteger(source?.record)&&source.record>=2?source.record:index+2;
    const row={record,raw,status:'ready',note:'',input:null,fieldError:!!source?.fieldError};
    try {
      if(row.fieldError)throw new Error('This record must contain exactly three fields.');
      if(!raw.expected_net_usdc.trim())throw new Error('Expected net is required for a batch. Use a positive decimal, not an invoice balance by assumption.');
      row.input=validateInput({txHash:raw.tx_hash.trim(),recipient:raw.address.trim(),expectedAmount:raw.expected_net_usdc.trim(),minConfirmations:1});
      const key=row.input.txHash+':'+row.input.recipient;
      if(seen.has(key)) {row.status='duplicate';row.duplicateOf=seen.get(key);row.note=`Same transaction and address as record ${seen.get(key)}. This is repeated input, not another on-chain payment; reconcile the source records.`;}
      else seen.set(key,record);
    } catch(error) {row.status='invalid';row.errorCode='invalid_input';row.note=error.message;}
    return row;
  });
}

function pause(ms,signal) {
  if(signal?.aborted)return Promise.reject(new VerificationError('cancelled','Batch cancelled.'));
  return new Promise((resolve,reject)=>{const done=()=>{signal?.removeEventListener('abort',abort);resolve();};const id=setTimeout(done,ms);const abort=()=>{clearTimeout(id);signal?.removeEventListener('abort',abort);reject(new VerificationError('cancelled','Batch cancelled.'));};signal?.addEventListener('abort',abort,{once:true});});
}

export function createPacedReader({signal,rpc,requestDelayMs=350}={}) {
  const upstream=rpc??createRPC(undefined,globalThis.fetch,{signal});
  const cache=new Map();let reads=0,lastRead=null;
  const read=async(method,params=[])=>{
    if(signal?.aborted)throw new VerificationError('cancelled','Batch cancelled.');
    const key=method+JSON.stringify(params),cached=method!=='eth_blockNumber';
    if(cached&&cache.has(key))return cache.get(key);
    // Monotonic pacing plus a small scheduling guard for browser request observation.
    if(lastRead!==null&&requestDelayMs>0){const target=lastRead+requestDelayMs+10;while(performance.now()<target)await pause(target-performance.now(),signal);}
    lastRead=performance.now();reads++;const result=await upstream(method,params);if(cached)cache.set(key,result);return result;
  };
  return {read,get reads(){return reads;}};
}

export async function runBatch(source,{signal,rpc,onUpdate=()=>{},requestDelayMs=350}={}) {
  // Revalidate raw descriptors without re-encoding the accepted input file.
  const rows=prepareBatchRows(source);
  const reader=createPacedReader({signal,rpc,requestDelayMs});const read=reader.read;let stopReason=null;
  const update=()=>onUpdate(rows.map(r=>({...r})),{rpcReads:reader.reads});
  for(const row of rows) {
    if(row.status!=='ready')continue;
    if(signal?.aborted||stopReason){row.status='not_checked';row.errorCode=stopReason??'cancelled';row.note='Not queried. '+(stopReason==='rate_limited'?'Public RPC rate limit: batch stopped; no automatic retry.':'Batch stopped; prior results are retained.');update();continue;}
    row.status='checking';update();
    try {
      const c=await verifyTransaction(row.input,read);
      if(signal?.aborted)throw new VerificationError('cancelled','Batch cancelled.');
      row.certificate=c;
      if(!c.confirmationPolicyMet){row.status='unverifiable';row.errorCode='observation_policy';row.note='Included-block policy not met; no batch match conclusion.';}
      else {row.status={exact:'matched',under:'under',over:'over'}[c.amountComparison];row.note=reviewObservation(c).comparison+' '+(reviewObservation(c).caseContext??'A comparison with the supplied expectation, not invoice settlement.');}
    }catch(error){row.status=error.code==='cancelled'?'cancelled':'unverifiable';row.errorCode=error.code??'verification_error';row.note=error.message??'Verification did not complete.';if(['rate_limited','wrong_chain','cancelled'].includes(row.errorCode))stopReason=row.errorCode;}
    update();
  }
  return {rows,rpcReads:reader.reads,stopReason:stopReason??(signal?.aborted?'cancelled':null),checkedAt:new Date().toISOString()};
}

// Spreadsheet-safe text: quoted delimiters plus a literal prefix for formula starters.
export function csvCell(value) {
  let text=String(value??'');
  if(/^[\s\uFEFF]*[=+\-@]/.test(text)||/^[\x00-\x1f\x7f]/.test(text))text="'"+text;
  return '"'+text.replaceAll('"','""')+'"';
}
export function exportBatchCSV(rows,{exceptionsOnly=true}={}) {
  const header=['record','status',...CSV_HEADER,'incoming_usdc','outgoing_usdc','transaction_net_usdc','difference_usdc','error_code','note'];
  const data=rows.filter(r=>!exceptionsOnly||r.status!=='matched').map(r=>[r.record,BATCH_LABELS[r.status]??r.status,r.raw.tx_hash,r.raw.address,r.raw.expected_net_usdc,r.certificate?.incomingUSDC,r.certificate?.outgoingUSDC,r.certificate?.netReceivedUSDC,r.certificate?.differenceUSDC,r.errorCode,r.note]);
  return [header,...data].map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';
}

const DIRECT='0x68e75b9710c19c0caf34d6cb440202ba5fffaef10dbcf13e5f49ee0d216dff2a',SWAP='0x1732bf16a26831ba5a7d183ceb35c893bb9053630f9549ed99269985ab62d7d8',ADDRESS='0xa818cfe3d358dc65a7a1a21514faeefacf2ec4b3';
export const PUBLIC_BATCH_CSV=[CSV_HEADER.join(','),[DIRECT,ADDRESS,'100.01'].join(','),[SWAP,'0x870c73c98a14b6956b79247e1a1cdc68ba0060ee','1458'].join(','),[SWAP,'0xe9fae1c386c6f45b1fb3c3ef01ade424dad4bccf','1'].join(','),[DIRECT,ADDRESS,'100.01'].join(','),['0x'+'0'.repeat(64),ADDRESS,'1'].join(',')].join('\r\n')+'\r\n';
