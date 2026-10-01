import test from 'node:test';
import assert from 'node:assert/strict';
import { ARC, TRANSFER, createRPC, verifyEvidence, verifyTransaction, parseAmount, formatAmount } from '../web/verifier.mjs';
import { SAMPLE_INPUT, sampleEvidence } from '../web/sample.mjs';
const verify = (e = sampleEvidence(), input = SAMPLE_INPUT) => verifyEvidence(input, e);
const reject = (e, code, input = SAMPLE_INPUT) => assert.throws(() => verify(e, input), error => error.code === code);
const topic = a => '0x' + a.slice(2).padStart(64, '0');
function additional(e, from, to, amount, index = '0x2') { e.receipt.logs.push({ ...e.receipt.logs[0], topics: [TRANSFER, topic(from), topic(to)], data: '0x' + parseAmount(amount).toString(16).padStart(64,'0'), logIndex: index }); }
test('Arc ERC-20 dual stream is counted once, with exact 18-decimal arithmetic', () => {
  const result = verify(); assert.equal(result.status, 'matched'); assert.equal(result.incomingUSDC, '12.5'); assert.equal(result.ignoredDuplicateStreamLogs, 1); assert.equal(result.confirmations, '5');
});
test('native-only transfer qualifies', () => { const e = sampleEvidence(); e.receipt.logs.pop(); assert.equal(verify(e).status, 'matched'); });
test('ERC-20 event alone does not substitute for the mainnet system stream', () => { const e = sampleEvidence(); e.receipt.logs.shift(); reject(e, 'inconsistent_streams'); });
test('same event or symbol from another token never qualifies', () => { const e = sampleEvidence(); e.receipt.logs.forEach(l => l.address = '0x' + '9'.repeat(40)); assert.equal(verify(e).status, 'no_payment'); });
test('testnet and arbitrary chain IDs fail closed', () => { const e = sampleEvidence(); e.chainId = '0x4cef52'; reject(e, 'wrong_chain'); });
test('failed transaction with convincing logs is rejected', () => { const e = sampleEvidence(); e.receipt.status = '0x0'; reject(e, 'failed_transaction'); });
test('pending or absent receipt is rejected', () => { const e = sampleEvidence(); e.receipt = null; reject(e, 'not_mined'); });
test('receipt transaction identity must match', () => { const e = sampleEvidence(); e.receipt.transactionHash = '0x' + 'c'.repeat(64); reject(e,'invalid_evidence'); });
test('canonical block mismatch detects reorg/inconsistency', () => { const e = sampleEvidence(); e.block.hash = '0x' + 'c'.repeat(64); reject(e, 'reorg_or_inconsistent'); });
test('canonical block number must match', () => { const e = sampleEvidence(); e.block.number = '0x65'; reject(e, 'reorg_or_inconsistent'); });
test('missing canonical block cannot verify', () => { const e = sampleEvidence(); e.block = null; reject(e, 'reorg_or_inconsistent'); });
test('removed, foreign and wrongly attributed logs fail closed', () => {
  for (const fields of [{removed:true},{transactionHash:'0x'+'c'.repeat(64)},{blockHash:'0x'+'c'.repeat(64)},{blockNumber:'0x65'}]) { const e = sampleEvidence(); Object.assign(e.receipt.logs[0], fields); reject(e,'invalid_evidence'); }
});
test('duplicate indices are rejected, not counted twice', () => { const e = sampleEvidence(); e.receipt.logs.push(structuredClone(e.receipt.logs[0])); reject(e,'invalid_evidence'); });
test('malformed Transfer ABI cannot pass', () => {
  for (const fields of [{data:'0x01'},{topics:[TRANSFER]},{topics:[TRANSFER,'0x'+'f'.repeat(64),topic(SAMPLE_INPUT.recipient)]}]) { const e = sampleEvidence(); Object.assign(e.receipt.logs[0], fields); reject(e, 'invalid_evidence'); }
});
test('mint, burn, self and zero movement are not invoice payments', () => {
  for (const [from,to,units] of [['0x'+'0'.repeat(40),SAMPLE_INPUT.recipient,1n],[SAMPLE_INPUT.recipient,'0x'+'0'.repeat(40),1n],[SAMPLE_INPUT.recipient,SAMPLE_INPUT.recipient,1n],['0x'+'1'.repeat(40),SAMPLE_INPUT.recipient,0n]]) {
    const e = sampleEvidence(); e.receipt.logs = [{ ...e.receipt.logs[0], topics:[TRANSFER,topic(from),topic(to)],data:'0x'+units.toString(16).padStart(64,'0') }]; assert.equal(verify(e).status,'no_payment');
  }
});
test('wrong recipient does not pass', () => { assert.equal(verify(sampleEvidence(), { ...SAMPLE_INPUT, recipient: '0x'+'3'.repeat(40) }).status,'no_payment'); });
test('low confirmations remain unverified by policy', () => { const e = sampleEvidence(); e.head = '0x64'; assert.equal(verify(e).status,'awaiting_confirmations'); });
test('RPC head behind receipt is inconsistent', () => { const e = sampleEvidence(); e.head = '0x63'; reject(e,'invalid_evidence'); });
test('amount mismatch catches overpayment and underpayment', () => { for (const expectedAmount of ['12.49','12.51']) assert.equal(verify(sampleEvidence(),{...SAMPLE_INPUT,expectedAmount}).status,'amount_mismatch'); });
test('no expected amount means observed transfer only', () => { const r=verify(sampleEvidence(),{...SAMPLE_INPUT,expectedAmount:''}); assert.equal(r.status,'verified_transfer'); assert.equal(r.exactAmountMatch,null); });
test('outgoing refunds reduce net; full refund does not count as paid', () => {
  const e = sampleEvidence(); additional(e,SAMPLE_INPUT.recipient,'0x'+'1'.repeat(40),'2.5'); assert.equal(verify(e).netReceivedUSDC,'10'); assert.equal(verify(e).status,'amount_mismatch');
  additional(e,SAMPLE_INPUT.recipient,'0x'+'1'.repeat(40),'10','0x3'); assert.equal(verify(e).status,'no_net_receipt');
});
test('burning received funds reduces net retained receipt', () => {
  const e=sampleEvidence();additional(e,SAMPLE_INPUT.recipient,'0x'+'0'.repeat(40),'12.5');assert.equal(verify(e).status,'no_net_receipt');assert.equal(verify(e).outgoingUSDC,'12.5');
});
test('multiple incoming movements aggregate without using transaction to/value', () => {
  const e=sampleEvidence(); additional(e,'0x'+'4'.repeat(40),SAMPLE_INPUT.recipient,'7.5'); e.receipt.to = '0x'+'9'.repeat(40); assert.equal(verify(e,{...SAMPLE_INPUT,expectedAmount:'20'}).status,'matched');
});
test('exact dust amounts and huge integers avoid floating point', () => {
  assert.equal(formatAmount(parseAmount('0.000000000000000001')),'0.000000000000000001');
  const amount='9007199254740993.123456789123456789'; assert.equal(formatAmount(parseAmount(amount)),amount);
  assert.equal(formatAmount(-1n),'-0.000000000000000001');
});
test('malformed inputs, zero, negative, scientific notation and excessive precision rejected', () => {
  for (const amount of ['0','-1','1e6','1.0000000000000000001','01','1,000','Infinity']) assert.throws(()=>parseAmount(amount), e=>e.code==='invalid_input');
  for (const fields of [{txHash:'0x1'},{recipient:'0x'+'0'.repeat(40)},{minConfirmations:0},{minConfirmations:1.5},{minConfirmations:1001}]) reject(sampleEvidence(),'invalid_input',{...SAMPLE_INPUT,...fields});
});
test('malformed JSON-RPC quantities fail closed', () => { for(const v of ['0x01','garbage',5042,null]) { const e=sampleEvidence(); e.chainId=v; reject(e,'invalid_evidence'); } });
test('network orchestration rechecks chain before querying receipt', async () => {
  const calls=[]; await assert.rejects(verifyTransaction(SAMPLE_INPUT,async(method)=>{calls.push(method);return '0x1';}),e=>e.code==='wrong_chain'); assert.deepEqual(calls,['eth_chainId']);
});
test('network orchestration uses canonical numbered block and exports evidence', async () => {
  const e=sampleEvidence();const calls=[]; const r=await verifyTransaction(SAMPLE_INPUT,async(method,params)=>{calls.push([method,params]);return ({eth_chainId:e.chainId,eth_getTransactionReceipt:e.receipt,eth_getBlockByNumber:e.block,eth_blockNumber:e.head})[method];});
  assert.equal(r.status,'matched'); assert.deepEqual(calls[2],['eth_getBlockByNumber',['0x64',false]]);assert.equal(r.evidence.receipt,e.receipt);assert.ok(r.checkedAt);
});
test('RPC disallows writes and unknown endpoints without fetching', async () => {
  let called=false;const rpc=createRPC(ARC.rpc,async()=>{called=true;}); await assert.rejects(rpc('eth_sendRawTransaction',['0x']),e=>e.code==='read_only');assert.equal(called,false);assert.throws(()=>createRPC('http://localhost'),e=>e.code==='invalid_rpc');
});
test('RPC checks response identity, errors, HTTP and invalid JSON', async () => {
  for(const payload of [{jsonrpc:'2.0',id:99,result:'0x13b2'},{jsonrpc:'2.0',id:1,error:{code:-1}},{id:1,result:'0x13b2'},{jsonrpc:'2.0',id:1}]) {
    await assert.rejects(createRPC(ARC.rpc,async()=>({ok:true,json:async()=>payload}))('eth_chainId'),e=>e.code==='rpc_error');
  }
  await assert.rejects(createRPC(ARC.rpc,async()=>({ok:false,status:429}))('eth_chainId'),e=>e.code==='rate_limited');
  await assert.rejects(createRPC(ARC.rpc,async()=>({ok:true,json:async()=>{throw new Error();}}))('eth_chainId'),e=>e.code==='rpc_unavailable');
});
test('RPC uses official URL without credentials and bounded timeout', async () => {
  const rpc=createRPC(ARC.rpc,async(url,options)=>{assert.equal(url,ARC.rpc);assert.equal(options.credentials,'omit');assert.equal(options.method,'POST');assert.ok(options.signal); const request=JSON.parse(options.body);return {ok:true,json:async()=>({jsonrpc:'2.0',id:request.id,result:'0x13b2'})};}); assert.equal(await rpc('eth_chainId'),'0x13b2');
});
