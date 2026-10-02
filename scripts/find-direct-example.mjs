// Bounded research over existing public blocks; does not create any transaction.
import {writeFile} from 'node:fs/promises';
import {ARC,verifyEvidence} from '../web/verifier.mjs';
let id=0,calls=0;
async function rpc(method,params=[]){calls++;const q=await fetch(ARC.rpc,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++id,method,params}),credentials:'omit',signal:AbortSignal.timeout(15000)});const d=await q.json();if(d.error)throw Error(d.error.message);return d.result;}
const chainId=await rpc('eth_chainId');if(BigInt(chainId)!==5042n)throw Error('Wrong chain');
const head=await rpc('eth_blockNumber');let found;
for(let i=0;i<64&&!found;i++){
 const number='0x'+(BigInt(head)-BigInt(i)).toString(16),block=await rpc('eth_getBlockByNumber',[number,true]);
 for(const tx of block.transactions){
  if(!tx.to||tx.input!=='0x'||BigInt(tx.value??'0x0')===0n||tx.from.toLowerCase()===tx.to.toLowerCase())continue;
  if(await rpc('eth_getCode',[tx.to,number])!=='0x')continue;
  const receipt=await rpc('eth_getTransactionReceipt',[tx.hash]);if(receipt?.status!=='0x1')continue;
  const evidence={chainId,receipt,block:{...block,transactions:block.transactions.map(t=>t.hash)},head};
  const input={txHash:tx.hash,recipient:tx.to,expectedAmount:'',minConfirmations:1};
  const c=verifyEvidence(input,evidence);
  if(c.incomingUSDC==='0'||c.outgoingUSDC!=='0')continue;
  const relevant=c.movements.filter(m=>m.kind==='transfer'&&(m.to===c.recipient||m.from===c.recipient));
  if(relevant.length!==1||relevant[0].from!==tx.from.toLowerCase()||BigInt(relevant[0].units)!==BigInt(tx.value))continue;
  found={...verifyEvidence({...input,expectedAmount:c.incomingUSDC},evidence),checkedAt:new Date().toISOString(),mode:'live_rpc',rpcURL:ARC.rpc,evidence,research:{method:'Bounded latest64 blocks, empty calldata native send, recipient eth_getCode=0x at inclusion block, one matching canonical transfer; no builder transaction',transaction:tx,recipientCode:'0x',calls}};
  break;
 }
}
if(!found)throw Error('No qualifying direct example in bounded64-block window');
await writeFile(new URL('../evidence/direct-native-example.json',import.meta.url),JSON.stringify(found,null,2)+'\n');
console.log(JSON.stringify({hash:found.transactionHash,recipient:found.recipient,amount:found.incomingUSDC,block:found.blockNumber,recipientCode:found.research.recipientCode,calls,published:false}));
