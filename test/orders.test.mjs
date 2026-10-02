import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import { sampleEvidence, SAMPLE_INPUT } from '../web/sample.mjs';
import { ARC, parseAmount, VerificationError } from '../web/verifier.mjs';
import { parseCSV } from '../web/batch.mjs';
import { parseOrderCSV, prepareOrderRows, aggregateOrders, runOrderReview, exportOrderCSV, exportOrderBundle, recomputeOrderBundle, ORDER_HEADER, SPLIT_ORDER_DEMO, CONFLICT_ORDER_DEMO } from '../web/orders.mjs';
const HASH=SAMPLE_INPUT.txHash,SECOND='0x'+'b'.repeat(64),THIRD='0x'+'c'.repeat(64),ADDRESS=SAMPLE_INPUT.recipient;
const csv=(rows,header=ORDER_HEADER)=>[header,...rows].map(r=>r.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n');
const row=(id='ORDER-1',total='20',hash=HASH,address=ADDRESS)=>[id,total,hash,address];
function evidence(hash,amount='12.5'){const e=structuredClone(sampleEvidence()),units=parseAmount(amount);e.receipt.transactionHash=hash;for(const log of e.receipt.logs){log.transactionHash=hash;if(log.address.toLowerCase()===ARC.emitter)log.data='0x'+units.toString(16).padStart(64,'0');if(log.address.toLowerCase()===ARC.usdc)log.data='0x'+(units/10n**12n).toString(16).padStart(64,'0');}if(units%10n**12n)e.receipt.logs=e.receipt.logs.filter(l=>l.address.toLowerCase()!==ARC.usdc);return e;}
function rpcFixture({second='7.5',failHash=null,rateLimit=false}={}){const calls=[],a=evidence(HASH),b=evidence(SECOND,second);return {calls,rpc:async(method,params=[])=>{calls.push({method,params});if(rateLimit)throw new VerificationError('rate_limited','HTTP429');if(method==='eth_getTransactionReceipt'){if(params[0]===failHash)throw new VerificationError('rpc_error','A row failed.');return params[0]===HASH?a.receipt:params[0]===SECOND?b.receipt:null;}return {eth_chainId:a.chainId,eth_getBlockByNumber:a.block,eth_blockNumber:a.head}[method];}};}

test('Order CSV validates headers, limits, row fields and order IDs without discarding other rows',()=>{
  for(const text of ['',ORDER_HEADER.join(','),'order_id,order_total_usdc,tx_hash,tx_hash\nx,1,a,a'])assert.throws(()=>parseOrderCSV(text));
  assert.throws(()=>parseOrderCSV(csv(Array.from({length:21},()=>row()))),/1–20/);
  const rows=parseOrderCSV(csv([row(),row('', '20',SECOND),row('ORDER-1','20',THIRD).slice(0,3)]));assert.deepEqual(rows.map(r=>r.status),['ready','invalid','invalid']);assert.equal(rows[2].fieldError,true);
});
test('Order labels are case-sensitive; total spelling is normalized with exact integer units',()=>{
  const rows=parseOrderCSV(csv([row(' ORDER-1 ','20.00'),row('ORDER-1','20',SECOND),row('order-1','1',THIRD)]));assert.equal(rows[0].orderId,'ORDER-1');assert.equal(rows[0].orderTotal,'20');assert.equal(aggregateOrders(rows).length,2);assert.ok(rows.every(r=>r.status==='ready'));
});
test('Conflicting order totals block comparison and query eligibility',()=>{
  const rows=parseOrderCSV(csv([row('ORDER-1','20'),row('ORDER-1','21',SECOND)]));assert.deepEqual(rows.map(r=>r.status),['definition_conflict','definition_conflict']);assert.equal(aggregateOrders(rows)[0].status,'definition_conflict');assert.equal(aggregateOrders(rows)[0].differenceUSDC,null);
});
test('Identical repeated assignment counts once and warns without asserting extra payment',async()=>{
  const f=rpcFixture(),report=await runOrderReview(parseOrderCSV(csv([row('ORDER-1','12.5'),row('ORDER-1','12.50')])) ,{rpc:f.rpc,requestDelayMs:0});assert.deepEqual(report.rows.map(r=>r.status),['observed','duplicate']);assert.equal(report.orders[0].observedNetUSDC,'12.5');assert.equal(report.orders[0].status,'matched');assert.equal(report.orders[0].observedPayments,1);assert.match(report.orders[0].warnings.join(' '),/counted once/);assert.equal(report.rpcReads,4);
});
test('One hash across orders blocks both allocations before any RPC',async()=>{
  const f=rpcFixture(),report=await runOrderReview(parseOrderCSV(csv([row('ORDER-A','12.5'),row('ORDER-B','12.5')])),{rpc:f.rpc,requestDelayMs:0});assert.equal(f.calls.length,0);assert.ok(report.orders.every(o=>o.status==='allocation_conflict'&&!o.complete&&o.differenceUSDC===null));
});
test('One hash at different addresses is blocked even within one order',()=>{
  const rows=parseOrderCSV(csv([row(),row('ORDER-1','20',HASH,'0x'+'3'.repeat(40))]));assert.ok(rows.every(r=>r.allocationConflict));assert.equal(aggregateOrders(rows)[0].status,'allocation_conflict');
});
test('Invalid order definitions cannot hide a cross-order hash allocation',()=>{
  const rows=parseOrderCSV(csv([row('ORDER-A','12.5'),row('ORDER-B','not-a-total')]));assert.equal(rows[0].status,'allocation_conflict');assert.equal(rows[1].status,'invalid');assert.ok(rows[1].allocationConflict);
});
test('Distinct partial transfers aggregate exactly, without repeating the order total',async()=>{
  const f=rpcFixture(),report=await runOrderReview(parseOrderCSV(csv([row(),row('ORDER-1','20',SECOND)])),{rpc:f.rpc,requestDelayMs:0});assert.equal(report.orders[0].observedNetUSDC,'20');assert.equal(report.orders[0].expectedTotalUSDC,'20');assert.equal(report.orders[0].differenceUSDC,'0');assert.equal(report.orders[0].status,'matched');assert.ok(report.rows.every(r=>r.certificate.expectedAmountUSDC===null));assert.equal(report.rpcReads,6);
});
test('One-wei aggregate difference survives above/below comparison',async()=>{
  for(const [total,status,difference] of [['20.000000000000000001','under','-0.000000000000000001'],['19.999999999999999999','over','0.000000000000000001']]){const f=rpcFixture();const report=await runOrderReview(parseOrderCSV(csv([row('ORDER-1',total),row('ORDER-1',total,SECOND)])),{rpc:f.rpc,requestDelayMs:0});assert.equal(report.orders[0].status,status);assert.equal(report.orders[0].differenceUSDC,difference);}
});
test('One failed partial observation prevents a match even if an observed row equals the total',async()=>{
  const f=rpcFixture({failHash:SECOND}),report=await runOrderReview(parseOrderCSV(csv([row('ORDER-1','12.5'),row('ORDER-1','12.5',SECOND)])),{rpc:f.rpc,requestDelayMs:0});assert.equal(report.orders[0].observedNetUSDC,'12.5');assert.equal(report.orders[0].status,'incomplete');assert.equal(report.orders[0].differenceUSDC,null);assert.equal(report.orders[0].complete,false);
});
test('Zero and outgoing components stay visible in aggregate net with context warnings',async()=>{
  for(const outgoing of [false,true]){const a=evidence(HASH),b=evidence(SECOND,'7.5');if(outgoing){for(const log of b.receipt.logs){const [topic,from,to]=log.topics;log.topics=[topic,to,from];}}else b.receipt.logs=[];const rpc=async(method,params=[])=>method==='eth_getTransactionReceipt'?(params[0]===HASH?a.receipt:b.receipt):({eth_chainId:a.chainId,eth_getBlockByNumber:a.block,eth_blockNumber:a.head})[method];const total=outgoing?'5':'12.5',report=await runOrderReview(parseOrderCSV(csv([row('ORDER-1',total),row('ORDER-1',total,SECOND)])),{rpc,requestDelayMs:0});assert.equal(report.orders[0].observedNetUSDC,total);assert.equal(report.orders[0].status,'matched');assert.match(report.orders[0].warnings.join(' '),/zero or outgoing net/);assert.match(report.orders[0].scope,/not proof of commercial settlement/);}
});
test('A malformed row remains incomplete after bundle export and recomputation',async()=>{
  const f=rpcFixture(),rows=parseOrderCSV(csv([row('ORDER-1','12.5'),[...row('ORDER-1','12.5',SECOND),'extra']]));const report=await runOrderReview(rows,{rpc:f.rpc,requestDelayMs:0});assert.equal(report.orders[0].status,'incomplete');const recomputed=recomputeOrderBundle(exportOrderBundle(report));assert.equal(recomputed.orders[0].status,'incomplete');assert.equal(recomputed.rows[1].fieldError,true);
});
test('Other orders still verify when a separate allocation is conflicted',async()=>{
  const f=rpcFixture(),report=await runOrderReview(parseOrderCSV(csv([row('A','12.5'),row('B','12.5'),row('C','7.5',SECOND)])),{rpc:f.rpc,requestDelayMs:0});assert.deepEqual(report.orders.map(o=>o.status),['allocation_conflict','allocation_conflict','matched']);assert.equal(report.rpcReads,4);
});
test('Cancellation keeps earlier net but leaves the multi-payment order incomplete',async()=>{
  const f=rpcFixture(),controller=new AbortController();let cancelled=false;const report=await runOrderReview(parseOrderCSV(csv([row(),row('ORDER-1','20',SECOND)])),{rpc:f.rpc,signal:controller.signal,requestDelayMs:0,onUpdate:r=>{if(!cancelled&&r.rows[0].status==='observed'){cancelled=true;controller.abort();}}});assert.deepEqual(report.rows.map(r=>r.status),['observed','not_checked']);assert.equal(report.orders[0].observedNetUSDC,'12.5');assert.equal(report.orders[0].status,'incomplete');assert.equal(report.rpcReads,4);
});
test('Rate limit stops later order queries and keeps explicit incomplete states',async()=>{
  const f=rpcFixture({rateLimit:true}),report=await runOrderReview(parseOrderCSV(csv([row('A'),row('B','20',SECOND)])),{rpc:f.rpc,requestDelayMs:0});assert.deepEqual(report.rows.map(r=>r.status),['unverifiable','not_checked']);assert.ok(report.orders.every(o=>o.status==='incomplete'));assert.equal(f.calls.length,1);
});
test('Order CSV export escapes labels and makes formula-like IDs literal text',async()=>{
  const f=rpcFixture(),report=await runOrderReview(parseOrderCSV(csv([row('=SUM(1,2)','12.5')])),{rpc:f.rpc,requestDelayMs:0});const records=parseCSV(exportOrderCSV(report));assert.equal(records[1][0],"'=SUM(1,2)");assert.match(records[1].at(-1),/not proof of commercial settlement/);assert.equal(parseCSV(exportOrderCSV(report,{exceptionsOnly:true})).length,1);
});
test('Bundle recomputation ignores claimed totals and reveals tampered receipt amounts',async()=>{
  const f=rpcFixture(),report=await runOrderReview(parseOrderCSV(csv([row(),row('ORDER-1','20',SECOND)])),{rpc:f.rpc,requestDelayMs:0});const bundle=JSON.parse(exportOrderBundle(report));bundle.claimedOrders[0].observedNetUSDC='999';bundle.receipts[0].certificate.netReceivedUSDC='999';const recomputed=recomputeOrderBundle(JSON.stringify(bundle));assert.equal(recomputed.orders[0].observedNetUSDC,'20');assert.equal(recomputed.claimedOrdersTrusted,false);assert.deepEqual(recomputed.rows[0].alteredFields,['netReceivedUSDC']);
});
test('Saved synthetic or mismatched transaction evidence is not counted',async()=>{
  const f=rpcFixture(),report=await runOrderReview(parseOrderCSV(csv([row('ORDER-1','12.5')])),{rpc:f.rpc,requestDelayMs:0});for(const alteration of ['synthetic','wrong_hash']){const b=JSON.parse(exportOrderBundle(report));if(alteration==='synthetic')b.receipts[0].certificate.mode='synthetic_offline_example';else b.receipts[0].certificate.evidence.receipt.transactionHash=SECOND;const out=recomputeOrderBundle(JSON.stringify(b));assert.equal(out.orders[0].status,'incomplete');assert.equal(out.orders[0].observedNetUSDC,'0');}
});
test('No metadata mutation can promote an invalid assignment into a complete order',async()=>{
  const rows=parseOrderCSV(csv([row('ORDER-1','invalid')]));rows[0].status='ready';rows[0].orderTotal='12.5';const f=rpcFixture(),report=await runOrderReview(rows,{rpc:f.rpc,requestDelayMs:0});assert.equal(f.calls.length,0);assert.equal(report.orders[0].status,'incomplete');assert.equal(report.orders[0].complete,false);
});
test('Both demo files keep unmistakable illustrative order IDs and defined conflict roles',()=>{
  const split=parseOrderCSV(SPLIT_ORDER_DEMO);assert.equal(split.length,4);assert.equal(split[2].status,'duplicate');assert.ok(split.every(r=>r.orderId.startsWith('DEMO-')));const conflicts=parseOrderCSV(CONFLICT_ORDER_DEMO);assert.deepEqual(conflicts.map(r=>r.status),['allocation_conflict','allocation_conflict','ready']);
});


test('Exactly 100000-byte order file stays runnable without re-serialization',async()=>{
 const text=ORDER_HEADER.join(',')+'\n'+row('ORDER-1','12.5').join(',');const bounded=text+' '.repeat(100000-new TextEncoder().encode(text).length);const f=rpcFixture(),report=await runOrderReview(parseOrderCSV(bounded),{rpc:f.rpc,requestDelayMs:0});assert.equal(report.orders[0].status,'matched');assert.equal(report.rpcReads,4);
});


test('Independent invalid-address conflict fixture blocks both orders before RPC',async()=>{
 const text=await readFile(new URL('../evidence/independent-invalid-address-conflict.csv',import.meta.url),'utf8');const f=rpcFixture(),report=await runOrderReview(parseOrderCSV(text),{rpc:f.rpc,requestDelayMs:0});assert.equal(f.calls.length,0);assert.ok(report.rows.every(r=>r.allocationConflict));assert.equal(report.rows[1].status,'invalid');assert.ok(report.orders.every(o=>o.status==='allocation_conflict'&&!o.complete&&o.differenceUSDC===null));
});
test('Missing, zero and malformed addresses cannot hide same-hash order allocation',async()=>{
 for(const bad of ['', '0x'+'0'.repeat(40),'not-an-address'])for(const id of ['ORDER-1','ORDER-2']){const rows=parseOrderCSV(csv([row('ORDER-1','12.5'),row(id,'12.5',HASH.toUpperCase().replace('0X','0x'),bad)]));rows[1].input=rows[0].input;rows[1].status='ready';const f=rpcFixture(),report=await runOrderReview(rows,{rpc:f.rpc,requestDelayMs:0});assert.equal(f.calls.length,0);assert.ok(report.rows.every(r=>r.allocationConflict));assert.ok(report.orders.every(o=>o.status==='allocation_conflict'&&!o.complete));assert.equal(report.rows[1].txHash,HASH);}
});
test('Unknown order labels cannot hide a valid hash in another assignment',async()=>{
 const f=rpcFixture(),report=await runOrderReview(parseOrderCSV(csv([row('ORDER-1','12.5'),row('', '12.5')])),{rpc:f.rpc,requestDelayMs:0});assert.equal(f.calls.length,0);assert.equal(report.rows[1].status,'invalid');assert.ok(report.rows.every(r=>r.allocationConflict));assert.equal(report.orders[0].complete,false);
});
test('Extra-only malformed input stays visible and survives run, bundle and recomputation',async()=>{
 const rows=parseOrderCSV(csv([row('ORDER-1','12.5'),['','','','','unexpected-extra']]));assert.equal(rows.length,2);assert.equal(rows[1].status,'invalid');assert.equal(rows[1].fieldError,true);assert.deepEqual(rows[1].extraFields,['unexpected-extra']);const f=rpcFixture(),report=await runOrderReview(rows,{rpc:f.rpc,requestDelayMs:0});assert.equal(report.rows.length,2);assert.equal(report.rows[1].status,'invalid');const b=JSON.parse(exportOrderBundle(report));assert.deepEqual(b.inputRows[1].extraFields,['unexpected-extra']);const out=recomputeOrderBundle(JSON.stringify(b));assert.equal(out.rows.length,2);assert.equal(out.rows[1].fieldError,true);assert.deepEqual(out.rows[1].extraFields,['unexpected-extra']);
});
test('Independent twenty-one nonempty-record fixture is rejected before projection',async()=>{
 const text=await readFile(new URL('../evidence/independent-extra-only-records.csv',import.meta.url),'utf8');assert.throws(()=>parseOrderCSV(text),/1–20/);const rows=parseOrderCSV(csv([row(),...Array.from({length:19},()=>['','','','','unexpected-extra'])])+'\r\n,,,,\r\n');assert.equal(rows.length,20);assert.equal(rows.filter(r=>r.status==='invalid').length,19);
});
test('Extra-field descriptor metadata cannot promote invalid data or bypass byte bound',async()=>{
 const rows=parseOrderCSV(csv([row('ORDER-1','12.5')]));rows[0].extraFields=['unexpected-extra'];rows[0].fieldError=false;const f=rpcFixture(),report=await runOrderReview(rows,{rpc:f.rpc,requestDelayMs:0});assert.equal(f.calls.length,0);assert.equal(report.rows[0].status,'invalid');assert.equal(report.orders[0].complete,false);rows[0].extraFields=['x'.repeat(100001)];assert.throws(()=>prepareOrderRows(rows),/100 KB/);
});
