// Offline artifact review: no RPC, no wallet and no trust in claimed order summaries.
import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import assert from 'node:assert/strict';
import { ARC, TRANSFER, formatAmount } from '../web/verifier.mjs';
import { recomputeOrderBundle } from '../web/orders.mjs';
const input=process.argv[2]??new URL('../evidence/order-demo-bundle.json',import.meta.url).pathname;
const result=recomputeOrderBundle(await readFile(input,'utf8')),seen=new Set(),sums=new Map(),payments=[];
for(const row of result.rows){
  if(row.status!=='observed')continue;const c=row.certificate;assert.ok(!seen.has(c.transactionHash),'A hash must not contribute twice to this whole-transaction allocation.');seen.add(c.transactionHash);
  let incoming=0n,outgoing=0n;
  for(const log of c.evidence.receipt.logs){if(log.address.toLowerCase()!==ARC.emitter||log.topics[0].toLowerCase()!==TRANSFER)continue;const from=('0x'+log.topics[1].slice(-40)).toLowerCase(),to=('0x'+log.topics[2].slice(-40)).toLowerCase(),units=BigInt(log.data),zero='0x'+'0'.repeat(40);if(!units||from===to)continue;if(to===c.recipient&&from!==zero)incoming+=units;if(from===c.recipient)outgoing+=units;}
  const net=incoming-outgoing;assert.equal(formatAmount(incoming),c.incomingUSDC);assert.equal(formatAmount(outgoing),c.outgoingUSDC);assert.equal(formatAmount(net),c.netReceivedUSDC);sums.set(row.orderId,(sums.get(row.orderId)??0n)+net);payments.push({record:row.record,hash:c.transactionHash,address:c.recipient,systemIncomingUnits:incoming.toString(),systemOutgoingUnits:outgoing.toString(),netUSDC:formatAmount(net)});
}
for(const order of result.orders)assert.equal(order.observedNetUSDC,formatAmount(sums.get(order.orderId)??0n));
const report={checkedAt:new Date().toISOString(),passed:true,file:basename(input),method:'Recompute saved receipts with core checks, independently decode canonical system logs, reject repeated contributing hashes and sum raw integer units by unverified order label',orders:result.orders,payments,rpcReads:0,claimedOrdersTrusted:false,limits:'Offline internal consistency only. Unsigned saved responses and user-supplied order associations do not establish chain authenticity, commercial settlement or customer intent.'};
if(!process.argv[2])await writeFile(new URL('../evidence/order-independent-audit.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
