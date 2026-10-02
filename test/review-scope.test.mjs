import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {verifyEvidence} from '../web/verifier.mjs';
import {reviewObservation,REVIEW_SCOPE,createReadableReceipt,parseReceiptFile,recheckReceiptFile} from '../web/receipt.mjs';
import {SAMPLE_INPUT,sampleEvidence} from '../web/sample.mjs';
const direct=JSON.parse(await readFile(new URL('../evidence/direct-native-example.json',import.meta.url),'utf8'));
const swap=JSON.parse(await readFile(new URL('../evidence/mainnet-roundtrip.json',import.meta.url),'utf8'));
const observed=(saved,changes={})=>verifyEvidence({txHash:saved.transactionHash,recipient:saved.recipient,expectedAmount:'',minConfirmations:1,...changes},saved.evidence);
const topic=a=>'0x'+'0'.repeat(24)+a.slice(2);
test('real empty-calldata direct send is a net observation, not merchant identity',()=>{
 const c=observed(direct,{expectedAmount:'100.01'}),view=reviewObservation(c);
 assert.deepEqual([c.incomingUSDC,c.outgoingUSDC,c.netReceivedUSDC],['100.01','0','100.01']);
 assert.equal(view.label,'Expected transaction net matched');assert.match(view.explanation,/does not establish a customer payment or invoice settlement/);
 assert.equal(direct.research.transaction.input,'0x');assert.equal(direct.research.recipientCode,'0x');
});
test('0.000001 expected-net difference is exact and explicitly compares net',()=>{
 const c=observed(direct,{expectedAmount:'100.010001'}),view=reviewObservation(c);
 assert.equal(c.differenceUSDC,'-0.000001');assert.match(view.comparison,/Compared with transaction net: Below expected by 0\.000001 USDC/);
 assert.match(view.explanation,/does not establish an unpaid invoice/);
});
test('normal swap intermediary shows gross directions and no assumed expected net',()=>{
 const c=observed(swap),view=reviewObservation(c);
 assert.deepEqual([c.incomingUSDC,c.outgoingUSDC,c.netReceivedUSDC],['1458.033036','1458.033036','0']);
 assert.equal(view.label,'Zero net flow observed');assert.match(view.caseContext,/normal cirBTC → USDC swap/);
 assert.match(view.caseContext,/not merchant nonpayment evidence/);assert.equal(view.checks.find(x=>x.key==='amount').state,'not_requested');
 assert.match(view.comparison,/comparison not requested/);
});
test('same swap has positive net at its final recipient; intermediary zero cannot decide invoice settlement',()=>{
 const c=observed(swap,{recipient:'0x870c73c98a14b6956b79247e1a1cdc68ba0060ee'});
 assert.equal(c.incomingUSDC,'1458.033036');assert.equal(c.netReceivedUSDC,'1458.033036');
 assert.equal(reviewObservation(c).caseContext,null);assert.match(reviewObservation(c).explanation,/customer intent and invoice allocation remain unknown/);
});
test('mint-only balance increase is explicitly excluded rather than called missing funds',()=>{
 const e=sampleEvidence();for(const l of e.receipt.logs)l.topics[1]=topic('0x'+'0'.repeat(40));
 const c=verifyEvidence({...SAMPLE_INPUT,expectedAmount:''},e),view=reviewObservation(c);
 assert.equal(c.incomingUSDC,'0');assert.match(view.mintNotice,/zero incoming transfers does not mean zero balance increase/);
 assert.match(createReadableReceipt(c),/Incoming mints can increase a balance while being excluded here/);
});
test('sweep with valid incoming transfer and same-transaction forwarding is not an unpaid-invoice verdict',()=>{
 const e=sampleEvidence();e.receipt.logs.push({...e.receipt.logs[0],logIndex:'0x2',topics:[e.receipt.logs[0].topics[0],topic(SAMPLE_INPUT.recipient),topic('0x'+'4'.repeat(40))]});
 const c=verifyEvidence({...SAMPLE_INPUT,expectedAmount:''},e);
 assert.deepEqual([c.incomingUSDC,c.outgoingUSDC,c.netReceivedUSDC],['12.5','12.5','0']);
 assert.match(reviewObservation(c).explanation,/normal in a swap, redemption or sweep/);
 assert.match(createReadableReceipt(c),/A sweep can forward a valid gross receipt/);
});
test('outgoing-only burn stays a visible negative flow instead of being presented as zero',()=>{
 const e=sampleEvidence();e.receipt.logs=[{...e.receipt.logs[0],topics:[e.receipt.logs[0].topics[0],topic(SAMPLE_INPUT.recipient),topic('0x'+'0'.repeat(40))]}];
 const c=verifyEvidence({...SAMPLE_INPUT,expectedAmount:''},e);assert.equal(c.netReceivedUSDC,'-12.5');
 assert.equal(reviewObservation(c).label,'Outgoing-only flow observed');assert.match(createReadableReceipt(c),/-12\.5/);
});
test('imported presentation or invoice claims are not trusted; recompute then fresh read preserves fixed basis',async()=>{
 const saved={...direct,reviewScope:{comparisonBasis:'gross',invoice:'INVOICE_MARKED_PAID'}};
 const parsed=parseReceiptFile(JSON.stringify(saved));assert.equal(parsed.saved.reviewScope,undefined);
 const methods=[],e=structuredClone(direct.evidence);e.head='0x'+(BigInt(e.head)+100n).toString(16);
 const fresh=await recheckReceiptFile(JSON.stringify(saved),async method=>{methods.push(method);return({eth_chainId:e.chainId,eth_getTransactionReceipt:e.receipt,eth_getBlockByNumber:e.block,eth_blockNumber:e.head})[method];});
 assert.equal(fresh.netReceivedUSDC,'100.01');assert.deepEqual(methods,['eth_chainId','eth_getTransactionReceipt','eth_getBlockByNumber','eth_blockNumber']);
 const html=createReadableReceipt(fresh);assert.ok(!html.includes('INVOICE_MARKED_PAID'));assert.match(html,/Single-provider unsigned RPC observation/);assert.match(html,/not a cryptographic inclusion/);
 assert.equal(REVIEW_SCOPE.comparisonBasis,'transaction_net');assert.match(REVIEW_SCOPE.limits,/partial-payment totals/);
});
