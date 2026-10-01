import { readFile } from 'node:fs/promises';
import { recheckReceiptFile } from '../web/receipt.mjs';
import { verifyTransaction, createRPC } from '../web/verifier.mjs';
const args=process.argv.slice(2);
try {
  let input, result;
  if (args[0] === '--recheck' && args.length === 2) {
    result=await recheckReceiptFile(await readFile(args[1],'utf8'),createRPC());
  } else if(args.length >= 2 && args.length <= 4) {
    input={txHash:args[0],recipient:args[1],expectedAmount:args[2]||'',minConfirmations:args[3]===undefined?1:Number(args[3])};
  } else throw new Error('Usage: npm run verify -- <txHash> <recipient> [expectedUSDC] [minConfirmations]\nOr: npm run verify -- --recheck evidence/browser-live-receipt.json');
  if(!result)result=await verifyTransaction(input); console.log(JSON.stringify({...result,mode:'live_rpc'},null,2));
  if(!['matched','verified_transfer'].includes(result.status)) process.exitCode=2;
} catch(error) { console.error(`${error.code||'error'}: ${error.message}`);process.exitCode=1; }
