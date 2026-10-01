import {writeFile} from 'node:fs/promises';
import {verifyTransaction} from '../web/verifier.mjs';
const result=await verifyTransaction({txHash:'0x1732bf16a26831ba5a7d183ceb35c893bb9053630f9549ed99269985ab62d7d8',recipient:'0xe9fae1c386c6f45b1fb3c3ef01ade424dad4bccf',expectedAmount:'1458.033036',minConfirmations:1});
if(result.status!=='no_net_receipt'||result.netReceivedUSDC!=='0')throw new Error('Roundtrip result changed; inspect evidence.');
await writeFile(new URL('../evidence/mainnet-roundtrip.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,incoming:result.incomingUSDC,outgoing:result.outgoingUSDC,net:result.netReceivedUSDC,tx:result.transactionHash}));
