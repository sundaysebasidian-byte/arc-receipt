export const ARC = Object.freeze({ chainId: 5042, rpc: 'https://rpc.mainnet.arc.io', explorer: 'https://explorer.arc.io', usdc: '0x3600000000000000000000000000000000000000', emitter: '0xfffffffffffffffffffffffffffffffffffffffe', decimals: 18 });
export const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const HASH = /^0x[0-9a-fA-F]{64}$/;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const ZERO = '0x' + '0'.repeat(40);
export class VerificationError extends Error { constructor(code, message) { super(message); this.code = code; } }
function fail(code, message) { throw new VerificationError(code, message); }
function quantity(value, name) {
  if (typeof value !== 'string' || !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(value)) fail('invalid_evidence', `Invalid ${name}.`);
  return BigInt(value);
}
function hash(value, name) { if (!HASH.test(value ?? '')) fail('invalid_evidence', `Invalid ${name}.`); return value.toLowerCase(); }
function addressTopic(value) {
  if (typeof value !== 'string' || !/^0x0{24}[0-9a-fA-F]{40}$/.test(value)) fail('invalid_evidence', 'Invalid indexed address.');
  return ('0x' + value.slice(-40)).toLowerCase();
}
export function parseAmount(value) {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,59})(\.[0-9]{1,18})?$/.test(value)) fail('invalid_input', 'Amount must be a decimal with at most 18 fractional digits.');
  const [whole, fraction = ''] = value.split('.');
  const units = BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, '0'));
  if (units <= 0n || units >= 2n ** 256n) fail('invalid_input', 'Amount must be positive and fit uint256.');
  return units;
}
export function formatAmount(units, decimals = 18) {
  units = BigInt(units); const sign = units < 0n ? '-' : ''; if (units < 0n) units = -units;
  const padded = units.toString().padStart(decimals + 1, '0');
  const fraction = padded.slice(-decimals).replace(/0+$/, '');
  return sign + padded.slice(0, -decimals) + (fraction ? '.' + fraction : '');
}
export function validateInput(input) {
  if (!input || typeof input !== 'object') fail('invalid_input', 'Provide a transaction and recipient.');
  if (!HASH.test(input.txHash ?? '')) fail('invalid_input', 'Enter a 32-byte transaction hash.');
  if (!ADDRESS.test(input.recipient ?? '') || input.recipient.toLowerCase() === ZERO) fail('invalid_input', 'Enter a nonzero recipient address.');
  const minConfirmations = input.minConfirmations ?? 1;
  if (!Number.isInteger(minConfirmations) || minConfirmations < 1 || minConfirmations > 1000) fail('invalid_input', 'Confirmations must be an integer from 1 to 1000.');
  if (input.expectedAmount != null && typeof input.expectedAmount !== 'string') fail('invalid_input', 'Use a decimal string for the amount.');
  const amount = input.expectedAmount?.trim() ?? '';
  if (amount) parseAmount(amount);
  return { txHash: input.txHash.toLowerCase(), recipient: input.recipient.toLowerCase(), expectedAmount: amount, minConfirmations };
}
// Pure verifier: no wallet, account state, ABI dependency, or floating-point arithmetic.
export function verifyEvidence(input, evidence) {
  input = validateInput(input);
  if (!evidence || typeof evidence !== 'object') fail('invalid_evidence', 'RPC evidence is missing.');
  if (quantity(evidence.chainId, 'chain ID') !== BigInt(ARC.chainId)) fail('wrong_chain', 'RPC is not Arc mainnet (5042).');
  const receipt = evidence.receipt;
  if (!receipt) fail('not_mined', 'Transaction is absent or pending; no payment is verified.');
  if (hash(receipt.transactionHash, 'receipt transaction hash') !== input.txHash) fail('invalid_evidence', 'Receipt belongs to another transaction.');
  const receiptStatus = quantity(receipt.status, 'receipt status');
  if (receiptStatus > 1n) fail('invalid_evidence', 'Receipt status must be success or failure.');
  if (receiptStatus !== 1n) fail('failed_transaction', 'Transaction reverted; no payment is verified.');
  const blockNumber = quantity(receipt.blockNumber, 'receipt block number');
  const blockHash = hash(receipt.blockHash, 'receipt block hash');
  const block = evidence.block;
  if (!block || hash(block.hash, 'canonical block hash') !== blockHash || quantity(block.number, 'canonical block number') !== blockNumber) fail('reorg_or_inconsistent', 'Receipt does not match the canonical block. Recheck the transaction.');
  const head = quantity(evidence.head, 'head block');
  if (head < blockNumber) fail('invalid_evidence', 'RPC head predates receipt.');
  if (!Array.isArray(receipt.logs)) fail('invalid_evidence', 'Receipt logs are missing.');
  const seen = new Set(); const movements = []; const erc20Movements = []; let incoming = 0n; let outgoing = 0n; let erc20Logs = 0;
  for (const log of receipt.logs) {
    if (!log || typeof log !== 'object' || typeof log.address !== 'string' || !ADDRESS.test(log.address)) fail('invalid_evidence', 'Malformed receipt log.');
    const emitter = log.address.toLowerCase();
    if (emitter !== ARC.emitter && emitter !== ARC.usdc) continue;
    if (!Array.isArray(log.topics) || log.topics.some(topic => typeof topic !== 'string' || !HASH.test(topic))) fail('invalid_evidence', 'Malformed log topics.');
    if (log.topics[0]?.toLowerCase() !== TRANSFER) continue;
    if (log.removed === true || hash(log.transactionHash, 'log transaction hash') !== input.txHash || hash(log.blockHash, 'log block hash') !== blockHash || quantity(log.blockNumber, 'log block number') !== blockNumber) fail('invalid_evidence', 'Transfer log is removed or inconsistent.');
    const logIndex = quantity(log.logIndex, 'log index').toString();
    if (seen.has(logIndex)) fail('invalid_evidence', 'Duplicate transfer log index.'); seen.add(logIndex);
    if (!Array.isArray(log.topics) || log.topics.length !== 3 || !HASH.test(log.data ?? '')) fail('invalid_evidence', 'Malformed Transfer event.');
    const from = addressTopic(log.topics[1]); const to = addressTopic(log.topics[2]); const units = BigInt(log.data);
    if (emitter === ARC.usdc) { erc20Logs++; erc20Movements.push({ from, to, units: units * 10n ** 12n }); continue; }
    // Only the canonical system stream contributes. Mints are not payer transfers; burns reduce retained funds.
    const kind = from === ZERO ? 'mint' : to === ZERO ? 'burn' : from === to ? 'self' : units === 0n ? 'zero' : 'transfer';
    movements.push({ logIndex, from, to, units: units.toString(), amountUSDC: formatAmount(units), kind });
    if (kind === 'transfer' && to === input.recipient) incoming += units;
    if ((kind === 'transfer' || kind === 'burn') && from === input.recipient) outgoing += units;
  }
  // A nonzero ERC-20 movement must have a matching canonical system movement.
  const unmatched = movements.map(m => ({ ...m, used: false }));
  for (const m of erc20Movements.filter(m => m.units > 0n && m.from !== m.to)) {
    const counterpart = unmatched.find(s => !s.used && s.from === m.from && s.to === m.to && BigInt(s.units) === m.units);
    if (!counterpart) fail('inconsistent_streams', 'The 6-decimal ERC-20 event disagrees with Arc’s canonical 18-decimal system event. No receipt is issued.');
    counterpart.used = true;
  }
  const net = incoming - outgoing;
  const confirmations = head - blockNumber + 1n;
  const confirmationPolicyMet = confirmations >= BigInt(input.minConfirmations);
  const expected = input.expectedAmount ? parseAmount(input.expectedAmount) : null;
  const exactAmountMatch = expected === null ? null : net === expected;
  const difference = expected === null ? null : net - expected;
  let transferTimeUTC = null;
  if (block.timestamp !== undefined) {
    const seconds = quantity(block.timestamp, 'block timestamp');
    if (seconds > 8640000000000n) fail('invalid_evidence', 'Invalid block timestamp.');
    transferTimeUTC = new Date(Number(seconds) * 1000).toISOString();
  }
  let status = 'verified_transfer';
  if (incoming === 0n) status = 'no_payment';
  else if (net <= 0n) status = 'no_net_receipt';
  else if (!confirmationPolicyMet) status = 'awaiting_confirmations';
  else if (expected !== null) status = exactAmountMatch ? 'matched' : 'amount_mismatch';
  return {
    schema: 'arc-receipt/v1', status, network: 'Arc mainnet', chainId: ARC.chainId,
    transactionHash: input.txHash, recipient: input.recipient,
    blockNumber: blockNumber.toString(), blockHash, observedHead: head.toString(),
    confirmations: confirmations.toString(), minConfirmations: input.minConfirmations, confirmationPolicyMet,
    expectedAmountUSDC: expected === null ? null : formatAmount(expected), exactAmountMatch,
    differenceUSDC: difference === null ? null : formatAmount(difference),
    amountComparison: expected === null ? 'not_requested' : difference === 0n ? 'exact' : difference < 0n ? 'under' : 'over',
    transferTimeUTC,
    incomingUSDC: formatAmount(incoming), outgoingUSDC: formatAmount(outgoing), netReceivedUSDC: formatAmount(net),
    emitter: ARC.emitter, decimals: ARC.decimals, ignoredDuplicateStreamLogs: erc20Logs, movements,
    checks: [
      { key: 'chain', label: 'Arc mainnet', state: 'passed', detail: 'RPC chain ID 5042' },
      { key: 'execution', label: 'Transaction succeeded', state: 'passed', detail: 'Receipt status 0x1' },
      { key: 'block', label: 'Canonical inclusion', state: 'passed', detail: 'Receipt and numbered block hashes agree' },
      { key: 'movement', label: 'Positive net USDC', state: net > 0n && incoming > 0n ? 'passed' : 'failed', detail: `${formatAmount(incoming)} in − ${formatAmount(outgoing)} out = ${formatAmount(net)} USDC` },
      { key: 'amount', label: 'Expected amount', state: expected === null ? 'not_requested' : exactAmountMatch ? 'passed' : 'failed', detail: expected === null ? 'No expected amount provided' : exactAmountMatch ? 'Exact integer amount match' : `${formatAmount(difference < 0n ? -difference : difference)} USDC ${difference < 0n ? 'short' : 'above expected'}` },
      { key: 'policy', label: 'Observation policy', state: confirmationPolicyMet ? 'passed' : 'waiting', detail: `${confirmations} included block(s) observed; ${input.minConfirmations} requested` }
    ],
    explorerURL: `${ARC.explorer}/tx/${input.txHash}`,
    trust: 'Unsigned RPC observation. Re-run against a trusted RPC; confirmations are not a finality proof. Amounts describe explicit payment movements, exclude incoming mints and gas fees, and deduct outgoing burns. A matching amount does not prove invoice identity, ownership, or prevent reuse across invoices.'
  };
}
const READ_METHODS = new Set(['eth_chainId', 'eth_blockNumber', 'eth_getTransactionReceipt', 'eth_getBlockByNumber', 'eth_getLogs', 'eth_call']);
export function createRPC(url = ARC.rpc, fetcher = globalThis.fetch, options = {}) {
  if (url !== ARC.rpc) fail('invalid_rpc', 'This build only uses the official Arc mainnet RPC.');
  let id = 0;
  return async (method, params = []) => {
    if (!READ_METHODS.has(method)) fail('read_only', 'RPC method is not permitted.');
    const requestId = ++id;
    let response;
    const timeout = AbortSignal.timeout(15000);
    const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
    try { response = await fetcher(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params }), signal, credentials: 'omit' }); }
    catch {
      if (options.signal?.aborted) fail('cancelled', 'Verification cancelled.');
      if (timeout.aborted) fail('rpc_timeout', 'The Arc node did not respond within 15 seconds.');
      fail('rpc_unavailable', 'Arc RPC could not be reached. Check network access and retry.');
    }
    if (response.status === 429) fail('rate_limited', 'The public Arc node is busy (HTTP 429).');
    if (!response.ok) fail('rpc_unavailable', `Arc RPC returned HTTP ${response.status}.`);
    let payload;
    try { payload = await response.json(); } catch { fail('rpc_unavailable', 'Arc RPC returned invalid JSON.'); }
    if (!payload || typeof payload !== 'object' || payload.jsonrpc !== '2.0' || payload.id !== requestId || payload.error || !Object.hasOwn(payload, 'result')) fail('rpc_error', 'Arc RPC returned an invalid or error response.');
    return payload.result;
  };
}
export async function verifyTransaction(input, rpc = createRPC(), onStage = () => {}) {
  input = validateInput(input);
  onStage('chain');
  const chainId = await rpc('eth_chainId');
  if (quantity(chainId, 'chain ID') !== BigInt(ARC.chainId)) fail('wrong_chain', 'RPC is not Arc mainnet (5042).');
  onStage('receipt');
  const receipt = await rpc('eth_getTransactionReceipt', [input.txHash]);
  if (!receipt) fail('not_mined', 'Transaction is absent or pending; no payment is verified.');
  if (quantity(receipt.status, 'receipt status') === 0n) fail('failed_transaction', 'Transaction reverted; no payment is verified.');
  onStage('block');
  const block = await rpc('eth_getBlockByNumber', [receipt.blockNumber, false]);
  const head = await rpc('eth_blockNumber');
  const evidence = { chainId, receipt, block, head };
  onStage('analysis');
  return { ...verifyEvidence(input, evidence), checkedAt: new Date().toISOString(), rpcURL: ARC.rpc, evidence };
}
