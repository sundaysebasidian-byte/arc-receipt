import { ARC, TRANSFER } from './verifier.mjs';
export const SAMPLE_INPUT = { txHash: '0x' + 'a'.repeat(64), recipient: '0x' + '2'.repeat(40), expectedAmount: '12.5', minConfirmations: 3 };
const blockHash = '0x' + 'b'.repeat(64);
const topic = address => '0x' + address.slice(2).padStart(64, '0');
export function sampleEvidence() {
  const base = { transactionHash: SAMPLE_INPUT.txHash, blockHash, blockNumber: '0x64', removed: false, topics: [TRANSFER, topic('0x' + '1'.repeat(40)), topic(SAMPLE_INPUT.recipient)] };
  return { chainId: '0x13b2', head: '0x68', block: { number: '0x64', hash: blockHash, timestamp: '0x6abc0150' }, receipt: { transactionHash: SAMPLE_INPUT.txHash, blockNumber: '0x64', blockHash, status: '0x1', logs: [
    { ...base, address: ARC.emitter, logIndex: '0x0', data: '0x' + (125n * 10n ** 17n).toString(16).padStart(64, '0') },
    { ...base, address: ARC.usdc, logIndex: '0x1', data: '0x' + (12500000n).toString(16).padStart(64, '0') }
  ] } };
}
