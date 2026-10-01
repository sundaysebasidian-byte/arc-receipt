import { ARC, VerificationError, validateInput, verifyEvidence, verifyTransaction } from './verifier.mjs';
const fail = message => { throw new VerificationError('invalid_import', message); };
export function parseReceiptFile(text) {
  if (typeof text !== 'string' || text.length > 2_000_000) fail('Choose a receipt JSON file smaller than 2 MB.');
  let saved;
  try { saved = JSON.parse(text); } catch { fail('This file is not valid JSON.'); }
  if (!saved || saved.schema !== 'arc-receipt/v1' || saved.mode === 'synthetic_offline_example') fail('Choose a live Arc Receipt export. Synthetic examples are not on-chain evidence.');
  const input = validateInput({ txHash: saved.transactionHash, recipient: saved.recipient, expectedAmount: saved.expectedAmountUSDC ?? '', minConfirmations: saved.minConfirmations });
  const computed = verifyEvidence(input, saved.evidence);
  const fields = ['chainId','transactionHash','recipient','blockNumber','blockHash','incomingUSDC','outgoingUSDC','netReceivedUSDC','expectedAmountUSDC','confirmations','status'];
  const alteredFields = fields.filter(key => saved[key] !== computed[key]);
  return { input, alteredFields, saved: computed };
}
export async function recheckReceiptFile(text, rpc, onStage) {
  const parsed = parseReceiptFile(text);
  const fresh = await verifyTransaction(parsed.input, rpc, onStage);
  const immutableFields = ['blockNumber','blockHash','incomingUSDC','outgoingUSDC','netReceivedUSDC'];
  const changedFields = immutableFields.filter(key => parsed.saved[key] !== fresh[key]);
  return { ...fresh, recheck: { outcome: parsed.alteredFields.length || changedFields.length ? 'differences_found' : 'consistent', alteredFields: parsed.alteredFields, changedFields, detail: 'Saved claims were recomputed from their evidence; transaction and recipient were then fetched again from the fixed official mainnet RPC. The imported file cannot choose an endpoint.' } };
}
const escape = value => String(value ?? '—').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
export function createReadableReceipt(certificate) {
  const c = certificate;
  const synthetic = c.mode === 'synthetic_offline_example';
  const rows = [['Transaction',c.transactionHash],['Recipient',c.recipient],['Incoming USDC',c.incomingUSDC],['Outgoing USDC',c.outgoingUSDC],['Net payment movement USDC',c.netReceivedUSDC],['Expected USDC',c.expectedAmountUSDC],['Difference USDC',c.differenceUSDC],['Block',c.blockNumber],['Block hash',c.blockHash],['Block time (UTC)',c.transferTimeUTC],['Checked at (UTC)',c.checkedAt],['Observed head',c.observedHead],['Observation policy',`${c.confirmations} included blocks observed / ${c.minConfirmations} requested`],['Emitter',ARC.emitter],['Precision','18 decimals, canonical system stream only']];
  return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Arc Receipt · '+escape(c.status)+'</title><style>body{font:15px system-ui;color:#193a32;max-width:780px;margin:40px auto;padding:0 24px}h1{font-size:30px}h2{font-size:20px}aside{padding:16px;background:#f1f4ef;border:1px solid #d9e1d7;border-radius:8px}.amount{font-size:38px;font-weight:600}table{width:100%;border-collapse:collapse;margin:24px 0}th,td{font-size:12px;padding:10px;border-bottom:1px solid #ddd;text-align:left;vertical-align:top}td{font-family:monospace;overflow-wrap:anywhere}th{width:32%;font-weight:500;color:#63776b}p,li{line-height:1.6}.small{font-size:12px;color:#677c6e}@media print{body{margin:0;max-width:none}aside{break-inside:avoid}tr{break-inside:avoid}}</style><body><p class="small">ARC RECEIPT / INDEPENDENT READ-ONLY OBSERVATION</p><h1>'+ (synthetic ? 'SYNTHETIC EXAMPLE — NOT A REAL PAYMENT' : 'USDC movement receipt')+'</h1><aside><h2>'+escape(c.status.replaceAll('_',' '))+'</h2><div class="amount">'+escape(c.netReceivedUSDC)+' USDC</div><p>Net explicit payment movement for the selected recipient. Gas and incoming mints excluded; outgoing burns deducted.</p></aside><table>'+rows.map(([key,value])=>'<tr><th>'+escape(key)+'</th><td>'+escape(value)+'</td></tr>').join('')+'</table><h2>Verification trail</h2><ul>'+(c.checks??[]).map(check=>'<li>'+escape(check.label)+' — '+escape(check.state)+': '+escape(check.detail)+'</li>').join('')+'</ul><p class="small">Unsigned RPC observation, not a cryptographic inclusion or validator proof. Arc commits blocks with deterministic finality; this file observes RPC responses. A matching amount does not prove invoice identity, ownership or prevent reuse across invoices. Public examples do not represent user earnings.</p><p class="small">Recheck the evidence JSON in Arc Receipt or query '+escape(ARC.rpc)+'. '+(synthetic?'This example is synthetic.':'Explorer: '+escape(ARC.explorer+'/tx/'+c.transactionHash))+'</p></body></html>';
}
