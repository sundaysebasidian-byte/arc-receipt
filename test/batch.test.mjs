import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseCSV, parseBatchCSV, runBatch, exportBatchCSV, csvCell, PUBLIC_BATCH_CSV, CSV_HEADER, createPacedReader } from '../web/batch.mjs';
import { sampleEvidence, SAMPLE_INPUT } from '../web/sample.mjs';
import { VerificationError } from '../web/verifier.mjs';
const hash=SAMPLE_INPUT.txHash,address=SAMPLE_INPUT.recipient;
const csv=(data,header=CSV_HEADER)=>[header.join(','),...data.map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(','))].join('\r\n');
const input=(amount='12.5',tx=hash,to=address)=>[tx,to,amount];
function fixtureRPC(evidence=sampleEvidence()) { const calls=[];return {calls,rpc:async(method,params=[])=>{calls.push({method,params});return ({eth_chainId:evidence.chainId,eth_getTransactionReceipt:evidence.receipt,eth_getBlockByNumber:evidence.block,eth_blockNumber:evidence.head})[method];}}; }

test('CSV supports BOM, CRLF, doubled quotes, embedded commas and newlines',()=>{
  assert.deepEqual(parseCSV('\uFEFFa,b\r\n"x,y","a""b\nc"\r\n'),[['a','b'],['x,y','a"b\nc']]);
});
test('Empty, header-only, missing/duplicate headers and malformed quoting are explained',()=>{
  for(const text of ['',CSV_HEADER.join(','),'tx_hash,address,address\na,b,c','a,b,c\nx,y,z','a,b,c\n"unfinished','a,b,c\n"closed"x,b,c','a,b,c\nx"y,b,c'])assert.throws(()=>parseBatchCSV(text),{code:'invalid_csv'});
});
test('CSV input bounds count nonempty records and UTF-8 bytes',()=>{
  assert.throws(()=>parseBatchCSV(csv(Array.from({length:21},()=>input()))),/Maximum 20/);
  assert.throws(()=>parseBatchCSV('中'.repeat(34_000)),/100 KB/);
  assert.equal(parseBatchCSV(csv([input()])+'\r\n\r\n').length,1);
});
test('Header order can differ; invalid records do not discard valid records',()=>{
  const rows=parseBatchCSV(csv([['12.5',address,hash],['',address,hash],['1',address]],['expected_net_usdc','address','tx_hash']));
  assert.deepEqual(rows.map(r=>r.status),['ready','invalid','invalid']);assert.match(rows[1].note,/required/);
});
test('Missing values, zero/negative/exponent and over-precision amounts are invalid',()=>{
  for(const amount of ['', '0','-1','1e2','0.0000000000000000001'])assert.equal(parseBatchCSV(csv([input(amount)]))[0].status,'invalid');
  for(const row of [['',address,'1'],[hash,'','1'],[hash,'0x'+'0'.repeat(40),'1']])assert.equal(parseBatchCSV(csv([row]))[0].status,'invalid');
  assert.equal(parseBatchCSV(csv([input('0.000000000000000001')]))[0].status,'ready');
});
test('Repeats use normalized transaction/address pairs, even with different expectations',()=>{
  const rows=parseBatchCSV(csv([input(),input('13',hash.toUpperCase().replace('0X','0x'),address.toUpperCase().replace('0X','0x')),input('1',hash,'0x'+'3'.repeat(40))]));
  assert.deepEqual(rows.map(r=>r.status),['ready','duplicate','ready']);assert.match(rows[1].note,/not another on-chain payment/);
});
test('Exact integer comparisons distinguish matching, below and above expected net',async()=>{
  for(const [amount,status,diff] of [['12.5','matched','0'],['12.500000000000000001','under','-0.000000000000000001'],['12.499999999999999999','over','0.000000000000000001']]){
    const f=fixtureRPC();const result=await runBatch(parseBatchCSV(csv([input(amount)])),{rpc:f.rpc,requestDelayMs:0});assert.equal(result.rows[0].status,status);assert.equal(result.rows[0].certificate.differenceUSDC,diff);
  }
});
test('Same transaction at two addresses reuses evidence, but refreshes observed head',async()=>{
  const f=fixtureRPC();const result=await runBatch(parseBatchCSV(csv([input(),input('1',hash,'0x'+'3'.repeat(40)),input('12.5')])),{rpc:f.rpc,requestDelayMs:0});
  assert.deepEqual(result.rows.map(r=>r.status),['matched','under','duplicate']);assert.equal(result.rpcReads,5);assert.equal(f.calls.filter(c=>c.method==='eth_getTransactionReceipt').length,1);assert.equal(f.calls.filter(c=>c.method==='eth_blockNumber').length,2);
});
test('Partial RPC failure keeps preceding results and continues to a later transaction',async()=>{
  const base=fixtureRPC();const other='0x'+'b'.repeat(64),last='0x'+'c'.repeat(64);const e=sampleEvidence();
  const rpc=async(method,params=[])=>{if(method==='eth_getTransactionReceipt'&&params[0]===other)throw new VerificationError('rpc_error','One row failed.');if(method==='eth_getTransactionReceipt'&&params[0]===last)return null;return base.rpc(method,params);};
  const result=await runBatch(parseBatchCSV(csv([input(),input('1',other),input('1',last)])),{rpc,requestDelayMs:0});assert.deepEqual(result.rows.map(r=>r.status),['matched','unverifiable','unverifiable']);assert.equal(result.rows[1].errorCode,'rpc_error');assert.equal(result.rows[2].errorCode,'not_mined');
});
test('Cancellation retains finished rows and prevents remaining requests',async()=>{
  const f=fixtureRPC(),controller=new AbortController();let aborted=false;
  const result=await runBatch(parseBatchCSV(csv([input(),input('1','0x'+'b'.repeat(64))])),{rpc:f.rpc,signal:controller.signal,requestDelayMs:0,onUpdate:rows=>{if(!aborted&&rows[0].status==='matched'){aborted=true;controller.abort();}}});assert.deepEqual(result.rows.map(r=>r.status),['matched','not_checked']);assert.equal(result.rpcReads,4);assert.equal(result.stopReason,'cancelled');
});
test('In-flight cancellation marks current row and never starts later rows',async()=>{
  const controller=new AbortController();let reads=0;
  const rpc=async()=>{reads++;controller.abort();throw new VerificationError('cancelled','Cancelled.');};
  const result=await runBatch(parseBatchCSV(csv([input(),input('1','0x'+'b'.repeat(64))])),{rpc,signal:controller.signal,requestDelayMs:0});assert.deepEqual(result.rows.map(r=>r.status),['cancelled','not_checked']);assert.equal(reads,1);
});
test('Rate limiting stops extra queries without losing earlier rows',async()=>{
  let calls=0;const result=await runBatch(parseBatchCSV(csv([input(),input('1','0x'+'b'.repeat(64))])),{rpc:async()=>{calls++;throw new VerificationError('rate_limited','HTTP429');},requestDelayMs:0});assert.deepEqual(result.rows.map(r=>r.status),['unverifiable','not_checked']);assert.equal(calls,1);assert.equal(result.stopReason,'rate_limited');
});
test('No invalid or duplicate input makes an RPC call; tampered descriptors are revalidated',async()=>{
  const f=fixtureRPC();const rows=parseBatchCSV(csv([input(),input('1',hash,address),['=HYPERLINK("x")',address,'1']]));rows[2].status='ready';rows[2].input=rows[0].input;
  const result=await runBatch(rows,{rpc:f.rpc,requestDelayMs:0});assert.deepEqual(result.rows.map(r=>r.status),['matched','duplicate','invalid']);assert.equal(result.rpcReads,4);
});
test('Exception CSV round-trips escaped delimiters and protects formula starters',()=>{
  for(const v of ['=1+1','+1','-1','@SUM(A1)',' \t=1','\tvalue','\rvalue','\nvalue','\u0000=1','\uFEFF=1'])assert.ok(parseCSV(csvCell(v))[0][0].startsWith("'"));
  assert.equal(parseCSV(csvCell('a,"b"\nc'))[0][0],'a,"b"\nc');
  const rows=[{record:2,status:'matched',raw:{tx_hash:hash,address,expected_net_usdc:'12.5'},note:'ok'},{record:3,status:'invalid',raw:{tx_hash:'=1+1',address,expected_net_usdc:'1'},note:'bad,"input"\nsecond line'}];const parsed=parseCSV(exportBatchCSV(rows));assert.equal(parsed.length,2);assert.equal(parsed[1][2],"'=1+1");assert.equal(parsed[1].at(-1),'bad,"input"\nsecond line');assert.equal(parseCSV(exportBatchCSV(rows,{exceptionsOnly:false})).length,3);
});
test('Normal swap zero net compares expectation without an unpaid-invoice verdict',async()=>{
  const saved=JSON.parse(await readFile(new URL('../evidence/mainnet-roundtrip.json',import.meta.url),'utf8'));const f=fixtureRPC(saved.evidence);const row=parseBatchCSV(csv([[saved.transactionHash,saved.recipient,'1']]));const result=await runBatch(row,{rpc:f.rpc,requestDelayMs:0});assert.equal(result.rows[0].status,'under');assert.equal(result.rows[0].certificate.netReceivedUSDC,'0');assert.match(result.rows[0].note,/not merchant nonpayment evidence/);
});
test('Public sample is five records, with one repeat and an explicitly unknown hash',()=>{const rows=parseBatchCSV(PUBLIC_BATCH_CSV);assert.equal(rows.length,5);assert.equal(rows[3].status,'duplicate');assert.equal(rows[4].input.txHash,'0x'+'0'.repeat(64));});


test('Exactly 100000-byte accepted CSV runs without serialization expansion',async()=>{
  const text=CSV_HEADER.join(',')+'\n'+input().join(',');const bounded=text+' '.repeat(100000-new TextEncoder().encode(text).length);
  assert.equal(new TextEncoder().encode(bounded).length,100000);const f=fixtureRPC();const result=await runBatch(parseBatchCSV(bounded),{rpc:f.rpc,requestDelayMs:0});assert.equal(result.rows[0].status,'matched');assert.equal(result.rpcReads,4);
});
test('Malformed extra CSV fields stay invalid during descriptor revalidation',async()=>{
  const rows=parseBatchCSV(csv([[...input(),'extra'],input()]));rows[0].status='ready';const f=fixtureRPC(),result=await runBatch(rows,{rpc:f.rpc,requestDelayMs:0});assert.deepEqual(result.rows.map(r=>r.status),['invalid','matched']);assert.equal(result.rows[0].fieldError,true);assert.equal(result.rpcReads,4);
});
test('Paced reader enforces monotonic minimum spacing and cached reads stay local',async()=>{
  const starts=[];const r=createPacedReader({requestDelayMs:5,rpc:async()=>{starts.push(performance.now());return 'ok';}});await r.read('eth_chainId');await r.read('eth_chainId');await r.read('eth_blockNumber');await r.read('eth_blockNumber');assert.equal(starts.length,3);assert.ok(starts.slice(1).every((v,i)=>v-starts[i]>=15));
});
